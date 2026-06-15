function buildFacetIndex() {
    if (!window.pazatorFacets) return;
    try {
        pazatorFacets.getInstance().build(pazatorData.humans, pazatorData.others);
    } catch (e) {
        console.warn('FacetIndex build failed:', e);
    }
}

let currentScale = 1;
let minScale = 0.1;
let maxScale = 5;

let isDragging = false;
let startX, startY;
let startTranslateX = 0, startTranslateY = 0;
let currentTranslateX = 0, currentTranslateY = 0;

const webContent = document.getElementById('webContent');

function renderWebNodes() {
    const visOffOverlay = document.getElementById('visOffOverlay');
    const visEmptyOverlay = document.getElementById('visEmptyOverlay');
    const totalDataCount = pazatorData.humans.length + pazatorData.others.length;

    if (totalDataCount === 0) {
        if (visEmptyOverlay) visEmptyOverlay.style.display = 'flex';
        if (visOffOverlay) visOffOverlay.style.display = 'none';
        webContent.innerHTML = '';
        return;
    }

    let allData = [
        ...pazatorData.humans.map(h => ({ ...h, type: 'human' })),
        ...pazatorData.others.map(o => ({ ...o, type: 'other' }))
    ];

    if (visOffOverlay) visOffOverlay.style.display = 'none';
    if (visEmptyOverlay) visEmptyOverlay.style.display = 'none';

    renderVirtualTable(allData);
    updateHeaderStats();
}



var _vtListInstance = null;
var _vtSortField = null;
var _vtSortDir = 'asc';
var _vtSelected = new Set();
var _vtData = [];

