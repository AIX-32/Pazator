const PERSON_ID_SEQUENCE_KEY = 'pziIdSequence';
let personIdSequence = 1;
loadPersonIdSequence();

function loadPersonIdSequence() {
    const stored = localStorage.getItem(PERSON_ID_SEQUENCE_KEY);
    if (stored) {
        const parsed = parseInt(stored, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
            personIdSequence = parsed;
            return;
        }
    }
    personIdSequence = 1;
}

function persistPersonIdSequence() {
    localStorage.setItem(PERSON_ID_SEQUENCE_KEY, personIdSequence.toString());
}

function extractSequenceFromId(id) {
    if (!id) return 0;
    const match = id.match(/^PZI(\d+)(\d{2})$/);
    if (!match) return 0;
    return parseInt(match[1], 10) || 0;
}

function updatePersonIdSequenceFromData() {
    let maxSeen = 0;
    pazatorData.humans.forEach(human => {
        const seq = extractSequenceFromId(human.id);
        if (seq > maxSeen) {
            maxSeen = seq;
        }
    });
    personIdSequence = Math.max(personIdSequence, maxSeen + 1, 1);
    persistPersonIdSequence();
}

function getNextPersonSequence() {
    const value = personIdSequence;
    personIdSequence += 1;
    persistPersonIdSequence();
    return value;
}

function computeAge(birthDate) {
    if (!birthDate) return 0;
    const dob = new Date(birthDate);
    if (Number.isNaN(dob.getTime())) return 0;
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const monthDiff = now.getMonth() - dob.getMonth();
    const dateDiff = now.getDate() - dob.getDate();
    if (monthDiff < 0 || (monthDiff === 0 && dateDiff < 0)) {
        age -= 1;
    }
    return Math.max(age, 0);
}

function generatePersonId(name, birthDate) {
    const seq = getNextPersonSequence();
    const seqStr = String(seq).padStart(4, '0');
    const age = computeAge(birthDate);
    const ageStr = String(age).padStart(2, '0');
    return `PZI${seqStr}${ageStr}`;
}

