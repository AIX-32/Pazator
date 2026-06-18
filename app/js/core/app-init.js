function checkAuthStatus() {
    const signInBtn = document.getElementById('signInBtn');
    if (signInBtn && typeof puter !== 'undefined' && puter.auth) {
        if (typeof puter.auth.isSignedIn === 'function') {
            if (puter.auth.isSignedIn()) {
                signInBtn.style.display = 'none';
            } else {
                signInBtn.style.display = 'block';
            }
        } else {
            signInBtn.style.display = 'none';
        }
    }

    // Fire-and-forget; ensures greeting is updated when auth changes.
    updateAccountSection();
}

document.getElementById('signInBtn')?.addEventListener('click', async () => {
    if (typeof puter === 'undefined' || !puter.auth) {
        showAlert('Sign in is not available without Puter. Use the Gemini API key in AI Configuration instead.', 'Info', 'info');
        return;
    }
    try {
        await puter.auth.signIn();
        setTimeout(checkAuthStatus, 1000);
    } catch (error) {
        console.error('Sign in failed:', error);
    }
});

if (typeof puter !== 'undefined' && puter.auth) {
    checkAuthStatus();

    if (typeof puter.auth.on === 'function') {
        puter.auth.on('signed-in', () => {
            checkAuthStatus();
        });

        puter.auth.on('signed-out', () => {
            checkAuthStatus();
        });
    }
} else {
    const authCheckInterval = setInterval(() => {
        if (typeof puter !== 'undefined' && puter.auth) {
            checkAuthStatus();
            clearInterval(authCheckInterval);
        }
    }, 500);

    setTimeout(() => {
        clearInterval(authCheckInterval);
    }, 10000);
}

console.log(' Initializing Pazator app...');

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupLogoDropdownListeners);
} else {
    setupLogoDropdownListeners();
}

