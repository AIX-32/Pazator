(function () {
    'use strict';

    var WIDGET_TYPES = {
        'entity-count': { label: 'Entity Count', icon: 'fa-database', defaultW: 1, defaultH: 1 },
        'risk-pie': { label: 'Risk Distribution', icon: 'fa-chart-pie', defaultW: 1, defaultH: 2 },
        'activity-feed': { label: 'Recent Activity', icon: 'fa-rss', defaultW: 1, defaultH: 2 },
        'graph-snapshot': { label: 'Graph Snapshot', icon: 'fa-project-diagram', defaultW: 2, defaultH: 2 },
        'case-status': { label: 'Case Status', icon: 'fa-folder-open', defaultW: 1, defaultH: 1 },
        'threat-timeline': { label: 'Threat Timeline', icon: 'fa-shield-alt', defaultW: 2, defaultH: 1 },
        'ai-insights': { label: 'AI Insights', icon: 'fa-brain', defaultW: 1, defaultH: 2 }
    };

    var DEFAULT_LAYOUT = [
        { id: 'w-entity-count', type: 'entity-count', left: 0, top: 0, width: 280, height: 160 },
        { id: 'w-risk-pie', type: 'risk-pie', left: 292, top: 0, width: 280, height: 332 },
        { id: 'w-graph-snapshot', type: 'graph-snapshot', left: 0, top: 172, width: 572, height: 332 },
        { id: 'w-case-status', type: 'case-status', left: 584, top: 0, width: 280, height: 160 },
        { id: 'w-threat-timeline', type: 'threat-timeline', left: 0, top: 516, width: 572, height: 160 },
        { id: 'w-activity-feed', type: 'activity-feed', left: 584, top: 172, width: 280, height: 332 },
        { id: 'w-ai-insights', type: 'ai-insights', left: 584, top: 516, width: 280, height: 332 }
    ];

    var LAYOUT_KEY = 'dashboardLayout';

    var layout = [];
    var dragState = null;
    var dragCurrentEl = null;

    function init() {
        wireToolbar();
        loadLayout(function () {
            if (!layout || layout.length === 0) {
                layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
                saveLayout();
            }
            render();
        });
    }

    function wireToolbar() {
        var addBtn = document.getElementById('dashAddBtn');
        var addMenu = document.getElementById('dashAddMenu');
        var resetBtn = document.getElementById('dashResetBtn');
        var refreshBtn = document.getElementById('dashRefreshBtn');

        if (addBtn && addMenu) {
            var types = getAvailableWidgetTypes();
            addMenu.innerHTML = types.map(function (t) {
                return '<div class="dash-add-menu-item" data-type="' + t.id + '"><i class="fas ' + t.icon + '"></i> ' + t.label + '</div>';
            }).join('');

            addBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                addMenu.classList.toggle('open');
            });

            addMenu.addEventListener('click', function (e) {
                var item = e.target.closest('.dash-add-menu-item');
                if (!item) return;
                var type = item.dataset.type;
                addWidget(type);
                addMenu.classList.remove('open');
            });

            document.addEventListener('click', function () {
                addMenu.classList.remove('open');
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                resetLayout();
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', function () {
                refresh();
            });
        }
    }

    function loadLayout(cb) {
        if (window.pazatorEngine && window.pazatorEngine.isReady()) {
            window.pazatorEngine.get('meta', LAYOUT_KEY).then(function (val) {
                if (val && val.widgets) {
                    layout = val.widgets;
                }
                if (cb) cb();
            }).catch(function () {
                if (cb) cb();
            });
        } else {
            try {
                var saved = localStorage.getItem('pazator_' + LAYOUT_KEY);
                if (saved) layout = JSON.parse(saved);
            } catch (e) { layout = []; }
            if (cb) cb();
        }
    }

    function saveLayout() {
        var data = { id: LAYOUT_KEY, widgets: layout };
        if (window.pazatorEngine && window.pazatorEngine.isReady()) {
            window.pazatorEngine.put('meta', data).catch(function () {});
        }
        try {
            localStorage.setItem('pazator_' + LAYOUT_KEY, JSON.stringify(layout));
        } catch (e) {}
    }

    function render() {
        var container = document.getElementById('dashboardGrid');
        if (!container) return;

        container.innerHTML = '';
        container.style.position = 'relative';

        layout.forEach(function (w) {
            var card = createWidget(w);
            if (card) container.appendChild(card);
        });

        refreshAllWidgets();
    }



    function createWidget(w) {
        var def = WIDGET_TYPES[w.type];
        if (!def) return null;

        var el = document.createElement('div');
        el.className = 'dash-widget';
        el.id = w.id;
        el.dataset.widgetId = w.id;
        el.style.position = 'absolute';
        el.style.left = w.left + 'px';
        el.style.top = w.top + 'px';
        el.style.width = w.width + 'px';
        el.style.height = w.height + 'px';

        var header = document.createElement('div');
        header.className = 'dash-widget-header';

        var titleGroup = document.createElement('div');
        titleGroup.className = 'dash-widget-title-group';

        var icon = document.createElement('i');
        icon.className = 'fas ' + def.icon;
        titleGroup.appendChild(icon);

        var title = document.createElement('span');
        title.textContent = def.label;
        titleGroup.appendChild(title);

        header.appendChild(titleGroup);

        var controls = document.createElement('div');
        controls.className = 'dash-widget-controls';

        var resizeBtn = document.createElement('button');
        resizeBtn.className = 'dash-widget-resize-btn';
        resizeBtn.innerHTML = '<i class="fas fa-expand"></i>';
        resizeBtn.title = 'Toggle size';
        resizeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            cycleWidgetSize(w.id);
        });
        controls.appendChild(resizeBtn);

        var removeBtn = document.createElement('button');
        removeBtn.className = 'dash-widget-remove-btn';
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.title = 'Remove widget';
        removeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            removeWidget(w.id);
        });
        controls.appendChild(removeBtn);

        header.appendChild(controls);
        el.appendChild(header);

        var body = document.createElement('div');
        body.className = 'dash-widget-body';
        body.id = 'dash-body-' + w.id;
        el.appendChild(body);

        el.addEventListener('mousedown', function (e) {
            if (e.target.closest('button')) return;
            startDrag(e, w, el);
        });

        return el;
    }

    function startDrag(e, w, el) {
        dragState = {
            id: w.id,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startLeft: w.left,
            startTop: w.top
        };
        dragCurrentEl = el;
        el.classList.add('dash-dragging');
        el.style.zIndex = 1000;

        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
        e.preventDefault();
    }

    function onDragMove(e) {
        if (!dragState || !dragCurrentEl) return;
        var dx = e.clientX - dragState.startMouseX;
        var dy = e.clientY - dragState.startMouseY;
        var newLeft = Math.max(0, dragState.startLeft + dx);
        var newTop = Math.max(0, dragState.startTop + dy);

        dragCurrentEl.style.left = newLeft + 'px';
        dragCurrentEl.style.top = newTop + 'px';

        var wi = layout.find(function (wi) { return wi.id === dragState.id; });
        if (wi) {
            wi.left = newLeft;
            wi.top = newTop;
        }
    }

    function onDragEnd() {
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        if (dragCurrentEl) {
            dragCurrentEl.classList.remove('dash-dragging');
            dragCurrentEl.style.zIndex = '';
        }
        if (dragState) {
            saveLayout();
        }
        dragState = null;
        dragCurrentEl = null;
    }

    function cycleWidgetSize(widgetId) {
        var w = layout.find(function (wi) { return wi.id === widgetId; });
        if (!w) return;

        var sizes = [
            { width: 280, height: 160 },
            { width: 280, height: 332 },
            { width: 572, height: 160 },
            { width: 572, height: 332 }
        ];
        var idx = sizes.findIndex(function (s) { return s.width === w.width && s.height === w.height; });
        var next = sizes[(idx + 1) % sizes.length];

        w.width = next.width;
        w.height = next.height;

        saveLayout();
        render();
    }

    function removeWidget(widgetId) {
        var idx = layout.findIndex(function (w) { return w.id === widgetId; });
        if (idx === -1) return;
        layout.splice(idx, 1);
        saveLayout();
        render();
    }

    function addWidget(type) {
        var def = WIDGET_TYPES[type];
        var offset = (layout.length % 8) * 24;
        var width = def.defaultW === 2 ? 572 : 280;
        var height = def.defaultH === 2 ? 332 : 160;

        var id = 'w-' + type + '-' + Date.now();
        layout.push({
            id: id,
            type: type,
            left: 20 + offset,
            top: 20 + offset,
            width: width,
            height: height
        });

        saveLayout();
        render();
    }

    function refreshAllWidgets() {
        var data = gatherData();
        layout.forEach(function (w) {
            renderWidget(w, data);
        });
    }

    function gatherData() {
        var humans = (window.pazatorStore ? window.pazatorStore.getData().humans : window.pazatorData ? window.pazatorData.humans : []) || [];
        var others = (window.pazatorStore ? window.pazatorStore.getData().others : window.pazatorData ? window.pazatorData.others : []) || [];
        var tags = window.tags || [];
        var cases = window.cases || [];

        var threatCounts = { None: 0, Low: 0, Medium: 0, High: 0, Critical: 0 };
        humans.forEach(function (h) {
            var t = h.threatLevel || 'None';
            threatCounts[t] = (threatCounts[t] || 0) + 1;
        });

        var creditRisk = { high: 0, medium: 0, low: 0 };
        humans.forEach(function (h) {
            var c = h.credit || 185;
            if (c < 125) creditRisk.high++;
            else if (c < 250) creditRisk.medium++;
            else creditRisk.low++;
        });

        var caseStatuses = {};
        cases.forEach(function (c) {
            var s = c.status || 'open';
            caseStatuses[s] = (caseStatuses[s] || 0) + 1;
        });

        var recentActivity = [];
        var allItems = humans.concat(others).concat(cases);
        allItems.forEach(function (item) {
            var ts = item.createdAt || item.updatedAt || item.timestamp;
            if (ts) {
                recentActivity.push({
                    id: item.id,
                    name: item.name || item.title || 'Unknown',
                    type: item.type || (item.birthDate ? 'human' : 'entity'),
                    timestamp: ts
                });
            }
        });
        recentActivity.sort(function (a, b) { return b.timestamp - a.timestamp; });
        recentActivity = recentActivity.slice(0, 20);

        var analyses = [];
        if (window.analysesStore) {
            analyses = window.analysesStore.slice().sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 10);
        }

        return {
            humans: humans,
            others: others,
            tags: tags,
            cases: cases,
            threatCounts: threatCounts,
            creditRisk: creditRisk,
            caseStatuses: caseStatuses,
            recentActivity: recentActivity,
            analyses: analyses
        };
    }

    function renderWidget(w, data) {
        var body = document.getElementById('dash-body-' + w.id);
        if (!body) return;

        switch (w.type) {
            case 'entity-count': renderEntityCount(body, data); break;
            case 'risk-pie': renderRiskPie(body, data); break;
            case 'activity-feed': renderActivityFeed(body, data); break;
            case 'graph-snapshot': renderGraphSnapshot(body, data); break;
            case 'case-status': renderCaseStatus(body, data); break;
            case 'threat-timeline': renderThreatTimeline(body, data); break;
            case 'ai-insights': renderAIInsights(body, data); break;
            default:
                body.innerHTML = '<div class="dash-widget-empty">Unknown widget type</div>';
        }
    }

    function renderEntityCount(body, data) {
        body.innerHTML =
            '<div class="dash-metric-grid">' +
            '  <div class="dash-metric"><span class="dash-metric-value dash-metric-green">' + data.humans.length + '</span><span class="dash-metric-label">People</span></div>' +
            '  <div class="dash-metric"><span class="dash-metric-value dash-metric-blue">' + data.others.length + '</span><span class="dash-metric-label">Entities</span></div>' +
            '  <div class="dash-metric"><span class="dash-metric-value dash-metric-yellow">' + data.cases.length + '</span><span class="dash-metric-label">Cases</span></div>' +
            '  <div class="dash-metric"><span class="dash-metric-value dash-metric-purple">' + data.tags.length + '</span><span class="dash-metric-label">Tags</span></div>' +
            '</div>';
    }

    function renderRiskPie(body, data) {
        var total = data.humans.length || 1;
        var segments = [
            { label: 'High', count: data.creditRisk.high, color: '#ff6b6b', pct: Math.round(data.creditRisk.high / total * 100) },
            { label: 'Medium', count: data.creditRisk.medium, color: '#ffd93d', pct: Math.round(data.creditRisk.medium / total * 100) },
            { label: 'Low', count: data.creditRisk.low, color: '#6bcf7f', pct: Math.round(data.creditRisk.low / total * 100) }
        ];

        var conic = segments.map(function (s) { return s.color + ' 0 ' + s.pct + '%'; }).join(', ');

        body.innerHTML =
            '<div class="dash-pie-container">' +
            '  <div class="dash-pie" style="background: conic-gradient(' + conic + ');"></div>' +
            '  <div class="dash-pie-legend">' +
            segments.map(function (s) {
                return '<div class="dash-pie-item"><span class="dash-pie-dot" style="background:' + s.color + '"></span>' + s.label + ' <strong>' + s.count + '</strong></div>';
            }).join('') +
            '  </div>' +
            '</div>';
    }

    function renderActivityFeed(body, data) {
        if (data.recentActivity.length === 0) {
            body.innerHTML = '<div class="dash-widget-empty">No recent activity</div>';
            return;
        }

        var html = '<div class="dash-feed">';
        data.recentActivity.slice(0, 12).forEach(function (item) {
            var icon = item.type === 'human' ? 'fa-user' : item.type === 'case' ? 'fa-folder' : 'fa-building';
            html +=
                '<div class="dash-feed-item">' +
                '  <i class="fas ' + icon + ' dash-feed-icon"></i>' +
                '  <div class="dash-feed-content">' +
                '    <span class="dash-feed-name">' + (item.name || 'Unknown') + '</span>' +
                '    <span class="dash-feed-time">' + formatTime(item.timestamp) + '</span>' +
                '  </div>' +
                '</div>';
        });
        html += '</div>';
        body.innerHTML = html;
    }

    function renderGraphSnapshot(body, data) {
        if (data.humans.length === 0 && data.others.length === 0) {
            body.innerHTML = '<div class="dash-widget-empty">Add data to see the graph</div>';
            return;
        }

        var total = data.humans.length + data.others.length;
        var highRisk = data.humans.filter(function (h) { return (h.threatLevel || 'None') === 'High' || (h.threatLevel || 'None') === 'Critical'; }).length;
        var relCount = 0;
        if (window.pazatorRelationships) {
            try { relCount = window.pazatorRelationships.toJSON().length; } catch (e) {}
        }

        body.innerHTML =
            '<div class="dash-graph-snapshot">' +
            '  <div class="dash-graph-viz" id="dashMiniGraph"></div>' +
            '  <div class="dash-graph-info">' +
            '    <span><i class="fas fa-circle" style="color:#4d9de0;font-size:8px;"></i> ' + total + ' nodes</span>' +
            '    <span><i class="fas fa-minus" style="color:#a29bfe;font-size:10px;"></i> ' + relCount + ' edges</span>' +
            '    <span class="dash-risk-badge">' + highRisk + ' high risk</span>' +
            '  </div>' +
            '</div>';

        renderMiniGraph(data);
    }

    function renderMiniGraph(data) {
        var container = document.getElementById('dashMiniGraph');
        if (!container) return;

        var canvas = document.createElement('canvas');
        canvas.width = container.clientWidth || 200;
        canvas.height = container.clientHeight || 100;
        container.innerHTML = '';
        container.appendChild(canvas);

        var ctx = canvas.getContext('2d');
        var w = canvas.width, h = canvas.height;

        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(0, 0, w, h);

        var nodes = [];
        var humans = data.humans.slice(0, 30);
        var others = data.others.slice(0, 15);

        humans.forEach(function (h) {
            nodes.push({ x: Math.random() * w, y: Math.random() * h, r: 4, color: '#4d9de0' });
        });
        others.forEach(function () {
            nodes.push({ x: Math.random() * w, y: Math.random() * h, r: 3, color: '#a29bfe' });
        });

        for (var i = 0; i < nodes.length; i++) {
            for (var j = i + 1; j < nodes.length; j++) {
                var dx = nodes[i].x - nodes[j].x;
                var dy = nodes[i].y - nodes[j].y;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 60) {
                    ctx.beginPath();
                    ctx.moveTo(nodes[i].x, nodes[i].y);
                    ctx.lineTo(nodes[j].x, nodes[j].y);
                    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }

        nodes.forEach(function (n) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
            ctx.fillStyle = n.color;
            ctx.fill();
        });
    }

    function renderCaseStatus(body, data) {
        var total = data.cases.length || 1;
        var statuses = data.caseStatuses;
        var allStatuses = ['open', 'in-progress', 'closed'];
        var html = '<div class="dash-metric-grid">';

        allStatuses.forEach(function (s) {
            var count = statuses[s] || 0;
            var pct = Math.round(count / total * 100);
            var color = s === 'open' ? '#ff6b6b' : s === 'in-progress' ? '#ffd93d' : '#6bcf7f';
            html +=
                '<div class="dash-metric">' +
                '  <span class="dash-metric-value" style="color:' + color + ';">' + count + '</span>' +
                '  <span class="dash-metric-label">' + s.charAt(0).toUpperCase() + s.slice(1) + '</span>' +
                '  <div class="dash-bar-track"><div class="dash-bar-fill" style="width:' + pct + '%;background:' + color + ';"></div></div>' +
                '</div>';
        });

        html += '</div>';
        body.innerHTML = html;
    }

    function renderThreatTimeline(body, data) {
        var highRisk = data.humans.filter(function (h) { return (h.threatLevel || 'None') === 'High' || (h.threatLevel || 'None') === 'Critical'; });
        var midRisk = data.humans.filter(function (h) { return h.threatLevel === 'Medium'; });

        var html = '<div class="dash-threat-timeline">';

        if (highRisk.length === 0 && midRisk.length === 0) {
            html += '<div class="dash-widget-empty">No threats detected</div>';
        } else {
            var threats = highRisk.concat(midRisk).slice(0, 8);
            threats.forEach(function (h) {
                var level = h.threatLevel || 'None';
                var color = level === 'Critical' ? '#ff4444' : level === 'High' ? '#ff6b6b' : '#ffd93d';
                html +=
                    '<div class="dash-threat-item">' +
                    '  <span class="dash-threat-dot" style="background:' + color + ';"></span>' +
                    '  <span class="dash-threat-name">' + (h.name || 'Unknown') + '</span>' +
                    '  <span class="dash-threat-level" style="color:' + color + ';">' + level + '</span>' +
                    '</div>';
            });
        }

        html += '</div>';
        body.innerHTML = html;
    }

    function renderAIInsights(body, data) {
        if (data.analyses.length === 0) {
            body.innerHTML = '<div class="dash-widget-empty">No AI analyses yet. Run AI agents from the Intelligence tab.</div>';
            return;
        }

        var html = '<div class="dash-insights">';
        data.analyses.slice(0, 6).forEach(function (a) {
            var icon = a.type === 'threat' ? 'fa-exclamation-triangle' : a.type === 'fraud' ? 'fa-shield-alt' : 'fa-brain';
            var color = a.type === 'threat' ? '#ff6b6b' : a.type === 'fraud' ? '#ffd93d' : '#a29bfe';
            html +=
                '<div class="dash-insight-item">' +
                '  <i class="fas ' + icon + '" style="color:' + color + ';"></i>' +
                '  <div class="dash-insight-content">' +
                '    <span class="dash-insight-title">' + (a.title || 'Analysis') + '</span>' +
                '    <span class="dash-insight-time">' + formatTime(a.createdAt) + '</span>' +
                '  </div>' +
                '</div>';
        });
        html += '</div>';
        body.innerHTML = html;
    }

    function formatTime(ts) {
        if (!ts) return '';
        try {
            var d = new Date(ts);
            var now = new Date();
            var diff = now - d;
            if (diff < 60000) return 'just now';
            if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
            if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
            return d.toLocaleDateString();
        } catch (e) {
            return '';
        }
    }

    function refresh() {
        refreshAllWidgets();
    }

    function resetLayout() {
        layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
        saveLayout();
        render();
    }

    function getAvailableWidgetTypes() {
        return Object.keys(WIDGET_TYPES).map(function (k) {
            return { id: k, label: WIDGET_TYPES[k].label, icon: WIDGET_TYPES[k].icon };
        });
    }

    window.pazatorDashboard = {
        init: init,
        render: render,
        refresh: refresh,
        addWidget: addWidget,
        removeWidget: removeWidget,
        resetLayout: resetLayout,
        getAvailableWidgetTypes: getAvailableWidgetTypes,
        saveLayout: saveLayout,
        cycleWidgetSize: cycleWidgetSize
    };
})();
