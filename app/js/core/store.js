(function () {
    'use strict';

    const STORES = ['humans', 'others', 'tags', 'cases', 'chats'];

    const listeners = new Map();
    let batchDepth = 0;
    const pendingNotifications = [];
    let needsRebuild = false;
    let suppressNotifications = false;
    const dirtyStores = new Set();
    let saveTimeout = null;

    const aggregateCache = {};

    const STORE_DEPENDS = {
        humans: ['threatCounts', 'creditRisk', 'totalHumans', 'totalObjects', 'avgCredit', 'highRiskCount'],
        others: ['totalOthers', 'totalObjects'],
        tags: [],
        cases: ['caseStatuses'],
        chats: [],
    };

    function isFn(fn) {
        return typeof fn === 'function';
    }

    function getEngine() {
        const e = window.pazatorEngine;
        return e && isFn(e.isReady) && e.isReady() ? e : null;
    }

    function safeArray(arr) {
        return arr || [];
    }

    function replaceArrayContents(target, source) {
        target.splice(0, target.length, ...(source || []));
    }

    function afterMutate(key, action, args, changedItems, changeAction) {
        if (suppressNotifications) return;
        invalidateCache(key);
        if (key === 'humans' || key === 'others') {
            if (batchDepth > 0) {
                needsRebuild = true;
            } else {
                store.rebuildIndexes();
            }
        }
        store.markDirty(key);
        store.emit(key + '_changed', { action, args });
        store.emit('data_changed', { store: key, action });
        if (changedItems && changeAction) {
            for (const item of changedItems) {
                if (item && item.id) {
                    store.emit('entity_changed', { id: item.id, type: key, action: changeAction });
                }
            }
        }
    }

    const MUTATION_META = {
        push:    { args: true,  items: 'args',   action: 'added' },
        pop:     { args: false, items: 'result',  action: 'removed' },
        splice:  { args: true,  items: 'removed', action: 'removed' },
        shift:   { args: false, items: 'result',  action: 'removed' },
        unshift: { args: true,  items: 'args',    action: 'added' },
        sort:    { args: true,  items: null,      action: 'modified' },
        reverse: { args: false, items: null,      action: 'modified' },
        fill:    { args: true,  items: null,      action: 'modified' },
        copyWithin: { args: true, items: null,    action: 'modified' },
    };
    const CHAINABLE = new Set(['sort', 'reverse', 'fill', 'copyWithin']);

    function wrapArray(key, arr) {
        const orig = {};
        for (const m of Object.keys(MUTATION_META)) {
            orig[m] = arr[m].bind(arr);
        }

        return new Proxy(arr, {
            get(target, prop, receiver) {
                const meta = MUTATION_META[prop];
                if (meta) {
                    return function (...args) {
                        const result = orig[prop](...args);
                        let changedItems = null;
                        if (meta.items === 'args') {
                            changedItems = args;
                        } else if (meta.items === 'result') {
                            changedItems = result != null ? [result] : null;
                        } else if (meta.items === 'removed') {
                            changedItems = result && result.length ? [...result] : null;
                        }
                        afterMutate(key, prop, args, changedItems, meta.action);
                        return CHAINABLE.has(prop) ? this : result;
                    };
                }
                return Reflect.get(target, prop, receiver);
            },

            set(target, prop, value, receiver) {
                const oldVal = target[prop];
                const result = Reflect.set(target, prop, value, receiver);
                if (result && prop !== 'length' && oldVal !== value) {
                    afterMutate(key, 'set', [prop, value], null, 'modified');
                }
                return result;
            },

            deleteProperty(target, prop) {
                const result = Reflect.deleteProperty(target, prop);
                if (result) {
                    afterMutate(key, 'delete', [prop], null, 'removed');
                }
                return result;
            },
        });
    }

    const AGGREGATES = {
        threatCounts: {
            compute() {
                const counts = { None: 0, Low: 0, Medium: 0, High: 0, Critical: 0 };
                for (const h of safeArray(store._data.humans)) {
                    const t = h.threatLevel || 'None';
                    counts[t] = (counts[t] || 0) + 1;
                }
                return counts;
            }
        },
        creditRisk: {
            compute() {
                const risk = { high: 0, medium: 0, low: 0 };
                for (const h of safeArray(store._data.humans)) {
                    const c = h.credit || 185;
                    if (c < 125) risk.high++;
                    else if (c < 250) risk.medium++;
                    else risk.low++;
                }
                return risk;
            }
        },
        caseStatuses: {
            compute() {
                const statuses = {};
                for (const c of safeArray(store._data.cases)) {
                    const s = c.status || 'open';
                    statuses[s] = (statuses[s] || 0) + 1;
                }
                return statuses;
            }
        },
        totalHumans: { compute() { return safeArray(store._data.humans).length; } },
        totalOthers: { compute() { return safeArray(store._data.others).length; } },
        totalObjects: { compute() { return store._objectIndex.size; } },
        avgCredit: {
            compute() {
                const humans = safeArray(store._data.humans);
                return humans.length > 0
                    ? Math.round(humans.reduce((s, h) => s + (h.credit || 185), 0) / humans.length)
                    : 0;
            }
        },
        highRiskCount: {
            compute() {
                let count = 0;
                for (const h of safeArray(store._data.humans)) {
                    const t = h.threatLevel || 'None';
                    if (t === 'High' || t === 'Critical') count++;
                }
                return count;
            }
        }
    };

    function invalidateCache(storeName) {
        if (storeName) {
            const depends = STORE_DEPENDS[storeName];
            if (depends) {
                for (const key of depends) {
                    delete aggregateCache[key];
                }
            }
        } else {
            for (const key of Object.keys(AGGREGATES)) {
                delete aggregateCache[key];
            }
        }
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

        on(event, handler) {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event).add(handler);
            return () => {
                const set = listeners.get(event);
                if (set) set.delete(handler);
            };
        },

        emit(event, payload) {
            if (batchDepth > 0) {
                pendingNotifications.push({ event, payload });
                return;
            }
            const set = listeners.get(event);
            if (!set) return;
            for (const fn of set) {
                try { fn(payload); } catch (e) { console.error('[Store] handler error', e); }
            }
        },

        batch(fn) {
            batchDepth++;
            try {
                fn();
            } catch (e) {
                batchDepth = 0;
                const notifications = pendingNotifications.slice();
                pendingNotifications.length = 0;
                for (const n of notifications) {
                    store.emit(n.event, n.payload);
                }
                throw e;
            } finally {
                batchDepth--;
                if (batchDepth === 0) {
                    if (needsRebuild) {
                        store.rebuildIndexes();
                        needsRebuild = false;
                    }
                    const notifications = pendingNotifications.slice();
                    pendingNotifications.length = 0;
                    for (const n of notifications) {
                        store.emit(n.event, n.payload);
                    }
                }
            }
        },

        rebuildIndexes() {
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

        getHumanById(id) {
            if (!store._cacheReady) store.rebuildIndexes();
            return store._humanIndex.get(id) || null;
        },

        getHumanByName(name) {
            if (!store._cacheReady) store.rebuildIndexes();
            const key = String(name || '').toLowerCase().trim().replace(/\s+/g, ' ');
            const id = store._nameIndex.get(key);
            if (id) return store._humanIndex.get(id) || null;
            let result = null;
            for (const [k, val] of store._nameIndex) {
                if (!result && k.includes(key)) result = store._humanIndex.get(val) || null;
            }
            return result;
        },

        getObjectById(id) {
            if (!store._cacheReady) store.rebuildIndexes();
            return store._objectIndex.get(id) || null;
        },

        getObjectType(obj) {
            if (!obj) return null;
            return obj.objectType || 'Unknown';
        },

        getRelatedObjects(id) {
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
                for (const fid of obj.friends) {
                    pushUnique(store.getObjectById(fid), 'friend');
                }
            }
            if (obj.family) {
                for (const mid of obj.family) {
                    pushUnique(store.getObjectById(mid), 'family');
                }
            }
            if (window.pazatorRelationships && isFn(window.pazatorRelationships.getForEntity)) {
                const rels = window.pazatorRelationships.getForEntity(id, store.getObjectType(obj));
                for (const r of rels) {
                    const otherId = r.sourceId === id ? r.targetId : r.sourceId;
                    pushUnique(store.getObjectById(otherId), r.type, r.notes);
                }
            }
            return results;
        },

        searchObjects(query, limit) {
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
                if (obj.name.toLowerCase().includes(query)) {
                    results.push(obj);
                    seen.add(obj.id);
                }
            }
            return results;
        },

        findHumans(predicate) {
            const results = [];
            for (const h of store._data.humans || []) {
                if (predicate(h)) results.push(h);
            }
            return results;
        },

        findHumanIndex(predicate) {
            const humans = store._data.humans || [];
            for (let i = 0; i < humans.length; i++) {
                if (predicate(humans[i])) return i;
            }
            return -1;
        },

        findHumanIndexById(id) {
            if (!store._cacheReady) store.rebuildIndexes();
            const index = store._humanIdToIndex.get(id);
            return index !== undefined ? index : -1;
        },

        syncToEngine() {
            const eng = getEngine();
            if (!eng) return Promise.resolve();
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
            return Promise.all(p).catch(e => console.error('[Store] syncToEngine error', e));
        },

        loadFromEngine() {
            const eng = getEngine();
            if (!eng) return Promise.resolve();
            const self = this;
            suppressNotifications = true;
            return Promise.all([
                eng.getAll('humans'),
                eng.getAll('others'),
                eng.get('tags', '_tags'),
                eng.getAll('cases'),
                eng.getAll('chats'),
                eng.getAll('relationships')
            ]).then(function (results) {
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
                suppressNotifications = false;
                invalidateCache();
                self.rebuildIndexes();
                self.emit('data_loaded', { humans: self._data.humans.length, others: self._data.others.length });
                return self._data;
            }).catch(function (e) {
                suppressNotifications = false;
                console.error('[Store] loadFromEngine error', e);
            });
        },

        getAggregate(name) {
            const def = AGGREGATES[name];
            if (!def) return null;
            if (!(name in aggregateCache)) {
                aggregateCache[name] = def.compute();
            }
            return aggregateCache[name];
        },

        getData() {
            const d = this._data;
            return {
                humans: [...d.humans],
                others: [...d.others],
                tags: [...d.tags],
                cases: [...d.cases],
                chats: [...d.chats],
            };
        },

        getSnapshot() {
            const d = this._data;
            return {
                humans: [...d.humans],
                others: [...d.others],
                tags: [...d.tags],
                cases: [...d.cases],
                totalHumans: d.humans.length,
                totalOthers: d.others.length,
                totalObjects: store._objectIndex.size,
                totalItems: d.humans.length + d.others.length
            };
        },

        getAICompatData() {
            const d = this._data;
            const humans = d.humans || [];
            const threatScore = h => {
                const t = h.threatLevel;
                return t === 'Critical' ? 4 : t === 'High' ? 3 : t === 'Medium' ? 2 : t === 'Low' ? 1 : 0;
            };
            const topRisk = humans.slice().sort((a, b) => threatScore(b) - threatScore(a))
                .slice(0, 20)
                .map(h => ({ id: h.id, name: h.name, threatLevel: h.threatLevel || 'None', credit: h.credit }));
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

        getHumansPage(page, pageSize, filter) {
            page = Math.max(1, page);
            pageSize = Math.min(100, Math.max(1, pageSize));
            let humans = store._data.humans;
            if (filter) humans = humans.filter(filter);
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            return {
                items: humans.slice(start, end),
                total: humans.length,
                page,
                pageSize,
                totalPages: Math.ceil(humans.length / pageSize),
                hasNext: end < humans.length,
                hasPrev: page > 1
            };
        },

        getChatsPage(page, pageSize) {
            const chats = store._data.chats || [];
            pageSize = pageSize || 25;
            page = Math.max(1, page);
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            const items = [];
            for (let i = start; i < end && i < chats.length; i++) {
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
                items,
                total: chats.length,
                page,
                pageSize,
                totalPages: Math.ceil(chats.length / pageSize),
                hasNext: end < chats.length,
                hasPrev: page > 1
            };
        },

        loadFullChat(chatId) {
            if (!store._cacheReady) store.rebuildIndexes();
            return store._chatIndex.get(chatId) || null;
        },

        searchHumans(query, fields) {
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

            for (const h of store._data.humans) {
                if (!h || seen.has(h.id) || results.length >= 100) continue;
                let match = false;
                for (const field of fields) {
                    const value = h[field];
                    if (!value) continue;
                    if (Array.isArray(value)) {
                        for (const v of value) {
                            if (String(v).toLowerCase().includes(query)) { match = true; break; }
                        }
                    } else {
                        if (String(value).toLowerCase().includes(query)) { match = true; break; }
                    }
                    if (match) break;
                }
                if (match) {
                    results.push(h);
                    seen.add(h.id);
                }
            }
            return results;
        },

        markDirty(storeName) {
            dirtyStores.add(storeName);
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => store.flushDirty(), 2000);
        },

        flushDirty() {
            const eng = getEngine();
            if (!eng) return;
            const stores = [...dirtyStores];
            dirtyStores.clear();
            for (const sn of stores) {
                if (sn === 'tags') {
                    if (isFn(eng.put)) eng.put('tags', { id: '_tags', list: store._data.tags })
                        .catch(e => console.error('[Store] flushDirty tags error', e));
                } else if (sn === 'relationships') {
                    if (window.pazatorRelationships && isFn(window.pazatorRelationships.toJSON) && isFn(eng.putMany)) {
                        const rels = window.pazatorRelationships.toJSON();
                        if (rels.length) {
                            eng.putMany('relationships', rels)
                                .catch(e => console.error('[Store] flushDirty relationships error', e));
                        }
                    }
                } else {
                    const data = store._data[sn];
                    if (data && data.length && isFn(eng.putMany)) {
                        eng.putMany(sn, data)
                            .catch(e => console.error('[Store] flushDirty ' + sn + ' error', e));
                    }
                }
            }
        },
    };

    // Wrap store arrays with Proxy for full mutation interception
    for (const key of STORES) {
        const arr = store._data[key];
        if (Array.isArray(arr)) {
            store._data[key] = wrapArray(key, arr);
        }
    }

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
                chain = chain.then(() => {
                    try {
                        const val = localStorage.getItem(key);
                        if (val) {
                            let parsed;
                            try { parsed = JSON.parse(val); } catch (e) { parsed = val; }
                            return eng.kvSet(key, parsed).then(() => {
                                migrated++;
                            }).catch(e => {
                                console.error('[Store] migrateToIDB key ' + key + ' error', e);
                            });
                        }
                    } catch (e) { console.error('[Store] migrateToIDB error', e); }
                });
            }
        }
        return chain.then(() => migrated);
    };

    // Flush unsaved changes before the page unloads
    window.addEventListener('beforeunload', function () {
        if (dirtyStores.size > 0) {
            store.flushDirty();
        }
    });

    window.pazatorStore = store;
})();
