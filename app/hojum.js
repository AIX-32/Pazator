(function () {
    'use strict';

    const ctx = window.pazator_context;
    if (!ctx) {
        console.warn('[HOJUM] pazator_context missing. HOJUM disabled.');
        return;
    }

    const ui = {
        stack: document.getElementById('hojumStack'),
        manualBtn: document.getElementById('hojumManualBtn'),
        clearBtn: document.getElementById('hojumClearBtn'),
        recentList: document.getElementById('hojumRecentList')
    };

    const SYSTEM_PROMPT = [
        'You are the HOJUM tactical engine.',
        'Your job is to analyze data and propose immediate, aggressive security incursions.',
        '',
        'Constraints:',
        '- Propose actions as TOOL CALLS (function calls) that the operator can execute.',
        '- If you need context, call get_pazator_context first.',
        '- Keep it fast, decisive, and operational. No fluff.',
        '',
        'Output:',
        '- Return a single JSON object: { title, priority, summary, tool_calls }',
        '- priority is one of: low, medium, high',
        '- tool_calls is an array of { name, arguments, why }',
        '- arguments must match the tool schema.'
    ].join('\n');

    function normalizeAiResponse(aiResponse) {
        if (typeof aiResponse === 'string') return { content: aiResponse };
        if (!aiResponse || typeof aiResponse !== 'object') return { content: String(aiResponse || '') };
        return {
            content: aiResponse.content || aiResponse.message || '',
            tool_calls: aiResponse.tool_calls || aiResponse.toolCalls || null,
            raw: aiResponse
        };
    }

    function extractJSON(text) {
        if (!text) return null;
        try { return JSON.parse(text); } catch { }
        const match = String(text).match(/\{[\s\S]*\}/);
        if (!match) return null;
        try { return JSON.parse(match[0]); } catch { return null; }
    }

    function ensureArray(v) {
        return Array.isArray(v) ? v : [];
    }

    function getTrackerMap() {
        return window.trackerMap || null;
    }

    function shahedFlyTo({ lat, lon, zoom = 14, pitch = 45, bearing = 0, duration = 1200 }) {
        const map = getTrackerMap();
        if (!map) return { ok: false, error: 'trackerMap not ready' };
        map.flyTo({
            center: [Number(lon), Number(lat)],
            zoom: Number(zoom),
            pitch: Number(pitch),
            bearing: Number(bearing),
            duration: Number(duration),
            essential: true
        });
        return { ok: true };
    }

    function shahedAddPing({ lat, lon, label = 'HOJUM', color = '#ff4a4a' }) {
        const map = getTrackerMap();
        if (!map) return { ok: false, error: 'trackerMap not ready' };
        const id = `hojum-ping-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
        const src = {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [Number(lon), Number(lat)] },
                    properties: { label }
                }]
            }
        };

        map.addSource(id, src);
        map.addLayer({
            id,
            type: 'circle',
            source: id,
            paint: {
                'circle-radius': 8,
                'circle-color': color,
                'circle-opacity': 0.9,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff'
            }
        });

        window.setTimeout(() => {
            try {
                if (map.getLayer(id)) map.removeLayer(id);
                if (map.getSource(id)) map.removeSource(id);
            } catch { }
        }, 12000);

        return { ok: true, id };
    }

    function domFlash({ selector = '#dashboard-tab', ms = 900, border = 'rgba(255,74,74,0.55)' }) {
        const el = document.querySelector(selector);
        if (!el) return { ok: false, error: `not found: ${selector}` };
        const prev = el.style.boxShadow;
        el.style.boxShadow = `0 0 0 2px ${border}, 0 0 0 6px rgba(255,74,74,0.12)`;
        window.setTimeout(() => { el.style.boxShadow = prev; }, Number(ms) || 900);
        return { ok: true };
    }

    function domSetText({ selector, text }) {
        const el = document.querySelector(selector);
        if (!el) return { ok: false, error: `not found: ${selector}` };
        el.textContent = String(text ?? '');
        return { ok: true };
    }

    function domAddClass({ selector, className }) {
        const el = document.querySelector(selector);
        if (!el) return { ok: false, error: `not found: ${selector}` };
        el.classList.add(String(className || '').trim());
        return { ok: true };
    }

    function domRemoveClass({ selector, className }) {
        const el = document.querySelector(selector);
        if (!el) return { ok: false, error: `not found: ${selector}` };
        el.classList.remove(String(className || '').trim());
        return { ok: true };
    }

    function getPazatorContext() {
        return ctx.getSerializableContext();
    }

    const toolImpl = {
        get_pazator_context: () => getPazatorContext(),
        sarparast_flash: () => (ctx.ui.flashSarparast(), { ok: true }),
        alert_beep: ({ duration_ms = 120, frequency_hz = 880 } = {}) => (ctx.ui.playAlertBeep(duration_ms, frequency_hz), { ok: true }),
        dom_flash: (args) => domFlash(args || {}),
        dom_set_text: (args) => domSetText(args || {}),
        dom_add_class: (args) => domAddClass(args || {}),
        dom_remove_class: (args) => domRemoveClass(args || {}),
        shahed_fly_to: (args) => shahedFlyTo(args || {}),
        shahed_add_ping: (args) => shahedAddPing(args || {})
    };

    const tools = [
        {
            type: 'function',
            function: {
                name: 'get_pazator_context',
                description: 'Fetch current Pazator context snapshot (humans, others, tags, active tab).',
                parameters: { type: 'object', properties: {}, additionalProperties: false }
            }
        },
        {
            type: 'function',
            function: {
                name: 'sarparast_flash',
                description: 'Flash a subtle red border around SARPARAST dashboard.',
                parameters: { type: 'object', properties: {}, additionalProperties: false }
            }
        },
        {
            type: 'function',
            function: {
                name: 'alert_beep',
                description: 'Play a subtle browser-native alert beep.',
                parameters: {
                    type: 'object',
                    properties: {
                        duration_ms: { type: 'number' },
                        frequency_hz: { type: 'number' }
                    },
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'dom_flash',
                description: 'Temporarily flash a border via box-shadow on an element.',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: { type: 'string' },
                        ms: { type: 'number' },
                        border: { type: 'string' }
                    },
                    required: ['selector'],
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'dom_set_text',
                description: 'Set textContent for a selector.',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: { type: 'string' },
                        text: { type: 'string' }
                    },
                    required: ['selector', 'text'],
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'dom_add_class',
                description: 'Add a CSS class to an element.',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: { type: 'string' },
                        className: { type: 'string' }
                    },
                    required: ['selector', 'className'],
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'dom_remove_class',
                description: 'Remove a CSS class from an element.',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: { type: 'string' },
                        className: { type: 'string' }
                    },
                    required: ['selector', 'className'],
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'shahed_fly_to',
                description: 'Fly SHAHED tracker map to coordinates.',
                parameters: {
                    type: 'object',
                    properties: {
                        lat: { type: 'number' },
                        lon: { type: 'number' },
                        zoom: { type: 'number' },
                        pitch: { type: 'number' },
                        bearing: { type: 'number' },
                        duration: { type: 'number' }
                    },
                    required: ['lat', 'lon'],
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'shahed_add_ping',
                description: 'Add a temporary HOJUM ping marker to SHAHED tracker map.',
                parameters: {
                    type: 'object',
                    properties: {
                        lat: { type: 'number' },
                        lon: { type: 'number' },
                        label: { type: 'string' },
                        color: { type: 'string' }
                    },
                    required: ['lat', 'lon'],
                    additionalProperties: false
                }
            }
        }
    ];

    const PLANNING_EXECUTABLE_TOOLS = new Set(['get_pazator_context']);

    async function runToolsLoop(messages, maxSteps = 6) {
        for (let i = 0; i < maxSteps; i++) {
            const raw = await ctx.ai.chat(messages, { tools });
            const resp = normalizeAiResponse(raw);

            const toolCalls = resp.tool_calls || resp.raw?.choices?.[0]?.message?.tool_calls;
            if (toolCalls && Array.isArray(toolCalls) && toolCalls.length) {
                const hasNonExecutable = toolCalls.some(call => {
                    const name = call?.function?.name || call?.name;
                    return name && !PLANNING_EXECUTABLE_TOOLS.has(name);
                });

                if (hasNonExecutable) {
                    return { content: '', tool_calls: toolCalls, raw: resp.raw };
                }

                messages.push({ role: 'assistant', tool_calls: toolCalls });

                for (const call of toolCalls) {
                    const name = call?.function?.name || call?.name;
                    const argStr = call?.function?.arguments || call?.arguments || '{}';
                    let args = {};
                    try { args = typeof argStr === 'string' ? JSON.parse(argStr) : (argStr || {}); } catch { }

                    const impl = toolImpl[name];
                    let result = { ok: false, error: 'unknown_tool' };
                    try {
                        result = impl ? await impl(args) : { ok: false, error: 'unknown_tool' };
                    } catch (e) {
                        result = { ok: false, error: e?.message || String(e) };
                    }

                    const toolMessage = {
                        role: 'tool',
                        name,
                        content: JSON.stringify(result)
                    };
                    if (call?.id) toolMessage.tool_call_id = call.id;
                    messages.push(toolMessage);
                }

                continue;
            }

            return resp;
        }
        return { content: '{"title":"HOJUM","priority":"medium","summary":"Tool loop maxed out.","tool_calls":[]}' };
    }

    function coerceProposal(rawContent) {
        const parsed = extractJSON(rawContent);
        if (!parsed || typeof parsed !== 'object') {
            return {
                title: 'HOJUM Proposal',
                priority: 'medium',
                summary: String(rawContent || 'No content'),
                tool_calls: []
            };
        }
        return {
            title: String(parsed.title || 'HOJUM Proposal'),
            priority: String(parsed.priority || 'medium'),
            summary: String(parsed.summary || ''),
            tool_calls: ensureArray(parsed.tool_calls).map(x => ({
                name: x?.name || x?.function?.name,
                arguments: x?.arguments ?? x?.function?.arguments ?? {},
                why: x?.why || ''
            }))
        };
    }

    const recent = [];

    function renderRecent() {
        if (!ui.recentList) return;
        ui.recentList.innerHTML = '';
        if (!recent.length) {
            ui.recentList.innerHTML = '<div style="color: rgba(255,255,255,0.6); font-size: 0.85rem; padding: 6px 0;">No proposals yet.</div>';
            return;
        }
        recent.slice(0, 6).forEach(item => {
            const div = document.createElement('div');
            div.className = 'hojum-recent-item';
            div.innerHTML = `
                <div class="hojum-recent-title">${escapeHtml(item.priority)} • ${escapeHtml(item.title)}</div>
                <div class="hojum-recent-meta">${escapeHtml(item.at)}</div>
            `;
            ui.recentList.appendChild(div);
        });
    }

    function escapeHtml(s) {
        return String(s ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function makeCard(proposal, sourceMeta) {
        if (!ui.stack) return;

        const card = document.createElement('div');
        card.className = 'hojum-card';

        const header = document.createElement('div');
        header.className = 'hojum-card-header';

        const left = document.createElement('div');
        left.style.flex = '1';
        left.innerHTML = `<div class="hojum-card-title">${escapeHtml(proposal.title)}</div>
                          <div class="hojum-card-meta" style="margin-top:8px;">
                            <span class="hojum-pill ${escapeHtml(proposal.priority)}">${escapeHtml(proposal.priority)}</span>
                            <span>${escapeHtml(sourceMeta || '')}</span>
                          </div>`;

        const right = document.createElement('div');
        right.style.display = 'flex';
        right.style.gap = '8px';
        right.style.alignItems = 'center';
        right.style.color = 'rgba(255,255,255,0.65)';
        right.style.fontSize = '0.78rem';
        right.textContent = new Date().toLocaleTimeString();

        header.appendChild(left);
        header.appendChild(right);

        const body = document.createElement('div');
        body.className = 'hojum-card-body';
        const toolCallsText = JSON.stringify(proposal.tool_calls || [], null, 2);
        body.innerHTML = `
            <div>${escapeHtml(proposal.summary || '')}</div>
            <pre>${escapeHtml(toolCallsText)}</pre>
        `;

        const actions = document.createElement('div');
        actions.className = 'hojum-card-actions';

        const dismiss = document.createElement('button');
        dismiss.className = 'hojum-btn dismiss';
        dismiss.textContent = 'Dismiss';
        dismiss.addEventListener('click', () => card.remove());

        const execute = document.createElement('button');
        execute.className = 'hojum-btn execute';
        execute.textContent = 'Execute';
        execute.addEventListener('click', async () => {
            execute.disabled = true;
            execute.textContent = 'Executing';
            try {
                await executeProposal(proposal);
                execute.textContent = 'Done';
            } catch (e) {
                console.error('[HOJUM] execute failed', e);
                execute.textContent = 'Failed';
            } finally {
                window.setTimeout(() => card.remove(), 900);
            }
        });

        actions.appendChild(dismiss);
        actions.appendChild(execute);

        card.appendChild(header);
        card.appendChild(body);
        card.appendChild(actions);

        ui.stack.prepend(card);

        // Keep stack short.
        const cards = ui.stack.querySelectorAll('.hojum-card');
        if (cards.length > 4) cards[cards.length - 1].remove();
    }

    async function executeProposal(proposal) {
        const calls = ensureArray(proposal.tool_calls);
        for (const c of calls) {
            const name = c?.name;
            if (!name) continue;
            let args = c.arguments;
            if (typeof args === 'string') {
                try { args = JSON.parse(args); } catch { args = {}; }
            }
            const impl = toolImpl[name];
            if (!impl) {
                console.warn('[HOJUM] unknown tool:', name);
                continue;
            }
            await impl(args || {});
        }
    }

    function toolCallsToProposal(toolCalls, source) {
        const calls = ensureArray(toolCalls).map(call => {
            const name = call?.function?.name || call?.name;
            const argStr = call?.function?.arguments || call?.arguments || '{}';
            return { name, arguments: argStr, why: '' };
        }).filter(c => c.name);

        return {
            title: `HOJUM ${String(source || 'Proposal').toUpperCase()}`,
            priority: 'high',
            summary: 'Function-call proposal received. Review tool calls, then Execute.',
            tool_calls: calls
        };
    }

    async function propose({ source, note, meta }) {
        const userPrompt = [
            `SOURCE: ${source || 'manual'}`,
            note ? `OPERATOR NOTE: ${note}` : '',
            meta ? `META: ${JSON.stringify(meta)}` : '',
            'Objective: propose immediate, aggressive security incursions.',
            'If unsure, call get_pazator_context first.',
        ].filter(Boolean).join('\n');

        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
        ];

        const resp = await runToolsLoop(messages);
        const proposal = resp.tool_calls && !resp.content
            ? toolCallsToProposal(resp.tool_calls, source)
            : coerceProposal(resp.content || '');
        return proposal;
    }

    async function proposeFromDastur(rule, payload) {
        ctx.ui.playAlertBeep();
        ctx.ui.flashSarparast();

        const proposal = await propose({
            source: 'dastur',
            note: rule?.note || '',
            meta: { ruleId: rule?.id, event: payload?.eventName, payload }
        });

        recent.unshift({ ...proposal, at: new Date().toLocaleTimeString() });
        renderRecent();
        makeCard(proposal, `DASTUR:${rule?.event || 'event'}`);
        return proposal;
    }

    async function proposeManual(note) {
        const proposal = await propose({ source: 'manual', note: note || '' });
        recent.unshift({ ...proposal, at: new Date().toLocaleTimeString() });
        renderRecent();
        makeCard(proposal, 'MANUAL');
        return proposal;
    }

    function bindUI() {
        ui.manualBtn?.addEventListener('click', async () => {
            ui.manualBtn.disabled = true;
            ui.manualBtn.textContent = '...';
            try {
                await proposeManual('');
            } catch (e) {
                console.error('[HOJUM] manual propose failed', e);
            } finally {
                ui.manualBtn.disabled = false;
                ui.manualBtn.textContent = 'Intervene';
            }
        });

        ui.clearBtn?.addEventListener('click', () => {
            if (ui.stack) ui.stack.innerHTML = '';
            recent.splice(0, recent.length);
            renderRecent();
        });
    }

    function init() {
        bindUI();
        renderRecent();

        // Expose to other modules / AI
        ctx.hojum = {
            proposeManual,
            proposeFromDastur,
            executeProposal,
            tools,
            toolImpl
        };

        ctx.emit('hojum:ready', {});
    }

    init();
})();