function renderVirtualTable(allData) {
    var container = document.getElementById('virtualTableContainer');
    var body = document.getElementById('virtualTableBody');
    var pagination = document.getElementById('virtualTablePagination');
    var webContent = document.getElementById('webContent');
    var webContainer = document.getElementById('webContainer');
    if (!container || !body) return;

    webContent.style.display = 'none';
    container.style.display = 'flex';
    if (webContainer) webContainer.style.overflow = 'visible';

    var data = allData || [];
    _vtData = data;

    // Render bulk selection bar
    renderBulkBar(container);

    function renderSortHeader(label, field, cls) {
        var isActive = _vtSortField === field;
        var dir = isActive ? _vtSortDir : '';
        return '<div class="vt-col ' + cls + '" data-sort="' + field + '" onclick="toggleSort(\'' + field + '\')">' +
            label + ' <span class="sort-icon ' + (isActive ? 'active' : '') + '">' +
            (dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '⇅') + '</span></div>';
    }

    // Apply sort
    var sortedData = _vtSortField ? sortData(data, _vtSortField, _vtSortDir) : data;

    var headerRow = container.querySelector('.virtual-table-header');
    var existingCount = headerRow.querySelector('.vt-row-count');
    if (!existingCount) {
        var countEl = document.createElement('span');
        countEl.className = 'vt-row-count';
        countEl.style.cssText = 'margin-left:auto;font-size:0.75rem;color:#888;white-space:nowrap;';
        headerRow.appendChild(countEl);
    }
    headerRow.querySelector('.vt-row-count').textContent = data.length + ' entries';

    function renderItem(item, index) {
        if (!item) return '';
        var typeClass = item.type === 'human' ? 'human-row' : 'other-row';
        var threatLevel = item.threatLevel || 'None';
        var threatClass = threatLevel.toLowerCase();
        var credit = item.credit !== undefined ? item.credit : 185;
        var creditClass = credit >= 250 ? 'high' : credit >= 125 ? 'medium' : 'low';
        var tags = (item.tags || []).slice(0, 5);
        var tagsHtml = tags.length > 0 ? tags.map(function (t) { return '<span class="vt-tag">' + escapeHtml(t) + '</span>'; }).join('') : '<span style="color:#666;font-size:0.75rem;">—</span>';
        var isSelected = _vtSelected.has(item.id);
        var chatCount = (item.chats || []).length;
        var caseCount = (item.cases || []).length;
        return '<div class="vt-row ' + typeClass + (isSelected ? ' selected' : '') + '" data-id="' + escapeHtml(item.id) + '" data-type="' + item.type + '">' +
            '<div class="vt-col vt-col-checkbox"><input type="checkbox" ' + (isSelected ? 'checked' : '') + ' onclick="event.stopPropagation();toggleBulkSelect(\'' + escapeHtml(item.id) + '\')"></div>' +
            '<div class="vt-col vt-col-name" onclick="openSlidePanel(\'' + escapeHtml(item.id) + '\',\'' + item.type + '\')">' + escapeHtml(item.name || 'Unknown') + (window.pazatorClassification ? window.pazatorClassification.getBadgeHTML(item) : '') + '</div>' +
            '<div class="vt-col vt-col-type"><span class="vt-type-badge ' + item.type + '">' + item.type + '</span></div>' +
            '<div class="vt-col vt-col-threat"><span class="vt-threat-badge ' + threatClass + '" ondblclick="inlineEditThreat(this,\'' + escapeHtml(item.id) + '\')">' + threatLevel + '</span></div>' +
            '<div class="vt-col vt-col-credit"><span class="vt-credit-score ' + creditClass + '" ondblclick="inlineEditCredit(this,\'' + escapeHtml(item.id) + '\')">' + credit + '</span></div>' +
            '<div class="vt-col vt-col-tags">' + tagsHtml + '</div>' +
            '<div class="vt-col vt-col-actions"><button class="vt-view-btn" onclick="event.stopPropagation();openSlidePanel(\'' + escapeHtml(item.id) + '\',\'' + item.type + '\')">View</button></div>' +
            '</div>';
    }

    function handleItemClick(item, index, e) {
        if (e.target && (e.target.classList.contains('vt-view-btn') || e.target.closest('.vt-view-btn'))) {
            openSlidePanel(item.id, item.type);
        } else if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
            // handled by onclick
        } else {
            openSlidePanel(item.id, item.type);
        }
    }

    function fitBodyHeight() {
        var containerRect = container.getBoundingClientRect();
        var headerEl = container.querySelector('.virtual-table-header');
        var paginationEl = container.querySelector('.virtual-table-pagination');
        var headerH = headerEl ? headerEl.offsetHeight : 40;
        var paginationH = paginationEl ? paginationEl.offsetHeight : 40;
        var available = containerRect.height - headerH - paginationH - 2;
        if (available > 30) {
            body.style.height = available + 'px';
            body.style.maxHeight = available + 'px';
        }
    }

    // Build header
    var headerEl = container.querySelector('.virtual-table-header') || (function () {
        var h = document.createElement('div');
        h.className = 'virtual-table-header';
        container.insertBefore(h, body);
        return h;
    })();
    headerEl.innerHTML =
        '<div class="vt-col vt-col-checkbox"><input type="checkbox" onchange="toggleSelectAll(this.checked)" ' + (_vtSelected.size === data.length && data.length > 0 ? 'checked' : '') + '></div>' +
        renderSortHeader('Name', 'name', 'vt-col-name') +
        renderSortHeader('Type', 'type', 'vt-col-type') +
        renderSortHeader('Threat', 'threatLevel', 'vt-col-threat') +
        renderSortHeader('Credit', 'credit', 'vt-col-credit') +
        '<div class="vt-col vt-col-tags">Tags</div>' +
        '<div class="vt-col vt-col-actions">Actions</div>';

    if (window.PazatorUI && PazatorUI.VirtualList) {
        if (_vtListInstance) _vtListInstance.destroy();
        body.innerHTML = '';
        _vtListInstance = PazatorUI.VirtualList(body, {
            itemHeight: 48,
            overscan: 5,
            renderItem: renderItem,
            onItemClick: handleItemClick
        });
        _vtListInstance.update(sortedData);
    } else {
        var page = 1;
        var pageSize = 30;
        function renderPage() {
            var start = (page - 1) * pageSize;
            var end = Math.min(start + pageSize, sortedData.length);
            var pageData = sortedData.slice(start, end);
            var html = '';
            for (var i = 0; i < pageData.length; i++) {
                html += renderItem(pageData[i], start + i);
            }
            body.innerHTML = html;
            var totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
            pagination.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:8px;font-size:0.85rem;color:#aaa;">' +
                '<button class="vt-page-btn" data-page="prev" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#ccc;padding:4px 14px;border-radius:4px;cursor:pointer;' + (page <= 1 ? 'opacity:0.4;cursor:default;' : '') + '">‹ Prev</button>' +
                '<span>Page ' + page + ' of ' + totalPages + ' (' + sortedData.length + ' total)</span>' +
                '<button class="vt-page-btn" data-page="next" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#ccc;padding:4px 14px;border-radius:4px;cursor:pointer;' + (page >= totalPages ? 'opacity:0.4;cursor:default;' : '') + '">Next ›</button>' +
                '</div>';
            body.querySelectorAll('.vt-row').forEach(function (row) {
                row.addEventListener('click', function (e) {
                    var idx = Array.prototype.indexOf.call(body.children, row) + start;
                    var item = sortedData[idx];
                    if (item) handleItemClick(item, idx, e);
                });
            });
            pagination.querySelectorAll('.vt-page-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    if (btn.dataset.page === 'prev' && page > 1) { page--; renderPage(); }
                    if (btn.dataset.page === 'next' && page < totalPages) { page++; renderPage(); }
                });
            });
        }
        renderPage();
    }

    fitBodyHeight();
    var fitTimer = setTimeout(fitBodyHeight, 100);

    if (webContainer) {
        body._vtCleanup = function () {
            clearTimeout(fitTimer);
            body.style.height = '';
            body.style.maxHeight = '';
            webContainer.style.overflow = 'hidden';
        };
    }

    updateHeaderStats();
}

