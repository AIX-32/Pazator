function syncAllObjectsFromHumans() {
    if (!window.pazatorObjects) return;
    (pazatorData.humans || []).forEach(function (h) {
        pazatorObjects.ensureObjectsForHuman(h);
    });
}

function getObjectStatsSummary() {
    if (!window.pazatorObjects) return 'Object system not available';
    var stats = pazatorObjects.getStats();
    var types = pazatorObjects.getTypes().filter(function (t) { return (stats[t] || 0) > 0; });
    var lines = ['OBJECT SYSTEM:'];
    lines.push('- ' + stats.total + ' total objects across ' + types.length + ' categories');
    types.forEach(function (t) {
        lines.push('  ' + pazatorObjects.getTypeLabel(t) + ': ' + stats[t] + ' objects');
    });
    return lines.join('\n');
}

function getObjectConnections(type, name) {
    if (!window.pazatorObjects) return [];
    var obj = pazatorObjects.getByName(type, name);
    if (!obj) return [];
    var fieldMap = {
        gender: 'gender', maritalStatus: 'maritalStatus', nationality: 'nationality',
        countryOfOrigin: 'countryOfOrigin', immigrationStatus: 'immigrationStatus',
        language: 'languages', ethnicity: 'ethnicity', religion: 'religion',
        politicalView: 'politicalViews', threatLevel: 'threatLevel', socialClass: 'socialClass',
        incomeLevel: 'incomeLevel', educationLevel: 'educationLevel', workplace: 'workplace',
        occupation: 'occupation'
    };
    var humanField = fieldMap[type];
    if (!humanField) return [];
    return pazatorData.humans.filter(function (h) {
        var val = h[humanField];
        if (!val) return false;
        if (Array.isArray(val)) return val.some(function (v) { return v.toLowerCase() === obj.name.toLowerCase(); });
        return val.toLowerCase() === obj.name.toLowerCase();
    }).map(function (h) {
        return { id: h.id, name: h.name, threatLevel: h.threatLevel || 'None', credit: h.credit };
    });
}

function updatePersistenceIndicator(status, message) {
    const statusElement = document.getElementById('persistenceStatus');
    const textElement = document.getElementById('persistenceText');

    if (statusElement && textElement) {
        statusElement.className = `persistence-status ${status}`;
        textElement.textContent = message;
    }
}

function saveData(immediate = false) {
    try {
        updatePersistenceIndicator('syncing', 'Saving data...');

        if (window.pazatorStore) {
            pazatorStore.syncToEngine().catch(function (err) {
                console.warn('Background engine sync failed:', err);
            });
        }

        if (immediate) {
            console.log(' Data saved successfully at', new Date().toLocaleTimeString());
        }

        pendingChanges = false;
        lastChangeTime = Date.now();

        const totalItems = pazatorData.humans.length + pazatorData.others.length;
        updatePersistenceIndicator('online', `Saved (${totalItems} items)`);
        console.log(` Data persistence confirmed: ${totalItems} items stored`);

        if (window.Tastur) {
            Tastur.emit('data_added', { count: totalItems });
        }

    } catch (error) {
        console.error(' Error saving data:', error);
        updatePersistenceIndicator('offline', 'Save Failed');
    }
}

function markDataChanged() {
    pendingChanges = true;
    lastChangeTime = Date.now();
    updatePersistenceIndicator('syncing', 'Pending save...');
    syncAllObjectsFromHumans();

    if (window.pazatorStore) {
        pazatorStore.rebuildIndexes();
        pazatorStore.emit('data_changed', { store: 'humans', action: 'mark_changed' });
    }

    if (window.autoSaveTimeout) {
        clearTimeout(window.autoSaveTimeout);
    }

    window.autoSaveTimeout = setTimeout(() => {
        if (pendingChanges) {
            saveData();
        }
    }, AUTO_SAVE_DELAY);

    if (window.pazatorStore) {
        pazatorStore.emit('entity_changed', { id: 'all', type: 'humans', action: 'updated' });
    }
}

function scheduleRender(renderFn) {
    if (window._pendingRender) return;
    window._pendingRender = true;
    requestAnimationFrame(function () {
        window._pendingRender = false;
        if (renderFn) renderFn();
    });
}

