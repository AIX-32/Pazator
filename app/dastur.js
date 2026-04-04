(function () {
    'use strict';

    const KV_KEY = 'pazator:dastur_rules:v1';
    const WATCH_INTERVAL_MS = 900;

    const ctx = window.pazator_context;
    if (!ctx) {
        console.warn('[DASTUR] pazator_context missing. DASTUR disabled.');
        return;
    }

    const ui = {
        event: document.getElementById('dasturEvent'),
        condition: document.getElementById('dasturCondition'),
        action: document.getElementById('dasturAction'),
        note: document.getElementById('dasturActionNote'),
        addBtn: document.getElementById('dasturAddRuleBtn'),
        manualBtn: document.getElementById('dasturTriggerManualBtn'),
        list: document.getElementById('dasturRulesList'),
        exportBtn: document.getElementById('dasturExportBtn'),
        importBtn: document.getElementById('dasturImportBtn'),
        importInput: document.getElementById('dasturImportInput'),
        importModal: document.getElementById('dasturImportModal'),
        importModalClose: document.getElementById('dasturImportModalClose'),
        importCancel: document.getElementById('dasturImportCancel'),
        importConfirm: document.getElementById('dasturImportConfirm'),
        aiPromptBtn: document.getElementById('dasturAiPromptBtn')
    };

    function uid() {
        try { return crypto.randomUUID(); } catch { }
        return `r_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
    }

    function normalizeRule(rule) {
        if (!rule || typeof rule !== 'object') return null;
        return {
            id: typeof rule.id === 'string' ? rule.id : uid(),
            enabled: typeof rule.enabled === 'boolean' ? rule.enabled : true,
            event: typeof rule.event === 'string' ? rule.event : 'state_changed',
            condition: typeof rule.condition === 'string' ? rule.condition : '',
            action: typeof rule.action === 'string' ? rule.action : 'hojum_propose',
            note: typeof rule.note === 'string' ? rule.note : '',
            createdAt: typeof rule.createdAt === 'string' ? rule.createdAt : new Date().toISOString()
        };
    }

    let rules = [];
    const firedCooldown = new Map(); // ruleId -> lastFiredMs

    async function loadRules() {
        try {
            const raw = await ctx.kv.get(KV_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.map(normalizeRule).filter(Boolean);
        } catch (e) {
            console.warn('[DASTUR] failed to load rules', e);
            return [];
        }
    }

    async function saveRules() {
        try {
            await ctx.kv.set(KV_KEY, JSON.stringify(rules));
        } catch (e) {
            console.warn('[DASTUR] failed to save rules', e);
        }
    }

    function ruleSummary(rule) {
        const cond = rule.condition?.trim() ? `IF ${rule.condition.trim()}` : 'IF (true)';
        return `WHEN ${rule.event} • ${cond} • DO ${rule.action}`;
    }

    function renderRules() {
        if (!ui.list) return;
        ui.list.innerHTML = '';

        if (!rules.length) {
            const empty = document.createElement('div');
            empty.className = 'dastur-rule-row';
            empty.innerHTML = `
                <div>
                    <div>NO RULES</div>
                    <div class="meta">Add one above. Example: state.pazatorData.humans.length &gt; 50</div>
                </div>
                <div class="controls"></div>
            `;
            ui.list.appendChild(empty);
            return;
        }

        for (const rule of rules) {
            const row = document.createElement('div');
            row.className = 'dastur-rule-row';
            row.classList.toggle('disabled', !rule.enabled);
            row.dataset.event = rule.event;
            row.dataset.action = rule.action;

            const left = document.createElement('div');
            left.innerHTML = `
                <div>${escapeHtml(ruleSummary(rule))}</div>
                <div class="meta">${escapeHtml(rule.createdAt)} • ${rule.enabled ? 'ENABLED' : 'DISABLED'}</div>
            `;

            const controls = document.createElement('div');
            controls.className = 'controls';

            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'dastur-mini-btn';
            toggleBtn.textContent = rule.enabled ? 'Disable' : 'Enable';
            toggleBtn.addEventListener('click', async () => {
                rule.enabled = !rule.enabled;
                await saveRules();
                renderRules();
            });

            const fireBtn = document.createElement('button');
            fireBtn.className = 'dastur-mini-btn';
            fireBtn.textContent = 'Fire';
            fireBtn.title = 'Manual trigger for this rule';
            fireBtn.addEventListener('click', () => notifyEvent('manual', { ruleId: rule.id, source: 'manual_rule_fire' }));

            const delBtn = document.createElement('button');
            delBtn.className = 'dastur-mini-btn danger';
            delBtn.textContent = 'Del';
            delBtn.addEventListener('click', async () => {
                rules = rules.filter(r => r.id !== rule.id);
                firedCooldown.delete(rule.id);
                await saveRules();
                renderRules();
            });

            controls.appendChild(toggleBtn);
            controls.appendChild(fireBtn);
            controls.appendChild(delBtn);

            row.appendChild(left);
            row.appendChild(controls);
            ui.list.appendChild(row);
        }
    }

    function escapeHtml(s) {
        return String(s ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function evaluateCondition(condition, eventPayload) {
        const trimmed = String(condition || '').trim();
        if (!trimmed) return true;

        const state = ctx.getSerializableContext();
        const event = eventPayload || {};

        const helpers = {
            countHumans() {
                const humans = state?.pazatorData?.humans;
                return Array.isArray(humans) ? humans.length : 0;
            },
            countOthers() {
                const others = state?.pazatorData?.others;
                return Array.isArray(others) ? others.length : 0;
            }
        };

        try {
            // Condition is a JS expression evaluated with (state, event, helpers).
            // Example: state.pazatorData.humans.length > 10 && event.name === 'state_changed'
            // eslint-disable-next-line no-new-func
            const fn = new Function('state', 'event', 'helpers', `"use strict"; return (${trimmed});`);
            return !!fn(state, event, helpers);
        } catch (e) {
            console.warn('[DASTUR] condition eval failed:', e);
            return false;
        }
    }

    async function executeAction(rule, eventName, eventPayload) {
        const action = rule.action;
        const payload = { eventName, eventPayload, ruleId: rule.id, note: rule.note || '' };

        if (action === 'sarparast_flash') {
            ctx.ui.flashSarparast();
            return;
        }

        if (action === 'hojum_propose') {
            if (ctx.hojum && typeof ctx.hojum.proposeFromDastur === 'function') {
                await ctx.hojum.proposeFromDastur(rule, payload);
            } else {
                console.warn('[DASTUR] HOJUM module not ready yet.');
            }
            return;
        }

        console.warn('[DASTUR] unknown action:', action);
    }

    async function runMatchingRules(eventName, eventPayload) {
        const now = Date.now();
        for (const rule of rules) {
            if (!rule.enabled) continue;
            if (rule.event !== eventName) continue;

            const last = firedCooldown.get(rule.id) || 0;
            if (now - last < 1500) continue;

            const ok = evaluateCondition(rule.condition, { name: eventName, ...eventPayload });
            if (!ok) continue;

            firedCooldown.set(rule.id, now);
            try {
                await executeAction(rule, eventName, eventPayload);
            } catch (e) {
                console.error('[DASTUR] action failed', e);
            }
        }
    }

    function notifyEvent(eventName, eventPayload) {
        ctx.emit(`dastur:${eventName}`, eventPayload || {});
        runMatchingRules(eventName, eventPayload || {});
    }

    function hashString(s) {
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
        return h >>> 0;
    }

    let lastDigest = 0;

    function computeDigest() {
        try {
            const snap = ctx.getSerializableContext();
            const str = JSON.stringify({
                pazatorData: snap.pazatorData,
                tags: snap.tags
            });
            return hashString(str);
        } catch {
            return Date.now();
        }
    }

    function startWatcher() {
        lastDigest = computeDigest();
        window.setInterval(() => {
            const d = computeDigest();
            if (d !== lastDigest) {
                lastDigest = d;
                notifyEvent('state_changed', { digest: d, source: 'watcher' });
            }
        }, WATCH_INTERVAL_MS);
    }

    function bindUI() {
        if (!ui.addBtn) return;
        ui.addBtn.addEventListener('click', async () => {
            const rule = normalizeRule({
                id: uid(),
                event: ui.event?.value || 'state_changed',
                condition: ui.condition?.value || '',
                action: ui.action?.value || 'hojum_propose',
                note: ui.note?.value || '',
                enabled: true,
                createdAt: new Date().toISOString()
            });

            rules.unshift(rule);
            await saveRules();
            renderRules();

            if (ui.condition) ui.condition.value = '';
            if (ui.note) ui.note.value = '';
        });

        ui.manualBtn?.addEventListener('click', () => {
            notifyEvent('manual', { source: 'manual_button' });
        });

        ui.exportBtn?.addEventListener('click', () => {
            const exportData = {
                version: 1,
                exportedAt: new Date().toISOString(),
                rules: rules.map(r => ({
                    event: r.event,
                    condition: r.condition,
                    action: r.action,
                    note: r.note,
                    enabled: r.enabled
                }))
            };
            
            const json = JSON.stringify(exportData, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dastur-rules-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });

        ui.importBtn?.addEventListener('click', () => {
            ui.importModal.style.display = 'flex';
            ui.importInput.value = '';
        });

        ui.importModalClose?.addEventListener('click', () => {
            ui.importModal.style.display = 'none';
        });

        ui.importCancel?.addEventListener('click', () => {
            ui.importModal.style.display = 'none';
        });

        ui.importConfirm?.addEventListener('click', async () => {
            const text = ui.importInput?.value?.trim();
            if (!text) {
                alert('Please paste JSON rules to import');
                return;
            }
            
            try {
                const data = JSON.parse(text);
                
                let importedRules = [];
                if (Array.isArray(data)) {
                    importedRules = data;
                } else if (data.rules && Array.isArray(data.rules)) {
                    importedRules = data.rules;
                } else {
                    alert('Invalid DASTUR rules format');
                    return;
                }
                
                let added = 0;
                for (const ruleLike of importedRules) {
                    const rule = normalizeRule(ruleLike);
                    if (rule) {
                        rule.id = uid();
                        rule.createdAt = new Date().toISOString();
                        rules.push(rule);
                        added++;
                    }
                }
                
                await saveRules();
                renderRules();
                ui.importModal.style.display = 'none';
                alert(`Imported ${added} rule(s) successfully!`);
            } catch (err) {
                alert('Failed to import: ' + err.message);
            }
        });

        ui.importModal?.addEventListener('click', (e) => {
            if (e.target === ui.importModal) {
                ui.importModal.style.display = 'none';
            }
        });

        ui.aiPromptBtn?.addEventListener('click', async () => {
            const prompt = `You are helping create DASTUR rules for Pazator, an intelligence management system.

=== DASTUR RULE STRUCTURE ===
Each rule is a JSON object with these fields:
{
  "event": "state_changed" | "data_saved" | "tab_switched" | "manual",
  "condition": "JavaScript expression (returns true/false)",
  "action": "hojum_propose" | "sarparast_flash",
  "note": "Human-readable description"
}

=== AVAILABLE VARIABLES ===
- state.pazatorData.humans       → array of all humans
- state.pazatorData.others       → array of companies/entities
- state.pazatorData.tags         → array of all tags
- state.tags                     → same as above
- helpers.countHumans()          → number of humans
- helpers.countOthers()          → number of companies
- event.source                   → what triggered the event
- event.tabId                    → current tab (if tab_switched)

=== EXAMPLE RULES ===

// Alert when database grows large
[
  {"event":"state_changed","condition":"state.pazatorData.humans.length > 100","action":"hojum_propose","note":"Database has over 100 people - review for duplicates"},
  {"event":"state_changed","condition":"state.pazatorData.humans.length > 200","action":"sarparast_flash","note":"Database is very large - verify data quality"}
]

// Detect new suspicious entries
[
  {"event":"data_saved","condition":"state.pazatorData.humans.some(h => h.tags?.includes('suspicious'))","action":"hojum_propose","note":"New suspicious tag added"},
  {"event":"state_changed","condition":"state.pazatorData.humans.filter(h => h.tags?.includes('verified')).length === 0 && helpers.countHumans() > 10","action":"hojum_propose","note":"No verified humans yet despite having data"}
]

// Watch for specific tag activity
[
  {"event":"data_saved","condition":"state.tags.some(t => t.toLowerCase().includes('target'))","action":"sarparast_flash","note":"Target tag activity detected"},
  {"event":"state_changed","condition":"helpers.countHumans() > helpers.countOthers() * 10","action":"hojum_propose","note":"Unusual human-to-company ratio"}
]

=== YOUR TASK ===
Create DASTUR rules for this use case: [DESCRIBE WHAT YOU WANT TO MONITOR/WATCH FOR]

Rules should be:
- Specific and actionable
- Use meaningful conditions
- Have clear notes explaining the purpose

Return ONLY a valid JSON array of rules, nothing else.`;

            try {
                await navigator.clipboard.writeText(prompt);
                const btn = ui.aiPromptBtn;
                const originalText = btn.textContent;
                btn.textContent = 'Copied!';
                btn.style.background = '#4ade80';
                btn.style.color = '#000';
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.background = '';
                    btn.style.color = '';
                }, 1500);
            } catch (err) {
                prompt('Copy this prompt:', prompt);
            }
        });
    }

    async function init() {
        rules = await loadRules();
        renderRules();
        bindUI();
        startWatcher();

        // Make DASTUR visible to other modules / AI.
        ctx.dastur = {
            getRules: () => rules.slice(),
            notifyEvent,
            addRule: async (ruleLike) => {
                const rule = normalizeRule(ruleLike);
                if (!rule) return null;
                rules.unshift(rule);
                await saveRules();
                renderRules();
                return rule;
            },
            addRules: async (rulesArray) => {
                if (!Array.isArray(rulesArray)) rulesArray = [rulesArray];
                let added = 0;
                for (const ruleLike of rulesArray) {
                    const rule = normalizeRule(ruleLike);
                    if (rule) {
                        rule.id = uid();
                        rule.createdAt = new Date().toISOString();
                        rules.push(rule);
                        added++;
                    }
                }
                await saveRules();
                renderRules();
                return added;
            },
            removeRule: async (ruleId) => {
                rules = rules.filter(r => r.id !== ruleId);
                firedCooldown.delete(ruleId);
                await saveRules();
                renderRules();
            },
            exportRules: () => {
                return rules.map(r => ({
                    event: r.event,
                    condition: r.condition,
                    action: r.action,
                    note: r.note,
                    enabled: r.enabled
                }));
            },
            importRules: async (rulesArray) => {
                if (!Array.isArray(rulesArray)) throw new Error('Expected array');
                let added = 0;
                for (const ruleLike of rulesArray) {
                    const rule = normalizeRule(ruleLike);
                    if (rule) {
                        rule.id = uid();
                        rule.createdAt = new Date().toISOString();
                        rules.push(rule);
                        added++;
                    }
                }
                await saveRules();
                renderRules();
                return added;
            }
        };

        ctx.emit('dastur:ready', { count: rules.length });
    }

    init();
})();
