(function () {
    var STORAGE_KEY = 'pazator_logbook';
    var _entries = null;

    function _load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            _entries = raw ? JSON.parse(raw) : null;
        } catch (e) { _entries = null; }
        if (!_entries || !Array.isArray(_entries)) _entries = [];
    }

    function _save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_entries)); } catch (e) {}
    }

    function _uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function addEntry(title, body, category) {
        _load();
        _entries.unshift({
            id: _uid(),
            title: title || 'Untitled',
            body: body || '',
            category: category || 'general',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        _save();
        return _entries[0];
    }

    function deleteEntry(id) {
        _load();
        _entries = _entries.filter(function (e) { return e.id !== id; });
        _save();
    }

    function updateEntry(id, updates) {
        _load();
        var entry = _entries.find(function (e) { return e.id === id; });
        if (!entry) return null;
        for (var k in updates) entry[k] = updates[k];
        entry.updatedAt = new Date().toISOString();
        _save();
        return entry;
    }

    var CATEGORIES = [
        { id: 'general',     label: 'General',     color: '#8ab4f8' },
        { id: 'observation', label: 'Observation',  color: '#34d399' },
        { id: 'incident',    label: 'Incident',     color: '#fbbf24' },
        { id: 'intel',       label: 'Intel',        color: '#a855f7' },
        { id: 'comm',        label: 'Communication',color: '#fb923c' },
    ];
    var CAT_MAP = {};
    CATEGORIES.forEach(function (c) { CAT_MAP[c.id] = c; });

    function render(containerId) {
        _load();
        var container = document.getElementById(containerId);
        if (!container) return;

        var html =
            '<div style="display:flex;flex-direction:column;height:100%;">' +
            '  <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border-color);flex-shrink:0;">' +
            '    <span style="font-size:0.9rem;font-weight:600;color:var(--text-primary);"><i class="fas fa-journal-whills" style="margin-right:6px;"></i>Logbook</span>' +
            '    <span style="font-size:0.75rem;color:var(--text-muted);">' + _entries.length + ' entr' + (_entries.length === 1 ? 'y' : 'ies') + '</span>' +
            '    <div style="margin-left:auto;display:flex;gap:6px;">' +
            '      <button id="logbookNewBtn" style="padding:5px 12px;border:none;background:var(--btn-primary-bg);color:#111;border-radius:5px;cursor:pointer;font-size:0.75rem;font-weight:600;"><i class="fas fa-plus"></i> New Entry</button>' +
            '    </div>' +
            '  </div>' +
            '  <div style="flex:1;overflow-y:auto;padding:8px;" id="logbookList">';

        if (!_entries.length) {
            html +=
                '<div style="text-align:center;padding:40px 20px;color:#666;">' +
                '  <i class="fas fa-journal-whills" style="font-size:2rem;margin-bottom:12px;display:block;opacity:0.4;"></i>' +
                '  <p style="margin:0 0 4px 0;font-size:0.9rem;color:#888;">No log entries yet</p>' +
                '  <small style="font-size:0.8rem;color:#555;">Click "New Entry" to start noting what\'s happening</small>' +
                '</div>';
        } else {
            _entries.forEach(function (e) {
                var cat = CAT_MAP[e.category] || CAT_MAP.general;
                var date = new Date(e.createdAt);
                var dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                var clBadge = (window.pazatorClassification && e.classification) ? window.pazatorClassification.getBadgeHTML(e) : '';
                var bodyPreview = (e.body || '').replace(/<[^>]*>/g, '').slice(0, 120);
                html +=
                    '<div class="lb-entry" data-id="' + e.id + '">' +
                    '  <div class="lb-entry-bar" style="background:' + cat.color + ';"></div>' +
                    '  <div class="lb-entry-body">' +
                    '    <div class="lb-entry-title">' + escapeHtml(e.title) + clBadge + '</div>' +
                    '    <div class="lb-entry-meta">' +
                    '      <span class="lb-entry-cat" style="color:' + cat.color + ';">' + cat.label + '</span>' +
                    '      <span>' + dateStr + '</span>' +
                    '    </div>' +
                    (bodyPreview ? '<div class="lb-entry-preview">' + escapeHtml(bodyPreview) + '</div>' : '') +
                    '  </div>' +
                    '  <div class="lb-entry-actions">' +
                    '    <button class="lb-entry-cl" data-id="' + e.id + '" title="Classify"><i class="fas fa-shield-alt"></i></button>' +
                    '    <button class="lb-entry-del" data-id="' + e.id + '" title="Delete"><i class="fas fa-trash"></i></button>' +
                    '  </div>' +
                    '</div>';
            });
        }

        html += '</div></div>';
        container.innerHTML = html;
        _wireEvents();
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _wireEvents() {
        document.getElementById('logbookNewBtn')?.addEventListener('click', function () {
            _showEntryModal(null);
        });

        document.querySelectorAll('.lb-entry').forEach(function (el) {
            el.addEventListener('click', function (e) {
                if (e.target.closest('.lb-entry-del') || e.target.closest('.lb-entry-cl')) return;
                var id = el.dataset.id;
                var entry = _entries.find(function (x) { return x.id === id; });
                if (entry) _showEntryModal(entry);
            });
        });

        document.querySelectorAll('.lb-entry-del').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.stopPropagation();
                if (!confirm('Delete this log entry?')) return;
                deleteEntry(el.dataset.id);
                render('logbookContent');
            });
        });

        document.querySelectorAll('.lb-entry-cl').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.stopPropagation();
                var entry = _entries.find(function (x) { return x.id === el.dataset.id; });
                if (!entry || !window.pazatorClassification) return;
                var username = window.pazatorSync ? window.pazatorSync.getCurrentUser()?.username || 'local' : 'local';
                window.pazatorClassification.showClassifyModal(entry, 'log', function (levelId) {
                    if (levelId === 'unclassified') {
                        delete entry.classification;
                    } else {
                        entry.classification = { level: levelId, classifiedBy: username, classifiedAt: new Date().toISOString() };
                    }
                    _save();
                    render('logbookContent');
                });
            });
        });
    }

    function _showEntryModal(entry) {
        var existing = document.getElementById('lbModal');
        if (existing) existing.remove();

        var isEdit = !!entry;
        var modal = document.createElement('div');
        modal.id = 'lbModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
        modal.innerHTML =
            '<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:10px;width:100%;max-width:540px;box-shadow:0 16px 48px rgba(0,0,0,0.4);">' +
            '  <div style="display:flex;align-items:center;gap:10px;padding:16px 18px 0 18px;">' +
            '    <span style="width:30px;height:30px;border-radius:7px;background:var(--info-bg);display:flex;align-items:center;justify-content:center;"><i class="fas fa-journal-whills" style="font-size:13px;color:var(--info);"></i></span>' +
            '    <span style="flex:1;color:var(--text-primary);font-size:0.95rem;font-weight:600;">' + (isEdit ? 'Edit Log Entry' : 'New Log Entry') + '</span>' +
            '    <span id="lbModalClose" style="width:26px;height:26px;border-radius:5px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-muted);font-size:18px;">&times;</span>' +
            '  </div>' +
            '  <div style="padding:14px 18px 12px 18px;display:flex;flex-direction:column;gap:10px;">' +
            '    <div>' +
            '      <label style="font-size:0.72rem;color:var(--text-muted);display:block;margin-bottom:3px;">Title</label>' +
            '      <input type="text" id="lbTitle" class="form-control" placeholder="What happened?" value="' + escapeHtml(entry ? entry.title : '') + '" style="width:100%;box-sizing:border-box;">' +
            '    </div>' +
            '    <div style="display:flex;gap:8px;">' +
            '      <div style="flex:1;">' +
            '        <label style="font-size:0.72rem;color:var(--text-muted);display:block;margin-bottom:3px;">Category</label>' +
            '        <select id="lbCategory" class="form-control" style="width:100%;box-sizing:border-box;">' +
            CATEGORIES.map(function (c) {
                return '<option value="' + c.id + '" ' + ((entry && entry.category === c.id) ? 'selected' : '') + '>' + c.label + '</option>';
            }).join('') +
            '        </select>' +
            '      </div>' +
            '      <div style="flex-shrink:0;width:60px;display:flex;align-items:flex-end;">' +
            '        <span id="lbCatPreview" style="width:100%;height:32px;border-radius:5px;border:1px solid var(--border-color);background:' + (CAT_MAP[(entry && entry.category) || 'general'] || CAT_MAP.general).color + ';"></span>' +
            '      </div>' +
            '    </div>' +
            '    <div>' +
            '      <label style="font-size:0.72rem;color:var(--text-muted);display:block;margin-bottom:3px;">Notes</label>' +
            '      <textarea id="lbBody" class="form-control" rows="6" placeholder="Describe what happened, observations, context\u2026" style="width:100%;box-sizing:border-box;resize:vertical;">' + escapeHtml(entry ? entry.body : '') + '</textarea>' +
            '    </div>' +
            '  </div>' +
            '  <div style="display:flex;gap:6px;justify-content:flex-end;padding:0 18px 16px 18px;">' +
            '    <button id="lbModalCancel" style="padding:7px 14px;border:1px solid var(--border-color);background:transparent;color:var(--text-secondary);border-radius:5px;cursor:pointer;font-size:0.75rem;"><i class="fas fa-times"></i> Cancel</button>' +
            '    <button id="lbModalSave" style="padding:7px 14px;border:none;background:var(--btn-primary-bg);color:#111;border-radius:5px;cursor:pointer;font-size:0.75rem;font-weight:600;"><i class="fas fa-save"></i> ' + (isEdit ? 'Update' : 'Save') + '</button>' +
            '  </div>' +
            '</div>';

        document.body.appendChild(modal);

        function close() { modal.remove(); }

        document.getElementById('lbModalClose').addEventListener('click', close);
        document.getElementById('lbModalCancel').addEventListener('click', close);
        modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

        document.getElementById('lbCategory')?.addEventListener('change', function () {
            var cat = CAT_MAP[this.value] || CAT_MAP.general;
            var preview = document.getElementById('lbCatPreview');
            if (preview) preview.style.background = cat.color;
        });

        document.getElementById('lbModalSave')?.addEventListener('click', function () {
            var title = document.getElementById('lbTitle').value.trim();
            var body = document.getElementById('lbBody').value.trim();
            var cat = document.getElementById('lbCategory').value;

            if (!title && !body) {
                window.PazatorUI && window.PazatorUI.showFloatingNotification('Enter a title or notes', 'warning', 2000);
                return;
            }

            if (isEdit) {
                updateEntry(entry.id, { title: title || 'Untitled', body: body, category: cat });
            } else {
                addEntry(title || 'Untitled', body, cat);
            }
            close();
            render('logbookContent');
        });
    }

    window.pazatorLogbook = {
        render: render,
        addEntry: addEntry,
        deleteEntry: deleteEntry,
        updateEntry: updateEntry,
        getEntries: function () { _load(); return _entries; }
    };
})();