function manualRefresh() {
    console.log(' Manual refresh triggered');
    updatePersistenceIndicator('syncing', 'Refreshing...');

    loadData().then(function () {
        renderTags();
        updatePersistenceIndicator('online', 'Refreshed (' + (pazatorData.humans.length + pazatorData.others.length) + ' items)');
        console.log(' Manual refresh completed');
    }).catch(function (error) {
        console.error(' Manual refresh failed:', error);
        updatePersistenceIndicator('offline', 'Refresh Failed');
    });
}

function startAutoSave() {
    autoSaveInterval = setInterval(() => {
        saveData();
    }, PERIODIC_SAVE_INTERVAL);

    console.log('Auto-save system started');
}

function stopAutoSave() {
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }
    if (window.autoSaveTimeout) {
        clearTimeout(window.autoSaveTimeout);
        window.autoSaveTimeout = null;
    }
    console.log('Auto-save system stopped');
}

function normalizeLoadedData() {
    if (!pazatorData || typeof pazatorData !== 'object') return;
    if (!Array.isArray(pazatorData.humans)) pazatorData.humans = [];
    if (!Array.isArray(pazatorData.others)) pazatorData.others = [];

    const normalizeNameKey = (name) => String(name || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

    const isHumanId = (value) => /^PZI\d{4}\d{2}$/.test(String(value || '').trim());

    // Field normalization (notes aliases, array defaults).
    pazatorData.humans.forEach(human => {
        if (!human || typeof human !== 'object') return;
        if (!human.extraNotes && human.notes) human.extraNotes = human.notes;
        if (!Array.isArray(human.tags)) human.tags = [];
        if (!Array.isArray(human.friends)) {
            human.friends = typeof human.friends === 'string'
                ? human.friends.split(',').map(v => v.trim()).filter(Boolean)
                : [];
        }
        if (!Array.isArray(human.family)) {
            human.family = typeof human.family === 'string'
                ? human.family.split(',').map(v => v.trim()).filter(Boolean)
                : [];
        }
    });

    pazatorData.others.forEach(other => {
        if (!other || typeof other !== 'object') return;
        if (!other.note && other.notes) other.note = other.notes;
        if (!Array.isArray(other.tags)) other.tags = other.tags ? [String(other.tags)] : [];
    });

    // Relationship normalization (names → ids).
    const nameToId = new Map();
    const knownIds = new Set();
    pazatorData.humans.forEach(h => {
        if (!h || !h.id) return;
        knownIds.add(String(h.id));
        const key = normalizeNameKey(h.name);
        if (key && !nameToId.has(key)) nameToId.set(key, String(h.id));
    });

    const resolveHumanRef = (token) => {
        const raw = String(token || '').trim();
        if (!raw) return null;
        if (isHumanId(raw) && knownIds.has(raw)) return raw;
        const key = normalizeNameKey(raw);
        if (key && nameToId.has(key)) return nameToId.get(key);

        const stub = {
            id: generatePersonId(raw, ''),
            name: raw,
            birthDate: '',
            extraNotes: '',
            tags: [],
            chats: [],
            cases: [],
            friends: [],
            family: []
        };
        pazatorData.humans.push(stub);
        knownIds.add(stub.id);
        if (key) nameToId.set(key, stub.id);
        return stub.id;
    };

    pazatorData.humans.forEach(human => {
        if (!human || typeof human !== 'object') return;
        const resolvedFriends = (human.friends || [])
            .map(resolveHumanRef)
            .filter(Boolean)
            .filter(id => id !== human.id);
        const resolvedFamily = (human.family || [])
            .map(resolveHumanRef)
            .filter(Boolean)
            .filter(id => id !== human.id);

        human.friends = [...new Set(resolvedFriends)];
        human.family = [...new Set(resolvedFamily)];
    });
}

function loadData() {
    var loadIndicator = document.getElementById('dataLoadIndicator');
    if (loadIndicator) loadIndicator.style.display = 'flex';

    var loadPromise = window.pazatorStore
        ? pazatorStore.loadFromEngine()
        : Promise.resolve();

    return loadPromise.then(function () {
        if (window.pazatorStore) {
            var d = pazatorStore._data;
            pazatorData.humans = d.humans || [];
            pazatorData.others = d.others || [];
            tags = d.tags || [];
            cases = d.cases || [];
        } else {
            pazatorData.humans = [];
            pazatorData.others = [];
            tags = [];
            cases = [];
        }

        window.pazatorData = pazatorData;
        updatePersonIdSequenceFromData();
        normalizeLoadedData();

        if (window.pazatorRelationships) {
            var migrated = window.pazatorRelationships.migrateFromLegacy(pazatorData.humans);
            if (migrated > 0) console.log('Migrated ' + migrated + ' legacy relationships');
        }

        syncAllObjectsFromHumans();

        renderObjectCanvas();
        updateCreditStats();
        updateHeaderStats();

        buildFacetIndex();

        if (pazatorData.humans.length === 0 && pazatorData.others.length === 0) {
            saveData(true);
        }

        const totalItems = pazatorData.humans.length + pazatorData.others.length;
        updatePersistenceIndicator('online', 'Loaded (' + totalItems + ' items)');
        if (loadIndicator) {
            loadIndicator.style.display = 'none';
            setTimeout(function () { loadIndicator.style.display = 'none'; }, 500);
        }
        showFloatingNotification('Loaded ' + totalItems + ' items', 'success');
    }).catch(function (error) {
        console.error('Error loading data:', error);
        var store = window.pazatorStore ? window.pazatorStore._data : null;
        pazatorData.humans = store ? store.humans || [] : [];
        pazatorData.others = store ? store.others || [] : [];
        tags = store ? store.tags || [] : [];
        cases = store ? store.cases || [] : [];
        window.pazatorData = pazatorData;

        const totalItems = 0;
        updatePersistenceIndicator('offline', 'Load Failed');
        if (loadIndicator) {
            loadIndicator.style.display = 'none';
        }
        showFloatingNotification('Failed to load data', 'error');
    });
}
function renderObjectCanvas() {
    var webContent = document.getElementById('webContent');
    var visOffOverlay = document.getElementById('visOffOverlay');
    var visEmptyOverlay = document.getElementById('visEmptyOverlay');
    var vtContainer = document.getElementById('virtualTableContainer');

    if (vtContainer) vtContainer.style.display = 'none';
    if (visOffOverlay) visOffOverlay.style.display = 'none';
    if (visEmptyOverlay) visEmptyOverlay.style.display = 'none';
    webContent.style.display = '';

    var stats = pazatorObjects.getStats();
    var totalObjs = stats.total;
    var totalHumans = pazatorData.humans.length;

    if (totalObjs === 0 && totalHumans === 0) {
        if (visEmptyOverlay) visEmptyOverlay.style.display = 'flex';
        return;
    }

    var types = pazatorObjects.getTypes();

    var html = '<div class="obj-canvas">';
    html += '<div class="obj-canvas-top">';
    html += '<div class="obj-canvas-top-left">';
    html += '<div class="obj-canvas-titles">';
    html += '<div class="obj-canvas-title">Object Graph</div>';
    html += '<div class="obj-canvas-subtitle">' + totalObjs + ' objects across ' + types.filter(function (t) { return (stats[t] || 0) > 0; }).length + ' categories</div>';
    html += '</div></div>';
    html += '<div class="obj-canvas-top-right">';
    html += '<div class="obj-canvas-pill"><i class="fas fa-cube"></i> ' + totalObjs + '</div>';
    html += '<div class="obj-canvas-pill"><i class="fas fa-users"></i> ' + totalHumans + '</div>';
    html += '<div class="obj-canvas-search" id="objCanvasSearchWrap">';
    html += '<i class="fas fa-search"></i>';
    html += '<input type="text" id="objCanvasSearch" placeholder="Find object..." class="obj-search-input">';
    html += '</div></div></div>';

    html += '<div class="obj-type-strip" id="objTypeStrip">';
    html += '<button class="obj-type-chip active" data-type="_all">All</button>';
    types.forEach(function (t) {
        var count = stats[t] || 0;
        if (count > 0) {
            html += '<button class="obj-type-chip" data-type="' + t + '">' +
                '<i class="fas ' + pazatorObjects.getTypeIcon(t) + '"></i> ' +
                pazatorObjects.getTypeLabel(t).split(' ')[0] +
                ' <span class="obj-chip-count">' + count + '</span></button>';
        }
    });
    html += '</div>';

    html += '<div class="obj-field" id="objField">';
    html += '<div class="obj-field-inner" id="objFieldInner"></div>';
    html += '</div></div>';

    webContent.innerHTML = html;
    webContent.style.width = '100%';
    webContent.style.height = '100%';
    webContent.style.transform = 'none';
    webContent.style.position = 'relative';
    currentScale = 1;
    currentTranslateX = 0;
    currentTranslateY = 0;

    document.querySelectorAll('.obj-type-chip').forEach(function (tab) {
        tab.addEventListener('click', function () {
            document.querySelectorAll('.obj-type-chip').forEach(function (t) { t.classList.remove('active'); });
            this.classList.add('active');
            renderObjectsToField(this.dataset.type);
        });
    });

    var searchInput = document.getElementById('objCanvasSearch');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            var activeChip = document.querySelector('.obj-type-chip.active');
            renderObjectsToField(activeChip ? activeChip.dataset.type : '_all', this.value);
        });
    }

    renderObjectsToField('_all');
}

