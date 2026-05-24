(function () {
    'use strict';

    var API_KEY_KEY = 'pazator_api_key';
    var WEBHOOKS_KEY = 'pazator_webhooks';
    var API_LOGS_KEY = 'pazator_api_logs';

    var webhooks = [];
    var apiLogs = [];

    function loadWebhooks() {
        try { webhooks = JSON.parse(localStorage.getItem(WEBHOOKS_KEY)) || []; } catch (e) { webhooks = []; }
    }

    function saveWebhooks() {
        localStorage.setItem(WEBHOOKS_KEY, JSON.stringify(webhooks));
    }

    function loadLogs() {
        try { apiLogs = JSON.parse(localStorage.getItem(API_LOGS_KEY)) || []; } catch (e) { apiLogs = []; }
    }

    function saveLogs() {
        localStorage.setItem(API_LOGS_KEY, JSON.stringify(apiLogs.slice(-200)));
    }

    function generateId() {
        return 'api_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    }

    function generateApiKey() {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var key = 'paz_';
        for (var i = 0; i < 40; i++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return key;
    }

    function getApiKey() {
        var key = localStorage.getItem(API_KEY_KEY);
        if (!key) {
            key = generateApiKey();
            localStorage.setItem(API_KEY_KEY, key);
        }
        return key;
    }

    function regenerateApiKey() {
        var key = generateApiKey();
        localStorage.setItem(API_KEY_KEY, key);
        return key;
    }

    // --- Webhook Management ---

    function addWebhook(config) {
        var wh = {
            id: generateId(),
            name: config.name || 'Unnamed Webhook',
            url: config.url || '',
            events: config.events || ['data_changed'],
            enabled: config.enabled !== false,
            secret: config.secret || '',
            createdAt: new Date().toISOString(),
            lastTriggered: null,
            lastStatus: null
        };
        webhooks.push(wh);
        saveWebhooks();
        return wh;
    }

    function removeWebhook(id) {
        webhooks = webhooks.filter(function (w) { return w.id !== id; });
        saveWebhooks();
    }

    function updateWebhook(id, config) {
        for (var i = 0; i < webhooks.length; i++) {
            if (webhooks[i].id === id) {
                if (config.name !== undefined) webhooks[i].name = config.name;
                if (config.url !== undefined) webhooks[i].url = config.url;
                if (config.events !== undefined) webhooks[i].events = config.events;
                if (config.enabled !== undefined) webhooks[i].enabled = config.enabled;
                if (config.secret !== undefined) webhooks[i].secret = config.secret;
                saveWebhooks();
                return webhooks[i];
            }
        }
        return null;
    }

    function getWebhook(id) {
        for (var i = 0; i < webhooks.length; i++) {
            if (webhooks[i].id === id) return webhooks[i];
        }
        return null;
    }

    function getAllWebhooks() {
        return webhooks.slice();
    }

    function triggerWebhooks(event, payload) {
        var triggered = [];
        for (var i = 0; i < webhooks.length; i++) {
            var wh = webhooks[i];
            if (!wh.enabled) continue;
            if (wh.events.indexOf(event) === -1 && wh.events.indexOf('*') === -1) continue;
            fireWebhook(wh, event, payload);
            wh.lastTriggered = new Date().toISOString();
            triggered.push(wh);
        }
        saveWebhooks();
        logApiCall('webhook', event, { webhooks: triggered.length });
        return triggered;
    }

    function fireWebhook(wh, event, payload) {
        var body = JSON.stringify({ event: event, payload: payload, timestamp: new Date().toISOString() });
        var headers = { 'Content-Type': 'application/json' };
        if (wh.secret) headers['X-Webhook-Secret'] = wh.secret;
        fetch(wh.url, { method: 'POST', headers: headers, body: body, mode: 'no-cors' })
            .then(function (r) { wh.lastStatus = r.ok ? 200 : r.status; })
            .catch(function () { wh.lastStatus = 0; });
    }

    // --- REST API ---

    function restQuery(endpoint, method, params) {
        method = (method || 'GET').toUpperCase();
        var parts = endpoint.replace(/^\/+/, '').split('/');
        var resource = parts[0] || '';
        var resourceId = parts[1] || null;

        logApiCall(method, endpoint, params);

        if (resource === 'humans') return handleEntityCRUD('humans', method, resourceId, params);
        if (resource === 'others') return handleEntityCRUD('others', method, resourceId, params);
        if (resource === 'cases') return handleCasesCRUD(method, resourceId, params);
        if (resource === 'chats') return handleChatsCRUD(method, resourceId, params);
        if (resource === 'tags') return handleTagsCRUD(method, resourceId, params);
        if (resource === 'relationships') return handleRelationshipsCRUD(method, resourceId, params);
        if (resource === 'stats') return getStats();
        if (resource === 'search') return handleSearch(params);

        return { error: 'Unknown endpoint: ' + resource, status: 404 };
    }

    function getStoreData(storeName) {
        if (window.pazatorStore && window.pazatorStore._data) {
            return window.pazatorStore._data[storeName] || [];
        }
        return window.pazatorData && window.pazatorData[storeName] ? window.pazatorData[storeName] : [];
    }

    function handleEntityCRUD(store, method, id, params) {
        var data = getStoreData(store);
        switch (method) {
            case 'GET':
                if (id) {
                    for (var i = 0; i < data.length; i++) {
                        if (data[i].id === id) return { data: data[i], status: 200 };
                    }
                    return { error: 'Not found', status: 404 };
                }
                return { data: data, status: 200, total: data.length };
            case 'POST':
                if (!params || !params.name) return { error: 'Name is required', status: 400 };
                var newItem = { id: generateId(), name: params.name, createdAt: new Date().toISOString() };
                for (var key in params) { if (key !== 'id') newItem[key] = params[key]; }
                data.push(newItem);
                if (window.pazatorStore && window.pazatorStore.markDirty) window.pazatorStore.markDirty(store);
                triggerWebhooks('data_changed', { store: store, action: 'create', id: newItem.id });
                return { data: newItem, status: 201 };
            case 'PUT':
                if (!id) return { error: 'ID required', status: 400 };
                for (var i = 0; i < data.length; i++) {
                    if (data[i].id === id) {
                        for (var key in params) { if (key !== 'id') data[i][key] = params[key]; }
                        data[i].updatedAt = new Date().toISOString();
                        if (window.pazatorStore && window.pazatorStore.markDirty) window.pazatorStore.markDirty(store);
                        triggerWebhooks('data_changed', { store: store, action: 'update', id: id });
                        return { data: data[i], status: 200 };
                    }
                }
                return { error: 'Not found', status: 404 };
            case 'DELETE':
                if (!id) return { error: 'ID required', status: 400 };
                for (var i = 0; i < data.length; i++) {
                    if (data[i].id === id) {
                        data.splice(i, 1);
                        if (window.pazatorStore && window.pazatorStore.markDirty) window.pazatorStore.markDirty(store);
                        triggerWebhooks('data_changed', { store: store, action: 'delete', id: id });
                        return { status: 204 };
                    }
                }
                return { error: 'Not found', status: 404 };
            default:
                return { error: 'Method not allowed', status: 405 };
        }
    }

    function handleCasesCRUD(method, id, params) {
        var data = getStoreData('cases');
        if (method === 'GET') {
            if (id) {
                for (var i = 0; i < data.length; i++) {
                    if (data[i].id === id) return { data: data[i], status: 200 };
                }
                return { error: 'Not found', status: 404 };
            }
            return { data: data, status: 200, total: data.length };
        }
        if (method === 'POST') {
            var c = { id: generateId(), title: (params && params.title) || 'Untitled', status: 'open', createdAt: new Date().toISOString() };
            if (params) { for (var k in params) { if (k !== 'id') c[k] = params[k]; } }
            data.push(c);
            if (window.pazatorStore && window.pazatorStore.markDirty) window.pazatorStore.markDirty('cases');
            triggerWebhooks('data_changed', { store: 'cases', action: 'create', id: c.id });
            return { data: c, status: 201 };
        }
        return { error: 'Method not allowed', status: 405 };
    }

    function handleChatsCRUD(method, id, params) {
        var data = getStoreData('chats');
        if (method === 'GET') {
            if (id) {
                for (var i = 0; i < data.length; i++) {
                    if (data[i].id === id) return { data: data[i], status: 200 };
                }
                return { error: 'Not found', status: 404 };
            }
            return { data: data, status: 200, total: data.length };
        }
        return { error: 'Method not allowed', status: 405 };
    }

    function handleTagsCRUD(method, id, params) {
        var data = window.pazatorStore && window.pazatorStore._data ? window.pazatorStore._data.tags || [] : window.tags || [];
        if (method === 'GET') return { data: data, status: 200, total: data.length };
        return { error: 'Method not allowed', status: 405 };
    }

    function handleRelationshipsCRUD(method, id, params) {
        if (!window.pazatorRelationships) return { error: 'Relationships module not loaded', status: 503 };
        if (method === 'GET') {
            if (id) {
                var r = window.pazatorRelationships.getById(id);
                return r ? { data: r, status: 200 } : { error: 'Not found', status: 404 };
            }
            if (params && params.entityId) {
                var rels = window.pazatorRelationships.getForEntity(params.entityId, params.entityType || 'human');
                return { data: rels, status: 200 };
            }
            return { data: window.pazatorRelationships.getAll(), status: 200, total: window.pazatorRelationships.getAll().length };
        }
        if (method === 'POST') {
            if (!params || !params.sourceId || !params.targetId) return { error: 'sourceId and targetId required', status: 400 };
            var rel = window.pazatorRelationships.add(params);
            if (window.pazatorStore && window.pazatorStore.markDirty) window.pazatorStore.markDirty('relationships');
            triggerWebhooks('data_changed', { store: 'relationships', action: 'create', id: rel.id });
            return { data: rel, status: 201 };
        }
        if (method === 'DELETE') {
            if (!id) return { error: 'ID required', status: 400 };
            var ok = window.pazatorRelationships.remove(id);
            if (window.pazatorStore && window.pazatorStore.markDirty) window.pazatorStore.markDirty('relationships');
            triggerWebhooks('data_changed', { store: 'relationships', action: 'delete', id: id });
            return ok ? { status: 204 } : { error: 'Not found', status: 404 };
        }
        return { error: 'Method not allowed', status: 405 };
    }

    function handleSearch(params) {
        if (!params || !params.q) return { error: 'Query parameter "q" required', status: 400 };
        var q = params.q.toLowerCase();
        var results = [];
        var stores = ['humans', 'others', 'cases', 'chats'];
        for (var s = 0; s < stores.length; s++) {
            var data = getStoreData(stores[s]);
            for (var i = 0; i < data.length; i++) {
                var item = data[i];
                if (!item) continue;
                var match = false;
                for (var key in item) {
                    if (String(item[key]).toLowerCase().indexOf(q) !== -1) { match = true; break; }
                }
                if (match) results.push({ store: stores[s], item: item });
            }
        }
        return { data: results, status: 200, total: results.length };
    }

    function getStats() {
        var h = getStoreData('humans').length;
        var o = getStoreData('others').length;
        var c = getStoreData('cases').length;
        var ch = getStoreData('chats').length;
        var r = window.pazatorRelationships ? window.pazatorRelationships.getAll().length : 0;
        return { data: { humans: h, others: o, cases: c, chats: ch, relationships: r }, status: 200 };
    }

    // --- GraphQL ---

    function graphqlQuery(query, variables) {
        query = (query || '').trim();
        if (!query) return { error: 'No query provided', status: 400 };

        var isIntrospection = query.indexOf('__schema') !== -1 || query.indexOf('__type') !== -1;
        if (isIntrospection) return buildIntrospection();

        var data = {};
        var errors = [];

        var fieldRegex = /(humans|others|cases|chats|tags|relationships|stats|search)\s*(\(([^)]*)\))?\s*\{([^}]*)\}/g;
        var match;
        while ((match = fieldRegex.exec(query)) !== null) {
            var field = match[1];
            var args = match[3] || '';
            var subfields = match[4] || '';

            try {
                var result;
                if (field === 'search') {
                    var qMatch = args.match(/q:\s*"([^"]+)"/);
                    var qVal = variables && variables.q ? variables.q : (qMatch ? qMatch[1] : '');
                    result = handleSearch({ q: qVal });
                } else if (field === 'stats') {
                    result = getStats();
                } else if (field === 'humans' || field === 'others' || field === 'cases' || field === 'chats') {
                    var idMatch = args.match(/id:\s*"([^"]+)"/);
                    var idVal = variables && variables.id ? variables.id : (idMatch ? idMatch[1] : null);
                    result = handleEntityCRUD(field, idVal ? 'GET' : 'GET', idVal, {});
                } else if (field === 'tags') {
                    result = { data: getStoreData('tags'), status: 200 };
                } else if (field === 'relationships') {
                    var entityMatch = args.match(/entityId:\s*"([^"]+)"/);
                    var entityVal = entityMatch ? entityMatch[1] : null;
                    if (entityVal && window.pazatorRelationships) {
                        result = { data: window.pazatorRelationships.getForEntity(entityVal), status: 200 };
                    } else {
                        result = { data: window.pazatorRelationships ? window.pazatorRelationships.getAll() : [], status: 200 };
                    }
                }
                if (result) data[field] = result.data || result;
            } catch (e) {
                errors.push({ message: e.message, path: [field] });
            }
        }

        logApiCall('GRAPHQL', query, variables);
        var response = { data: data };
        if (errors.length) response.errors = errors;
        return response;
    }

    function buildIntrospection() {
        var types = [
            { kind: 'OBJECT', name: 'Query', fields: [
                { name: 'humans', args: [{ name: 'id', type: { kind: 'SCALAR', name: 'String' } }], type: { kind: 'OBJECT', name: 'Human' } },
                { name: 'others', args: [{ name: 'id', type: { kind: 'SCALAR', name: 'String' } }], type: { kind: 'OBJECT', name: 'Other' } },
                { name: 'cases', args: [{ name: 'id', type: { kind: 'SCALAR', name: 'String' } }], type: { kind: 'OBJECT', name: 'Case' } },
                { name: 'chats', args: [{ name: 'id', type: { kind: 'SCALAR', name: 'String' } }], type: { kind: 'OBJECT', name: 'Chat' } },
                { name: 'tags', type: { kind: 'LIST', ofType: { kind: 'SCALAR', name: 'String' } } },
                { name: 'relationships', args: [{ name: 'entityId', type: { kind: 'SCALAR', name: 'String' } }], type: { kind: 'LIST', ofType: { kind: 'OBJECT', name: 'Relationship' } } },
                { name: 'stats', type: { kind: 'OBJECT', name: 'Stats' } },
                { name: 'search', args: [{ name: 'q', type: { kind: 'NON_NULL', ofType: { kind: 'SCALAR', name: 'String' } } }], type: { kind: 'LIST', ofType: { kind: 'OBJECT', name: 'SearchResult' } } }
            ]}
        ];
        return { data: { __schema: { queryType: { name: 'Query' }, types: types } } };
    }

    // --- Logging ---

    function logApiCall(method, endpoint, params) {
        apiLogs.unshift({
            id: generateId(),
            method: method,
            endpoint: endpoint,
            params: params ? JSON.stringify(params).slice(0, 200) : '',
            timestamp: new Date().toISOString()
        });
        saveLogs();
    }

    function getLogs(page, pageSize) {
        page = Math.max(1, page || 1);
        pageSize = Math.min(100, pageSize || 25);
        var start = (page - 1) * pageSize;
        return {
            items: apiLogs.slice(start, start + pageSize),
            total: apiLogs.length,
            page: page,
            pageSize: pageSize,
            totalPages: Math.ceil(apiLogs.length / pageSize)
        };
    }

    // --- Initialize ---

    var initialized = false;
    function init() {
        if (initialized) return;
        initialized = true;
        loadWebhooks();
        loadLogs();

        if (window.pazatorStore) {
            window.pazatorStore.on('data_changed', function (payload) {
                triggerWebhooks('data_changed', payload);
            });
        }
    }

    // --- UI ---

    var _activeApiTab = 'rest';

    function updateSidebarKey(key) {
        var el = document.getElementById('apiSidebarKey');
        if (!el) return;
        el.innerHTML =
            '<div style="margin-bottom:8px;"><code style="font-size:9px;word-break:break-all;color:var(--text-secondary);">' + key + '</code></div>' +
            '<div style="display:flex;gap:6px;">' +
            '  <button class="btn btn-secondary" onclick="pazatorAPI.copyApiKey()" style="padding:4px 10px;font-size:9px;flex:1;"><i class="fas fa-copy"></i> Copy</button>' +
            '  <button class="btn btn-secondary" onclick="pazatorAPI.regenerateApiKey();pazatorAPI.renderAPIConsole(\'apiTabContent\');" style="padding:4px 10px;font-size:9px;flex:1;"><i class="fas fa-sync"></i> New</button>' +
            '</div>';
    }

    function renderAPIConsole(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var key = getApiKey();

        updateSidebarKey(key);

        container.innerHTML =
            '<div style="display:flex;flex-direction:column;flex:1;overflow:hidden;">' +
            '  <div style="display:flex;gap:0;flex:1;overflow:hidden;">' +
            '    <div style="flex:3;display:flex;flex-direction:column;padding:16px 20px;overflow:hidden;">' +
            '      <div style="display:flex;gap:4px;margin-bottom:12px;border-bottom:1px solid var(--border-color);">' +
            '        <button class="api-tab-btn ' + (_activeApiTab === 'rest' ? 'active' : '') + '" data-tab="rest" style="padding:8px 16px;background:none;border:none;border-bottom:2px solid ' + (_activeApiTab === 'rest' ? 'var(--btn-primary-bg)' : 'transparent') + ';color:' + (_activeApiTab === 'rest' ? 'var(--text-primary)' : 'var(--text-muted)') + ';font-family:var(--font-body);font-size:12px;cursor:pointer;">REST</button>' +
            '        <button class="api-tab-btn ' + (_activeApiTab === 'gql' ? 'active' : '') + '" data-tab="gql" style="padding:8px 16px;background:none;border:none;border-bottom:2px solid ' + (_activeApiTab === 'gql' ? 'var(--btn-primary-bg)' : 'transparent') + ';color:' + (_activeApiTab === 'gql' ? 'var(--text-primary)' : 'var(--text-muted)') + ';font-family:var(--font-body);font-size:12px;cursor:pointer;">GraphQL</button>' +
            '        <button class="api-tab-btn ' + (_activeApiTab === 'logs' ? 'active' : '') + '" data-tab="logs" style="padding:8px 16px;background:none;border:none;border-bottom:2px solid ' + (_activeApiTab === 'logs' ? 'var(--btn-primary-bg)' : 'transparent') + ';color:' + (_activeApiTab === 'logs' ? 'var(--text-primary)' : 'var(--text-muted)') + ';font-family:var(--font-body);font-size:12px;cursor:pointer;">Logs</button>' +
            '      </div>' +
            '      <div id="apiTabBody" style="flex:1;overflow-y:auto;">' + renderActiveTabBody() + '</div>' +
            '    </div>' +
            '    <div style="flex:2;display:flex;flex-direction:column;border-left:1px solid var(--border-color);padding:16px 20px;overflow:hidden;">' +
            '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '        <h3 style="font-size:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;">Response</h3>' +
            '        <button class="btn btn-secondary" onclick="document.getElementById(\'apiResponseOutput\').textContent=\'\'" style="padding:4px 8px;font-size:9px;">Clear</button>' +
            '      </div>' +
            '      <pre id="apiResponseOutput" style="flex:1;overflow:auto;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:7px;padding:12px;font-family:monospace;font-size:11px;color:var(--text-secondary);white-space:pre-wrap;margin:0;"></pre>' +
            '    </div>' +
            '  </div>' +
            '</div>';

        document.querySelectorAll('.api-tab-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                _activeApiTab = btn.getAttribute('data-tab');
                renderAPIConsole(containerId);
            });
        });
    }

    function renderActiveTabBody() {
        if (_activeApiTab === 'rest') {
            return '<div style="display:flex;flex-direction:column;gap:10px;">' +
                '  <div style="display:flex;gap:8px;align-items:center;">' +
                '    <select id="restMethod" class="form-control" style="width:80px;font-size:12px;flex-shrink:0;">' +
                '      <option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option><option value="DELETE">DELETE</option>' +
                '    </select>' +
                '    <input type="text" id="restEndpoint" class="form-control" value="humans" placeholder="humans/{id}" style="flex:1;font-family:monospace;font-size:12px;">' +
                '    <button class="btn btn-primary" onclick="pazatorAPI.executeREST()" style="padding:8px 20px;font-size:12px;flex-shrink:0;"><i class="fas fa-play"></i> Execute</button>' +
                '  </div>' +
                '  <label style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Request Body (JSON, for POST/PUT)</label>' +
                '  <textarea id="restBody" class="form-control" placeholder="{\n  &quot;name&quot;: &quot;John Doe&quot;\n}" style="min-height:100px;font-family:monospace;font-size:11px;resize:vertical;background:rgba(0,0,0,0.2);"></textarea>' +
                '  <div style="font-size:10px;color:var(--text-muted);padding:8px;background:rgba(0,0,0,0.15);border-radius:6px;">' +
                '    <strong>Endpoints:</strong> humans, others, cases, chats, tags, relationships, stats, search?q=...' +
                '  </div>' +
                '</div>';
        } else if (_activeApiTab === 'gql') {
            return '<div style="display:flex;flex-direction:column;gap:10px;height:100%;">' +
                '  <textarea id="gqlQuery" class="form-control" placeholder="{ humans { id name } }" style="flex:1;min-height:160px;font-family:monospace;font-size:11px;resize:vertical;background:rgba(0,0,0,0.2);">{\n  stats {\n    humans\n    others\n    cases\n  }\n}</textarea>' +
                '  <button class="btn btn-primary" onclick="pazatorAPI.executeGraphQL()" style="padding:8px 20px;font-size:12px;align-self:flex-start;"><i class="fas fa-play"></i> Execute</button>' +
                '  <div style="font-size:10px;color:var(--text-muted);padding:8px;background:rgba(0,0,0,0.15);border-radius:6px;">' +
                '    <strong>Fields:</strong> humans(id), others(id), cases(id), chats(id), tags, relationships(entityId), stats, search(q)' +
                '  </div>' +
                '</div>';
        } else if (_activeApiTab === 'logs') {
            return renderLogBody();
        }
        return '';
    }

    function renderLogBody() {
        if (apiLogs.length === 0) {
            return '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:12px;"><i class="fas fa-history" style="font-size:1.5rem;display:block;margin-bottom:8px;opacity:0.3;"></i>No API calls yet</div>';
        }
        var html = '';
        var logs = apiLogs.slice(0, 50);
        for (var i = 0; i < logs.length; i++) {
            var l = logs[i];
            html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03);font-size:11px;">' +
                '<span style="font-weight:700;color:var(--info);width:50px;flex-shrink:0;">' + l.method + '</span>' +
                '<span style="color:var(--text-primary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + l.endpoint + '</span>' +
                '<span style="color:var(--text-muted);font-size:10px;white-space:nowrap;">' + new Date(l.timestamp).toLocaleTimeString() + '</span>' +
                '</div>';
        }
        return '<div style="overflow-y:auto;max-height:100%;">' + html + '</div>';
    }

    function executeREST() {
        var method = document.getElementById('restMethod').value;
        var endpoint = document.getElementById('restEndpoint').value;
        var bodyText = document.getElementById('restBody').value;
        var params = {};
        if (bodyText) {
            try { params = JSON.parse(bodyText); } catch (e) { params = { raw: bodyText }; }
        }
        var result = restQuery(endpoint, method, params);
        var el = document.getElementById('apiResponseOutput');
        if (el) el.textContent = JSON.stringify(result, null, 2);
        renderAPIConsole('apiTabContent');
    }

    function executeGraphQL() {
        var query = document.getElementById('gqlQuery').value;
        var result = graphqlQuery(query);
        var el = document.getElementById('apiResponseOutput');
        if (el) el.textContent = JSON.stringify(result, null, 2);
        renderAPIConsole('apiTabContent');
    }

    function copyApiKey() {
        var el = document.getElementById('apiKeyDisplay');
        if (el) {
            el.select();
            document.execCommand('copy');
            if (window.PazatorUI) PazatorUI.showFloatingNotification('API key copied', 'success');
        }
    }

    function showWebhookManager() {
        var modal = document.getElementById('cleanModal');
        if (!modal) return;
        var title = document.getElementById('cleanModalTitle');
        var body = document.getElementById('cleanModalBody');
        var footer = document.getElementById('cleanModalFooter');
        if (!title || !body || !footer) return;

        title.textContent = 'Webhook Manager';
        var whHtml = '';
        if (webhooks.length === 0) {
            whHtml = '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:12px;"><i class="fas fa-plug" style="font-size:1.5rem;display:block;margin-bottom:8px;opacity:0.3;"></i>No webhooks configured — add one below</div>';
        } else {
            for (var i = 0; i < webhooks.length; i++) {
                var w = webhooks[i];
                whHtml += '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px;">' +
                    '<span style="width:8px;height:8px;border-radius:50%;background:' + (w.enabled ? 'var(--success)' : 'var(--text-muted)') + ';flex-shrink:0;"></span>' +
                    '<div style="flex:1;min-width:0;">' +
                    '  <div style="color:var(--text-primary);">' + w.name + '</div>' +
                    '  <div style="font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + w.url + '</div>' +
                    '</div>' +
                    '<span style="color:var(--text-muted);font-size:10px;flex-shrink:0;">' + (w.events || []).join(', ') + '</span>' +
                    '<button class="btn btn-secondary" onclick="pazatorAPI.removeWebhook(\'' + w.id + '\');pazatorAPI.showWebhookManager();" style="padding:4px 8px;font-size:10px;flex-shrink:0;"><i class="fas fa-times"></i></button>' +
                    '</div>';
            }
        }
        body.innerHTML =
            '<div style="display:flex;flex-direction:column;gap:16px;">' +
            '  <div style="background:rgba(0,0,0,0.15);border:1px solid var(--border-color);border-radius:7px;padding:16px;">' +
            '    <h3 style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">New Webhook</h3>' +
            '    <div style="display:flex;flex-direction:column;gap:10px;">' +
            '      <input type="text" id="whName" class="form-control" placeholder="Webhook name" style="font-size:12px;">' +
            '      <input type="text" id="whUrl" class="form-control" placeholder="https://hooks.example.com/endpoint" style="font-size:12px;">' +
            '      <div style="display:flex;gap:8px;">' +
            '        <select id="whEvents" class="form-control" style="flex:1;font-size:12px;">' +
            '          <option value="data_changed">Data Changed</option>' +
            '          <option value="*">All Events</option>' +
            '        </select>' +
            '        <button class="btn btn-primary" id="addWebhookBtn" style="padding:8px 20px;font-size:12px;white-space:nowrap;"><i class="fas fa-plus"></i> Add</button>' +
            '      </div>' +
            '    </div>' +
            '  </div>' +
            '  <div>' +
            '    <h3 style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">Webhooks</h3>' +
            '    <div id="webhookList">' + whHtml + '</div>' +
            '  </div>' +
            '</div>';
        footer.innerHTML = '<button class="btn btn-secondary" onclick="pazatorAPI.cancelModal()" style="padding:8px 20px;">Close</button>';
        modal.classList.add('active');
        document.getElementById('addWebhookBtn').addEventListener('click', function () {
            var name = document.getElementById('whName').value || 'Unnamed';
            var url = document.getElementById('whUrl').value;
            var events = [document.getElementById('whEvents').value];
            if (!url) { PazatorUI.showFloatingNotification('Webhook URL required', 'warning'); return; }
            addWebhook({ name: name, url: url, events: events });
            PazatorUI.showFloatingNotification('Webhook "' + name + '" added', 'success');
            showWebhookManager();
        });
    }

    function cancelModal() {
        var modal = document.getElementById('cleanModal');
        if (modal) modal.classList.remove('active');
    }

    window.pazatorAPI = {
        init: init,
        restQuery: restQuery,
        graphqlQuery: graphqlQuery,
        getApiKey: getApiKey,
        regenerateApiKey: regenerateApiKey,
        addWebhook: addWebhook,
        removeWebhook: removeWebhook,
        updateWebhook: updateWebhook,
        getWebhook: getWebhook,
        getAllWebhooks: getAllWebhooks,
        triggerWebhooks: triggerWebhooks,
        getLogs: getLogs,
        renderAPIConsole: renderAPIConsole,
        executeREST: executeREST,
        executeGraphQL: executeGraphQL,
        copyApiKey: copyApiKey,
        showWebhookManager: showWebhookManager,
        cancelModal: cancelModal
    };
})();
