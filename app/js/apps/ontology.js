(function () {
    'use strict';

    var _active = false;
    var _selectedType = null;
    var _overlay = null;
    var _container = null;

    function open(containerEl) {
        if (_active) return;
        _active = true;
        _selectedType = null;

        if (containerEl) {
            _container = containerEl;
            _overlay = null;
            containerEl.innerHTML = buildLayout();
        } else {
            _overlay = document.createElement('div');
            _overlay.className = 'onto-designer-overlay';
            _overlay.innerHTML = buildLayout();
            document.body.appendChild(_overlay);
        }

        populateTypeList();
        wireEvents();

        if (_overlay) {
            requestAnimationFrame(function () {
                _overlay.classList.add('open');
            });
        }
    }

    function close() {
        if (!_active) return;
        if (_container) {
            _container.innerHTML = '';
            _container = null;
            _active = false;
            _selectedType = null;
            return;
        }
        if (!_overlay) return;
        _overlay.classList.remove('open');
        _overlay.classList.add('closing');
        setTimeout(function () {
            if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
            _overlay = null;
            _active = false;
            _selectedType = null;
        }, 250);
    }

    function buildLayout() {
        return [
            '<div class="onto-designer">',
            '  <div class="onto-header">',
            '    <h2><i class="fas fa-sitemap"></i> Ontology Designer</h2>',
            '    <div class="onto-header-actions">',
            '      <button class="onto-btn onto-btn-sm" id="ontoImportBtn" title="Import ontology JSON"><i class="fas fa-file-import"></i> Import</button>',
            '      <button class="onto-btn onto-btn-sm" id="ontoExportBtn" title="Export ontology as JSON"><i class="fas fa-file-export"></i> Export</button>',
            '      <button class="onto-close-btn" id="ontoCloseBtn" title="Close"><i class="fas fa-times"></i></button>',
            '    </div>',
            '  </div>',
            '  <div class="onto-body">',
            '    <div class="onto-sidebar">',
            '      <div class="onto-sidebar-header">',
            '        <span class="onto-sidebar-title">Object Types</span>',
            '        <button class="onto-btn onto-btn-sm onto-btn-add-type" id="ontoAddTypeBtn"><i class="fas fa-plus"></i></button>',
            '      </div>',
            '      <div class="onto-type-list" id="ontoTypeList"></div>',
            '    </div>',
            '    <div class="onto-main" id="ontoMain">',
            '      <div class="onto-empty-state" id="ontoEmptyState">',
            '        <i class="fas fa-arrow-left"></i>',
            '        <p>Select an object type to edit its values</p>',
            '      </div>',
            '      <div class="onto-editor" id="ontoEditor" style="display:none">',
            '        <div class="onto-editor-header">',
            '          <div class="onto-editor-title-row">',
            '            <span class="onto-editor-icon" id="ontoEditorIcon"><i class="fas fa-tag"></i></span>',
            '            <input class="onto-editor-type-name" id="ontoEditorTypeName" spellcheck="false">',
            '            <span class="onto-badge" id="ontoEditorValueCount">0 values</span>',
            '          </div>',
            '          <div class="onto-editor-config">',
            '            <label class="onto-config-item">',
            '              <span>Color</span>',
            '              <input type="color" id="ontoColorPicker" class="onto-color-picker">',
            '            </label>',
            '            <label class="onto-config-item">',
            '              <span>Icon</span>',
            '              <select id="ontoIconSelect" class="onto-icon-select"></select>',
            '            </label>',
            '            <label class="onto-config-item onto-config-item-check">',
            '              <input type="checkbox" id="ontoTypeCheck">',
            '              <span>Use in forms</span>',
            '            </label>',
            '            <button class="onto-btn onto-btn-sm onto-btn-danger" id="ontoDeleteTypeBtn" title="Delete this type and all its values"><i class="fas fa-trash"></i> Delete Type</button>',
            '          </div>',
            '        </div>',
            '        <div class="onto-editor-values">',
            '          <div class="onto-values-toolbar">',
            '            <div class="onto-bulk-add">',
            '              <textarea class="onto-bulk-textarea" id="ontoBulkTextarea" placeholder="Bulk add values, one per line..." rows="2"></textarea>',
            '              <button class="onto-btn onto-btn-sm" id="ontoBulkAddBtn"><i class="fas fa-plus"></i> Add</button>',
            '            </div>',
            '            <span class="onto-values-hint"><i class="fas fa-grip-lines"></i> Drag to reorder</span>',
            '          </div>',
            '          <div class="onto-values-list" id="ontoValuesList"></div>',
            '        </div>',
            '        <div class="onto-editor-preview">',
            '          <div class="onto-preview-label">Preview</div>',
            '          <div class="onto-preview-body" id="ontoPreviewBody"></div>',
            '        </div>',
            '      </div>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join('\n');
    }

    /* --- FA icon list for the select --- */
    var FA_ICONS = [
        'fa-tag', 'fa-database', 'fa-venus-mars', 'fa-heart', 'fa-flag', 'fa-globe',
        'fa-passport', 'fa-language', 'fa-users', 'fa-pray', 'fa-landmark', 'fa-shield-alt',
        'fa-layer-group', 'fa-coins', 'fa-graduation-cap', 'fa-briefcase', 'fa-fingerprint',
        'fa-mask', 'fa-user-secret', 'fa-eye', 'fa-crosshairs', 'fa-bomb', 'fa-skull',
        'fa-radiation', 'fa-biohazard', 'fa-code-branch', 'fa-project-diagram', 'fa-cubes',
        'fa-cube', 'fa-boxes', 'fa-sitemap', 'fa-tree', 'fa-leaf', 'fa-seedling',
        'fa-dragon', 'fa-crown', 'fa-star', 'fa-gem', 'fa-fire', 'fa-water', 'fa-bolt',
        'fa-moon', 'fa-sun', 'fa-comment', 'fa-comments', 'fa-phone', 'fa-envelope',
        'fa-map-marker-alt', 'fa-road', 'fa-train', 'fa-plane', 'fa-car', 'fa-ship',
        'fa-building', 'fa-home', 'fa-hospital', 'fa-university', 'fa-church', 'fa-mosque'
    ];

    /* --- Type list --- */

    function populateTypeList() {
        var container = document.getElementById('ontoTypeList');
        if (!container) return;
        var types = window.pazatorObjects.getTypes();
        container.innerHTML = types.map(function (t) {
            var cfg = window.pazatorObjects.getTypeConfig(t);
            var color = cfg ? cfg.color : '#888';
            var icon = cfg ? cfg.icon : 'fa-tag';
            var label = cfg ? cfg.label : t;
            var count = (window.pazatorObjects.getAll(t) || []).length;
            var sel = t === _selectedType ? ' onto-type-item-selected' : '';
            return '<div class="onto-type-item' + sel + '" data-type="' + t + '">' +
                '<span class="onto-type-dot" style="background:' + color + '"></span>' +
                '<i class="fas ' + icon + ' onto-type-icon"></i>' +
                '<span class="onto-type-label">' + esc(label) + '</span>' +
                '<span class="onto-type-count">' + count + '</span>' +
                '<button class="onto-type-rename" title="Rename type"><i class="fas fa-pen"></i></button>' +
                '</div>';
        }).join('');
    }

    /* --- Editor --- */

    function selectType(type) {
        _selectedType = type;
        var types = document.querySelectorAll('.onto-type-item');
        types.forEach(function (el) { el.classList.remove('onto-type-item-selected'); });
        var sel = document.querySelector('.onto-type-item[data-type="' + type + '"]');
        if (sel) sel.classList.add('onto-type-item-selected');
        showEditor(type);
    }

    function showEditor(type) {
        var empty = document.getElementById('ontoEmptyState');
        var editor = document.getElementById('ontoEditor');
        if (!editor || !empty) return;
        var cfg = window.pazatorObjects.getTypeConfig(type);
        if (!cfg) { editor.style.display = 'none'; empty.style.display = ''; return; }
        empty.style.display = 'none';
        editor.style.display = 'flex';

        document.getElementById('ontoEditorTypeName').value = cfg.label || type;
        document.getElementById('ontoColorPicker').value = cfg.color || '#888';
        document.getElementById('ontoEditorIcon').innerHTML = '<i class="fas ' + (cfg.icon || 'fa-tag') + '"></i>';

        populateIconSelect(cfg.icon || 'fa-tag');
        populateValuesList(type);

        var count = (window.pazatorObjects.getAll(type) || []).length;
        document.getElementById('ontoEditorValueCount').textContent = count + ' value' + (count !== 1 ? 's' : '');

        updatePreview(type);
    }

    function populateIconSelect(selected) {
        var sel = document.getElementById('ontoIconSelect');
        if (!sel) return;
        sel.innerHTML = FA_ICONS.map(function (ic) {
            var s = ic === selected ? ' selected' : '';
            var label = ic.replace('fa-', '').replace(/-/g, ' ');
            return '<option value="' + ic + '"' + s + '>' + label + '</option>';
        }).join('');
    }

    function populateValuesList(type) {
        var container = document.getElementById('ontoValuesList');
        if (!container) return;
        var values = window.pazatorObjects.getAll(type);
        if (values.length === 0) {
            container.innerHTML = '<div class="onto-empty-values">No values yet. Add some above.</div>';
            return;
        }
        container.innerHTML = values.map(function (v) {
            var children = window.pazatorObjects.getChildren(v.id);
            var childHtml = '';
            if (children.length > 0) {
                childHtml = '<div class="onto-child-list">' +
                    children.map(function (c) {
                        return '<div class="onto-value-item onto-value-child" data-id="' + c.id + '">' +
                            '<i class="fas fa-level-up-alt onto-child-arrow"></i>' +
                            '<span class="onto-value-name">' + esc(c.name) + '</span>' +
                            '<span class="onto-value-usage">' + (c.usageCount || 0) + 'x</span>' +
                            '<button class="onto-value-remove" title="Remove"><i class="fas fa-times"></i></button>' +
                            '</div>';
                    }).join('') + '</div>';
            }
            return '<div class="onto-value-item" draggable="true" data-id="' + v.id + '" data-parent="' + (v.parentId || '') + '">' +
                '<i class="fas fa-grip-lines onto-value-drag"></i>' +
                '<span class="onto-value-name" contenteditable="false">' + esc(v.name) + '</span>' +
                '<span class="onto-value-usage">' + (v.usageCount || 0) + 'x</span>' +
                '<button class="onto-value-edit" title="Rename"><i class="fas fa-pen"></i></button>' +
                '<button class="onto-value-set-parent" title="Set as child of..."><i class="fas fa-indent"></i></button>' +
                '<button class="onto-value-remove" title="Remove"><i class="fas fa-times"></i></button>' +
                childHtml +
                '</div>';
        }).join('');
        makeValuesSortable();
    }

    /* --- Drag & drop reorder --- */

    function makeValuesSortable() {
        var list = document.getElementById('ontoValuesList');
        if (!list) return;
        var items = list.querySelectorAll('.onto-value-item[draggable]');
        items.forEach(function (item) {
            item.removeEventListener('dragstart', onDragStart);
            item.removeEventListener('dragend', onDragEnd);
            item.removeEventListener('dragover', onDragOver);
            item.removeEventListener('dragenter', onDragEnter);
            item.removeEventListener('dragleave', onDragLeave);
            item.removeEventListener('drop', onDrop);
            item.addEventListener('dragstart', onDragStart);
            item.addEventListener('dragend', onDragEnd);
            item.addEventListener('dragover', onDragOver);
            item.addEventListener('dragenter', onDragEnter);
            item.addEventListener('dragleave', onDragLeave);
            item.addEventListener('drop', onDrop);
        });
    }

    var _dragEl = null;

    function onDragStart(e) {
        _dragEl = this;
        this.classList.add('onto-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dataset.id);
    }

    function onDragEnd() {
        this.classList.remove('onto-dragging');
        document.querySelectorAll('.onto-drop-target').forEach(function (el) {
            el.classList.remove('onto-drop-target');
        });
        _dragEl = null;
    }

    function onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    function onDragEnter(e) {
        e.preventDefault();
        if (this !== _dragEl) this.classList.add('onto-drop-target');
    }

    function onDragLeave() {
        this.classList.remove('onto-drop-target');
    }

    function onDrop(e) {
        e.preventDefault();
        this.classList.remove('onto-drop-target');
        if (!_dragEl || this === _dragEl) return;
        var list = document.getElementById('ontoValuesList');
        var items = Array.from(list.querySelectorAll('.onto-value-item[draggable]'));
        var fromIdx = items.indexOf(_dragEl);
        var toIdx = items.indexOf(this);
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
        var type = _selectedType;
        if (!type) return;
        var ids = items.map(function (el) { return el.dataset.id; });
        ids.splice(fromIdx, 1);
        ids.splice(toIdx, 0, _dragEl.dataset.id);
        window.pazatorObjects.reorderValues(type, ids);
        populateValuesList(type);
    }

    /* --- Preview --- */

    function updatePreview(type) {
        var preview = document.getElementById('ontoPreviewBody');
        if (!preview) return;
        var cfg = window.pazatorObjects.getTypeConfig(type);
        var color = cfg ? cfg.color : '#888';
        var icon = cfg ? cfg.icon : 'fa-tag';
        var label = cfg ? cfg.label : type;
        var values = window.pazatorObjects.getAll(type);

        preview.innerHTML = [
            '<div class="onto-preview-section">',
            '  <div class="onto-preview-section-title">Form field</div>',
            '  <div class="onto-preview-form-field">',
            '    <label class="onto-preview-form-label" style="color:' + color + '">',
            '      <i class="fas ' + icon + '"></i> ' + esc(label),
            '    </label>',
            '    <div class="onto-preview-form-control" style="border-color:' + color + '40">',
            '      <span style="color:' + color + '">' + (values.length > 0 ? esc(values[0].name) : '—') + '</span>',
            '      <i class="fas fa-chevron-down" style="color:' + color + ';font-size:10px"></i>',
            '    </div>',
            '  </div>',
            '</div>',
            '<div class="onto-preview-section">',
            '  <div class="onto-preview-section-title">Detail panel chip</div>',
            '  <div class="onto-preview-chip-row">',
            values.slice(0, 6).map(function (v) {
                return '<span class="onto-preview-chip" style="background:' + color + '20;border-color:' + color + '40;color:' + color + '">' + esc(v.name) + '</span>';
            }).join(''),
            values.length > 6 ? '<span class="onto-preview-more">+' + (values.length - 6) + '</span>' : '',
            '  </div>',
            '</div>',
            '<div class="onto-preview-section">',
            '  <div class="onto-preview-section-title">Object tile</div>',
            '  <div class="onto-preview-tile" style="border-color:' + color + '30">',
            '    <div class="onto-preview-tile-icon" style="background:' + color + '20;color:' + color + '"><i class="fas ' + icon + '"></i></div>',
            '    <div class="onto-preview-tile-label" style="color:' + color + '">' + esc(label) + '</div>',
            '    <div class="onto-preview-tile-count">' + values.length + ' values</div>',
            '  </div>',
            '</div>'
        ].join('\n');
    }

    /* --- Event wiring --- */

    function wireEvents() {
        var overlay = _overlay;
        var inTab = !!_container;

        if (overlay) {
            /* Close on backdrop click (overlay mode only) */
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) close();
            });

            /* Escape (overlay mode only) */
            function onKey(e) {
                if (e.key === 'Escape') close();
            }
            document.addEventListener('keydown', onKey);
            var cleanup = function () {
                document.removeEventListener('keydown', onKey);
            };
            overlay._cleanup = cleanup;
        }

        /* Close button hides in tab mode (rendered via CSS) */
        document.getElementById('ontoCloseBtn').addEventListener('click', close);

        /* Type list clicks (delegated) */
        var typeList = document.getElementById('ontoTypeList');
        typeList.addEventListener('click', function (e) {
            var item = e.target.closest('.onto-type-item');
            if (item) selectType(item.dataset.type);

            var renameBtn = e.target.closest('.onto-type-rename');
            if (renameBtn) {
                e.stopPropagation();
                var parent = renameBtn.closest('.onto-type-item');
                if (parent) promptRenameType(parent.dataset.type);
            }
        });

        /* Add type */
        document.getElementById('ontoAddTypeBtn').addEventListener('click', promptAddType);

        /* Editor type name edit */
        var nameInput = document.getElementById('ontoEditorTypeName');
        nameInput.addEventListener('change', function () {
            var newLabel = this.value.trim();
            if (!newLabel || !_selectedType) return;
            window.pazatorObjects.setTypeConfig(_selectedType, { label: newLabel });
            populateTypeList();
            updatePreview(_selectedType);
        });

        /* Color picker */
        document.getElementById('ontoColorPicker').addEventListener('input', function () {
            if (!_selectedType) return;
            window.pazatorObjects.setTypeConfig(_selectedType, { color: this.value });
            populateTypeList();
            updatePreview(_selectedType);
        });

        /* Icon select */
        document.getElementById('ontoIconSelect').addEventListener('change', function () {
            if (!_selectedType) return;
            window.pazatorObjects.setTypeConfig(_selectedType, { icon: this.value });
            document.getElementById('ontoEditorIcon').innerHTML = '<i class="fas ' + this.value + '"></i>';
            populateTypeList();
            updatePreview(_selectedType);
        });

        /* Delete type */
        document.getElementById('ontoDeleteTypeBtn').addEventListener('click', function () {
            if (!_selectedType) return;
            promptDeleteType(_selectedType);
        });

        /* Bulk add */
        document.getElementById('ontoBulkAddBtn').addEventListener('click', function () {
            if (!_selectedType) return;
            var ta = document.getElementById('ontoBulkTextarea');
            var names = (ta.value || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
            if (names.length === 0) return;
            var created = window.pazatorObjects.bulkCreate(_selectedType, names);
            ta.value = '';
            populateValuesList(_selectedType);
            updatePreview(_selectedType);
            var countSpan = document.getElementById('ontoEditorValueCount');
            var total = (window.pazatorObjects.getAll(_selectedType) || []).length;
            countSpan.textContent = total + ' value' + (total !== 1 ? 's' : '');
            if (created.length > 0) {
                showToast('Added ' + created.length + ' value' + (created.length !== 1 ? 's' : ''));
            }
        });

        /* Values list actions (delegated) */
        var valuesList = document.getElementById('ontoValuesList');
        valuesList.addEventListener('click', function (e) {
            var item = e.target.closest('.onto-value-item');
            if (!item || !_selectedType) return;

            /* Remove */
            if (e.target.closest('.onto-value-remove')) {
                e.stopPropagation();
                var id = item.dataset.id;
                window.pazatorObjects.remove(id);
                populateValuesList(_selectedType);
                updatePreview(_selectedType);
                var total = (window.pazatorObjects.getAll(_selectedType) || []).length;
                document.getElementById('ontoEditorValueCount').textContent = total + ' value' + (total !== 1 ? 's' : '');
                return;
            }

            /* Rename (inline edit) */
            if (e.target.closest('.onto-value-edit')) {
                e.stopPropagation();
                inlineEditValue(item);
                return;
            }

            /* Set parent */
            if (e.target.closest('.onto-value-set-parent')) {
                e.stopPropagation();
                promptSetParent(item.dataset.id);
                return;
            }
        });

        /* Import */
        document.getElementById('ontoImportBtn').addEventListener('click', promptImport);

        /* Export */
        document.getElementById('ontoExportBtn').addEventListener('click', function () {
            var json = window.pazatorObjects.exportJSON();
            var blob = new Blob([json], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'ontology_' + Date.now() + '.json';
            a.click();
            URL.revokeObjectURL(url);
            showToast('Ontology exported');
        });
    }

    /* --- Inline edit value --- */

    function inlineEditValue(item) {
        var nameSpan = item.querySelector('.onto-value-name');
        if (!nameSpan) return;
        var orig = nameSpan.textContent;
        nameSpan.contentEditable = true;
        nameSpan.focus();

        /* select all text */
        var range = document.createRange();
        range.selectNodeContents(nameSpan);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        function finish() {
            nameSpan.contentEditable = false;
            var newName = nameSpan.textContent.trim();
            if (newName && newName !== orig) {
                var ok = window.pazatorObjects.renameValue(item.dataset.id, newName);
                if (!ok) {
                    nameSpan.textContent = orig;
                    showToast('Rename failed — duplicate or invalid name', true);
                } else {
                    showToast('Renamed to "' + newName + '"');
                }
            } else {
                nameSpan.textContent = orig;
            }
        }

        function onBlur() {
            finish();
            nameSpan.removeEventListener('blur', onBlur);
            nameSpan.removeEventListener('keydown', onKey);
        }

        function onKey(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                nameSpan.blur();
            }
            if (e.key === 'Escape') {
                nameSpan.textContent = orig;
                nameSpan.blur();
            }
        }

        nameSpan.addEventListener('blur', onBlur);
        nameSpan.addEventListener('keydown', onKey);
    }

    /* --- Prompts --- */

    function promptAddType() {
        var key = prompt('Enter type key (e.g. "hairColor"):');
        if (!key || !key.trim()) return;
        key = key.trim().replace(/[^a-zA-Z0-9]/g, '');
        if (!key) { showToast('Invalid type key', true); return; }
        if (window.pazatorObjects.createType(key)) {
            populateTypeList();
            selectType(key);
            showToast('Created type "' + key + '"');
        } else {
            showToast('Type "' + key + '" already exists', true);
        }
    }

    function promptRenameType(oldKey) {
        var cfg = window.pazatorObjects.getTypeConfig(oldKey);
        var current = cfg ? cfg.label : oldKey;
        var newName = prompt('Rename "' + current + '" to:', current);
        if (!newName || newName.trim() === current) return;
        newName = newName.trim().replace(/[^a-zA-Z0-9 ]/g, '');
        if (!newName) { showToast('Invalid name', true); return; }
        var newKey = newName.replace(/\s+/g, '');
        if (newKey === oldKey) {
            window.pazatorObjects.setTypeConfig(oldKey, { label: newName });
        } else {
            if (!window.pazatorObjects.renameType(oldKey, newKey)) {
                showToast('Rename failed — key "' + newKey + '" already exists', true);
                return;
            }
        }
        if (_selectedType === oldKey) _selectedType = newKey || oldKey;
        populateTypeList();
        if (_selectedType) selectType(_selectedType);
        showToast('Type renamed');
    }

    function promptDeleteType(type) {
        if (!window.confirm('Delete type "' + (window.pazatorObjects.getTypeLabel(type) || type) + '" and all its values? This cannot be undone.')) return;
        window.pazatorObjects.deleteType(type);
        _selectedType = null;
        populateTypeList();
        document.getElementById('ontoEditor').style.display = 'none';
        document.getElementById('ontoEmptyState').style.display = '';
        showToast('Type deleted');
    }

    function promptSetParent(childId) {
        var child = window.pazatorObjects.getById(childId);
        if (!child) return;
        var type = child.type;
        var values = window.pazatorObjects.getAll(type);
        var options = values.filter(function (v) { return v.id !== childId; });
        var msg = 'Set parent for "' + child.name + '":\n';
        options.forEach(function (v, i) {
            msg += '\n' + (i + 1) + '. ' + v.name + (v.parentId ? ' (has parent)' : '');
        });
        msg += '\n\nEnter number, or leave empty for no parent:';
        var answer = prompt(msg);
        if (answer === null || answer === '') {
            window.pazatorObjects.setParent(childId, null);
            showToast('Parent removed');
            populateValuesList(type);
            return;
        }
        var idx = parseInt(answer, 10) - 1;
        if (idx >= 0 && idx < options.length) {
            window.pazatorObjects.setParent(childId, options[idx].id);
            showToast('Parent set to "' + options[idx].name + '"');
            populateValuesList(type);
        } else {
            showToast('Invalid selection', true);
        }
    }

    function promptImport() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.addEventListener('change', function () {
            var file = input.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (e) {
                var result = window.pazatorObjects.importJSON(e.target.result);
                if (result.success) {
                    _selectedType = null;
                    populateTypeList();
                    document.getElementById('ontoEditor').style.display = 'none';
                    document.getElementById('ontoEmptyState').style.display = '';
                    showToast('Imported ' + result.count + ' type(s)');
                } else {
                    showToast('Import failed: ' + (result.error || 'unknown error'), true);
                }
            };
            reader.readAsText(file);
        });
        input.click();
    }

    /* --- Toast --- */

    function showToast(msg, isError) {
        var existing = document.querySelector('.onto-toast');
        if (existing) existing.remove();
        var el = document.createElement('div');
        el.className = 'onto-toast' + (isError ? ' onto-toast-error' : '');
        el.textContent = msg;
        document.body.appendChild(el);
        requestAnimationFrame(function () {
            el.classList.add('onto-toast-show');
        });
        setTimeout(function () {
            el.classList.remove('onto-toast-show');
            setTimeout(function () { if (el.parentNode) el.remove(); }, 300);
        }, 2500);
    }

    /* --- Helpers --- */

    function esc(str) {
        if (!str) return '';
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    /* --- Public API --- */

    window.pazatorOntologyDesigner = {
        open: open,
        close: close,
        openInTab: function () {
            var container = document.getElementById('ontologyTabContainer');
            if (!container) return;
            // Force close any existing instance first
            if (_active) {
                if (_container) {
                    _container.innerHTML = '';
                    _container = null;
                } else if (_overlay) {
                    close();
                }
                _active = false;
                _selectedType = null;
            }
            open(container);
        }
    };

})();
