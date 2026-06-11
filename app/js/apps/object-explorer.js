(function () {
    'use strict';

    var _active = false;
    var _overlay = null;
    var _currentId = null;
    var _currentType = null;
    var _currentData = null;

    function getObjectType(obj) {
        if (!obj) return 'Unknown';
        if (obj.objectType) return obj.objectType;
        if (window.pazatorStore) return window.pazatorStore.getObjectType(obj);
        if (pazatorData && pazatorData.humans.indexOf(obj) !== -1) return 'Person';
        if (pazatorData && pazatorData.others.indexOf(obj) !== -1) return 'Organization';
        return 'Other';
    }

    function getTypeIcon(type) {
        var icons = {
            Person: 'fa-user',
            Organization: 'fa-building',
            Vehicle: 'fa-car',
            Location: 'fa-map-marker-alt',
            Event: 'fa-calendar',
            Communication: 'fa-comment',
            Financial: 'fa-coins',
            Document: 'fa-file-alt',
            Unknown: 'fa-question-circle'
        };
        return icons[type] || 'fa-cube';
    }

    function getTypeColor(type) {
        var colors = {
            Person: '#4d9de0',
            Organization: '#ff6b6b',
            Vehicle: '#20c997',
            Location: '#ffa94d',
            Event: '#e599f7',
            Communication: '#00cec9',
            Financial: '#ffd43b',
            Document: '#748ffc',
            Unknown: '#868e96'
        };
        return colors[type] || '#868e96';
    }

    function getThreatColor(level) {
        var colors = { None: '#868e96', Low: '#51cf66', Medium: '#ffd43b', High: '#ff922b', Critical: '#ff6b6b' };
        return colors[level] || '#868e96';
    }

    function open(id) {
        if (_active) {
            close();
            return;
        }

        var obj = null;
        if (window.pazatorStore) {
            obj = window.pazatorStore.getObjectById(id);
        }
        if (!obj) {
            obj = pazatorData.humans.find(function (h) { return h.id === id; }) ||
                  pazatorData.others.find(function (o) { return o.id === id; });
        }
        if (!obj) {
            if (window.showToast) window.showToast('Object not found: ' + id, 'error');
            return;
        }

        _currentId = id;
        _currentData = obj;
        _currentType = getObjectType(obj);
        _active = true;

        _overlay = document.createElement('div');
        _overlay.className = 'obj-explorer-overlay';
        _overlay.innerHTML = buildLayout(obj);
        document.body.appendChild(_overlay);

        requestAnimationFrame(function () {
            _overlay.classList.add('open');
        });

        populateSections(obj);
        wireEvents(obj);
    }

    function close() {
        if (!_active || !_overlay) return;
        _overlay.classList.remove('open');
        _overlay.classList.add('closing');
        setTimeout(function () {
            if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
            _overlay = null;
            _active = false;
            _currentId = null;
            _currentType = null;
            _currentData = null;
        }, 250);
    }

    function buildLayout(obj) {
        var type = _currentType;
        var icon = getTypeIcon(type);
        var color = getTypeColor(type);
        var threat = obj.threatLevel || 'None';
        var threatColor = getThreatColor(threat);
        var credit = obj.credit !== undefined ? Math.round(obj.credit) : null;

        return [
            '<div class="obj-explorer">',
            '  <div class="obj-explorer-header" style="border-bottom-color:' + color + '40">',
            '    <button class="obj-explorer-back" id="objExplorerBack" title="Close"><i class="fas fa-arrow-left"></i></button>',
            '    <div class="obj-explorer-header-icon" style="background:' + color + '20;color:' + color + '"><i class="fas ' + icon + '"></i></div>',
            '    <div class="obj-explorer-header-info">',
            '      <div class="obj-explorer-header-name" id="objExplorerName">' + esc(obj.name || 'Unnamed') + '</div>',
            '      <div class="obj-explorer-header-meta">',
            '        <span class="obj-explorer-type-badge" style="background:' + color + '20;color:' + color + ';border-color:' + color + '40"><i class="fas ' + icon + '"></i> ' + type + '</span>',
            '        <span class="obj-explorer-id">ID: ' + esc(obj.id || '—') + '</span>',
            threat !== 'None' ? '<span class="obj-explorer-threat-badge" style="background:' + threatColor + '20;color:' + threatColor + ';border-color:' + threatColor + '40"><i class="fas fa-shield-alt"></i> ' + threat + '</span>' : '',
            '      </div>',
            '    </div>',
            '    <div class="obj-explorer-header-stats">',
            credit !== null ? '<div class="obj-explorer-stat"><span class="obj-explorer-stat-value">' + credit + '</span><span class="obj-explorer-stat-label">Credit</span></div>' : '',
            '      <div class="obj-explorer-stat"><span class="obj-explorer-stat-value" id="objExplorerRelCount">0</span><span class="obj-explorer-stat-label">Relations</span></div>',
            '      <div class="obj-explorer-stat"><span class="obj-explorer-stat-value" id="objExplorerCaseCount">0</span><span class="obj-explorer-stat-label">Cases</span></div>',
            '    </div>',
            '    <div class="obj-explorer-header-actions">',
            '      <button class="obj-explorer-action-btn" id="objExplorerEdit" title="Edit"><i class="fas fa-pen"></i></button>',
            '      <button class="obj-explorer-action-btn" id="objExplorerGraph" title="Show in graph"><i class="fas fa-project-diagram"></i></button>',
            '      <button class="obj-explorer-action-btn" id="objExplorerClose" title="Close"><i class="fas fa-times"></i></button>',
            '    </div>',
            '  </div>',
            '  <div class="obj-explorer-body">',
            '    <div class="obj-explorer-column obj-explorer-col-left" id="objExplorerColLeft">',
            '      <div class="obj-explorer-panel" id="objExplorerPropertiesPanel">',
            '        <div class="obj-explorer-panel-header"><i class="fas fa-info-circle"></i> Properties</div>',
            '        <div class="obj-explorer-panel-body" id="objExplorerProperties"></div>',
            '      </div>',
            '      <div class="obj-explorer-panel" id="objExplorerNotesPanel">',
            '        <div class="obj-explorer-panel-header"><i class="fas fa-sticky-note"></i> Notes</div>',
            '        <div class="obj-explorer-panel-body" id="objExplorerNotes"></div>',
            '      </div>',
            '      <div class="obj-explorer-panel" id="objExplorerObjectsPanel">',
            '        <div class="obj-explorer-panel-header"><i class="fas fa-cubes"></i> Ontology Objects</div>',
            '        <div class="obj-explorer-panel-body" id="objExplorerObjects"></div>',
            '      </div>',
            '    </div>',
            '    <div class="obj-explorer-column obj-explorer-col-center" id="objExplorerColCenter">',
            '      <div class="obj-explorer-panel obj-explorer-panel-timeline" id="objExplorerTimelinePanel">',
            '        <div class="obj-explorer-panel-header"><i class="fas fa-stream"></i> Timeline <span class="obj-explorer-timeline-count" id="objExplorerTimelineCount"></span></div>',
            '        <div class="obj-explorer-panel-body" id="objExplorerTimeline"></div>',
            '      </div>',
            '    </div>',
            '    <div class="obj-explorer-column obj-explorer-col-right" id="objExplorerColRight">',
            '      <div class="obj-explorer-panel" id="objExplorerRelationshipsPanel">',
            '        <div class="obj-explorer-panel-header"><i class="fas fa-project-diagram"></i> Relationships</div>',
            '        <div class="obj-explorer-panel-body" id="objExplorerRelationships"></div>',
            '      </div>',
            '      <div class="obj-explorer-panel" id="objExplorerCasesPanel">',
            '        <div class="obj-explorer-panel-header"><i class="fas fa-folder"></i> Linked Cases</div>',
            '        <div class="obj-explorer-panel-body" id="objExplorerCases"></div>',
            '      </div>',
            '      <div class="obj-explorer-panel" id="objExplorerChatsPanel">',
            '        <div class="obj-explorer-panel-header"><i class="fas fa-comment"></i> Chats</div>',
            '        <div class="obj-explorer-panel-body" id="objExplorerChats"></div>',
            '      </div>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join('\n');
    }

    function populateSections(obj) {
        populateProperties(obj);
        populateNotes(obj);
        populateRelationships(obj);
        populateCases(obj);
        populateChats(obj);
        populateObjects(obj);
        populateTimeline(obj);
    }

    function populateProperties(obj) {
        var container = document.getElementById('objExplorerProperties');
        if (!container) return;

        var type = _currentType;
        var props = [];
        var skipKeys = { id: 1, name: 1, objectType: 1, friends: 1, family: 1, tags: 1, chats: 1, cases: 1, imagePreview: 1, extraNotes: 1, notes: 1, note: 1, trackerAlias: 1, trackerLinkedAt: 1 };

        if (type === 'Person') {
            var fieldOrder = ['gender', 'birthDate', 'age', 'maritalStatus', 'nationality', 'countryOfOrigin', 'immigrationStatus', 'languages', 'ethnicity', 'religion', 'politicalViews', 'threatLevel', 'socialClass', 'incomeLevel', 'educationLevel', 'workplace', 'occupation', 'credit'];
            fieldOrder.forEach(function (f) {
                var val = obj[f];
                if (val === undefined || val === null || val === '') return;
                var label = f.replace(/([A-Z])/g, ' $1').replace(/^./, function (s) { return s.toUpperCase(); });
                props.push({ label: label, value: formatValue(val), key: f });
            });
            if (obj.tags && obj.tags.length > 0) {
                props.push({ label: 'Tags', value: obj.tags.map(function (t) { return '<span class="obj-explorer-tag">' + esc(t) + '</span>'; }).join(' '), key: 'tags' });
            }
        } else {
            for (var key in obj) {
                if (obj.hasOwnProperty(key) && !skipKeys[key]) {
                    var val = obj[key];
                    if (val === undefined || val === null || val === '') continue;
                    var label = key.replace(/([A-Z])/g, ' $1').replace(/^./, function (s) { return s.toUpperCase(); });
                    props.push({ label: label, value: formatValue(val), key: key });
                }
            }
        }

        if (props.length === 0) {
            container.innerHTML = '<div class="obj-explorer-empty">No properties</div>';
            return;
        }

        var html = '<div class="obj-explorer-prop-grid">';
        props.forEach(function (p) {
            html += '<div class="obj-explorer-prop">' +
                '<span class="obj-explorer-prop-label">' + esc(p.label) + '</span>' +
                '<span class="obj-explorer-prop-value">' + p.value + '</span>' +
                '</div>';
        });
        html += '</div>';
        container.innerHTML = html;
    }

    function formatValue(val) {
        if (typeof val === 'number') return String(Math.round(val * 100) / 100);
        if (typeof val === 'boolean') return val ? 'Yes' : 'No';
        if (Array.isArray(val)) return val.map(function (v) { return esc(String(v)); }).join(', ');
        return esc(String(val));
    }

    function populateNotes(obj) {
        var container = document.getElementById('objExplorerNotes');
        if (!container) return;
        var note = obj.extraNotes || obj.notes || obj.note || '';
        if (!note) {
            container.innerHTML = '<div class="obj-explorer-empty">No notes</div>';
            return;
        }
        container.innerHTML = '<div class="obj-explorer-note-content">' + esc(note) + '</div>';
    }

    function populateRelationships(obj) {
        var container = document.getElementById('objExplorerRelationships');
        if (!container) return;

        var rels = [];
        if (window.pazatorStore) {
            var related = window.pazatorStore.getRelatedObjects(_currentId);
            related.forEach(function (r) {
                rels.push(r);
            });
        }

        if (rels.length === 0) {
            container.innerHTML = '<div class="obj-explorer-empty">No relationships</div>';
            document.getElementById('objExplorerRelCount').textContent = '0';
            return;
        }

        document.getElementById('objExplorerRelCount').textContent = rels.length;

        var html = '<div class="obj-explorer-rel-list">';
        rels.forEach(function (r) {
            var relType = getObjectType(r.object);
            var color = getTypeColor(relType);
            var icon = getTypeIcon(relType);
            var relLabel = r.relationship.charAt(0).toUpperCase() + r.relationship.slice(1);
            html += '<div class="obj-explorer-rel-item" data-id="' + r.object.id + '">' +
                '<span class="obj-explorer-rel-dot" style="background:' + color + '"></span>' +
                '<span class="obj-explorer-rel-icon"><i class="fas ' + icon + '"></i></span>' +
                '<span class="obj-explorer-rel-name">' + esc(r.object.name) + '</span>' +
                '<span class="obj-explorer-rel-type" style="color:' + color + '">' + esc(relLabel) + '</span>' +
                (r.details ? '<span class="obj-explorer-rel-details">' + esc(r.details) + '</span>' : '') +
                '</div>';
        });
        html += '</div>';
        container.innerHTML = html;

        container.querySelectorAll('.obj-explorer-rel-item').forEach(function (el) {
            el.addEventListener('click', function () {
                var id = this.dataset.id;
                if (id) open(id);
            });
        });
    }

    function populateCases(obj) {
        var container = document.getElementById('objExplorerCases');
        if (!container) return;

        var entityCases = [];
        if (typeof cases !== 'undefined' && cases) {
            entityCases = cases.filter(function (c) {
                return c.entities && c.entities.indexOf(_currentId) >= 0;
            });
        }

        if (entityCases.length === 0) {
            container.innerHTML = '<div class="obj-explorer-empty">Not linked to any cases</div>';
            document.getElementById('objExplorerCaseCount').textContent = '0';
            return;
        }

        document.getElementById('objExplorerCaseCount').textContent = entityCases.length;

        var html = '<div class="obj-explorer-case-list">';
        entityCases.forEach(function (c) {
            var statusColor = c.status === 'open' ? '#51cf66' : c.status === 'closed' ? '#868e96' : '#ffd43b';
            html += '<div class="obj-explorer-case-item" data-id="' + c.id + '">' +
                '<div class="obj-explorer-case-icon"><i class="fas fa-folder" style="color:' + statusColor + '"></i></div>' +
                '<div class="obj-explorer-case-info">' +
                '<div class="obj-explorer-case-title">' + esc(c.title) + '</div>' +
                '<div class="obj-explorer-case-meta"><span class="obj-explorer-case-status" style="color:' + statusColor + '">' + esc(c.status) + '</span> &middot; ' + new Date(c.createdAt).toLocaleDateString() + '</div>' +
                '</div></div>';
        });
        html += '</div>';
        container.innerHTML = html;

        container.querySelectorAll('.obj-explorer-case-item').forEach(function (el) {
            el.addEventListener('click', function () {
                var id = this.dataset.id;
                if (id && window.switchTab) {
                    close();
                    window.switchTab('cases');
                    setTimeout(function () {
                        if (window.selectCase) window.selectCase(id);
                    }, 150);
                }
            });
        });
    }

    function populateChats(obj) {
        var container = document.getElementById('objExplorerChats');
        if (!container) return;

        var entityChats = [];
        if (obj.chats && obj.chats.length > 0 && pazatorData && pazatorData.chats) {
            obj.chats.forEach(function (chatRef) {
                var chat = pazatorData.chats.find(function (c) { return c.id === chatRef || c.timestamp === chatRef; });
                if (chat) entityChats.push(chat);
            });
        }

        if (entityChats.length === 0) {
            container.innerHTML = '<div class="obj-explorer-empty">No chats linked</div>';
            return;
        }

        var html = '<div class="obj-explorer-chat-list">';
        entityChats.forEach(function (chat) {
            var source = chat.source || 'Unknown';
            var date = chat.timestamp ? new Date(chat.timestamp).toLocaleDateString() : '';
            var suspicious = chat.suspicious ? '<span class="obj-explorer-suspicious"><i class="fas fa-exclamation-triangle"></i></span>' : '';
            html += '<div class="obj-explorer-chat-item" data-id="' + (chat.id || chat.timestamp) + '">' +
                '<div class="obj-explorer-chat-icon"><i class="fas fa-comment"></i></div>' +
                '<div class="obj-explorer-chat-info">' +
                '<div class="obj-explorer-chat-source">' + esc(source) + ' ' + suspicious + '</div>' +
                '<div class="obj-explorer-chat-date">' + esc(date) + '</div>' +
                '</div></div>';
        });
        html += '</div>';
        container.innerHTML = html;

        container.querySelectorAll('.obj-explorer-chat-item').forEach(function (el) {
            el.addEventListener('click', function () {
                close();
                if (window.switchTab) window.switchTab('chat-control');
            });
        });
    }

    function populateObjects(obj) {
        var container = document.getElementById('objExplorerObjects');
        if (!container) return;

        if (!window.pazatorObjects) {
            container.innerHTML = '<div class="obj-explorer-empty">Object system not available</div>';
            return;
        }

        var fields = window.pazatorObjects.getHumanFields(obj);
        var hasAny = false;
        var html = '<div class="obj-explorer-obj-list">';
        for (var key in fields) {
            var val = fields[key];
            if (!val) continue;
            hasAny = true;
            var cfg = window.pazatorObjects.getTypeConfig(key);
            var icon = cfg ? cfg.icon : 'fa-tag';
            var color = cfg ? cfg.color : '#888';
            var label = cfg ? cfg.label : key;
            if (typeof val === 'string') {
                html += '<div class="obj-explorer-obj-item" data-type="' + key + '" data-name="' + esc(val) + '">' +
                    '<span class="obj-explorer-obj-icon" style="color:' + color + '"><i class="fas ' + icon + '"></i></span>' +
                    '<span class="obj-explorer-obj-label" style="color:' + color + '">' + esc(label) + '</span>' +
                    '<span class="obj-explorer-obj-value">' + esc(val) + '</span>' +
                    '</div>';
            } else if (Array.isArray(val)) {
                val.forEach(function (v) {
                    html += '<div class="obj-explorer-obj-item" data-type="' + key + '" data-name="' + esc(v) + '">' +
                        '<span class="obj-explorer-obj-icon" style="color:' + color + '"><i class="fas ' + icon + '"></i></span>' +
                        '<span class="obj-explorer-obj-label" style="color:' + color + '">' + esc(label) + '</span>' +
                        '<span class="obj-explorer-obj-value">' + esc(v) + '</span>' +
                        '</div>';
                });
            }
        }
        html += '</div>';

        if (!hasAny) {
            container.innerHTML = '<div class="obj-explorer-empty">No ontology objects linked</div>';
            return;
        }
        container.innerHTML = html;

        container.querySelectorAll('.obj-explorer-obj-item').forEach(function (el) {
            el.addEventListener('click', function () {
                var type = this.dataset.type;
                var name = this.dataset.name;
                if (type && name && window.pazatorObjects) {
                    var obj = window.pazatorObjects.getByName(type, name);
                    if (obj && window.pazatorDetails && window.pazatorDetails.showObjectDetail) {
                        window.pazatorDetails.showObjectDetail(obj.id, type);
                    } else if (window.showObjectDetail) {
                        window.showObjectDetail(obj.id, type);
                    }
                }
            });
        });
    }

    function populateTimeline(obj) {
        var container = document.getElementById('objExplorerTimeline');
        var countEl = document.getElementById('objExplorerTimelineCount');
        if (!container) return;

        if (typeof buildEntityTimeline === 'function') {
            var events = buildEntityTimeline(_currentId, _currentType === 'Person' ? 'human' : 'other');
            if (!events || events.length === 0) {
                container.innerHTML = '<div class="obj-explorer-empty">No timeline events</div>';
                if (countEl) countEl.textContent = '';
                return;
            }
            if (countEl) countEl.textContent = events.length + ' events';
            renderTimeline(container, events);
        } else {
            container.innerHTML = '<div class="obj-explorer-empty">Timeline not available</div>';
        }
    }

    function renderTimeline(container, events) {
        var html = '<div class="obj-explorer-timeline">';
        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            var timeStr = '';
            if (e.timestamp > 0) {
                var diff = Date.now() - e.timestamp;
                if (diff < 60000) timeStr = 'just now';
                else if (diff < 3600000) timeStr = Math.floor(diff / 60000) + 'm ago';
                else if (diff < 86400000) timeStr = Math.floor(diff / 3600000) + 'h ago';
                else if (diff < 2592000000) timeStr = Math.floor(diff / 86400000) + 'd ago';
                else timeStr = new Date(e.timestamp).toLocaleDateString();
            }
            var color = e.color || '#4d9de0';
            var icon = e.icon || 'fa-circle';
            html += '<div class="obj-explorer-timeline-event">' +
                '<div class="obj-explorer-timeline-dot" style="background:' + color + '"></div>' +
                '<div class="obj-explorer-timeline-line"></div>' +
                '<div class="obj-explorer-timeline-content">' +
                '<div class="obj-explorer-timeline-header">' +
                '<span class="obj-explorer-timeline-icon" style="color:' + color + '"><i class="fas ' + icon + '"></i></span>' +
                '<span class="obj-explorer-timeline-title">' + esc(e.title) + '</span>' +
                (timeStr ? '<span class="obj-explorer-timeline-time">' + timeStr + '</span>' : '') +
                '</div>' +
                (e.description ? '<div class="obj-explorer-timeline-desc">' + esc(e.description) + '</div>' : '') +
                '</div></div>';
        }
        html += '</div>';
        container.innerHTML = html;
    }

    function wireEvents(obj) {
        var closeBtn = document.getElementById('objExplorerClose');
        var backBtn = document.getElementById('objExplorerBack');
        var editBtn = document.getElementById('objExplorerEdit');
        var graphBtn = document.getElementById('objExplorerGraph');
        var overlay = _overlay;

        if (closeBtn) closeBtn.addEventListener('click', close);
        if (backBtn) backBtn.addEventListener('click', close);
        if (overlay) {
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) close();
            });
        }

        if (editBtn) {
            editBtn.addEventListener('click', function () {
                close();
                if (_currentType === 'Person' && typeof openHumanFormForEdit === 'function') {
                    openHumanFormForEdit(obj);
                } else if (_currentType !== 'Person' && typeof openOtherFormForEdit === 'function') {
                    openOtherFormForEdit(obj);
                }
            });
        }

        if (graphBtn) {
            graphBtn.addEventListener('click', function () {
                close();
                if (window.switchTab) window.switchTab('graph');
            });
        }

        function onKey(e) {
            if (e.key === 'Escape') close();
        }
        document.addEventListener('keydown', onKey);
        _overlay._keyCleanup = function () {
            document.removeEventListener('keydown', onKey);
        };
    }

    function esc(str) {
        if (!str) return '';
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    var api = {
        open: open,
        close: close,

        openEntity: function (id, type) {
            open(id);
        }
    };

    window.pazatorObjectExplorer = api;
})();
