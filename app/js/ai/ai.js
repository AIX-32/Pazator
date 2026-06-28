(function () {
    'use strict';

    var AIQueue = {
        _queue: [],
        _running: 0,
        _maxConcurrent: 3,
        _abortControllers: new Map(),
        _cache: new Map(),
        _cacheSize: 50
    };

    function computeHash(obj) {
        var str = typeof obj === 'string' ? obj : JSON.stringify(obj);
        var hash = 2166136261;
        for (var i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = (hash * 16777619) >>> 0;
        }
        return 'h' + hash.toString(36);
    }

    AIQueue.getCached = function (key) {
        var hash = computeHash(key);
        var entry = AIQueue._cache.get(hash);
        if (!entry) return null;
        return entry.result;
    };

    AIQueue.setCached = function (key, result) {
        var hash = computeHash(key);
        if (AIQueue._cache.size >= AIQueue._cacheSize) {
            var firstKey = AIQueue._cache.keys().next().value;
            AIQueue._cache.delete(firstKey);
        }
        AIQueue._cache.set(hash, { result: result, ts: Date.now() });
    };

    AIQueue.clearCache = function () {
        AIQueue._cache.clear();
    };

    AIQueue.enqueue = function (fn, options) {
        return new Promise(function (resolve, reject) {
            var cacheKey = options && options.cacheKey;
            if (cacheKey) {
                var cached = AIQueue.getCached(cacheKey);
                if (cached !== null) {
                    resolve(cached);
                    return;
                }
            }
            var abortController = new AbortController();
            var task = {
                fn: fn,
                resolve: resolve,
                reject: reject,
                abortController: abortController,
                cacheKey: cacheKey,
                id: Date.now() + '_' + Math.random().toString(36).slice(2, 6)
            };
            AIQueue._queue.push(task);
            AIQueue._abortControllers.set(task.id, abortController);
            AIQueue._processQueue();
        });
    };

    AIQueue._processQueue = function () {
        while (AIQueue._running < AIQueue._maxConcurrent && AIQueue._queue.length > 0) {
            var task = AIQueue._queue.shift();
            AIQueue._running++;
            AIQueue._executeTask(task);
        }
    };

    AIQueue._executeTask = function (task) {
        var signal = task.abortController.signal;
        var result;
        try {
            result = task.fn(signal);
        } catch (e) {
            AIQueue._running = Math.max(0, AIQueue._running - 1);
            task.reject(e);
            AIQueue._abortControllers.delete(task.id);
            AIQueue._processQueue();
            return;
        }
        if (result && typeof result.then === 'function') {
            result.then(function (value) {
                if (task.cacheKey) AIQueue.setCached(task.cacheKey, value);
                AIQueue._running = Math.max(0, AIQueue._running - 1);
                task.resolve(value);
                AIQueue._abortControllers.delete(task.id);
                AIQueue._processQueue();
            }, function (err) {
                AIQueue._running = Math.max(0, AIQueue._running - 1);
                task.reject(err);
                AIQueue._abortControllers.delete(task.id);
                AIQueue._processQueue();
            });
        } else {
            if (task.cacheKey) AIQueue.setCached(task.cacheKey, result);
            AIQueue._running = Math.max(0, AIQueue._running - 1);
            task.resolve(result);
            AIQueue._abortControllers.delete(task.id);
            AIQueue._processQueue();
        }
    };

    AIQueue.cancel = function (taskId) {
        var controller = AIQueue._abortControllers.get(taskId);
        if (controller) {
            controller.abort();
            AIQueue._abortControllers.delete(taskId);
        }
        AIQueue._queue = AIQueue._queue.filter(function (t) { return t.id !== taskId; });
    };

    AIQueue.cancelAll = function () {
        AIQueue._abortControllers.forEach(function (c) { c.abort(); });
        AIQueue._abortControllers.clear();
        AIQueue._queue = [];
    };

    AIQueue.getQueueLength = function () { return AIQueue._queue.length; };
    AIQueue.getRunningCount = function () { return AIQueue._running; };
    AIQueue.setMaxConcurrent = function (n) {
        AIQueue._maxConcurrent = Math.max(1, Math.min(10, n));
    };

    AIQueue.streamChat = async function (messages, onChunk, signal) {
        if (window.pazatorAI && window.pazatorAI.streamChat) {
            return window.pazatorAI.streamChat(messages, onChunk, signal);
        }
        throw new Error('AI provider not available');
    };

    window.AIQueue = AIQueue;
})();
