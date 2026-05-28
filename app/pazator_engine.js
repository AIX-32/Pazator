(function () {
    'use strict';

    var DB_NAME = 'PazatorV2';
    var DB_VERSION = 2;
    var CACHE_READY = false;

    var db = null;
    var initPromise = null;

    var stores = {
        humans: 'humans',
        others: 'others',
        tags: 'tags',
        cases: 'cases',
        chats: 'chats',
        meta: 'meta',
        relationships: 'relationships'
    };

    function openDB() {
        return new Promise(function (resolve, reject) {
            try {
                var request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = function (e) {
                    var d = e.target.result;
                    for (var key in stores) {
                        if (!d.objectStoreNames.contains(stores[key])) {
                            var store = d.createObjectStore(stores[key], { keyPath: 'id' });
                            if (key === 'humans') {
                                store.createIndex('name', 'name', { unique: false });
                                store.createIndex('threatLevel', 'threatLevel', { unique: false });
                                store.createIndex('credit', 'credit', { unique: false });
                            }
                            if (key === 'chats') {
                                store.createIndex('source', 'source', { unique: false });
                                store.createIndex('timestamp', 'timestamp', { unique: false });
                            }
                            if (key === 'meta') {
                            }
                        }
                    }
                    if (!d.objectStoreNames.contains('kv')) {
                        d.createObjectStore('kv');
                    }
                };
                request.onsuccess = function (e) {
                    db = e.target.result;
                    if (!db.objectStoreNames.contains('kv')) {
                        resolve(db);
                        return;
                    }
                    migrateFromOldDB().then(function () {
                        resolve(db);
                    }).catch(function () {
                        resolve(db);
                    });
                };
                request.onerror = function (e) { reject(e.target.error); };
                request.onblocked = function () { reject(new Error('IndexedDB blocked')); };
            } catch (err) {
                reject(err);
            }
        });
    }

    function migrateFromOldDB() {
        return new Promise(function (resolve, reject) {
            try {
                var tx = db.transaction('kv', 'readonly');
                var store = tx.objectStore('kv');
                var req = store.get('pazatorData');
                req.onsuccess = function (e) {
                    var raw = e.target.result;
                    if (!raw) { resolve(); return; }
                    try {
                        var data = typeof raw === 'string' ? JSON.parse(raw) : raw;
                        if (data && data.pazatorData) {
                            if (Array.isArray(data.pazatorData.humans)) {
                                data.pazatorData.humans.forEach(function (h) {
                                    if (h && h.id) engine.put('humans', h).catch(function () { });
                                });
                            }
                            if (Array.isArray(data.pazatorData.others)) {
                                data.pazatorData.others.forEach(function (o) {
                                    if (o && o.id) engine.put('others', o).catch(function () { });
                                });
                            }
                            if (Array.isArray(data.tags)) {
                                engine.put('tags', { id: '_tags', list: data.tags }).catch(function () { });
                            }
                            if (Array.isArray(data.cases)) {
                                data.cases.forEach(function (c) {
                                    if (c && c.id) engine.put('cases', c).catch(function () { });
                                });
                            }
                        }
                        var delTx = db.transaction('kv', 'readwrite');
                        delTx.objectStore('kv').delete('pazatorData');
                        delTx.oncomplete = function () { resolve(); };
                        delTx.onerror = function () { resolve(); };
                    } catch (parseErr) { resolve(); }
                };
                req.onerror = function () { resolve(); };
            } catch (e) { resolve(); }
        });
    }

    function dbGetAll(storeName) {
        if (!db) return Promise.resolve([]);
        return new Promise(function (resolve, reject) {
            try {
                var tx = db.transaction(storeName, 'readonly');
                var req = tx.objectStore(storeName).getAll();
                req.onsuccess = function () { resolve(req.result || []); };
                req.onerror = function (e) { reject(e.target.error); };
            } catch (err) { reject(err); }
        });
    }

    function dbGetAllByCursor(storeName, onItem, onComplete) {
        if (!db) { onComplete([]); return; }
        try {
            var tx = db.transaction(storeName, 'readonly');
            var req = tx.objectStore(storeName).openCursor();
            var results = [];
            req.onsuccess = function (e) {
                var cursor = e.target.result;
                if (cursor) {
                    if (onItem) onItem(cursor.value);
                    results.push(cursor.value);
                    cursor.continue();
                } else {
                    if (onComplete) onComplete(results);
                }
            };
            req.onerror = function () { if (onComplete) onComplete([]); };
        } catch (e) { if (onComplete) onComplete([]); }
    }

    function dbGetPage(storeName, page, pageSize, filterFn, sortFn) {
        if (!db) return Promise.resolve({ items: [], total: 0 });
        return new Promise(function (resolve) {
            dbGetAll(storeName).then(function (all) {
                if (filterFn) all = all.filter(filterFn);
                if (sortFn) all.sort(sortFn);
                var total = all.length;
                var start = (page - 1) * pageSize;
                var items = all.slice(start, start + pageSize);
                resolve({ items: items, total: total });
            });
        });
    }

    function getStoreOrIndex(storeName, indexName) {
        var tx = db.transaction(storeName, 'readonly');
        var store = tx.objectStore(storeName);
        return indexName ? store.index(indexName) : store;
    }

    var engine = {
        ready: function () { return initPromise; },
        isReady: function () { return db !== null; },

        init: function () {
            if (initPromise) return initPromise;
            initPromise = openDB();
            return initPromise;
        },

        getAll: function (storeName) {
            return dbGetAll(storeName);
        },

        getPage: function (storeName, page, pageSize, filterFn, sortFn) {
            page = Math.max(1, page);
            pageSize = Math.min(100, Math.max(1, pageSize));
            return dbGetAll(storeName).then(function (all) {
                if (filterFn) all = all.filter(filterFn);
                if (sortFn) all.sort(sortFn);
                var total = all.length;
                var start = (page - 1) * pageSize;
                var items = all.slice(start, start + pageSize);
                return {
                    items: items, total: total, page: page, pageSize: pageSize,
                    totalPages: Math.ceil(total / pageSize),
                    hasNext: start + pageSize < total, hasPrev: page > 1
                };
            });
        },

        get: function (storeName, id) {
            if (!db) return Promise.resolve(null);
            return new Promise(function (resolve, reject) {
                try {
                    var tx = db.transaction(storeName, 'readonly');
                    var req = tx.objectStore(storeName).get(id);
                    req.onsuccess = function () { resolve(req.result || null); };
                    req.onerror = function (e) { reject(e.target.error); };
                } catch (err) { reject(err); }
            });
        },

        put: function (storeName, value) {
            if (!db) return Promise.resolve();
            return new Promise(function (resolve, reject) {
                try {
                    var tx = db.transaction(storeName, 'readwrite');
                    tx.objectStore(storeName).put(value);
                    tx.oncomplete = function () { resolve(); };
                    tx.onerror = function (e) { reject(e.target.error); };
                } catch (err) { reject(err); }
            });
        },

        putMany: function (storeName, values) {
            if (!db || !values.length) return Promise.resolve();
            return new Promise(function (resolve, reject) {
                try {
                    var tx = db.transaction(storeName, 'readwrite');
                    var store = tx.objectStore(storeName);
                    values.forEach(function (v) { store.put(v); });
                    tx.oncomplete = function () { resolve(); };
                    tx.onerror = function (e) { reject(e.target.error); };
                } catch (err) { reject(err); }
            });
        },

        remove: function (storeName, id) {
            if (!db) return Promise.resolve();
            return new Promise(function (resolve, reject) {
                try {
                    var tx = db.transaction(storeName, 'readwrite');
                    tx.objectStore(storeName).delete(id);
                    tx.oncomplete = function () { resolve(); };
                    tx.onerror = function (e) { reject(e.target.error); };
                } catch (err) { reject(err); }
            });
        },

        clear: function (storeName) {
            if (!db) return Promise.resolve();
            return new Promise(function (resolve, reject) {
                try {
                    var tx = db.transaction(storeName, 'readwrite');
                    tx.objectStore(storeName).clear();
                    tx.oncomplete = function () { resolve(); };
                    tx.onerror = function (e) { reject(e.target.error); };
                } catch (err) { reject(err); }
            });
        },

        count: function (storeName) {
            if (!db) return Promise.resolve(0);
            return new Promise(function (resolve, reject) {
                try {
                    var tx = db.transaction(storeName, 'readonly');
                    var req = tx.objectStore(storeName).count();
                    req.onsuccess = function () { resolve(req.result); };
                    req.onerror = function (e) { reject(e.target.error); };
                } catch (err) { reject(err); }
            });
        },

        bulkRemove: function (storeName, ids) {
            if (!db || !ids.length) return Promise.resolve();
            return new Promise(function (resolve, reject) {
                try {
                    var tx = db.transaction(storeName, 'readwrite');
                    var store = tx.objectStore(storeName);
                    ids.forEach(function (id) { store.delete(id); });
                    tx.oncomplete = function () { resolve(); };
                    tx.onerror = function (e) { reject(e.target.error); };
                } catch (err) { reject(err); }
            });
        },

        query: function (storeName, indexName, value, limit) {
            if (!db) return Promise.resolve([]);
            limit = limit || 50;
            return new Promise(function (resolve, reject) {
                try {
                    var source = getStoreOrIndex(storeName, indexName);
                    var range = IDBKeyRange.only(value);
                    var req = source.getAll(range, limit);
                    req.onsuccess = function () { resolve(req.result || []); };
                    req.onerror = function (e) { reject(e.target.error); };
                } catch (err) { reject(err); }
            });
        }
    };

    window.pazatorEngine = engine;
    engine.init().catch(function (err) {
        console.warn('PazatorEngine init failed:', err);
    });
})();