function renderObjectsToField(type, searchQuery) {
    var field = document.getElementById('objFieldInner');
    if (!field) return;

    var types = pazatorObjects.getTypes();
    var hasContent = false;
    var search = (searchQuery || '').toLowerCase().trim();
    var html = '';

    if (type === '_all') {
        types.forEach(function (t) {
            var objects = pazatorObjects.getAll(t);
            if (objects.length === 0) return;
            var rendered = renderObjectCluster(t, objects, search);
            if (rendered) {
                html += rendered;
                hasContent = true;
            }
        });
    } else {
        var objects = pazatorObjects.getAll(type);
        var rendered = renderObjectCluster(type, objects, search);
        if (rendered) {
            html += rendered;
            hasContent = true;
        }
    }

    if (!hasContent) {
        html = '<div class="obj-void">';
        html += '<div class="obj-void-icon">◈</div>';
        html += '<div class="obj-void-text">' + (search ? 'No objects match "' + searchQuery + '"' : 'No objects yet') + '</div>';
        html += '<div class="obj-void-hint">Create humans with new field values — objects appear here automatically</div>';
        html += '</div>';
    }

    field.innerHTML = html;

    _attachTileEvents(field);
}

function renderObjectCluster(type, objects, search) {
    var sorted = objects.slice().sort(function (a, b) { return (b.usageCount || 0) - (a.usageCount || 0); });
    if (search) {
        sorted = sorted.filter(function (o) {
            return o.name.toLowerCase().indexOf(search) !== -1;
        });
    }
    if (sorted.length === 0) return null;

    var maxUsage = sorted.length > 0 ? Math.max(1, sorted[0].usageCount || 1) : 1;
    var icon = pazatorObjects.getTypeIcon(type);
    var label = pazatorObjects.getTypeLabel(type);
    var clusterId = 'obj-cluster-' + type;

    var html = '<div class="obj-cluster" data-type="' + type + '" id="' + clusterId + '">';
    html += '<div class="obj-cluster-head">';
    html += '<i class="fas ' + icon + '"></i> ';
    html += '<span>' + label + '</span>';
    html += '<span class="obj-cluster-count">' + sorted.length + '</span>';
    html += '</div>';
    html += '<div class="obj-cluster-body" id="' + clusterId + '-body">';
    for (var i = 0; i < sorted.length; i++) {
        var obj = sorted[i];
        var usage = obj.usageCount || 0;
        var sizeFactor = maxUsage > 1 ? (usage / maxUsage) : 0.3;
        var fontSize = 11 + Math.round(sizeFactor * 5);
        var opacity = 0.5 + sizeFactor * 0.5;
        html += '<div class="obj-tile" data-obj-id="' + obj.id + '" data-obj-type="' + type + '" style="opacity:' + opacity + '">' +
            '<div class="obj-tile-inner"><span class="obj-tile-name" style="font-size:' + fontSize + 'px">' + escapeHtml(obj.name) + '</span>' +
            '<span class="obj-tile-count">' + usage + '</span></div></div>';
    }
    html += '</div></div>';

    return html;
}

