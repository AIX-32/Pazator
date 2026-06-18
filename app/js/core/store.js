(function () {
    'use strict';

    const listeners = new Map();
    let batchDepth = 0;
    const pendingNotifications = [];
    let _needsRebuild = false;

    const _aggregateCache = {};

    // Store → aggregate dependency map: which caches are invalidated by each store's mutation
    const STORE_DEPENDS = {
        humans: ['threatCounts', 'creditRisk', 'totalHumans', 'totalObjects', 'avgCredit', 'highRiskCount'],
        others: ['totalOthers', 'totalObjects'],
        tags: [],
        cases: ['caseStatuses'],
        chats: [],
    };

    const AGGREGATES = {
        threatCounts: {
            init: -1,
            compute: function () {
                const counts = { None: 0, Low: 0, Medium: 0, High: 0, Critical: 0 };
                const humans = store._data.humans || [];
                for (let i = 0; i < humans.length; i++) {
                    const t = humans[i].threatLevel || 'None';
                    counts[t] = (counts[t] || 0) + 1;
                }
                return counts;
            }
        },
        creditRisk: {
            init: -1,
            compute: function () {
                const risk = { high: 0, medium: 0, low: 0 };
                const humans = store._data.humans || [];
                for (let i = 0; i < humans.length; i++) {
                    const c = humans[i].credit || 185;
                    if (c < 125) risk.high++;
                    else if (c < 250) risk.medium++;
                    else risk.low++;
                }
                return risk;
            }
        },
        caseStatuses: {
            init: -1,
            compute: function () {
                const statuses = {};
                const cases = store._data.cases || [];
                for (let i = 0; i < cases.length; i++) {
                    const s = cases[i].status || 'open';
                    statuses[s] = (statuses[s] || 0) + 1;
                }
                return statuses;
            }
        },
        totalHumans: { init: -1, compute: function () { return (store._data.humans || []).length; } },
        totalOthers: { init: -1, compute: function () { return (store._data.others || []).length; } },
        totalObjects: { init: -1, compute: function () { return store._objectIndex.size; } },
        avgCredit: {
            init: -1,
            compute: function () {
                const humans = store._data.humans || [];
                return humans.length > 0
                    ? Math.round(humans.reduce((s, h) => s + (h.credit || 185), 0) / humans.length)
                    : 0;
            }
        },
        highRiskCount: {
            init: -1,
            compute: function () {
                const humans = store._data.humans || [];
                return humans.filter(h => (h.threatLevel || 'None') === 'High' || (h.threatLevel || 'None') === 'Critical').length;
            }
        }
    };

    function invalidateCache(storeName) {
        if (storeName) {
            const depends = STORE_DEPENDS[storeName];
            if (depends) {
                for (let i = 0; i < depends.length; i++) {
                    _aggregateCache[depends[i]] = AGGREGATES[depends[i]].init;
                }
            }
        } else {
            for (const key in AGGREGATES) {
                _aggregateCache[key] = AGGREGATES[key].init;
            }
        }
    }

    function getEngine() {
        return window.pazatorEngine &&
            typeof window.pazatorEngine.isReady === 'function' &&
            window.pazatorEngine.isReady()
            ? window.pazatorEngine
            : null;
    }

    function isFn(fn) {
        return typeof fn === 'function';
    }

    const store = {
        _data: {
            humans: [],
            others: [],
            tags: [],
            cases: [],
            chats: []
        },

        _humanIndex: new Map(),
        _nameIndex: new Map(),
        _objectIndex: new Map(),
        _humanIdToIndex: new Map(),
        _chatIndex: new Map(),
        _cacheReady: false,

        on: function (event, handler) {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event).add(handler);
            return function () {
                const set = listeners.get(event);
                if (set) set.delete(handler);
            };
        },

        emit: function (event, payload) {
            if (batchDepth > 0) {
                pendingNotifications.push({ event: event, payload: payload });
                return;
            }
            const set = listeners.get(event);
            if (!set) return;
            set.forEach(function (fn) {
                try { fn(payload); } catch (e) { console.error('[Store] handler error', e); }
            });
        },

        batch: function (fn) {
            batchDepth++;
            try {
                fn();
            } catch (e) {
                pendingNotifications.length = 0;
                _needsRebuild = false;
                batchDepth = 0;
                throw e;
            } finally {
                batchDepth--;
                if (batchDepth === 0) {
                    if (_needsRebuild) {
                        store.rebuildIndexes();
                        _needsRebuild = false;
                    }
                    const notifications = pendingNotifications.slice();
                    pendingNotifications.length = 0;
                    for (let i = 0; i < notifications.length; i++) {
                        store.emit(notifications[i].event, notifications[i].payload);
                    }
                }
            }
        },

        rebuildIndexes: function () {
            const idx = new Map();
            const nidx = new Map();
            const oidx = new Map();
            const hidx = new Map();
            const cidx = new Map();

            const humans = store._data.humans || [];
            for (let hi = 0; hi < humans.length; hi++) {
                const h = humans[hi];
                if (h && h.id) {
                    idx.set(h.id, h);
                    hidx.set(h.id, hi);
                    if (!h.objectType) h.objectType = 'Person';
                    oidx.set(h.id, h);
                    if (h.name) {
                        const key = h.name.toLowerCase().trim().replace(/\s+/g, ' ');
                        if (!nidx.has(key)) nidx.set(key, h.id);
                    }
                }
            }

            const others = store._data.others || [];
            for (let oi = 0; oi < others.length; oi++) {
                const o = others[oi];
                if (o && o.id) {
                    if (!o.objectType) o.objectType = 'Organization';
                    oidx.set(o.id, o);
                }
            }

            const chats = store._data.chats || [];
            for (let ci = 0; ci < chats.length; ci++) {
                const c = chats[ci];
                if (c && c.id) cidx.set(c.id, c);
            }

            store._humanIndex = idx;
            store._nameIndex = nidx;
            store._objectIndex = oidx;
            store._humanIdToIndex = hidx;
            store._chatIndex = cidx;
            store._cacheReady = true;
        },

        getHumanById: function (id) {
            if (!store._cacheReady) store.rebuildIndexes();
            return store._humanIndex.get(id) || null;
        },

        getHumanByName: function (name) {
            if (!store._cacheReady) store.rebuildIndexes();
            const key = String(name || '').toLowerCase().trim().replace(/\s+/g, ' ');
            const id = store._nameIndex.get(key);
            if (id) return store._humanIndex.get(id) || null;
            let result = null;
            store._nameIndex.forEach(function (val, k) {
                if (!result && k.indexOf(key) !== -1) result = store._humanIndex.get(val) || null;
            });
            return result;
        },

        getObjectById: function (id) {
            if (!store._cacheReady) store.rebuildIndexes();
            return store._objectIndex.get(id) || null;
        },

        getObjectType: function (obj) {
            if (!obj) return null;
            return obj.objectType || 'Unknown';
        },

        getRelatedObjects: function (id) {
            const results = [];
            const seen = new Set();
            const obj = store.getObjectById(id);
            if (!obj) return results;

            function pushUnique(otherObj, rel, details) {
                if (!otherObj || seen.has(otherObj.id)) return;
                seen.add(otherObj.id);
                results.push({ object: otherObj, relationship: rel, details: details || '' });
            }

            if (obj.friends) {
                for (let fi = 0; fi < obj.friends.length; fi++) {
                    pushUnique(store.getObjectById(obj.friends[fi]), 'friend');
                }
            }
            if (obj.family) {
                for (let mi = 0; mi < obj.family.length; mi++) {
                    pushUnique(store.getObjectById(obj.family[mi]), 'family');
                }
            }
            if (window.pazatorRelationships && isFn(window.pazatorRelationships.getForEntity)) {
                const rels = window.pazatorRelationships.getForEntity(id, store.getObjectType(obj));
                for (let ri = 0; ri < rels.length; ri++) {
                    const r = rels[ri];
                    const otherId = r.sourceId === id ? r.targetId : r.sourceId;
                    pushUnique(store.getObjectById(otherId), r.type, r.notes);
                }
            }
            return results;
        },

        searchObjects: function (query, limit) {
            query = String(query || '').toLowerCase().trim();
            limit = limit || 50;
            if (!query) return [];
            const results = [];
            const seen = new Set();

            const exactId = store._nameIndex.get(query);
            if (exactId) {
                const exact = store._humanIndex.get(exactId);
                if (exact) {
                    results.push(exact);
                    seen.add(exact.id);
                }
            }

            for (const obj of store._objectIndex.values()) {
                if (results.length >= limit) break;
                if (!obj || !obj.name || seen.has(obj.id)) continue;
                if (obj.name.toLowerCase().indexOf(query) !== -1) {
                    results.push(obj);
                    seen.add(obj.id);
                }
            }
            return results;
        },

        findHumans: function (predicate) {
            const results = [];
            const humans = store._data.humans || [];
            for (let i = 0; i < humans.length; i++) {
                if (predicate(humans[i])) results.push(humans[i]);
            }
            return results;
        },

        findHumanIndex: function (predicate) {
            const humans = store._data.humans || [];
            for (let i = 0; i < humans.length; i++) {
                if (predicate(humans[i])) return i;
            }
            return -1;
        },

        findHumanIndexById: function (id) {
            if (!store._cacheReady) store.rebuildIndexes();
            const index = store._humanIdToIndex.get(id);
            return index !== undefined ? index : -1;
        },

        syncToEngine: function () {
            const eng = getEngine();
            if (!eng) return;
            const p = [];
            if (store._data.humans.length && isFn(eng.putMany)) p.push(eng.putMany('humans', store._data.humans));
            if (store._data.others.length && isFn(eng.putMany)) p.push(eng.putMany('others', store._data.others));
            if (isFn(eng.put)) p.push(eng.put('tags', { id: '_tags', list: store._data.tags }));
            if (store._data.cases.length && isFn(eng.putMany)) p.push(eng.putMany('cases', store._data.cases));
            if (store._data.chats.length && isFn(eng.putMany)) p.push(eng.putMany('chats', store._data.chats));
            if (window.pazatorRelationships && isFn(window.pazatorRelationships.toJSON) && isFn(eng.putMany)) {
                const rels = window.pazatorRelationships.toJSON();
                if (rels.length) p.push(eng.putMany('relationships', rels));
            }
            return Promise.all(p).catch(function (e) { console.error('[Store] syncToEngine error', e); });
        },

        loadFromEngine: function () {
            const eng = getEngine();
            if (!eng) return Promise.resolve();
            const self = this;
            return Promise.all([
                eng.getAll('humans'),
                eng.getAll('others'),
                eng.get('tags', '_tags'),
                eng.getAll('cases'),
                eng.getAll('chats'),
                eng.getAll('relationships')
            ]).then(function (results) {
                function replaceArrayContents(target, source) {
                    target.length = 0;
                    if (source && source.length) {
                        for (let i = 0; i < source.length; i++) {
                            target.push(source[i]);
                        }
                    }
                }

                replaceArrayContents(self._data.humans, results[0]);
                replaceArrayContents(self._data.others, results[1]);
                const tagData = results[2];
                replaceArrayContents(self._data.tags, (tagData && tagData.list) || []);
                replaceArrayContents(self._data.cases, results[3]);
                replaceArrayContents(self._data.chats, results[4]);
                const rels = results[5] || [];
                if (rels.length && window.pazatorRelationships && isFn(window.pazatorRelationships.fromJSON)) {
                    window.pazatorRelationships.fromJSON(rels);
                }
                invalidateCache();
                self.rebuildIndexes();
                self.emit('data_loaded', { humans: self._data.humans.length, others: self._data.others.length });
                return self._data;
            }).catch(function (e) { console.error('[Store] loadFromEngine error', e); });
        },

        getAggregate: function (name) {
            const cached = _aggregateCache[name];
            const def = AGGREGATES[name];
            if (!def) return null;
            if (cached === def.init) {
                _aggregateCache[name] = def.compute();
            }
            return _aggregateCache[name];
        },

        getData: function () {
            return this._data;
        },

        getSnapshot: function () {
            const d = this._data;
            return {
                humans: d.humans,
                others: d.others,
                tags: d.tags,
                cases: d.cases,
                totalHumans: d.humans.length,
                totalOthers: d.others.length,
                totalObjects: store._objectIndex.size,
                totalItems: d.humans.length + d.others.length
            };
        },

        getAICompatData: function () {
            const d = this._data;
            const humans = d.humans || [];
            const threatScore = function (h) {
                const t = h.threatLevel;
                return t === 'Critical' ? 4 : t === 'High' ? 3 : t === 'Medium' ? 2 : t === 'Low' ? 1 : 0;
            };
            const topRisk = humans.slice(0).sort(function (a, b) {
                return threatScore(b) - threatScore(a);
            }).slice(0, 20).map(function (h) {
                return { id: h.id, name: h.name, threatLevel: h.threatLevel || 'None', credit: h.credit };
            });
            return {
                totalHumans: humans.length,
                totalEntities: (d.others || []).length,
                highRiskCount: store.getAggregate('highRiskCount'),
                averageCredit: store.getAggregate('avgCredit'),
                tagCount: (d.tags || []).length,
                casesCount: (d.cases || []).length,
                topRiskyPeople: topRisk
            };
        },

        getHumansPage: function (page, pageSize, filter) {
            page = Math.max(1, page);
            pageSize = Math.min(100, Math.max(1, pageSize));
            let humans = store._data.humans;
            if (filter) humans = humans.filter(filter);
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            return {
                items: humans.slice(start, end),
                total: humans.length,
                page: page,
                pageSize: pageSize,
                totalPages: Math.ceil(humans.length / pageSize),
                hasNext: end < humans.length,
                hasPrev: page > 1
            };
        },

        getChatsPage: function (page, pageSize) {
            const chats = store._data.chats || [];
            pageSize = pageSize || 25;
            page = Math.max(1, page);
            const start = (page - 1) * pageSize;
            const end = Math.min(start + pageSize, chats.length);
            const items = [];
            for (let i = start; i < end; i++) {
                const chat = chats[i];
                if (!chat) continue;
                items.push({
                    id: chat.id,
                    source: chat.source,
                    participants: chat.participants,
                    timestamp: chat.timestamp,
                    messageCount: (chat.parsed && chat.parsed.messageCount) || (chat.content && chat.content.split(' ').length) || 0,
                    preview: chat.content ? chat.content.substring(0, 150) + '...' : '(empty)',
                    hasContext: !!chat.context
                });
            }
            return {
                items: items,
                total: chats.length,
                page: page,
                pageSize: pageSize,
                totalPages: Math.ceil(chats.length / pageSize),
                hasNext: end < chats.length,
                hasPrev: page > 1
            };
        },

        loadFullChat: function (chatId) {
            if (!store._cacheReady) store.rebuildIndexes();
            return store._chatIndex.get(chatId) || null;
        },

        searchHumans: function (query, fields) {
            fields = fields || ['name', 'workplace', 'tags'];
            query = String(query || '').toLowerCase();
            if (!query) return store._data.humans.slice(0, 100);
            const results = [];
            const seen = new Set();

            const exactId = store._nameIndex.get(query);
            if (exactId) {
                const exact = store._humanIndex.get(exactId);
                if (exact) {
                    results.push(exact);
                    seen.add(exact.id);
                }
            }

            const humans = store._data.humans;
            for (let i = 0; i < humans.length; i++) {
                const h = humans[i];
                if (!h || seen.has(h.id)) continue;
                let match = false;
                for (let f = 0; f < fields.length; f++) {
                    const field = fields[f];
                    const value = h[field];
                    if (!value) continue;
                    if (Array.isArray(value)) {
                        for (let v = 0; v < value.length; v++) {
                            if (String(value[v]).toLowerCase().indexOf(query) !== -1) { match = true; break; }
                        }
                    } else {
                        if (String(value).toLowerCase().indexOf(query) !== -1) { match = true; break; }
                    }
                    if (match) break;
                }
                if (match) {
                    results.push(h);
                    seen.add(h.id);
                }
                if (results.length >= 100) break;
            }
            return results;
        },

        _dirtyStores: new Set(),
        _saveTimeout: null,

        markDirty: function (storeName) {
            store._dirtyStores.add(storeName);
            if (store._saveTimeout) clearTimeout(store._saveTimeout);
            store._saveTimeout = setTimeout(function () { store.flushDirty(); }, 2000);
        },

        flushDirty: function () {
            const eng = getEngine();
            if (!eng) return;
            const stores = [];
            store._dirtyStores.forEach(function (s) { stores.push(s); });
            store._dirtyStores.clear();
            for (let s = 0; s < stores.length; s++) {
                const sn = stores[s];
                if (sn === 'tags') {
                    if (isFn(eng.put)) eng.put('tags', { id: '_tags', list: store._data.tags })
                        .catch(function (e) { console.error('[Store] flushDirty tags error', e); });
                } else if (sn === 'relationships') {
                    if (window.pazatorRelationships && isFn(window.pazatorRelationships.toJSON) && isFn(eng.putMany)) {
                        const rels = window.pazatorRelationships.toJSON();
                        if (rels.length) {
                            eng.putMany('relationships', rels)
                                .catch(function (e) { console.error('[Store] flushDirty relationships error', e); });
                        }
                    }
                } else {
                    const data = store._data[sn];
                    if (data && data.length && isFn(eng.putMany)) {
                        eng.putMany(sn, data)
                            .catch(function (e) { console.error('[Store] flushDirty ' + sn + ' error', e); });
                    }
                }
            }
        },
    };

    (function initProxy() {
        const proxyStores = ['humans', 'others', 'tags', 'cases', 'chats'];

        function afterMutate(key, action, args, changedItems, changeAction) {
            invalidateCache(key);
            if (key === 'humans' || key === 'others') {
                if (batchDepth > 0) {
                    _needsRebuild = true;
                } else {
                    store.rebuildIndexes();
                }
            }
            store.markDirty(key);
            store.emit(key + '_changed', { action: action, args: args });
            store.emit('data_changed', { store: key, action: action });
            if (changedItems && changeAction) {
                for (let i = 0; i < changedItems.length; i++) {
                    if (changedItems[i] && changedItems[i].id) {
                        store.emit('entity_changed', { id: changedItems[i].id, type: key, action: changeAction });
                    }
                }
            }
        }

        for (let pi = 0; pi < proxyStores.length; pi++) {
            const key = proxyStores[pi];
            const arr = store._data[key];
            if (!Array.isArray(arr)) continue;

            const orig = {
                push: arr.push.bind(arr),
                pop: arr.pop.bind(arr),
                splice: arr.splice.bind(arr),
                shift: arr.shift.bind(arr),
                unshift: arr.unshift.bind(arr)
            };

            arr.push = function () {
                const args = Array.prototype.slice.call(arguments);
                const result = orig.push.apply(this, arguments);
                afterMutate(key, 'push', args, args, 'added');
                return result;
            };

            arr.pop = function () {
                const result = orig.pop.apply(this, arguments);
                afterMutate(key, 'pop', [], result ? [result] : null, 'removed');
                return result;
            };

            arr.splice = function () {
                const args = Array.prototype.slice.call(arguments);
                const removed = orig.splice.apply(this, arguments);
                afterMutate(key, 'splice', args, removed.length ? removed : null, 'removed');
                return removed;
            };

            arr.shift = function () {
                const result = orig.shift.apply(this, arguments);
                afterMutate(key, 'shift', [], result ? [result] : null, 'removed');
                return result;
            };

            arr.unshift = function () {
                const args = Array.prototype.slice.call(arguments);
                const result = orig.unshift.apply(this, arguments);
                afterMutate(key, 'unshift', args, args, 'added');
                return result;
            };
        }
    })();

    store.kvGet = function (key) {
        const eng = getEngine();
        if (eng && isFn(eng.kvGet)) {
            return eng.kvGet(key);
        }
        try {
            const val = localStorage.getItem(key);
            return Promise.resolve(val ? JSON.parse(val) : null);
        } catch (e) {
            return Promise.resolve(null);
        }
    };

    store.kvSet = function (key, value) {
        const eng = getEngine();
        if (eng && isFn(eng.kvSet)) {
            return eng.kvSet(key, value);
        }
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return Promise.resolve();
        } catch (e) {
            return Promise.resolve();
        }
    };

    store.kvDelete = function (key) {
        const eng = getEngine();
        if (eng && isFn(eng.kvDelete)) {
            return eng.kvDelete(key);
        }
        try {
            localStorage.removeItem(key);
            return Promise.resolve();
        } catch (e) {
            return Promise.resolve();
        }
    };

    store.migrateToIDB = function () {
        const eng = getEngine();
        if (!eng || !isFn(eng.kvSet)) return Promise.resolve(0);
        const keys = Object.keys(localStorage);
        let migrated = 0;
        let chain = Promise.resolve();
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (key.startsWith('pazator_') || key === 'pazatorData' || key === 'pazatorData_backup') {
                chain = chain.then((function (k) {
                    return function () {
                        try {
                            const val = localStorage.getItem(k);
                            if (val) {
                                let parsed;
                                try { parsed = JSON.parse(val); } catch (e) { parsed = val; }
                return eng.kvSet(k, parsed).then(function () {
                    migrated++;
                }).catch(function (e) {
                    console.error('[Store] migrateToIDB key ' + k + ' error', e);
                });
            }
        } catch (e) { console.error('[Store] migrateToIDB error', e); }
                    };
                })(key));
            }
        }
        return chain.then(function () { return migrated; });
    };

    window.pazatorStore = store;
})();
