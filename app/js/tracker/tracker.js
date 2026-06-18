// LCTX Tracker
// ============================================================

const TRACKER_CONFIG_KEY = 'LCTXTrackerConfig';
const TRACKER_CONFIG_EXAMPLE = {
    url: 'https://xyz.supabase.co',
    key: 'anon-key'
};
const DEFAULT_TRACKER_CONFIG = {
    url: '',
    key: ''
};

let trackerConfig = null;
let trackerSupabase = null;
let trackerConfigPromptedThisSession = false;
let pendingTrackerDetailShowAlias = null;
let trackerPersonNames = [];

function hasValidTrackerConfig(config) {
    return Boolean(config && config.url && config.key);
}

function loadTrackerConfig() {
    try {
        const stored = localStorage.getItem(TRACKER_CONFIG_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.warn('Malformed tracker config, ignoring.', e);
    }
    return null;
}

function applyTrackerConfig(config) {
    if (!config || !config.url || !config.key) {
        trackerSupabase = null;
        trackerDebug && (trackerDebug.innerText = 'Tracker disabled until you configure a Supabase connection.');
        return;
    }

    if (typeof supabase === 'undefined') {
        trackerSupabase = null;
        trackerDebug && (trackerDebug.innerText = 'Supabase client library is not available.');
        return;
    }

    trackerSupabase = supabase.createClient(config.url, config.key);
    trackerDebug && (trackerDebug.innerText = 'Tracker connected to ' + config.url);
}

function showTrackerStatusModal(title, message, { variant = 'info', onClose } = {}) {
    const typeColor = {
        info: '#4d9de0',
        success: '#6bcf7f',
        error: '#ff6b6b'
    }[variant] || '#4d9de0';

    const modal = document.createElement('div');
    modal.className = 'modal context-modal';
    modal.style.display = 'flex';
    modal.style.zIndex = '1105';

    const dialog = document.createElement('div');
    dialog.className = 'modal-content';
    dialog.style.maxWidth = '440px';
    dialog.style.minWidth = '320px';

    const header = document.createElement('div');
    header.className = 'modal-header';

    const titleEl = document.createElement('h2');
    titleEl.textContent = title;
    titleEl.style.color = typeColor;
    titleEl.style.fontSize = '1.4rem';
    titleEl.style.margin = '0';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'close';
    closeBtn.type = 'button';
    closeBtn.innerHTML = '&times;';

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.style.padding = '8px 0';
    body.innerHTML = '';
    message = String(message || '');
    message.split('\n').forEach((line, index) => {
        const paragraph = document.createElement('p');
        paragraph.textContent = line;
        paragraph.style.margin = index ? '12px 0 0' : '0';
        paragraph.style.color = '#d7d7d7';
        paragraph.style.lineHeight = '1.5';
        paragraph.style.fontSize = '0.95rem';
        body.appendChild(paragraph);
    });

    const actions = document.createElement('div');
    actions.className = 'form-actions';
    actions.style.marginTop = '20px';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.textContent = 'Close';
    actions.appendChild(confirmBtn);

    const cleanup = () => {
        if (modal.parentNode) {
            modal.parentNode.removeChild(modal);
        }
        if (typeof onClose === 'function') {
            onClose();
        }
    };

    closeBtn.addEventListener('click', cleanup);
    confirmBtn.addEventListener('click', cleanup);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            cleanup();
        }
    });

    dialog.appendChild(header);
    dialog.appendChild(body);
    dialog.appendChild(actions);
    modal.appendChild(dialog);
    document.body.appendChild(modal);
}

