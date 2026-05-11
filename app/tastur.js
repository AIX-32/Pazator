/**
 * TASTUR Rule Engine
 * Handles custom triggers and actions within the Pazator application.
 */

const Tastur = {
    rules: [],
    triggers: ['tab_switch', 'data_added', 'threat_detected', 'search_performed', 'app_load'],

    init() {
        console.log('TASTUR: Initializing engine...');
        this.loadRules();
        this.renderRules();
        this.attachEventListeners();
        
        // Emit app_load trigger
        setTimeout(() => this.emit('app_load'), 1000);
    },

    attachEventListeners() {
        const saveBtn = document.getElementById('tasturSaveBtn');
        if (saveBtn) {
            saveBtn.onclick = () => this.saveFromEditor();
        }

        const copyBtn = document.getElementById('tasturCopyPromptBtn');
        if (copyBtn) {
            copyBtn.onclick = () => this.copyPrompt();
        }
    },

    copyPrompt() {
        const instructions = `I need you to write automation rules for the Pazator "TASTUR" engine. 
The syntax is: WHEN [trigger] IF [condition] THEN [action]

TRIGGERS:
- tab_switch (data: 'to' which is the tab ID)
- data_added (data: 'count' of total items)
- threat_detected (data: 'count' of high-risk items)
- search_performed (data: 'query' text)
- app_load

ACTIONS:
- popup "Message" (Shows a modal alert)
- notify "Message" (Shows a floating toast notification, type: info)
- toast "Message" (Shows a floating toast notification, defaults to info)
- toast "Message" error (Shows a toast with type: info/success/warning/error)
- tab "tab-id" (Switches to a specific tab)

TAB IDs: dashboard, analysis, threats, chat-control, search, agents, articles, tracker, cases, tastur

EXAMPLE RULES:
- WHEN tab_switch IF to="threats" THEN popup "Security Clearance Required"
- WHEN threat_detected IF count > 5 THEN notify "High threat volume detected!"
- WHEN search_performed IF query="classified" THEN alert "Restricted Search Logged"
- WHEN data_added THEN toast "Data saved successfully" success
- WHEN threat_detected IF count > 10 THEN toast "Critical threat level" error

Please provide the rules in plain text, one per line.`;

        navigator.clipboard.writeText(instructions).then(() => {
            showAlert('AI Instructions copied to clipboard! You can now paste this into ChatGPT/Claude to help write your rules.', 'TASTUR', 'success');
        }).catch(err => {
            console.error('Failed to copy!', err);
            showAlert('Failed to copy to clipboard.', 'Error', 'error');
        });
    },

    loadRules() {
        const saved = localStorage.getItem('tastur_rules');
        if (saved) {
            try {
                this.rules = JSON.parse(saved);
            } catch (e) {
                console.error('TASTUR: Failed to parse rules', e);
                this.rules = [];
            }
        }
    },

    saveRules() {
        localStorage.setItem('tastur_rules', JSON.stringify(this.rules));
        this.renderRules();
    },

    saveFromEditor() {
        const editor = document.getElementById('tasturEditor');
        if (!editor) return;

        const content = editor.value.trim();
        if (!content) return;

        const lines = content.split('\n');
        let newRulesCount = 0;

        lines.forEach(line => {
            const rule = this.parseRule(line.trim());
            if (rule) {
                this.rules.push(rule);
                newRulesCount++;
            }
        });

        if (newRulesCount > 0) {
            this.saveRules();
            editor.value = '';
            showAlert(`Successfully added ${newRulesCount} rule(s).`, 'TASTUR', 'success');
        } else {
            showAlert('No valid rules found in editor. Use format: WHEN [trigger] IF [condition] THEN [action]', 'TASTUR', 'warning');
        }
    },

    parseRule(line) {
        if (!line || line.startsWith('#')) return null;

        // Simple Regex for: WHEN trigger [IF condition] THEN action
        const regex = /^WHEN\s+(\w+)(?:\s+IF\s+(.+?))?\s+THEN\s+(.+)$/i;
        const match = line.match(regex);

        if (match) {
            return {
                id: Date.now() + Math.random().toString(36).substr(2, 9),
                raw: line,
                trigger: match[1].toLowerCase(),
                condition: match[2] ? match[2].trim() : null,
                action: match[3].trim(),
                enabled: true
            };
        }
        return null;
    },

    renderRules() {
        const container = document.getElementById('tasturRuleList');
        if (!container) return;

        if (this.rules.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #666; padding: 40px;">No rules defined.</div>';
            return;
        }

        container.innerHTML = this.rules.map((rule, index) => `
            <div class="tastur-rule-item" style="opacity: ${rule.enabled ? 1 : 0.5}">
                <div class="tastur-rule-header">
                    <span class="tastur-rule-trigger">${rule.trigger}</span>
                    <div class="tastur-rule-actions">
                        <button class="tastur-btn-mini" onclick="Tastur.toggleRule('${rule.id}')">
                            ${rule.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button class="tastur-btn-mini danger" onclick="Tastur.deleteRule('${rule.id}')">
                            Delete
                        </button>
                    </div>
                </div>
                <div class="tastur-rule-code">${rule.raw}</div>
            </div>
        `).join('');
    },

    toggleRule(id) {
        const rule = this.rules.find(r => r.id === id);
        if (rule) {
            rule.enabled = !rule.enabled;
            this.saveRules();
        }
    },

    deleteRule(id) {
        this.rules = this.rules.filter(r => r.id !== id);
        this.saveRules();
    },

    emit(trigger, data = {}) {
        console.log(`TASTUR: Triggering event "${trigger}"`, data);
        this.rules.forEach(rule => {
            if (rule.enabled && rule.trigger === trigger) {
                this.executeRule(rule, data);
            }
        });
    },

    executeRule(rule, data) {
        // Evaluate condition if present
        if (rule.condition) {
            if (!this.evaluateCondition(rule.condition, data)) {
                return;
            }
        }

        // Execute action
        this.performAction(rule.action, data);
    },

    evaluateCondition(condition, data) {
        try {
            // Simple evaluation: support things like to="analysis" or query="test"
            // We use a safe-ish approach by replacing variables
            let evalStr = condition;
            
            // Replace common variables from data
            for (const [key, value] of Object.entries(data)) {
                const regex = new RegExp(`\\b${key}\\b`, 'g');
                evalStr = evalStr.replace(regex, JSON.stringify(value));
            }

            // Simple comparison support (== or =)
            evalStr = evalStr.replace(/=/g, '===');
            
            // Evaluate
            // eslint-disable-next-line no-eval
            return eval(evalStr);
        } catch (e) {
            console.error('TASTUR: Condition evaluation failed', e, condition);
            return false;
        }
    },

    performAction(actionStr, data) {
        console.log('TASTUR: Performing action:', actionStr);
        
        // Parse action format: type "argument" [type2]
        const match = actionStr.match(/^(\w+)\s+['"](.+?)['"]\s*(\w+)?$/i) || actionStr.match(/^(\w+)$/i);
        if (!match) return;

        const actionType = match[1].toLowerCase();
        const arg = match[2] || '';
        const arg2 = match[3] || '';

        switch (actionType) {
            case 'popup':
            case 'alert':
                showAlert(arg, 'TASTUR Automation');
                break;
            case 'notify':
                if (typeof showFloatingNotification === 'function') {
                    showFloatingNotification(arg, 'info');
                } else {
                    showAlert(arg, 'TASTUR Notification');
                }
                break;
            case 'toast':
                if (typeof showFloatingNotification === 'function') {
                    const types = ['info', 'success', 'warning', 'error'];
                    const type = types.includes(arg2) ? arg2 : 'info';
                    showFloatingNotification(arg, type);
                } else {
                    showAlert(arg, 'TASTUR Toast');
                }
                break;
            case 'tab':
                if (window.switchTab) {
                    switchTab(arg);
                }
                break;
            default:
                console.warn('TASTUR: Unknown action type', actionType);
        }
    }
};

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure other systems are ready
    setTimeout(() => Tastur.init(), 500);
});
