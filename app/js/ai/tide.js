(function () {
    'use strict';

    var CONFIG = {
        MAX_CONCURRENT: 2,
        AI_CALL_DELAY: 1500,
        RETRY_MAX: 2,
        MAX_FINDINGS_PER_TYPE: 200,
        CHUNK_SIZE: 20,
        DEEP_CHUNK_SIZE: 10,
        QUICK_CHUNK_SIZE: 40,
        TOKEN_BUDGET: 28000,
        TOKENS_PER_ENTITY: 150,
        SCORE_THRESHOLD: 3,
        TOP_CANDIDATE_PCT: 0.15,
        SUB_TASK_DEEP_CHUNK: 10,
        SUB_TASK_QUICK_CHUNK: 40,
        MAX_SUB_TASKS_PER_TYPE: 6,
        SUB_TASK_MIN_CANDIDATES: 1,
        STORAGE_KEY_FINDINGS: 'tide_findings',
        STORAGE_KEY_RESULTS: 'tide_results',
        MAX_HISTORY: 20
    };

    function computeHash(str) {
        var s = typeof str === 'string' ? str : JSON.stringify(str);
        var h = 2166136261;
        for (var i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = (h * 16777619) >>> 0;
        }
        return 't' + h.toString(36);
    }

    function delay(ms) {
        return new Promise(function (r) { setTimeout(r, ms); });
    }

    function chunkArray(arr, size) {
        var chunks = [];
        for (var i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
        }
        return chunks;
    }

    function extractText(response) {
        return (response && response.content) ? response.content : (response || '');
    }

    function extractJSON(text) {
        if (!text) return null;
        try { return JSON.parse(text); } catch (e) {}
        var match = text.match(/\[[\s\S]*?\]/);
        if (match) {
            try { return JSON.parse(match[0]); } catch (e2) {}
        }
        match = text.match(/\{[\s\S]*\}/);
        if (match) {
            try { return JSON.parse(match[0]); } catch (e3) {}
        }
        return null;
    }

    function estimateTokens(obj) {
        var str = typeof obj === 'string' ? obj : JSON.stringify(obj);
        return Math.ceil(str.length / 3.5);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function Semaphore(limit) {
        this.limit = limit;
        this.active = 0;
        this.queue = [];
    }
    Semaphore.prototype.acquire = function () {
        var self = this;
        if (self.active < self.limit) {
            self.active++;
            return Promise.resolve();
        }
        return new Promise(function (resolve) {
            self.queue.push(resolve);
        });
    };
    Semaphore.prototype.release = function () {
        var self = this;
        if (self.queue.length > 0) {
            self.queue.shift()();
        } else {
            self.active--;
        }
    };

    var TAG_WEIGHTS = {
        DANGEROUS: ['dangerous', 'violent', 'extremist', 'weapon', 'bomb', 'threat', 'criminal', 'wanted', 'suspect', 'terrorist', 'militant', 'radical'],
        FRAUD: ['cash only', 'no questions', 'discount med', 'suspicious', 'fraud', 'scam', 'untrusted', 'unreliable', 'illicit', 'black market', 'under the table', 'undeclared'],
        RISKY: ['suspicious', 'fraud', 'debt', 'bankrupt', 'unstable', 'unemployed', 'untrusted', 'scam'],
        POSITIVE: ['rich', 'professional', 'trusted', 'reliable', 'honest', 'successful', 'educated', 'business', 'leader', 'owner', 'manager', 'doctor', 'engineer', 'investor', 'executive', 'veteran'],
        NEGATIVE: ['suspicious', 'fraud', 'dangerous', 'criminal', 'scam', 'untrusted', 'debt', 'bankrupt', 'unemployed', 'unstable'],
        NOTABLE: ['leader', 'owner', 'manager', 'doctor', 'engineer', 'investor', 'executive', 'professional', 'veteran', 'expert', 'specialist']
    };

    function countMatchingTags(tags, keywords) {
        if (!tags || !tags.length) return 0;
        var count = 0;
        for (var i = 0; i < tags.length; i++) {
            var tl = (tags[i] || '').toLowerCase();
            for (var k = 0; k < keywords.length; k++) {
                if (tl.indexOf(keywords[k]) !== -1) {
                    count++;
                    break;
                }
            }
        }
        return count;
    }

    function findInNotes(notes, keywords) {
        if (!notes) return 0;
        var n = notes.toLowerCase();
        var score = 0;
        for (var i = 0; i < keywords.length; i++) {
            var idx = n.indexOf(keywords[i]);
            if (idx !== -1) {
                score++;
                var wordBoundary = idx + keywords[i].length;
                if (wordBoundary < n.length && n[wordBoundary] === ' ') score++;
            }
        }
        return score;
    }

    var TYPES = {
        threat: {
            name: 'Threat',
            color: '#ff6b6b',
            description: 'General threat and security risk analysis',
            fields: ['threatLevel', 'politicalViews', 'religion', 'tags', 'extraNotes', 'workplace', 'occupation', 'credit'],
            score: function (p) {
                var s = 0;
                var tl = (p.threatLevel || '').toLowerCase();
                if (tl === 'critical') s += 10;
                else if (tl === 'high') s += 7;
                else if (tl === 'medium') s += 4;
                else if (tl === 'low') s += 2;
                s += countMatchingTags(p.tags, TAG_WEIGHTS.DANGEROUS) * 3;
                s += findInNotes(p.extraNotes, ['threat', 'danger', 'violent', 'weapon']) * 4;
                s += findInNotes(p.extraNotes, ['extremist', 'radical', 'militant']) * 5;
                if (p.credit !== undefined && p.credit < 100) s += 2;
                if (!p.workplace && !p.occupation) s += 1;
                return s;
            },
            tierLabels: ['Critical Threats', 'Elevated Threats', 'General Threats'],
            tierPrompt: [
                'Deep-dive analysis: look for subtle behavioral patterns, hidden extremist indicators, network connections, and escalation risks.',
                'Standard threat analysis: evaluate risk factors, behavioral concerns, and security implications.',
                'Quick scan for obvious threat indicators, unusual tags, or security-relevant notes.'
            ],
            buildPrompt: function (people, tierIndex) {
                var brief = people.map(function (p) {
                    return { id: p.id, name: p.name, threatLevel: p.threatLevel, politicalViews: p.politicalViews, religion: p.religion, tags: p.tags, extraNotes: p.extraNotes, workplace: p.workplace, occupation: p.occupation, credit: p.credit };
                });
                var focus = (tierIndex !== undefined && this.tierPrompt[tierIndex]) ? this.tierPrompt[tierIndex] : 'Focus on dangerous behavior, extremist indicators, and security risks.';
                var tokenEstimate = 400 + estimateTokens(brief);
                console.log('[TIDE] threat chunk ~' + tokenEstimate + ' estimated tokens');
                return {
                    system: 'You are a specialized threat intelligence agent. Output ONLY valid JSON. No markdown, no code blocks.',
                    prompt: 'Analyze these people for threats and security concerns.\nPeople: ' + JSON.stringify(brief, null, 2) + '\nReturn JSON array: [{"type":"threat","subject":"name","content":"description","evidence":"specific data point","tags":["tag"]}]\n' + focus + '\nOnly genuine threats. Return ONLY JSON.'
                };
            },
            threshold: 2
        },

        terrorist: {
            name: 'Terrorist',
            color: '#ff1744',
            description: 'Counter-terrorism threat detection analysis',
            fields: ['threatLevel', 'politicalViews', 'religion', 'tags', 'extraNotes', 'workplace', 'friends', 'family', 'gender', 'birthDate'],
            score: function (p) {
                var s = 0;
                var tl = (p.threatLevel || '').toLowerCase();
                if (tl === 'critical') s += 10;
                else if (tl === 'high') s += 8;
                else if (tl === 'medium') s += 5;
                else if (tl === 'low') s += 2;
                s += countMatchingTags(p.tags, TAG_WEIGHTS.DANGEROUS) * 4;
                s += findInNotes(p.extraNotes, ['extremist', 'radical', 'militant', 'terror', 'jihad', 'holy war']) * 6;
                s += findInNotes(p.extraNotes, ['weapon', 'bomb', 'explosive', 'training', 'military', 'combat']) * 5;
                s += findInNotes(p.extraNotes, ['travel', 'border', 'conflict zone', 'syria', 'iraq', 'afghanistan', 'isis']) * 3;
                var friends = p.friends || [];
                var family = p.family || [];
                if (friends.length > 10) s += 2;
                if (friends.length === 0 && family.length === 0) s += 1;
                if (!p.workplace && !p.occupation) s += 1;
                return s;
            },
            tierLabels: ['High Priority Threats', 'Medium Priority', 'General Scan'],
            tierPrompt: [
                'Deep investigation: look for extremist ideologies, travel patterns to conflict zones, weapons expertise, radicalization indicators, covert communication patterns, and network connections to known threat actors.',
                'Standard analysis: evaluate security risk factors, suspicious affiliations, behavioral concerns, and potential radicalization signals.',
                'Quick scan: identify any obvious threat indicators, concerning tags, or security-relevant notes.'
            ],
            buildPrompt: function (people, tierIndex) {
                var brief = people.map(function (p) {
                    return { id: p.id, name: p.name, gender: p.gender, birthDate: p.birthDate, workplace: p.workplace, friends: (p.friends || []).length, family: (p.family || []).length, extraNotes: p.extraNotes, tags: p.tags, threatLevel: p.threatLevel, politicalViews: p.politicalViews, religion: p.religion };
                });
                var focus = (tierIndex !== undefined && this.tierPrompt[tierIndex]) ? this.tierPrompt[tierIndex] : 'Focus on extremist views, travel to conflict zones, and radical affiliations.';
                return {
                    system: 'You are an AI security analyst specializing in counter-terrorism. Output ONLY valid JSON. No markdown.',
                    prompt: 'Analyze these people to identify potential security threats.\n\nPeople:\n' + JSON.stringify(brief, null, 2) + '\n\n' + focus + '\n\nLook for:\n- People with extremist views or radical ideologies mentioned in notes\n- People with connections to known extremist groups or individuals\n- People with travel patterns to conflict zones or high-risk areas\n- People with unusual financial transactions or funding sources\n- People with military or weapons training background\n- People with tags indicating extremist or radical affiliations\n- People with communication-related tags suggesting coordination\n- People with multiple "suspicious" tags\n\nReturn as JSON array:\n[\n  {\n    "person": "Name",\n    "threatLevel": "high",\n    "reasons": ["reason1", "reason2"],\n    "evidence": "specific evidence description"\n  }\n]\n\nBe comprehensive. Return empty array if none found. Return ONLY JSON.'
                };
            },
            threshold: 3
        },

        fraud: {
            name: 'Fraud',
            color: '#ffd93d',
            description: 'Fraud and illegal activity detection',
            fields: ['workplace', 'friends', 'family', 'extraNotes', 'tags', 'credit'],
            score: function (p) {
                var s = 0;
                s += countMatchingTags(p.tags, TAG_WEIGHTS.FRAUD) * 4;
                s += findInNotes(p.extraNotes, ['cash only', 'no questions', 'discount', 'medication', 'prescription', 'under the table', 'black market', 'illicit']) * 5;
                s += findInNotes(p.extraNotes, ['suspicious', 'warning', 'investigate', 'flagged']) * 4;
                s += findInNotes(p.extraNotes, ['debt', 'money', 'payment', 'transfer', 'offshore']) * 2;
                if (!p.workplace && (p.tags || []).length > 2) s += 3;
                if ((p.friends || []).length > 15) s += 2;
                if ((p.family || []).length === 0) s += 1;
                var credit = p.credit || 185;
                if (credit < 100) s += 3;
                else if (credit < 150) s += 2;
                else if (credit > 300 && !p.workplace) s += 2;
                return s;
            },
            tierLabels: ['High Priority Fraud', 'Moderate Suspicion', 'General Scan'],
            tierPrompt: [
                'Deep investigation: look for sophisticated fraud patterns, drug selling indicators, money laundering signals, fake identity markers, and organized crime connections.',
                'Standard fraud analysis: evaluate suspicious financial patterns, unusual tags, questionable workplace situations, and behavioral red flags.',
                'Quick scan: identify obvious fraud indicators, suspicious tags, or notable activity patterns.'
            ],
            buildPrompt: function (people, tierIndex) {
                var brief = people.map(function (p) {
                    return { id: p.id, name: p.name, workplace: p.workplace, friends: (p.friends || []).length, family: (p.family || []).length, extraNotes: p.extraNotes, tags: p.tags, credit: p.credit };
                });
                var focus = (tierIndex !== undefined && this.tierPrompt[tierIndex]) ? this.tierPrompt[tierIndex] : 'Focus on fraud patterns and illegal activity indicators.';
                return {
                    system: 'You are an AI investigator analyzing people for fraud and illegal activity. Output ONLY valid JSON. No markdown.',
                    prompt: 'Analyze these people to identify potential fraudsters or drug sellers.\n\nPeople:\n' + JSON.stringify(brief, null, 2) + '\n\n' + focus + '\n\nLook for:\n- People with suspicious tags or notes (e.g., "cash only", "no questions asked", "discount meds")\n- People with unusual financial patterns or unexplained wealth\n- People with connections to known suspicious individuals\n- People with aliases or multiple identities\n- People with financial-related tags but no clear workplace\n- People with multiple "high risk" tags\n- People with vague or inconsistent information\n\nReturn as JSON array:\n[\n  {\n    "person": "Name",\n    "riskLevel": "high",\n    "reasons": ["reason1", "reason2"],\n    "evidence": "specific evidence"\n  }\n]\n\nBe comprehensive. Return empty array if none found. Return ONLY JSON.'
                };
            },
            threshold: 2
        },

        credit: {
            name: 'Credit',
            color: '#6bcf7f',
            description: 'AI-powered credit scoring and risk evaluation',
            fields: ['credit', 'incomeLevel', 'socialClass', 'educationLevel', 'workplace', 'tags', 'extraNotes', 'gender', 'birthDate', 'friends', 'family'],
            score: function (p) {
                var s = 0;
                var credit = p.credit || 185;
                if (credit < 100) s += 5;
                else if (credit < 150) s += 3;
                else if (credit > 280) s -= 2;
                var sc = (p.socialClass || '').toLowerCase();
                if (sc === 'low class') s += 3;
                if (sc === 'high class' || sc === '1%') s -= 2;
                s += countMatchingTags(p.tags, TAG_WEIGHTS.NEGATIVE) * 2;
                s -= countMatchingTags(p.tags, TAG_WEIGHTS.POSITIVE);
                s += findInNotes(p.extraNotes, ['suspicious', 'warning', 'risk', 'investigate', 'debt', 'bankrupt']) * 3;
                s -= findInNotes(p.extraNotes, ['trust', 'reliable', 'stable', 'good', 'professional']) * 2;
                if (p.workplace) s -= 1;
                var connections = (p.friends || []).length + (p.family || []).length;
                if (connections > 5) s -= 1;
                return Math.max(0, s);
            },
            buildPrompt: function (people) {
                var brief = people.map(function (p) {
                    return { id: p.id, name: p.name, gender: p.gender || '', birthDate: p.birthDate || '', workplace: p.workplace || '', socialClass: p.socialClass || '', friends: (p.friends || []).length, family: (p.family || []).length, extraNotes: p.extraNotes || '', tags: p.tags || [], credit: p.credit || 185 };
                });
                return {
                    system: 'You are a credit risk analyst. Output ONLY valid JSON. No markdown.',
                    prompt: 'Evaluate each person\'s credit score based on all available data.\n\nConsider:\n- Name, gender, birth date (age)\n- Workplace (professional stability)\n- Social class\n- Friends/family count (social support)\n- Tags (positive = stable, negative = risk)\n- Notes (trust/reliability indicators, warnings)\n\nCredit Score Range: 0-370\n- 0-124: HIGH RISK\n- 125-249: MEDIUM RISK\n- 250-370: LOW RISK\n\nPeople:\n' + JSON.stringify(brief, null, 2) + '\n\nReturn JSON array: [{"id":"person_id","creditScore":250}]\n\nReturn scores for ALL people. Be realistic. Return ONLY JSON.'
                };
            }
        },

        risk: {
            name: 'Risk',
            color: '#ffd93d',
            description: 'Financial, social, and legal risk assessment',
            fields: ['credit', 'incomeLevel', 'socialClass', 'educationLevel', 'immigrationStatus', 'tags', 'extraNotes', 'workplace', 'occupation', 'maritalStatus'],
            score: function (p) {
                var s = 0;
                var credit = p.credit || 185;
                if (credit < 100) s += 5;
                else if (credit < 150) s += 3;
                var imm = (p.immigrationStatus || '').toLowerCase();
                if (imm.indexOf('visa') !== -1 || imm.indexOf('temporary') !== -1) s += 2;
                if (imm.indexOf('expired') !== -1 || imm.indexOf('overstay') !== -1) s += 4;
                if (imm.indexOf('undocumented') !== -1 || imm.indexOf('illegal') !== -1) s += 5;
                if (imm.indexOf('refugee') !== -1 || imm.indexOf('asylum') !== -1) s += 2;
                s += countMatchingTags(p.tags, TAG_WEIGHTS.RISKY) * 3;
                var income = (p.incomeLevel || '').toLowerCase();
                if (income === 'low' || income === 'none') s += 2;
                if ((p.educationLevel || '').toLowerCase().indexOf('none') !== -1) s += 1;
                s += findInNotes(p.extraNotes, ['suspicious', 'fraud', 'debt', 'unstable']) * 3;
                s += findInNotes(p.extraNotes, ['risk', 'warning', 'flagged']) * 2;
                return s;
            },
            tierLabels: ['Critical Risks', 'Elevated Risks', 'General Risks'],
            tierPrompt: [
                'Deep-dive risk assessment: uncover financial vulnerabilities, immigration status complications, social instability patterns, and fraud indicators.',
                'Standard risk evaluation: assess financial, social, and legal risk factors.',
                'Quick scan for any risk flags, unusual financial status, or vulnerability notes.'
            ],
            buildPrompt: function (people, tierIndex) {
                var brief = people.map(function (p) {
                    return { id: p.id, name: p.name, credit: p.credit, incomeLevel: p.incomeLevel, socialClass: p.socialClass, educationLevel: p.educationLevel, immigrationStatus: p.immigrationStatus, tags: p.tags, extraNotes: p.extraNotes, workplace: p.workplace, occupation: p.occupation, maritalStatus: p.maritalStatus };
                });
                var focus = (tierIndex !== undefined && this.tierPrompt[tierIndex]) ? this.tierPrompt[tierIndex] : 'Focus on financial risks, immigration issues, and social vulnerabilities.';
                return {
                    system: 'You are a risk assessment analyst. Output ONLY valid JSON. No markdown.',
                    prompt: 'Analyze these people for risks and vulnerabilities.\nPeople: ' + JSON.stringify(brief, null, 2) + '\nReturn JSON array: [{"type":"risk","subject":"name","content":"description","evidence":"specific data","tags":["tag"]}]\n' + focus + '\nOnly genuine risks. Return ONLY JSON.'
                };
            },
            threshold: 2
        },

        intel: {
            name: 'Intel',
            color: '#6bcf7f',
            description: 'Intelligence pattern analysis and profiling',
            fields: ['nationality', 'countryOfOrigin', 'languages', 'ethnicity', 'religion', 'educationLevel', 'occupation', 'workplace', 'tags', 'extraNotes', 'credit'],
            score: function (p) {
                var s = 0;
                if (p.languages && p.languages.length > 2) s += 2;
                var edu = (p.educationLevel || '').toLowerCase();
                if (edu.indexOf('university') !== -1 || edu.indexOf('master') !== -1 || edu.indexOf('phd') !== -1 || edu.indexOf('doctor') !== -1) s += 2;
                if (p.nationality && p.countryOfOrigin && p.nationality !== p.countryOfOrigin) s += 2;
                if (p.languages && p.languages.length >= 4) s += 2;
                s += countMatchingTags(p.tags, TAG_WEIGHTS.NOTABLE) * 2;
                if (p.chats && p.chats.length > 5) s += 1;
                if (p.extraNotes && p.extraNotes.length > 100) s += 1;
                return s;
            },
            tierLabels: ['Notable Profiles', 'General Profiles'],
            tierPrompt: [
                'Deep intelligence profile: identify unique background combinations, unusual expertise, cross-cultural indicators, and high-value observation targets.',
                'Quick scan for any notable demographic patterns, interesting tags, or relevant background details.'
            ],
            buildPrompt: function (people, tierIndex) {
                var brief = people.map(function (p) {
                    return { id: p.id, name: p.name, nationality: p.nationality, countryOfOrigin: p.countryOfOrigin, languages: p.languages, ethnicity: p.ethnicity, religion: p.religion, educationLevel: p.educationLevel, occupation: p.occupation, workplace: p.workplace, tags: p.tags, extraNotes: p.extraNotes, credit: p.credit };
                });
                var focus = (tierIndex !== undefined && this.tierPrompt[tierIndex]) ? this.tierPrompt[tierIndex] : 'Focus on unique backgrounds and noteworthy patterns.';
                return {
                    system: 'You are an intelligence analyst. Output ONLY valid JSON. No markdown.',
                    prompt: 'Analyze these people for intelligence patterns and observations.\nPeople: ' + JSON.stringify(brief, null, 2) + '\nReturn JSON array: [{"type":"positive|info","subject":"name","content":"description","evidence":"data","tags":["tag"]}]\n' + focus + '\nReturn ONLY JSON.'
                };
            },
            threshold: 0
        },

        connection: {
            name: 'Connection',
            color: '#4d9de0',
            description: 'Hidden relationship discovery via shared attributes',
            score: function () { return 1; },
            buildPrompt: function (connections) {
                var brief = connections.map(function (c) {
                    return { person1: c.person1, person2: c.person2, sharedAttributes: c.reasons, connectionTypes: c.types };
                });
                return {
                    system: 'You are a network analysis specialist. Output ONLY valid JSON. No markdown.',
                    prompt: 'Evaluate these potential connections for significance.\nConnections: ' + JSON.stringify(brief, null, 2) + '\nReturn JSON array: [{"type":"connection","subject":"person1 <-> person2","content":"why this matters","evidence":"key shared attribute","tags":["type"]}]\nFocus on connections indicating hidden networks, collusion, or coordinated behavior.\nReturn ONLY JSON.'
                };
            }
        }
    };

    var SHARED_ATTR_CHECKS = [
        ['workplace', 'Same workplace'],
        ['nationality', 'Same nationality'],
        ['countryOfOrigin', 'Same country of origin'],
        ['religion', 'Same religion'],
        ['politicalViews', 'Same political views'],
        ['ethnicity', 'Same ethnicity'],
        ['immigrationStatus', 'Same immigration status'],
        ['occupation', 'Same occupation'],
        ['educationLevel', 'Same education level'],
        ['maritalStatus', 'Same marital status'],
        ['socialClass', 'Same social class'],
        ['incomeLevel', 'Same income level']
    ];

    function TIDE() {
        this._semaphore = new Semaphore(CONFIG.MAX_CONCURRENT);
        this._results = [];
        this._findings = [];
        this._running = false;
        this._cancelled = false;
        this._callbacks = {};
        this._dedup = new Map();
        this._types = {};
        this._history = [];
        this._eventBus = new Map();
        this._registerDefaults();
    }

    TIDE.prototype._registerDefaults = function () {
        var self = this;
        Object.keys(TYPES).forEach(function (k) {
            self._types[k] = TYPES[k];
        });
    };

    TIDE.prototype.configure = function (opts) {
        if (!opts) return;
        Object.keys(CONFIG).forEach(function (k) {
            if (opts[k] !== undefined) CONFIG[k] = opts[k];
        });
    };

    TIDE.prototype.registerType = function (name, def) {
        this._types[name] = def;
    };

    TIDE.prototype.getTypes = function () {
        return Object.keys(this._types);
    };

    TIDE.prototype.getTypeDef = function (name) {
        return this._types[name];
    };

    TIDE.prototype.isRunning = function () {
        return this._running;
    };

    TIDE.prototype.cancel = function () {
        this._cancelled = true;
        console.log('[TIDE] Cancelled by user');
    };

    TIDE.prototype.on = function (event, fn) {
        if (!this._eventBus.has(event)) this._eventBus.set(event, []);
        this._eventBus.get(event).push(fn);
        return this;
    };

    TIDE.prototype.off = function (event, fn) {
        var handlers = this._eventBus.get(event);
        if (!handlers) return;
        var idx = handlers.indexOf(fn);
        if (idx !== -1) handlers.splice(idx, 1);
        return this;
    };

    TIDE.prototype._emit = function (event, data) {
        var handlers = this._eventBus.get(event);
        if (!handlers) return;
        for (var i = 0; i < handlers.length; i++) {
            try { handlers[i](data); } catch (e) { console.warn('[TIDE] event handler error:', e); }
        }
    };

    TIDE.prototype.onProgress = function (fn) {
        this._callbacks.progress = fn;
        return this;
    };

    TIDE.prototype.onChunkComplete = function (fn) {
        this._callbacks.chunkComplete = fn;
        return this;
    };

    TIDE.prototype.onComplete = function (fn) {
        this._callbacks.complete = fn;
        return this;
    };

    TIDE.prototype.getResults = function () {
        return this._findings.slice();
    };

    TIDE.prototype.getSummary = function () {
        var typeCounts = {};
        this._findings.forEach(function (f) {
            var t = f.type || 'unknown';
            typeCounts[t] = (typeCounts[t] || 0) + 1;
        });
        return {
            total: this._findings.length,
            byType: typeCounts,
            deduped: this._dedup.size,
            running: this._running,
            timestamp: new Date().toISOString()
        };
    };

    TIDE.prototype.getHistory = function () {
        return this._history.slice();
    };

    TIDE.prototype.analyze = function (type, entities, options) {
        var self = this;
        if (self._running) return Promise.reject(new Error('TIDE analysis already running'));
        self._running = true;
        self._cancelled = false;
        self._findings = [];
        self._dedup = new Map();
        self._results = [];

        var typeDef = self._types[type];
        if (!typeDef && options && options.customType) {
            typeDef = options.customType;
        }
        if (!typeDef) {
            self._running = false;
            return Promise.reject(new Error('Unknown analysis type: ' + type));
        }

        var opts = options || {};
        var people = entities || [];
        if (!people || people.length === 0) {
            self._running = false;
            self._emit('complete', { type: type, findings: [], total: 0 });
            return Promise.resolve([]);
        }

        var startTime = Date.now();
        console.log('[TIDE] analyze ' + type + ' - ' + people.length + ' entities (started ' + new Date().toISOString() + ')');
        self._emit('start', { type: type, total: people.length, typeDef: typeDef });

        var resultPromise;
        if (type === 'connection') {
            resultPromise = self._analyzeConnections(people, typeDef, opts);
        } else if (type === 'credit') {
            resultPromise = self._analyzeCredits(people, typeDef, opts);
        } else {
            resultPromise = self._analyzeGeneral(type, people, typeDef, opts);
        }

        return resultPromise.then(function (results) {
            var elapsed = Date.now() - startTime;
            var historyEntry = {
                type: type,
                entitiesAnalyzed: people.length,
                findingsCount: self._findings.length,
                timestamp: new Date().toISOString(),
                elapsed: elapsed
            };
            self._history.push(historyEntry);
            if (self._history.length > CONFIG.MAX_HISTORY) self._history.shift();
            self._saveToStorage();

            console.log('[TIDE] analyze ' + type + ' complete - ' + self._findings.length + ' findings in ' + elapsed + 'ms');
            self._emit('complete', { type: type, findings: self._findings, elapsed: elapsed, total: people.length });
            if (self._callbacks.complete) self._callbacks.complete(self._findings);
            return self._findings;
        }).catch(function (err) {
            self._running = false;
            console.error('[TIDE] Analysis failed:', err);
            self._emit('error', { type: type, error: err.message });
            return self._findings;
        });
    };

    TIDE.prototype._scoreAndSort = function (type, people, typeDef) {
        var scored = [];
        for (var i = 0; i < people.length; i++) {
            scored.push({ person: people[i], score: typeDef.score ? typeDef.score(people[i]) : 0 });
        }
        scored.sort(function (a, b) { return b.score - a.score; });
        return scored;
    };

    TIDE.prototype._estimateChunkSize = function (typeDef, tierIndex) {
        if (tierIndex === 0) return CONFIG.DEEP_CHUNK_SIZE || 10;
        if (tierIndex === 2) return CONFIG.QUICK_CHUNK_SIZE || 40;
        return CONFIG.CHUNK_SIZE || 20;
    };

    TIDE.prototype._calcDynamicChunkSize = function (typeDef, people, tierIndex) {
        var baseSize = this._estimateChunkSize(typeDef, tierIndex);
        if (!people || people.length === 0) return baseSize;
        var sample = people[0];
        var fields = typeDef.fields || Object.keys(sample);
        var compactObj = {};
        for (var i = 0; i < fields.length; i++) {
            var key = fields[i];
            if (sample[key] !== undefined) compactObj[key] = sample[key];
        }
        var tokensPerPerson = estimateTokens(compactObj) + 20;
        var maxPerChunk = Math.max(2, Math.floor(CONFIG.TOKEN_BUDGET / tokensPerPerson));
        return Math.min(baseSize, maxPerChunk);
    };

    TIDE.prototype._buildTiers = function (scored, typeDef) {
        if (!typeDef.threshold || !typeDef.tierLabels) {
            return [{ index: 1, label: 'Analysis', people: scored.map(function (s) { return s.person; }) }];
        }

        var tiers = [];
        var threshold = typeDef.threshold;
        var highThreshold = threshold * 2.5;

        var high = [];
        var medium = [];
        var low = [];
        var highCount = Math.min(Math.ceil(scored.length * CONFIG.TOP_CANDIDATE_PCT), Math.max(5, Math.ceil(scored.length * 0.15)));

        for (var i = 0; i < scored.length; i++) {
            var s = scored[i];
            if (i < highCount && s.score >= highThreshold) {
                high.push(s.person);
            } else if (s.score >= threshold) {
                medium.push(s.person);
            } else {
                low.push(s.person);
            }
        }

        if (high.length >= CONFIG.SUB_TASK_MIN_CANDIDATES) {
            tiers.push({ index: 0, label: typeDef.tierLabels[0] || 'High Priority', people: high });
        }
        if (medium.length >= CONFIG.SUB_TASK_MIN_CANDIDATES && tiers.length < CONFIG.MAX_SUB_TASKS_PER_TYPE) {
            tiers.push({ index: 1, label: typeDef.tierLabels[1] || 'Standard', people: medium });
        }
        if (low.length >= CONFIG.SUB_TASK_MIN_CANDIDATES && tiers.length < CONFIG.MAX_SUB_TASKS_PER_TYPE) {
            tiers.push({ index: 2, label: typeDef.tierLabels[2] || 'General', people: low });
        }

        if (tiers.length === 0 && scored.length > 0) {
            tiers.push({ index: 1, label: 'All Entries', people: scored.map(function (s) { return s.person; }) });
        }

        return tiers;
    };

    TIDE.prototype._addFinding = function (finding) {
        var subject = (finding.subject || '').toLowerCase().trim();
        var content = (finding.content || '').toLowerCase().trim().substring(0, 80);
        var key = subject + '|' + content;

        if (this._dedup.has(key)) {
            var existing = this._dedup.get(key);
            existing.count = (existing.count || 1) + 1;
            if (finding.evidence && existing.evidence.indexOf(finding.evidence) === -1) {
                existing.evidence += '; ' + finding.evidence;
            }
            return false;
        }
        finding.count = 1;
        this._dedup.set(key, finding);
        this._findings.push(finding);
        return true;
    };

    TIDE.prototype._processChunk = function (chunk, typeDef, tier, chunkIndex, totalChunks) {
        var self = this;
        return self._semaphore.acquire()
            .then(function () { return delay(CONFIG.AI_CALL_DELAY); })
            .then(function () {
                if (self._cancelled) return [];
                var promptData = typeDef.buildPrompt(chunk, tier ? tier.index : undefined);
                return window.geminiChat([
                    { role: 'system', content: promptData.system },
                    { role: 'user', content: promptData.prompt }
                ]);
            })
            .then(function (response) {
                if (self._cancelled) return [];
                var text = extractText(response);
                var parsed = extractJSON(text);
                if (!parsed || !Array.isArray(parsed)) {
                    if (window.extractJSONFromResponse) {
                        parsed = window.extractJSONFromResponse(text);
                    }
                }
                var results = Array.isArray(parsed) ? parsed : [];
                for (var i = 0; i < results.length; i++) {
                    self._addFinding(results[i]);
                }
                self._emit('chunk_results', { chunkIndex: chunkIndex, total: totalChunks, results: results, findingsSoFar: self._findings.length });
                return results;
            })
            .catch(function (err) {
                console.warn('[TIDE] AI call failed for chunk ' + chunkIndex + ':', err);
                return [];
            })
            .then(function (results) {
                self._semaphore.release();
                if (self._callbacks.chunkComplete) {
                    self._callbacks.chunkComplete(chunkIndex, totalChunks, results);
                }
                return results;
            });
    };

    TIDE.prototype._processChunkWithRetry = function (chunk, typeDef, tier, chunkIndex, totalChunks, attempt) {
        var self = this;
        attempt = attempt || 0;
        return self._processChunk(chunk, typeDef, tier, chunkIndex, totalChunks)
            .then(function (results) { return results; })
            .catch(function (err) {
                if (attempt < CONFIG.RETRY_MAX && !self._cancelled) {
                    console.warn('[TIDE] Retrying chunk ' + chunkIndex + ' (attempt ' + (attempt + 1) + '/' + CONFIG.RETRY_MAX + ')');
                    return delay(CONFIG.AI_CALL_DELAY * 2)
                        .then(function () { return self._processChunkWithRetry(chunk, typeDef, tier, chunkIndex, totalChunks, attempt + 1); });
                }
                return [];
            });
    };

    TIDE.prototype._analyzeGeneral = function (type, people, typeDef, opts) {
        var self = this;

        var scored = self._scoreAndSort(type, people, typeDef);
        var tiers = self._buildTiers(scored, typeDef);

        var allChunks = [];
        var tierMeta = [];

        for (var t = 0; t < tiers.length; t++) {
            var tier = tiers[t];
            var chunkSize = self._calcDynamicChunkSize(typeDef, tier.people, tier.index);
            var chunks = chunkArray(tier.people, chunkSize);
            for (var c = 0; c < chunks.length; c++) {
                allChunks.push({ chunk: chunks[c], tier: tier });
            }
        }

        var totalChunks = allChunks.length;
        if (totalChunks === 0) {
            self._running = false;
            return Promise.resolve([]);
        }

        console.log('[TIDE] ' + type + ': ' + totalChunks + ' chunks from ' + people.length + ' entities across ' + tiers.length + ' tiers');

        var progress = { processed: 0 };

        var tasks = [];
        for (var i = 0; i < allChunks.length; i++) {
            (function (item, idx) {
                tasks.push(
                    self._processChunkWithRetry(item.chunk, typeDef, item.tier, idx, totalChunks)
                        .then(function () {
                            progress.processed++;
                            if (self._callbacks.progress) {
                                self._callbacks.progress(progress.processed, totalChunks, 'Chunk ' + idx + '/' + totalChunks + ' - ' + item.tier.label);
                            }
                            self._emit('progress', { processed: progress.processed, total: totalChunks, tier: item.tier.label, chunkIndex: idx });
                        })
                );
            })(allChunks[i], i);
        }

        return Promise.all(tasks).then(function () {
            self._running = false;
            return self._findings;
        });
    };

    TIDE.prototype._analyzeCredits = function (people, typeDef, opts) {
        var self = this;

        var scored = self._scoreAndSort('credit', people, typeDef);
        var chunkSize = CONFIG.CHUNK_SIZE * 2;
        var chunks = chunkArray(scored.map(function (s) { return s.person; }), chunkSize);
        var totalChunks = chunks.length;
        var allScores = {};

        if (totalChunks === 0) {
            self._running = false;
            var emptySummary = { high: 0, medium: 0, low: 0, average: 0, total: 0, updated: 0 };
            if (self._callbacks.complete) self._callbacks.complete(emptySummary);
            return Promise.resolve(emptySummary);
        }

        console.log('[TIDE] credit: ' + totalChunks + ' chunks from ' + people.length + ' entities');

        var tasks = [];
        for (var i = 0; i < chunks.length; i++) {
            (function (chunk, idx) {
                tasks.push(
                    self._semaphore.acquire()
                        .then(function () { return delay(CONFIG.AI_CALL_DELAY); })
                        .then(function () {
                            if (self._cancelled) return [];
                            var promptData = typeDef.buildPrompt(chunk);
                            var hashInput = chunk.map(function (p) { return p.id + '_' + (p.credit || 185); });
                            var cacheKey = 'credit_tide_' + computeHash(hashInput);

                            if (window.AIQueue) {
                                var cached = window.AIQueue.getCached(cacheKey);
                                if (cached) return cached;
                            }

                            return window.geminiChat([
                                { role: 'system', content: promptData.system },
                                { role: 'user', content: promptData.prompt }
                            ]).then(function (response) {
                                var text = extractText(response);
                                var parsed = extractJSON(text);
                                if (window.AIQueue && parsed) window.AIQueue.setCached(cacheKey, parsed);
                                return parsed || [];
                            });
                        })
                        .then(function (results) {
                            self._semaphore.release();
                            var scores = Array.isArray(results) ? results : [];
                            for (var s = 0; s < scores.length; s++) {
                                var entry = scores[s];
                                if (entry && entry.id && typeof entry.creditScore === 'number') {
                                    allScores[entry.id] = Math.max(0, Math.min(370, Math.round(entry.creditScore)));
                                }
                            }
                            if (self._callbacks.progress) {
                                self._callbacks.progress(idx + 1, totalChunks, 'Credit chunk ' + (idx + 1) + '/' + totalChunks);
                            }
                            self._emit('progress', { processed: idx + 1, total: totalChunks, phase: 'credit', chunkIndex: idx });
                            return scores;
                        })
                        .catch(function (err) {
                            self._semaphore.release();
                            console.warn('[TIDE] Credit chunk ' + idx + ' failed:', err);
                            return [];
                        })
                );
            })(chunks[i], i);
        }

            return Promise.all(tasks).then(function () {
            self._running = false;
            var updated = 0;
            for (var j = 0; j < people.length; j++) {
                var score = allScores[people[j].id];
                if (score !== undefined) {
                    people[j].credit = score;
                    updated++;
                }
            }

            var high = 0, medium = 0, low = 0;
            var minScore = 400, maxScore = 0, totalCred = 0;
            for (var k = 0; k < people.length; k++) {
                var c = people[k].credit || 185;
                if (c < 125) high++;
                else if (c < 250) medium++;
                else low++;
                totalCred += c;
                if (c < minScore) minScore = c;
                if (c > maxScore) maxScore = c;
            }
            var avg = people.length > 0 ? Math.round(totalCred / people.length) : 0;

            var result = {
                updated: updated,
                total: people.length,
                high: high,
                medium: medium,
                low: low,
                average: avg,
                min: minScore === 400 ? 0 : minScore,
                max: maxScore,
                scores: allScores
            };

            for (var f = 0; f < people.length; f++) {
                self._addFinding({
                    type: 'credit',
                    subject: people[f].name,
                    content: 'Credit score: ' + (people[f].credit || 185) + ' | Risk: ' + ((people[f].credit || 185) < 125 ? 'High' : (people[f].credit || 185) < 250 ? 'Medium' : 'Low'),
                    evidence: 'Social class: ' + (people[f].socialClass || 'Unknown'),
                    tags: ['credit']
                });
            }

            return result;
        });
    };

    TIDE.prototype._analyzeConnections = function (people, typeDef, opts) {
        var self = this;
        var index = self._buildIndex(people);
        var buckets = self._getBuckets(index);

        var connections = new Map();
        var processed = new Set();

        for (var i = 0; i < buckets.length; i++) {
            var bucket = buckets[i];
            var ids = bucket.ids;
            for (var j = 0; j < ids.length; j++) {
                for (var k = j + 1; k < ids.length; k++) {
                    var pairKey = [ids[j], ids[k]].sort().join('|');
                    if (processed.has(pairKey)) continue;
                    processed.add(pairKey);

                    var p1 = index.byId[ids[j]];
                    var p2 = index.byId[ids[k]];
                    if (!p1 || !p2) continue;

                    if ((p1.friends && p1.friends.indexOf(p2.id) !== -1) || (p1.family && p1.family.indexOf(p2.id) !== -1)) continue;

                    var shared = self._findSharedAttributes(p1, p2, bucket.key, bucket.value);
                    if (shared.length > 0) {
                        var ck = [p1.name, p2.name].sort().join('|');
                        if (!connections.has(ck)) {
                            connections.set(ck, { person1: p1.name, person2: p2.name, reasons: [], types: [] });
                        }
                        var conn = connections.get(ck);
                        for (var r = 0; r < shared.length; r++) {
                            if (conn.reasons.indexOf(shared[r]) === -1) conn.reasons.push(shared[r]);
                        }
                        if (conn.types.indexOf(bucket.key) === -1) conn.types.push(bucket.key);
                    }
                }
            }
            if (i % 20 === 0 && self._callbacks.progress) {
                self._callbacks.progress(i + 1, buckets.length, 'Scanning connections...');
            }
        }

        var strong = [];
        connections.forEach(function (c) {
            if (c.reasons.length >= 2) strong.push(c);
        });
        strong.sort(function (a, b) { return b.reasons.length - a.reasons.length; });
        strong = strong.slice(0, 200);

        var aiChunks = chunkArray(strong.slice(0, 100), CONFIG.CHUNK_SIZE);
        if (aiChunks.length === 0) {
            self._running = false;
            return Promise.resolve([]);
        }

        var tasks = [];
        for (var i = 0; i < aiChunks.length; i++) {
            (function (chunk, idx) {
                tasks.push(self._processChunkWithRetry(chunk, typeDef, null, idx, aiChunks.length));
            })(aiChunks[i], i);
        }

        return Promise.all(tasks).then(function () {
            for (var c = 0; c < Math.min(strong.length, 50); c++) {
                var conn = strong[c];
                self._addFinding({
                    type: 'connection',
                    subject: conn.person1 + ' <-> ' + conn.person2,
                    content: 'Shares ' + conn.reasons.length + ' attributes: ' + conn.reasons.join('; '),
                    evidence: 'Types: ' + conn.types.join(', '),
                    tags: conn.types.slice(0, 3)
                });
            }
            self._running = false;
            return self._findings;
        });
    };

    TIDE.prototype._buildIndex = function (people) {
        var index = { byId: {}, byName: {}, indexes: {} };
        var INDEX_KEYS = ['workplace', 'nationality', 'countryOfOrigin', 'religion', 'politicalViews', 'ethnicity', 'immigrationStatus', 'threatLevel', 'occupation', 'educationLevel', 'maritalStatus', 'socialClass', 'incomeLevel'];

        for (var k = 0; k < INDEX_KEYS.length; k++) {
            index.indexes[INDEX_KEYS[k]] = {};
        }
        index.indexes.tag = {};

        for (var i = 0; i < people.length; i++) {
            var p = people[i];
            if (p.id) index.byId[p.id] = p;
            if (p.name) index.byName[p.name.toLowerCase()] = p;

            for (var ik = 0; ik < INDEX_KEYS.length; ik++) {
                var key = INDEX_KEYS[ik];
                var val = p[key];
                if (val) {
                    var v = String(val).toLowerCase().trim();
                    if (v) {
                        if (!index.indexes[key][v]) index.indexes[key][v] = [];
                        if (index.indexes[key][v].indexOf(p.id) === -1) index.indexes[key][v].push(p.id);
                    }
                }
            }
            var tags = p.tags || [];
            for (var t = 0; t < tags.length; t++) {
                var tag = (tags[t] || '').toLowerCase().trim();
                if (tag) {
                    if (!index.indexes.tag[tag]) index.indexes.tag[tag] = [];
                    if (index.indexes.tag[tag].indexOf(p.id) === -1) index.indexes.tag[tag].push(p.id);
                }
            }
        }
        return index;
    };

    TIDE.prototype._getBuckets = function (index) {
        var buckets = [];
        var keys = Object.keys(index.indexes);
        for (var ki = 0; ki < keys.length; ki++) {
            var map = index.indexes[keys[ki]];
            var vals = Object.keys(map);
            for (var vi = 0; vi < vals.length; vi++) {
                if (map[vals[vi]].length >= 2) {
                    buckets.push({ key: keys[ki], value: vals[vi], ids: map[vals[vi]] });
                }
            }
        }
        return buckets;
    };

    TIDE.prototype._findSharedAttributes = function (p1, p2, skipKey, skipValue) {
        var shared = [];
        for (var c = 0; c < SHARED_ATTR_CHECKS.length; c++) {
            var key = SHARED_ATTR_CHECKS[c][0];
            var label = SHARED_ATTR_CHECKS[c][1];
            if (key === skipKey) continue;
            var v1 = (p1[key] || '').toLowerCase().trim();
            var v2 = (p2[key] || '').toLowerCase().trim();
            if (v1 && v2 && v1 === v2) shared.push(label + ': ' + v1);
        }

        var tagSet1 = {};
        var tagSet2 = {};
        var t1 = p1.tags || [];
        var t2 = p2.tags || [];
        for (var i = 0; i < t1.length; i++) tagSet1[t1[i].toLowerCase()] = true;
        for (var i = 0; i < t2.length; i++) tagSet2[t2[i].toLowerCase()] = true;
        var commonTags = [];
        var tagKeys = Object.keys(tagSet1);
        for (var i = 0; i < tagKeys.length; i++) {
            if (tagSet2[tagKeys[i]]) commonTags.push(tagKeys[i]);
        }
        if (commonTags.length > 0) shared.push('Shared tags: ' + commonTags.slice(0, 3).join(', '));

        var mf = [];
        var p1Friends = p1.friends || [];
        var p2Friends = p2.friends || [];
        for (var i = 0; i < p1Friends.length; i++) {
            if (p2Friends.indexOf(p1Friends[i]) !== -1) mf.push(p1Friends[i]);
        }
        if (mf.length > 0) shared.push(mf.length + ' mutual friends');

        var mfam = [];
        var p1Family = p1.family || [];
        var p2Family = p2.family || [];
        for (var i = 0; i < p1Family.length; i++) {
            if (p2Family.indexOf(p1Family[i]) !== -1) mfam.push(p1Family[i]);
        }
        if (mfam.length > 0) shared.push(mfam.length + ' mutual family');

        return shared;
    };

    TIDE.prototype.prioritize = function (entities, maxCount, type) {
        var typeDef = type ? this._types[type] : this._types.threat;
        if (!typeDef) return entities.slice(0, maxCount || 80);
        var scored = [];
        for (var i = 0; i < entities.length; i++) {
            scored.push({ entity: entities[i], score: typeDef.score ? typeDef.score(entities[i]) : 0 });
        }
        scored.sort(function (a, b) { return b.score - a.score; });
        var results = [];
        var limit = maxCount || 80;
        for (var j = 0; j < Math.min(scored.length, limit); j++) {
            results.push(scored[j].entity);
        }
        return results;
    };

    TIDE.prototype._getStore = function () {
        if (window.pazatorStore && typeof window.pazatorStore.kvGet === 'function') {
            return window.pazatorStore;
        }
        return null;
    };

    TIDE.prototype._saveToStorage = function () {
        var store = this._getStore();
        var data = { history: this._history.slice(-10) };
        if (store) {
            store.kvSet(CONFIG.STORAGE_KEY_HISTORY || 'tide_history', data).catch(function () {
                try { localStorage.setItem('tide_history', JSON.stringify(data)); } catch (e) {}
            });
        } else {
            try { localStorage.setItem('tide_history', JSON.stringify(data)); } catch (e) {}
        }
    };

    TIDE.prototype.loadFromStorage = function () {
        var self = this;
        var store = this._getStore();
        if (store) {
            store.kvGet(CONFIG.STORAGE_KEY_HISTORY || 'tide_history').then(function (data) {
                if (data && data.history) self._history = data.history;
            }).catch(function () {
                try {
                    var d = JSON.parse(localStorage.getItem('tide_history') || 'null');
                    if (d && d.history) self._history = d.history;
                } catch (e) {}
            });
        } else {
            try {
                var d = JSON.parse(localStorage.getItem('tide_history') || 'null');
                if (d && d.history) self._history = d.history;
            } catch (e) {}
        }
    };

    TIDE.prototype.getCreditRiskLevel = function (score) {
        if (score === undefined || score === null) return 'unknown';
        if (score < 125) return 'high';
        if (score < 250) return 'medium';
        return 'low';
    };

    TIDE.prototype.inferSocialClass = function (creditScore) {
        if (creditScore >= 300) return '1%';
        if (creditScore >= 220) return 'high class';
        if (creditScore >= 140) return 'medium class';
        return 'low class';
    };

    TIDE.prototype.getThreatColor = function (level) {
        var colors = {
            critical: '#ff1744',
            high: '#ff6b6b',
            medium: '#ffd93d',
            low: '#a29bfe',
            none: '#888888'
        };
        return colors[(level || 'none').toLowerCase()] || '#888888';
    };

    TIDE.prototype.applyCreditsToData = function (result) {
        if (!result || !result.updated) return;
        if (window.saveData) window.saveData();
        if (window.renderObjectCanvas) window.renderObjectCanvas();
        if (window.updateCreditStats) window.updateCreditStats();
        if (window.updateHeaderStats) window.updateHeaderStats();
    };

    window.TIDE = TIDE;
    window.TIDE_INSTANCE = new TIDE();
    window.TIDE_INSTANCE.loadFromStorage();
    window.dispatchEvent(new CustomEvent('tide_ready', { detail: { version: '1.0' } }));
})();