function generateOtherId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `OTH-${crypto.randomUUID()}`;
    }
    return `OTH-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

var PazatorVectorSearch = {
    _index: null,
    _docCount: 0,

    _tokenize: function (text) {
        return (text || '').toLowerCase().split(/[^a-zA-Z0-9\u0600-\u06FF\s]+/).filter(Boolean);
    },

    _computeTF: function (tokens) {
        var tf = {};
        for (var i = 0; i < tokens.length; i++) {
            tf[tokens[i]] = (tf[tokens[i]] || 0) + 1;
        }
        var maxFreq = 0;
        for (var t in tf) { if (tf[t] > maxFreq) maxFreq = tf[t]; }
        if (maxFreq > 0) {
            for (var t in tf) tf[t] = tf[t] / maxFreq;
        }
        return tf;
    },

    buildIndex: function (documents) {
        this._index = {};
        this._docCount = documents.length;
        var df = {};
        for (var di = 0; di < documents.length; di++) {
            var doc = documents[di];
            var text = '';
            for (var key in doc) {
                if (typeof doc[key] === 'string') text += ' ' + doc[key];
                if (Array.isArray(doc[key])) text += ' ' + doc[key].join(' ');
            }
            var tokens = this._tokenize(text);
            var unique = {};
            for (var ti = 0; ti < tokens.length; ti++) unique[tokens[ti]] = true;
            for (var tok in unique) df[tok] = (df[tok] || 0) + 1;
        }
        for (var di = 0; di < documents.length; di++) {
            var doc = documents[di];
            var text = '';
            for (var key in doc) {
                if (typeof doc[key] === 'string') text += ' ' + doc[key];
                if (Array.isArray(doc[key])) text += ' ' + doc[key].join(' ');
            }
            var tokens = this._tokenize(text);
            var tf = this._computeTF(tokens);
            var vector = {};
            for (var tok in tf) {
                var idf = Math.log((this._docCount + 1) / ((df[tok] || 0) + 1)) + 1;
                vector[tok] = tf[tok] * idf;
            }
            this._index[di] = vector;
        }
    },

    search: function (query, topK) {
        if (!this._index || this._docCount === 0) return [];
        topK = topK || 10;
        var queryTokens = this._tokenize(query);
        var queryTF = this._computeTF(queryTokens);
        var scores = [];
        for (var di = 0; di < this._docCount; di++) {
            var vector = this._index[di];
            if (!vector) continue;
            var dot = 0, magA = 0, magB = 0;
            for (var tok in queryTF) {
                var val = vector[tok] || 0;
                dot += queryTF[tok] * val;
                magA += queryTF[tok] * queryTF[tok];
            }
            for (var tok in vector) magB += vector[tok] * vector[tok];
            magA = Math.sqrt(magA);
            magB = Math.sqrt(magB);
            var score = (magA > 0 && magB > 0) ? dot / (magA * magB) : 0;
            scores.push({ index: di, score: score });
        }
        scores.sort(function (a, b) { return b.score - a.score; });
        return scores.slice(0, topK).filter(function (s) { return s.score > 0.05; });
    },

    findSimilar: function (docIndex, topK) {
        if (!this._index || !this._index[docIndex]) return [];
        topK = topK || 5;
        var queryVector = this._index[docIndex];
        var scores = [];
        for (var di = 0; di < this._docCount; di++) {
            if (di === docIndex) continue;
            var vector = this._index[di];
            if (!vector) continue;
            var dot = 0, magA = 0, magB = 0;
            for (var tok in queryVector) {
                var val = vector[tok] || 0;
                dot += queryVector[tok] * val;
                magA += queryVector[tok] * queryVector[tok];
            }
            for (var tok in vector) magB += vector[tok] * vector[tok];
            magA = Math.sqrt(magA);
            magB = Math.sqrt(magB);
            var score = (magA > 0 && magB > 0) ? dot / (magA * magB) : 0;
            scores.push({ index: di, score: score });
        }
        scores.sort(function (a, b) { return b.score - a.score; });
        return scores.slice(0, topK).filter(function (s) { return s.score > 0.1; });
    }
};

var PazatorWorker = {
    _worker: null,
    _callbacks: {},
    _idCounter: 0,
    _ensureWorker: function () {
        if (this._worker) return;
        try {
            this._worker = new Worker('js/core/worker.js');
            var self = this;
            this._worker.onmessage = function (e) {
                var msg = e.data;
                var cb = self._callbacks[msg.id];
                if (cb) {
                    delete self._callbacks[msg.id];
                    if (msg.error) {
                        cb.reject(new Error(msg.error));
                    } else {
                        cb.resolve(msg.result);
                    }
                }
            };
            this._worker.onerror = function (e) {
                console.error('Worker error:', e);
            };
        } catch (e) {
            console.warn('Web Workers not available, falling back to main thread:', e);
            this._worker = null;
        }
    },

    _post: function (msg) {
        return new Promise(function (resolve, reject) {
            if (!PazatorWorker._worker) {
                reject(new Error('Worker not available'));
                return;
            }
            var id = ++PazatorWorker._idCounter;
            msg.id = id;
            PazatorWorker._callbacks[id] = { resolve: resolve, reject: reject };
            PazatorWorker._worker.postMessage(msg);
        });
    },

    parseCSV: function (text) {
        this._ensureWorker();
        if (!this._worker) return Promise.resolve(this._fallbackParseCSV(text));
        return this._post({ type: 'parse_csv', text: text });
    },

    calculateCredits: function (humans) {
        this._ensureWorker();
        if (!this._worker) return Promise.resolve(this._fallbackCalculateCredits(humans));
        return this._post({ type: 'calculate_credits', humans: humans });
    },

    findConnections: function (humans, personName) {
        this._ensureWorker();
        if (!this._worker) return Promise.resolve(this._fallbackFindConnections(humans, personName));
        return this._post({ type: 'find_connections', humans: humans, personName: personName });
    },

    deduplicateChats: function (chats) {
        this._ensureWorker();
        if (!this._worker) return Promise.resolve(this._fallbackDeduplicateChats(chats));
        return this._post({ type: 'deduplicate_chats', chats: chats });
    },

    search: function (data, query, fields) {
        this._ensureWorker();
        if (!this._worker) return Promise.resolve(this._fallbackSearch(data, query, fields));
        return this._post({ type: 'search', data: data, query: query, fields: fields });
    },

    graphTick: function (nodes, edges, width, height, iterations) {
        this._ensureWorker();
        if (!this._worker) return Promise.resolve([]);
        return this._post({ type: 'graph_tick', nodes: nodes, edges: edges, width: width, height: height, iterations: iterations || 50 });
    },

    heuristicsScan: function (humans, threshold) {
        this._ensureWorker();
        if (!this._worker) return Promise.resolve({ matches: [], total: 0 });
        return this._post({ type: 'heuristics_scan', humans: humans, threshold: threshold || 0.8 });
    },

    bulkTransform: function (items, transform) {
        this._ensureWorker();
        if (!this._worker) return Promise.resolve([]);
        return this._post({ type: 'bulk_transform', items: items, transform: transform });
    },

    aggregateStats: function (humans, others) {
        this._ensureWorker();
        if (!this._worker) return Promise.resolve({});
        return this._post({ type: 'aggregate_stats', humans: humans, others: others });
    },

    terminate: function () {
        if (this._worker) {
            this._worker.terminate();
            this._worker = null;
        }
        this._callbacks = {};
    },

    _fallbackParseCSV: function (text) {
        var lines = text.split('\n').filter(function (l) { return l.trim(); });
        if (!lines.length) return { headers: [], rows: [] };
        var headers = lines[0].split(',').map(function (h) { return h.trim(); });
        var rows = [];
        for (var i = 1; i < lines.length; i++) {
            var vals = lines[i].split(',').map(function (v) { return v.trim(); });
            if (vals.length === headers.length) {
                var obj = {};
                for (var j = 0; j < headers.length; j++) {
                    obj[headers[j]] = vals[j];
                }
                rows.push(obj);
            }
        }
        return { headers: headers, rows: rows, total: lines.length - 1 };
    },

    _fallbackCalculateCredits: function (humans) {
        return (humans || []).map(function (h) {
            return { id: h.id, credit: typeof calculateCreditScore === 'function' ? calculateCreditScore(h) : 185 };
        });
    },

    _fallbackFindConnections: function (humans, personName) {
        var name = (personName || '').toLowerCase();
        var people = name ? humans.filter(function (h) { return h.name && h.name.toLowerCase().includes(name); }) : humans;
        var connections = [];
        var limit = Math.min(people.length, 20);
        for (var i = 0; i < limit; i++) {
            for (var j = i + 1; j < limit; j++) {
                var a = people[i], b = people[j];
                var reasons = [];
                if (a.workplace && b.workplace && a.workplace.toLowerCase() === b.workplace.toLowerCase()) reasons.push('same workplace: ' + a.workplace);
                if (a.nationality && b.nationality && a.nationality.toLowerCase() === b.nationality.toLowerCase()) reasons.push('same nationality: ' + a.nationality);
                if (a.tags && b.tags) {
                    var shared = a.tags.filter(function (t) { return b.tags.indexOf(t) !== -1; });
                    if (shared.length > 0) reasons.push('shared tags: ' + shared.join(', '));
                }
                if (reasons.length > 0) connections.push({ person_a: a.name, person_b: b.name, reasons: reasons, strength: reasons.length });
            }
        }
        connections.sort(function (x, y) { return y.strength - x.strength; });
        return { count: connections.length, connections: connections.slice(0, 20) };
    },

    _fallbackDeduplicateChats: function (chats) {
        var seen = new Set();
        var unique = [];
        var removed = 0;
        for (var i = 0; i < chats.length; i++) {
            var key = (chats[i].source || '') + '|' + (chats[i].content || '').substring(0, 200);
            if (seen.has(key)) removed++;
            else { seen.add(key); unique.push(chats[i]); }
        }
        return { unique: unique, removed: removed };
    },

    _fallbackSearch: function (data, query, fields) {
        var q = (query || '').toLowerCase();
        if (!q) return data.slice();
        var results = [];
        for (var i = 0; i < data.length; i++) {
            var match = false;
            for (var fi = 0; fi < fields.length && !match; fi++) {
                var val = data[i][fields[fi]];
                if (!val) continue;
                if (Array.isArray(val)) {
                    for (var vi = 0; vi < val.length && !match; vi++) {
                        if (String(val[vi]).toLowerCase().includes(q)) match = true;
                    }
                } else if (String(val).toLowerCase().includes(q)) {
                    match = true;
                }
            }
            if (match) results.push(data[i]);
        }
        return results;
    }
};