function openTrackerConfigModal(previousConfig, placeholderConfig = {}) {
    const modal = document.createElement('div');
    modal.className = 'modal context-modal';
    modal.style.display = 'flex';
    modal.style.zIndex = '1110';

    const dialog = document.createElement('div');
    dialog.className = 'modal-content';
    dialog.style.maxWidth = '520px';
    dialog.style.minWidth = '320px';

    const header = document.createElement('div');
    header.className = 'modal-header';

    const titleEl = document.createElement('h2');
    titleEl.textContent = 'LCTX Tracker configuration';
    titleEl.style.margin = '0';
    titleEl.style.fontSize = '1.4rem';

    header.appendChild(titleEl);

    const form = document.createElement('form');
    form.className = 'modal-body';
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '16px';
    form.style.padding = '0';

    const info = document.createElement('p');
    info.textContent = 'Enter the Supabase tracker URL and anonymous key so the tracker sync can run securely.';
    info.style.color = '#b7b7b7';
    info.style.fontSize = '0.9rem';
    info.style.margin = '0';

    const createField = (labelText, initialValue, placeholder, type = 'text') => {
        const wrapper = document.createElement('div');
        wrapper.className = 'form-group';
        const label = document.createElement('label');
        label.textContent = labelText;
        label.style.display = 'block';
        label.style.fontSize = '0.85rem';
        label.style.fontWeight = '600';
        label.style.color = '#cfd8ff';
        label.style.marginBottom = '6px';
        const input = document.createElement('input');
        input.className = 'form-control';
        input.type = type;
        input.value = initialValue || '';
        input.placeholder = placeholder;
        input.autocomplete = 'off';
        wrapper.appendChild(label);
        wrapper.appendChild(input);
        return { wrapper, input };
    };

    const urlPlaceholder = placeholderConfig.url || 'https://xyz.supabase.co';
    const keyPlaceholder = placeholderConfig.key || 'Supabase anonymous key';
    const urlField = createField('Supabase URL', previousConfig.url || '', urlPlaceholder, 'url');
    const keyField = createField('Anonymous key', previousConfig.key || '', keyPlaceholder, 'text');

    const messageEl = document.createElement('div');
    messageEl.style.minHeight = '18px';
    messageEl.style.fontSize = '0.9rem';
    messageEl.style.color = '#ff6b6b';
    messageEl.style.margin = '0';

    const actions = document.createElement('div');
    actions.className = 'form-actions';
    actions.style.paddingTop = '12px';
    actions.style.marginTop = '0';
    actions.style.borderTop = '1px solid rgba(255, 255, 255, 0.08)';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = 'Cancel';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Save configuration';

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);

    form.appendChild(info);
    form.appendChild(urlField.wrapper);
    form.appendChild(keyField.wrapper);
    form.appendChild(messageEl);
    form.appendChild(actions);

    const cleanup = () => {
        document.removeEventListener('keydown', handleKeydown);
        if (modal.parentNode) {
            modal.parentNode.removeChild(modal);
        }
    };

    const revertToPrevious = () => {
        trackerDebug && (trackerDebug.innerText = 'Tracker configuration unchanged.');
        if (hasValidTrackerConfig(previousConfig)) {
            applyTrackerConfig(previousConfig);
        } else {
            trackerSupabase = null;
            trackerDebug && (trackerDebug.innerText = 'Tracker disabled until you configure a Supabase connection.');
        }
    };

    const handleCancel = () => {
        revertToPrevious();
        cleanup();
    };

    const handleSave = () => {
        messageEl.textContent = '';
        const trimmedUrl = urlField.input.value.trim();
        const trimmedKey = keyField.input.value.trim();
        if (!trimmedUrl || !trimmedKey) {
            const alertMsg = 'Tracker configuration requires both URL and key.';
            messageEl.textContent = alertMsg;
            trackerDebug && (trackerDebug.innerText = alertMsg);
            return;
        }

        trackerConfig = { url: trimmedUrl, key: trimmedKey, userSaved: true };
        try {
            localStorage.setItem(TRACKER_CONFIG_KEY, JSON.stringify(trackerConfig));
        } catch (storageError) {
            console.warn('Unable to persist tracker config:', storageError);
        }

        applyTrackerConfig(trackerConfig);
        trackerDebug && (trackerDebug.innerText = 'Tracker configuration updated.');
        if (trackerMap) {
            fetchTrackerPeople();
        }
        cleanup();
    };

    const handleKeydown = (event) => {
        if (event.key === 'Escape') {
            handleCancel();
        }
    };

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        handleSave();
    });

    cancelBtn.addEventListener('click', handleCancel);

    [urlField.input, keyField.input].forEach(input => {
        input.addEventListener('input', () => {
            messageEl.textContent = '';
        });
    });

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            handleCancel();
        }
    });

    document.addEventListener('keydown', handleKeydown);

    dialog.appendChild(header);
    dialog.appendChild(form);
    modal.appendChild(dialog);
    document.body.appendChild(modal);

    setTimeout(() => {
        urlField.input.focus();
    }, 0);
}

function promptForTrackerConfig() {
    trackerConfigPromptedThisSession = true;
    const storedConfig = loadTrackerConfig();
    const previousConfig = trackerConfig || storedConfig || DEFAULT_TRACKER_CONFIG;
    openTrackerConfigModal(previousConfig, TRACKER_CONFIG_EXAMPLE);
}

function ensureTrackerConfig(promptForNew = false) {
    const storedConfig = loadTrackerConfig();
    trackerConfig = trackerConfig || storedConfig;
    if (hasValidTrackerConfig(trackerConfig)) {
        applyTrackerConfig(trackerConfig);
    } else {
        trackerSupabase = null;
        trackerDebug && (trackerDebug.innerText = 'Tracker disabled until you configure a Supabase connection.');
    }

    if (promptForNew && !trackerConfigPromptedThisSession && !trackerConfig?.userSaved) {
        promptForTrackerConfig();
    }
}

function formatTrackerTimestamp(iso) {
    if (!iso) return 'never';
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return 'never';
    return parsed.toLocaleString();
}