function toggleSort(field) {
    if (_vtSortField === field) {
        _vtSortDir = _vtSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        _vtSortField = field;
        _vtSortDir = 'asc';
    }
    renderWebNodes();
}

function sortData(data, field, dir) {
    var sorted = [].concat(data);
    sorted.sort(function (a, b) {
        var va = a[field], vb = b[field];
        if (field === 'credit') {
            va = va !== undefined ? va : 185;
            vb = vb !== undefined ? vb : 185;
        }
        if (field === 'threatLevel') {
            var order = { 'high': 3, 'medium': 2, 'low': 1, 'none': 0, 'None': 0 };
            va = order[(va || 'none').toLowerCase()] || 0;
            vb = order[(vb || 'none').toLowerCase()] || 0;
        }
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va < vb) return dir === 'asc' ? -1 : 1;
        if (va > vb) return dir === 'asc' ? 1 : -1;
        return 0;
    });
    return sorted;
}

function toggleBulkSelect(id) {
    if (_vtSelected.has(id)) {
        _vtSelected.delete(id);
    } else {
        _vtSelected.add(id);
    }
    renderWebNodes();
}

function toggleSelectAll(checked) {
    _vtSelected.clear();
    if (checked) {
        _vtData.forEach(function (item) { _vtSelected.add(item.id); });
    }
    renderWebNodes();
}

function renderBulkBar(container) {
    var existing = container.querySelector('.vt-bulk-bar');
    if (existing) existing.remove();
    if (_vtSelected.size === 0) return;
    var bar = document.createElement('div');
    bar.className = 'vt-bulk-bar';
    bar.innerHTML = '<span class="bulk-count">' + _vtSelected.size + ' selected</span>' +
        '<div class="bulk-actions">' +
        '<button class="bulk-action-btn" onclick="bulkAddTag()" title="Add tags to selected entries"><i class="fas fa-tag"></i> Tag</button>' +
        '<button class="bulk-action-btn" onclick="bulkChangeThreat()" title="Change threat level"><i class="fas fa-shield-alt"></i> Threat</button>' +
        '<button class="bulk-action-btn" onclick="bulkAddToCase()" title="Add to case"><i class="fas fa-folder"></i> Case</button>' +
        '<button class="bulk-action-btn" onclick="bulkExportCSV()" title="Export selected as CSV"><i class="fas fa-file-csv"></i> Export</button>' +
        '<button class="bulk-action-btn bulk-action-danger" onclick="bulkDeleteSelected()" title="Delete selected"><i class="fas fa-trash"></i> Delete</button>' +
        '<button class="bulk-action-btn" onclick="bulkClearSelection()" title="Clear selection"><i class="fas fa-times"></i> Clear</button>' +
        '</div>';
    container.insertBefore(bar, container.querySelector('.virtual-table-header'));
}

