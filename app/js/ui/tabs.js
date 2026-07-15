function toggleMenuSection(sectionId) {
    try {
        const content = document.getElementById(sectionId);
        const header = content ? content.previousElementSibling : null;
        const toggle = header ? header.querySelector('.menu-toggle') : null;

        if (!content || !header || !toggle) {
            console.warn('Menu section elements not found for:', sectionId);
            return;
        }

        if (content.style.display === 'block') {
            content.style.display = 'none';
            toggle.textContent = '+';
            openMenuSections = openMenuSections.filter(id => id !== sectionId);
        } else {
            content.style.display = 'block';
            toggle.textContent = '−';
            if (!openMenuSections.includes(sectionId)) {
                openMenuSections.push(sectionId);
            }
        }
    } catch (error) {
        console.error('Error in toggleMenuSection:', error);
    }
}

function updateTabBarClock() {
    if (!tabBarTime || !tabBarDate) return;
    const now = new Date();
    const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateString = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    tabBarTime.textContent = timeString;
    tabBarDate.textContent = dateString;
    if (tabBarStatus) {
        const statuses = ['Its running.',];
        tabBarStatus.textContent = statuses[now.getSeconds() % statuses.length];
    }
}

setInterval(updateTabBarClock, 1000);
updateTabBarClock();

function quickAction(action) {
    try {
        switch (action) {
            case 'show_all_humans':
                if (aiInput) {
                    aiInput.value = 'Show me all humans';
                    aiInput.focus();
                }
                break;
            case 'add_new_human':
                if (aiInput) {
                    aiInput.value = 'Add a new human with the name John';
                    aiInput.focus();
                }
                break;
            case 'find_connections':
                if (aiInput) {
                    aiInput.value = 'Find hidden connections in my data';
                    aiInput.focus();
                }
                break;
            case 'refresh_credits':
                if (aiInput) {
                    aiInput.value = 'Refresh person credits';
                    aiInput.focus();
                }
                break;
            default:
                console.warn('Unknown quick action:', action);
                return;
        }
        if (chatMenu) {
            chatMenu.style.display = 'none';
        }
    } catch (error) {
        console.error('Error in quickAction:', error);
    }
}

function initTabs() {
    document.querySelectorAll('.tab[data-tab]').forEach(tab => {
        tab.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-close')) {
                switchTab(tab.dataset.tab);
            }
        });

        const closeBtn = tab.querySelector('.tab-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeTab(tab.dataset.tab);
            });
        }
    });

    document.querySelectorAll('.tab-action[data-tab-target]').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tabTarget);
        });
    });

    if (addTabBtn) {
        addTabBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown();
        });
    }

    // Lazy load hidden trigger modules
    (function () {
        var lazyTriggers = {
            walkthroughOption: function () { return ensureLazyModule('walkthrough', 'js/apps/walkthrough.js', function () { return !!window.startPazatorWalkthrough; }); },
            snappyOption: function () { return ensureLazyModule('snappy', 'js/apps/snappy.js', function () { return !!window.pazatorSnappy; }); },
            syncConfigOption: function () { return ensureLazyModule('sync', 'js/apps/sync.js', function () { return !!window.pazatorSync; }); },
            adminPanelOption: function () { return ensureLazyModule('admin', 'js/apps/lsad.js', function () { return !!window.pazatorAdmin; }); },
            karlineTrigger: function () { return ensureLazyModule('karline', 'js/apps/karline.js', function () { return !!window.pazatorKarline; }); }
        };
        Object.keys(lazyTriggers).forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            var origHandler = el.click;
            el._lazyLoader = lazyTriggers[id];
            el.addEventListener('click', function (e) {
                var loader = el._lazyLoader;
                if (loader) {
                    e.stopPropagation();
                    loader().then(function () {
                        // Re-dispatch the click after module loads
                        el.dispatchEvent(new MouseEvent('click'));
                    });
                    el._lazyLoader = null;
                }
            }, true);
        });
    })();

    document.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.dataset.tab;
            switchTab(tabId);
            hideDropdown();
        });
    });

    document.addEventListener('click', (e) => {
        try {
            const tabBarElement = document.querySelector('.tab-bar');
            const dropdownMenuElement = document.querySelector('.dropdown-menu');

            if (tabBarElement && dropdownMenuElement &&
                !tabBarElement.contains(e.target) &&
                !dropdownMenuElement.contains(e.target)) {
                hideDropdown();
            }
        } catch (error) {
            console.error('Error in document click handler:', error);
        }
    });

    switchTab('dashboard');
}

function toggleDropdown() {
    const dropdown = document.getElementById('dropdownMenu');
    if (!dropdown) return;
    dropdown.classList.toggle('show');
}