const TRACKER_META_FIELDS = [
    { key: 'timestamp', label: 'Last seen', format: value => formatTrackerTimestamp(value) },
    { key: 'ip', label: 'IP Address' },
    { key: 'ip_address', label: 'IP Address' },
    { key: 'server', label: 'Server' },
    { key: 'region', label: 'Region' },
    { key: 'country', label: 'Country' },
    { key: 'device', label: 'Device' },
    { key: 'platform', label: 'Platform' },
    { key: 'user_agent', label: 'User Agent' },
    { key: 'speed', label: 'Speed' },
    { key: 'heading', label: 'Heading' }
];

function buildTrackerMetaHtml(row) {
    if (!row) return '';
    const seen = new Set();
    const lines = [];
    TRACKER_META_FIELDS.forEach(field => {
        if (seen.has(field.label)) return;
        let rawValue = row[field.key];
        if (rawValue == null || rawValue === '') return;
        const formatted = field.format
            ? field.format(rawValue)
            : rawValue;
        if (formatted == null || formatted === '') return;
        lines.push(
            '<div class="tracker-meta-line"><span class="tracker-meta-label">' + escapeHtml(field.label) + '</span>' +
            '<strong class="tracker-meta-value">' + escapeHtml(String(formatted)) + '</strong></div>'
        );
        seen.add(field.label);
    });
    if (!lines.length) return '';
    return '<div class="tracker-location-meta">' + lines.join('') + '</div>';
}

async function fetchLatestTrackerLocation(alias) {
    if (!window.trackerSupabase || !alias) return null;
    try {
        var { data, error } = await window.trackerSupabase
            .from('locations')
            .select('*')
            .eq('name', alias)
            .order('timestamp', { ascending: false })
            .limit(1);
        if (error || !data || data.length === 0) return null;
        return data[0];
    } catch (e) {
        console.error('fetchLatestTrackerLocation error:', e);
        return null;
    }
}

