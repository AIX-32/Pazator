(function () {
    'use strict';

    const existing = window.pazator_context && typeof window.pazator_context === 'object'
        ? window.pazator_context
        : {};

    function safeNowISO() {
        try { return new Date().toISOString(); } catch { return String(Date.now()); }
    }

    function getStateSnapshot() {
        return {
            pazatorData: window.pazatorData || null,
            tags: window.tags || null,
            activeTab: document.querySelector('.tab.active')?.dataset?.tab || 'dashboard',
            time: safeNowISO()
        };
    }

    function hasPuter() {
        return typeof window.puter === 'object' && window.puter;
    }

    async function kvGet(key) {
        if (hasPuter() && window.puter.kv && typeof window.puter.kv.get === 'function') {
            return await window.puter.kv.get(key);
        }
        return localStorage.getItem(key);
    }

    async function kvSet(key, value) {
        if (hasPuter() && window.puter.kv && typeof window.puter.kv.set === 'function') {
            return await window.puter.kv.set(key, value);
        }
        localStorage.setItem(key, value);
    }

    async function kvDel(key) {
        if (hasPuter() && window.puter.kv && typeof window.puter.kv.del === 'function') {
            return await window.puter.kv.del(key);
        }
        localStorage.removeItem(key);
    }

    async function aiChat(messages, options) {
        if (typeof window.geminiChat !== 'function') {
            throw new Error('Gemini AI is not available (geminiChat missing).');
        }

        return await window.geminiChat(messages, options);
    }

    function playAlertBeep(durationMs = 120, frequencyHz = 880) {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.value = frequencyHz;
            gain.gain.value = 0.0001;

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();

            const now = ctx.currentTime;
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(0.12, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);

            setTimeout(() => {
                try { osc.stop(); } catch { }
                try { ctx.close(); } catch { }
            }, Math.max(40, durationMs + 40));
        } catch {
            // Silent failure (audio blocked / unsupported)
        }
    }

    function flashSarparast(ms = 950) {
        const dash = document.getElementById('dashboard-tab');
        if (!dash) return;
        dash.classList.add('sarparast-alert');
        window.clearTimeout(flashSarparast._t);
        flashSarparast._t = window.setTimeout(() => dash.classList.remove('sarparast-alert'), ms);
    }

    function createEventBus() {
        const listeners = new Map();
        return {
            on(eventName, handler) {
                if (!listeners.has(eventName)) listeners.set(eventName, new Set());
                listeners.get(eventName).add(handler);
                return () => listeners.get(eventName)?.delete(handler);
            },
            emit(eventName, payload) {
                const set = listeners.get(eventName);
                if (!set) return;
                set.forEach(fn => {
                    try { fn(payload); } catch (e) { console.error('[pazator_context] event handler error', e); }
                });
            }
        };
    }

    const bus = existing._bus || createEventBus();

    const ctx = {
        ...existing,
        version: existing.version || 'pazator_context@1',
        _bus: bus,
        state: existing.state || {},
        kv: { get: kvGet, set: kvSet, del: kvDel },
        ai: { chat: aiChat },
        ui: { playAlertBeep, flashSarparast },
        on: bus.on,
        emit: bus.emit,
        snapshot: getStateSnapshot,
        getSerializableContext() {
            const snap = getStateSnapshot();
            const maxHumans = 80;
            const maxOthers = 80;
            try {
                if (snap.pazatorData && typeof snap.pazatorData === 'object') {
                    const humans = Array.isArray(snap.pazatorData.humans) ? snap.pazatorData.humans.slice(0, maxHumans) : [];
                    const others = Array.isArray(snap.pazatorData.others) ? snap.pazatorData.others.slice(0, maxOthers) : [];
                    snap.pazatorData = { ...snap.pazatorData, humans, others };
                }
            } catch (e) {
                console.warn('[pazator_context] getSerializableContext error:', e);
            }
            return snap;
        }
    };

    window.pazator_context = ctx;
    window.dispatchEvent(new CustomEvent('pazator_context_ready', { detail: { version: ctx.version } }));
})();

