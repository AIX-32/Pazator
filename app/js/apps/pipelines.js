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

    var builderState = null;

    function closeBuilder() {
        var modal = document.getElementById('pipelineBuilder');
        if (modal) modal.classList.remove('active');
        builderState = null;
    }

    function showNewPipeline() {
        var modal = document.getElementById('pipelineBuilder');
        if (!modal) return;
        builderState = {
            name: '',
            connectorType: null,
            connectorConfig: {},
            transforms: [],
            targetStore: 'humans',
            activeSection: 'connector'
        };
        document.getElementById('pbName').value = '';
        updateFlowBar();
        renderBuilderEditor();
        modal.classList.add('active');

        document.getElementById('pbCreateBtn').onclick = function () {
            var name = document.getElementById('pbName').value || 'Unnamed Pipeline';
            if (!builderState.connectorType) {
                PazatorUI.showFloatingNotification('Select a data source type', 'warning');
                return;
            }
            var pipe = addPipeline({
                name: name,
                connector: { type: builderState.connectorType, config: builderState.connectorConfig },
                transforms: builderState.transforms,
                targetStore: builderState.targetStore
            });
            modal.classList.remove('active');
            PazatorUI.showFloatingNotification('Pipeline "' + name + '" created', 'success');
            renderPipelineManager('pipelineTabContent');
            runPipeline(pipe.id).then(function () {
                renderPipelineManager('pipelineTabContent');
                PazatorUI.showFloatingNotification('Pipeline run completed', 'success');
            }).catch(function (err) {
                renderPipelineManager('pipelineTabContent');
                PazatorUI.showFloatingNotification('Pipeline error: ' + err.message, 'error');
            });
            builderState = null;
        };

        document.querySelectorAll('.pipeline-flow-node').forEach(function (node) {
            node.onclick = function () {
                builderState.activeSection = node.getAttribute('data-section');
                updateFlowBar();
                renderBuilderEditor();
            };
        });
    }

    function updateFlowBar() {
        var flowNodes = document.querySelectorAll('.pipeline-flow-node');
        flowNodes.forEach(function (n) { n.classList.remove('active'); });
        var active = document.querySelector('.pipeline-flow-node[data-section="' + builderState.activeSection + '"]');
        if (active) active.classList.add('active');

        var sourceEl = document.getElementById('pbFlowSource');
        var transEl = document.getElementById('pbFlowTransforms');
        var targetEl = document.getElementById('pbFlowTarget');

        if (builderState.connectorType) {
            var ct = CONNECTOR_TYPES[builderState.connectorType];
            sourceEl.textContent = ct ? ct.label : builderState.connectorType;
        } else {
            sourceEl.textContent = 'Pick a source';
        }

        var tCount = builderState.transforms.length;
        transEl.textContent = tCount === 0 ? 'None' : tCount + ' step' + (tCount > 1 ? 's' : '');

        var targetLabels = { humans: 'Humans', others: 'Others', chats: 'Chats' };
        targetEl.textContent = targetLabels[builderState.targetStore] || builderState.targetStore;
    }

    function renderBuilderEditor() {
        var editor = document.getElementById('pbEditor');
        if (!editor) return;
        var section = builderState.activeSection;
        if (section === 'connector') renderConnectorSection(editor);
        else if (section === 'transforms') renderTransformsSection(editor);
        else if (section === 'target') renderTargetSection(editor);
    }

    function renderConnectorSection(editor) {
        var types = getConnectorTypes();
        var cards = types.map(function (ct) {
            var sel = builderState.connectorType === ct.key ? ' selected' : '';
            return '<div class="pipeline-conn-card' + sel + '" data-type="' + ct.key + '">' +
                '  <div class="pipeline-conn-card-icon"><i class="fas ' + ct.icon + '"></i></div>' +
                '  <div class="pipeline-conn-card-info">' +
                '    <div class="pipeline-conn-card-name">' + ct.label + '</div>' +
                '    <div class="pipeline-conn-card-fields">' + ct.fields.join(', ') + '</div>' +
                '  </div>' +
                '  <div class="pipeline-conn-card-check"><i class="fas fa-check-circle"></i></div>' +
                '</div>';
        }).join('');

        var configHtml = '';
        if (builderState.connectorType) {
            configHtml = renderConnectorConfig(builderState.connectorType);
        }

        editor.innerHTML =
            '<div class="pipeline-editor-section-title"><i class="fas fa-database"></i> Data Source</div>' +
            '<div class="pipeline-conn-grid">' + cards + '</div>' +
            '<div id="pbConnConfig" class="pipeline-conn-config" style="' + (configHtml ? '' : 'display:none;') + '">' +
            '  <div class="pipeline-conn-config-label">Connector Settings</div>' +
            '  <div class="pipeline-conn-config-fields" id="pbConnConfigFields">' + configHtml + '</div>' +
            '</div>';

        editor.querySelectorAll('.pipeline-conn-card').forEach(function (card) {
            card.addEventListener('click', function () {
                editor.querySelectorAll('.pipeline-conn-card').forEach(function (c) {
                    c.classList.remove('selected');
                });
                card.classList.add('selected');
                builderState.connectorType = card.getAttribute('data-type');
                builderState.connectorConfig = {};
                var cfgEl = document.getElementById('pbConnConfig');
                var fieldsEl = document.getElementById('pbConnConfigFields');
                if (cfgEl && fieldsEl) {
                    fieldsEl.innerHTML = renderConnectorConfig(builderState.connectorType);
                    cfgEl.style.display = 'block';
                }
                updateFlowBar();
            });
        });

        // Wire up config field changes
        wireConnectorConfig();
    }

    function renderConnectorConfig(type) {
        var fields = CONNECTOR_TYPES[type] ? CONNECTOR_TYPES[type].fields : [];
        var html = '';
        for (var i = 0; i < fields.length; i++) {
            var f = fields[i];
            var placeholder = f === 'url' ? 'https://example.com/data.csv' :
                f === 'delimiter' ? ',' :
                f === 'hasHeader' ? '' :
                f === 'jsonPath' ? 'results.items' :
                f === 'connectionString' ? 'mysql://user:pass@host/db' :
                f === 'query' ? 'SELECT * FROM table' :
                f === 'method' ? 'GET' :
                f === 'headers' ? '{"Authorization": "Bearer ..."}' :
                f === 'body' ? '{"key": "value"}' : '';
            if (f === 'hasHeader') {
                html += '<div class="pipeline-conn-config-field"><label><input type="checkbox" data-field="hasHeader" checked style="accent-color:var(--info);margin-right:6px;"> Has Header Row</label></div>';
            } else if (f === 'method') {
                html += '<div class="pipeline-conn-config-field"><label>Method</label><select data-field="method">' +
                    '<option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option></select></div>';
            } else {
                var label = f.charAt(0).toUpperCase() + f.slice(1).replace(/([A-Z])/g, ' $1');
                html += '<div class="pipeline-conn-config-field"><label>' + label + '</label><input type="text" data-field="' + f + '" placeholder="' + placeholder + '"></div>';
            }
        }
        return html;
    }

    function wireConnectorConfig() {
        var container = document.getElementById('pbConnConfigFields');
        if (!container) return;
        container.querySelectorAll('input, select').forEach(function (el) {
            el.addEventListener('change', collectConnectorConfig);
            el.addEventListener('input', collectConnectorConfig);
        });
    }

    function collectConnectorConfig() {
        if (!builderState) return;
        var fields = CONNECTOR_TYPES[builderState.connectorType] ? CONNECTOR_TYPES[builderState.connectorType].fields : [];
        var cfg = {};
        var container = document.getElementById('pbConnConfigFields');
        if (!container) return;
        for (var i = 0; i < fields.length; i++) {
            var el = container.querySelector('[data-field="' + fields[i] + '"]');
            if (el) {
                cfg[fields[i]] = el.type === 'checkbox' ? el.checked : el.value;
            }
        }
        builderState.connectorConfig = cfg;
    }

    function renderTransformsSection(editor) {
        var html = '<div class="pipeline-editor-section-title"><i class="fas fa-filter"></i> Transform Steps</div>';
        html += '<div class="pipeline-transform-list" id="pbTransformList">';

        if (builderState.transforms.length === 0) {
            html += '<div class="pipeline-empty"><i class="fas fa-code-branch"></i>No transform steps yet.<br>Data will pass through as-is.</div>';
        } else {
            for (var i = 0; i < builderState.transforms.length; i++) {
                var t = builderState.transforms[i];
                var tt = TRANSFORM_TYPES[t.type];
                var desc = t.type === 'filter' ? (t.config && t.config.field ? t.config.field + ' contains ' + (t.config.value || '') : 'configure...') :
                    t.type === 'map' ? (t.config && t.config.mappings ? Object.keys(t.config.mappings).length + ' fields' : 'configure...') :
                    t.type === 'sort' ? (t.config && t.config.field ? 'by ' + t.config.field + ' ' + (t.config.direction || 'asc') : 'configure...') :
                    t.type === 'limit' ? (t.config && t.config.count ? 'top ' + t.config.count : 'configure...') :
                    t.type === 'dedup' ? (t.config && t.config.field ? 'by ' + t.config.field : 'configure...') : 'configure...';
                html += '<div class="pipeline-transform-item">' +
                    '  <div class="pipeline-transform-item-icon"><i class="fas ' + (tt ? tt.icon : 'fa-cog') + '"></i></div>' +
                    '  <div class="pipeline-transform-item-name">' + (tt ? tt.label : t.type) + '</div>' +
                    '  <div class="pipeline-transform-item-desc">' + desc + '</div>' +
                    '  <button class="pipeline-transform-item-remove" data-idx="' + i + '"><i class="fas fa-times"></i></button>' +
                    '</div>';
            }
        }

        html += '</div>';

        // Add transform button
        html += '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">';
        for (var key in TRANSFORM_TYPES) {
            html += '<div class="pipeline-transform-add" data-type="' + key + '" style="display:inline-flex;padding:6px 10px;font-size:0.65rem;">' +
                '<i class="fas ' + TRANSFORM_TYPES[key].icon + '" style="font-size:0.55rem;"></i> ' + TRANSFORM_TYPES[key].label + '</div>';
        }
        html += '</div>';

        editor.innerHTML = html;

        // Wire remove buttons
        editor.querySelectorAll('.pipeline-transform-item-remove').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var idx = parseInt(btn.getAttribute('data-idx'), 10);
                builderState.transforms.splice(idx, 1);
                renderTransformsSection(editor);
                updateFlowBar();
            });
        });

        // Wire add buttons
        editor.querySelectorAll('.pipeline-transform-add').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var type = btn.getAttribute('data-type');
                var defaultConfig = {};
                if (type === 'filter') defaultConfig = { field: '', value: '' };
                else if (type === 'map') defaultConfig = { mappings: {} };
                else if (type === 'sort') defaultConfig = { field: '', direction: 'asc' };
                else if (type === 'limit') defaultConfig = { count: 100 };
                else if (type === 'dedup') defaultConfig = { field: '' };
                builderState.transforms.push({ type: type, config: defaultConfig });
                renderTransformsSection(editor);
                updateFlowBar();
            });
        });
    }

    function renderTargetSection(editor) {
        var stores = [
            { key: 'humans', icon: 'fa-user', label: 'Humans', desc: 'Person entities' },
            { key: 'others', icon: 'fa-building', label: 'Others', desc: 'Orgs, locations, events' },
            { key: 'chats', icon: 'fa-comments', label: 'Chats', desc: 'Message archives' }
        ];
        var cards = stores.map(function (s) {
            var sel = builderState.targetStore === s.key ? ' selected' : '';
            return '<div class="pipeline-target-card' + sel + '" data-store="' + s.key + '">' +
                '  <i class="fas ' + s.icon + '"></i>' +
                '  <div class="pipeline-target-card-name">' + s.label + '</div>' +
                '  <div class="pipeline-target-card-desc">' + s.desc + '</div>' +
                '</div>';
        }).join('');

        editor.innerHTML =
            '<div class="pipeline-editor-section-title"><i class="fas fa-upload"></i> Target Store</div>' +
            '<div class="pipeline-target-grid">' + cards + '</div>';

        editor.querySelectorAll('.pipeline-target-card').forEach(function (card) {
            card.addEventListener('click', function () {
                editor.querySelectorAll('.pipeline-target-card').forEach(function (c) { c.classList.remove('selected'); });
                card.classList.add('selected');
                builderState.targetStore = card.getAttribute('data-store');
                updateFlowBar();
            });
        });
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

    function updateSidebarStats() {
        var pipes = getAllPipelines();
        var pipeEl = document.getElementById('pipeCount');
        var runEl = document.getElementById('pipeRunCount');
        var schedEl = document.getElementById('pipeSchedCount');
        var lastRunEl = document.getElementById('pipeLastRun');
        if (pipeEl) pipeEl.textContent = pipes.length;
        if (runEl) runEl.textContent = runHistory.length;
        if (schedEl) schedEl.textContent = schedules.length;
        if (lastRunEl) {
            var latest = runHistory.length > 0 ? runHistory[0] : null;
            lastRunEl.textContent = latest
                ? 'Last run: ' + (latest.pipelineName || 'Unknown') + ' — ' + latest.status + (latest.finishedAt ? ' at ' + new Date(latest.finishedAt).toLocaleTimeString() : '')
                : '';
        }
    }

    function renderPipelineManager(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        updateSidebarStats();
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



    function closeScheduler() {
        var modal = document.getElementById('schedulerModal');
        if (modal) modal.classList.remove('active');
    }

    function showScheduler() {
        var modal = document.getElementById('schedulerModal');
        if (!modal) return;
        var pipes = getAllPipelines();
        var scheds = getSchedules();
        var select = document.getElementById('schedPipeSelect');
        if (select) {
            var opts = '<option value="">Select a pipeline...</option>';
            for (var i = 0; i < pipes.length; i++) {
                opts += '<option value="' + pipes[i].id + '">' + pipes[i].name + '</option>';
            }
            select.innerHTML = opts;
        }
        renderSchedList();
        modal.classList.add('active');
        document.getElementById('addSchedBtn').onclick = function () {
            var pid = document.getElementById('schedPipeSelect').value;
            var interval = parseInt(document.getElementById('schedInterval').value, 10) * 60000;
            if (!pid || !interval) { PazatorUI.showFloatingNotification('Select a pipeline and interval', 'warning'); return; }
            addSchedule({ pipelineId: pid, interval: interval });
            PazatorUI.showFloatingNotification('Schedule added', 'success');
            renderSchedList();
            updateSidebarStats();
        };
    }

    function renderSchedList() {
        var scheds = getSchedules();
        var el = document.getElementById('schedList');
        if (!el) return;
        if (scheds.length === 0) {
            el.innerHTML = '<div class="pipeline-empty"><i class="fas fa-clock"></i>No schedules yet.<br>Add one above to run pipelines automatically.</div>';
            return;
        }
        var html = '';
        for (var i = 0; i < scheds.length; i++) {
            var s = scheds[i];
            var pipe = getPipeline(s.pipelineId);
            html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(255,255,255,0.02);border:1px solid #252525;border-radius:8px;font-size:0.75rem;">' +
                '<span style="width:7px;height:7px;border-radius:50%;background:' + (s.enabled ? 'var(--success)' : 'var(--text-muted)') + ';flex-shrink:0;"></span>' +
                '<span style="flex:1;color:var(--text-primary);font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (pipe ? pipe.name : 'Unknown') + '</span>' +
                '<span style="color:var(--text-muted);font-size:0.6rem;">Every <strong>' + (s.interval / 60000) + '</strong> min</span>' +
                '<span style="color:var(--text-muted);font-size:0.55rem;white-space:nowrap;">' + (s.lastRun ? new Date(s.lastRun).toLocaleString() : 'Never') + '</span>' +
                '<button onclick="pazatorPipelines.removeSchedule(\'' + s.id + '\');pazatorPipelines.renderSchedList();pazatorPipelines.updateSidebarStats();" style="width:20px;height:20px;border-radius:4px;background:transparent;border:none;color:#555;cursor:pointer;font-size:0.55rem;display:flex;align-items:center;justify-content:center;"><i class="fas fa-times"></i></button>' +
                '</div>';
        }
        el.innerHTML = html;
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
        closeBuilder: closeBuilder,
        showScheduler: showScheduler,
        closeScheduler: closeScheduler,
        renderSchedList: renderSchedList,
        updateSidebarStats: updateSidebarStats,
        cancelModal: cancelModal,
        on: on
    };
})();