function updateDetailTrackerInfo(data) {
    var container = document.getElementById('detailTrackerContainer');
    if (!container) return;
    if (!data || data.type !== 'human') {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    const alias = data.trackerAlias || '';
    const statusText = alias
        ? 'Linked to "' + alias + '" (last sync ' + formatTrackerTimestamp(data.trackerLinkedAt) + ').'
        : 'Not linked yet. Use the tracker tab to connect this person.';

    var statusEl = document.getElementById('detailTrackerStatus');
    if (statusEl) {
        statusEl.textContent = statusText;
    }

    var aliasInput = document.getElementById('detailTrackerAlias');
    if (aliasInput) {
        aliasInput.value = alias || data.name || '';
    }

    var showBtn = document.getElementById('detailTrackerShowBtn');
    if (showBtn) {
        showBtn.disabled = !alias;
    }

    refreshTrackerDataPointCard(alias);
}

function refreshTrackerDataPointCard(alias) {
    var body = document.getElementById('detailTrackerDataPointBody');
    if (!body) return;
    if (!alias || !window.trackerSupabase) {
        body.innerHTML = !alias
            ? '<div style="color:#555;font-style:italic;">Link a tracker alias above to see live data</div>'
            : '<div style="color:#666;">Configure the tracker first</div>';
        return;
    }
    body.innerHTML = '<div style="color:#666;">Loading latest location...</div>';
    fetchLatestTrackerLocation(alias).then(function (loc) {
        var b = document.getElementById('detailTrackerDataPointBody');
        if (!b) return;
        if (!loc) {
            b.innerHTML = '<div style="color:#666;">No location data found for this alias</div>';
            return;
        }
        b.innerHTML =
            '<div class="tracker-datapoint-grid">' +
            '<div class="tracker-datapoint-item"><span class="tdp-label">Coordinates</span><span class="tdp-value">' + loc.latitude.toFixed(4) + ', ' + loc.longitude.toFixed(4) + '</span></div>' +
            (loc.timestamp ? '<div class="tracker-datapoint-item"><span class="tdp-label">Last seen</span><span class="tdp-value">' + formatTrackerTimestamp(loc.timestamp) + '</span></div>' : '') +
            (loc.ip ? '<div class="tracker-datapoint-item"><span class="tdp-label">IP</span><span class="tdp-value">' + escapeHtml(loc.ip) + '</span></div>' : '') +
            (loc.country ? '<div class="tracker-datapoint-item"><span class="tdp-label">Country</span><span class="tdp-value">' + escapeHtml(loc.country) + '</span></div>' : '') +
            (loc.region ? '<div class="tracker-datapoint-item"><span class="tdp-label">Region</span><span class="tdp-value">' + escapeHtml(loc.region) + '</span></div>' : '') +
            (loc.device ? '<div class="tracker-datapoint-item"><span class="tdp-label">Device</span><span class="tdp-value">' + escapeHtml(loc.device) + '</span></div>' : '') +
            (loc.platform ? '<div class="tracker-datapoint-item"><span class="tdp-label">Platform</span><span class="tdp-value">' + escapeHtml(loc.platform) + '</span></div>' : '') +
            '</div>';
    }).catch(function () {
        var b = document.getElementById('detailTrackerDataPointBody');
        if (b) b.innerHTML = '<div style="color:#666;">Failed to load location data</div>';
    });
}

async function reverseGeocodeLocation(lat, lon, signal) {
    if (typeof lat !== 'number' || typeof lon !== 'number') {
        throw new Error('Invalid coordinates');
    }
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.search = new URLSearchParams({
        format: 'json',
        lat: lat.toFixed(6),
        lon: lon.toFixed(6),
        zoom: '14',
        addressdetails: '1'
    }).toString();

    const response = await fetch(url.toString(), {
        method: 'GET',
        signal,
        headers: {
            'Accept-Language': 'en-US,en;q=0.9'
        }
    });

    if (!response.ok) {
        throw new Error('Geocode HTTP ' + response.status);
    }

    const payload = await response.json();
    if (payload && payload.error) {
        throw new Error(payload.error);
    }

    return payload.display_name || payload.address?.road || 'Unknown place';
}

async function setTrackerLocationDetails(lat, lon, metaRow = null) {
    if (!trackerLocationInfo) return;

    const metaIdentifier = metaRow?.timestamp ? metaRow.timestamp : '';
    const key = lat.toFixed(5) + '|' + lon.toFixed(5) + '|' + metaIdentifier;
    if (key === trackerLocationCacheKey) return;
    trackerLocationCacheKey = key;
    trackerLocationInfo.innerHTML = '<span class="tracker-location-status">Resolving place details…</span>';

    if (trackerLocationAbortController) {
        trackerLocationAbortController.abort();
    }
    trackerLocationAbortController = new AbortController();

    try {
        const displayName = await reverseGeocodeLocation(lat, lon, trackerLocationAbortController.signal);
        trackerLocationInfo.innerHTML = '' +
            '<div class="tracker-location-title">' + escapeHtml(displayName) + '</div>' +
            buildTrackerMetaHtml(metaRow) + '';
    } catch (error) {
        if (error.name === 'AbortError') return;
        trackerLocationInfo.innerHTML = '' +
            '<div class="tracker-location-title">Unable to resolve location.</div>' +
            buildTrackerMetaHtml(metaRow) + '';
        console.warn('Tracker reverse geocode failed', error);
    }
}

function requestTrackerShow(alias) {
    if (!alias) return;
    pendingTrackerDetailShowAlias = alias;
    if (trackerMap) {
        showTrackerPersonLocations(alias);
        pendingTrackerDetailShowAlias = null;
    }
}

function ensureTrackerLabelLayers() {
    if (!trackerMap || trackerLabelLayersAdded) return;

    trackerMap.addSource(STREET_LABEL_SOURCE, {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256
    });
    trackerMap.addLayer({
        id: STREET_LABEL_LAYER,
        type: 'raster',
        source: STREET_LABEL_SOURCE,
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': 0.9 }
    });

    trackerLabelLayersAdded = true;
}

function toggleLabelLayer(type) {
    if (!trackerMap) return;
    ensureTrackerLabelLayers();

    const layerId = STREET_LABEL_LAYER;
    const btn = trackerStreetLabelBtn;
    const activeState = !streetLabelsActive;

    trackerMap.setLayoutProperty(layerId, 'visibility', activeState ? 'visible' : 'none');

    streetLabelsActive = activeState;

    if (btn) {
        btn.classList.toggle('active', activeState);
        btn.textContent = (activeState ? 'Hide' : 'Show') + ' street names';
    }
}

function setTrackerMapFilterActive(activeState) {
    const enabled = !!activeState;
    trackerFilterActive = enabled;
    trackerMapContainer?.classList.toggle('tracker-filter-active', enabled);

    if (trackerFilterToggleBtn) {
        trackerFilterToggleBtn.classList.toggle('active', enabled);
        trackerFilterToggleBtn.textContent = (enabled ? 'Hide' : 'Show') + ' filter';
    }
}

function toggleTrackerMapFilter() {
    setTrackerMapFilterActive(!trackerFilterActive);
}

const trackerSidebar = document.getElementById('trackerSidebar');
const trackerPeopleListEl = document.getElementById('trackerPeopleList');
const trackerDebug = document.getElementById('trackerDebug');
const trackerLocationInfo = document.getElementById('trackerLocationInfo');
const trackerToggleSidebarBtn = document.getElementById('trackerToggleSidebarBtn');
const trackerSpinToggleBtn = document.getElementById('trackerSpinToggleBtn');
const trackerStreetLabelBtn = document.getElementById('streetLabelToggle');
const trackerFilterToggleBtn = document.getElementById('trackerFilterToggle');
const trackerSettingsBtn = document.getElementById('trackerSettingsBtn');
const trackerSettingsMenu = document.getElementById('trackerSettingsMenu');
const trackerSpinSpeedInput = document.getElementById('trackerSpinSpeed');
const trackerSpinSpeedValue = document.getElementById('trackerSpinSpeedValue');
const trackerConnectBtn = document.getElementById('trackerConnectBtn');
const trackerRefreshBtn = document.getElementById('trackerRefreshBtn');
const trackerPurgeBtn = document.getElementById('trackerPurgeBtn');
const trackerConfigureBtn = document.getElementById('trackerConfigureBtn');
const trackerMapContainer = document.getElementById('trackerMap');

let _trackerHumanId = null;
let _trackerHumanName = null;
let trackerMap;
let trackerSpinning = false;
let trackerAnimationFrame = null;
let trackerLastSpinTimestamp = null;
let trackerInitialized = false;
let trackerLocationAbortController = null;
let trackerLocationCacheKey = '';
let trackerLabelLayersAdded = false;
let streetLabelsActive = false;
let trackerFilterActive = false;
let trackerSpinSpeedDps = 10;

function setTrackerSpinSpeed(nextSpeed) {
    const parsed = Number(nextSpeed);
    const safeValue = Number.isFinite(parsed) ? Math.max(0, Math.min(60, parsed)) : 10;
    trackerSpinSpeedDps = safeValue;

    if (trackerSpinSpeedInput) trackerSpinSpeedInput.value = String(Math.round(safeValue));
    if (trackerSpinSpeedValue) trackerSpinSpeedValue.textContent = Math.round(safeValue) + '°/s';

    try {
        localStorage.setItem('trackerSpinSpeedDps', String(Math.round(safeValue)));
    } catch (err) {
        // ignore storage errors
    }
}

function setTrackerSettingsMenuOpen(isOpen) {
    if (!trackerSettingsMenu || !trackerSettingsBtn) return;
    trackerSettingsMenu.classList.toggle('open', !!isOpen);
    trackerSettingsBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

try {
    const saved = localStorage.getItem('trackerSpinSpeedDps');
    if (saved != null) setTrackerSpinSpeed(saved);
} catch (err) {
    // ignore storage errors
}

setTrackerSpinSpeed(trackerSpinSpeedDps);

const TRACKER_PATH_LAYER = 'tracker-path';
const TRACKER_MARKERS_LAYER = 'tracker-markers';
const STREET_LABEL_LAYER = 'tracker-street-labels';
const STREET_LABEL_SOURCE = 'tracker-street-source';

setTrackerMapFilterActive(false);

function ensureTrackerTabReady() {
    if (trackerInitialized) {
        refreshTrackerHumanOptions();
        return;
    }

    trackerInitialized = true;
    refreshTrackerHumanOptions();

    if (!trackerMapContainer || typeof maplibregl === 'undefined') {
        trackerDebug && (trackerDebug.innerText = 'Tracker map requires MapLibre library.');
        return;
    }

    trackerMap = new maplibregl.Map({
        container: 'trackerMap',
        style: {
            version: 8,
            sources: {
                satellite: {
                    type: 'raster',
                    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
                    tileSize: 256,
                    attribution: 'Tiles © Esri'
                }
            },
            layers: [{
                id: 'satellite',
                type: 'raster',
                source: 'satellite'
            }]
        },
        center: [0, 0],
        zoom: 2,
        pitch: 60,
        bearing: 0
    });

    trackerMap.on('load', () => {
        startTrackerSpin();
        ensureTrackerLabelLayers();
        fetchTrackerPeople().then(() => {
            if (pendingTrackerDetailShowAlias) {
                showTrackerPersonLocations(pendingTrackerDetailShowAlias);
                pendingTrackerDetailShowAlias = null;
            }
        });
    });
}

function spinTrackerMap(timestamp) {
    if (!trackerSpinning || !trackerMap) return;
    const now = typeof timestamp === 'number' ? timestamp : performance.now();
    if (trackerLastSpinTimestamp == null) trackerLastSpinTimestamp = now;
    const deltaSeconds = Math.min(0.05, Math.max(0, (now - trackerLastSpinTimestamp) / 1000));
    trackerLastSpinTimestamp = now;

    const deltaBearing = trackerSpinSpeedDps * deltaSeconds;
    if (deltaBearing) {
        trackerMap.setBearing((trackerMap.getBearing() + deltaBearing) % 360);
    }

    trackerAnimationFrame = requestAnimationFrame(spinTrackerMap);
}

function startTrackerSpin() {
    if (trackerSpinning) return;
    trackerSpinning = true;
    trackerLastSpinTimestamp = null;
    trackerSpinToggleBtn?.classList.add('active');
    if (trackerSpinToggleBtn) trackerSpinToggleBtn.innerText = 'Pause spin';
    trackerAnimationFrame = requestAnimationFrame(spinTrackerMap);
}

function stopTrackerSpin() {
    trackerSpinning = false;
    trackerLastSpinTimestamp = null;
    trackerSpinToggleBtn?.classList.remove('active');
    if (trackerSpinToggleBtn) trackerSpinToggleBtn.innerText = 'Resume spin';
    if (trackerAnimationFrame) {
        cancelAnimationFrame(trackerAnimationFrame);
        trackerAnimationFrame = null;
    }
}

async function fetchTrackerPeople() {
    if (!trackerSupabase) {
        trackerDebug && (trackerDebug.innerText = 'Tracker connection is unavailable.');
        return;
    }

    trackerDebug && (trackerDebug.innerText = 'Fetching tracker people...');

    const { data, error } = await trackerSupabase
        .from('locations')
        .select('name')
        .order('timestamp', { ascending: false });

    if (error) {
        const message = escapeHtml(error.message || 'Unknown error');
        trackerDebug && (trackerDebug.innerText = 'Error fetching tracker: ' + error.message);
        if (trackerPeopleListEl) {
            trackerPeopleListEl.innerHTML = '<div class="tracker-placeholder">Unable to load tracker data: ' + message + '</div>';
        }
        return;
    }

    if (!data || data.length === 0) {
        trackerDebug && (trackerDebug.innerText = 'Tracker table is empty.');
        if (trackerPeopleListEl) {
            trackerPeopleListEl.innerHTML = '<div class="tracker-placeholder">No tracker data available.</div>';
        }
        return;
    }

    const nameCount = {};
    data.forEach(row => {
        if (!row.name) return;
        nameCount[row.name] = (nameCount[row.name] || 0) + 1;
    });

    const uniqueNames = Object.keys(nameCount).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    renderTrackerPeopleList(uniqueNames, nameCount);

    trackerDebug && (trackerDebug.innerText = 'Found ' + data.length + ' tracker points across ' + uniqueNames.length + ' people.');
}

function renderTrackerPeopleList(names, countMap) {
    if (!trackerPeopleListEl) return;

    if (!names.length) {
        trackerPeopleListEl.innerHTML = '<div class="tracker-placeholder">No tracker data found.</div>';
        return;
    }

    trackerPeopleListEl.innerHTML = '';

    names.forEach(name => {
        const item = document.createElement('div');
        item.className = 'tracker-person-item';
        item.dataset.name = name;
        item.innerHTML = '' +
            '<span>' + escapeHtml(name) + '</span>' +
            '<span class="tracker-person-count">' + countMap[name] + ' point' + (countMap[name] !== 1 ? 's' : '') + '</span>';

        item.addEventListener('click', () => {
            document.querySelectorAll('.tracker-person-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            showTrackerPersonLocations(name);
        });

        trackerPeopleListEl.appendChild(item);
    });

    trackerPersonNames = names;
    updateHumanTrackerOptions();
}

function clearTrackerOverlays() {
    if (!trackerMap) return;
    [TRACKER_PATH_LAYER, TRACKER_MARKERS_LAYER].forEach(layerId => {
        if (trackerMap.getLayer(layerId)) trackerMap.removeLayer(layerId);
        if (trackerMap.getSource(layerId)) trackerMap.removeSource(layerId);
    });
}

function updateHumanTrackerOptions(selectedValue = '') {
    const select = document.getElementById('humanTrackerSelect');
    if (!select) return;
    const previous = select.value;
    select.innerHTML = '<option value="">Select from LCTX tracker</option>';
    trackerPersonNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
    const toSelect = selectedValue || previous;
    if (toSelect) {
        select.value = toSelect;
    }
}

function applyTrackerAliasToHuman(entry, alias, existingEntry = null) {
    if (!entry) return;
    if (alias) {
        entry.trackerAlias = alias;
        if (existingEntry && existingEntry.trackerAlias === alias && existingEntry.trackerLinkedAt) {
            entry.trackerLinkedAt = existingEntry.trackerLinkedAt;
        } else {
            entry.trackerLinkedAt = new Date().toISOString();
        }
    } else {
        delete entry.trackerAlias;
        delete entry.trackerLinkedAt;
    }
}

async function showTrackerPersonLocations(name) {
    if (!trackerSupabase || !trackerMap) {
        trackerDebug && (trackerDebug.innerText = 'Tracker map is not ready.');
        return;
    }

    trackerDebug && (trackerDebug.innerText = 'Loading locations for ' + name + '…');

    const { data, error } = await trackerSupabase
        .from('locations')
        .select('*')
        .eq('name', name)
        .order('timestamp', { ascending: true });

    if (error) {
        trackerDebug && (trackerDebug.innerText = 'Error: ' + error.message);
        return;
    }

    if (!data || data.length === 0) {
        trackerDebug && (trackerDebug.innerText = 'No tracker points for ' + name + '.');
        return;
    }

    clearTrackerOverlays();

    const coords = data
        .filter(row => row.latitude !== null && row.longitude !== null)
        .map(row => [row.longitude, row.latitude]);

    if (!coords.length) {
        trackerDebug && (trackerDebug.innerText = 'Tracker coordinates are invalid.');
        return;
    }

    trackerMap.addSource(TRACKER_PATH_LAYER, {
        type: 'geojson',
        data: {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords }
        }
    });
    trackerMap.addLayer({
        id: TRACKER_PATH_LAYER,
        type: 'line',
        source: TRACKER_PATH_LAYER,
        paint: {
            'line-color': '#000000',
            'line-width': 3,
            'line-opacity': 0.9
        }
    });

    const markersGeoJSON = {
        type: 'FeatureCollection',
        features: coords.map((coord, index) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: coord },
            properties: { index, timestamp: data[index]?.timestamp }
        }))
    };

    trackerMap.addSource(TRACKER_MARKERS_LAYER, { type: 'geojson', data: markersGeoJSON });
    trackerMap.addLayer({
        id: TRACKER_MARKERS_LAYER,
        type: 'circle',
        source: TRACKER_MARKERS_LAYER,
        paint: {
            'circle-radius': 5,
            'circle-color': '#000000',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 1
        }
    });

    const latestPoint = data[data.length - 1];
    const lastCoord = coords[coords.length - 1];
    trackerMap.flyTo({
        center: lastCoord,
        zoom: 15,
        pitch: 60,
        bearing: trackerMap.getBearing(),
        duration: 1800,
        essential: true
    });

    setTrackerLocationDetails(lastCoord[1], lastCoord[0], latestPoint);
}

