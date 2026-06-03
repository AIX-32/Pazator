(function () {
    'use strict';

    var AGENT_CONFIG = {
        CHUNK_SIZE: 20,
        MAX_CONCURRENT: 2,
        AI_CALL_DELAY: 1500,
        SCORE_THRESHOLD: 3,
        TOP_CANDIDATE_PCT: 0.15,
        MAX_FINDINGS_PER_TYPE: 200,
        SUB_TASK_DEEP_CHUNK: 10,
        SUB_TASK_QUICK_CHUNK: 40,
        MAX_SUB_TASKS_PER_TYPE: 6,
        SUB_TASK_MIN_CANDIDATES: 1,
        STATUS: {
            IDLE: 'idle',
            WORKING: 'working',
            COMPLETED: 'completed',
            ERROR: 'error'
        }
    };

    var Semaphore = (function () {
        return function Semaphore(limit) {
            this.limit = limit;
            this.active = 0;
            this.queue = [];
        };
    })();

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
            var resolve = self.queue.shift();
            resolve();
        } else {
            self.active--;
        }
    };

    var InvertedIndex = (function () {
        return function InvertedIndex(people) {
            this.indexes = {
                workplace: new Map(),
                nationality: new Map(),
                countryOfOrigin: new Map(),
                religion: new Map(),
                politicalViews: new Map(),
                ethnicity: new Map(),
                immigrationStatus: new Map(),
                threatLevel: new Map(),
                occupation: new Map(),
                educationLevel: new Map(),
                maritalStatus: new Map(),
                socialClass: new Map(),
                incomeLevel: new Map(),
                tag: new Map()
            };
            this.byName = new Map();
            this.byId = new Map();
            this.build(people);
        };
    })();

    InvertedIndex.prototype.build = function (people) {
        var self = this;
        people.forEach(function (p) {
            if (p.id) self.byId.set(p.id, p);
            if (p.name) self.byName.set(p.name.toLowerCase(), p);
            self._add('workplace', p.workplace, p.id);
            self._add('nationality', p.nationality, p.id);
            self._add('countryOfOrigin', p.countryOfOrigin, p.id);
            self._add('religion', p.religion, p.id);
            self._add('politicalViews', p.politicalViews, p.id);
            self._add('ethnicity', p.ethnicity, p.id);
            self._add('immigrationStatus', p.immigrationStatus, p.id);
            self._add('threatLevel', p.threatLevel, p.id);
            self._add('occupation', p.occupation, p.id);
            self._add('educationLevel', p.educationLevel, p.id);
            self._add('maritalStatus', p.maritalStatus, p.id);
            self._add('socialClass', p.socialClass, p.id);
            self._add('incomeLevel', p.incomeLevel, p.id);
            (p.tags || []).forEach(function (t) {
                self._addToMap(self.indexes.tag, (t || '').toLowerCase(), p.id);
            });
        });
    };

    InvertedIndex.prototype._add = function (key, value, id) {
        if (value) this._addToMap(this.indexes[key], value.toLowerCase().trim(), id);
    };

    InvertedIndex.prototype._addToMap = function (map, key, id) {
        if (!key) return;
        if (!map.has(key)) map.set(key, new Set());
        map.get(key).add(id);
    };

    InvertedIndex.prototype.lookup = function (indexKey, value) {
        var idx = this.indexes[indexKey];
        if (!idx) return new Set();
        return idx.get((value || '').toLowerCase().trim()) || new Set();
    };

    InvertedIndex.prototype.getById = function (id) { return this.byId.get(id); };
    InvertedIndex.prototype.getByName = function (name) { return this.byName.get((name || '').toLowerCase()); };

    InvertedIndex.prototype.getBuckets = function () {
        var buckets = [];
        var self = this;
        Object.keys(this.indexes).forEach(function (key) {
            var map = self.indexes[key];
            map.forEach(function (ids, value) {
                if (ids.size >= 2) {
                    buckets.push({ indexKey: key, value: value, ids: Array.from(ids) });
                }
            });
        });
        return buckets;
    };

    var FindingDedup = (function () {
        return function FindingDedup() {
            this.seen = new Map();
            this.findings = [];
        };
    })();

    FindingDedup.prototype.add = function (finding) {
        var key = this._hash(finding);
        if (this.seen.has(key)) {
            var existing = this.seen.get(key);
            existing.count = (existing.count || 1) + 1;
            if (finding.evidence && existing.evidence.indexOf(finding.evidence) === -1) {
                existing.evidence += '; ' + finding.evidence;
            }
            return false;
        }
        finding.count = 1;
        this.seen.set(key, finding);
        this.findings.push(finding);
        return true;
    };

    FindingDedup.prototype._hash = function (f) {
        var subj = (f.subject || '').toLowerCase().trim();
        var content = (f.content || '').toLowerCase().trim().substring(0, 60);
        return subj + '|' + content;
    };

    FindingDedup.prototype.getFindings = function () {
        return this.findings.slice(0, AGENT_CONFIG.MAX_FINDINGS_PER_TYPE);
    };

    var IntelligenceAgent = (function () {
        return function IntelligenceAgent(name, type, color) {
            this.name = name;
            this.type = type;
            this.color = color;
            this.status = AGENT_CONFIG.STATUS.IDLE;
            this.progress = 0;
            this.total = 0;
            this.processed = 0;
            this.findingCount = 0;
            this.onFinding = null;
            this.semaphore = null;
        };
    })();

    IntelligenceAgent.prototype.setSemaphore = function (sem) { this.semaphore = sem; };

    IntelligenceAgent.prototype.setStatus = function (status) {
        this.status = status;
        this.renderPanel();
    };

    IntelligenceAgent.prototype.updateProgress = function (processed, total) {
        this.processed = processed;
        this.total = total;
        this.progress = total > 0 ? Math.round((processed / total) * 100) : 0;
        this.renderPanel();
    };

    IntelligenceAgent.prototype.emitFinding = function (finding) {
        this.findingCount++;
        if (this.onFinding) this.onFinding(finding);
    };

    IntelligenceAgent.prototype.processChunk = function (chunk, promptFn) {
        var self = this;
        return (self.semaphore ? self.semaphore.acquire() : Promise.resolve())
            .then(function () {
                return new Promise(function (resolve) {
                    setTimeout(resolve, AGENT_CONFIG.AI_CALL_DELAY);
                });
            })
            .then(function () {
                var prompt = promptFn(chunk);
                return window.geminiChat([
                    { role: 'system', content: 'You are a specialized intelligence agent. Output ONLY valid JSON.' },
                    { role: 'user', content: prompt }
                ]);
            })
            .then(function (response) {
                var text = response.content || response;
                var extractFn = window.extractJSONFromResponse || function (t) {
                    try { return JSON.parse(t); } catch (e) {
                        var m = t.match(/\[[\s\S]*?\]/);
                        if (m) try { return JSON.parse(m[0]); } catch (e2) { }
                        return [];
                    }
                };
                var results = extractFn(text);
                if (Array.isArray(results)) {
                    results.forEach(function (r) { self.emitFinding(r); });
                }
                return results || [];
            })
            .catch(function (err) {
                console.warn('Agent AI call failed:', err);
                return [];
            })
            .then(function (results) {
                if (self.semaphore) self.semaphore.release();
                return results;
            });
    };

    IntelligenceAgent.prototype.renderPanel = function () {
        var el = document.getElementById('agent-row-' + this.type);
        if (!el) return;
        var dot = el.querySelector('.agent-panel-dot');
        var status = el.querySelector('.agent-panel-status');
        var fill = el.querySelector('.agent-panel-bar-fill');
        var nameEl = el.querySelector('.agent-panel-name');
        if (dot) dot.className = 'agent-panel-dot ' + this.status;
        if (status) status.textContent = this.status.charAt(0).toUpperCase() + this.status.slice(1);
        if (fill) {
            fill.style.width = this.progress + '%';
            fill.className = 'agent-panel-bar-fill' + (this.status === AGENT_CONFIG.STATUS.COMPLETED ? ' completed' : this.status === AGENT_CONFIG.STATUS.ERROR ? ' error' : '');
        }
        if (nameEl) nameEl.textContent = this.name + ' (' + this.findingCount + ')';
    };

    IntelligenceAgent.prototype.reset = function () {
        this.status = AGENT_CONFIG.STATUS.IDLE;
        this.progress = 0;
        this.total = 0;
        this.processed = 0;
        this.findingCount = 0;
    };

    var AgentRegistry = (function () {
        return function AgentRegistry() {
            this._defs = new Map();
        };
    })();

    AgentRegistry.prototype.register = function (type, definition) {
        if (!type) throw new Error('Agent type name is required');
        this._defs.set(type, { type: type, ...definition });
    };

    AgentRegistry.prototype.get = function (type) {
        return this._defs.get(type);
    };

    AgentRegistry.prototype.has = function (type) {
        return this._defs.has(type);
    };

    AgentRegistry.prototype.list = function () {
        return Array.from(this._defs.keys());
    };

    AgentRegistry.prototype.definitions = function () {
        return Array.from(this._defs.values());
    };

    AgentRegistry.prototype.remove = function (type) {
        this._defs.delete(type);
    };

    AgentRegistry.prototype.clear = function () {
        this._defs.clear();
    };

    var Orchestrator = (function () {
        return function Orchestrator(agentSystem) {
            this.system = agentSystem;
        };
    })();

    Orchestrator.prototype.decompose = function (type, people) {
        var def = this.system.registry.get(type);
        if (!def) return [];

        var hints = def.decomposeHints;
        if (!hints || !hints.scoreTiers) {
            return [{ id: type + '_single', type: type, label: def.name, depth: 'standard', priority: 0, candidates: people || [], fieldSlice: null, promptSuffix: null }];
        }

        var scored = (people || this.system.getPersonData()).map(function (p) {
            return { person: p, score: def.scoringFn ? def.scoringFn(p) : 0 };
        });

        var tasks = [];
        var tiers = hints.scoreTiers;

        for (var t = 0; t < tiers.length; t++) {
            var tier = tiers[t];
            var tierMin = tier.min;
            var tierMax = t > 0 ? tiers[t - 1].min : Infinity;

            var candidates = [];
            for (var s = 0; s < scored.length; s++) {
                var score = scored[s].score;
                if (score >= tierMin && score < tierMax) {
                    candidates.push(scored[s].person);
                }
            }

            if (candidates.length < AGENT_CONFIG.SUB_TASK_MIN_CANDIDATES) continue;

            var task = {
                id: type + '_tier' + t,
                type: type,
                label: tier.label,
                depth: tier.depth || 'standard',
                priority: t,
                candidates: candidates,
                fieldSlice: null,
                promptSuffix: tier.promptSuffix || null
            };
            tasks.push(task);
        }

        tasks.sort(function (a, b) { return a.priority - b.priority; });

        if (tasks.length === 0 && scored.length > 0) {
            tasks.push({
                id: type + '_all',
                type: type,
                label: def.name,
                depth: 'standard',
                priority: 99,
                candidates: scored.map(function (s) { return s.person; }),
                fieldSlice: null,
                promptSuffix: null
            });
        }

        return tasks;
    };

    Orchestrator.prototype.decomposeAll = function (people) {
        var self = this;
        var types = this.system.registry.list();
        var allTasks = [];
        types.forEach(function (type) {
            var def = self.system.registry.get(type);
            if (def.runner) return;
            var tasks = self.decompose(type, people);
            allTasks = allTasks.concat(tasks);
        });
        allTasks.sort(function (a, b) { return a.priority - b.priority; });
        return allTasks;
    };

    Orchestrator.prototype.decomposeTask = function (request) {
        if (!request || request === 'all') {
            return this.decomposeAll();
        }
        if (this.system.registry.has(request)) {
            return this.decompose(request);
        }
        return [];
    };

    Orchestrator.prototype.run = function (request) {
        var tasks = this.decomposeTask(request);
        return this.system.runTasks(tasks);
    };

    var AgentSystem = (function () {
        return function AgentSystem() {
            this.registry = new AgentRegistry();
            this.agents = new Map();
            this.running = false;
            this.panelVisible = false;
            this.semaphore = new Semaphore(AGENT_CONFIG.MAX_CONCURRENT);
            this.dedup = new FindingDedup();
            this.orchestrator = new Orchestrator(this);
            this._registerDefaults();
        };
    })();

    AgentSystem.prototype._registerDefaults = function () {
        var self = this;

        self.registerAgentType('threat', {
            name: 'Threat',
            color: '#ff6b6b',
            fields: ['threatLevel', 'politicalViews', 'religion', 'tags', 'extraNotes', 'workplace', 'occupation', 'credit'],
            scoringFn: function (p) {
                var score = 0;
                var tl = (p.threatLevel || '').toLowerCase();
                if (tl === 'critical') score += 10;
                else if (tl === 'high') score += 7;
                else if (tl === 'medium') score += 4;
                else if (tl === 'low') score += 2;

                var tags = (p.tags || []).map(function (t) { return t.toLowerCase(); });
                var dangerous = ['dangerous', 'violent', 'extremist', 'weapon', 'bomb', 'threat', 'criminal', 'wanted', 'suspect', 'terrorist', 'militant', 'radical'];
                tags.forEach(function (t) { if (dangerous.some(function (d) { return t.indexOf(d) !== -1; })) score += 3; });

                var notes = (p.extraNotes || '').toLowerCase();
                if (notes.indexOf('threat') !== -1 || notes.indexOf('danger') !== -1 || notes.indexOf('violent') !== -1 || notes.indexOf('weapon') !== -1) score += 4;
                if (notes.indexOf('extremist') !== -1 || notes.indexOf('radical') !== -1 || notes.indexOf('militant') !== -1) score += 5;

                return score;
            },
            buildPrompt: function (chunk, subTask) {
                var brief = chunk.map(function (p) {
                    return { id: p.id, name: p.name, threatLevel: p.threatLevel, politicalViews: p.politicalViews, religion: p.religion, tags: p.tags, extraNotes: p.extraNotes, workplace: p.workplace, occupation: p.occupation, credit: p.credit };
                });
                var focus = subTask && subTask.promptSuffix ? subTask.promptSuffix : 'Focus on: dangerous behavior, extremist indicators, violent tendencies, security risks.';
                return 'Analyze these ' + (subTask ? subTask.label : 'HIGH-PRIORITY') + ' people for threats and security concerns.\nPeople: ' + JSON.stringify(brief, null, 2) + '\nReturn JSON: [{"type":"threat","subject":"name","content":"description","evidence":"specific data point","tags":["tag"]}]\n' + focus + '\nOnly genuine threats. Return ONLY JSON.';
            },
            decomposeHints: {
                scoreTiers: [
                    { min: 7, depth: 'deep', label: 'Critical Threats', promptSuffix: 'Deep-dive analysis: look for subtle behavioral patterns, hidden extremist indicators, network connections, and escalation risks.' },
                    { min: 4, depth: 'standard', label: 'Elevated Threats', promptSuffix: 'Standard threat analysis: evaluate risk factors, behavioral concerns, and security implications.' },
                    { min: 0, depth: 'quick', label: 'General Threats', promptSuffix: 'Quick scan for obvious threat indicators, unusual tags, or security-relevant notes.' }
                ],
                fieldBuckets: ['nationality', 'religion']
            }
        });

        self.registerAgentType('risk', {
            name: 'Risk',
            color: '#ffd93d',
            fields: ['credit', 'incomeLevel', 'socialClass', 'educationLevel', 'immigrationStatus', 'tags', 'extraNotes', 'workplace', 'occupation', 'maritalStatus'],
            scoringFn: function (p) {
                var score = 0;
                var credit = p.credit || 185;
                if (credit < 100) score += 5;
                else if (credit < 150) score += 3;

                var imm = (p.immigrationStatus || '').toLowerCase();
                if (imm.indexOf('visa') !== -1 || imm.indexOf('temporary') !== -1 || imm.indexOf('expired') !== -1 || imm.indexOf('overstay') !== -1) score += 3;
                if (imm.indexOf('undocumented') !== -1 || imm.indexOf('illegal') !== -1) score += 5;

                var tags = (p.tags || []).map(function (t) { return t.toLowerCase(); });
                var risky = ['suspicious', 'fraud', 'debt', 'bankrupt', 'unstable', 'unemployed', 'untrusted', 'scam'];
                tags.forEach(function (t) { if (risky.some(function (r) { return t.indexOf(r) !== -1; })) score += 3; });

                var income = (p.incomeLevel || '').toLowerCase();
                if (income === 'low' || income === 'none') score += 2;

                var notes = (p.extraNotes || '').toLowerCase();
                if (notes.indexOf('suspicious') !== -1 || notes.indexOf('fraud') !== -1 || notes.indexOf('debt') !== -1) score += 3;
                if (notes.indexOf('unstable') !== -1 || notes.indexOf('risk') !== -1) score += 2;

                return score;
            },
            buildPrompt: function (chunk, subTask) {
                var brief = chunk.map(function (p) {
                    return { id: p.id, name: p.name, credit: p.credit, incomeLevel: p.incomeLevel, socialClass: p.socialClass, educationLevel: p.educationLevel, immigrationStatus: p.immigrationStatus, tags: p.tags, extraNotes: p.extraNotes, workplace: p.workplace, occupation: p.occupation, maritalStatus: p.maritalStatus };
                });
                var focus = subTask && subTask.promptSuffix ? subTask.promptSuffix : 'Focus on: financial risks, immigration issues, social vulnerabilities, instability.';
                return 'Analyze these ' + (subTask ? subTask.label : 'PRIORITY') + ' people for risks and vulnerabilities.\nPeople: ' + JSON.stringify(brief, null, 2) + '\nReturn JSON: [{"type":"risk","subject":"name","content":"description","evidence":"specific data","tags":["tag"]}]\n' + focus + '\nOnly genuine risks. Return ONLY JSON.';
            },
            decomposeHints: {
                scoreTiers: [
                    { min: 7, depth: 'deep', label: 'Critical Risks', promptSuffix: 'Deep-dive risk assessment: uncover financial vulnerabilities, immigration status complications, social instability patterns, and fraud indicators.' },
                    { min: 4, depth: 'standard', label: 'Elevated Risks', promptSuffix: 'Standard risk evaluation: assess financial, social, and legal risk factors.' },
                    { min: 0, depth: 'quick', label: 'General Risks', promptSuffix: 'Quick scan for any risk flags, unusual financial status, or vulnerability notes.' }
                ],
                fieldBuckets: ['immigrationStatus', 'incomeLevel']
            }
        });

        self.registerAgentType('intel', {
            name: 'Intel',
            color: '#6bcf7f',
            fields: ['nationality', 'countryOfOrigin', 'languages', 'ethnicity', 'religion', 'educationLevel', 'occupation', 'workplace', 'tags', 'extraNotes', 'credit'],
            scoringFn: function (p) {
                var score = 0;
                if (p.languages && p.languages.length > 2) score += 2;
                if (p.educationLevel && (p.educationLevel.indexOf('university') !== -1 || p.educationLevel.indexOf('master') !== -1 || p.educationLevel.indexOf('phd') !== -1)) score += 2;
                if (p.nationality && p.countryOfOrigin && p.nationality !== p.countryOfOrigin) score += 2;
                var tags = (p.tags || []).map(function (t) { return t.toLowerCase(); });
                var notable = ['leader', 'owner', 'manager', 'doctor', 'engineer', 'investor', 'executive', 'professional', 'veteran', 'expert', 'specialist'];
                tags.forEach(function (t) { if (notable.some(function (n) { return t.indexOf(n) !== -1; })) score += 2; });
                if (p.chats && p.chats.length > 5) score += 1;
                return score;
            },
            buildPrompt: function (chunk, subTask) {
                var brief = chunk.map(function (p) {
                    return { id: p.id, name: p.name, nationality: p.nationality, countryOfOrigin: p.countryOfOrigin, languages: p.languages, ethnicity: p.ethnicity, religion: p.religion, educationLevel: p.educationLevel, occupation: p.occupation, workplace: p.workplace, tags: p.tags, extraNotes: p.extraNotes, credit: p.credit };
                });
                var focus = subTask && subTask.promptSuffix ? subTask.promptSuffix : 'Focus on: unique backgrounds, positive indicators, noteworthy patterns, demographic insights.';
                return 'Analyze these ' + (subTask ? subTask.label : 'NOTABLE') + ' people for intelligence patterns and observations.\nPeople: ' + JSON.stringify(brief, null, 2) + '\nReturn JSON: [{"type":"positive|info","subject":"name","content":"description","evidence":"data","tags":["tag"]}]\n' + focus + '\nReturn ONLY JSON.';
            },
            decomposeHints: {
                scoreTiers: [
                    { min: 4, depth: 'deep', label: 'Notable Profiles', promptSuffix: 'Deep intelligence profile: identify unique background combinations, unusual expertise, cross-cultural indicators, and high-value observation targets.' },
                    { min: 0, depth: 'quick', label: 'General Profiles', promptSuffix: 'Quick scan for any notable demographic patterns, interesting tags, or relevant background details.' }
                ],
                fieldBuckets: ['nationality', 'occupation']
            }
        });

        self.registerAgentType('connection', {
            name: 'Connection',
            color: '#4d9de0',
            runner: function (agent, people, entities, index) {
                return self._runConnectionAgent(agent, people, index);
            }
        });
    };

    AgentSystem.prototype.registerAgentType = function (type, definition) {
        this.registry.register(type, definition);
        var agent = new IntelligenceAgent(definition.name, type, definition.color);
        agent.setSemaphore(this.semaphore);
        this.agents.set(type, agent);
        if (this.panelVisible) this.renderAllRows();
        return agent;
    };

    AgentSystem.prototype.removeAgentType = function (type) {
        this.registry.remove(type);
        this.agents.delete(type);
        if (this.panelVisible) this.renderAllRows();
    };

    AgentSystem.prototype.getAgent = function (type) {
        return this.agents.get(type) || null;
    };

    AgentSystem.prototype.getAgents = function () {
        return Array.from(this.agents.values());
    };

    AgentSystem.prototype.showPanel = function () {
        var panel = document.getElementById('agentPanel');
        if (!panel) return;
        panel.style.display = 'block';
        this.panelVisible = true;
        this.renderAllRows();
    };

    AgentSystem.prototype.renderAllRows = function () {
        var body = document.getElementById('agentPanelBody');
        if (!body) return;
        body.innerHTML = '';
        var self = this;
        this.getAgents().forEach(function (agent) {
            var row = document.createElement('div');
            row.className = 'agent-panel-agent';
            row.id = 'agent-row-' + agent.type;
            row.innerHTML =
                '<div class="agent-panel-dot ' + agent.status + '"></div>' +
                '<div class="agent-panel-info">' +
                '<div class="agent-panel-name">' + agent.name + '</div>' +
                '<div class="agent-panel-status">' + agent.status.charAt(0).toUpperCase() + agent.status.slice(1) + '</div>' +
                '</div>' +
                '<div class="agent-panel-bar">' +
                '<div class="agent-panel-bar-bg">' +
                '<div class="agent-panel-bar-fill" style="width: ' + agent.progress + '%"></div>' +
                '</div>' +
                '</div>';
            body.appendChild(row);
        });
    };

    AgentSystem.prototype.getPersonData = function () {
        return (window.pazatorData && window.pazatorData.humans || []).map(function (h) {
            return {
                id: h.id, name: h.name, gender: h.gender, birthDate: h.birthDate,
                workplace: h.workplace, occupation: h.occupation,
                nationality: h.nationality, countryOfOrigin: h.countryOfOrigin,
                immigrationStatus: h.immigrationStatus, languages: h.languages || [],
                ethnicity: h.ethnicity, religion: h.religion,
                politicalViews: h.politicalViews, threatLevel: h.threatLevel,
                socialClass: h.socialClass, incomeLevel: h.incomeLevel,
                educationLevel: h.educationLevel, maritalStatus: h.maritalStatus,
                credit: h.credit, tags: h.tags || [],
                friends: h.friends || [], family: h.family || [],
                extraNotes: h.extraNotes || '', chats: h.chats || []
            };
        });
    };

    AgentSystem.prototype.getEntityData = function () {
        return (window.pazatorData && window.pazatorData.others || []).map(function (o) {
            return { id: o.id, name: o.name, note: o.note || '', tags: o.tags || [] };
        });
    };

    AgentSystem.prototype.runAll = function () {
        var self = this;
        if (self.running) return Promise.resolve();
        self.running = true;

        self.showPanel();
        var closeBtn = document.getElementById('agentPanelClose');
        if (closeBtn) closeBtn.style.display = 'none';

        var btn = document.getElementById('intelAnalyzeBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<div class="loader" style="--size:16px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Deploying...';
        }

        var people = self.getPersonData();
        var entities = self.getEntityData();
        console.log('[AgentSystem] runAll started. people:', people.length, 'entities:', entities.length);
        console.log('[AgentSystem] First 3 people:', people.slice(0, 3).map(function(p) { return p.id + ':' + p.name; }));
        var index = new InvertedIndex(people);

        self.dedup = new FindingDedup();

        self.getAgents().forEach(function (a) {
            a.reset();
            a.onFinding = function (f) {
                var isNew = self.dedup.add(f);
                if (isNew) a.renderPanel();
            };
        });
        self.renderAllRows();

        var subTasks = self.orchestrator.decomposeAll(people);
        console.log('[AgentSystem] subTasks:', subTasks.length);
        subTasks.forEach(function(t) { console.log('  -', t.id, '| type:', t.type, '| candidates:', t.candidates.length, '| depth:', t.depth); });

        var runnerTypes = [];

        self.registry.definitions().forEach(function (def) {
            if (def.runner) {
                var agent = self.agents.get(def.type);
                runnerTypes.push(def.runner.call(self, agent, people, entities, index));
            }
        });
        console.log('[AgentSystem] runnerTypes:', runnerTypes.length);

        var taskPromises = subTasks.map(function (task) {
            var agent = self.agents.get(task.type);
            if (!agent) return Promise.resolve();
            return self._runSubTask(agent, task);
        });
        console.log('[AgentSystem] taskPromises:', taskPromises.length);

        var allPromises = runnerTypes.concat(taskPromises);

        return Promise.all(allPromises)
            .then(function () {
                self.collectAllFindings(subTasks);
            })
            .catch(function (e) {
                console.error('Agent system error:', e);
            })
            .then(function () {
                self.running = false;
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-play"></i> Deploy Agents';
                }
                if (closeBtn) closeBtn.style.display = 'flex';
            });
    };

    AgentSystem.prototype._runSubTask = function (agent, subTask) {
        var self = this;
        console.log('[AgentSystem] _runSubTask:', subTask.id, 'agent:', agent.name, 'depth:', subTask.depth, 'total candidates:', subTask.candidates.length);
        agent.setStatus(AGENT_CONFIG.STATUS.WORKING);

        var chunkSize = AGENT_CONFIG.CHUNK_SIZE;
        if (subTask.depth === 'deep') chunkSize = AGENT_CONFIG.SUB_TASK_DEEP_CHUNK;
        else if (subTask.depth === 'quick') chunkSize = AGENT_CONFIG.SUB_TASK_QUICK_CHUNK;

        var candidates = subTask.candidates;
        if (!candidates || candidates.length === 0) {
            console.log('[AgentSystem] _runSubTask: no candidates, skipping');
            agent.setStatus(AGENT_CONFIG.STATUS.COMPLETED);
            return Promise.resolve();
        }

        var chunks = self._chunkArray(candidates, chunkSize);
        console.log('[AgentSystem] _runSubTask: chunkSize:', chunkSize, 'chunks:', chunks.length);
        agent.updateProgress(0, chunks.length);

        var def = self.registry.get(subTask.type);
        var tasks = chunks.map(function (chunk, i) {
            console.log('[AgentSystem]   chunk', i, 'size:', chunk.length);
            return self._runAIAnalysis(agent, chunk, i, subTask.type, function (c) {
                return def.buildPrompt(c, subTask);
            });
        });

        return Promise.all(tasks).then(function () {
            console.log('[AgentSystem] _runSubTask done:', subTask.id, 'findings:', agent.findingCount);
            agent.setStatus(AGENT_CONFIG.STATUS.COMPLETED);
        });
    };

    AgentSystem.prototype.runTasks = function (tasks) {
        var self = this;
        var people = self.getPersonData();
        var entities = self.getEntityData();
        var index = new InvertedIndex(people);

        self.getAgents().forEach(function (a) {
            a.reset();
            a.onFinding = function (f) {
                var isNew = self.dedup.add(f);
                if (isNew) a.renderPanel();
            };
        });

        var promises = tasks.map(function (task) {
            var agent = self.agents.get(task.type);
            if (!agent) return Promise.resolve([]);

            var def = self.registry.get(task.type);
            if (def && def.runner) {
                return def.runner.call(self, agent, people, entities, index);
            }

            if (!task.candidates) {
                var decomposed = self.orchestrator.decompose(task.type, people);
                var subPromises = decomposed.map(function (st) {
                    return self._runSubTask(agent, st);
                });
                return Promise.all(subPromises);
            }

            return self._runSubTask(agent, task);
        });

        return Promise.all(promises);
    };

    AgentSystem.prototype._runScoredAgent = function (def, agent, people) {
        var task = {
            id: def.type + '_legacy',
            type: def.type,
            label: def.name,
            depth: 'standard',
            priority: 0,
            candidates: people,
            promptSuffix: null
        };
        if (def.decomposeHints && def.decomposeHints.scoreTiers) {
            var tasks = this.orchestrator.decompose(def.type, people);
            if (tasks.length > 0) {
                var self = this;
                var subPromises = tasks.map(function (t) { return self._runSubTask(agent, t); });
                return Promise.all(subPromises);
            }
        }
        return this._runSubTask(agent, task);
    };

    AgentSystem.prototype._runAIAnalysis = function (agent, chunk, index, type, promptFn) {
        var self = this;
        console.log('[AgentSystem] _runAIAnalysis - agent:', agent.name, 'chunk:', index, 'size:', chunk.length);
        agent.updateProgress(index, agent.total);
        return agent.processChunk(chunk, promptFn)
            .catch(function (err) {
                console.warn('Agent AI call failed, retrying...', err);
                return self._delay(AGENT_CONFIG.AI_CALL_DELAY * 2)
                    .then(function () { return agent.processChunk(chunk, promptFn); })
                    .catch(function (retryErr) {
                        console.warn('Agent AI retry also failed:', retryErr);
                        return [];
                    });
            })
            .then(function () {
                agent.updateProgress(index + 1, agent.total);
            });
    };

    AgentSystem.prototype._delay = function (ms) {
        return new Promise(function (r) { setTimeout(r, ms); });
    };

    AgentSystem.prototype._chunkArray = function (arr, size) {
        var chunks = [];
        for (var i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
        }
        return chunks;
    };

    AgentSystem.prototype._percentile = function (values, p) {
        if (values.length === 0) return 0;
        var sorted = values.slice().sort(function (a, b) { return a - b; });
        var idx = Math.floor(p * (sorted.length - 1));
        return sorted[idx];
    };

    AgentSystem.prototype._runConnectionAgent = function (agent, people, index) {
        var self = this;
        console.log('[AgentSystem] _runConnectionAgent - people:', people.length);
        agent.setStatus(AGENT_CONFIG.STATUS.WORKING);

        var buckets = index.getBuckets();
        console.log('[AgentSystem] _runConnectionAgent - shared-attr buckets:', buckets.length);
        var connections = new Map();
        var processed = new Set();

        var totalWork = buckets.length;
        agent.updateProgress(0, totalWork);

        for (var i = 0; i < buckets.length; i++) {
            var bucket = buckets[i];
            var ids = bucket.ids;

            for (var j = 0; j < ids.length; j++) {
                for (var k = j + 1; k < ids.length; k++) {
                    var pairKey = [ids[j], ids[k]].sort().join('|');
                    if (processed.has(pairKey)) continue;
                    processed.add(pairKey);

                    var p1 = index.getById(ids[j]);
                    var p2 = index.getById(ids[k]);
                    if (!p1 || !p2) continue;
                    if ((p1.friends && p1.friends.indexOf(p2.id) !== -1) || (p1.family && p1.family.indexOf(p2.id) !== -1)) continue;

                    var shared = self._findSharedAttributes(p1, p2, bucket.indexKey, bucket.value);
                    if (shared.length > 0) {
                        var connKey = [p1.name, p2.name].sort().join('|');
                        if (!connections.has(connKey)) {
                            connections.set(connKey, { person1: p1.name, person2: p2.name, reasons: [], types: new Set() });
                        }
                        var conn = connections.get(connKey);
                        shared.forEach(function (s) { conn.reasons.push(s); });
                        conn.types.add(bucket.indexKey);
                    }
                }
            }

            if (i % 10 === 0 || i === buckets.length - 1) {
                agent.updateProgress(i + 1, totalWork);
            }
        }

        console.log('[AgentSystem] _runConnectionAgent - raw connections:', connections.size);

        var strongConnections = [];
        connections.forEach(function (c) {
            if (c.reasons.length >= 2) strongConnections.push(c);
        });
        strongConnections.sort(function (a, b) { return b.reasons.length - a.reasons.length; });
        strongConnections = strongConnections.slice(0, 200);
        console.log('[AgentSystem] _runConnectionAgent - strongConnections (>=2 reasons):', strongConnections.length);

        var aiChunks = self._chunkArray(strongConnections.slice(0, 100), AGENT_CONFIG.CHUNK_SIZE);
        agent.total = aiChunks.length;
        agent.updateProgress(0, aiChunks.length);
        console.log('[AgentSystem] _runConnectionAgent - aiChunks:', aiChunks.length);

        if (aiChunks.length > 0) {
            var tasks = aiChunks.map(function (chunk, i) {
                return self._runAIAnalysis(agent, chunk, i, 'connection', function (c) {
                    var brief = c.map(function (conn) {
                        return { person1: conn.person1, person2: conn.person2, sharedAttributes: conn.reasons, connectionTypes: Array.from(conn.types) };
                    });
                    return 'Evaluate these potential connections for significance.\nConnections: ' + JSON.stringify(brief, null, 2) + '\nReturn JSON: [{"type":"connection","subject":"person1 <-> person2","content":"why this connection matters","evidence":"key shared attribute","tags":["type"]}]\nFocus on connections that could indicate hidden networks, collusion, or coordinated behavior.\nReturn ONLY JSON.';
                });
            });
            return Promise.all(tasks).then(function () {
                strongConnections.slice(0, 50).forEach(function (conn) {
                    agent.emitFinding({
                        type: 'connection',
                        subject: conn.person1 + ' <-> ' + conn.person2,
                        content: 'Shares ' + conn.reasons.length + ' attributes: ' + conn.reasons.join('; '),
                        evidence: 'Types: ' + Array.from(conn.types).join(', '),
                        tags: Array.from(conn.types).slice(0, 3)
                    });
                });
                agent.updateProgress(agent.total, agent.total);
                agent.setStatus(AGENT_CONFIG.STATUS.COMPLETED);
            });
        }

        agent.updateProgress(agent.total, agent.total);
        agent.setStatus(AGENT_CONFIG.STATUS.COMPLETED);
        return Promise.resolve();
    };

    AgentSystem.prototype._findSharedAttributes = function (p1, p2, bucketKey, bucketValue) {
        var shared = [];
        var checks = [
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
            ['incomeLevel', 'Same income level'],
        ];

        checks.forEach(function (_a) {
            var key = _a[0], label = _a[1];
            if (key === bucketKey) return;
            var v1 = (p1[key] || '').toLowerCase().trim();
            var v2 = (p2[key] || '').toLowerCase().trim();
            if (v1 && v2 && v1 === v2) {
                shared.push(label + ': ' + v1);
            }
        });

        var tags1 = new Set((p1.tags || []).map(function (t) { return t.toLowerCase(); }));
        var tags2 = new Set((p2.tags || []).map(function (t) { return t.toLowerCase(); }));
        var commonTags = [];
        tags1.forEach(function (t) { if (tags2.has(t)) commonTags.push(t); });
        if (commonTags.length > 0) {
            shared.push('Shared tags: ' + commonTags.slice(0, 3).join(', '));
        }

        var mutualFriends = (p1.friends || []).filter(function (f) { return (p2.friends || []).indexOf(f) !== -1; });
        if (mutualFriends.length > 0) {
            shared.push(mutualFriends.length + ' mutual friends');
        }

        var mutualFamily = (p1.family || []).filter(function (f) { return (p2.family || []).indexOf(f) !== -1; });
        if (mutualFamily.length > 0) {
            shared.push(mutualFamily.length + ' mutual family');
        }

        return shared;
    };

    AgentSystem.prototype.collectAllFindings = function (subTasks) {
        var allFindings = this.dedup.getFindings();
        console.log('[AgentSystem] collectAllFindings - total deduped:', allFindings.length);
        if (allFindings.length > 0) {
            console.log('[AgentSystem] Findings:', JSON.stringify(allFindings.slice(0, 3)));
            if (window.renderFindingsToCards) window.renderFindingsToCards(allFindings);
            var countEl = document.getElementById('intelFindingsCount');
            if (countEl) countEl.textContent = allFindings.length;
            var lastEl = document.getElementById('intelLastAnalysis');
            if (lastEl) lastEl.textContent = new Date().toLocaleTimeString();

            var title = 'Agent Analysis - ' + new Date().toLocaleString();
            if (window.storeAnalysisResult) {
                var saved = window.storeAnalysisResult('intelligence', title, allFindings);
                window._lastIntelAnalysisId = saved.id;
            }
            var taskCount = subTasks ? subTasks.length : this.getAgents().length;
            if (window.showFloatingNotification) {
                window.showFloatingNotification('Agent analysis complete. ' + allFindings.length + ' findings across ' + taskCount + ' sub-tasks.', 'success');
            }
        } else {
            if (window.showFloatingNotification) {
                window.showFloatingNotification('Analysis complete. No significant findings.', 'info');
            }
        }
    };

    window.AGENT_CONFIG = AGENT_CONFIG;
    window.Semaphore = Semaphore;
    window.InvertedIndex = InvertedIndex;
    window.FindingDedup = FindingDedup;
    window.IntelligenceAgent = IntelligenceAgent;
    window.AgentRegistry = AgentRegistry;
    window.Orchestrator = Orchestrator;
    window.AgentSystem = AgentSystem;
    window.__agentSystem = null;
})();
