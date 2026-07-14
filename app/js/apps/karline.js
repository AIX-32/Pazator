(function () {
    'use strict';

    var STORAGE_KEY = 'pazator_karline_actions';
    var actions = [];
    var actionIdCounter = 1;
    var DAY_MS = 86400000;
    var COL_W = 130;
    var NAV_DAYS = 14;
    var weekOffset = 0;

    var STATUSES = ['draft', 'active', 'completed', 'cancelled'];
    var STATUS_COLORS = { draft: '#9e9e9e', active: '#2196f3', completed: '#4caf50', cancelled: '#ff6b6b' };
    var STATUS_BGS = { draft: 'rgba(158,158,158,0.08)', active: 'rgba(33,150,243,0.08)', completed: 'rgba(76,175,80,0.08)', cancelled: 'rgba(255,107,107,0.08)' };
    var STATUS_BORDERS = { draft: 'rgba(158,158,158,0.2)', active: 'rgba(33,150,243,0.2)', completed: 'rgba(76,175,80,0.2)', cancelled: 'rgba(255,107,107,0.2)' };

    function load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            actions = raw ? JSON.parse(raw) : [];
            actionIdCounter = actions.reduce(function (m, a) { return Math.max(m, a.id || 0); }, 0) + 1;
        } catch (e) { actions = []; }
    }

    function save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(actions)); } catch (e) {}
    }

    function notify(msg, type) {
        var fn = window.showFloatingNotification || window.PazatorUI && window.PazatorUI.showFloatingNotification;
        if (fn) fn(msg, type || 'info');
    }

    function generateId() { return actionIdCounter++; }

    function todayString() {
        return new Date().toISOString().slice(0, 10);
    }

    function formatDate(iso) {
        var d = new Date(iso + 'T00:00:00');
        return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    }

    function shortDate(iso) {
        var p = iso.split('-');
        return p[1] + '/' + p[2];
    }

    function dayName(iso) {
        return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' });
    }

    function daysBetween(a, b) {
        return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / DAY_MS);
    }

    function addDays(iso, n) {
        var d = new Date(iso + 'T00:00:00');
        d.setDate(d.getDate() + n);
        return d.toISOString().slice(0, 10);
    }

    function getEntities() {
        var list = [];
        try {
            var store = window.pazatorStore;
            if (!store || !store._data) return list;
            (store._data.humans || []).forEach(function (e) { list.push({ id: e.id, name: e.name || e.id, type: 'human' }); });
            (store._data.others || []).forEach(function (e) { list.push({ id: e.id, name: e.name || e.id, type: 'other' }); });
        } catch (e) {}
        return list;
    }

    function getEntityName(id) {
        var all = getEntities();
        var found = all.find(function (e) { return e.id === id; });
        return found ? found.name : id;
    }

    function nextStatus(s) {
        var idx = STATUSES.indexOf(s);
        return idx < STATUSES.length - 1 ? STATUSES[idx + 1] : STATUSES[0];
    }

    // ─── Actions ──────────────────────────────────────────────────────

    function createAction(data) {
        var action = {
            id: generateId(),
            title: data.title || 'Untitled',
            type: data.type || 'static',
            date: data.date || todayString(),
            endDate: data.endDate || '',
            description: data.description || '',
            evidence: data.evidence || [],
            goal: data.goal || '',
            status: 'draft',
            zorVerified: false,
            createdAt: new Date().toISOString()
        };
        actions.push(action);
        save();
        render();
        return action;
    }

    function deleteAction(id) {
        actions = actions.filter(function (a) { return a.id !== id; });
        save();
        render();
    }

    function updateAction(id, patch) {
        var a = actions.find(function (x) { return x.id === id; });
        if (!a) return;
        Object.assign(a, patch);
        save();
        render();
    }

    // ─── Verify ───────────────────────────────────────────────────────

    function verifyAction(id, statusEl, timerEl) {
        var start = Date.now();
        statusEl.textContent = 'working.';
        statusEl.style.display = 'flex';
        timerEl.style.display = 'block';

        var interval = setInterval(function () {
            var elapsed = Math.floor((Date.now() - start) / 1000);
            timerEl.textContent = elapsed + 's';
            if (elapsed > 1) statusEl.textContent = 'working..';
            if (elapsed > 2) statusEl.textContent = 'working...';
        }, 200);

        setTimeout(function () {
            clearInterval(interval);
            statusEl.textContent = 'Handed off to Zor.';
            timerEl.textContent = '';
            timerEl.style.display = 'none';
            statusEl.style.borderColor = '#4caf50';
            statusEl.style.color = '#4caf50';
            updateAction(id, { zorVerified: true, status: 'verified' });
            notify('Action verified by Zor', 'success');
        }, 3000);
    }

    // ─── PDF ──────────────────────────────────────────────────────────

    function generatePdf(action) {
        if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
            notify('jsPDF not loaded', 'error');
            return;
        }
        var PDF = window.jspdf ? window.jspdf.jsPDF : jspdf.jsPDF;
        var doc = new PDF();
        var y = 20;
        var pw = 190;

        doc.setFontSize(18);
        doc.text('Action Report', pw / 2, y, { align: 'center' }); y += 12;
        doc.setFontSize(10);
        doc.text('Generated by Pazator Sarparast - Karline', pw / 2, y, { align: 'center' }); y += 6;
        doc.text(new Date().toLocaleString(), pw / 2, y, { align: 'center' }); y += 14;

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text(action.title, 10, y); y += 8;

        doc.setFontSize(10); doc.setFont(undefined, 'normal');
        doc.text('Type: ' + action.type.toUpperCase(), 10, y);
        doc.text('Date: ' + formatDate(action.date), pw / 2 + 10, y); y += 6;
        if (action.endDate) { doc.text('End: ' + formatDate(action.endDate), 10, y); y += 6; }
        doc.text('Status: ' + action.status, 10, y);
        doc.text('Zor Verified: ' + (action.zorVerified ? 'Yes' : 'No'), pw / 2 + 10, y); y += 6;
        doc.text('Goal: ' + (action.goal || '\u2014'), 10, y); y += 10;

        if (action.description) {
            doc.setFont(undefined, 'bold'); doc.text('Description:', 10, y); y += 5;
            doc.setFont(undefined, 'normal');
            var lines = doc.splitTextToSize(action.description, pw - 20);
            doc.text(lines, 10, y); y += lines.length * 5 + 6;
        }
        if (action.evidence && action.evidence.length) {
            doc.setFont(undefined, 'bold'); doc.text('Evidence:', 10, y); y += 5;
            doc.setFont(undefined, 'normal');
            action.evidence.forEach(function (eid) { doc.text('\u2022 ' + getEntityName(eid), 14, y); y += 5; });
        }
        y += 10;
        doc.setFontSize(8); doc.setTextColor(150);
        doc.text('This report is for operational use. Hand off to relevant sectors as needed.', 10, y);
        doc.save('karline-action-' + action.id + '.pdf');
        notify('PDF report downloaded', 'success');
    }

    // ─── Entity Picker ────────────────────────────────────────────────

    var _pickerResolve = null;

    function showEntityPicker(selected) {
        return new Promise(function (resolve) {
            _pickerResolve = resolve;
            var existing = document.getElementById('karlineEntityPicker');
            if (existing) existing.remove();

            var all = getEntities();
            var overlay = document.createElement('div');
            overlay.id = 'karlineEntityPicker';
            overlay.className = 'modal';
            overlay.style.cssText = 'display:flex;';

            var listHtml = all.length ? all.map(function (e) {
                var sel = selected.indexOf(e.id) !== -1 ? ' checked' : '';
                return '<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:4px;cursor:pointer;font-size:0.8rem;">'
                    + '<input type="checkbox" value="' + e.id + '"' + sel + '>'
                    + '<span style="flex:1;">' + escapeHtml(e.name) + '</span>'
                    + '<span style="font-size:0.65rem;color:var(--text-muted);">' + e.type + '</span></label>';
            }).join('') : '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.8rem;">No entities in Pazator. Add some first.</div>';

            overlay.innerHTML =
                '<div class="modal-content" style="max-width:400px;width:90%;">'
                + '<button class="close" onclick="this.closest(\'.modal\').remove();window.pazatorKarline&&window.pazatorKarline.cancelEntityPicker()">&times;</button>'
                + '<div class="modal-header"><h2>Select Evidence</h2></div>'
                + '<div class="modal-body" style="max-height:50vh;overflow-y:auto;">'
                + '<input type="text" id="kEntitySearch" class="form-control" placeholder="Search..." style="margin-bottom:8px;font-size:0.8rem;">'
                + '<div id="kEntityList">' + listHtml + '</div>'
                + '</div>'
                + '<div class="modal-footer" style="padding:12px;display:flex;gap:8px;border-top:1px solid rgba(255,255,255,0.06);">'
                + '<button class="btn btn-primary" id="kEntityDoneBtn" style="flex:1;font-size:0.8rem;"><i class="fas fa-check"></i> Done</button>'
                + '</div></div>';

            document.body.appendChild(overlay);

            document.getElementById('kEntitySearch').addEventListener('input', function () {
                var q = this.value.toLowerCase();
                var labels = document.getElementById('kEntityList').querySelectorAll('label');
                labels.forEach(function (l) {
                    l.style.display = l.textContent.toLowerCase().indexOf(q) !== -1 ? 'flex' : 'none';
                });
            });

            document.getElementById('kEntityDoneBtn').addEventListener('click', function () {
                var checks = document.getElementById('kEntityList').querySelectorAll('input[type=checkbox]:checked');
                var ids = Array.from(checks).map(function (c) { return c.value; });
                overlay.remove();
                if (_pickerResolve) { _pickerResolve(ids); _pickerResolve = null; }
            });
        });
    }

    window.pazatorKarline = window.pazatorKarline || {};
    window.pazatorKarline.cancelEntityPicker = function () {
        if (_pickerResolve) { _pickerResolve([]); _pickerResolve = null; }
    };

    // ─── Modals ───────────────────────────────────────────────────────

    function showDetailModal(action) {
        var existing = document.getElementById('karlineDetailModal');
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.id = 'karlineDetailModal';
        overlay.className = 'modal';
        overlay.style.cssText = 'display:flex;';

        var evHtml = action.evidence && action.evidence.length
            ? action.evidence.map(function (eid) { return '<span class="tag" style="margin:2px;font-size:0.7rem;">' + escapeHtml(getEntityName(eid)) + '</span>'; }).join('')
            : '<span style="color:var(--text-muted);font-size:0.8rem;">None attached</span>';

        var verifyHtml;
        if (action.zorVerified) {
            verifyHtml = '<div style="margin-top:14px;padding:12px;background:rgba(76,175,80,0.08);border-radius:8px;text-align:center;font-size:0.85rem;color:#4caf50;border:1px solid rgba(76,175,80,0.2);"><i class="fas fa-check-circle"></i> Handed off to Zor.</div>';
        } else {
            verifyHtml = '<button class="btn btn-primary" id="karlineVerifyBtn" style="width:100%;margin-top:14px;padding:8px;"><i class="fas fa-robot"></i> Verify with Zor</button>'
                + '<div id="karlineVerifyStatus" style="display:none;margin-top:10px;padding:14px;background:rgba(255,193,7,0.06);border-radius:8px;text-align:center;border:1px solid rgba(255,193,7,0.15);">'
                + '<div style="width:52px;height:52px;border:2px solid #ffc107;border-radius:10px;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;font-size:0.8rem;color:#ffc107;font-family:monospace;transition:all 0.3s;" id="karlineVerifySquare">working.</div>'
                + '<div id="karlineVerifyTimer" style="font-size:0.75rem;color:var(--text-muted);font-family:monospace;display:none;">0s</div>'
                + '</div>';
        }

        var statusClr = STATUS_COLORS[action.status] || '#9e9e9e';

        overlay.innerHTML =
            '<div class="modal-content" style="max-width:480px;width:92%;">'
            + '<button class="close" onclick="this.closest(\'.modal\').remove()">&times;</button>'
            + '<div class="modal-header" style="border-bottom:none;padding-bottom:0;"><h2 style="font-size:1.1rem;">' + escapeHtml(action.title) + '</h2></div>'
            + '<div class="modal-body">'
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;font-size:0.8rem;">'
            + '<div><span style="color:var(--text-muted);font-size:0.7rem;">Type</span><br><span class="tag ' + (action.type === 'dynamic' ? 'tag-warning' : 'tag-info') + '" style="margin-top:2px;font-size:0.7rem;">' + action.type + '</span></div>'
            + '<div><span style="color:var(--text-muted);font-size:0.7rem;">Date</span><br><span>' + formatDate(action.date) + (action.endDate ? ' \u2013 ' + formatDate(action.endDate) : '') + '</span></div>'
            + '<div><span style="color:var(--text-muted);font-size:0.7rem;">Status</span><br>' + statusBadge(action.status) + '</div>'
            + '<div><span style="color:var(--text-muted);font-size:0.7rem;">Goal</span><br><span>' + escapeHtml(action.goal || '\u2014') + '</span></div>'
            + '</div>'
            + '<div style="margin-bottom:12px;"><span style="color:var(--text-muted);font-size:0.7rem;display:block;margin-bottom:4px;">Description</span>'
            + '<div style="font-size:0.82rem;line-height:1.6;background:rgba(0,0,0,0.12);padding:10px 12px;border-radius:6px;">' + escapeHtml(action.description || 'No description') + '</div></div>'
            + '<div style="margin-bottom:12px;"><span style="color:var(--text-muted);font-size:0.7rem;display:block;margin-bottom:4px;">Evidence</span>'
            + '<div style="display:flex;flex-wrap:wrap;gap:4px;">' + evHtml + '</div></div>'
            + '<div style="display:flex;gap:8px;">'
            + '<button class="btn glass-btn" id="karlineEditBtn" style="flex:1;font-size:0.78rem;"><i class="fas fa-pen"></i> Edit</button>'
            + '<button class="btn glass-btn" onclick="window.pazatorKarline.generatePdf(' + action.id + ')" style="flex:1;font-size:0.78rem;"><i class="fas fa-file-pdf"></i> PDF</button>'
            + '<button class="btn glass-btn" style="flex:1;font-size:0.78rem;color:#ff6b6b;" onclick="var m=this.closest(\'.modal\');window.pazatorKarline.deleteAction(' + action.id + ');m.remove()"><i class="fas fa-trash"></i> Delete</button>'
            + '</div>'
            + '<div style="display:flex;gap:8px;margin-top:6px;">'
            + '<button class="btn glass-btn" id="karlineAdvanceBtn" style="flex:1;font-size:0.75rem;color:' + statusClr + ';"><i class="fas fa-arrow-right"></i> Advance to "' + nextStatus(action.status) + '"</button>'
            + '</div>'
            + verifyHtml
            + '</div></div>';

        document.body.appendChild(overlay);

        var verifyBtn = document.getElementById('karlineVerifyBtn');
        if (verifyBtn) {
            verifyBtn.addEventListener('click', function () {
                verifyBtn.disabled = true;
                verifyBtn.textContent = 'Verifying...';
                var statusEl = document.getElementById('karlineVerifyStatus');
                var square = document.getElementById('karlineVerifySquare');
                var timer = document.getElementById('karlineVerifyTimer');
                statusEl.style.display = 'block';
                verifyAction(action.id, square, timer);
            });
        }

        var editBtn = document.getElementById('karlineEditBtn');
        if (editBtn) {
            editBtn.addEventListener('click', function () {
                overlay.remove();
                showEditActionModal(action);
            });
        }

        var advanceBtn = document.getElementById('karlineAdvanceBtn');
        if (advanceBtn) {
            advanceBtn.addEventListener('click', function () {
                var next = nextStatus(action.status);
                updateAction(action.id, { status: next });
                notify('Status changed to "' + next + '"', 'info');
                overlay.remove();
                showDetailModal(Object.assign({}, action, { status: next }));
            });
        }
    }

    // ─── New Action Modal ─────────────────────────────────────────────

    var _pendingEvidence = [];

    function showNewActionModal() {
        var existing = document.getElementById('karlineNewModal');
        if (existing) existing.remove();

        _pendingEvidence = [];

        var overlay = document.createElement('div');
        overlay.id = 'karlineNewModal';
        overlay.className = 'modal';
        overlay.style.cssText = 'display:flex;';

        var today = todayString();

        overlay.innerHTML =
            '<div class="modal-content" style="max-width:480px;width:92%;">'
            + '<button class="close" onclick="this.closest(\'.modal\').remove()">&times;</button>'
            + '<div class="modal-header"><h2>New Action</h2></div>'
            + '<div class="modal-body">'
            + '<div class="form-group compact"><label>Title</label><input type="text" id="kTitle" class="form-control" placeholder="Action title"></div>'
            + '<div class="form-group compact"><label>Type</label><select id="kType" class="form-control"><option value="static">Static — fixed time and place</option><option value="dynamic">Dynamic — context-aware</option></select></div>'
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
            + '<div class="form-group compact"><label>Start Date</label><input type="date" id="kDate" class="form-control" value="' + today + '"></div>'
            + '<div class="form-group compact"><label>End Date</label><input type="date" id="kEndDate" class="form-control"></div>'
            + '</div>'
            + '<div class="form-group compact"><label>Goal</label><input type="text" id="kGoal" class="form-control" placeholder="Objective"></div>'
            + '<div class="form-group compact"><label>Description</label><textarea id="kDesc" class="form-control" rows="2" placeholder="Details..." style="resize:vertical;"></textarea></div>'
            + '<div class="form-group compact">'
            + '<label>Evidence</label>'
            + '<div id="kEvidenceDisplay" style="display:flex;flex-wrap:wrap;gap:4px;min-height:28px;padding:4px 0;"><span style="color:var(--text-muted);font-size:0.78rem;">None selected</span></div>'
            + '<button class="btn glass-btn" id="kPickEvidenceBtn" style="width:100%;font-size:0.78rem;margin-top:4px;"><i class="fas fa-search"></i> Select from entities...</button>'
            + '</div>'
            + '<div style="margin-top:14px;display:flex;gap:8px;">'
            + '<button class="btn btn-primary" id="kSaveBtn" style="flex:1;"><i class="fas fa-check"></i> Create</button>'
            + '<button class="btn glass-btn" onclick="this.closest(\'.modal\').remove()">Cancel</button>'
            + '</div>'
            + '</div></div>';

        document.body.appendChild(overlay);

        function updateEvidenceDisplay() {
            var el = document.getElementById('kEvidenceDisplay');
            if (!el) return;
            if (_pendingEvidence.length) {
                el.innerHTML = _pendingEvidence.map(function (eid) {
                    return '<span class="tag" style="font-size:0.7rem;margin:1px;">' + escapeHtml(getEntityName(eid)) + ' <span style="cursor:pointer;opacity:0.6;" data-eid="' + eid + '" class="kEvRemove">&times;</span></span>';
                }).join('');
                el.querySelectorAll('.kEvRemove').forEach(function (s) {
                    s.addEventListener('click', function () {
                        _pendingEvidence = _pendingEvidence.filter(function (id) { return id !== s.dataset.eid; });
                        updateEvidenceDisplay();
                    });
                });
            } else {
                el.innerHTML = '<span style="color:var(--text-muted);font-size:0.78rem;">None selected</span>';
            }
        }

        document.getElementById('kPickEvidenceBtn').addEventListener('click', function () {
            showEntityPicker(_pendingEvidence).then(function (ids) {
                _pendingEvidence = ids;
                updateEvidenceDisplay();
            });
        });

        document.getElementById('kSaveBtn').addEventListener('click', function () {
            var title = document.getElementById('kTitle').value.trim();
            if (!title) { notify('Title is required', 'error'); return; }
            createAction({
                title: title,
                type: document.getElementById('kType').value,
                date: document.getElementById('kDate').value || today,
                endDate: document.getElementById('kEndDate').value || '',
                goal: document.getElementById('kGoal').value.trim(),
                description: document.getElementById('kDesc').value.trim(),
                evidence: _pendingEvidence
            });
            overlay.remove();
            notify('Action created', 'success');
        });
    }

    // ─── Edit Action Modal ────────────────────────────────────────────

    function showEditActionModal(action) {
        var existing = document.getElementById('karlineEditModal');
        if (existing) existing.remove();

        _pendingEvidence = (action.evidence || []).slice();

        var overlay = document.createElement('div');
        overlay.id = 'karlineEditModal';
        overlay.className = 'modal';
        overlay.style.cssText = 'display:flex;';

        var today = todayString();

        overlay.innerHTML =
            '<div class="modal-content" style="max-width:480px;width:92%;">'
            + '<button class="close" onclick="this.closest(\'.modal\').remove()">&times;</button>'
            + '<div class="modal-header"><h2>Edit Action</h2></div>'
            + '<div class="modal-body">'
            + '<div class="form-group compact"><label>Title</label><input type="text" id="kEditTitle" class="form-control" value="' + escapeHtml(action.title) + '"></div>'
            + '<div class="form-group compact"><label>Type</label><select id="kEditType" class="form-control">'
            + '<option value="static"' + (action.type === 'static' ? ' selected' : '') + '>Static — fixed time and place</option>'
            + '<option value="dynamic"' + (action.type === 'dynamic' ? ' selected' : '') + '>Dynamic — context-aware</option></select></div>'
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
            + '<div class="form-group compact"><label>Start Date</label><input type="date" id="kEditDate" class="form-control" value="' + action.date + '"></div>'
            + '<div class="form-group compact"><label>End Date</label><input type="date" id="kEditEndDate" class="form-control" value="' + (action.endDate || '') + '"></div>'
            + '</div>'
            + '<div class="form-group compact"><label>Goal</label><input type="text" id="kEditGoal" class="form-control" value="' + escapeHtml(action.goal || '') + '"></div>'
            + '<div class="form-group compact"><label>Status</label><select id="kEditStatus" class="form-control">'
            + STATUSES.map(function (s) { return '<option value="' + s + '"' + (action.status === s ? ' selected' : '') + '>' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>'; }).join('')
            + '</select></div>'
            + '<div class="form-group compact"><label>Description</label><textarea id="kEditDesc" class="form-control" rows="2" style="resize:vertical;">' + escapeHtml(action.description || '') + '</textarea></div>'
            + '<div class="form-group compact">'
            + '<label>Evidence</label>'
            + '<div id="kEditEvidenceDisplay" style="display:flex;flex-wrap:wrap;gap:4px;min-height:28px;padding:4px 0;"></div>'
            + '<button class="btn glass-btn" id="kEditPickEvidenceBtn" style="width:100%;font-size:0.78rem;margin-top:4px;"><i class="fas fa-search"></i> Select from entities...</button>'
            + '</div>'
            + '<div style="margin-top:14px;display:flex;gap:8px;">'
            + '<button class="btn btn-primary" id="kEditSaveBtn" style="flex:1;"><i class="fas fa-save"></i> Save</button>'
            + '<button class="btn glass-btn" onclick="this.closest(\'.modal\').remove()">Cancel</button>'
            + '</div>'
            + '</div></div>';

        document.body.appendChild(overlay);

        function updateDisplay() {
            var el = document.getElementById('kEditEvidenceDisplay');
            if (!el) return;
            if (_pendingEvidence.length) {
                el.innerHTML = _pendingEvidence.map(function (eid) {
                    return '<span class="tag" style="font-size:0.7rem;margin:1px;">' + escapeHtml(getEntityName(eid)) + ' <span style="cursor:pointer;opacity:0.6;" data-eid="' + eid + '" class="kEvRemove">&times;</span></span>';
                }).join('');
                el.querySelectorAll('.kEvRemove').forEach(function (s) {
                    s.addEventListener('click', function () {
                        _pendingEvidence = _pendingEvidence.filter(function (id) { return id !== s.dataset.eid; });
                        updateDisplay();
                    });
                });
            } else {
                el.innerHTML = '<span style="color:var(--text-muted);font-size:0.78rem;">None selected</span>';
            }
        }
        updateDisplay();

        document.getElementById('kEditPickEvidenceBtn').addEventListener('click', function () {
            showEntityPicker(_pendingEvidence).then(function (ids) {
                _pendingEvidence = ids;
                updateDisplay();
            });
        });

        document.getElementById('kEditSaveBtn').addEventListener('click', function () {
            var title = document.getElementById('kEditTitle').value.trim();
            if (!title) { notify('Title is required', 'error'); return; }
            updateAction(action.id, {
                title: title,
                type: document.getElementById('kEditType').value,
                date: document.getElementById('kEditDate').value || today,
                endDate: document.getElementById('kEditEndDate').value || '',
                goal: document.getElementById('kEditGoal').value.trim(),
                status: document.getElementById('kEditStatus').value,
                description: document.getElementById('kEditDesc').value.trim(),
                evidence: _pendingEvidence
            });
            overlay.remove();
            notify('Action updated', 'success');
        });
    }

    // ─── Status badge helper ──────────────────────────────────────────

    function statusBadge(s) {
        var c = STATUS_COLORS[s] || '#9e9e9e';
        return '<span style="background:' + c + '20;color:' + c + ';padding:0 6px;border-radius:3px;font-size:0.6rem;font-weight:600;text-transform:uppercase;">' + s + '</span>';
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ─── Context Menu ─────────────────────────────────────────────────

    function showContextMenu(e, action) {
        var existing = document.getElementById('karlineContextMenu');
        if (existing) existing.remove();

        var menu = document.createElement('div');
        menu.id = 'karlineContextMenu';
        menu.style.cssText = 'position:fixed;z-index:9999;background:var(--bg-card,rgba(30,30,40,0.98));border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:4px;min-width:170px;box-shadow:0 4px 20px rgba(0,0,0,0.5);font-size:0.8rem;';
        menu.style.left = Math.min(e.clientX, window.innerWidth - 190) + 'px';
        menu.style.top = e.clientY + 'px';
        menu.innerHTML =
            '<div class="menu-dropdown-item" style="padding:6px 12px;cursor:pointer;" onclick="window.pazatorKarline.showDetailModal(' + action.id + ');this.closest(\'#karlineContextMenu\').remove()"><i class="fas fa-info-circle"></i> View Details</div>'
            + '<div class="menu-dropdown-item" style="padding:6px 12px;cursor:pointer;" onclick="var m=document.getElementById(\'karlineContextMenu\');if(m)m.remove();window.pazatorKarline.showEditActionModal(window.pazatorKarline.getActions().find(function(a){return a.id===' + action.id + '}))"><i class="fas fa-pen"></i> Edit</div>'
            + '<div class="menu-dropdown-item" style="padding:6px 12px;cursor:pointer;" onclick="window.pazatorKarline.generatePdf(' + action.id + ');this.closest(\'#karlineContextMenu\').remove()"><i class="fas fa-file-pdf"></i> Download PDF Report</div>'
            + '<div class="menu-separator"></div>'
            + '<div class="menu-dropdown-item" style="padding:6px 12px;cursor:pointer;color:#ff6b6b;" onclick="window.pazatorKarline.deleteAction(' + action.id + ');this.closest(\'#karlineContextMenu\').remove()"><i class="fas fa-trash"></i> Delete</div>';

        document.body.appendChild(menu);
        var close = function (e2) {
            var el = document.getElementById('karlineContextMenu');
            if (el && !el.contains(e2.target)) { el.remove(); document.removeEventListener('click', close); }
        };
        setTimeout(function () { document.addEventListener('click', close); }, 10);
    }

    // ─── Rendering ────────────────────────────────────────────────────

    function render() {
        var colContainer = document.getElementById('karlineDayColumns');
        var daysRow = document.getElementById('karlineDaysRow');
        var emptyEl = document.getElementById('karlineEmpty');
        var timelineWrap = document.getElementById('karlineTimelineWrap');
        var actionList = document.getElementById('karlineActionList');
        var statsEl = document.getElementById('karlineStats');
        var searchVal = document.getElementById('karlineSearch') ? document.getElementById('karlineSearch').value.toLowerCase() : '';
        var showStatic = document.getElementById('karlineShowStatic') ? document.getElementById('karlineShowStatic').checked : true;
        var showDynamic = document.getElementById('karlineShowDynamic') ? document.getElementById('karlineShowDynamic').checked : true;
        var statusFilter = document.getElementById('karlineStatusFilter') ? document.getElementById('karlineStatusFilter').value : 'all';

        if (!colContainer || !daysRow) return;

        var filtered = actions.filter(function (a) {
            if (searchVal && a.title.toLowerCase().indexOf(searchVal) === -1) return false;
            if (a.type === 'static' && !showStatic) return false;
            if (a.type === 'dynamic' && !showDynamic) return false;
            if (statusFilter !== 'all' && a.status !== statusFilter) return false;
            return true;
        });

        if (!filtered.length) {
            colContainer.innerHTML = '';
            daysRow.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'flex';
            if (timelineWrap) { var tl = timelineWrap.querySelector('#karlineTimeline'); if (tl) tl.style.display = 'none'; }
            if (actionList) actionList.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:0.8rem;">No actions</div>';
            if (statsEl) {
                var t = actions.length, v = actions.filter(function (a) { return a.zorVerified; }).length;
                statsEl.innerHTML = t + ' actions &middot; ' + v + ' verified';
            }
            return;
        }

        if (emptyEl) emptyEl.style.display = 'none';
        if (timelineWrap) { var tl = timelineWrap.querySelector('#karlineTimeline'); if (tl) tl.style.display = 'flex'; }

        // Date range
        var today = todayString();
        var startDate = addDays(today, weekOffset * NAV_DAYS);
        var endDate = addDays(startDate, NAV_DAYS - 1);

        // Extend range if actions fall outside
        filtered.forEach(function (a) {
            if (a.date < startDate) startDate = a.date;
            if (a.date > endDate) endDate = a.date;
        });

        var totalDays = daysBetween(startDate, endDate) + 1;
        var days = [];
        for (var i = 0; i < totalDays; i++) days.push(addDays(startDate, i));

        // Group cards by date
        var byDate = {};
        filtered.forEach(function (a) {
            var key = a.date;
            if (!byDate[key]) byDate[key] = [];
            byDate[key].push(a);
        });

        // Build day columns
        colContainer.innerHTML = '';
        var colWidth = Math.max(COL_W, Math.min(180, Math.floor((colContainer.parentElement ? colContainer.parentElement.offsetWidth - 16 : 1200) / totalDays)));
        if (colWidth < 90) colWidth = 90;

        days.forEach(function (d) {
            var col = document.createElement('div');
            col.className = 'karline-day-col';
            col.style.cssText = 'flex:1;min-width:' + colWidth + 'px;max-width:' + (colWidth + 20) + 'px;display:flex;flex-direction:column;gap:4px;padding:4px;';
            if (d === today) col.style.background = 'rgba(255,193,7,0.04)';

            var items = byDate[d] || [];
            items.sort(function (a, b) { return (a.endDate || a.date).localeCompare(b.endDate || b.date) || a.title.localeCompare(b.title); });

            items.forEach(function (a) {
                var verified = a.zorVerified;
                var s = a.status || 'draft';
                var color = STATUS_COLORS[s] || '#9e9e9e';
                var bg = STATUS_BGS[s] || 'rgba(158,158,158,0.08)';
                var border = STATUS_BORDERS[s] || 'rgba(158,158,158,0.2)';

                var card = document.createElement('div');
                card.style.cssText = 'background:' + bg + ';border:1px solid ' + border + ';border-radius:6px;padding:8px;cursor:pointer;'
                    + 'transition:box-shadow 0.15s,transform 0.1s;font-size:0.75rem;'
                    + (verified ? 'border-left:3px solid #4caf50;' : '')
                    + 'display:flex;flex-direction:column;gap:3px;user-select:none;';
                card.className = 'karline-card';

                var titleEl = document.createElement('div');
                titleEl.style.cssText = 'font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.78rem;';
                titleEl.textContent = a.title;
                card.appendChild(titleEl);

                var meta = document.createElement('div');
                meta.style.cssText = 'display:flex;gap:4px;align-items:center;font-size:0.65rem;color:var(--text-muted);flex-wrap:wrap;';
                meta.innerHTML = statusBadge(s)
                    + (a.endDate ? '<span>' + shortDate(a.date) + '\u2013' + shortDate(a.endDate) + '</span>' : '')
                    + (verified ? '<span style="color:#4caf50;margin-left:auto;"><i class="fas fa-check-circle" style="font-size:0.6rem;"></i></span>' : '');
                card.appendChild(meta);

                card.addEventListener('click', function () { showDetailModal(a); });
                card.addEventListener('contextmenu', function (e) { e.preventDefault(); showContextMenu(e, a); });
                card.addEventListener('mouseenter', function () { this.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)'; this.style.transform = 'translateY(-1px)'; });
                card.addEventListener('mouseleave', function () { this.style.boxShadow = 'none'; this.style.transform = 'none'; });

                col.appendChild(card);
            });

            if (!items.length) {
                var empty = document.createElement('div');
                empty.style.cssText = 'flex:1;min-height:60px;';
                col.appendChild(empty);
            }

            colContainer.appendChild(col);
        });

        // Days row
        daysRow.innerHTML = '';
        days.forEach(function (d) {
            var dayEl = document.createElement('div');
            dayEl.style.cssText = 'flex:1;min-width:' + colWidth + 'px;max-width:' + (colWidth + 20) + 'px;text-align:center;padding:6px 2px;font-size:0.7rem;color:var(--text-muted);border-left:1px solid rgba(255,255,255,0.04);';
            if (d === today) { dayEl.style.color = '#ffc107'; dayEl.style.fontWeight = '600'; }
            dayEl.innerHTML = '<div>' + shortDate(d) + '</div><div style="font-size:0.6rem;opacity:0.6;">' + dayName(d) + '</div>';
            daysRow.appendChild(dayEl);
        });

        // Range label
        var rangeEl = document.getElementById('karlineRange');
        if (rangeEl) rangeEl.textContent = formatDate(startDate) + ' \u2013 ' + formatDate(endDate);

        // Sidebar list
        if (actionList) {
            actionList.innerHTML = '';
            filtered.forEach(function (a) {
                var item = document.createElement('div');
                var sc = a.status || 'draft';
                var clr = STATUS_COLORS[sc] || '#9e9e9e';
                item.style.cssText = 'padding:6px 8px;border-radius:4px;cursor:pointer;font-size:0.76rem;display:flex;align-items:center;gap:6px;';
                item.style.background = (STATUS_BGS[sc] || 'rgba(158,158,158,0.04)');
                item.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;flex-shrink:0;background:' + clr + ';"></span>'
                    + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(a.title) + '</span>'
                    + (a.zorVerified ? '<span style="color:#4caf50;font-size:0.6rem;"><i class="fas fa-check-circle"></i></span>' : '')
                    + '<span style="color:var(--text-muted);font-size:0.65rem;">' + shortDate(a.date) + '</span>';
                item.addEventListener('click', function () { showDetailModal(a); });
                actionList.appendChild(item);
            });
        }

        // Stats
        if (statsEl) {
            var total = actions.length, verified = actions.filter(function (a) { return a.zorVerified; }).length;
            var sc = actions.filter(function (a) { return a.type === 'static'; }).length;
            var dc = actions.filter(function (a) { return a.type === 'dynamic'; }).length;
            var statusCounts = {};
            STATUSES.forEach(function (s) { statusCounts[s] = actions.filter(function (a) { return a.status === s; }).length; });
            var statusLine = STATUSES.map(function (s) { return '<span style="color:' + STATUS_COLORS[s] + ';">' + s + ': ' + statusCounts[s] + '</span>'; }).join(' &middot; ');
            statsEl.innerHTML = total + ' actions &middot; ' + verified + ' verified<br>' + sc + ' static, ' + dc + ' dynamic<br>' + statusLine;
        }
    }

    // ─── Init ─────────────────────────────────────────────────────────

    function init() {
        load();

        document.getElementById('karlineTrigger')?.addEventListener('click', function () { switchTab('karline'); });
        document.getElementById('karlineNewBtn')?.addEventListener('click', showNewActionModal);
        document.getElementById('karlineSearch')?.addEventListener('input', render);
        document.getElementById('karlineShowStatic')?.addEventListener('change', render);
        document.getElementById('karlineShowDynamic')?.addEventListener('change', render);
        document.getElementById('karlineStatusFilter')?.addEventListener('change', render);
        document.getElementById('karlinePrevBtn')?.addEventListener('click', function () { weekOffset--; render(); });
        document.getElementById('karlineNextBtn')?.addEventListener('click', function () { weekOffset++; render(); });
        document.getElementById('karlineTodayBtn')?.addEventListener('click', function () { weekOffset = 0; render(); });

        render();
    }

    window.pazatorKarline = {
        init: init,
        createAction: createAction,
        deleteAction: deleteAction,
        updateAction: updateAction,
        showDetailModal: showDetailModal,
        showNewActionModal: showNewActionModal,
        showEditActionModal: showEditActionModal,
        generatePdf: generatePdf,
        render: render,
        cancelEntityPicker: function () { if (_pickerResolve) { _pickerResolve([]); _pickerResolve = null; } },
        getActions: function () { return actions; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