function showObjectDetail(objId, objType) {
    if (window.pazatorObjectExplorer && window.pazatorStore) {
        var entity = window.pazatorStore.getObjectById(objId);
        if (entity) {
            window.pazatorObjectExplorer.open(objId);
            return;
        }
    }
    try {
        if (!window.pazatorObjects) { showToast('Object system not loaded', 'error'); return; }
        var obj = pazatorObjects.getById(objId);
        if (!obj) { showToast('Object not found (id=' + objId + ')', 'error'); return; }

        var matchedHumans = pazatorData.humans.filter(function (h) {
            var fieldMap = {
                gender: h.gender,
                maritalStatus: h.maritalStatus,
                nationality: h.nationality,
                countryOfOrigin: h.countryOfOrigin,
                immigrationStatus: h.immigrationStatus,
                language: h.languages,
                ethnicity: h.ethnicity,
                religion: h.religion,
                politicalView: h.politicalViews,
                threatLevel: h.threatLevel,
                socialClass: h.socialClass,
                incomeLevel: h.incomeLevel,
                educationLevel: h.educationLevel,
                workplace: h.workplace,
                occupation: h.occupation
            };
            var fieldVal = fieldMap[objType];
            if (!fieldVal) return false;
            if (Array.isArray(fieldVal)) {
                return fieldVal.some(function (v) { return v && v.toLowerCase() === obj.name.toLowerCase(); });
            }
            return fieldVal && fieldVal.toLowerCase() === obj.name.toLowerCase();
        });

        var existing = document.getElementById('objDetailOverlay');
        if (existing) existing.remove();

        var overlayDiv = document.createElement('div');
        overlayDiv.className = 'obj-detail-overlay';
        overlayDiv.id = 'objDetailOverlay';

        var panel = document.createElement('div');
        panel.className = 'obj-detail-panel';

        var closeBtn = document.createElement('button');
        closeBtn.className = 'obj-detail-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', function (e) { e.stopPropagation(); overlayDiv.remove(); });
        panel.appendChild(closeBtn);

        var header = document.createElement('div');
        header.className = 'obj-detail-header';
        header.innerHTML = '<i class="fas ' + pazatorObjects.getTypeIcon(objType) + '"></i><h2>' + escapeHtml(obj.name) + '</h2><span class="obj-detail-type">' + pazatorObjects.getTypeLabel(objType) + '</span>';
        panel.appendChild(header);

        var stats = document.createElement('div');
        stats.className = 'obj-detail-stats';
        stats.innerHTML = '<div class="obj-detail-stat"><span>' + matchedHumans.length + '</span> Humans</div>';
        panel.appendChild(stats);

        var humansContainer = document.createElement('div');
        humansContainer.className = 'obj-detail-humans';

        if (matchedHumans.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'obj-empty-state';
            empty.innerHTML = '<p>No humans with this object</p>';
            humansContainer.appendChild(empty);
        } else {
            matchedHumans.forEach(function (h) {
                var card = document.createElement('div');
                card.className = 'obj-human-card';
                card.addEventListener('click', function (e) { e.stopPropagation(); showDetailView(h, 'human'); });
                var avatarHtml = h.imagePreview
                    ? '<img src="' + h.imagePreview + '" alt="">'
                    : '<i class="fas fa-user"></i>';
                card.innerHTML = '<div class="obj-human-avatar">' + avatarHtml + '</div><div class="obj-human-info"><div class="obj-human-name">' + escapeHtml(h.name) + '</div><div class="obj-human-extra">' + (h.threatLevel ? 'Threat: ' + h.threatLevel : '') + '</div></div>';
                humansContainer.appendChild(card);
            });
        }

        panel.appendChild(humansContainer);
        overlayDiv.appendChild(panel);
        overlayDiv.addEventListener('click', function (e) { if (e.target === overlayDiv) overlayDiv.remove(); });
        document.body.appendChild(overlayDiv);
    } catch (e) {
        console.error('showObjectDetail error:', e);
        showToast('Error showing object detail: ' + e.message, 'error');
    }
}

