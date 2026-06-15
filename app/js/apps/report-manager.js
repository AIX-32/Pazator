// ============================================================
// Analysis Report Manager — saved TIDE reports browser
// ============================================================
(function () {
    'use strict';

    var STORAGE_KEY = 'pazator_analysis_reports';
    var _data = null;
    var _initialized = false;
    var _selectedReportId = null;

    function init() {
        if (_initialized) return;
        _initialized = true;
        _load();
        window.pazatorReportManager = {
            init: init,
            render: render,
            saveTideReport: saveTideReport
        };
    }

    function _uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function _load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            _data = raw ? JSON.parse(raw) : null;
        } catch (e) { _data = null; }
        if (!_data || !_data.reports) {
            _data = { reports: [] };
        }
    }

    function _save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_data)); } catch (e) {}
    }

    function saveTideReport(analysisType, findings, summary) {
        if (!findings || !findings.length) return null;
        if (!_data) _load();
        try {
            var labels = {
                threat: 'Threat', risk: 'Risk', intel: 'Intel',
                fraud: 'Fraud', terrorist: 'Terrorist',
                connection: 'Connection', credit: 'Credit',
                multi: 'Intelligence Scan'
            };
            var label = labels[analysisType] || analysisType;
            var report = {
                id: _uid(),
                title: label + ' \u2014 ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                type: 'tide_analysis',
                analysisType: analysisType,
                createdAt: new Date().toISOString(),
                findingsCount: findings.length,
                summary: summary ? (summary.total + ' findings') : '',
                findings: findings
            };
            _data.reports.push(report);
            _save();
            console.log('[ReportManager] saved report:', report.title, 'total reports:', _data.reports.length);
            return report;
        } catch (e) {
            console.warn('[ReportManager] failed to save report:', e);
            return null;
        }
    }

    function render(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        _selectedReportId = null;

        var reports = _data.reports.slice().sort(function (a, b) {
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        var html =
            '<div class="sr-header">' +
            '  <h2><i class="fas fa-folder-open"></i> Saved Reports</h2>' +
            '  <span class="sr-count">' + reports.length + ' report' + (reports.length !== 1 ? 's' : '') + '</span>' +
            '</div>' +
            '<div class="sr-list" id="srList">';

        if (!reports.length) {
            html += '<div class="sr-empty">' +
                '  <i class="fas fa-file-alt"></i>' +
                '  <p>No saved reports yet</p>' +
                '  <small>Run TIDE analysis to generate reports</small>' +
                '</div>';
        } else {
            reports.forEach(function (r) {
                var typeColors = { threat: '#ff6b6b', risk: '#ffd93d', intel: '#8ab4f8', fraud: '#ff8c42', terrorist: '#ff4757', connection: '#6bcf7f', credit: '#4a9e5c', multi: '#8ab4f8' };
                var color = typeColors[r.analysisType] || '#888';
                html +=
                    '<div class="sr-item" data-id="' + r.id + '">' +
                    '  <div class="sr-item-bar" style="background:' + color + ';"></div>' +
                    '  <div class="sr-item-body">' +
                    '    <div class="sr-item-title">' + r.title + (window.pazatorClassification && r.classification ? window.pazatorClassification.getBadgeHTML(r) : '') + '</div>' +
                    '    <div class="sr-item-meta">' +
                    '      <span class="sr-item-type" style="color:' + color + ';">' + (r.analysisType || 'analysis') + '</span>' +
                    '      <span>' + new Date(r.createdAt).toLocaleDateString() + '</span>' +
                    '      <span>' + r.findingsCount + ' finding' + (r.findingsCount !== 1 ? 's' : '') + '</span>' +
                    '    </div>' +
                    '  </div>' +
                    '  <div class="sr-item-actions">' +
                    '    <button class="sr-item-cl" data-id="' + r.id + '" title="Classify"><i class="fas fa-shield-alt"></i></button>' +
                    '    <button class="sr-item-del" data-id="' + r.id + '" title="Delete"><i class="fas fa-trash"></i></button>' +
                    '  </div>' +
                    '</div>';
            });
        }

        html += '</div><div class="sr-view" id="srView" style="display:none;"></div>';

        container.innerHTML = html;
        _wireEvents();
    }

    function _showReport(id) {
        _selectedReportId = id;
        var report = _data.reports.find(function (r) { return r.id === id; });
        var view = document.getElementById('srView');
        var list = document.getElementById('srList');
        if (!view || !report) return;

        document.querySelectorAll('.sr-item').forEach(function (el) {
            el.classList.toggle('active', el.dataset.id === id);
        });

        list.style.display = 'none';
        view.style.display = 'block';

        var findingsHtml = '';
        if (report.findings && report.findings.length) {
            report.findings.forEach(function (f) {
                var typeIcon = { threat: 'fa-exclamation-triangle', risk: 'fa-shield-alt', connection: 'fa-link', positive: 'fa-check-circle', info: 'fa-info-circle' }[f.type] || 'fa-info-circle';
                var typeColors = { threat: '#ff6b6b', risk: '#ffd93d', connection: '#6bcf7f', positive: '#6bcf7f', info: '#8ab4f8' };
                var color = typeColors[f.type] || '#888';
                findingsHtml +=
                    '<div class="sr-finding" style="border-left:3px solid ' + color + ';">' +
                    '  <div class="sr-finding-hdr">' +
                    '    <span class="sr-finding-type" style="color:' + color + ';"><i class="fas ' + typeIcon + '"></i> ' + (f.type || 'Info') + '</span>' +
                    '    <span class="sr-finding-subject">' + (f.subject || '') + '</span>' +
                    '  </div>' +
                    '  <div class="sr-finding-body">' + (f.content || f.description || '') + '</div>' +
                    (f.evidence ? '<div class="sr-finding-evidence"><i class="fas fa-fingerprint"></i> ' + f.evidence + '</div>' : '') +
                    '  <div class="sr-finding-tags">' + (f.tags || []).map(function (t) { return '<span class="sr-tag">' + t + '</span>'; }).join('') + '</div>' +
                    '</div>';
            });
        } else {
            findingsHtml = '<div class="sr-empty"><p>No details available</p></div>';
        }

        view.innerHTML =
            '<div class="sr-view-hdr">' +
            '  <button class="sr-back-btn" id="srBackBtn"><i class="fas fa-arrow-left"></i> Back</button>' +
            '  <h3>' + report.title + '</h3>' +
            '</div>' +
            '<div class="sr-view-meta">' +
            '  <span>Type: <strong>' + (report.analysisType || 'analysis') + '</strong></span>' +
            '  <span>Date: <strong>' + new Date(report.createdAt).toLocaleString() + '</strong></span>' +
            '  <span>Findings: <strong>' + report.findingsCount + '</strong></span>' +
            '</div>' +
            '<div class="sr-view-findings">' + findingsHtml + '</div>';

        document.getElementById('srBackBtn')?.addEventListener('click', function () {
            _selectedReportId = null;
            view.innerHTML = '';
            view.style.display = 'none';
            list.style.display = 'block';
        });
    }

    function _wireEvents() {
        document.querySelectorAll('.sr-item').forEach(function (el) {
            el.addEventListener('click', function (e) {
                if (e.target.closest('.sr-item-del')) return;
                _showReport(el.dataset.id);
            });
        });

        document.querySelectorAll('.sr-item-del').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.stopPropagation();
                var id = el.dataset.id;
                if (!confirm('Delete this report?')) return;
                _data.reports = _data.reports.filter(function (r) { return r.id !== id; });
                _save();
                render('savedReportsContent');
            });
        });

        document.querySelectorAll('.sr-item-cl').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.stopPropagation();
                var id = el.dataset.id;
                var report = _data.reports.find(function (r) { return r.id === id; });
                if (!report || !window.pazatorClassification) return;
                var username = window.pazatorSync ? window.pazatorSync.getCurrentUser()?.username || 'local' : 'local';
                window.pazatorClassification.showClassifyModal(report, 'report', function (levelId) {
                    if (levelId === 'unclassified') {
                        delete report.classification;
                    } else {
                        report.classification = {
                            level: levelId,
                            classifiedBy: username,
                            classifiedAt: new Date().toISOString()
                        };
                    }
                    _save();
                    render('savedReportsContent');
                });
            });
        });
    }

    window.pazatorReportManager = { init: init, render: render, saveTideReport: saveTideReport };
})();