function hideDropdown() {
    const dropdown = document.getElementById('dropdownMenu');
    if (!dropdown) return;
    dropdown.classList.remove('show');
}

function openOrCreateTab(tabId) {
    const existingTab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (existingTab) {
        switchTab(tabId);
    } else {
        createTab(tabId);
    }
}

function createTab(tabId) {
    const existingTab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (existingTab) {
        switchTab(tabId);
        return;
    }

    if (!tabBar) {
        console.error('Tab bar not found');
        return;
    }

    const newTab = document.createElement('button');
    newTab.className = 'tab';
    newTab.dataset.tab = tabId;

    let tabLabel = tabId.charAt(0).toUpperCase() + tabId.slice(1);
    if (tabId === 'threats') tabLabel = 'Intel Center';
    if (tabId === 'chat-control') tabLabel = 'Chat Security';
    if (tabId === 'tracker') tabLabel = 'LCTX';
    if (tabId === 'plugins') tabLabel = 'Plugins';
    if (tabId === 'karline') tabLabel = 'Karline';

    newTab.innerHTML = `
                ${tabLabel}
                <span class="tab-close" title="Close tab">&times;</span>
            `;

    const flexSpacer = tabBar.querySelector('div[style*="flex: 1"]');
    if (flexSpacer) {
        tabBar.insertBefore(newTab, flexSpacer);
    } else {
        tabBar.appendChild(newTab);
    }

    newTab.style.opacity = '0';
    newTab.style.transform = 'translateY(10px)';
    setTimeout(() => {
        newTab.style.transition = 'all 0.3s ease';
        newTab.style.opacity = '1';
        newTab.style.transform = 'translateY(0)';
    }, 10);

    newTab.addEventListener('click', (e) => {
        if (!e.target.classList.contains('tab-close')) {
            switchTab(tabId);
        }
    });

    const closeButton = newTab.querySelector('.tab-close');
    if (closeButton) {
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            closeTab(tabId);
        });
    }

    switchTab(tabId);
}

var _lazyModules = {};

function lazySyncAction(method) {
    if (window.pazatorSync) { return window.pazatorSync[method](); }
    ensureLazyModule('sync', 'js/apps/sync.js', function () { return !!window.pazatorSync; }).then(function () {
        if (window.pazatorSync) window.pazatorSync[method]();
    });
}

function ensureLazyModule(moduleName, scriptSrc, checkFn) {
    if (_lazyModules[moduleName]) return Promise.resolve();
    _lazyModules[moduleName] = 'loading';
    return new Promise(function (resolve, reject) {
        if (typeof checkFn === 'function' && checkFn()) {
            _lazyModules[moduleName] = 'loaded';
            resolve();
            return;
        }
        var script = document.createElement('script');
        script.src = scriptSrc;
        script.onload = function () {
            _lazyModules[moduleName] = 'loaded';
            resolve();
        };
        script.onerror = function () {
            _lazyModules[moduleName] = 'failed';
            reject(new Error('Failed to load: ' + scriptSrc));
        };
        document.body.appendChild(script);
    });
}