function setupLogoDropdownListeners() {
    console.log(' Setting up logo dropdown event listeners...');

    const refreshNodesOption = document.getElementById('refreshNodesOption');
    const classifyOption = document.getElementById('classifyOption');
    const exportCsvOption = document.getElementById('exportCsvOption');
    const settingsOption = document.getElementById('settingsOption');
    const aboutOption = document.getElementById('aboutOption');

    console.log(' Refresh option exists:', !!refreshNodesOption);
    console.log(' Classify option exists:', !!classifyOption);
    console.log(' Export CSV option exists:', !!exportCsvOption);
    console.log(' Settings option exists:', !!settingsOption);
    console.log(' About option exists:', !!aboutOption);

    const aboutOverlay = document.getElementById('aboutOverlay');
    const aboutCard = document.getElementById('aboutCard');
    const closeAboutBtn = document.getElementById('closeAboutBtn');

    if (aboutOverlay && aboutCard) {
        function onAboutKeydown(event) {
            if (event.key === 'Escape') {
                setAboutOpen(false);
            }
        }

        function setAboutOpen(open) {
            aboutOverlay.classList.toggle('open', open);
            aboutOverlay.setAttribute('aria-hidden', open ? 'false' : 'true');
            if (open) {
                closeAboutBtn?.focus?.();
                document.addEventListener('keydown', onAboutKeydown);
            } else {
                document.removeEventListener('keydown', onAboutKeydown);
            }
        }

        closeAboutBtn?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            setAboutOpen(false);
        });

        aboutOverlay.addEventListener('click', (event) => {
            if (event.target === aboutOverlay) {
                setAboutOpen(false);
            }
        });

        aboutCard.addEventListener('click', (event) => {
            event.stopPropagation();
        });

        aboutOption?.addEventListener('click', (event) => {
            event.stopPropagation();
            window.open('../docs/about_note.html', '_blank');
        });

        settingsOption?.addEventListener('click', (event) => {
            event.stopPropagation();
            openSettingsModal();
        });
    }

    // ─── Neofetch ─────────────────────────────────────────────────────
    const neofetchOption = document.getElementById('neofetchOption');
    const neofetchOverlay = document.getElementById('neofetchOverlay');
    const neofetchCard = document.getElementById('neofetchCard');
    const closeNeofetchBtn = document.getElementById('closeNeofetchBtn');

    if (neofetchOverlay && neofetchCard) {
        function onNeofetchKeydown(e) {
            if (e.key === 'Escape') setNeofetchOpen(false);
        }

        function setNeofetchOpen(open) {
            neofetchOverlay.classList.toggle('open', open);
            neofetchOverlay.setAttribute('aria-hidden', open ? 'false' : 'true');
            if (open) {
                populateNeofetch();
                closeNeofetchBtn?.focus?.();
                document.addEventListener('keydown', onNeofetchKeydown);
            } else {
                document.removeEventListener('keydown', onNeofetchKeydown);
            }
        }

        closeNeofetchBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            setNeofetchOpen(false);
        });

        neofetchOverlay.addEventListener('click', (e) => {
            if (e.target === neofetchOverlay) setNeofetchOpen(false);
        });

        neofetchCard.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        neofetchOption?.addEventListener('click', (e) => {
            e.stopPropagation();
            setNeofetchOpen(true);
        });
    }

    if (refreshNodesOption) {
        console.log(' Adding event listener to Refresh Nodes');
        refreshNodesOption.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log(' Logo dropdown: Refresh Nodes clicked');

            manualRefresh();
        });
    } else {
        console.error(' RefreshNodesOption not found!');
    }

    if (classifyOption) {
        console.log(' Classification system moved to classification.js');
    }

    if (exportCsvOption) {
        exportCsvOption.addEventListener('click', (event) => {
            event.stopPropagation();

            if (!pazatorData || (!Array.isArray(pazatorData.humans) && !Array.isArray(pazatorData.others))) {
                showAlert('No data found to export yet.', 'Notice', 'info');
                return;
            }

            const humans = Array.isArray(pazatorData.humans) ? pazatorData.humans : [];
            const others = Array.isArray(pazatorData.others) ? pazatorData.others : [];

            if (humans.length === 0 && others.length === 0) {
                showAlert('No entries to export yet.', 'Notice', 'info');
                return;
            }

            const headers = ['Name', 'Type', 'Gender', 'Birth Date', 'Marital Status', 'Workplace', 'Nationality', 'Country of Origin', 'Immigration Status', 'Languages', 'Ethnicity', 'Religion', 'Political Views', 'Credit Score', 'Social Class', 'Income Level', 'Education Level', 'Threat Level', 'Notes', 'Tags', 'Friends', 'Family'];

            const csvEscape = (value) => {
                const raw = value == null ? '' : String(value);
                if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
                    return `"${raw.replace(/"/g, '""')}"`;
                }
                return raw;
            };

            const joinList = (value) => {
                if (!value) return '';
                if (Array.isArray(value)) return value.filter(Boolean).map(String).join(', ');
                return String(value);
            };

            const rows = [];
            rows.push(headers.map(csvEscape).join(','));

            humans.forEach(human => {
                rows.push([
                    human?.name || '',
                    '',
                    human?.gender || '',
                    human?.birthDate || '',
                    human?.maritalStatus || '',
                    human?.workplace || '',
                    human?.nationality || '',
                    human?.countryOfOrigin || '',
                    human?.immigrationStatus || '',
                    human?.languages || '',
                    human?.ethnicity || '',
                    human?.religion || '',
                    human?.politicalViews || '',
                    human?.credit !== undefined ? String(human.credit) : '',
                    human?.socialClass || '',
                    human?.incomeLevel || '',
                    human?.educationLevel || '',
                    human?.threatLevel || '',
                    human?.extraNotes || human?.notes || '',
                    joinList(human?.tags),
                    joinList(human?.friends),
                    joinList(human?.family)
                ].map(csvEscape).join(','));
            });

            others.forEach(other => {
                rows.push([
                    other?.name || '',
                    other?.type || '',
                    '',
                    other?.note || other?.notes || '',
                    '',
                    '',
                    ''
                ].map(csvEscape).join(','));
            });

            const pad2 = (n) => String(n).padStart(2, '0');
            const now = new Date();
            const stamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}_${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`;
            const filename = `pazator-export-${stamp}.csv`;

            const csvText = rows.join('\n');
            const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 0);

            showAlert(`Exported ${humans.length} humans and ${others.length} companies/organizations to CSV.`, 'Success', 'success');
        });
    } else {
        console.error(' ExportCsvOption not found!');
    }
}

console.log(' Checking localStorage availability...');
if (typeof (Storage) !== "undefined") {
    console.log(' localStorage is available');
} else {
    console.error(' localStorage is not available');
}

try {
    loadData();
    console.log(' Data loading completed');

    renderTags();
    console.log(' Tags rendered');

    initTabs();
    console.log(' Tabs initialized');

    startAutoSave();
    console.log(' Auto-save system started');

    if (window.pazatorWorkflow && !window.pazatorWorkflow._initialized) {
        window.pazatorWorkflow.init();
        window.pazatorWorkflow._initialized = true;
        console.log(' Workflow engine initialized');
    }

    if (pazatorData.humans.length === 0 && pazatorData.others.length === 0) {
        saveData(true);
        console.log(' Initial data saved');
    }

    loadVersions();
    console.log(' Versions loaded');

    updateSidebarProfile();
    console.log(' Pazator app fully initialized with enhanced data persistence');
    console.log(` Current data: ${pazatorData.humans.length} humans, ${pazatorData.others.length} others`);

} catch (initError) {
    console.error(' Fatal initialization error:', initError);
    pazatorData = { humans: [], others: [] };
    window.pazatorData = pazatorData;
    tags = [];
    renderObjectCanvas();
    renderTags();
    console.log('️ Using fallback initialization');
}

function loadVersions() {
    fetch('../version.json')
        .then(function (r) { return r.json(); })
        .then(function (v) {
            window.pazatorVersions = v;

            var appVer = document.getElementById('appVersionDisplay');
            if (appVer) appVer.textContent = v.app;

            var tasturVer = document.getElementById('tasturVersionDisplay');
            if (tasturVer) tasturVer.textContent = 'TASTUR ' + v.tastur + ' · WHEN / IF / THEN';

            var tideEl = document.getElementById('neofetchTide');
            if (tideEl) tideEl.textContent = 'v' + v.tide;

            var trackerEl = document.getElementById('neofetchTracker');
            if (trackerEl) trackerEl.textContent = v.tracker;

            var objectsEl = document.getElementById('neofetchObjects');
            if (objectsEl) objectsEl.textContent = v.objects;

            var tasturEl = document.getElementById('neofetchTastur');
            if (tasturEl) tasturEl.textContent = v.tastur;

            var buildEl = document.getElementById('neofetchBuild');
            if (buildEl) buildEl.textContent = v.build;

            var verEl = document.getElementById('neofetchAppVer');
            if (verEl) verEl.textContent = v.app;
        })
        .catch(function (e) {
            console.warn('Failed to load version.json:', e);
        });
}

var _neofetchStart = Date.now();

function populateNeofetch() {
    var entitiesEl = document.getElementById('neofetchEntities');
    if (entitiesEl) {
        var h = (window.pazatorData && window.pazatorData.humans) ? window.pazatorData.humans.length : 0;
        var o = (window.pazatorData && window.pazatorData.others) ? window.pazatorData.others.length : 0;
        entitiesEl.textContent = h + ' humans, ' + o + ' others';
    }

    var uptimeEl = document.getElementById('neofetchUptime');
    if (uptimeEl) {
        var sec = Math.floor((Date.now() - _neofetchStart) / 1000);
        var d = Math.floor(sec / 86400);
        var h = Math.floor((sec % 86400) / 3600);
        var m = Math.floor((sec % 3600) / 60);
        var s = sec % 60;
        var parts = [];
        if (d > 0) parts.push(d + 'd');
        if (h > 0) parts.push(h + 'h');
        parts.push(m + 'm');
        parts.push(s + 's');
        uptimeEl.textContent = parts.join(' ');
    }
}

function updateSidebarProfile() {
    var name = document.getElementById('sidebarProfileName');
    var role = document.getElementById('sidebarProfileRole');
    var last = document.getElementById('sidebarProfileLast');
    if (!name) return;
    var sync = window.pazatorSync;
    var user = sync && sync.getCurrentUser();
    var connected = sync && sync.getServerConnected();
    if (!user) {
        try {
            var raw = localStorage.getItem('pazator_user_cache');
            if (raw) user = JSON.parse(raw);
        } catch (e) {}
    }

    if (last) {
        var state = null;
        try { var sr = localStorage.getItem('pazator_sync_state'); if (sr) state = JSON.parse(sr); } catch (e) {}
        if (state) {
            var parts = [];
            if (state.lastPush) parts.push('push ' + new Date(state.lastPush).toLocaleString());
            if (state.lastPull) parts.push('pull ' + new Date(state.lastPull).toLocaleString());
            last.textContent = parts.join(' · ') || '';
        } else {
            last.textContent = '';
        }
    }

    if (user) {
        name.textContent = 'Welcome back, ' + (user.username || 'Unknown');
        role.textContent = connected ? (user.role || 'user') : 'Offline';
        role.style.color = connected ? '#555' : '#ff9800';
    } else {
        name.textContent = 'Guest';
        role.textContent = 'Not signed in';
        role.style.color = '#555';
        if (last) last.textContent = '';
    }
}
window.updateSidebarProfile = updateSidebarProfile;

const RECENT_SEARCHES_KEY = 'pazatorRecentSearches';
