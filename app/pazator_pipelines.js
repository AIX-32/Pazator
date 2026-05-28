(function () {
    'use strict';

    var PIPELINES_KEY = 'pazator_pipelines';
    var RUN_HISTORY_KEY = 'pazator_pipeline_runs';
    var SCHEDULER_KEY = 'pazator_pipeline_schedules';

    var CONNECTOR_TYPES = {
        csv: { label: 'CSV', icon: 'fa-file-csv', fields: ['url', 'delimiter', 'hasHeader'] },
        json: { label: 'JSON', icon: 'fa-file-code', fields: ['url', 'jsonPath'] },
        sql: { label: 'SQL', icon: 'fa-database', fields: ['connectionString', 'query'] },
        rest: { label: 'REST API', icon: 'fa-cloud', fields: ['url', 'method', 'headers', 'body'] }
    };

    var TRANSFORM_TYPES = {
        filter: { label: 'Filter', icon: 'fa-filter' },
        map: { label: 'Map Fields', icon: 'fa-code-branch' },
        sort: { label: 'Sort', icon: 'fa-sort' },
        limit: { label: 'Limit', icon: 'fa-scissors' },
        dedup: { label: 'Deduplicate', icon: 'fa-clone' }
    };

    var pipelines = [];
    var runHistory = [];
    var schedules = [];
    var schedulerTimers = {};

    function loadPipelines() {
        try {
            var raw = localStorage.getItem(PIPELINES_KEY);
            pipelines = raw ? JSON.parse(raw) : [];
        } catch (e) { pipelines = []; }
    }

    function savePipelines() {
        localStorage.setItem(PIPELINES_KEY, JSON.stringify(pipelines));
    }

    function loadRunHistory() {
        try {
            var raw = localStorage.getItem(RUN_HISTORY_KEY);
            runHistory = raw ? JSON.parse(raw) : [];
        } catch (e) { runHistory = []; }
    }

    function saveRunHistory() {
        localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(runHistory.slice(-200)));
    }

    function loadSchedules() {
        try {
            var raw = localStorage.getItem(SCHEDULER_KEY);
            schedules = raw ? JSON.parse(raw) : [];
        } catch (e) { schedules = []; }
    }

    function saveSchedules() {
        localStorage.setItem(SCHEDULER_KEY, JSON.stringify(schedules));
    }

    function generateId() {
        return 'pipe_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    }

    function addPipeline(config) {
        var pipe = {
            id: generateId(),
            name: config.name || 'Unnamed Pipeline',
            connector: config.connector || { type: 'csv', config: {} },
            transforms: config.transforms || [],
            targetStore: config.targetStore || 'humans',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        pipelines.push(pipe);
        savePipelines();
        return pipe;
    }

    function removePipeline(id) {
        pipelines = pipelines.filter(function (p) { return p.id !== id; });
        savePipelines();
    }

    function updatePipeline(id, config) {
        for (var i = 0; i < pipelines.length; i++) {
            if (pipelines[i].id === id) {
                if (config.name) pipelines[i].name = config.name;
                if (config.connector) pipelines[i].connector = config.connector;
                if (config.transforms) pipelines[i].transforms = config.transforms;
                if (config.targetStore) pipelines[i].targetStore = config.targetStore;
                pipelines[i].updatedAt = new Date().toISOString();
                savePipelines();
                return pipelines[i];
            }
        }
        return null;
    }

    function getPipeline(id) {
        for (var i = 0; i < pipelines.length; i++) {
            if (pipelines[i].id === id) return pipelines[i];
        }
        return null;
    }

    function getAllPipelines() {
        return pipelines.slice();
    }

    function runPipeline(id) {
        var pipe = getPipeline(id);
        if (!pipe) return Promise.reject(new Error('Pipeline not found'));

        var run = {
            id: generateId(),
            pipelineId: id,
            pipelineName: pipe.name,
            startedAt: new Date().toISOString(),
            finishedAt: null,
            status: 'running',
            inputCount: 0,
            outputCount: 0,
            error: null
        };
        runHistory.unshift(run);
        saveRunHistory();
        notifyListeners('run_started', run);

        return fetchFromConnector(pipe.connector).then(function (data) {
            run.inputCount = data.length;
            var result = applyTransforms(data, pipe.transforms);
            run.outputCount = result.length;
            return ingestToStore(result, pipe.targetStore).then(function () {
                run.status = 'completed';
                run.finishedAt = new Date().toISOString();
                saveRunHistory();
                notifyListeners('run_completed', run);
                return run;
            });
        }).catch(function (err) {
            run.status = 'error';
            run.error = err.message || String(err);
            run.finishedAt = new Date().toISOString();
            saveRunHistory();
            notifyListeners('run_error', run);
            throw err;
        });
    }

    function fetchFromConnector(connector) {
        var type = connector.type;
        var cfg = connector.config || {};

        if (type === 'csv') {
            return fetchCSV(cfg.url, cfg.delimiter || ',', cfg.hasHeader !== false);
        } else if (type === 'json') {
            return fetchJSON(cfg.url, cfg.jsonPath || '');
        } else if (type === 'sql') {
            return fetchSQL(cfg.connectionString, cfg.query);
        } else if (type === 'rest') {
            return fetchREST(cfg.url, cfg.method || 'GET', cfg.headers || {}, cfg.body || null);
        }
        return Promise.resolve([]);
    }

    function fetchCSV(url, delimiter, hasHeader) {
        if (!url) return Promise.resolve([]);
        return fetch(url).then(function (res) { return res.text(); }).then(function (text) {
            var lines = text.split('\n').filter(function (l) { return l.trim(); });
            if (lines.length === 0) return [];
            var headers = hasHeader ? lines[0].split(delimiter).map(function (h) { return h.trim(); }) : [];
            var start = hasHeader ? 1 : 0;
            var results = [];
            for (var i = start; i < lines.length; i++) {
                var vals = lines[i].split(delimiter).map(function (v) { return v.trim(); });
                if (hasHeader) {
                    var obj = {};
                    for (var j = 0; j < headers.length && j < vals.length; j++) {
                        obj[headers[j]] = vals[j];
                    }
                    results.push(obj);
                } else {
                    results.push({ value: vals.join(delimiter) });
                }
            }
            return results;
        }).catch(function () { return []; });
    }

    function fetchJSON(url, jsonPath) {
        if (!url) return Promise.resolve([]);
        return fetch(url).then(function (res) { return res.json(); }).then(function (data) {
            if (jsonPath) {
                var parts = jsonPath.split('.');
                for (var i = 0; i < parts.length; i++) {
                    if (data && Array.isArray(data)) break;
                    if (data) data = data[parts[i]];
                }
            }
            return Array.isArray(data) ? data : (data ? [data] : []);
        }).catch(function () { return []; });
    }

    function getSyncServerUrl() {
        try {
            var cfg = JSON.parse(localStorage.getItem('pazator_sync_config') || 'null');
            if (cfg && cfg.url) return cfg.url.replace(/\/$/, '');
        } catch (e) {}
        return 'http://localhost:3456';
    }

    function fetchSQL(connectionString, query) {
        if (!connectionString || !query) return Promise.resolve([]);
        var url = getSyncServerUrl();
        return fetch(url + '/api/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionString: connectionString, query: query })
        }).then(function (res) {
            if (!res.ok) return res.json().then(function (e) { throw new Error(e.error || 'HTTP ' + res.status); });
            return res.json();
        }).then(function (data) {
            if (!data.success) throw new Error(data.error || 'Query failed');
            return data.rows || [];
        }).catch(function (err) {
            console.error('[SQL Connector]', err.message);
            return [];
        });
    }

    function fetchREST(url, method, headers, body) {
        if (!url) return Promise.resolve([]);
        var opts = { method: method, headers: headers };
        if (body && method !== 'GET') opts.body = body;
        return fetch(url, opts).then(function (res) { return res.json(); }).then(function (data) {
            return Array.isArray(data) ? data : (data ? [data] : []);
        }).catch(function () { return []; });
    }

    function applyTransforms(data, transforms) {
        var result = data.slice();
        for (var t = 0; t < transforms.length; t++) {
            var tf = transforms[t];
            if (tf.type === 'filter' && tf.config && tf.config.field && tf.config.value) {
                result = result.filter(function (item) {
                    var val = String(item[tf.config.field] || '').toLowerCase();
                    return val.indexOf(String(tf.config.value).toLowerCase()) !== -1;
                });
            } else if (tf.type === 'map' && tf.config && tf.config.mappings) {
                result = result.map(function (item) {
                    var mapped = {};
                    for (var key in tf.config.mappings) {
                        mapped[key] = item[tf.config.mappings[key]];
                    }
                    return mapped;
                });
            } else if (tf.type === 'sort' && tf.config && tf.config.field) {
                var dir = tf.config.direction === 'desc' ? -1 : 1;
                result.sort(function (a, b) {
                    var av = a[tf.config.field] || '';
                    var bv = b[tf.config.field] || '';
                    return String(av).localeCompare(String(bv)) * dir;
                });
            } else if (tf.type === 'limit' && tf.config && tf.config.count) {
                result = result.slice(0, tf.config.count);
            } else if (tf.type === 'dedup' && tf.config && tf.config.field) {
                var seen = {};
                result = result.filter(function (item) {
                    var key = String(item[tf.config.field] || '').toLowerCase();
                    if (seen[key]) return false;
                    seen[key] = true;
                    return true;
                });
            }
        }
        return result;
    }

    function ingestToStore(data, storeName) {
        if (!window.pazatorStore || !window.pazatorStore._data) return Promise.resolve();
        var arr = window.pazatorStore._data[storeName];
        if (!arr) return Promise.resolve();
        var count = 0;
        for (var i = 0; i < data.length; i++) {
            var item = data[i];
            if (!item.id) item.id = storeName.slice(0, 3) + '_' + Date.now() + '_' + i;
            arr.push(item);
            count++;
        }
        if (window.pazatorStore.markDirty) window.pazatorStore.markDirty(storeName);
        if (window.pazatorStore.rebuildIndexes) window.pazatorStore.rebuildIndexes();
        return Promise.resolve(count);
    }

    function addSchedule(config) {
        var sched = {
            id: generateId(),
            pipelineId: config.pipelineId,
            interval: config.interval || 3600000,
            enabled: config.enabled !== false,
            lastRun: null,
            createdAt: new Date().toISOString()
        };
        schedules.push(sched);
        saveSchedules();
        if (sched.enabled) startScheduler(sched);
        return sched;
    }

    function removeSchedule(id) {
        stopScheduler(id);
        schedules = schedules.filter(function (s) { return s.id !== id; });
        saveSchedules();
    }

    function startScheduler(sched) {
        stopScheduler(sched.id);
        schedulerTimers[sched.id] = setInterval(function () {
            runPipeline(sched.pipelineId).then(function () {
                sched.lastRun = new Date().toISOString();
                saveSchedules();
            }).catch(function () {});
        }, sched.interval);
    }

    function stopScheduler(id) {
        if (schedulerTimers[id]) {
            clearInterval(schedulerTimers[id]);
            delete schedulerTimers[id];
        }
    }

    function startAllSchedulers() {
        for (var i = 0; i < schedules.length; i++) {
            if (schedules[i].enabled) startScheduler(schedules[i]);
        }
    }

    function stopAllSchedulers() {
        for (var id in schedulerTimers) stopScheduler(id);
    }

    function getRunHistory() {
        return runHistory.slice();
    }

    function getSchedules() {
        return schedules.slice();
    }

    function getConnectorTypes() {
        var types = [];
        for (var key in CONNECTOR_TYPES) {
            types.push({ key: key, label: CONNECTOR_TYPES[key].label, icon: CONNECTOR_TYPES[key].icon, fields: CONNECTOR_TYPES[key].fields });
        }
        return types;
    }

    function getTransformTypes() {
        var types = [];
        for (var key in TRANSFORM_TYPES) {
            types.push({ key: key, label: TRANSFORM_TYPES[key].label, icon: TRANSFORM_TYPES[key].icon });
        }
        return types;
    }

    function renderRunHistory() {
        renderPipelineManager('pipelineTabContent');
    }

    var listeners = {};
    function on(event, handler) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
        return function () {
            listeners[event] = listeners[event].filter(function (h) { return h !== handler; });
        };
    }
    function notifyListeners(event, data) {
        var hs = listeners[event];
        if (!hs) return;
        for (var i = 0; i < hs.length; i++) {
            try { hs[i](data); } catch (e) { console.error('[Pipelines] handler error', e); }
        }
    }

    var initialized = false;
    function init() {
        if (initialized) return;
        initialized = true;
        loadPipelines();
        loadRunHistory();
        loadSchedules();
        startAllSchedulers();
    }

    function renderPipelineManager(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var pipes = getAllPipelines();
        var pipeCards = pipes.map(function (p) {
            var lastRun = null;
            for (var i = 0; i < runHistory.length; i++) {
                if (runHistory[i].pipelineId === p.id) { lastRun = runHistory[i]; break; }
            }
            var statusColor = lastRun ? (lastRun.status === 'completed' ? 'var(--success)' : lastRun.status === 'error' ? 'var(--danger)' : 'var(--warning)') : 'var(--text-muted)';
            var sched = null;
            for (var j = 0; j < schedules.length; j++) {
                if (schedules[j].pipelineId === p.id) { sched = schedules[j]; break; }
            }
            return '<div class="pipe-card" style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:7px;padding:16px;">' +
                '  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">' +
                '    <div style="flex:1;min-width:0;">' +
                '      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
                '        <span style="width:8px;height:8px;border-radius:50%;background:' + statusColor + ';flex-shrink:0;"></span>' +
                '        <span style="font-family:var(--font-body);font-size:14px;font-weight:500;color:var(--text-primary);">' + p.name + '</span>' +
                '      </div>' +
                '      <div style="font-size:11px;color:var(--text-muted);margin-left:16px;">' +
                '        Connector: ' + (CONNECTOR_TYPES[p.connector.type] ? CONNECTOR_TYPES[p.connector.type].label : p.connector.type) +
                '        <span style="margin:0 8px;">·</span> Target: ' + p.targetStore +
                (sched ? '<span style="margin:0 8px;">·</span> Every ' + (sched.interval / 60000) + 'min' : '') +
                '      </div>' +
                '    </div>' +
                '    <div style="display:flex;gap:6px;flex-shrink:0;">' +
                '      <button class="pipe-run-btn" onclick="pazatorPipelines.runPipeline(\'' + p.id + '\').then(function(){pazatorPipelines.renderPipelineManager(\'pipelineTabContent\')})" style="background:var(--btn-primary-bg);color:#000;border:none;border-radius:6px;padding:6px 14px;font-size:11px;font-family:var(--font-body);cursor:pointer;"><i class="fas fa-play"></i> Run</button>' +
                '      <button class="btn btn-secondary" onclick="pazatorPipelines.removePipeline(\'' + p.id + '\');pazatorPipelines.renderPipelineManager(\'pipelineTabContent\')" style="padding:6px 10px;font-size:11px;border-radius:6px;"><i class="fas fa-trash"></i></button>' +
                '    </div>' +
                '  </div>' +
                (lastRun ? '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.04);font-size:10px;color:var(--text-muted);display:flex;gap:16px;">' +
                '    <span>' + (lastRun.inputCount || 0) + ' in → ' + (lastRun.outputCount || 0) + ' out</span>' +
                '    <span>' + (lastRun.finishedAt ? new Date(lastRun.finishedAt).toLocaleString() : 'Running...') + '</span>' +
                '  </div>' : '') +
                '</div>';
        }).join('');

        var pipeListHtml = pipes.length === 0
            ? '<div style="text-align:center;padding:60px 20px;"><i class="fas fa-database" style="font-size:2.5rem;color:var(--text-muted);opacity:0.25;display:block;margin-bottom:16px;"></i><h3 style="font-family:var(--font-body);font-size:15px;color:var(--text-secondary);margin-bottom:6px;">No data pipelines yet</h3><p style="font-size:12px;color:var(--text-muted);margin-bottom:20px;max-width:360px;margin-left:auto;margin-right:auto;">Create a pipeline to import data from CSV, JSON, SQL, or REST APIs — with scheduled ingestion and transform steps.</p><button class="btn btn-primary" onclick="pazatorPipelines.showNewPipeline()" style="padding:10px 24px;font-size:13px;"><i class="fas fa-plus"></i> Create Your First Pipeline</button></div>'
            : '<div style="display:flex;flex-direction:column;gap:8px;padding:16px 20px;overflow-y:auto;flex:1;">' + pipeCards + '</div>';

        container.innerHTML =
            '<div style="display:flex;flex-direction:column;flex:1;overflow:hidden;">' +
            pipeListHtml +
            (pipes.length > 0 ? '<div id="pipeHistorySection" style="border-top:1px solid rgba(255,255,255,0.06);flex-shrink:0;">' +
            '    <div onclick="var n=document.getElementById(\'pipeHistoryBody\');n.style.display=n.style.display===\'none\'?\'block\':\'none\'" style="padding:12px 20px;display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text-muted);user-select:none;">' +
            '      <i class="fas fa-history"></i> Run History <span style="font-size:10px;color:var(--text-muted);">(' + runHistory.length + ')</span>' +
            '      <i class="fas fa-chevron-down" style="margin-left:auto;font-size:10px;"></i>' +
            '    </div>' +
            '    <div id="pipeHistoryBody" style="display:none;">' + renderHistoryBody() + '</div>' +
            '  </div>' : '') +
            '</div>';
    }

    function renderHistoryBody() {
        if (runHistory.length === 0) {
            return '<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:12px;">No runs yet</div>';
        }
        var html = '';
        for (var i = 0; i < Math.min(runHistory.length, 50); i++) {
            var r = runHistory[i];
            var sc = r.status === 'completed' ? 'var(--success)' : r.status === 'error' ? 'var(--danger)' : r.status === 'running' ? 'var(--warning)' : 'var(--text-muted)';
            html += '<div style="display:flex;align-items:center;gap:12px;padding:8px 20px;border-bottom:1px solid rgba(255,255,255,0.03);font-size:11px;">' +
                '  <span style="width:6px;height:6px;border-radius:50%;background:' + sc + ';flex-shrink:0;"></span>' +
                '  <span style="flex:1;color:var(--text-primary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (r.pipelineName || 'Unknown') + '</span>' +
                '  <span style="color:var(--text-muted);">' + (r.inputCount || 0) + ' → ' + (r.outputCount || 0) + '</span>' +
                '  <span style="color:var(--text-muted);font-size:10px;white-space:nowrap;">' + (r.finishedAt ? new Date(r.finishedAt).toLocaleString() : '...') + '</span>' +
                '  <span style="color:' + sc + ';font-size:10px;">' + r.status + '</span>' +
                '</div>';
        }
        return '<div style="max-height:240px;overflow-y:auto;">' + html + '</div>';
    }

    function showNewPipeline() {
        var modal = document.getElementById('cleanModal');
        if (!modal) return;
        var title = document.getElementById('modalTitle');
        var body = document.getElementById('modalBody');
        var footer = document.getElementById('modalActions');
        if (!title || !body || !footer) return;

        title.textContent = 'New Data Pipeline';
        var connTypes = getConnectorTypes();
        var connCards = connTypes.map(function (ct) {
            return '<button class="pipe-conn-btn" data-type="' + ct.key + '" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--card-bg);border:1px solid var(--border-color);border-radius:7px;color:var(--text-primary);cursor:pointer;text-align:left;font-family:var(--font-body);font-size:12px;">' +
                '  <span style="width:30px;height:30px;border-radius:6px;background:rgba(77,157,224,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas ' + ct.icon + '" style="color:var(--info);font-size:12px;"></i></span>' +
                '  <div style="flex:1;min-width:0;">' +
                '    <div style="font-weight:500;font-size:12px;">' + ct.label + '</div>' +
                '    <div style="font-size:9px;color:var(--text-muted);margin-top:1px;">' + ct.fields.join(', ') + '</div>' +
                '  </div>' +
                '  <i class="fas fa-chevron-right" style="color:var(--text-muted);font-size:8px;"></i>' +
                '</button>';
        }).join('');

        body.innerHTML =
            '<div style="display:flex;flex-direction:column;gap:10px;">' +
            '  <div style="display:flex;gap:10px;">' +
            '    <div style="flex:2;">' +
            '      <label style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Pipeline Name</label>' +
            '      <input type="text" id="newPipeName" class="form-control" placeholder="e.g. Import Citizens CSV" style="margin-top:3px;" autofocus>' +
            '    </div>' +
            '    <div style="flex:1;">' +
            '      <label style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Target Store</label>' +
            '      <select id="newPipeTarget" class="form-control" style="margin-top:3px;">' +
            '        <option value="humans">Humans</option>' +
            '        <option value="others">Others</option>' +
            '        <option value="chats">Chats</option>' +
            '      </select>' +
            '    </div>' +
            '  </div>' +
            '  <div>' +
            '    <label style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Data Source</label>' +
            '    <div id="pipeConnectorList" style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:3px;">' + connCards + '</div>' +
            '  </div>' +
            '  <div id="pipeConnectorConfig" style="display:none;"></div>' +
            '</div>';

        footer.innerHTML =
            '<button class="btn btn-secondary" onclick="pazatorPipelines.cancelModal()" style="padding:8px 20px;">Cancel</button>' +
            '<button class="btn btn-primary" id="createPipeBtn" style="padding:8px 20px;"><i class="fas fa-play"></i> Create & Run</button>';

        modal.classList.add('active');
        modal.classList.add('wide');

        var selectedType = null;
        document.querySelectorAll('.pipe-conn-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.pipe-conn-btn').forEach(function (b) {
                    b.style.borderColor = 'var(--border-color)';
                    b.style.background = 'var(--card-bg)';
                });
                btn.style.borderColor = 'var(--info)';
                btn.style.background = 'rgba(77,157,224,0.08)';
                selectedType = btn.getAttribute('data-type');
                showConnectorConfig(selectedType);
            });
        });

        document.getElementById('createPipeBtn').addEventListener('click', function () {
            var name = document.getElementById('newPipeName').value || 'Unnamed';
            var target = document.getElementById('newPipeTarget').value;
            if (!selectedType) { PazatorUI.showFloatingNotification('Select a data source type', 'warning'); return; }
            var connConfig = collectConnectorConfig(selectedType);
            var pipe = addPipeline({
                name: name,
                connector: { type: selectedType, config: connConfig },
                transforms: [],
                targetStore: target
            });
            modal.classList.remove('active');
            PazatorUI.showFloatingNotification('Pipeline "' + name + '" created', 'success');
            renderPipelineManager('pipelineTabContent');
            runPipeline(pipe.id).then(function () {
                renderPipelineManager('pipelineTabContent');
                PazatorUI.showFloatingNotification('Pipeline run completed: ' + pipe.outputCount + ' records', 'success');
            }).catch(function (err) {
                renderPipelineManager('pipelineTabContent');
                PazatorUI.showFloatingNotification('Pipeline error: ' + err.message, 'error');
            });
        });
    }

    function showConnectorConfig(type) {
        var el = document.getElementById('pipeConnectorConfig');
        if (!el) return;
        var fields = CONNECTOR_TYPES[type] ? CONNECTOR_TYPES[type].fields : [];
        var html = '<div style="display:flex;flex-direction:column;gap:10px;padding:16px;background:rgba(0,0,0,0.15);border-radius:7px;border:1px solid var(--border-color);">';
        html += '<label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Connector Settings</label>';
        for (var i = 0; i < fields.length; i++) {
            var placeholder = fields[i] === 'url' ? 'https://example.com/data.csv' :
                fields[i] === 'delimiter' ? ',' :
                fields[i] === 'hasHeader' ? '' :
                fields[i] === 'jsonPath' ? 'results.items' :
                fields[i] === 'connectionString' ? 'mysql://user:pass@host/db' :
                fields[i] === 'query' ? 'SELECT * FROM table' :
                fields[i] === 'method' ? 'GET' :
                fields[i] === 'headers' ? '{"Authorization": "Bearer ..."}' :
                fields[i] === 'body' ? '{"key": "value"}' : '';
            if (fields[i] === 'hasHeader') {
                html += '<label style="font-size:12px;display:flex;align-items:center;gap:8px;"><input type="checkbox" id="connCfg_hasHeader" checked style="accent-color:var(--info);"> Has Header Row</label>';
            } else if (fields[i] === 'method') {
                html += '<select id="connCfg_' + fields[i] + '" class="form-control" style="font-size:12px;padding:6px 10px;">' +
                    '<option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option>' +
                    '</select>';
            } else {
                html += '<input type="text" id="connCfg_' + fields[i] + '" class="form-control" placeholder="' + placeholder + '" style="font-size:12px;padding:6px 10px;">';
            }
        }
        html += '</div>';
        el.innerHTML = html;
        el.style.display = 'block';
    }

    function collectConnectorConfig(type) {
        var fields = CONNECTOR_TYPES[type] ? CONNECTOR_TYPES[type].fields : [];
        var cfg = {};
        for (var i = 0; i < fields.length; i++) {
            var el = document.getElementById('connCfg_' + fields[i]);
            if (el) {
                cfg[fields[i]] = el.type === 'checkbox' ? el.checked : el.value;
            }
        }
        return cfg;
    }

    function showScheduler() {
        var modal = document.getElementById('cleanModal');
        if (!modal) return;
        var title = document.getElementById('modalTitle');
        var body = document.getElementById('modalBody');
        var footer = document.getElementById('modalActions');
        if (!title || !body || !footer) return;

        title.textContent = 'Pipeline Scheduler';
        var pipes = getAllPipelines();
        var scheds = getSchedules();
        var pipeOpts = '<option value="">Select a pipeline...</option>';
        for (var i = 0; i < pipes.length; i++) {
            pipeOpts += '<option value="' + pipes[i].id + '">' + pipes[i].name + '</option>';
        }
        var schedHtml = '';
        if (scheds.length === 0) {
            schedHtml = '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:12px;"><i class="fas fa-clock" style="font-size:1.5rem;display:block;margin-bottom:8px;opacity:0.3;"></i>No schedules yet</div>';
        } else {
            for (var i = 0; i < scheds.length; i++) {
                var s = scheds[i];
                var pipe = getPipeline(s.pipelineId);
                schedHtml += '<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px;">' +
                    '<span style="width:8px;height:8px;border-radius:50%;background:' + (s.enabled ? 'var(--success)' : 'var(--text-muted)') + ';flex-shrink:0;"></span>' +
                    '<span style="flex:1;color:var(--text-primary);">' + (pipe ? pipe.name : 'Unknown') + '</span>' +
                    '<span style="color:var(--text-muted);font-size:11px;">Every <strong>' + (s.interval / 60000) + '</strong> min</span>' +
                    '<span style="color:var(--text-muted);font-size:10px;">' + (s.lastRun ? new Date(s.lastRun).toLocaleString() : 'Never') + '</span>' +
                    '<button class="btn btn-secondary" onclick="pazatorPipelines.removeSchedule(\'' + s.id + '\');pazatorPipelines.showScheduler();" style="padding:4px 8px;font-size:10px;"><i class="fas fa-times"></i></button>' +
                    '</div>';
            }
        }
        body.innerHTML =
            '<div style="display:flex;flex-direction:column;gap:16px;">' +
            '  <div style="background:rgba(0,0,0,0.15);border-radius:7px;padding:16px;border:1px solid var(--border-color);">' +
            '    <h3 style="font-size:13px;margin-bottom:12px;color:var(--text-secondary);">New Schedule</h3>' +
            '    <div style="display:flex;gap:10px;flex-wrap:wrap;">' +
            '      <select id="schedPipeSelect" class="form-control" style="flex:2;min-width:160px;font-size:12px;">' + pipeOpts + '</select>' +
            '      <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:100px;">' +
            '        <input type="number" id="schedInterval" class="form-control" value="60" min="1" style="width:60px;font-size:12px;text-align:center;">' +
            '        <span style="font-size:11px;color:var(--text-muted);">minutes</span>' +
            '      </div>' +
            '      <button class="btn btn-primary" id="addSchedBtn" style="padding:8px 16px;font-size:12px;white-space:nowrap;"><i class="fas fa-plus"></i> Add</button>' +
            '    </div>' +
            '  </div>' +
            '  <div>' +
            '    <h3 style="font-size:13px;margin-bottom:8px;color:var(--text-secondary);">Active Schedules</h3>' +
            '    <div id="schedList">' + schedHtml + '</div>' +
            '  </div>' +
            '</div>';

        footer.innerHTML = '<button class="btn btn-secondary" onclick="pazatorPipelines.cancelModal()" style="padding:8px 20px;">Close</button>';
        modal.classList.add('active');
        modal.classList.add('wide');

        document.getElementById('addSchedBtn').addEventListener('click', function () {
            var pid = document.getElementById('schedPipeSelect').value;
            var interval = parseInt(document.getElementById('schedInterval').value, 10) * 60000;
            if (!pid || !interval) { PazatorUI.showFloatingNotification('Select a pipeline and interval', 'warning'); return; }
            addSchedule({ pipelineId: pid, interval: interval });
            PazatorUI.showFloatingNotification('Schedule added', 'success');
            showScheduler();
        });
    }

    function cancelModal() {
        var modal = document.getElementById('cleanModal');
        if (modal) modal.classList.remove('active');
    }

    window.pazatorPipelines = {
        init: init,
        addPipeline: addPipeline,
        removePipeline: removePipeline,
        updatePipeline: updatePipeline,
        getPipeline: getPipeline,
        getAllPipelines: getAllPipelines,
        runPipeline: runPipeline,
        addSchedule: addSchedule,
        removeSchedule: removeSchedule,
        getSchedules: getSchedules,
        getRunHistory: getRunHistory,
        getConnectorTypes: getConnectorTypes,
        getTransformTypes: getTransformTypes,
        renderPipelineManager: renderPipelineManager,
        renderRunHistory: renderRunHistory,
        showNewPipeline: showNewPipeline,
        showScheduler: showScheduler,
        cancelModal: cancelModal,
        on: on
    };
})();