function connectTrackerSelection() {
    const humanId = _trackerHumanId;
    if (!humanId) {
        trackerDebug && (trackerDebug.innerText = 'Select a Pazator person to connect.');
        return;
    }

    const human = pazatorData.humans.find(h => String(h.id) === humanId || h.name === humanId);

    if (!human) {
        trackerDebug && (trackerDebug.innerText = 'Linked Pazator entry is missing.');
        return;
    }

    const trackerAlias = (human.trackerAlias || _trackerHumanName || human.name).trim();
    human.trackerAlias = trackerAlias || human.name;
    human.trackerLinkedAt = new Date().toISOString();
    saveData();
    refreshTrackerHumanOptions();

    if (document.currentDetailData?.type === 'human' &&
        String(document.currentDetailData.id) === String(human.id)) {
        document.currentDetailData = { ...human, type: 'human' };
        updateDetailTrackerInfo(document.currentDetailData);
    }

    trackerDebug && (trackerDebug.innerText = 'Connected ' + human.name + ' to tracker alias ' + trackerAlias + '.');
    const escName = (typeof CSS !== 'undefined' && CSS.escape)
        ? CSS.escape(trackerAlias)
        : trackerAlias.replace(/["\\]/g, '\\$&');

    const target = document.querySelector('.tracker-person-item[data-name="' + escName + '"]');
    if (target) {
        target.click();
    } else {
        requestTrackerShow(trackerAlias);
    }
}

async function purgeTrackerData() {
    if (!trackerSupabase) {
        trackerDebug && (trackerDebug.innerText = 'Tracker connection is unavailable.');
        return;
    }

    const confirmed = await showConfirm('Delete ALL tracker location data? This cannot be undone.', 'Confirm Deletion', 'warning');
    if (!confirmed) return;

    const { error } = await trackerSupabase
        .from('locations')
        .delete()
        .neq('id', 0);

    if (error) {
        showAlert('Error: ' + error.message, 'Error', 'error');
    } else {
        showAlert('All tracker data purged.', 'Success', 'success');
        fetchTrackerPeople();
        clearTrackerOverlays();
        trackerDebug && (trackerDebug.innerText = 'Tracker data cleared.');
    }
}

function openTrackerHumanPicker() {
    if (window.PazatorUI && window.PazatorUI.showEntityPicker) {
        PazatorUI.showEntityPicker({
            title: 'Select Person to Link',
            onSelect: function (id, name, obj) {
                _trackerHumanId = id;
                _trackerHumanName = name;
                var slot = document.getElementById('trackerHumanSlot');
                if (slot) slot.innerHTML = '<span style="color:#ccc;">' + (name || id) + '</span>';
            }
        });
    }
}

function refreshTrackerHumanOptions() {}

function saveDetailTrackerAlias(humanId) {
    var human = pazatorData.humans.find(function (h) { return h.id === humanId; });
    if (!human) return;
    var input = document.getElementById('detailTrackerAlias');
    if (!input) return;
    var alias = input.value.trim();
    if (alias) {
        human.trackerAlias = alias;
        human.trackerLinkedAt = human.trackerLinkedAt || new Date().toISOString();
    } else {
        delete human.trackerAlias;
        delete human.trackerLinkedAt;
    }
    saveData();
    refreshTrackerHumanOptions();
    if (document.currentDetailData) {
        document.currentDetailData.trackerAlias = human.trackerAlias;
        document.currentDetailData.trackerLinkedAt = human.trackerLinkedAt;
    }
    var statusEl = document.getElementById('detailTrackerStatus');
    if (statusEl) {
        statusEl.textContent = alias
            ? 'Linked to "' + alias + '" (last sync ' + formatTrackerTimestamp(human.trackerLinkedAt) + ').'
            : 'Not linked yet. Use the tracker tab to connect this person.';
    }
    var showBtn = document.getElementById('detailTrackerShowBtn');
    if (showBtn) {
        showBtn.disabled = !alias;
        showBtn.setAttribute('onclick', alias ? 'requestTrackerShow(\'' + alias.replace(/'/g, "\\'") + '\');switchTab(\'tracker\')' : '');
    }
}

// Wire up tracker UI events
document.addEventListener('DOMContentLoaded', function () {
    if (trackerToggleSidebarBtn) {
        trackerToggleSidebarBtn.addEventListener('click', function () {
            trackerSidebar?.classList.toggle('collapsed');
            this.textContent = trackerSidebar?.classList.contains('collapsed') ? 'Show sidebar' : 'Hide sidebar';
        });
    }

    trackerSidebar?.addEventListener('click', function (e) {
        var header = e.target.closest('.sidebar-section-header');
        if (header) {
            header.parentElement.classList.toggle('collapsed');
        }
    });

    if (trackerSpinToggleBtn) {
        trackerSpinToggleBtn.addEventListener('click', function () {
            if (trackerSpinning) {
                stopTrackerSpin();
            } else {
                startTrackerSpin();
            }
        });
    }

    if (trackerStreetLabelBtn) {
        trackerStreetLabelBtn.addEventListener('click', function () {
            toggleLabelLayer('street');
        });
    }

    if (trackerFilterToggleBtn) {
        trackerFilterToggleBtn.addEventListener('click', toggleTrackerMapFilter);
    }

    if (trackerSettingsBtn) {
        trackerSettingsBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            const isOpen = trackerSettingsMenu?.classList.contains('open');
            setTrackerSettingsMenuOpen(!isOpen);
        });
        document.addEventListener('click', function (e) {
            if (trackerSettingsMenu && !trackerSettingsBtn.contains(e.target) && !trackerSettingsMenu.contains(e.target)) {
                setTrackerSettingsMenuOpen(false);
            }
        });
    }

    if (trackerSpinSpeedInput) {
        trackerSpinSpeedInput.addEventListener('input', function () {
            setTrackerSpinSpeed(this.value);
        });
    }

    if (trackerConfigureBtn) {
        trackerConfigureBtn.addEventListener('click', function () {
            const storedConfig = loadTrackerConfig();
            openTrackerConfigModal(storedConfig || trackerConfig || DEFAULT_TRACKER_CONFIG, TRACKER_CONFIG_EXAMPLE);
        });
    }

    if (trackerConnectBtn) {
        trackerConnectBtn.addEventListener('click', connectTrackerSelection);
    }

    if (trackerRefreshBtn) {
        trackerRefreshBtn.addEventListener('click', function () {
            if (trackerSupabase) {
                fetchTrackerPeople();
            } else {
                trackerDebug && (trackerDebug.innerText = 'Tracker connection is unavailable.');
            }
        });
    }

    if (trackerPurgeBtn) {
        trackerPurgeBtn.addEventListener('click', purgeTrackerData);
    }

    var angleBtn = document.getElementById('trackerAngleBtn');
    if (angleBtn) {
        angleBtn.addEventListener('click', function () {
            if (trackerMap) {
                trackerMap.setPitch(60);
            }
        });
    }
    var topDownBtn = document.getElementById('trackerTopDownBtn');
    if (topDownBtn) {
        topDownBtn.addEventListener('click', function () {
            if (trackerMap) {
                trackerMap.setPitch(0);
            }
        });
    }
    var resetViewBtn = document.getElementById('trackerResetViewBtn');
    if (resetViewBtn) {
        resetViewBtn.addEventListener('click', function () {
            if (trackerMap) {
                trackerMap.flyTo({ center: [0, 0], zoom: 2, pitch: 60, bearing: 0, duration: 1000 });
            }
        });
    }

    var trackerSetupGuideBtn = document.getElementById('trackerSetupGuideBtn');
    if (trackerSetupGuideBtn) {
        trackerSetupGuideBtn.addEventListener('click', function () {
            showTrackerStatusModal('How to setup the LCTX tracker server',
                '1. Set up a Supabase project\n2. Create a "locations" table with columns: id, name, latitude, longitude, timestamp, ip, region, country, device, platform, user_agent, speed, heading\n3. Get your Supabase URL and anon key\n4. Click "Configure tracker server" and enter them.\n\nThe tracker will then sync and display live location data.',
                { variant: 'info' });
        });
    }
});