function switchTab(tabId) {
    const prevActiveTab = document.querySelector('.tab-content.active');
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    const activeTab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    const activeContent = document.getElementById(`${tabId}-tab`);
    if (activeContent) {
        activeContent.classList.add('active');
    }

    if (tabId === 'chat-control') {
        loadSavedChats();
    } else if (tabId === 'search') {
        setTimeout(initSearchTab, 50);
    } else if (tabId === 'threats') {
        updateIntelligenceCenterStats();
        ensureLazyModule('dashboard', 'js/apps/dashboard.js', function () { return !!window.pazatorDashboard; }).then(function () {
            if (window.pazatorDashboard) {
                if (!window.pazatorDashboard._initialized) {
                    window.pazatorDashboard.init();
                    window.pazatorDashboard._initialized = true;
                } else {
                    window.pazatorDashboard.refresh();
                }
            }
        });
    } else if (tabId === 'tracker') {
        ensureTrackerConfig(true);
        ensureTrackerTabReady();
        ensureLazyModule('gis', 'js/apps/gis.js', function () { return !!window.pazatorGIS; }).then(function () {
            if (window.pazatorGIS) {
                if (!window.pazatorGIS._initialized) {
                    window.pazatorGIS.init();
                    window.pazatorGIS._initialized = true;
                } else {
                    window.pazatorGIS.refreshEntities();
                }
            }
        });
    } else if (tabId === 'cases') {
        setTimeout(initCasesTab, 50);
    } else if (tabId === 'ontology') {
        ensureLazyModule('ontology', 'js/apps/ontology.js', function () { return !!window.pazatorOntologyDesigner; }).then(function () {
            if (window.pazatorOntologyDesigner) {
                window.pazatorOntologyDesigner.openInTab();
            }
        });
    } else if (tabId === 'pipelines') {
        ensureLazyModule('pipelines', 'js/apps/pipelines.js', function () { return !!window.pazatorPipelines; }).then(function () {
            if (window.pazatorPipelines) {
                if (!window.pazatorPipelines._initialized) {
                    window.pazatorPipelines.init();
                    window.pazatorPipelines._initialized = true;
                }
                window.pazatorPipelines.renderPipelineManager('pipelineTabContent');
            }
        });
    } else if (tabId === 'alerts') {
        ensureLazyModule('alerts', 'js/apps/alerts.js', function () { return !!window.pazatorAlerts; }).then(function () {
            if (window.pazatorAlerts) {
                if (!window.pazatorAlerts._initialized) {
                    window.pazatorAlerts.init();
                    window.pazatorAlerts._initialized = true;
                }
                window.pazatorAlerts.renderAlertCenter('alertTabContent');
            }
        });
    } else if (tabId === 'api') {
        ensureLazyModule('api', 'js/apps/api.js', function () { return !!window.pazatorAPI; }).then(function () {
            if (window.pazatorAPI) {
                if (!window.pazatorAPI._initialized) {
                    window.pazatorAPI.init();
                    window.pazatorAPI._initialized = true;
                }
                window.pazatorAPI.renderAPIConsole('apiTabContent');
            }
        });
    } else if (tabId === 'workflow') {
        ensureLazyModule('workflow', 'js/apps/workflow.js', function () { return !!window.pazatorWorkflow; }).then(function () {
            if (window.pazatorWorkflow) {
                if (!window.pazatorWorkflow._initialized) {
                    window.pazatorWorkflow.init();
                    window.pazatorWorkflow._initialized = true;
                }
                window.pazatorWorkflow.renderWorkflowEngine('workflowTabContent');
            }
        });
    } else if (tabId === 'reports') {
        ensureLazyModule('reports', 'js/apps/reports.js', function () { return !!window.pazatorReports; }).then(function () {
            if (window.pazatorReports) {
                if (!window.pazatorReports._initialized) {
                    window.pazatorReports.init();
                    window.pazatorReports._initialized = true;
                }
                window.pazatorReports.renderReportBuilder('reportsTabContent');
            }
        });
        ensureLazyModule('report-manager', 'js/apps/report-manager.js', function () { return !!window.pazatorReportManager; });
    } else if (tabId === 'explorer') {
        ensureLazyModule('explorer', 'js/graph/explorer.js', function () { return !!window.pazatorExplorer; }).then(function () {
            if (window.pazatorExplorer) {
                var ctr = document.getElementById('explorerGraph');
                if (ctr && !window.pazatorExplorer._initialized) {
                    window.pazatorExplorer.init(ctr);
                    window.pazatorExplorer._initialized = true;
                } else if (window.pazatorExplorer._initialized) {
                    window.pazatorExplorer.resetView();
                }
            }
        });
    } else if (tabId === 'karline') {
        ensureLazyModule('karline', 'js/apps/karline.js', function () { return !!window.pazatorKarline; }).then(function () {
            if (window.pazatorKarline && !window.pazatorKarline._initialized) {
                window.pazatorKarline.init();
                window.pazatorKarline._initialized = true;
            } else if (window.pazatorKarline) {
                window.pazatorKarline.render();
            }
        });
    } else if (tabId === 'plugins') {
        if (window.pazatorPlugins) {
            setTimeout(function () {
                window.pazatorPlugins.renderManager('pluginsContainer');
            }, 50);
        }
    }

    if (window.Tastur) {
        Tastur.emit('tab_switch', { to: tabId });
    }

    setActiveTabButton(tabId);

}



function setActiveTabButton(tabId) {
    document.querySelectorAll('.tab[data-tab], .tab-action[data-tab-target]').forEach(btn => {
        btn.classList.remove('active');
    });
    const primary = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (primary) primary.classList.add('active');
    const action = document.querySelector(`.tab-action[data-tab-target="${tabId}"]`);
    if (action) action.classList.add('active');
}

function closeTab(tabId) {
    const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    const content = document.getElementById(`${tabId}-tab`);

    if (tab && content) {
        const tabs = document.querySelectorAll('.tab[data-tab]');
        if (tabs.length <= 1) return;

        const isActive = tab.classList.contains('active');

        tab.style.transition = 'all 0.3s ease';
        tab.style.opacity = '0';
        tab.style.transform = 'translateY(10px)';

        setTimeout(() => {
            tab.remove();
            content.remove();

            if (isActive) {
                const remainingTabs = document.querySelectorAll('.tab[data-tab]');
                if (remainingTabs.length > 0) {
                    switchTab(remainingTabs[0].dataset.tab);
                }
            }
        }, 300);
    }
}
