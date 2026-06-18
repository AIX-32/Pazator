(function () {
    'use strict';

    if (window.pazatorPlugins) return;

    var plugins = {};
    var pluginOrder = [];
    var pluginStates = {};
    var enabledPlugins = {};

    // Tastur — lightweight event bus
    if (!window.Tastur) {
        var _listeners = {};
        window.Tastur = {
            on: function (e, fn) {
                (_listeners[e] = _listeners[e] || []).push(fn);
                return function () {
                    var arr = _listeners[e];
                    if (arr) {
                        var idx = arr.indexOf(fn);
                        if (idx !== -1) arr.splice(idx, 1);
                    }
                };
            },
            off: function (e, fn) {
                var arr = _listeners[e];
                if (arr) {
                    var idx = arr.indexOf(fn);
                    if (idx !== -1) arr.splice(idx, 1);
                }
            },
            emit: function (e, data) {
                var arr = _listeners[e];
                if (arr) arr.slice().forEach(function (fn) {
                    try { fn(data); } catch (x) { console.error('[Tastur]', x); }
                });
            }
        };
    }

    var pluginApi = {
        store: window.pazatorStore,
        events: window.Tastur,
        settings: {
            get: function (key) {
                return window.pazatorStore && window.pazatorStore.kvGet
                    ? window.pazatorStore.kvGet('plugin_' + key)
                    : Promise.resolve(null);
            },
            set: function (key, val) {
                return window.pazatorStore && window.pazatorStore.kvSet
                    ? window.pazatorStore.kvSet('plugin_' + key, val)
                    : Promise.resolve();
            }
        },
        modals: {
            show: function (opts) {
                if (window.showModal) return window.showModal(opts);
            },
            alert: function (msg) {
                if (window.showAlert) return window.showAlert(msg);
            },
            confirm: function (msg) {
                if (window.showConfirm) return window.showConfirm(msg);
            }
        },
        tab: {
            register: function (cfg) {
                if (!cfg || !cfg.id) return;
                if (!document.getElementById(cfg.id + '-tab') && cfg.render) {
                    var content = document.createElement('div');
                    content.className = 'tab-content';
                    content.id = cfg.id + '-tab';
                    var container = document.querySelector('.container');
                    if (container) {
                        var lastTab = container.querySelector('.tab-content:last-of-type');
                        if (lastTab) {
                            lastTab.insertAdjacentElement('afterend', content);
                        } else {
                            container.appendChild(content);
                        }
                    }
                    cfg.render(content);
                }
                return cfg;
            },
            unregister: function (tabId) {
                var el = document.getElementById(tabId + '-tab');
                if (el) el.remove();
                var tab = document.querySelector('.tab[data-tab="' + tabId + '"]');
                if (tab) tab.remove();
            }
        },
        menu: {
            register: function (cfg) {
                if (!cfg || !cfg.id) return;
                var existing = document.getElementById('plugin-mi-' + cfg.id);
                if (existing) return;

                var menuMap = {
                    view: document.querySelector('.menu-item[data-menu="view"] .menu-dropdown'),
                    data: document.querySelector('.menu-item[data-menu="data"] .menu-dropdown'),
                    tools: document.querySelector('.menu-item[data-menu="tools"] .menu-dropdown'),
                    system: document.querySelector('.menu-item[data-menu="system"] .menu-dropdown'),
                    help: document.querySelector('.menu-item[data-menu="help"] .menu-dropdown')
                };
                var target = menuMap[cfg.menu] || menuMap.tools;
                if (!target) return;

                var btn = document.createElement('button');
                btn.className = 'menu-dropdown-item';
                btn.id = 'plugin-mi-' + cfg.id;
                btn.innerHTML = '<i class="' + (cfg.icon || 'fas fa-puzzle-piece') + '"></i> ' + cfg.label;
                btn.addEventListener('click', function () {
                    if (typeof cfg.action === 'function') cfg.action();
                });
                target.appendChild(btn);
            },
            unregister: function (id) {
                var el = document.getElementById('plugin-mi-' + id);
                if (el) el.remove();
            }
        },
        log: function (msg) {
            console.log('[Plugin:' + (this._pluginId || '?') + ']', msg);
        }
    };

    function saveState() {
        try {
            localStorage.setItem('pazator_plugin_states', JSON.stringify(pluginStates));
        } catch (e) { /* ignore */ }
    }

    function loadState() {
        try {
            var saved = localStorage.getItem('pazator_plugin_states');
            if (saved) pluginStates = JSON.parse(saved) || {};
        } catch (e) { pluginStates = {}; }
    }

    function firePluginEvent(pluginId, hook) {
        var p = plugins[pluginId];
        if (!p) return;
        try {
            if (typeof p[hook] === 'function') p[hook](pluginApi);
        } catch (e) {
            console.error('[Plugins] Error in ' + pluginId + '.' + hook, e);
        }
    }

    function initPlugin(pluginId) {
        var p = plugins[pluginId];
        if (!p || enabledPlugins[pluginId]) return;
        enabledPlugins[pluginId] = true;

        // Register tabs
        if (p.tabs) {
            p.tabs.forEach(function (t) { pluginApi.tab.register(t); });
        }

        // Register menu items
        if (p.menuItems) {
            p.menuItems.forEach(function (m) {
                m.id = pluginId + '-' + (m.label || '').replace(/\s+/g, '-').toLowerCase();
                pluginApi.menu.register(m);
            });
        }

        // Subscribe to events
        if (p.handlers) {
            var unsubs = [];
            Object.keys(p.handlers).forEach(function (ev) {
                if (typeof p.handlers[ev] === 'function') {
                    unsubs.push(window.Tastur.on(ev, p.handlers[ev]));
                }
            });
            p._unsubs = unsubs;
        }

        firePluginEvent(pluginId, 'onLoad');
    }

    function deinitPlugin(pluginId) {
        var p = plugins[pluginId];
        if (!p || !enabledPlugins[pluginId]) return;
        enabledPlugins[pluginId] = false;

        firePluginEvent(pluginId, 'onUnload');

        // Unsubscribe events
        if (p._unsubs) {
            p._unsubs.forEach(function (fn) { fn(); });
            p._unsubs = null;
        }

        // Remove tabs
        if (p.tabs) {
            p.tabs.forEach(function (t) { pluginApi.tab.unregister(t.id); });
        }

        // Remove menu items
        if (p.menuItems) {
            p.menuItems.forEach(function (m) {
                pluginApi.menu.unregister(pluginId + '-' + (m.label || '').replace(/\s+/g, '-').toLowerCase());
            });
        }
    }

    function getFilter() {
        var input = document.getElementById('pluginsSearch');
        return input ? input.value.toLowerCase().trim() : '';
    }

    function updateUI() {
        var container = document.getElementById('pluginsContainer');
        if (!container) return;
        container.innerHTML = '';

        var filter = getFilter();
        var allPluginIds = pluginOrder.slice();

        if (!allPluginIds.length) {
            allPluginIds = Object.keys(plugins);
        }

        if (filter) {
            allPluginIds = allPluginIds.filter(function (id) {
                var p = plugins[id];
                if (!p) return false;
                var searchText = (p.name || id + ' ' + (p.description || '') + ' ' + (p.author || '')).toLowerCase();
                return searchText.indexOf(filter) !== -1;
            });
        }

        if (!allPluginIds.length) {
            container.innerHTML =
                '<div class="plugins-empty">' +
                '<i class="fas fa-puzzle-piece" style="font-size:2rem;color:#444;margin-bottom:12px;"></i>' +
                '<p style="color:#666;">' + (filter ? 'No plugins match "' + filter + '"' : 'No plugins installed yet.') + '</p>' +
                '<p style="color:#555;font-size:0.8rem;">' + (filter ? 'Try a different search term' : 'Drop a plugin URL below or write one.') + '</p>' +
                '</div>';
            return;
        }

        allPluginIds.forEach(function (id) {
            var p = plugins[id];
            if (!p) return;
            var enabled = !!enabledPlugins[id];
            var state = pluginStates[id] || {};
            var hasError = state.error;

            var card = document.createElement('div');
            card.className = 'plugin-card' + (enabled ? ' plugin-card--active' : '') + (hasError ? ' plugin-card--error' : '');
            card.dataset.pluginId = id;

            var statusClass = enabled ? 'plugin-status--active' : 'plugin-status--inactive';
            var statusLabel = enabled ? 'Active' : 'Inactive';

            card.innerHTML =
                '<div class="plugin-card-header">' +
                '<div class="plugin-card-icon"><i class="' + (p.icon || 'fas fa-puzzle-piece') + '"></i></div>' +
                '<div class="plugin-card-info">' +
                '<div class="plugin-card-name">' + (p.name || id) + '</div>' +
                '<div class="plugin-card-meta">' +
                '<span class="plugin-card-version">v' + (p.version || '0.1') + '</span>' +
                '<span class="plugin-card-author">' + (p.author || '—') + '</span>' +
                '</div>' +
                '</div>' +
                '<div class="plugin-card-toggle">' +
                '<label class="plugin-toggle">' +
                '<input type="checkbox" ' + (enabled ? 'checked' : '') + '>' +
                '<span class="plugin-toggle-slider"></span>' +
                '</label>' +
                '</div>' +
                '</div>' +
                (p.description ? '<div class="plugin-card-desc">' + p.description + '</div>' : '') +
                (hasError ? '<div class="plugin-card-error"><i class="fas fa-exclamation-triangle"></i> ' + state.error + '</div>' : '') +
                '<div class="plugin-card-footer">' +
                '<span class="plugin-status ' + statusClass + '">' + statusLabel + '</span>' +
                '</div>';

            var toggle = card.querySelector('.plugin-toggle input');
            toggle.addEventListener('change', function () {
                if (this.checked) {
                    enablePlugin(id);
                } else {
                    disablePlugin(id);
                }
                updateUI();
            });

            container.appendChild(card);
        });
    }

    // --- Public API ---

    window.pazatorPlugins = {
        register: function (pluginDef) {
            if (!pluginDef || !pluginDef.id) {
                console.error('[Plugins] Plugin must have an id');
                return;
            }
            if (plugins[pluginDef.id]) return;
            plugins[pluginDef.id] = pluginDef;
            pluginOrder.push(pluginDef.id);

            // Auto-enable if previously enabled or new
            var wasEnabled = pluginStates[pluginDef.id] && pluginStates[pluginDef.id].enabled;
            if (wasEnabled !== false) {
                pluginStates[pluginDef.id] = pluginStates[pluginDef.id] || {};
                pluginStates[pluginDef.id].enabled = true;
                saveState();
                initPlugin(pluginDef.id);
            }

            updateUI();
        },

        unregister: function (id) {
            if (!plugins[id]) return;
            deinitPlugin(id);
            delete plugins[id];
            var idx = pluginOrder.indexOf(id);
            if (idx !== -1) pluginOrder.splice(idx, 1);
            delete pluginStates[id];
            saveState();
            updateUI();
        },

        isEnabled: function (id) {
            return !!enabledPlugins[id];
        },

        getPlugins: function () {
            return pluginOrder.map(function (id) { return plugins[id]; });
        },

        getPlugin: function (id) {
            return plugins[id] || null;
        },

        enable: function (id) {
            var changed = enablePlugin(id);
            if (changed) updateUI();
        },

        disable: function (id) {
            var changed = disablePlugin(id);
            if (changed) updateUI();
        },

        getApi: function () { return pluginApi; },

        renderManager: function (containerId) {
            var container = document.getElementById(containerId || 'pluginsContainer');
            if (!container) return;
            updateUI();
        },

        // Install from URL (loads external script)
        installFromUrl: function (url) {
            return new Promise(function (resolve, reject) {
                var script = document.createElement('script');
                script.src = url;
                script.onload = function () {
                    resolve();
                    updateUI();
                };
                script.onerror = function () {
                    reject(new Error('Failed to load plugin: ' + url));
                };
                document.body.appendChild(script);
            });
        },

        // Install from code string
        installFromCode: function (code, pluginDef) {
            try {
                var fn = new Function('api', code);
                pluginApi._pluginId = pluginDef.id || 'custom';
                fn(pluginApi);
                pluginApi._pluginId = null;
                if (pluginDef.id && !plugins[pluginDef.id]) {
                    // Plugin didn't register itself, do it for them
                    window.pazatorPlugins.register(pluginDef);
                }
                updateUI();
                return true;
            } catch (e) {
                console.error('[Plugins] installFromCode error', e);
                return false;
            }
        }
    };

    function enablePlugin(id) {
        if (enabledPlugins[id] || !plugins[id]) return false;
        pluginStates[id] = pluginStates[id] || {};
        pluginStates[id].enabled = true;
        delete pluginStates[id].error;
        saveState();
        initPlugin(id);
        return true;
    }

    function disablePlugin(id) {
        if (!enabledPlugins[id] || !plugins[id]) return false;
        pluginStates[id] = pluginStates[id] || {};
        pluginStates[id].enabled = false;
        saveState();
        deinitPlugin(id);
        return true;
    }

    loadState();

    // Re-enable plugins that were active
    Object.keys(pluginStates).forEach(function (id) {
        if (pluginStates[id].enabled) {
            // Will be inited when registered
        }
    });

    // Global helpers for HTML onclick
    window.togglePluginInstall = function () {
        var area = document.getElementById('pluginsInstallArea');
        if (area) area.style.display = area.style.display === 'none' ? 'block' : 'none';
    };
    window.installPluginFromUrl = function () {
        var input = document.getElementById('pluginsInstallUrl');
        var status = document.getElementById('pluginsInstallStatus');
        if (!input || !input.value.trim()) {
            if (status) status.textContent = 'Please enter a URL';
            return;
        }
        if (status) status.textContent = 'Loading...';
        window.pazatorPlugins.installFromUrl(input.value.trim()).then(function () {
            if (status) status.textContent = 'Plugin loaded successfully';
            input.value = '';
        }).catch(function (e) {
            if (status) status.textContent = 'Error: ' + e.message;
        });
    };
    window.installPluginFromCode = function () {
        var textarea = document.getElementById('pluginsInstallCode');
        var status = document.getElementById('pluginsInstallStatus');
        if (!textarea || !textarea.value.trim()) {
            if (status) status.textContent = 'Please paste some code';
            return;
        }
        if (status) status.textContent = 'Executing...';
        try {
            var result = window.pazatorPlugins.installFromCode(textarea.value, {
                id: 'custom-' + Date.now(),
                name: 'Custom Plugin',
                version: '0.1',
                description: 'Installed from code snippet',
                icon: 'fas fa-code',
                author: 'You'
            });
            if (status) status.textContent = result ? 'Plugin installed' : 'Failed to install';
            if (result) { textarea.value = ''; }
        } catch (e) {
            if (status) status.textContent = 'Error: ' + e.message;
        }
    };

    // Register a built-in demo plugin
    window.pazatorPlugins.register({
        id: 'pazator-graph-explorer',
        name: 'Graph Explorer',
        version: '1.0.0',
        description: 'Interactive entity relationship graph. Visualise connections between people, organisations, and events with D3 force-directed layout.',
        icon: 'fas fa-project-diagram',
        author: 'Pazator',
        onLoad: function () { /* noop — already loaded via lazy module */ },
        tabs: [{
            id: 'explorer',
            label: 'Explorer',
            render: function (container) { /* already rendered in HTML */ }
        }]
    });

    console.log('[Plugins] System ready');
})();