async function bulkSetCredit(val) {
    const confirmed = await showConfirm(`Set credit to ${val} for ${_vtSelected.size} selected entries?`, 'Bulk Update', 'question');
    if (!confirmed) return;
    _vtSelected.forEach(function (id) {
        var human = pazatorData.humans.find(function (h) { return h.id === id; });
        if (human) { human.credit = val; }
    });
    markDataChanged();
    renderWebNodes();
}

async function bulkSetThreat(level) {
    const confirmed = await showConfirm(`Set threat to "${level}" for ${_vtSelected.size} selected entries?`, 'Bulk Update', 'question');
    if (!confirmed) return;
    _vtSelected.forEach(function (id) {
        var human = pazatorData.humans.find(function (h) { return h.id === id; });
        if (human) { human.threatLevel = level; }
    });
    markDataChanged();
    renderWebNodes();
}

async function bulkDeleteSelected() {
    const count = _vtSelected.size;
    const confirmed = await showConfirm(`Delete ${count} selected entr${count === 1 ? 'y' : 'ies'}? This cannot be undone.`, 'Bulk Delete', 'warning');
    if (!confirmed) return;
    _vtSelected.forEach(function (id) {
        var idx = pazatorData.humans.findIndex(function (h) { return h.id === id; });
        if (idx !== -1) { pazatorData.humans.splice(idx, 1); return; }
        idx = pazatorData.others.findIndex(function (o) { return o.id === id; });
        if (idx !== -1) { pazatorData.others.splice(idx, 1); }
    });
    _vtSelected.clear();
    markDataChanged();
    renderObjectCanvas();
    showFloatingNotification(`Deleted ${count} entr${count === 1 ? 'y' : 'ies'}`, 'info');
}

function bulkClearSelection() {
    _vtSelected.clear();
    renderWebNodes();
}

function bulkAddTag() {
    if (_vtSelected.size === 0) return;
    var existing = document.querySelector('.bulk-tag-popup-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.className = 'bulk-tag-popup-overlay';
    overlay.innerHTML =
        '<div class="bulk-tag-popup">' +
        '<div class="bulk-popup-header">' +
        '<h3><i class="fas fa-tag"></i> Add Tags to ' + _vtSelected.size + ' Selected</h3>' +
        '<button class="bulk-popup-close">&times;</button>' +
        '</div>' +
        '<div class="bulk-popup-body">' +
        '<div class="bulk-tag-input-row">' +
        '<input type="text" class="bulk-tag-input" placeholder="Type a tag name and press Enter..." autofocus>' +
        '<button class="bulk-tag-add-btn">Add</button>' +
        '</div>' +
        '<div class="bulk-tag-suggestions-label">Existing tags</div>' +
        '<div class="bulk-tag-list"></div>' +
        '</div>' +
        '<div class="bulk-popup-footer">' +
        '<span class="bulk-popup-hint">Click a tag or type a new one to add to all selected entries</span>' +
        '</div>' +
        '</div>';
    document.body.appendChild(overlay);

    var list = overlay.querySelector('.bulk-tag-list');
    function renderTagChips() {
        var tagList = (typeof tags !== 'undefined' && tags) ? tags : [];
        list.innerHTML = tagList.map(function (t) {
            return '<button type="button" class="bulk-tag-chip" data-tag="' + escapeHtml(t) + '">' + escapeHtml(t) + '</button>';
        }).join('');
        list.querySelectorAll('.bulk-tag-chip').forEach(function (chip) {
            chip.addEventListener('click', function () {
                applyTagToSelected(this.getAttribute('data-tag'));
            });
        });
    }
    renderTagChips();

    function applyTagToSelected(tagName) {
        if (!tagName || !tagName.trim()) return;
        tagName = tagName.trim();
        if (typeof tags !== 'undefined' && tags && tags.indexOf(tagName) === -1) {
            tags.push(tagName);
        }
        _vtSelected.forEach(function (id) {
            var human = pazatorData.humans.find(function (h) { return h.id === id; });
            if (human) {
                if (!human.tags) human.tags = [];
                if (human.tags.indexOf(tagName) === -1) human.tags.push(tagName);
                return;
            }
            var other = pazatorData.others.find(function (o) { return o.id === id; });
            if (other) {
                if (!other.tags) other.tags = [];
                if (other.tags.indexOf(tagName) === -1) other.tags.push(tagName);
            }
        });
        markDataChanged();
        renderWebNodes();
        showFloatingNotification('Tag "' + tagName + '" added to ' + _vtSelected.size + ' entr' + (_vtSelected.size === 1 ? 'y' : 'ies'), 'success');
        overlay.remove();
    }

    overlay.querySelector('.bulk-tag-input').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            applyTagToSelected(this.value);
        }
    });
    overlay.querySelector('.bulk-tag-add-btn').addEventListener('click', function () {
        applyTagToSelected(overlay.querySelector('.bulk-tag-input').value);
    });
    overlay.querySelector('.bulk-popup-close').addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    setTimeout(function () { overlay.querySelector('.bulk-tag-input').focus(); }, 100);
}

