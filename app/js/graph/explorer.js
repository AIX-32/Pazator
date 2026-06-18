(function () {
    'use strict';

    var N = new Map();
    var L = [];
    var edgeSet = new Set();  // ponytail: O(1) edge dedup instead of O(n) scan
    var sim, svg, grp, zoom, ctr, sel, initd;
    var inputEl, resultsEl;
    var info = {};
    var freezeSim = false;
    var _path = null;
    var _roTick = null;

    var TC = { Person: '#888', Organization: '#aaa', Location: '#666', Unknown: '#555' };
    var TH = { Critical: '#fff', High: '#ddd', Medium: '#bbb', Low: '#999', None: '#777' };
    var EC = { friend: '#666', family: '#777', associate: '#888', employer: '#999', employee: '#aaa', owns: '#555', communicates: '#666', known: '#777', collaborator: '#888', location_shared: '#999', relative: '#aaa' };
    var EW = { friend: 1.5, family: 2, associate: 1, employer: 1.5, employee: 1.5, owns: 1, communicates: 1, known: 0.8, collaborator: 1.5, location_shared: 1, relative: 2 };

    var MAX_NODES = 1/0; // ponytail: unlimited — remove if perf becomes an issue

    function isFn(f) { return typeof f === 'function'; }

    function byId(id) { return document.getElementById(id); }

    function getObj(id) {
        return window.pazatorStore && isFn(window.pazatorStore.getObjectById) ? window.pazatorStore.getObjectById(id) : null;
    }

    function getRelated(id) {
        return window.pazatorStore && isFn(window.pazatorStore.getRelatedObjects) ? window.pazatorStore.getRelatedObjects(id) : [];
    }

    var _link, _node, _label;

    function init(containerEl) {
        if (initd) return;
        ctr = containerEl;
        if (!d3) { console.error('[Explorer] D3 not loaded'); return; }

        svg = d3.select(containerEl).append('svg').attr('class', 'explorer-svg').style('background', 'transparent');

        zoom = d3.zoom().scaleExtent([0.05, 8]).filter(function (event) { return event.type !== 'dblclick'; }).on('zoom', zoomed);
        svg.call(zoom).on('click', function () { select(null); });

        var defs = svg.append('defs');
        for (var t in EC) {
            if (EC.hasOwnProperty(t)) {
                defs.append('marker').attr('id', 'a-' + t).attr('viewBox', '0 -5 10 10').attr('refX', 26).attr('refY', 0).attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto').append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', EC[t]);
            }
        }
        defs.append('marker').attr('id', 'a-default').attr('viewBox', '0 -5 10 10').attr('refX', 26).attr('refY', 0).attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto').append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#555');

        grp = svg.append('g');

        sim = d3.forceSimulation().force('link', d3.forceLink().id(function (d) { return d.id; }).distance(80)).force('charge', d3.forceManyBody().strength(-200)).force('center', d3.forceCenter(1, 1)).force('collide', d3.forceCollide(28)).on('tick', tick);
        // ponytail: static force distance/strength, tune if graph consistently clumps or explodes

        inputEl = byId('explorerSearch');
        resultsEl = byId('explorerSearchResults');
        if (inputEl) {
            inputEl.addEventListener('input', onSearch);
            inputEl.addEventListener('blur', function () { setTimeout(function () { if (resultsEl) resultsEl.style.display = 'none'; }, 200); });
            inputEl.addEventListener('focus', function () { if (inputEl.value) onSearch(); });
        }

        var clearBtn = byId('explorerClearBtn');
        if (clearBtn) clearBtn.addEventListener('click', clear);

        var resetBtn = byId('explorerResetBtn');
        if (resetBtn) resetBtn.addEventListener('click', resetView);

        var loadAllBtn = byId('explorerLoadAllBtn');
        if (loadAllBtn) loadAllBtn.addEventListener('click', loadAll);

        var pathBtn = byId('explorerPathBtn');
        if (pathBtn) pathBtn.addEventListener('click', showPathfindingModal);

        info.name = byId('explorerInfoName');
        info.meta = byId('explorerInfoMeta');
        info.threat = byId('explorerInfoThreat');
        info.credit = byId('explorerInfoCredit');
        info.connections = byId('explorerInfoConnections');
        info.body = byId('explorerInfoBody');
        info.placeholder = byId('explorerInfoPlaceholder');
        var expandBtn = byId('explorerInfoExpand');
        var openBtn = byId('explorerInfoOpen');
        var removeBtn = byId('explorerInfoRemove');

        if (expandBtn) expandBtn.addEventListener('click', function () { if (sel) addEntity(sel); });
        if (removeBtn) removeBtn.addEventListener('click', function () { if (sel) removeNode(sel); });
        if (openBtn) openBtn.addEventListener('click', function () {
            if (sel && window.pazatorObjectExplorer) window.pazatorObjectExplorer.open(sel);
        });

        // ponytail: coalesce ResizeObserver to rAF, avoid layout thrash
        var ro = new ResizeObserver(function () {
            if (_roTick) return;
            _roTick = requestAnimationFrame(function () {
                _roTick = null;
                resize();
            });
        });
        ro.observe(containerEl);

        // Freeze sim when tab hidden — saves CPU on background tabs
        document.addEventListener('visibilitychange', function () {
            freezeSim = document.hidden;
            if (freezeSim) {
                sim.stop();
            } else if (N.size > 0) {
                sim.alpha(0.3).restart();
            }
        });

        resize();
        initd = true;

        if (N.size === 0) loadAll();

        if (window._explorerPendingId) {
            addEntity(window._explorerPendingId);
            window._explorerPendingId = null;
        }
    }

    function zoomed(event) {
        grp.attr('transform', event.transform);
        // Hide labels when zoomed out — unreadable text is just noise
        var showLabels = event.transform.k >= 0.3;
        if (_label) _label.attr('display', showLabels ? null : 'none');
    }

    function addEdge(id, tid, type, details) {
        var key = id < tid ? id + '::' + tid + '::' + type : tid + '::' + id + '::' + type;
        if (edgeSet.has(key)) return false;
        edgeSet.add(key);
        L.push({ key: key, source: id, target: tid, type: type, details: details || '' });
        return true;
    }

    function loadAll() {
        if (!window.pazatorStore) return;
        var store = window.pazatorStore;
        var added = 0;

        var humans = store._data && store._data.humans;
        if (humans && humans.length) {
            for (var i = 0; i < humans.length && N.size < MAX_NODES; i++) {
                if (!N.has(humans[i].id)) {
                    N.set(humans[i].id, makeNode(humans[i]));
                    added++;
                }
            }
        }

        var others = store._data && store._data.others;
        if (others && others.length) {
            for (var i = 0; i < others.length && N.size < MAX_NODES; i++) {
                if (!N.has(others[i].id)) {
                    N.set(others[i].id, makeNode(others[i]));
                    added++;
                }
            }
        }

        // Build edges — use Set for O(1) dedup
        if (window.pazatorRelationships && isFn(window.pazatorRelationships.toJSON)) {
            var rels = window.pazatorRelationships.toJSON();
            for (var i = 0; i < rels.length; i++) {
                var r = rels[i];
                if (N.has(r.sourceId) && N.has(r.targetId)) {
                    addEdge(r.sourceId, r.targetId, r.type, r.notes || '');
                }
            }
        }

        if (humans) {
            for (var i = 0; i < humans.length; i++) {
                var h = humans[i];
                if (!h || !N.has(h.id)) continue;
                var friendIds = h.friends || [];
                for (var f = 0; f < friendIds.length; f++) {
                    if (N.has(friendIds[f])) addEdge(h.id, friendIds[f], 'friend', '');
                }
                var familyIds = h.family || [];
                for (var f = 0; f < familyIds.length; f++) {
                    if (N.has(familyIds[f])) addEdge(h.id, familyIds[f], 'family', '');
                }
            }
        }

        if (added > 0 || L.length > 0) update();

        clearPathHighlight();
    }

    function resize() {
        if (!ctr) return;
        var w = ctr.clientWidth, h = ctr.clientHeight;
        if (!w || !h) return;
        svg.attr('width', w).attr('height', h);
        sim.force('center', d3.forceCenter(w / 2, h / 2));
        if (sim.alpha() < 0.3 && !freezeSim) sim.alpha(0.3).restart();
    }

    function addEntity(id) {
        if (N.size >= MAX_NODES) return false;
        var obj = getObj(id);
        if (!obj) return false;
        var changed = false;

        if (!N.has(id)) {
            N.set(id, makeNode(obj));
            changed = true;
        }

        var related = getRelated(id);
        for (var i = 0; i < related.length; i++) {
            var rel = related[i];
            var tid = rel.object.id;
            if (!tid) continue;
            if (!N.has(tid) && N.size < MAX_NODES) {
                N.set(tid, makeNode(rel.object));
                changed = true;
            }
            if (N.has(tid)) {
                changed = addEdge(id, tid, rel.relationship, rel.details || '') || changed;
            }
        }

        if (changed) update();
        focus(id);
        select(id);
        return true;
    }

    function makeNode(obj) {
        var t = obj.threatLevel || 'None';
        return {
            id: obj.id,
            name: obj.name || obj.id,
            type: obj.objectType || 'Unknown',
            threat: t,
            credit: obj.credit || 0,
            color: TC[obj.objectType] || TC.Unknown,
            threatColor: TH[t] || TH.None
        };
    }

    function showPathfindingModal() {
        var existing = document.getElementById('explorerPathModal');
        if (existing) existing.remove();

        var fromId = null, fromName = null;
        var toId = null, toName = null;

        var modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'explorerPathModal';
        modal.style.display = 'flex';

        var content = document.createElement('div');
        content.className = 'modal-content';
        content.style.maxWidth = '480px';

        var header = document.createElement('div');
        header.className = 'modal-header';

        var title = document.createElement('h2');
        title.textContent = 'Pathfinding';

        var closeBtn = document.createElement('button');
        closeBtn.className = 'close';
        closeBtn.type = 'button';
        closeBtn.innerHTML = '&times;';

        header.appendChild(title);
        header.appendChild(closeBtn);

        var body = document.createElement('div');
        body.className = 'modal-body';

        function makeSlot(label) {
            var wrap = document.createElement('div');
            wrap.style.cssText = 'margin-bottom:12px;';

            var lbl = document.createElement('div');
            lbl.style.cssText = 'font-size:0.65rem;color:#555;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;';
            lbl.textContent = label;

            var slot = document.createElement('div');
            slot.id = 'mpSlot' + label;
            slot.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);cursor:pointer;transition:all 0.15s;min-height:40px;';
            slot.innerHTML = '<span style="color:#444;font-size:0.8rem;">Select entity...</span>';

            slot.addEventListener('mouseenter', function () { slot.style.borderColor = 'rgba(77,157,224,0.25)'; slot.style.background = 'rgba(77,157,224,0.04)'; });
            slot.addEventListener('mouseleave', function () { slot.style.borderColor = 'rgba(255,255,255,0.06)'; slot.style.background = 'rgba(255,255,255,0.02)'; });

            wrap.appendChild(lbl);
            wrap.appendChild(slot);
            return { wrap: wrap, slot: slot, set: function (id, name, obj) {}, clear: function () {} };
        }

        var fromSlot = makeSlot('From');
        var toSlot = makeSlot('To');

        fromSlot.set = function (id, name, obj) {
            fromId = id; fromName = name || id;
            fromSlot.slot.innerHTML = '<span style="color:#34d399;font-size:0.7rem;">●</span><span style="flex:1;color:#e0e0e0;font-size:0.85rem;">' + esc(fromName) + '</span><span style="color:#555;font-size:0.65rem;">' + (obj ? obj.objectType || '' : '') + '</span><span class="mp-remove" style="color:#555;font-size:1rem;cursor:pointer;padding:0 4px;">&times;</span>';
            fromSlot.slot.querySelector('.mp-remove').addEventListener('click', function (e) { e.stopPropagation(); fromSlot.clear(); });
        };
        fromSlot.clear = function () { fromId = null; fromName = null; fromSlot.slot.innerHTML = '<span style="color:#444;font-size:0.8rem;">Select entity...</span>'; };

        toSlot.set = function (id, name, obj) {
            toId = id; toName = name || id;
            toSlot.slot.innerHTML = '<span style="color:#4d9de0;font-size:0.7rem;">●</span><span style="flex:1;color:#e0e0e0;font-size:0.85rem;">' + esc(toName) + '</span><span style="color:#555;font-size:0.65rem;">' + (obj ? obj.objectType || '' : '') + '</span><span class="mp-remove" style="color:#555;font-size:1rem;cursor:pointer;padding:0 4px;">&times;</span>';
            toSlot.slot.querySelector('.mp-remove').addEventListener('click', function (e) { e.stopPropagation(); toSlot.clear(); });
        };
        toSlot.clear = function () { toId = null; toName = null; toSlot.slot.innerHTML = '<span style="color:#444;font-size:0.8rem;">Select entity...</span>'; };

        fromSlot.slot.addEventListener('click', function () {
            if (window.PazatorUI && window.PazatorUI.showEntityPicker) {
                PazatorUI.showEntityPicker({ title: 'Select Start Node', onSelect: fromSlot.set });
            }
        });
        toSlot.slot.addEventListener('click', function () {
            if (window.PazatorUI && window.PazatorUI.showEntityPicker) {
                PazatorUI.showEntityPicker({ title: 'Select End Node', onSelect: toSlot.set });
            }
        });

        var resEl = document.createElement('div');
        resEl.id = 'mpResult';
        resEl.style.cssText = 'margin-top:6px;font-size:0.8rem;line-height:1.8;min-height:0;';

        var findBtn = document.createElement('button');
        findBtn.className = 'btn btn-primary';
        findBtn.type = 'button';
        findBtn.style.cssText = 'margin-top:12px;width:100%;padding:10px;';
        findBtn.innerHTML = '<i class="fas fa-route"></i> Find Path';

        var statusEl = document.createElement('div');
        statusEl.id = 'mpStatus';
        statusEl.style.cssText = 'font-size:0.75rem;color:#555;margin-top:6px;text-align:center;';

        body.appendChild(fromSlot.wrap);
        body.appendChild(toSlot.wrap);
        body.appendChild(resEl);
        body.appendChild(findBtn);
        body.appendChild(statusEl);

        content.appendChild(header);
        content.appendChild(body);
        modal.appendChild(content);
        document.body.appendChild(modal);

        function runFind() {
            resEl.innerHTML = '';
            statusEl.innerHTML = '';
            if (!fromId || !toId) { statusEl.innerHTML = '<span style="color:#ff6b6b;">Select both nodes</span>'; return; }
            if (fromId === toId) { statusEl.innerHTML = 'Same node'; return; }

            if (!N.has(fromId)) addEntity(fromId);
            if (!N.has(toId)) addEntity(toId);

            clearPathHighlight();
            var path = findPath(fromId, toId);
            if (!path) {
                resEl.innerHTML = '<div style="text-align:center;padding:16px;color:#ff6b6b;font-size:0.8rem;">No path found between these nodes</div>';
                return;
            }
            highlightPath(path);

            var html = '<div style="padding:12px 0;">';
            for (var i = 0; i < path.length; i++) {
                var n = N.get(path[i].id);
                var name = n ? n.name : path[i].id;
                if (i > 0) {
                    html += '<div style="display:flex;align-items:center;gap:6px;padding:4px 0 4px 16px;"><span style="color:#555;font-size:0.6rem;text-transform:uppercase;letter-spacing:0.05em;">' + (path[i].type || 'connected') + '</span><span style="color:#333;font-size:0.7rem;">→</span></div>';
                }
                var dot = i === 0 ? '#34d399' : i === path.length - 1 ? '#4d9de0' : '#888';
                html += '<div style="display:flex;align-items:center;gap:10px;padding:5px 12px;border-radius:6px;background:rgba(255,255,255,0.02);"><span style="color:' + dot + ';font-size:0.6rem;">●</span><span style="flex:1;color:#e0e0e0;font-size:0.85rem;">' + esc(name) + '</span></div>';
            }
            html += '</div>';
            resEl.innerHTML = html;
            statusEl.innerHTML = '<span style="color:#34d399;">' + (path.length - 1) + ' hop' + (path.length > 2 ? 's' : '') + '</span>';
        }

        findBtn.addEventListener('click', runFind);

        function closeModal() { modal.remove(); }
        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
        document.addEventListener('keydown', function handler(e) { if (e.key === 'Escape' && document.getElementById('explorerPathModal')) { closeModal(); document.removeEventListener('keydown', handler); } });
    }

    function findPath(sid, tid) {
        var adj = {};
        L.forEach(function (e) {
            var src = typeof e.source === 'object' ? e.source.id : e.source;
            var tgt = typeof e.target === 'object' ? e.target.id : e.target;
            (adj[src] = adj[src] || []).push({ id: tgt, type: e.type });
            (adj[tgt] = adj[tgt] || []).push({ id: src, type: e.type });
        });
        var visited = new Set([sid]);
        var queue = [{ id: sid, path: [{ id: sid, type: null }] }];
        while (queue.length) {
            var cur = queue.shift();
            var neighbors = adj[cur.id] || [];
            for (var i = 0; i < neighbors.length; i++) {
                var nb = neighbors[i];
                if (visited.has(nb.id)) continue;
                visited.add(nb.id);
                var newPath = cur.path.concat([{ id: nb.id, type: nb.type }]);
                if (nb.id === tid) return newPath;
                queue.push({ id: nb.id, path: newPath });
            }
        }
        return null;
    }

    function highlightPath(path) {
        _path = path;
        var ids = new Set(path.map(function (s) { return s.id; }));
        var edgeKeys = new Set();
        for (var i = 1; i < path.length; i++) {
            var a = path[i - 1].id, b = path[i].id;
            edgeKeys.add(a < b ? a + '::' + b : b + '::' + a);
        }
        _node.attr('opacity', function (d) { return ids.has(d.id) ? 1 : 0.15; })
            .attr('stroke', function (d) { return ids.has(d.id) ? '#00ff88' : d.threatColor; })
            .attr('stroke-width', function (d) { return ids.has(d.id) ? 3.5 : 1.5; });
        _label.attr('opacity', function (d) { return ids.has(d.id) ? 1 : 0.15; });
        _link.attr('stroke-opacity', function (d) {
            var src = typeof d.source === 'object' ? d.source.id : d.source;
            var tgt = typeof d.target === 'object' ? d.target.id : d.target;
            var k = src < tgt ? src + '::' + tgt : tgt + '::' + src;
            return edgeKeys.has(k) ? 1 : 0.08;
        }).attr('stroke', function (d) {
            var src = typeof d.source === 'object' ? d.source.id : d.source;
            var tgt = typeof d.target === 'object' ? d.target.id : d.target;
            var k = src < tgt ? src + '::' + tgt : tgt + '::' + src;
            return edgeKeys.has(k) ? '#00ff88' : '#555';
        }).attr('stroke-width', function (d) {
            var src = typeof d.source === 'object' ? d.source.id : d.source;
            var tgt = typeof d.target === 'object' ? d.target.id : d.target;
            var k = src < tgt ? src + '::' + tgt : tgt + '::' + src;
            return edgeKeys.has(k) ? 3 : 1;
        });
        var coords = path.map(function (s) { var n = N.get(s.id); return n && n.x != null ? [n.x, n.y] : null; }).filter(Boolean);
        if (coords.length > 1) {
            var mx = coords.reduce(function (s, c) { return s + c[0]; }, 0) / coords.length;
            var my = coords.reduce(function (s, c) { return s + c[1]; }, 0) / coords.length;
            var w = ctr.clientWidth, h = ctr.clientHeight;
            var t = d3.zoomIdentity.translate(w / 2, h / 2).scale(1.5).translate(-mx, -my);
            svg.transition().duration(400).call(zoom.transform, t);
        }
    }

    function clearPathHighlight() {
        if (!_path) return;
        _path = null;
        if (_node) _node.attr('opacity', function (d) { return !sel || d.id === sel ? 1 : 0.35; })
            .attr('stroke', function (d) { return d.threatColor; })
            .attr('stroke-width', function (d) { return d.id === sel ? 3.5 : 2; });
        if (_label) _label.attr('opacity', function (d) { return !sel || d.id === sel ? 1 : 0.35; });
        if (_link) _link.attr('stroke-opacity', 0.4).attr('stroke', function (d) { return EC[d.type] || '#555'; }).attr('stroke-width', function (d) { return EW[d.type] || 1; });
    }

    function update() {
        var nodes = Array.from(N.values());

        _link = grp.selectAll('.link').data(L, function (d) { return d.key; });
        _link.exit().transition().duration(150).attr('stroke-opacity', 0).remove();
        var le = _link.enter().append('line').attr('class', 'link').attr('stroke-opacity', 0).attr('marker-end', function (d) { return 'url(#a-' + d.type + ')'; }).attr('stroke', function (d) { return EC[d.type] || '#555'; }).attr('stroke-width', function (d) { return EW[d.type] || 1; });
        le.transition().duration(200).attr('stroke-opacity', 0.4);
        _link = le.merge(_link);

        _node = grp.selectAll('.node').data(nodes, function (d) { return d.id; });
        _node.exit().transition().duration(150).attr('r', 0).remove();
        var ne = _node.enter().append('circle').attr('class', 'node').attr('r', 0).attr('fill', function (d) { return d.color; }).attr('stroke', function (d) { return d.threatColor; }).attr('stroke-width', 2.5).attr('cursor', 'pointer').on('click', function (e, d) { e.stopPropagation(); select(d.id); }).on('dblclick', function (e, d) { e.stopPropagation(); addEntity(d.id); }).call(d3.drag().on('start', function (e, d) { if (!e.active && !freezeSim) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }).on('drag', function (e, d) { d.fx = e.x; d.fy = e.y; }).on('end', function (e, d) { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
        ne.transition().duration(200).attr('r', 16);
        _node = ne.merge(_node);
        _node.attr('fill', function (d) { return d.color; }).attr('stroke', function (d) { return d.threatColor; }).attr('stroke-width', function (d) { return d.id === sel ? 3.5 : 2; }).attr('opacity', function (d) { return !sel || d.id === sel ? 1 : 0.35; });

        _label = grp.selectAll('.label').data(nodes, function (d) { return d.id; });
        _label.exit().remove();
        var te = _label.enter().append('text').attr('class', 'label').attr('text-anchor', 'middle').attr('dy', 28).attr('fill', '#aaa').attr('font-size', 9).attr('pointer-events', 'none').text(function (d) { return d.name.length > 14 ? d.name.slice(0, 13) + '\u2026' : d.name; });
        _label = te.merge(_label);

        sim.nodes(nodes);
        sim.force('link').links(L);

        // ponytail: cooler alpha — batch inserts jump-start less aggressively
        if (!freezeSim) sim.alpha(Math.min(1, 0.2 + nodes.length * 0.001)).restart();

        if (sel && !N.has(sel)) select(null);
        else if (sel) showInfo(sel);

        updateStats();
    }

    function updateStats() {
        var el = byId('explorerNodeCount');
        if (el) el.textContent = N.size;
        var el2 = byId('explorerEdgeCount');
        if (el2) el2.textContent = L.length;
    }

    function tick() {
        if (!_node || freezeSim) return;
        // ponytail: guard against stale edges whose source/target was removed mid-sim
        if (_link) {
            _link.attr('x1', function (d) { var s = d.source; return s && s.x != null ? s.x : 0; }).attr('y1', function (d) { var s = d.source; return s && s.y != null ? s.y : 0; }).attr('x2', function (d) { var t = d.target; return t && t.x != null ? t.x : 0; }).attr('y2', function (d) { var t = d.target; return t && t.y != null ? t.y : 0; });
        }
        _node.attr('cx', function (d) { return d.x != null ? d.x : 0; }).attr('cy', function (d) { return d.y != null ? d.y : 0; });
        if (_label) {
            _label.attr('x', function (d) { return d.x != null ? d.x : 0; }).attr('y', function (d) { return d.y != null ? d.y : 0; });
        }
    }

    function select(id) {
        if (_path) clearPathHighlight();
        sel = id;
        if (_node) {
            _node.attr('opacity', function (d) { return !id || d.id === id ? 1 : 0.35; }).attr('stroke-width', function (d) { return d.id === id ? 3.5 : 2; });
        }
        if (_label) {
            _label.attr('opacity', function (d) { return !id || d.id === id ? 1 : 0.35; });
        }
        if (id) showInfo(id);
        else clearInfo();
    }

    function showInfo(id) {
        var n = N.get(id);
        if (!n) return;
        if (info.placeholder) info.placeholder.style.display = 'none';
        if (info.body) info.body.style.display = '';
        if (info.name) info.name.textContent = n.name;
        if (info.meta) info.meta.textContent = n.type + ' \u00b7 ' + n.id;
        if (info.threat) {
            info.threat.textContent = n.threat;
            info.threat.style.color = TH[n.threat] || TH.None;
        }
        if (info.credit) info.credit.textContent = n.credit > 0 ? n.credit : '\u2014';
        if (info.connections) {
            var count = 0;
            for (var i = 0; i < L.length; i++) {
                var src = L[i].source && L[i].source.id !== undefined ? L[i].source.id : L[i].source;
                var tgt = L[i].target && L[i].target.id !== undefined ? L[i].target.id : L[i].target;
                if (src === id || tgt === id) count++;
            }
            info.connections.textContent = count;
        }
    }

    function clearInfo() {
        if (info.placeholder) info.placeholder.style.display = '';
        if (info.body) info.body.style.display = 'none';
        if (info.name) info.name.textContent = 'Select a node';
        if (info.meta) info.meta.textContent = '';
    }

    function removeNode(id) {
        N.delete(id);
        for (var i = L.length - 1; i >= 0; i--) {
            var src = L[i].source && L[i].source.id !== undefined ? L[i].source.id : L[i].source;
            var tgt = L[i].target && L[i].target.id !== undefined ? L[i].target.id : L[i].target;
            if (src === id || tgt === id) {
                edgeSet.delete(L[i].key);
                L.splice(i, 1);
            }
        }
        update();
        if (sel === id) select(null);
    }

    function onSearch() {
        var q = inputEl.value.trim().toLowerCase();
        if (!q || q.length < 2) { resultsEl.style.display = 'none'; return; }

        var matches = [];
        if (window.pazatorStore && isFn(window.pazatorStore.searchObjects)) {
            var r = window.pazatorStore.searchObjects(q, 20);
            for (var i = 0; i < r.length; i++) matches.push(r[i]);
        }
        if (matches.length === 0) { resultsEl.style.display = 'none'; return; }

        var html = '';
        for (var i = 0; i < matches.length; i++) {
            var m = matches[i];
            var already = N.has(m.id);
            html += '<div class="es-item' + (already ? ' es-done' : '') + '" data-id="' + m.id + '"><span class="es-icon" style="color:' + (TC[m.objectType] || TC.Unknown) + '"><i class="fas ' + (m.objectType === 'Person' ? 'fa-user' : 'fa-building') + '"></i></span><span class="es-name">' + esc(m.name || m.id) + '</span><span class="es-type">' + (m.objectType || '') + '</span><span class="es-badge">' + (already ? '\u2713' : '+') + '</span></div>';
        }
        resultsEl.innerHTML = html;
        resultsEl.style.display = '';

        Array.from(resultsEl.children).forEach(function (el) {
            el.addEventListener('mousedown', function (e) {
                e.preventDefault();
                var id = el.dataset.id;
                if (id) addEntity(id);
                inputEl.focus();
            });
        });
    }

    function esc(s) {
        if (!s) return '';
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function focus(id) {
        var n = N.get(id);
        if (!n || n.x == null || n.y == null) return;
        var w = ctr.clientWidth, h = ctr.clientHeight;
        var t = d3.zoomIdentity.translate(w / 2, h / 2).scale(1.5).translate(-n.x, -n.y);
        svg.transition().duration(400).call(zoom.transform, t);
    }

    function resetView() {
        if (N.size === 0) return;
        var cx = 0, cy = 0, count = 0;
        N.forEach(function (n) { if (n.x != null) { cx += n.x; cy += n.y; count++; } });
        if (count === 0) return;
        cx /= count; cy /= count;
        var w = ctr.clientWidth, h = ctr.clientHeight;
        var t = d3.zoomIdentity.translate(w / 2, h / 2).translate(-cx, -cy);
        svg.transition().duration(400).call(zoom.transform, t);
    }

    function clear() {
        N.clear();
        L.length = 0;
        edgeSet.clear();
        select(null);
        if (_link) { _link.remove(); _link = null; }
        if (_node) { _node.remove(); _node = null; }
        if (_label) { _label.remove(); _label = null; }
        sim.nodes([]);
        sim.force('link').links([]);
        sim.alpha(0).stop();
        if (inputEl) inputEl.value = '';
        updateStats();
    }

    window.pazatorExplorer = {
        init: init,
        add: addEntity,
        loadAll: loadAll,
        focus: focus,
        clear: clear,
        resetView: resetView
    };
})();
