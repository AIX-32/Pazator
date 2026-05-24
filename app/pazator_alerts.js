(function () {
    'use strict';

    var ALERTS_KEY = 'pazator_alerts';
    var RULES_KEY = 'pazator_alert_rules';
    var ALERT_HISTORY_KEY = 'pazator_alert_history';

    var DEFAULT_CHANNELS = {
        notification: { label: 'In-App Notification', icon: 'fa-bell', enabled: true },
        websocket: { label: 'WebSocket Push', icon: 'fa-plug', enabled: false },
        webhook: { label: 'Webhook', icon: 'fa-webhook', enabled: false }
    };

    var alerts = [];
    var rules = [];
    var history = [];
    var wsConnection = null;
    var wsReconnectTimer = null;
    var unlistenFns = [];

    function loadAlerts() {
        try { alerts = JSON.parse(localStorage.getItem(ALERTS_KEY)) || []; } catch (e) { alerts = []; }
    }

    function saveAlerts() {
        localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
    }

    function loadRules() {
        try { rules = JSON.parse(localStorage.getItem(RULES_KEY)) || []; } catch (e) { rules = []; }
    }

    function saveRules() {
        localStorage.setItem(RULES_KEY, JSON.stringify(rules));
    }

    function loadHistory() {
        try { history = JSON.parse(localStorage.getItem(ALERT_HISTORY_KEY)) || []; } catch (e) { history = []; }
    }

    function saveHistory() {
        localStorage.setItem(ALERT_HISTORY_KEY, JSON.stringify(history.slice(-500)));
    }

    function generateId() {
        return 'alert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    }

    function getCurrentDataSnapshot() {
        var snap = { humans: 0, others: 0, cases: 0, chats: 0, relationships: 0 };
        if (window.pazatorStore && window.pazatorStore._data) {
            var d = window.pazatorStore._data;
            snap.humans = (d.humans || []).length;
            snap.others = (d.others || []).length;
            snap.cases = (d.cases || []).length;
            snap.chats = (d.chats || []).length;
        }
        if (window.pazatorRelationships) {
            snap.relationships = window.pazatorRelationships.getAll().length;
        }
        return snap;
    }

    function evaluateCondition(condition, data) {
        if (!condition || !condition.field) return false;
        var actual = data[condition.field];
        var expected = condition.value;
        switch (condition.operator) {
            case 'eq': return String(actual) === String(expected);
            case 'neq': return String(actual) !== String(expected);
            case 'gt': return Number(actual) > Number(expected);
            case 'gte': return Number(actual) >= Number(expected);
            case 'lt': return Number(actual) < Number(expected);
            case 'lte': return Number(actual) <= Number(expected);
            case 'changed': return actual !== undefined;
            case 'contains': return String(actual).indexOf(String(expected)) !== -1;
            default: return false;
        }
    }

    function addRule(config) {
        var rule = {
            id: generateId(),
            name: config.name || 'Unnamed Rule',
            description: config.description || '',
            conditions: config.conditions || [{ field: 'humans', operator: 'gt', value: 0 }],
            logic: config.logic || 'and',
            channel: config.channel || 'notification',
            enabled: config.enabled !== false,
            severity: config.severity || 'info',
            createdAt: new Date().toISOString(),
            lastTriggered: null
        };
        rules.push(rule);
        saveRules();
        return rule;
    }

    function removeRule(id) {
        rules = rules.filter(function (r) { return r.id !== id; });
        saveRules();
    }

    function updateRule(id, config) {
        for (var i = 0; i < rules.length; i++) {
            if (rules[i].id === id) {
                if (config.name !== undefined) rules[i].name = config.name;
                if (config.description !== undefined) rules[i].description = config.description;
                if (config.conditions !== undefined) rules[i].conditions = config.conditions;
                if (config.logic !== undefined) rules[i].logic = config.logic;
                if (config.channel !== undefined) rules[i].channel = config.channel;
                if (config.enabled !== undefined) rules[i].enabled = config.enabled;
                if (config.severity !== undefined) rules[i].severity = config.severity;
                saveRules();
                return rules[i];
            }
        }
        return null;
    }

    function getRule(id) {
        for (var i = 0; i < rules.length; i++) {
            if (rules[i].id === id) return rules[i];
        }
        return null;
    }

    function getAllRules() {
        return rules.slice();
    }

    function evaluateRules(data) {
        var triggered = [];
        for (var i = 0; i < rules.length; i++) {
            var rule = rules[i];
            if (!rule.enabled) continue;
            var results = [];
            for (var j = 0; j < rule.conditions.length; j++) {
                results.push(evaluateCondition(rule.conditions[j], data));
            }
            var fired = rule.logic === 'or'
                ? results.indexOf(true) !== -1
                : results.indexOf(false) === -1;
            if (fired) {
                rule.lastTriggered = new Date().toISOString();
                triggered.push(rule);
                fireAlert(rule, data);
            }
        }
        saveRules();
        return triggered;
    }

    function fireAlert(rule, data) {
        var alert = {
            id: generateId(),
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            channel: rule.channel,
            message: rule.description || 'Alert: ' + rule.name,
            data: data,
            createdAt: new Date().toISOString(),
            acknowledged: false
        };
        alerts.push(alert);
        saveAlerts();
        history.push(alert);
        saveHistory();

        deliverAlert(alert);
        notifyListeners('alert_fired', alert);
    }

    function deliverAlert(alert) {
        if (alert.channel === 'notification' || alert.channel === 'all') {
            var type = alert.severity === 'critical' ? 'error' : alert.severity === 'warning' ? 'warning' : 'info';
            if (window.PazatorUI && window.PazatorUI.showFloatingNotification) {
                window.PazatorUI.showFloatingNotification(alert.message, type);
            }
        }
        if (alert.channel === 'websocket' || alert.channel === 'all') {
            sendWebSocket(alert);
        }
        if (alert.channel === 'webhook' || alert.channel === 'all') {
            sendWebhook(alert);
        }
        notifyListeners('alert_delivered', alert);
    }

    function sendWebSocket(alert) {
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            try {
                wsConnection.send(JSON.stringify({ type: 'alert', payload: alert }));
            } catch (e) {}
        }
    }

    function sendWebhook(alert) {
        var webhookUrl = localStorage.getItem('pazator_webhook_url');
        if (!webhookUrl) return;
        fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'alert', payload: alert })
        }).catch(function () {});
    }

    function connectWebSocket(url) {
        if (wsConnection) {
            wsConnection.close();
            wsConnection = null;
        }
        if (!url) return;
        try {
            wsConnection = new WebSocket(url);
            wsConnection.onopen = function () {
                notifyListeners('ws_connected', { url: url });
                if (window.PazatorUI) {
                    window.PazatorUI.showFloatingNotification('Alert WebSocket connected', 'success');
                }
            };
            wsConnection.onclose = function () {
                notifyListeners('ws_disconnected', {});
                scheduleReconnect(url);
            };
            wsConnection.onerror = function () {
                wsConnection.close();
            };
            wsConnection.onmessage = function (e) {
                try {
                    var msg = JSON.parse(e.data);
                    notifyListeners('ws_message', msg);
                } catch (err) {}
            };
        } catch (e) {
            scheduleReconnect(url);
        }
    }

    function scheduleReconnect(url) {
        if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
        wsReconnectTimer = setTimeout(function () {
            connectWebSocket(url);
        }, 10000);
    }

    function disconnectWebSocket() {
        if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
        if (wsConnection) {
            wsConnection.close();
            wsConnection = null;
        }
    }

    function getAlerts() {
        return alerts.slice();
    }

    function acknowledgeAlert(id) {
        for (var i = 0; i < alerts.length; i++) {
            if (alerts[i].id === id) {
                alerts[i].acknowledged = true;
                saveAlerts();
                return true;
            }
        }
        return false;
    }

    function clearAlerts() {
        alerts = [];
        saveAlerts();
        notifyListeners('alerts_cleared', {});
    }

    function getHistory(page, pageSize) {
        page = Math.max(1, page || 1);
        pageSize = Math.min(100, pageSize || 25);
        var start = (page - 1) * pageSize;
        var items = history.slice(start, start + pageSize);
        return { items: items, total: history.length, page: page, pageSize: pageSize, totalPages: Math.ceil(history.length / pageSize) };
    }

    function getStats() {
        var total = alerts.length;
        var unacknowledged = alerts.filter(function (a) { return !a.acknowledged; }).length;
        var critical = alerts.filter(function (a) { return a.severity === 'critical'; }).length;
        var warning = alerts.filter(function (a) { return a.severity === 'warning'; }).length;
        return { total: total, unacknowledged: unacknowledged, critical: critical, warning: warning };
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
            try { hs[i](data); } catch (e) { console.error('[Alerts] handler error', e); }
        }
    }

    var previousSnapshot = null;
    var checkInterval = null;

    function startMonitoring() {
        previousSnapshot = getCurrentDataSnapshot();
        if (checkInterval) clearInterval(checkInterval);
        checkInterval = setInterval(function () {
            var snap = getCurrentDataSnapshot();
            var changes = {};
            var hasChange = false;
            for (var key in snap) {
                if (snap[key] !== previousSnapshot[key]) {
                    changes[key] = snap[key];
                    hasChange = true;
                }
            }
            if (hasChange) {
                evaluateRules(snap);
                previousSnapshot = snap;
            }
        }, 5000);
    }

    function stopMonitoring() {
        if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
        }
    }

    function subscribeToStoreEvents() {
        if (!window.pazatorStore) return;
        var stores = ['humans', 'others', 'cases', 'chats'];
        for (var i = 0; i < stores.length; i++) {
            (function (storeName) {
                var unsub = window.pazatorStore.on(storeName + '_changed', function () {
                    var snap = getCurrentDataSnapshot();
                    evaluateRules(snap);
                });
                unlistenFns.push(unsub);
            })(stores[i]);
        }
    }

    var initialized = false;
    function init() {
        if (initialized) return;
        initialized = true;
        loadAlerts();
        loadRules();
        loadHistory();
        subscribeToStoreEvents();
        startMonitoring();
        var wsUrl = localStorage.getItem('pazator_alert_ws_url');
        if (wsUrl) connectWebSocket(wsUrl);
    }

    function renderAlertCenter(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var stats = getStats();
        var hasAny = rules.length > 0 || alerts.length > 0;

        var statsHtml = hasAny
            ? '<div style="display:flex;gap:8px;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">' +
                '  <div style="flex:1;background:rgba(244,67,54,0.08);border:1px solid rgba(244,67,54,0.2);border-radius:7px;padding:14px 16px;">' +
                '    <div style="font-size:28px;font-weight:700;color:var(--danger);line-height:1;">' + stats.critical + '</div>' +
                '    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-top:4px;">Critical Alerts</div>' +
                '  </div>' +
                '  <div style="flex:1;background:rgba(0,0,0,0.15);border:1px solid var(--border-color);border-radius:7px;padding:14px 16px;">' +
                '    <div style="font-size:22px;font-weight:600;color:var(--warning);line-height:1;">' + stats.unacknowledged + '</div>' +
                '    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-top:4px;">Unread</div>' +
                '  </div>' +
                '  <div style="flex:1;background:rgba(0,0,0,0.15);border:1px solid var(--border-color);border-radius:7px;padding:14px 16px;">' +
                '    <div style="font-size:22px;font-weight:600;color:var(--text-primary);line-height:1;">' + stats.total + '</div>' +
                '    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-top:4px;">Total</div>' +
                '  </div>' +
                '  <div style="flex:1;background:rgba(0,0,0,0.15);border:1px solid var(--border-color);border-radius:7px;padding:14px 16px;">' +
                '    <div style="font-size:22px;font-weight:600;color:var(--text-primary);line-height:1;">' + rules.length + '</div>' +
                '    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-top:4px;">Rules</div>' +
                '  </div>' +
                '</div>'
            : '';

        container.innerHTML =
            '<div style="display:flex;flex-direction:column;flex:1;overflow:hidden;">' +
            statsHtml +
            '  <div id="alertRuleList" style="flex:1;overflow-y:auto;padding:16px 20px;"></div>' +
            '</div>';
        renderRuleList();
        updateSidebarStats();
    }

    function updateSidebarStats() {
        var el = document.getElementById('alertSidebarStats');
        if (!el) return;
        var stats = getStats();
        el.innerHTML =
            '<div style="display:flex;flex-direction:column;gap:6px;">' +
            '  <div style="display:flex;justify-content:space-between;font-size:11px;"><span>Total</span><strong style="color:var(--text-primary);">' + stats.total + '</strong></div>' +
            '  <div style="display:flex;justify-content:space-between;font-size:11px;"><span>Unread</span><strong style="color:var(--warning);">' + stats.unacknowledged + '</strong></div>' +
            '  <div style="display:flex;justify-content:space-between;font-size:11px;"><span>Critical</span><strong style="color:var(--danger);">' + stats.critical + '</strong></div>' +
            '  <div style="display:flex;justify-content:space-between;font-size:11px;"><span>Rules</span><strong style="color:var(--text-primary);">' + rules.length + '</strong></div>' +
            '</div>';
    }

    function renderRuleList() {
        var el = document.getElementById('alertRuleList');
        if (!el) return;

        if (rules.length === 0 && alerts.length === 0) {
            el.innerHTML =
                '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;padding:40px 20px;">' +
                '  <i class="fas fa-bell-slash" style="font-size:3rem;color:var(--text-muted);opacity:0.2;margin-bottom:16px;"></i>' +
                '  <h3 style="font-family:var(--font-body);font-size:15px;color:var(--text-secondary);margin-bottom:6px;">No alert rules yet</h3>' +
                '  <p style="font-size:12px;color:var(--text-muted);max-width:360px;margin-bottom:20px;">Create rules to get notified when data thresholds are crossed, entities change, or AI detects anomalies.</p>' +
                '  <button class="btn btn-primary" onclick="pazatorAlerts.showNewRule()" style="padding:10px 24px;font-size:13px;"><i class="fas fa-plus"></i> Create Your First Rule</button>' +
                '</div>';
            return;
        }

        var html = '';
        for (var i = 0; i < rules.length; i++) {
            var r = rules[i];
            var sevColor = r.severity === 'critical' ? 'var(--danger)' : r.severity === 'warning' ? 'var(--warning)' : 'var(--info)';
            var condStr = '';
            for (var j = 0; j < r.conditions.length; j++) {
                var c = r.conditions[j];
                if (j > 0) condStr += ', ';
                condStr += c.field + ' ' + c.operator + ' ' + c.value;
            }
            html += '<div style="display:flex;align-items:center;gap:14px;padding:14px 16px;margin-bottom:6px;border:1px solid var(--border-color);border-radius:7px;background:var(--card-bg);">' +
                '  <div style="display:flex;flex-direction:column;align-items:center;gap:2px;width:40px;flex-shrink:0;">' +
                '    <span style="width:10px;height:10px;border-radius:50%;background:' + sevColor + ';"></span>' +
                '    <span style="font-size:8px;text-transform:uppercase;color:' + sevColor + ';letter-spacing:0.05em;">' + r.severity + '</span>' +
                '  </div>' +
                '  <div style="flex:1;min-width:0;">' +
                '    <div style="display:flex;align-items:center;gap:8px;">' +
                '      <span style="font-size:14px;font-weight:500;color:var(--text-primary);">' + r.name + '</span>' +
                '      <label style="display:flex;align-items:center;gap:4px;margin-left:auto;"><input type="checkbox" ' + (r.enabled ? 'checked' : '') + ' onchange="pazatorAlerts.toggleRule(\'' + r.id + '\')" style="accent-color:var(--success);width:14px;height:14px;"> <span style="font-size:10px;color:var(--text-muted);">Active</span></label>' +
                '    </div>' +
                '    <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + (r.description || condStr) + '</div>' +
                '    <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">' +
                '      <span>Last triggered: ' + (r.lastTriggered ? new Date(r.lastTriggered).toLocaleString() : 'Never') + '</span>' +
                '      <span style="margin:0 8px;">·</span>' +
                '      <span>Channel: ' + r.channel + '</span>' +
                '    </div>' +
                '  </div>' +
                '  <button class="btn btn-secondary" onclick="pazatorAlerts.removeRule(\'' + r.id + '\');pazatorAlerts.renderAlertCenter(\'alertTabContent\');" style="padding:6px 10px;font-size:11px;flex-shrink:0;"><i class="fas fa-trash"></i></button>' +
                '</div>';
        }

        if (alerts.length > 0) {
            html += '<div style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.06);">' +
                '  <div onclick="var n=document.getElementById(\'alertHistoryBody\');n.style.display=n.style.display===\'none\'?\'block\':\'none\'" style="padding:12px 4px;display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text-muted);user-select:none;">' +
                '    <i class="fas fa-stream"></i> Alert History <span style="font-size:10px;color:var(--text-muted);">(' + alerts.length + ')</span>' +
                '    <i class="fas fa-chevron-down" style="margin-left:auto;font-size:10px;"></i>' +
                '  </div>' +
                '  <div id="alertHistoryBody" style="display:none;">';
            var recent = alerts.slice(0, 30);
            for (var i = 0; i < recent.length; i++) {
                var a = recent[i];
                var sc = a.severity === 'critical' ? 'var(--danger)' : a.severity === 'warning' ? 'var(--warning)' : 'var(--info)';
                html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid rgba(255,255,255,0.03);font-size:11px;">' +
                    '  <span style="width:6px;height:6px;border-radius:50%;background:' + sc + ';flex-shrink:0;"></span>' +
                    '  <span style="flex:1;color:var(--text-primary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + a.ruleName + '</span>' +
                    '  <span style="color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + a.message + '</span>' +
                    '  <span style="color:var(--text-muted);font-size:9px;white-space:nowrap;">' + new Date(a.createdAt).toLocaleString() + '</span>' +
                    '  ' + (a.acknowledged ? '<span style="color:var(--success);font-size:9px;">Seen</span>' : '<button class="btn btn-secondary" onclick="pazatorAlerts.acknowledgeAlert(\'' + a.id + '\');pazatorAlerts.renderAlertCenter(\'alertTabContent\');" style="padding:2px 8px;font-size:9px;">Ack</button>') +
                    '</div>';
            }
            html += '  </div></div>';
        }

        el.innerHTML = html;
    }

    function showNewRule() {
        var modal = document.getElementById('cleanModal');
        if (!modal) return;
        var title = document.getElementById('cleanModalTitle');
        var body = document.getElementById('cleanModalBody');
        var footer = document.getElementById('cleanModalFooter');
        if (!title || !body || !footer) return;

        title.textContent = 'New Alert Rule';
        body.innerHTML =
            '<div style="display:flex;flex-direction:column;gap:16px;">' +
            '  <div class="form-group">' +
            '    <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Rule Name</label>' +
            '    <input type="text" id="ruleName" class="form-control" placeholder="e.g. High Risk Entity Detected" style="margin-top:4px;" autofocus>' +
            '  </div>' +
            '  <div class="form-group">' +
            '    <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Alert Message</label>' +
            '    <input type="text" id="ruleDesc" class="form-control" placeholder="Message to show when triggered" style="margin-top:4px;">' +
            '  </div>' +
            '  <div class="form-group">' +
            '    <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Threshold Condition</label>' +
            '    <div style="display:flex;gap:8px;margin-top:4px;align-items:center;">' +
            '      <select id="ruleField" class="form-control" style="flex:1;font-size:12px;">' +
            '        <option value="humans">Humans Count</option>' +
            '        <option value="others">Others Count</option>' +
            '        <option value="cases">Cases Count</option>' +
            '        <option value="chats">Chats Count</option>' +
            '        <option value="relationships">Relationships Count</option>' +
            '      </select>' +
            '      <select id="ruleOperator" class="form-control" style="width:70px;font-size:12px;">' +
            '        <option value="gt">&gt;</option>' +
            '        <option value="gte">&gt;=</option>' +
            '        <option value="lt">&lt;</option>' +
            '        <option value="lte">&lt;=</option>' +
            '        <option value="eq">=</option>' +
            '        <option value="neq">≠</option>' +
            '      </select>' +
            '      <input type="number" id="ruleValue" class="form-control" value="0" style="width:80px;font-size:12px;">' +
            '    </div>' +
            '  </div>' +
            '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
            '    <div class="form-group">' +
            '      <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Severity</label>' +
            '      <select id="ruleSeverity" class="form-control" style="margin-top:4px;font-size:12px;">' +
            '        <option value="info">Info</option>' +
            '        <option value="warning">Warning</option>' +
            '        <option value="critical">Critical</option>' +
            '      </select>' +
            '    </div>' +
            '    <div class="form-group">' +
            '      <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Delivery Channel</label>' +
            '      <select id="ruleChannel" class="form-control" style="margin-top:4px;font-size:12px;">' +
            '        <option value="notification">In-App Notification</option>' +
            '        <option value="websocket">WebSocket</option>' +
            '        <option value="webhook">Webhook</option>' +
            '        <option value="all">All Channels</option>' +
            '      </select>' +
            '    </div>' +
            '  </div>' +
            '</div>';

        footer.innerHTML =
            '<button class="btn btn-secondary" onclick="pazatorAlerts.cancelModal()" style="padding:8px 20px;">Cancel</button>' +
            '<button class="btn btn-primary" id="createRuleBtn" style="padding:8px 20px;"><i class="fas fa-bell"></i> Create Rule</button>';

        modal.classList.add('active');

        document.getElementById('createRuleBtn').addEventListener('click', function () {
            var name = document.getElementById('ruleName').value || 'Unnamed Rule';
            var desc = document.getElementById('ruleDesc').value || '';
            var field = document.getElementById('ruleField').value;
            var operator = document.getElementById('ruleOperator').value;
            var value = document.getElementById('ruleValue').value;
            var severity = document.getElementById('ruleSeverity').value;
            var channel = document.getElementById('ruleChannel').value;
            addRule({
                name: name,
                description: desc,
                conditions: [{ field: field, operator: operator, value: value }],
                severity: severity,
                channel: channel
            });
            modal.classList.remove('active');
            renderAlertCenter('alertTabContent');
            PazatorUI.showFloatingNotification('Alert rule "' + name + '" created', 'success');
        });
    }

    function showSettings() {
        var modal = document.getElementById('cleanModal');
        if (!modal) return;
        var title = document.getElementById('cleanModalTitle');
        var body = document.getElementById('cleanModalBody');
        var footer = document.getElementById('cleanModalFooter');
        if (!title || !body || !footer) return;

        var wsUrl = localStorage.getItem('pazator_alert_ws_url') || '';
        var whUrl = localStorage.getItem('pazator_webhook_url') || '';

        title.textContent = 'Alert Settings';
        body.innerHTML =
            '<div style="display:flex;flex-direction:column;gap:16px;">' +
            '  <div style="background:rgba(0,0,0,0.15);border:1px solid var(--border-color);border-radius:7px;padding:16px;">' +
            '    <h3 style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;"><i class="fas fa-plug"></i> WebSocket</h3>' +
            '    <div class="form-group">' +
            '      <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Server URL</label>' +
            '      <input type="text" id="wsUrlSetting" class="form-control" value="' + wsUrl + '" placeholder="wss://your-server.com/ws" style="margin-top:4px;">' +
            '      <small style="font-size:10px;color:var(--text-muted);margin-top:4px;display:block;">Leave empty to disable WebSocket connections</small>' +
            '    </div>' +
            '  </div>' +
            '  <div style="background:rgba(0,0,0,0.15);border:1px solid var(--border-color);border-radius:7px;padding:16px;">' +
            '    <h3 style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;"><i class="fas fa-webhook"></i> Webhook</h3>' +
            '    <div class="form-group">' +
            '      <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Endpoint URL</label>' +
            '      <input type="text" id="whUrlSetting" class="form-control" value="' + whUrl + '" placeholder="https://hooks.example.com/alerts" style="margin-top:4px;">' +
            '      <small style="font-size:10px;color:var(--text-muted);margin-top:4px;display:block;">POST endpoint for alert webhook delivery</small>' +
            '    </div>' +
            '  </div>' +
            '</div>';

        footer.innerHTML =
            '<button class="btn btn-secondary" onclick="pazatorAlerts.cancelModal()" style="padding:8px 20px;">Cancel</button>' +
            '<button class="btn btn-primary" id="saveAlertSettings" style="padding:8px 20px;"><i class="fas fa-save"></i> Save</button>';

        modal.classList.add('active');

        document.getElementById('saveAlertSettings').addEventListener('click', function () {
            var newWsUrl = document.getElementById('wsUrlSetting').value.trim();
            var newWhUrl = document.getElementById('whUrlSetting').value.trim();
            localStorage.setItem('pazator_alert_ws_url', newWsUrl);
            localStorage.setItem('pazator_webhook_url', newWhUrl);
            if (newWsUrl) {
                connectWebSocket(newWsUrl);
            } else {
                disconnectWebSocket();
            }
            modal.classList.remove('active');
            PazatorUI.showFloatingNotification('Alert settings saved', 'success');
        });
    }

    function toggleRule(id) {
        var rule = getRule(id);
        if (rule) {
            rule.enabled = !rule.enabled;
            saveRules();
            renderAlertCenter('alertTabContent');
        }
    }

    function cancelModal() {
        var modal = document.getElementById('cleanModal');
        if (modal) modal.classList.remove('active');
    }

    window.pazatorAlerts = {
        init: init,
        addRule: addRule,
        removeRule: removeRule,
        updateRule: updateRule,
        getRule: getRule,
        getAllRules: getAllRules,
        getAlerts: getAlerts,
        acknowledgeAlert: acknowledgeAlert,
        clearAlerts: clearAlerts,
        getHistory: getHistory,
        getStats: getStats,
        evaluateRules: evaluateRules,
        connectWebSocket: connectWebSocket,
        disconnectWebSocket: disconnectWebSocket,
        startMonitoring: startMonitoring,
        stopMonitoring: stopMonitoring,
        renderAlertCenter: renderAlertCenter,
        renderRuleList: renderRuleList,
        showNewRule: showNewRule,
        showSettings: showSettings,
        toggleRule: toggleRule,
        cancelModal: cancelModal,
        on: on
    };
})();