function bulkChangeThreat() {
    if (_vtSelected.size === 0) return;
    var levels = ['None', 'Low', 'Medium', 'High', 'Critical'];
    var levelIcons = { 'None': 'fa-circle', 'Low': 'fa-chevron-circle-down', 'Medium': 'fa-minus-circle', 'High': 'fa-chevron-circle-up', 'Critical': 'fa-exclamation-circle' };
    var levelClasses = { 'None': 'threat-none', 'Low': 'threat-low', 'Medium': 'threat-medium', 'High': 'threat-high', 'Critical': 'threat-critical' };

    var html = '<p style="margin:0 0 12px;color:#aaa;font-size:0.9rem;">Set threat level for <strong>' + _vtSelected.size + '</strong> selected entr' + (_vtSelected.size === 1 ? 'y' : 'ies') + ':</p>' +
        '<div class="bulk-threat-grid">' +
        levels.map(function (l) {
            return '<button class="bulk-threat-btn ' + (levelClasses[l] || '') + '" data-level="' + l + '">' +
                '<i class="fas ' + (levelIcons[l] || 'fa-circle') + '"></i> ' + l +
                '</button>';
        }).join('') +
        '</div>';

    showModal({
        title: 'Change Threat Level',
        html: html,
        type: 'question',
        buttons: [{ text: 'Cancel', primary: false, onClick: function () { } }]
    });

    // Wire up threat buttons after modal renders
    setTimeout(function () {
        var btns = document.querySelectorAll('.bulk-threat-btn');
        btns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var level = this.getAttribute('data-level');
                var count = _vtSelected.size;
                _vtSelected.forEach(function (id) {
                    var human = pazatorData.humans.find(function (h) { return h.id === id; });
                    if (human) { human.threatLevel = level; }
                });
                markDataChanged();
                renderWebNodes();
                hideModal();
                showFloatingNotification('Threat set to "' + level + '" for ' + count + ' entr' + (count === 1 ? 'y' : 'ies'), 'success');
            });
        });
    }, 50);
}

