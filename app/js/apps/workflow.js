(function () {
    'use strict';

    var STORAGE_KEY = 'pazator_workflow_rules';
    var STORAGE_KEY_SCHEDULES = 'pazator_workflow_schedules';
    var initialized = false;

    var rules = [];
    var schedules = [];
    var scheduleTimers = {};

    var TRIGGERS = [
        { id: 'tab_switch', label: 'Tab Switch', desc: 'User switches tabs', params: [{ name: 'to', type: 'string' }] },
        { id: 'data_added', label: 'Data Added', desc: 'New data is added', params: [{ name: 'count', type: 'number' }] },
        { id: 'threat_detected', label: 'Threat Detected', desc: 'High-risk entries found', params: [{ name: 'count', type: 'number' }] },
        { id: 'search_performed', label: 'Search Performed', desc: 'After a search', params: [{ name: 'query', type: 'string' }] },
        { id: 'app_load', label: 'App Load', desc: 'When application starts', params: [] },
        { id: 'data_changed', label: 'Data Changed', desc: 'Any data store mutation', params: [{ name: 'store', type: 'string' }, { name: 'action', type: 'string' }] },
        { id: 'schedule', label: 'Schedule', desc: 'Time-based trigger', params: [{ name: 'interval', type: 'string' }] }
    ];

    var ACTIONS = [
        { id: 'popup', label: 'Popup Alert', desc: 'Show modal alert dialog', params: [{ name: 'message', type: 'string' }] },
        { id: 'notify', label: 'Notification', desc: 'Show floating notification', params: [{ name: 'message', type: 'string' }] },
        { id: 'toast', label: 'Toast', desc: 'Styled toast message', params: [{ name: 'message', type: 'string' }, { name: 'type', type: 'select', options: ['info', 'success', 'warning', 'error'] }] },
        { id: 'tab', label: 'Switch Tab', desc: 'Navigate to a tab', params: [{ name: 'target', type: 'string' }] },
        { id: 'webhook', label: 'Webhook', desc: 'Call an external URL', params: [{ name: 'url', type: 'string' }, { name: 'method', type: 'select', options: ['GET', 'POST'] }] },
        { id: 'api_call', label: 'API Call', desc: 'Call Pazator API', params: [{ name: 'endpoint', type: 'string' }, { name: 'method', type: 'select', options: ['GET', 'POST', 'PUT', 'DELETE'] }] }
    ];

    function load() {
        try { rules = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) { rules = []; }
        try { schedules = JSON.parse(localStorage.getItem(STORAGE_KEY_SCHEDULES)) || []; } catch (e) { schedules = []; }
    }

    function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(rules)); }
    function saveSchedules() { localStorage.setItem(STORAGE_KEY_SCHEDULES, JSON.stringify(schedules)); }

    function evaluateCondition(condition, eventData) {
        if (!condition || !condition.field) return true;
        var val = eventData[condition.field];
        var target = condition.value;
        switch (condition.op) {
            case '==': return val == target;
            case '!=': return val != target;
            case '>': return parseFloat(val) > parseFloat(target);
            case '<': return parseFloat(val) < parseFloat(target);
            case '>=': return parseFloat(val) >= parseFloat(target);
            case '<=': return parseFloat(val) <= parseFloat(target);
            case 'contains': return String(val).indexOf(String(target)) !== -1;
            default: return true;
        }
    }

    function executeAction(action, eventData) {
        var a = ACTIONS.find(function (x) { return x.id === action.id; });
        if (!a) { console.warn('Unknown action:', action.id); return; }

        var message = action.params ? (action.params.message || 'Workflow triggered') : 'Workflow triggered';
        var type = action.params ? (action.params.type || 'info') : 'info';

        switch (action.id) {
            case 'popup':
                if (window.showModal) window.showModal({ title: 'Workflow', message: message, type: 'info' });
                else alert(message);
                break;
            case 'notify':
                if (window.PazatorUI) PazatorUI.showFloatingNotification(message, 'info', 3000);
                break;
            case 'toast':
                if (window.PazatorUI) PazatorUI.showFloatingNotification(message, type, 3000);
                break;
            case 'tab':
                if (window.switchTab) window.switchTab(action.params.target);
                break;
            case 'webhook':
                if (action.params && action.params.url) {
                    fetch(action.params.url, { method: action.params.method || 'GET', mode: 'no-cors' }).catch(function (e) { console.warn('Webhook failed:', e); });
                }
                break;
            case 'api_call':
                if (action.params && action.params.endpoint && window.pazatorAPI) {
                    window.pazatorAPI.callEndpoint(action.params.endpoint, action.params.method || 'GET').catch(function (e) { console.warn('API call failed:', e); });
                }
                break;
        }
    }

    function fire(event, eventData) {
        var triggered = rules.filter(function (r) {
            if (!r.enabled) return false;
            if (r.trigger !== event) return false;
            if (r.condition && !evaluateCondition(r.condition, eventData || {})) return false;
            return true;
        });
        triggered.forEach(function (r) {
            if (r.action) executeAction(r.action, eventData);
        });
    }

    function init() {
        if (initialized) return;
        initialized = true;
        load();
        startSchedules();

        if (!window._workflowBusInstalled) {
            window._workflowBusInstalled = true;
            var origSwitchTab = window.switchTab;
            if (origSwitchTab) {
                var origStr = origSwitchTab.toString();
                var wrapper = function (tabId) {
                    origSwitchTab(tabId);
                    setTimeout(function () { fire('tab_switch', { to: tabId }); }, 50);
                };
                window.switchTab = wrapper;
            }

            if (window.pazatorStore) {
                var origEmit = window.pazatorStore.emit;
                if (origEmit) {
                    window.pazatorStore.emit = function (event, payload) {
                        origEmit.call(window.pazatorStore, event, payload);
                        if (event === 'data_changed' || event.indexOf('_changed') !== -1) {
                            fire('data_changed', payload || {});
                        }
                    };
                }
            }

            setTimeout(function () { fire('app_load', {}); }, 500);
        }


    }

    function startSchedules() {
        rules.filter(function (r) { return r.trigger === 'schedule' && r.enabled; }).forEach(startScheduleRule);
    }

    function startScheduleRule(rule) {
        if (scheduleTimers[rule.id]) { clearInterval(scheduleTimers[rule.id]); delete scheduleTimers[rule.id]; }
        var interval = rule.condition ? rule.condition.value : null;
        if (!interval) return;
        var ms = parseInterval(interval);
        if (ms <= 0) return;
        scheduleTimers[rule.id] = setInterval(function () {
            fire('schedule', { ruleId: rule.id, interval: interval });
        }, ms);
    }

    function parseInterval(str) {
        var match = str.match(/^(\d+)\s*(s|m|h|d)$/);
        if (!match) return 60000;
        var num = parseInt(match[1]);
        switch (match[2]) {
            case 's': return num * 1000;
            case 'm': return num * 60000;
            case 'h': return num * 3600000;
            case 'd': return num * 86400000;
            default: return 60000;
        }
    }

    function renderWorkflowEngine(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        container.style.cssText = 'display:flex;flex-direction:column;gap:16px;padding:20px;flex:1;overflow-y:auto;';

        var intro = document.createElement('div');
        intro.style.cssText = 'padding:16px 20px;background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;';
        intro.innerHTML = '<div style="display:flex;align-items:flex-start;gap:14px;">' +
            '<div style="width:36px;height:36px;border-radius:8px;background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas fa-diagram-project" style="color:var(--text-secondary);font-size:1rem;"></i></div>' +
            '<div><div style="color:#fff;font-size:0.95rem;font-weight:500;">TASTUR v2 — Workflow Engine</div>' +
            '<div style="color:var(--text-muted);font-size:0.78rem;margin-top:6px;line-height:1.5;">Automate Pazator with rules that follow a simple pattern: <strong style="color:var(--text-secondary);">WHEN</strong> something happens <strong style="color:var(--text-secondary);">IF</strong> a condition is met <strong style="color:var(--text-secondary);">THEN</strong> do an action. Rules fire instantly when triggered.</div></div></div>';
        container.appendChild(intro);

        var ruleList = document.createElement('div');
        ruleList.id = 'wfRuleList';
        ruleList.style.cssText = 'flex:1;overflow-y:auto;';
        container.appendChild(ruleList);

        renderRules();

        var btn = document.getElementById('wfNewRuleBtn');
        if (btn) btn.addEventListener('click', showRuleEditor);
    }

    function renderRules() {
        var list = document.getElementById('wfRuleList');
        if (!list) return;
        list.innerHTML = '';
        var countEl = document.getElementById('wfRuleCount');
        if (countEl) countEl.textContent = rules.length + ' rule' + (rules.length !== 1 ? 's' : '');
        if (!rules.length) {
            list.innerHTML = '<div style="text-align:center;padding:48px 20px;color:var(--text-muted);"><i class="fas fa-robot" style="font-size:2rem;color:#333;display:block;margin-bottom:12px;"></i><div style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:6px;">No workflow rules yet</div><div style="font-size:0.78rem;line-height:1.6;">Rules let you automate actions like showing notifications, switching tabs, or calling webhooks.<br>Click <strong>"New Rule"</strong> to create your first <strong style="color:var(--text-secondary);">WHEN / IF / THEN</strong> rule.</div>' +
                '<div style="margin-top:16px;padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--border-color);border-radius:6px;display:inline-block;font-size:0.75rem;color:var(--text-muted);text-align:left;line-height:1.7;"><strong style="color:var(--text-secondary);">Examples:</strong><br>WHEN tab_switch IF to="threats" THEN popup "Clearance Required"<br>WHEN data_changed THEN notify "Data was modified"<br>WHEN schedule IF interval=5m THEN webhook http://...</div></div>';
            return;
        }
        rules.forEach(function (rule) {
            var card = document.createElement('div');
            card.style.cssText = 'padding:14px 16px;background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;margin-bottom:8px;display:flex;align-items:center;gap:12px;opacity:' + (rule.enabled ? '1' : '0.5') + ';';

            var toggle = document.createElement('button');
            toggle.style.cssText = 'width:36px;height:20px;border-radius:10px;border:none;cursor:pointer;background:' + (rule.enabled ? 'var(--success)' : '#444') + ';position:relative;flex-shrink:0;transition:background 0.2s;';
            var knob = document.createElement('span');
            knob.style.cssText = 'position:absolute;top:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left 0.2s;';
            knob.style.left = rule.enabled ? '18px' : '2px';
            toggle.appendChild(knob);
            toggle.addEventListener('click', function () {
                var updated = window.pazatorWorkflow.toggleRule(rule.id);
                renderRules();
            });
            card.appendChild(toggle);

            var info = document.createElement('div');
            info.style.cssText = 'flex:1;';
            var triggerLabel = TRIGGERS.find(function (t) { return t.id === rule.trigger; });
            var actionLabel = ACTIONS.find(function (a) { return a.id === (rule.action ? rule.action.id : ''); });
            var triggerText = triggerLabel ? triggerLabel.label : rule.trigger;
            var actionText = actionLabel ? actionLabel.label : (rule.action ? rule.action.id : '?');
            var condText = rule.condition ? (' IF ' + rule.condition.field + ' ' + rule.condition.op + ' ' + rule.condition.value) : '';

            info.innerHTML = '<div style="color:#fff;font-size:0.85rem;font-family:monospace;">WHEN ' + triggerText + condText + ' THEN ' + actionText + '</div>' +
                '<div style="color:var(--text-muted);font-size:0.72rem;margin-top:4px;">Rule #' + rule.id.slice(0, 6) + ' &middot; Created ' + new Date(rule.createdAt).toLocaleDateString() + '</div>';
            card.appendChild(info);

            var delBtn = document.createElement('button');
            delBtn.style.cssText = 'background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:0.9rem;padding:4px 8px;';
            delBtn.innerHTML = '<i class="fas fa-trash"></i>';
            delBtn.addEventListener('click', function () {
                if (confirm('Delete this rule?')) {
                    window.pazatorWorkflow.removeRule(rule.id);
                    renderRules();
                    var el = document.getElementById('wfRuleCount');
                    if (el) el.textContent = rules.length;
                }
            });
            card.appendChild(delBtn);

            list.appendChild(card);
        });
    }

    function showRuleEditor(existingRule) {
        var modal = document.createElement('div');
        modal.id = 'wfRuleModal';
        modal.className = 'modal';
        var hasCondition = existingRule && existingRule.condition && existingRule.condition.field;
        modal.innerHTML = '<div class="modal-content" style="max-width:600px;">' +
            '<button class="close" style="position:absolute;top:10px;left:10px;z-index:1001;">&times;</button>' +
            '<div class="modal-header"><h2>' + (existingRule ? 'Edit Rule' : 'New Workflow Rule') + '</h2></div>' +
            '<div class="modal-body">' +

            '<div style="padding:12px 14px;background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:6px;margin-bottom:16px;font-size:0.75rem;color:var(--text-muted);text-align:center;font-family:monospace;">' +
            'WHEN &nbsp; <strong style="color:var(--text-secondary);">trigger</strong>' +
            ' &nbsp; IF &nbsp; <strong style="color:var(--text-secondary);">condition</strong>' +
            ' &nbsp; THEN &nbsp; <strong style="color:var(--text-secondary);">action</strong></div>' +

            '<div class="form-group"><label style="color:#fff;font-size:0.82rem;"><i class="fas fa-bolt" style="color:var(--text-muted);width:18px;"></i> WHEN — Trigger</label>' +
            '<select id="wfTrigger" class="form-control">' +
            TRIGGERS.map(function (t) { return '<option value="' + t.id + '" ' + (existingRule && existingRule.trigger === t.id ? 'selected' : '') + '>' + t.label + ' — ' + t.desc + '</option>'; }).join('') +
            '</select></div>' +

            '<div style="margin:16px 0;">' +
            '<div id="wfCondToggle" style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:8px 12px;background:' + (hasCondition ? 'rgba(255,255,255,0.04)' : 'transparent') + ';border:1px solid ' + (hasCondition ? 'var(--border-color)' : 'transparent') + ';border-radius:6px;user-select:none;">' +
            '<span id="wfCondIcon" style="width:20px;height:20px;border-radius:4px;border:1px solid ' + (hasCondition ? 'var(--success)' : 'var(--border-color)') + ';display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:' + (hasCondition ? 'var(--success)' : 'var(--text-muted)') + ';">' + (hasCondition ? '<i class="fas fa-check"></i>' : '+') + '</span>' +
            '<span style="color:var(--text-secondary);font-size:0.82rem;">IF — Add Condition</span>' +
            '<span style="flex:1;"></span>' +
            '<span id="wfCondStatus" style="font-size:0.72rem;color:' + (hasCondition ? 'var(--success)' : 'var(--text-muted)') + ';">' + (hasCondition ? 'Condition set' : 'Optional') + '</span>' +
            '</div>' +
            '<div id="wfCondSection" style="display:' + (hasCondition ? 'flex' : 'none') + ';gap:8px;align-items:center;margin-top:8px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid var(--border-color);border-radius:6px;">' +
            '<select id="wfCondField" class="form-control" style="flex:1;">' +
            '<option value="">Select field...</option>' +
            '<option value="to" ' + (existingRule && existingRule.condition && existingRule.condition.field === 'to' ? 'selected' : '') + '>Target tab</option>' +
            '<option value="count" ' + (existingRule && existingRule.condition && existingRule.condition.field === 'count' ? 'selected' : '') + '>Count</option>' +
            '<option value="query" ' + (existingRule && existingRule.condition && existingRule.condition.field === 'query' ? 'selected' : '') + '>Search query</option>' +
            '<option value="store" ' + (existingRule && existingRule.condition && existingRule.condition.field === 'store' ? 'selected' : '') + '>Data store</option>' +
            '</select>' +
            '<select id="wfCondOp" class="form-control" style="width:70px;">' +
            ['==', '!=', '>', '<', '>=', '<=', 'contains'].map(function (op) { return '<option value="' + op + '" ' + (existingRule && existingRule.condition && existingRule.condition.op === op ? 'selected' : '') + '>' + op + '</option>'; }).join('') +
            '</select>' +
            '<input type="text" id="wfCondValue" class="form-control" style="width:100px;" placeholder="value" value="' + (existingRule && existingRule.condition ? existingRule.condition.value : '') + '">' +
            '<button id="wfCondRemoveBtn" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:0.9rem;padding:4px;" title="Remove condition"><i class="fas fa-times"></i></button>' +
            '</div></div>' +

            '<div class="form-group"><label style="color:#fff;font-size:0.82rem;"><i class="fas fa-play" style="color:var(--text-muted);width:18px;"></i> THEN — Action</label>' +
            '<select id="wfAction" class="form-control">' +
            ACTIONS.map(function (a) { return '<option value="' + a.id + '" ' + (existingRule && existingRule.action && existingRule.action.id === a.id ? 'selected' : '') + '>' + a.label + ' — ' + a.desc + '</option>'; }).join('') +
            '</select></div>' +
            '<div id="wfActionParams"></div>' +
            '</div>' +
            '<div class="form-actions-horizontal">' +
            '<button id="wfCancelBtn" class="btn-enhanced glass-btn">Cancel</button>' +
            '<button id="wfSaveBtn" class="btn-enhanced btn-primary"><i class="fas fa-save"></i> Save Rule</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(modal);
        setTimeout(function () { modal.classList.add('active'); }, 10);

        modal.querySelector('.close').addEventListener('click', close);
        modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

        function close() { modal.classList.remove('active'); setTimeout(function () { modal.remove(); }, 300); }

        function updateActionParams() {
            var container = document.getElementById('wfActionParams');
            if (!container) return;
            var actionId = document.getElementById('wfAction').value;
            var actionDef = ACTIONS.find(function (a) { return a.id === actionId; });
            if (!actionDef || !actionDef.params.length) { container.innerHTML = ''; return; }
            var existingParams = existingRule && existingRule.action ? existingRule.action.params : {};
            container.innerHTML = actionDef.params.map(function (p) {
                var val = existingParams[p.name] || '';
                if (p.type === 'select') {
                    return '<div class="form-group"><label>' + p.name + '</label><select id="wfParam_' + p.name + '" class="form-control">' +
                        p.options.map(function (o) { return '<option value="' + o + '" ' + (val === o ? 'selected' : '') + '>' + o + '</option>'; }).join('') +
                        '</select></div>';
                }
                return '<div class="form-group"><label>' + p.name + '</label><input type="text" id="wfParam_' + p.name + '" class="form-control" value="' + val + '" placeholder="' + p.name + '"></div>';
            }).join('');
        }

        var condVisible = hasCondition;

        document.getElementById('wfCondToggle').addEventListener('click', function () {
            condVisible = !condVisible;
            var section = document.getElementById('wfCondSection');
            var icon = document.getElementById('wfCondIcon');
            var status = document.getElementById('wfCondStatus');
            section.style.display = condVisible ? 'flex' : 'none';
            icon.style.borderColor = condVisible ? 'var(--success)' : 'var(--border-color)';
            icon.style.color = condVisible ? 'var(--success)' : 'var(--text-muted)';
            icon.innerHTML = condVisible ? '<i class="fas fa-check"></i>' : '+';
            status.textContent = condVisible ? 'Condition set' : 'Optional';
            var toggle = document.getElementById('wfCondToggle');
            toggle.style.background = condVisible ? 'rgba(255,255,255,0.04)' : 'transparent';
            toggle.style.borderColor = condVisible ? 'var(--border-color)' : 'transparent';
        });

        document.getElementById('wfCondRemoveBtn').addEventListener('click', function () {
            condVisible = false;
            document.getElementById('wfCondSection').style.display = 'none';
            document.getElementById('wfCondField').value = '';
            var icon = document.getElementById('wfCondIcon');
            icon.style.borderColor = 'var(--border-color)';
            icon.style.color = 'var(--text-muted)';
            icon.innerHTML = '+';
            document.getElementById('wfCondStatus').textContent = 'Optional';
            var toggle = document.getElementById('wfCondToggle');
            toggle.style.background = 'transparent';
            toggle.style.borderColor = 'transparent';
        });

        document.getElementById('wfAction').addEventListener('change', updateActionParams);
        updateActionParams();

        document.getElementById('wfSaveBtn').addEventListener('click', function () {
            var trigger = document.getElementById('wfTrigger').value;
            var condField = condVisible ? document.getElementById('wfCondField').value : '';
            var condOp = document.getElementById('wfCondOp').value;
            var condValue = document.getElementById('wfCondValue').value;
            var actionId = document.getElementById('wfAction').value;
            var actionDef = ACTIONS.find(function (a) { return a.id === actionId; });
            var actionParams = {};
            if (actionDef) {
                actionDef.params.forEach(function (p) {
                    var el = document.getElementById('wfParam_' + p.name);
                    if (el) actionParams[p.name] = el.value;
                });
            }

            var rule = {
                trigger: trigger,
                condition: condField ? { field: condField, op: condOp, value: condValue } : null,
                action: { id: actionId, params: actionParams }
            };

            if (existingRule) {
                window.pazatorWorkflow.updateRule(existingRule.id, rule);
            } else {
                window.pazatorWorkflow.addRule(rule);
            }

            close();
            renderRules();
            if (window.PazatorUI) PazatorUI.showFloatingNotification('Rule ' + (existingRule ? 'updated' : 'created'), 'success', 2000);
        });

        document.getElementById('wfCancelBtn').addEventListener('click', close);
    }

    window.pazatorWorkflow = {
        init: init,
        renderWorkflowEngine: renderWorkflowEngine,
        getRules: function () { return rules; },
        addRule: function (rule) {
            rule.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            rule.enabled = rule.enabled !== false;
            rule.createdAt = new Date().toISOString();
            rules.push(rule);
            save();
            if (rule.trigger === 'schedule' && rule.enabled) startScheduleRule(rule);
            return rule;
        },
        updateRule: function (id, data) {
            var r = rules.find(function (x) { return x.id === id; });
            if (r) { Object.assign(r, data); save(); }
            return r;
        },
        removeRule: function (id) {
            rules = rules.filter(function (r) { return r.id !== id; });
            save();
            if (scheduleTimers[id]) { clearInterval(scheduleTimers[id]); delete scheduleTimers[id]; }
        },
        toggleRule: function (id) {
            var r = rules.find(function (x) { return x.id === id; });
            if (r) {
                r.enabled = !r.enabled; save();
                if (r.trigger === 'schedule') {
                    if (r.enabled) startScheduleRule(r); else { if (scheduleTimers[id]) { clearInterval(scheduleTimers[id]); delete scheduleTimers[id]; } }
                }
            }
            return r;
        },
        fire: fire,
        getTriggers: function () { return TRIGGERS; },
        getActions: function () { return ACTIONS; },
        getSchedules: function () { return schedules; },
        addSchedule: function (s) {
            s.id = Date.now().toString(36);
            s.createdAt = new Date().toISOString();
            schedules.push(s); saveSchedules();
            return s;
        },
        removeSchedule: function (id) {
            schedules = schedules.filter(function (s) { return s.id !== id; });
            saveSchedules();
        }
    };
})();
