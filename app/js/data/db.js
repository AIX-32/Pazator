(function () {
    'use strict';

    var DB_NAME = 'PazatorDB';
    var STORE_NAME = 'kv';
    var DB_VERSION = 1;
    var MIGRATED_KEY = '_pazator_db_migrated';

    var db = null;
    var initPromise = null;

    var native = {
        getItem: localStorage.getItem.bind(localStorage),
        setItem: localStorage.setItem.bind(localStorage),
        removeItem: localStorage.removeItem.bind(localStorage),
        clear: localStorage.clear.bind(localStorage),
        key: localStorage.key.bind(localStorage)
    };
    Object.defineProperty(native, 'length', {
        get: function () { return localStorage.length; }
    });

    var cache = new Map();
    for (var i = 0; i < native.length; i++) {
        var k = native.key(i);
        if (k !== null) {
            cache.set(k, native.getItem(k));
        }
    }

    function openDB() {
        return new Promise(function (resolve, reject) {
            try {
                var request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = function (e) {
                    var d = e.target.result;
                    if (!d.objectStoreNames.contains(STORE_NAME)) {
                        d.createObjectStore(STORE_NAME);
                    }
                };
                request.onsuccess = function (e) { resolve(e.target.result); };
                request.onerror = function (e) { reject(e.target.error); };
                request.onblocked = function () { reject(new Error('IndexedDB blocked')); };
            } catch (err) {
                reject(err);
            }
        });
    }

    function dbPut(key, value) {
        if (!db) return Promise.resolve();
        return new Promise(function (resolve, reject) {
            try {
                var tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).put(value, key);
                tx.oncomplete = function () { resolve(); };
                tx.onerror = function (e) { reject(e.target.error); };
            } catch (err) { reject(err); }
        });
    }

    function dbDelete(key) {
        if (!db) return Promise.resolve();
        return new Promise(function (resolve, reject) {
            try {
                var tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).delete(key);
                tx.oncomplete = function () { resolve(); };
                tx.onerror = function (e) { reject(e.target.error); };
            } catch (err) { reject(err); }
        });
    }

    function dbClear() {
        if (!db) return Promise.resolve();
        return new Promise(function (resolve, reject) {
            try {
                var tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).clear();
                tx.oncomplete = function () { resolve(); };
                tx.onerror = function (e) { reject(e.target.error); };
            } catch (err) { reject(err); }
        });
    }

    function loadCacheFromDB() {
        if (!db) return Promise.resolve();
        return new Promise(function (resolve, reject) {
            try {
                var tx = db.transaction(STORE_NAME, 'readonly');
                var store = tx.objectStore(STORE_NAME);
                var request = store.openCursor();
                request.onsuccess = function (e) {
                    var cursor = e.target.result;
                    if (cursor) {
                        cache.set(cursor.key, cursor.value);
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                request.onerror = function (e) { reject(e.target.error); };
            } catch (err) { reject(err); }
        });
    }

    function migrateLocalStorageToDB() {
        if (!db) return Promise.resolve();
        if (cache.has(MIGRATED_KEY)) return Promise.resolve();

        var entries = Array.from(cache.entries());
        if (entries.length === 0) return Promise.resolve();

        return new Promise(function (resolve, reject) {
            try {
                var tx = db.transaction(STORE_NAME, 'readwrite');
                var store = tx.objectStore(STORE_NAME);
                for (var j = 0; j < entries.length; j++) {
                    var entry = entries[j];
                    if (entry[0] === MIGRATED_KEY) continue;
                    store.put(entry[1], entry[0]);
                }
                store.put('true', MIGRATED_KEY);
                tx.oncomplete = function () { resolve(); };
                tx.onerror = function (e) { reject(e.target.error); };
            } catch (err) { reject(err); }
        });
    }

    window.pazatorDB = {
        init: function () {
            if (initPromise) return initPromise;
            initPromise = this._init();
            return initPromise;
        },

        _init: function () {
            try {
                return openDB().then(function (database) {
                    db = database;
                    return loadCacheFromDB();
                }).then(function () {
                    return migrateLocalStorageToDB();
                }).catch(function (err) {
                    console.warn('PazatorDB: IndexedDB init failed, using localStorage:', err);
                });
            } catch (err) {
                console.warn('PazatorDB: Init error, using localStorage:', err);
                return Promise.resolve();
            }
        },

        getItem: function (key) {
            return Promise.resolve(cache.get(key) !== undefined ? cache.get(key) : null);
        },

        setItem: function (key, value) {
            var str = String(value);
            cache.set(key, str);
            native.setItem(key, str);
            return dbPut(key, str);
        },

        removeItem: function (key) {
            cache.delete(key);
            native.removeItem(key);
            return dbDelete(key);
        },

        clear: function () {
            cache.clear();
            native.clear();
            return dbClear();
        },

        isReady: function () {
            return db !== null;
        }
    };

    window.pazatorDB.init().catch(function (err) {
        console.warn('PazatorDB: Init failed:', err);
    });
})();