function bulkAddToCase() {
    if (_vtSelected.size === 0) return;
    if (!window.cases || cases.length === 0) {
        showFloatingNotification('No cases exist. Create one first.', 'info');
        return;
    }

    var existing = document.querySelector('.bulk-case-popup-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.className = 'bulk-case-popup-overlay';
    overlay.innerHTML =
        '<div class="bulk-case-popup">' +
        '<div class="bulk-popup-header">' +
        '<h3><i class="fas fa-folder"></i> Add ' + _vtSelected.size + ' Selected to Case</h3>' +
        '<button class="bulk-popup-close">&times;</button>' +
        '</div>' +
        '<div class="bulk-popup-body">' +
        '<div class="bulk-case-list"></div>' +
        '</div>' +
        '<div class="bulk-popup-footer">' +
        '<span class="bulk-popup-hint">Select a case to add all selected entries</span>' +
        '</div>' +
        '</div>';
    document.body.appendChild(overlay);

    var list = overlay.querySelector('.bulk-case-list');
    function renderCaseList() {
        list.innerHTML = cases.map(function (c) {
            var statusIcon = c.status === 'closed' ? 'fa-lock' : c.status === 'in-progress' ? 'fa-spinner' : 'fa-folder-open';
            return '<button type="button" class="bulk-case-item" data-case-id="' + c.id + '">' +
                '<i class="fas ' + statusIcon + '" style="color:' + (c.status === 'closed' ? '#e74c3c' : c.status === 'in-progress' ? '#f39c12' : '#2ecc71') + ';"></i> ' +
                '<span class="bulk-case-title">' + escapeHtml(c.title || 'Untitled') + '</span>' +
                '<span class="bulk-case-count">' + (c.entities ? c.entities.length : 0) + ' entities</span>' +
                '</button>';
        }).join('');
        list.querySelectorAll('.bulk-case-item').forEach(function (item) {
            item.addEventListener('click', function () {
                var caseId = this.getAttribute('data-case-id');
                var caseData = cases.find(function (c) { return c.id === caseId; });
                if (!caseData) return;
                var added = 0;
                _vtSelected.forEach(function (id) {
                    if (caseData.entities.indexOf(id) !== -1) return;
                    caseData.entities.push(id);
                    var entity = pazatorData.humans.find(function (h) { return h.id === id; }) || pazatorData.others.find(function (o) { return o.id === id; });
                    caseData.timeline.push({
                        type: 'entity-added',
                        content: '<strong>Entity added</strong> (bulk): ' + (entity ? entity.name : 'Unknown'),
                        timestamp: Date.now()
                    });
                    // Also set case ref on the entity
                    if (entity) {
                        if (!entity.cases) entity.cases = [];
                        if (entity.cases.indexOf(caseId) === -1) entity.cases.push(caseId);
                    }
                    added++;
                });
                saveCases();
                markDataChanged();
                overlay.remove();
                showFloatingNotification('Added ' + added + ' entr' + (added === 1 ? 'y' : 'ies') + ' to "' + (caseData.title || 'Untitled') + '"', 'success');
            });
        });
    }
    renderCaseList();

    overlay.querySelector('.bulk-popup-close').addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
}

function bulkExportCSV() {
    if (_vtSelected.size === 0) return;
    var items = [];
    _vtSelected.forEach(function (id) {
        var human = pazatorData.humans.find(function (h) { return h.id === id; });
        if (human) { items.push({ item: human, type: 'human' }); return; }
        var other = pazatorData.others.find(function (o) { return o.id === id; });
        if (other) { items.push({ item: other, type: 'other' }); }
    });

    if (items.length === 0) {
        showFloatingNotification('No valid entries selected', 'info');
        return;
    }

    var csvEscape = function (value) {
        var raw = value == null ? '' : String(value);
        if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
            return '"' + raw.replace(/"/g, '""') + '"';
        }
        return raw;
    };

    var joinList = function (value) {
        if (!value) return '';
        if (Array.isArray(value)) return value.filter(Boolean).map(String).join(', ');
        return String(value);
    };

    var headers = ['Name', 'Type', 'Gender', 'Birth Date', 'Marital Status', 'Workplace', 'Nationality', 'Country of Origin', 'Immigration Status', 'Languages', 'Ethnicity', 'Religion', 'Political Views', 'Credit Score', 'Social Class', 'Income Level', 'Education Level', 'Threat Level', 'Notes', 'Tags', 'Friends', 'Family'];

    var rows = [];
    rows.push(headers.map(csvEscape).join(','));

    items.forEach(function (entry) {
        var item = entry.item;
        if (entry.type === 'human') {
            rows.push([
                item.name || '',
                '',
                item.gender || '',
                item.birthDate || '',
                item.maritalStatus || '',
                item.workplace || '',
                item.nationality || '',
                item.countryOfOrigin || '',
                item.immigrationStatus || '',
                item.languages || '',
                item.ethnicity || '',
                item.religion || '',
                item.politicalViews || '',
                item.credit !== undefined ? String(item.credit) : '',
                item.socialClass || '',
                item.incomeLevel || '',
                item.educationLevel || '',
                item.threatLevel || '',
                item.extraNotes || item.notes || '',
                joinList(item.tags),
                joinList(item.friends),
                joinList(item.family)
            ].map(csvEscape).join(','));
        } else {
            rows.push([
                item.name || '',
                item.type || '',
                '',
                item.note || item.notes || '',
                '',
                '',
                ''
            ].map(csvEscape).join(','));
        }
    });

    var pad2 = function (n) { return String(n).padStart(2, '0'); };
    var now = new Date();
    var stamp = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate()) + '_' + pad2(now.getHours()) + '-' + pad2(now.getMinutes()) + '-' + pad2(now.getSeconds());
    var filename = 'pazator-bulk-export-' + stamp + '.csv';

    var csvText = rows.join('\n');
    var blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    showFloatingNotification('Exported ' + items.length + ' entr' + (items.length === 1 ? 'y' : 'ies') + ' to CSV', 'success');
}