// ── Object tile context menu ──────────────────────────────────────
var _objCtxMenu = null;
var _ctxTarget = null;

function _ensureObjCtxMenu() {
    if (_objCtxMenu) return;
    _objCtxMenu = document.createElement('div');
    _objCtxMenu.className = 'obj-context-menu';
    _objCtxMenu.id = 'objContextMenu';
    _objCtxMenu.innerHTML =
        '<div class="obj-ctx-item" data-action="detail"><i class="fas fa-eye"></i> View Details</div>' +
        '<div class="obj-ctx-item" data-action="filter"><i class="fas fa-filter"></i> Filter by this</div>' +
        '<div class="obj-ctx-item" data-action="search"><i class="fas fa-search"></i> Search in graph</div>' +
        '<div class="obj-ctx-sep"></div>' +
        '<div class="obj-ctx-item" data-action="copy"><i class="fas fa-copy"></i> Copy name</div>';
    _objCtxMenu.addEventListener('click', function (e) {
        var item = e.target.closest('.obj-ctx-item');
        if (!item || !_ctxTarget) return;
        var action = item.dataset.action;
        var objId = _ctxTarget.dataset.objId;
        var objType = _ctxTarget.dataset.objType;
        _objCtxMenu.style.display = 'none';
        if (action === 'detail') { showObjectDetail(objId, objType); }
        else if (action === 'filter') {
            var chips = document.querySelectorAll('.obj-type-chip');
            chips.forEach(function (c) { c.classList.toggle('active', c.dataset.type === objType); });
            var searchInput = document.getElementById('objCanvasSearch');
            if (searchInput) renderObjectsToField(objType);
        }
        else if (action === 'search') {
            var searchInput = document.getElementById('objCanvasSearch');
            if (searchInput) {
                var obj = pazatorObjects.getById(objId);
                searchInput.value = obj ? obj.name : '';
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
        else if (action === 'copy') {
            var obj = pazatorObjects.getById(objId);
            if (obj && navigator.clipboard) navigator.clipboard.writeText(obj.name);
        }
    });
    document.body.appendChild(_objCtxMenu);
    document.addEventListener('click', function () { if (_objCtxMenu) _objCtxMenu.style.display = 'none'; });
}

function _attachTileContextMenu(tile) {
    tile.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        _ctxTarget = this;
        _ensureObjCtxMenu();
        _objCtxMenu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
        _objCtxMenu.style.top = Math.min(e.clientY, window.innerHeight - 160) + 'px';
        _objCtxMenu.style.display = 'block';
    });
}