function switchReportsView(view) {
    document.querySelectorAll('.reports-subnav-btn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.view === view);
    });
    var builderEl = document.getElementById('reportsTabContent');
    var savedEl = document.getElementById('savedReportsContent');
    var logbookEl = document.getElementById('logbookContent');
    if (view === 'saved') {
        if (builderEl) builderEl.style.display = 'none';
        if (logbookEl) logbookEl.style.display = 'none';
        if (savedEl) {
            savedEl.style.display = 'flex';
            if (window.pazatorReportManager) {
                window.pazatorReportManager.init();
                window.pazatorReportManager.render('savedReportsContent');
            } else {
                var s = document.createElement('script');
                s.src = 'js/apps/report-manager.js';
                s.onload = function () {
                    if (window.pazatorReportManager) {
                        window.pazatorReportManager.init();
                        window.pazatorReportManager.render('savedReportsContent');
                    }
                };
                document.body.appendChild(s);
            }
        }
    } else if (view === 'logbook') {
        if (builderEl) builderEl.style.display = 'none';
        if (savedEl) savedEl.style.display = 'none';
        if (logbookEl) {
            logbookEl.style.display = 'flex';
            if (window.pazatorLogbook) {
                window.pazatorLogbook.render('logbookContent');
            } else {
                var s = document.createElement('script');
                s.src = 'js/apps/logbook.js';
                s.onload = function () {
                    if (window.pazatorLogbook) window.pazatorLogbook.render('logbookContent');
                };
                document.body.appendChild(s);
            }
        }
    } else {
        if (savedEl) savedEl.style.display = 'none';
        if (logbookEl) logbookEl.style.display = 'none';
        if (builderEl) builderEl.style.display = 'flex';
    }
}