function inlineEditCredit(el, id) {
    var current = el.textContent.trim();
    var input = document.createElement('input');
    input.type = 'number';
    input.className = 'vt-inline-edit';
    input.value = current;
    input.addEventListener('blur', function () {
        var val = parseInt(input.value);
        if (!isNaN(val) && val >= 0) {
            var human = pazatorData.humans.find(function (h) { return h.id === id; });
            if (human) { human.credit = val; _pendingChanges(); }
        }
        renderWebNodes();
    });
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') renderWebNodes();
    });
    el.textContent = '';
    el.appendChild(input);
    input.focus();
    input.select();
}

function inlineEditThreat(el, id) {
    var options = ['low', 'medium', 'high', 'critical'];
    var select = document.createElement('select');
    select.className = 'vt-inline-edit';
    select.style.width = 'auto';
    options.forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt;
        o.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
        select.appendChild(o);
    });
    select.addEventListener('change', function () {
        var human = pazatorData.humans.find(function (h) { return h.id === id; });
        if (human) { human.threatLevel = select.value; _pendingChanges(); }
        renderWebNodes();
    });
    select.addEventListener('blur', function () {
        setTimeout(function () {
            if (!select.matches(':focus')) renderWebNodes();
        }, 200);
    });
    el.textContent = '';
    el.appendChild(select);
    select.focus();
}

function renderFilterChips() {
    var container = document.getElementById('filterChipsContainer');
    if (!container) return;
    var chips = [];
    var searchTerm = document.getElementById('searchInput');
    var filterType = document.getElementById('filterType');
    if (searchTerm && searchTerm.value) {
        chips.push({ label: 'Search: "' + searchTerm.value + '"', onRemove: function () { searchTerm.value = ''; renderWebNodes(); } });
    }
    if (filterType && filterType.value !== 'all') {
        chips.push({ label: 'Type: ' + filterType.value, onRemove: function () { filterType.value = 'all'; renderWebNodes(); } });
    }
    if (_vtSortField) {
        chips.push({ label: 'Sort: ' + _vtSortField + ' (' + _vtSortDir + ')', onRemove: function () { _vtSortField = null; renderWebNodes(); } });
    }
    if (chips.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';
    container.innerHTML = chips.map(function (chip, i) {
        return '<span class="filter-chip"><span>' + chip.label + '</span><span class="chip-remove" data-idx="' + i + '">&times;</span></span>';
    }).join('');
    container.querySelectorAll('.chip-remove').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var idx = parseInt(this.dataset.idx);
            if (chips[idx]) chips[idx].onRemove();
        });
    });
}
