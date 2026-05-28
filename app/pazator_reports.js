(function () {
    'use strict';

    var STORAGE_KEY_TEMPLATES = 'pazator_report_templates';
    var STORAGE_KEY_SCHEDULES = 'pazator_report_schedules';
    var initialized = false;

    var templates = [];
    var schedules = [];
    var scheduleTimers = {};

    var WIDGET_TYPES = [
        { id: 'entity_count', label: 'Entity Count', icon: 'fa-database', desc: 'Count of entities by type' },
        { id: 'risk_pie', label: 'Risk Pie Chart', icon: 'fa-chart-pie', desc: 'Threat level distribution' },
        { id: 'recent_activity', label: 'Recent Activity', icon: 'fa-clock', desc: 'Latest data changes' },
        { id: 'table', label: 'Data Table', icon: 'fa-table', desc: 'Filterable entity table' },
        { id: 'tag_cloud', label: 'Tag Cloud', icon: 'fa-tags', desc: 'Most used tags' },
        { id: 'relationship_graph', label: 'Relationship Stats', icon: 'fa-network-wired', desc: 'Relationship type counts' }
    ];

    function load() {
        try { templates = JSON.parse(localStorage.getItem(STORAGE_KEY_TEMPLATES)) || []; } catch (e) { templates = []; }
        try { schedules = JSON.parse(localStorage.getItem(STORAGE_KEY_SCHEDULES)) || []; } catch (e) { schedules = []; }
    }

    function saveTemplates() { localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(templates)); }
    function saveSchedules() { localStorage.setItem(STORAGE_KEY_SCHEDULES, JSON.stringify(schedules)); }

    function init() {
        if (initialized) return;
        initialized = true;
        load();
        startSchedules();

        window.pazatorReports = {
            init: init,
            getTemplates: function () { return templates; },
            addTemplate: function (tpl) {
                tpl.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                tpl.createdAt = new Date().toISOString();
                tpl.updatedAt = tpl.createdAt;
                tpl.widgets = tpl.widgets || [];
                templates.push(tpl);
                saveTemplates();
                return tpl;
            },
            updateTemplate: function (id, data) {
                var t = templates.find(function (x) { return x.id === id; });
                if (t) { Object.assign(t, data); t.updatedAt = new Date().toISOString(); saveTemplates(); }
                return t;
            },
            removeTemplate: function (id) {
                templates = templates.filter(function (t) { return t.id !== id; });
                saveTemplates();
            },
            getSchedules: function () { return schedules; },
            addSchedule: function (s) {
                s.id = Date.now().toString(36);
                s.createdAt = new Date().toISOString();
                schedules.push(s);
                saveSchedules();
                startSchedule(s);
                return s;
            },
            removeSchedule: function (id) {
                schedules = schedules.filter(function (s) { return s.id !== id; });
                saveSchedules();
                if (scheduleTimers[id]) { clearInterval(scheduleTimers[id]); delete scheduleTimers[id]; }
            },
            getWidgetTypes: function () { return WIDGET_TYPES; },
            generateReport: generateReport,
            exportPDF: exportPDF,
            exportCSV: exportCSV
        };
    }

    function startSchedules() {
        schedules.forEach(startSchedule);
    }

    function startSchedule(s) {
        if (scheduleTimers[s.id]) return;
        if (s.type !== 'interval') return;
        var ms = parseInterval(s.interval || '1h');
        if (ms <= 0) return;
        scheduleTimers[s.id] = setInterval(function () {
            if (s.templateId) {
                var tpl = templates.find(function (t) { return t.id === s.templateId; });
                if (tpl) {
                    var format = s.format || 'csv';
                    if (format === 'pdf') exportPDF(tpl.id);
                    else exportCSV(tpl.id);
                }
            }
        }, ms);
    }

    function parseInterval(str) {
        var match = str.match(/^(\d+)\s*(s|m|h|d)$/);
        if (!match) return 3600000;
        var num = parseInt(match[1]);
        switch (match[2]) {
            case 's': return num * 1000;
            case 'm': return num * 60000;
            case 'h': return num * 3600000;
            case 'd': return num * 86400000;
            default: return 3600000;
        }
    }

    function generateReport(templateId) {
        var tpl = templates.find(function (t) { return t.id === templateId; });
        if (!tpl) return null;

        var data = {};
        var store = window.pazatorStore && window.pazatorStore._data;

        tpl.widgets.forEach(function (w) {
            switch (w.type) {
                case 'entity_count':
                    data[w.id] = {
                        humans: store ? store.humans.length : 0,
                        others: store ? store.others.length : 0,
                        cases: store ? store.cases.length : 0,
                        tags: store ? store.tags.length : 0,
                        chats: store ? store.chats.length : 0
                    };
                    break;
                case 'risk_pie':
                    if (store) {
                        var levels = { low: 0, medium: 0, high: 0, critical: 0 };
                        store.humans.forEach(function (h) {
                            var tl = (h.threatLevel || '').toLowerCase();
                            if (tl.indexOf('critical') !== -1) levels.critical++;
                            else if (tl.indexOf('high') !== -1) levels.high++;
                            else if (tl.indexOf('medium') !== -1) levels.medium++;
                            else levels.low++;
                        });
                        data[w.id] = levels;
                    }
                    break;
                case 'recent_activity':
                    data[w.id] = (window.pazatorCollab ? window.pazatorCollab.getAuditLog().slice(-20).reverse() : []);
                    break;
                case 'table':
                    data[w.id] = store ? store.humans.slice(0, 100) : [];
                    break;
                case 'tag_cloud':
                    if (store) {
                        var tagCounts = {};
                        store.humans.forEach(function (h) {
                            (h.tags || []).forEach(function (t) { tagCounts[t] = (tagCounts[t] || 0) + 1; });
                        });
                        data[w.id] = Object.keys(tagCounts).sort(function (a, b) { return tagCounts[b] - tagCounts[a]; }).slice(0, 30).map(function (k) { return { tag: k, count: tagCounts[k] }; });
                    }
                    break;
                case 'relationship_graph':
                    if (store && window.pazatorRelationships) {
                        var relCounts = {};
                        (store.relationships || []).forEach(function (r) {
                            var t = r.type || 'unknown';
                            relCounts[t] = (relCounts[t] || 0) + 1;
                        });
                        data[w.id] = relCounts;
                    }
                    break;
            }
        });

        return { template: tpl, data: data, generatedAt: new Date().toISOString() };
    }

    function exportPDF(templateId) {
        var report = generateReport(templateId);
        if (!report) {
            if (window.PazatorUI) PazatorUI.showFloatingNotification('Template not found', 'error', 2000);
            return;
        }

        if (typeof window.jspdf === 'undefined') {
            if (window.PazatorUI) PazatorUI.showFloatingNotification('jsPDF not loaded. PDF export unavailable.', 'error', 3000);
            return;
        }

        var doc = new window.jspdf.jsPDF();
        var y = 20;
        doc.setFontSize(16);
        doc.text(report.template.name || 'Report', 14, y);
        y += 10;
        doc.setFontSize(8);
        doc.text('Generated: ' + new Date(report.generatedAt).toLocaleString(), 14, y);
        y += 8;

        doc.setFontSize(10);
        Object.keys(report.data).forEach(function (widgetId) {
            if (y > 260) { doc.addPage(); y = 20; }
            var w = report.template.widgets.find(function (x) { return x.id === widgetId; });
            var label = w ? w.label : widgetId;
            doc.setFontSize(12);
            doc.text(label, 14, y);
            y += 6;
            doc.setFontSize(9);
            var d = report.data[widgetId];
            if (typeof d === 'object') {
                Object.keys(d).forEach(function (k) {
                    if (y > 270) { doc.addPage(); y = 20; }
                    doc.text(k + ': ' + d[k], 18, y);
                    y += 5;
                });
            }
            y += 4;
        });

        doc.save((report.template.name || 'report') + '.pdf');
        if (window.PazatorUI) PazatorUI.showFloatingNotification('PDF exported', 'success', 2000);
    }

    function exportCSV(templateId) {
        var report = generateReport(templateId);
        if (!report) {
            if (window.PazatorUI) PazatorUI.showFloatingNotification('Template not found', 'error', 2000);
            return;
        }

        var rows = [['Widget', 'Key', 'Value']];
        Object.keys(report.data).forEach(function (widgetId) {
            var w = report.template.widgets.find(function (x) { return x.id === widgetId; });
            var label = w ? w.label : widgetId;
            var d = report.data[widgetId];
            if (typeof d === 'object') {
                Object.keys(d).forEach(function (k) {
                    rows.push([label, k, d[k]]);
                });
            }
        });

        var csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
        var blob = new Blob([csv], { type: 'text/csv' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = (report.template.name || 'report') + '.csv';
        a.click();
        URL.revokeObjectURL(url);

        if (window.PazatorUI) PazatorUI.showFloatingNotification('CSV exported', 'success', 2000);
    }

    function renderReportBuilder(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        container.style.cssText = 'display:flex;flex-direction:column;gap:16px;padding:20px;flex:1;overflow-y:auto;';

        var intro = document.createElement('div');
        intro.style.cssText = 'padding:16px 20px;background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;';
        intro.innerHTML = '<div style="display:flex;align-items:flex-start;gap:14px;">' +
            '<div style="width:36px;height:36px;border-radius:8px;background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas fa-chart-bar" style="color:var(--text-secondary);font-size:1rem;"></i></div>' +
            '<div><div style="color:#fff;font-size:0.95rem;font-weight:500;">Advanced Reporting</div>' +
            '<div style="color:var(--text-muted);font-size:0.78rem;margin-top:6px;line-height:1.5;">Build report templates by adding data widgets (entity counts, risk charts, activity logs, etc.). Run reports to preview, export as PDF or CSV, or schedule automatic exports at any interval.</div></div></div>';
        container.appendChild(intro);

        var header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
        header.innerHTML = '<div style="color:var(--text-muted);font-size:0.78rem;">' + templates.length + ' template' + (templates.length !== 1 ? 's' : '') + '</div>' +
            '<button id="rptNewBtn" style="padding:8px 18px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;border-radius:6px;cursor:pointer;font-size:0.82rem;transition:all 0.2s;"><i class="fas fa-plus"></i> New Report</button>';
        container.appendChild(header);

        var templateList = document.createElement('div');
        templateList.id = 'rptTemplateList';
        templateList.style.cssText = 'flex:1;overflow-y:auto;';
        container.appendChild(templateList);

        renderTemplateList();
        document.getElementById('rptNewBtn').addEventListener('click', showTemplateEditor);
    }

    function renderTemplateList() {
        var list = document.getElementById('rptTemplateList');
        if (!list) return;
        list.innerHTML = '';
        if (!templates.length) {
            list.innerHTML = '<div style="text-align:center;padding:48px 20px;color:var(--text-muted);"><i class="fas fa-file-alt" style="font-size:2rem;color:#333;display:block;margin-bottom:12px;"></i><div style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:6px;">No report templates yet</div><div style="font-size:0.78rem;line-height:1.6;">Create a report template, add widgets to it (entity counts, risk charts, tables, tags, etc.), then run or export it anytime.<br>Click <strong>"New Report"</strong> to get started.</div></div>';
            return;
        }
        templates.forEach(function (tpl) {
            var card = document.createElement('div');
            card.style.cssText = 'padding:14px 16px;background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;margin-bottom:8px;display:flex;align-items:center;gap:12px;';
            card.innerHTML = '<div style="flex:1;"><div style="color:#fff;font-size:0.9rem;">' + (tpl.name || 'Unnamed Report') + '</div>' +
                '<div style="color:var(--text-muted);font-size:0.75rem;margin-top:4px;">' + tpl.widgets.length + ' widgets &middot; Updated ' + (tpl.updatedAt ? new Date(tpl.updatedAt).toLocaleDateString() : 'Never') + '</div></div>' +
                '<div style="display:flex;gap:6px;">' +
                '<button class="rpt-run-btn" data-id="' + tpl.id + '" style="padding:6px 12px;background:transparent;border:1px solid var(--border-color);color:var(--text-secondary);border-radius:4px;cursor:pointer;font-size:0.75rem;" title="Run Report"><i class="fas fa-play"></i></button>' +
                '<button class="rpt-export-pdf" data-id="' + tpl.id + '" style="padding:6px 12px;background:transparent;border:1px solid var(--border-color);color:var(--text-secondary);border-radius:4px;cursor:pointer;font-size:0.75rem;" title="Export PDF"><i class="fas fa-file-pdf"></i></button>' +
                '<button class="rpt-export-csv" data-id="' + tpl.id + '" style="padding:6px 12px;background:transparent;border:1px solid var(--border-color);color:var(--text-secondary);border-radius:4px;cursor:pointer;font-size:0.75rem;" title="Export CSV"><i class="fas fa-file-csv"></i></button>' +
                '<button class="rpt-schedule-btn" data-id="' + tpl.id + '" style="padding:6px 12px;background:transparent;border:1px solid var(--border-color);color:var(--text-secondary);border-radius:4px;cursor:pointer;font-size:0.75rem;" title="Schedule"><i class="fas fa-clock"></i></button>' +
                '<button class="rpt-del-btn" data-id="' + tpl.id + '" style="padding:6px 12px;background:transparent;border:1px solid rgba(255,100,100,0.3);color:var(--danger);border-radius:4px;cursor:pointer;font-size:0.75rem;" title="Delete"><i class="fas fa-trash"></i></button>' +
                '</div>';
            list.appendChild(card);

            card.querySelector('.rpt-run-btn').addEventListener('click', function () { showReportPreview(tpl.id); });
            card.querySelector('.rpt-export-pdf').addEventListener('click', function () { window.pazatorReports.exportPDF(tpl.id); });
            card.querySelector('.rpt-export-csv').addEventListener('click', function () { window.pazatorReports.exportCSV(tpl.id); });
            card.querySelector('.rpt-schedule-btn').addEventListener('click', function () { showScheduleEditor(tpl.id); });
            card.querySelector('.rpt-del-btn').addEventListener('click', function () {
                if (confirm('Delete report template "' + tpl.name + '"?')) {
                    window.pazatorReports.removeTemplate(tpl.id);
                    renderTemplateList();
                }
            });
        });
    }

    function showTemplateEditor(existingId) {
        var existing = existingId ? templates.find(function (t) { return t.id === existingId; }) : null;
        var modal = document.createElement('div');
        modal.id = 'rptEditorModal';
        modal.className = 'modal';
        modal.innerHTML = '<div class="modal-content" style="max-width:650px;">' +
            '<button class="close" style="position:absolute;top:10px;left:10px;z-index:1001;">&times;</button>' +
            '<div class="modal-header"><h2>' + (existing ? 'Edit Report' : 'New Report Template') + '</h2></div>' +
            '<div class="modal-body">' +
            '<div class="form-group"><label>Report Name</label><input type="text" id="rptName" class="form-control" value="' + (existing ? existing.name : '') + '" placeholder="My Report"></div>' +
            '<div class="form-group"><label>Description</label><textarea id="rptDesc" class="form-control" rows="2" placeholder="Optional description">' + (existing ? (existing.description || '') : '') + '</textarea></div>' +
            '<div class="form-group"><label>Widgets <span style="color:var(--text-muted);font-weight:400;font-size:0.75rem;">(click to add)</span></label>' +
            '<div id="rptWidgetPicker" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">' +
            WIDGET_TYPES.map(function (w) { return '<button class="rpt-add-widget" data-type="' + w.id + '" style="padding:5px 12px;background:rgba(255,255,255,0.05);border:1px solid var(--border-color);color:var(--text-secondary);border-radius:4px;cursor:pointer;font-size:0.75rem;"><i class="fas ' + w.icon + '"></i> ' + w.label + '</button>'; }).join('') +
            '</div>' +
            '<div id="rptWidgetList"></div>' +
            '</div>' +
            '</div>' +
            '<div class="form-actions-horizontal">' +
            '<button id="rptEditorCancel" class="btn-enhanced glass-btn">Cancel</button>' +
            '<button id="rptEditorSave" class="btn-enhanced btn-primary"><i class="fas fa-save"></i> Save Template</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(modal);
        setTimeout(function () { modal.classList.add('active'); }, 10);

        modal.querySelector('.close').addEventListener('click', close);
        modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
        function close() { modal.classList.remove('active'); setTimeout(function () { modal.remove(); }, 300); }

        var widgets = existing ? JSON.parse(JSON.stringify(existing.widgets)) : [];

        function renderWidgetList() {
            var list = document.getElementById('rptWidgetList');
            if (!list) return;
            list.innerHTML = '';
            if (!widgets.length) { list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:0.8rem;border:1px dashed var(--border-color);border-radius:6px;">No widgets added yet. Click a widget type above to add.</div>'; return; }
            widgets.forEach(function (w, i) {
                var wt = WIDGET_TYPES.find(function (x) { return x.id === w.type; });
                var el = document.createElement('div');
                el.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(255,255,255,0.03);border:1px solid var(--border-color);border-radius:6px;margin-bottom:4px;';
                el.innerHTML = '<span style="color:var(--text-secondary);font-size:0.8rem;">' + (i + 1) + '.</span>' +
                    '<span style="flex:1;color:#fff;font-size:0.85rem;">' + (wt ? wt.label : w.type) + '</span>' +
                    '<span style="color:var(--text-muted);font-size:0.7rem;">' + (w.label || '') + '</span>' +
                    '<button class="rpt-remove-widget" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:0.8rem;" data-index="' + i + '"><i class="fas fa-times"></i></button>';
                list.appendChild(el);
                el.querySelector('.rpt-remove-widget').addEventListener('click', function () {
                    widgets.splice(i, 1);
                    renderWidgetList();
                });
            });
        }

        renderWidgetList();

        modal.querySelectorAll('.rpt-add-widget').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var type = btn.dataset.type;
                var wt = WIDGET_TYPES.find(function (x) { return x.id === type; });
                widgets.push({ id: 'w_' + Date.now().toString(36) + '_' + widgets.length, type: type, label: wt ? wt.label : type });
                renderWidgetList();
            });
        });

        document.getElementById('rptEditorSave').addEventListener('click', function () {
            var name = document.getElementById('rptName').value.trim();
            var desc = document.getElementById('rptDesc').value.trim();
            if (!name) { alert('Report name is required.'); return; }
            var data = { name: name, description: desc, widgets: widgets };
            if (existing) {
                window.pazatorReports.updateTemplate(existing.id, data);
            } else {
                window.pazatorReports.addTemplate(data);
            }
            close();
            renderTemplateList();
            if (window.PazatorUI) PazatorUI.showFloatingNotification('Report ' + (existing ? 'updated' : 'created'), 'success', 2000);
        });

        document.getElementById('rptEditorCancel').addEventListener('click', close);
    }

    function showReportPreview(templateId) {
        var report = window.pazatorReports.generateReport(templateId);
        if (!report) return;

        var modal = document.createElement('div');
        modal.id = 'rptPreviewModal';
        modal.className = 'modal';
        modal.innerHTML = '<div class="modal-content" style="max-width:700px;max-height:80vh;">' +
            '<button class="close" style="position:absolute;top:10px;left:10px;z-index:1001;">&times;</button>' +
            '<div class="modal-header"><h2>' + (report.template.name || 'Report Preview') + '</h2></div>' +
            '<div class="modal-body" style="overflow-y:auto;max-height:60vh;">' +
            '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:16px;">Generated: ' + new Date(report.generatedAt).toLocaleString() + '</div>' +
            '<div id="rptPreviewContent"></div>' +
            '</div>' +
            '<div class="form-actions-horizontal">' +
            '<button id="rptPreviewPdf" class="btn-enhanced glass-btn"><i class="fas fa-file-pdf"></i> Export PDF</button>' +
            '<button id="rptPreviewCsv" class="btn-enhanced glass-btn"><i class="fas fa-file-csv"></i> Export CSV</button>' +
            '<button class="btn-enhanced btn-primary" onclick="this.closest(\'.modal\').classList.remove(\'active\');setTimeout(function(){this.closest(\'.modal\').remove();},300);">Close</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(modal);
        setTimeout(function () { modal.classList.add('active'); }, 10);
        modal.querySelector('.close').addEventListener('click', function () { modal.classList.remove('active'); setTimeout(function () { modal.remove(); }, 300); });
        modal.addEventListener('click', function (e) { if (e.target === modal) { modal.classList.remove('active'); setTimeout(function () { modal.remove(); }, 300); } });

        var content = document.getElementById('rptPreviewContent');
        if (!content) return;
        content.innerHTML = '';
        report.template.widgets.forEach(function (w) {
            var d = report.data[w.id];
            if (!d) return;
            var card = document.createElement('div');
            card.style.cssText = 'padding:12px;background:var(--card-bg);border:1px solid var(--border-color);border-radius:6px;margin-bottom:8px;';
            card.innerHTML = '<div style="color:#fff;font-size:0.85rem;margin-bottom:8px;">' + (w.label || 'Widget') + '</div>';
            var table = document.createElement('div');
            table.style.cssText = 'font-size:0.8rem;';
            Object.keys(d).forEach(function (k) {
                var row = document.createElement('div');
                row.style.cssText = 'display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04);';
                row.innerHTML = '<span style="color:var(--text-secondary);">' + k + '</span><span style="color:#fff;">' + d[k] + '</span>';
                table.appendChild(row);
            });
            card.appendChild(table);
            content.appendChild(card);
        });

        document.getElementById('rptPreviewPdf').addEventListener('click', function () { window.pazatorReports.exportPDF(templateId); });
        document.getElementById('rptPreviewCsv').addEventListener('click', function () { window.pazatorReports.exportCSV(templateId); });
    }

    function showScheduleEditor(templateId) {
        var tpl = templates.find(function (t) { return t.id === templateId; });
        if (!tpl) return;
        var existingSched = schedules.find(function (s) { return s.templateId === templateId; });

        var modal = document.createElement('div');
        modal.id = 'rptScheduleModal';
        modal.className = 'modal';
        modal.innerHTML = '<div class="modal-content" style="max-width:450px;">' +
            '<button class="close" style="position:absolute;top:10px;left:10px;z-index:1001;">&times;</button>' +
            '<div class="modal-header"><h2>Schedule Export</h2><p style="color:var(--text-muted);font-size:0.8rem;margin-top:4px;">' + tpl.name + '</p></div>' +
            '<div class="modal-body">' +
            '<div class="form-group"><label>Interval</label>' +
            '<select id="rptSchedInterval" class="form-control">' +
            '<option value="5m" ' + (existingSched && existingSched.interval === '5m' ? 'selected' : '') + '>Every 5 minutes</option>' +
            '<option value="15m" ' + (existingSched && existingSched.interval === '15m' ? 'selected' : '') + '>Every 15 minutes</option>' +
            '<option value="30m" ' + (existingSched && existingSched.interval === '30m' ? 'selected' : '') + '>Every 30 minutes</option>' +
            '<option value="1h" ' + (existingSched && existingSched.interval === '1h' ? 'selected' : '') + '>Every hour</option>' +
            '<option value="6h" ' + (existingSched && existingSched.interval === '6h' ? 'selected' : '') + '>Every 6 hours</option>' +
            '<option value="12h" ' + (existingSched && existingSched.interval === '12h' ? 'selected' : '') + '>Every 12 hours</option>' +
            '<option value="1d" ' + (existingSched && existingSched.interval === '1d' ? 'selected' : '') + '>Daily</option>' +
            '</select></div>' +
            '<div class="form-group"><label>Format</label>' +
            '<select id="rptSchedFormat" class="form-control">' +
            '<option value="csv" ' + (existingSched && existingSched.format === 'csv' ? 'selected' : '') + '>CSV</option>' +
            '<option value="pdf" ' + (existingSched && existingSched.format === 'pdf' ? 'selected' : '') + '>PDF</option>' +
            '</select></div>' +
            '<div id="rptSchedStatus" style="font-size:0.8rem;color:var(--text-muted);margin-top:8px;">' + (existingSched ? 'Scheduled: every ' + existingSched.interval : 'Not scheduled') + '</div>' +
            '</div>' +
            '<div class="form-actions-horizontal">' +
            '<button id="rptSchedRemove" class="btn-enhanced glass-btn" ' + (existingSched ? '' : 'style="display:none;"') + '><i class="fas fa-trash"></i> Remove Schedule</button>' +
            '<button id="rptSchedSave" class="btn-enhanced btn-primary"><i class="fas fa-clock"></i> ' + (existingSched ? 'Update' : 'Set Schedule') + '</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(modal);
        setTimeout(function () { modal.classList.add('active'); }, 10);
        modal.querySelector('.close').addEventListener('click', close);
        modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
        function close() { modal.classList.remove('active'); setTimeout(function () { modal.remove(); }, 300); }

        document.getElementById('rptSchedSave').addEventListener('click', function () {
            var interval = document.getElementById('rptSchedInterval').value;
            var format = document.getElementById('rptSchedFormat').value;
            if (existingSched) {
                existingSched.interval = interval;
                existingSched.format = format;
                saveSchedules();
            } else {
                window.pazatorReports.addSchedule({ templateId: templateId, type: 'interval', interval: interval, format: format });
            }
            close();
            if (window.PazatorUI) PazatorUI.showFloatingNotification('Schedule ' + (existingSched ? 'updated' : 'set'), 'success', 2000);
        });

        var removeBtn = document.getElementById('rptSchedRemove');
        if (removeBtn) {
            removeBtn.addEventListener('click', function () {
                if (existingSched) window.pazatorReports.removeSchedule(existingSched.id);
                close();
                if (window.PazatorUI) PazatorUI.showFloatingNotification('Schedule removed', 'info', 2000);
            });
        }
    }

    window.pazatorReports = { init: init, renderReportBuilder: renderReportBuilder };
})();