function _attachTileEvents(field) {
    field.querySelectorAll('.obj-tile').forEach(function (tile) {
        tile.addEventListener('click', function () {
            showObjectDetail(this.dataset.objId, this.dataset.objType);
        });
        _attachTileContextMenu(tile);
    });
}

function showToast(title, message, type, duration) {
    if (typeof title === 'object') {
        var opts = title;
        title = opts.title || '';
        message = opts.message || '';
        type = opts.type || 'info';
        duration = opts.duration;
    }
    if (!message && title) {
        message = title;
        title = '';
    }
    type = type || 'info';
    duration = duration || 4000;

    var container = document.getElementById('toastContainer');
    if (!container) return;

    var icons = {
        info: 'fa-info-circle',
        success: 'fa-check-circle',
        warning: 'fa-exclamation-triangle',
        error: 'fa-times-circle'
    };

    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML =
        '<div class="toast-icon ' + type + '"><i class="fas ' + (icons[type] || 'fa-info-circle') + '"></i></div>' +
        '<div class="toast-body">' +
        (title ? '<div class="toast-title">' + escapeHtml(title) + '</div>' : '') +
        '<div class="toast-message">' + escapeHtml(message) + '</div>' +
        '</div>';

    container.appendChild(toast);

    var autoTimer = setTimeout(function () {
        dismissToast(toast);
    }, duration);

    toast.addEventListener('click', function () {
        clearTimeout(autoTimer);
        dismissToast(toast);
    });
}

function dismissToast(toast) {
    if (toast.classList.contains('removing')) return;
    toast.classList.add('removing');
    setTimeout(function () {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300);
}

function showFloatingNotification(message, type) {
    showToast(message, type);
}

