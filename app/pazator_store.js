(function () {
    'use strict';

    var listeners = new Map();
    var batchDepth = 0;
    var pendingNotifications = [];

    var store = {
        _data: {
            humans: [],
            others: [],
            tags: [],
            cases: [],
            chats: [],
            relationships: []
        },

        _humanIndex: new Map(),
        _nameIndex: new Map(),
        _cacheReady: false,

        on: function (event, handler) {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event).add(handler);
            return function () {
                var set = listeners.get(event);
                if (set) set.delete(handler);
            };
        },

        emit: function (event, payload) {
            if (batchDepth > 0) {
                pendingNotifications.push({ event: event, payload: payload });
                return;
            }
            var set = listeners.get(event);
            if (!set) return;
            set.forEach(function (fn) {
                try { fn(payload); } catch (e) { console.error('[Store] handler error', e); }
            });
        },

        batch: function (fn) {
            batchDepth++;
            try {
                fn();
            } finally {
                batchDepth--;
                if (batchDepth === 0) {
                    var notifications = pendingNotifications.slice();
                    pendingNotifications = [];
                    notifications.forEach(function (n) {
                        store.emit(n.event, n.payload);
                    });
                }
            }
        },

        rebuildIndexes: function () {
            var idx = new Map();
            var nidx = new Map();
            var humans = store._data.humans || [];
            for (var i = 0; i < humans.length; i++) {
                var h = humans[i];
                if (h && h.id) {
                    idx.set(h.id, h);
                    if (h.name) {
                        var key = h.name.toLowerCase().trim().replace(/\s+/g, ' ');
                        if (!nidx.has(key)) nidx.set(key, h.id);
                    }
                }
            }
            store._humanIndex = idx;
            store._nameIndex = nidx;
            store._cacheReady = true;
        },

        getHumanById: function (id) {
            if (!store._cacheReady) store.rebuildIndexes();
            return store._humanIndex.get(id) || null;
        },

        getHumanByName: function (name) {
            if (!store._cacheReady) store.rebuildIndexes();
            var key = String(name || '').toLowerCase().trim().replace(/\s+/g, ' ');
            var id = store._nameIndex.get(key);
            if (id) return store._humanIndex.get(id) || null;
            var result = null;
            store._nameIndex.forEach(function(val, k) {
                if (!result && k.includes(key)) result = store._humanIndex.get(val) || null;
            });
            return result;
        },

        findHumans: function (predicate) {
            var results = [];
            var humans = store._data.humans || [];
            for (var i = 0; i < humans.length; i++) {
                if (predicate(humans[i])) results.push(humans[i]);
            }
            return results;
        },

        findHumanIndex: function (predicate) {
            var humans = store._data.humans || [];
            for (var i = 0; i < humans.length; i++) {
                if (predicate(humans[i])) return i;
            }
            return -1;
        },

        findHumanIndexById: function (id) {
            var humans = store._data.humans || [];
            for (var i = 0; i < humans.length; i++) {
                if (humans[i] && humans[i].id === id) return i;
            }
            return -1;
        },

        syncToEngine: function () {
            if (!window.pazatorEngine) return;
            var eng = window.pazatorEngine;
            var p = [];
            if (store._data.humans.length) p.push(eng.putMany('humans', store._data.humans));
            if (store._data.others.length) p.push(eng.putMany('others', store._data.others));
            p.push(eng.put('tags', { id: '_tags', list: store._data.tags }));
            if (store._data.cases.length) p.push(eng.putMany('cases', store._data.cases));
            if (store._data.chats.length) p.push(eng.putMany('chats', store._data.chats));
            if (window.pazatorRelationships) {
                var rels = window.pazatorRelationships.toJSON();
                if (rels.length) p.push(eng.putMany('relationships', rels));
            }
            return Promise.all(p).catch(function () {});
        },

        loadFromEngine: function () {
            if (!window.pazatorEngine) return Promise.resolve();
            var eng = window.pazatorEngine;
            var self = this;
            return Promise.all([
                eng.getAll('humans'),
                eng.getAll('others'),
                eng.get('tags', '_tags'),
                eng.getAll('cases'),
                eng.getAll('chats'),
                eng.getAll('relationships')
            ]).then(function (results) {
                self._data.humans = results[0] || [];
                self._data.others = results[1] || [];
                var tagData = results[2];
                self._data.tags = (tagData && tagData.list) || [];
                self._data.cases = results[3] || [];
                self._data.chats = results[4] || [];
                var rels = results[5] || [];
                if (rels.length && window.pazatorRelationships) {
                    window.pazatorRelationships.fromJSON(rels);
                }
                self.rebuildIndexes();
                self.emit('data_loaded', { humans: self._data.humans.length, others: self._data.others.length });
                return self._data;
            });
        },

        getData: function () {
            return this._data;
        },

        getSnapshot: function () {
            var d = this._data;
            return {
                humans: d.humans,
                others: d.others,
                tags: d.tags,
                cases: d.cases,
                totalHumans: d.humans.length,
                totalOthers: d.others.length,
                totalItems: d.humans.length + d.others.length
            };
        },

        getAICompatData: function () {
            var d = this._data;
            var humans = d.humans || [];
            var others = d.others || [];
            var threatScore = function(h) {
                var t = h.threatLevel;
                return t === 'Critical' ? 4 : t === 'High' ? 3 : t === 'Medium' ? 2 : t === 'Low' ? 1 : 0;
            };
            var topRisk = humans.slice(0).sort(function (a, b) {
                return threatScore(b) - threatScore(a);
            }).slice(0, 20).map(function (h) {
                return { id: h.id, name: h.name, threatLevel: h.threatLevel || 'None', credit: h.credit };
            });
            var highRiskCount = humans.filter(function (h) {
                var t = h.threatLevel || 'None';
                return t === 'High' || t === 'Critical';
            }).length;
            var avgCredit = humans.length > 0
                ? Math.round(humans.reduce(function (s, h) { return s + (h.credit || 185); }, 0) / humans.length)
                : 0;
            return {
                totalHumans: humans.length,
                totalEntities: others.length,
                highRiskCount: highRiskCount,
                averageCredit: avgCredit,
                tagCount: (d.tags || []).length,
                casesCount: (d.cases || []).length,
                topRiskyPeople: topRisk
            };
        },

        getHumansPage: function (page, pageSize, filter) {
            page = Math.max(1, page);
            pageSize = Math.min(100, Math.max(1, pageSize));
            var humans = store._data.humans;
            if (filter) humans = humans.filter(filter);
            var start = (page - 1) * pageSize;
            var end = start + pageSize;
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
            var chats = store._data.chats || [];
            pageSize = pageSize || 25;
            page = Math.max(1, page);
            var start = (page - 1) * pageSize;
            var end = Math.min(start + pageSize, chats.length);
            var items = [];
            for (var i = start; i < end; i++) {
                var chat = chats[i];
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
            var chats = store._data.chats || [];
            for (var i = 0; i < chats.length; i++) {
                if (chats[i] && chats[i].id === chatId) return chats[i];
            }
            return null;
        },

        searchHumans: function (query, fields) {
            fields = fields || ['name', 'workplace', 'tags'];
            query = String(query || '').toLowerCase();
            if (!query) return store._data.humans.slice(0, 100);
            var results = [];
            var humans = store._data.humans;
            for (var i = 0; i < humans.length; i++) {
                var h = humans[i];
                if (!h) continue;
                var match = false;
                for (var f = 0; f < fields.length; f++) {
                    var field = fields[f];
                    var value = h[field];
                    if (!value) continue;
                    if (Array.isArray(value)) {
                        for (var v = 0; v < value.length; v++) {
                            if (String(value[v]).toLowerCase().indexOf(query) !== -1) { match = true; break; }
                        }
                    } else {
                        if (String(value).toLowerCase().indexOf(query) !== -1) { match = true; break; }
                    }
                    if (match) break;
                }
                if (match) results.push(h);
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
            if (!window.pazatorEngine) return;
            var stores = Array.from(store._dirtyStores);
            store._dirtyStores.clear();
            for (var s = 0; s < stores.length; s++) {
                var sn = stores[s];
                if (sn === 'tags') {
                    window.pazatorEngine.put('tags', { id: '_tags', list: store._data.tags }).catch(function () {});
                } else if (sn === 'relationships') {
                    if (window.pazatorRelationships) {
                        var rels = window.pazatorRelationships.toJSON();
                        if (rels.length) {
                            window.pazatorEngine.putMany('relationships', rels).catch(function () {});
                        }
                    }
                } else {
                    var data = store._data[sn];
                    if (data && data.length) {
                        window.pazatorEngine.putMany(sn, data).catch(function () {});
                    }
                }
            }
        },
    };

    var initProxy = function () {
        var data = store._data;
        var stores = ['humans', 'others', 'tags', 'cases', 'chats', 'relationships'];
        stores.forEach(function (key) {
            if (Array.isArray(data[key])) {
                var originalPush = data[key].push.bind(data[key]);
                var originalPop = data[key].pop.bind(data[key]);
                var originalSplice = data[key].splice.bind(data[key]);
                var originalShift = data[key].shift.bind(data[key]);
                var originalUnshift = data[key].unshift.bind(data[key]);

                data[key].push = function () {
                    var result = originalPush.apply(this, arguments);
                    if (key === 'humans') store.rebuildIndexes();
                    store.markDirty(key);
                    store.emit(key + '_changed', { action: 'push', items: Array.from(arguments) });
                    store.emit('data_changed', { store: key, action: 'push' });
                    return result;
                };
                data[key].pop = function () {
                    var result = originalPop.apply(this, arguments);
                    if (key === 'humans') store.rebuildIndexes();
                    store.markDirty(key);
                    store.emit(key + '_changed', { action: 'pop' });
                    store.emit('data_changed', { store: key, action: 'pop' });
                    return result;
                };
                data[key].splice = function () {
                    var result = originalSplice.apply(this, arguments);
                    if (key === 'humans') store.rebuildIndexes();
                    store.markDirty(key);
                    store.emit(key + '_changed', { action: 'splice', args: Array.from(arguments) });
                    store.emit('data_changed', { store: key, action: 'splice' });
                    return result;
                };
                data[key].shift = function () {
                    var result = originalShift.apply(this, arguments);
                    if (key === 'humans') store.rebuildIndexes();
                    store.markDirty(key);
                    store.emit(key + '_changed', { action: 'shift' });
                    store.emit('data_changed', { store: key, action: 'shift' });
                    return result;
                };
                data[key].unshift = function () {
                    var result = originalUnshift.apply(this, arguments);
                    if (key === 'humans') store.rebuildIndexes();
                    store.markDirty(key);
                    store.emit(key + '_changed', { action: 'unshift', items: Array.from(arguments) });
                    store.emit('data_changed', { store: key, action: 'unshift' });
                    return result;
                };
            }
        });
    };

    initProxy();

    window.pazatorStore = store;
})();
