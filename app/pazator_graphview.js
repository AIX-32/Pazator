(function () {
    'use strict';

	    // Clustering disabled: always render raw nodes/edges.
	    var CLUSTER_THRESHOLD = Infinity;
	    var CANVAS_THRESHOLD = 800;
	    var MAX_VISIBLE_NODES = 5000;
	    // "Infinite" zoom isn't possible in d3 (needs finite extents), but we can make it effectively unlimited.
	    var ZOOM_EXTENTS = [0.001, 1000];

		    // Unclustering is explicit: click a cluster to expand it.

	    var EDGE_OPACITY_BASE = 0.55;
	    var EDGE_OPACITY_DIM = 0.06;
	    var EDGE_OPACITY_HOVER = 1.0;
	    var EDGE_WIDTH_HOVER_BOOST = 1.5;

	    function ensureHoverCard() {
	        if (!graph.container) return null;
	        var existing = graph.container.querySelector('.gv-hovercard');
	        if (existing) return existing;
	        var card = document.createElement('div');
	        card.className = 'gv-hovercard';
	        card.style.display = 'none';
	        graph.container.appendChild(card);
	        return card;
	    }

	    function getInitials(name) {
	        if (!name) return '?';
	        var parts = String(name).trim().split(/\s+/).filter(Boolean);
	        if (!parts.length) return '?';
	        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
	    }

	    function updateHoverCard(node) {
	        var card = ensureHoverCard();
	        if (!card) return;
	        if (!node) {
	            card.style.display = 'none';
	            return;
	        }

	        var name = node.name || 'Unknown';
	        var id = node.id != null ? String(node.id) : '—';
	        var risk = node.threatLevel || node.riskLevel || 'None';
	        var credit = (node.credit != null && node.credit !== '') ? String(node.credit) : '—';
	        var img = node.imagePreview || node.image || node.avatar || null;

	        card.innerHTML = '';

	        var top = document.createElement('div');
	        top.className = 'gv-hovercard-top';

	        var avatarWrap = document.createElement('div');
	        avatarWrap.className = 'gv-hovercard-avatar';
	        if (img) {
	            var im = document.createElement('img');
	            im.src = img;
	            im.alt = name;
	            avatarWrap.appendChild(im);
	        } else {
	            var fallback = document.createElement('div');
	            fallback.className = 'gv-hovercard-avatar-fallback';
	            fallback.textContent = getInitials(name);
	            avatarWrap.appendChild(fallback);
	        }

	        var meta = document.createElement('div');
	        meta.className = 'gv-hovercard-meta';

	        var nameEl = document.createElement('div');
	        nameEl.className = 'gv-hovercard-name';
	        nameEl.textContent = name;

	        var creditEl = document.createElement('div');
	        creditEl.className = 'gv-hovercard-credit';
	        creditEl.textContent = 'Credit: ' + credit;

	        meta.appendChild(nameEl);
	        meta.appendChild(creditEl);

	        top.appendChild(avatarWrap);
	        top.appendChild(meta);

	        var bottom = document.createElement('div');
	        bottom.className = 'gv-hovercard-bottom';

	        var idEl = document.createElement('div');
	        idEl.className = 'gv-hovercard-id';
	        idEl.textContent = 'PZI: ' + id;

	        var riskEl = document.createElement('div');
	        riskEl.className = 'gv-hovercard-risk';
	        riskEl.textContent = 'Risk: ' + risk;

	        bottom.appendChild(idEl);
	        bottom.appendChild(riskEl);

	        card.appendChild(top);
	        card.appendChild(bottom);
	        card.style.display = 'block';
	    }

	    function syncPazatorDataFromStore() {
	        if (!window.pazatorStore || typeof window.pazatorStore.getData !== 'function') return;
	        var storeData = window.pazatorStore.getData();
	        if (!storeData) return;
	        if (!window.pazatorData) window.pazatorData = {};
	        if (Array.isArray(storeData.humans) && (!Array.isArray(window.pazatorData.humans) || window.pazatorData.humans.length === 0)) {
	            window.pazatorData.humans = storeData.humans;
	        }
	        if (Array.isArray(storeData.others) && (!Array.isArray(window.pazatorData.others) || window.pazatorData.others.length === 0)) {
	            window.pazatorData.others = storeData.others;
	        }
	        if (Array.isArray(storeData.chats) && (!Array.isArray(window.pazatorData.chats) || window.pazatorData.chats.length === 0)) {
	            window.pazatorData.chats = storeData.chats;
	        }
	    }

	    var graph = {
	        nodes: [],
	        edges: [],
	        rawNodes: [],
	        rawEdges: [],
	        simulation: null,
        svg: null,
        canvas: null,
        ctx: null,
	        zoom: null,
	        zoomTransform: null,
	        width: 0,
        height: 0,
        container: null,
        useCanvas: false,
        selectedNode: null,
	        hoveredNode: null,
	        animFrame: null,
	        clusterLookup: null,
	        clusteringEnabled: true,
	        isActive: false
	    };

		    // (removed) zoom-driven unclustering/reclustering helpers

	    function rebuildEdgesFromRaw() {
	        var visibleIds = {};
	        graph.nodes.forEach(function (n) {
	            if (!n) return;
	            if (n.type === 'cluster') return;
	            visibleIds[n.id] = true;
	        });

	        var raw = graph.rawEdges && graph.rawEdges.length ? graph.rawEdges : [];
	        var edges = [];
	        for (var i = 0; i < raw.length; i++) {
	            var e = raw[i];
	            if (!e) continue;
	            if (visibleIds[e.source] && visibleIds[e.target]) edges.push(e);
	        }
	        graph.edges = edges;
	    }

    function buildGraphData() {
        var humans = [];
        var others = [];
        
        // Try store first, then fall back to pazatorData
        if (window.pazatorStore && window.pazatorStore.getData()) {
            var storeData = window.pazatorStore.getData();
            humans = Array.isArray(storeData.humans) ? storeData.humans : [];
            others = Array.isArray(storeData.others) ? storeData.others : [];
        }
        
        // Fallback to pazatorData if store is empty
        if (humans.length === 0 && window.pazatorData && Array.isArray(window.pazatorData.humans)) {
            humans = window.pazatorData.humans;
        }
        if (others.length === 0 && window.pazatorData && Array.isArray(window.pazatorData.others)) {
            others = window.pazatorData.others;
        }
        
        var rels = window.pazatorRelationships ? window.pazatorRelationships.getAll() : [];
        var allTags = window.tags || [];

        var nodeMap = {};
        var edges = [];
        var edgeKeyed = {};

        function addEdge(source, target, weight, type, label) {
            if (source === target) return;
            var key = source < target ? source + '|' + target : target + '|' + source;
            if (edgeKeyed[key]) {
                edgeKeyed[key].weight += weight;
                if (edgeKeyed[key].types.indexOf(type) === -1) {
                    edgeKeyed[key].types.push(type);
                }
                return;
            }
            var e = { source: source, target: target, weight: weight, types: [type], label: label || type };
            edgeKeyed[key] = e;
            edges.push(e);
        }

        // Ensure humans and others are arrays
        if (!Array.isArray(humans)) humans = [];
        if (!Array.isArray(others)) others = [];

	        humans.forEach(function (h) {
	            if (!h || !h.id) return;
	            nodeMap[h.id] = {
	                id: h.id,
	                name: h.name || 'Unknown',
	                type: 'human',
	                threatLevel: h.threatLevel || 'None',
	                credit: h.credit || 185,
	                imagePreview: h.imagePreview || null,
	                tags: h.tags || [],
	                connections: 0,
	                clusterId: null,
	                x: Math.random(),
	                y: Math.random()
	            };
	        });

	        others.forEach(function (o) {
	            if (!o || !o.id) return;
	            nodeMap[o.id] = {
	                id: o.id,
	                name: o.name || 'Unknown',
	                type: 'other',
	                imagePreview: o.imagePreview || null,
	                tags: o.tags || [],
	                connections: 0,
	                clusterId: null,
	                x: Math.random(),
	                y: Math.random()
	            };
	        });

        rels.forEach(function (r) {
            if (!r || !r.sourceId || !r.targetId) return;
            if (!nodeMap[r.sourceId] || !nodeMap[r.targetId]) return;
            var w = r.strength || 1;
            addEdge(r.sourceId, r.targetId, w, r.type, r.type);
        });

        humans.forEach(function (h) {
            if (!h || !h.id) return;
            if (h.friends) {
                h.friends.forEach(function (fid) {
                    if (nodeMap[fid]) {
                        addEdge(h.id, fid, 2, 'friend', 'Friend');
                    }
                });
            }
            if (h.family) {
                h.family.forEach(function (fid) {
                    if (nodeMap[fid]) {
                        addEdge(h.id, fid, 3, 'family', 'Family');
                    }
                });
            }
        });

        var attributeGroups = {};
        var allItems = humans.concat(others);
        allItems.forEach(function (item) {
            if (!item || !item.id || !nodeMap[item.id]) return;
            var attrs = [];
            if (item.workplace) attrs.push('wp:' + item.workplace.toLowerCase().trim());
            if (item.nationality) attrs.push('nat:' + item.nationality.toLowerCase().trim());
            if (item.countryOfOrigin) attrs.push('coo:' + item.countryOfOrigin.toLowerCase().trim());
            if (item.religion) attrs.push('rel:' + item.religion.toLowerCase().trim());
            if (item.ethnicity) attrs.push('eth:' + item.ethnicity.toLowerCase().trim());
            if (item.occupation) attrs.push('occ:' + item.occupation.toLowerCase().trim());
            if (item.educationLevel) attrs.push('edu:' + item.educationLevel.toLowerCase().trim());
            if (item.incomeLevel) attrs.push('inc:' + item.incomeLevel.toLowerCase().trim());
            if (item.socialClass) attrs.push('soc:' + item.socialClass.toLowerCase().trim());
            if (item.politicalViews) attrs.push('pol:' + item.politicalViews.toLowerCase().trim());

            if (item.tags) {
                item.tags.forEach(function (t) {
                    attrs.push('tag:' + t.toLowerCase().trim());
                });
            }

            attrs.forEach(function (a) {
                if (!attributeGroups[a]) attributeGroups[a] = [];
                if (attributeGroups[a].indexOf(item.id) === -1) {
                    attributeGroups[a].push(item.id);
                }
            });
        });

        for (var attr in attributeGroups) {
            var ids = attributeGroups[attr];
            if (ids.length < 2 || ids.length > 200) continue;
            for (var i = 0; i < ids.length; i++) {
                for (var j = i + 1; j < ids.length; j++) {
                    addEdge(ids[i], ids[j], 1, 'shared', attr.split(':')[0]);
                }
            }
        }

        var nodes = Object.keys(nodeMap).map(function (id) { return nodeMap[id]; });

        edges.forEach(function (e) {
            if (nodeMap[e.source] && nodeMap[e.target]) {
                nodeMap[e.source].connections += e.weight;
                nodeMap[e.target].connections += e.weight;
            }
        });

        edges = edges.filter(function (e) {
            return nodeMap[e.source] && nodeMap[e.target];
        });

        var maxConn = 1;
        nodes.forEach(function (n) { if (n.connections > maxConn) maxConn = n.connections; });
        nodes.forEach(function (n) {
            n.radius = n.type === 'cluster' ? 12 : 4 + (n.connections / maxConn) * 12;
            n.radius = Math.min(n.radius, 28);
        });

        return { nodes: nodes, edges: edges };
    }

	    function clusterNodes(data) {
	        var n = data.nodes.length;
	        if (n <= CLUSTER_THRESHOLD) return data;

	        // When nodes are very homogeneous (same type/tags/threat) the k-means-like
	        // pass tends to collapse into 1 cluster for dense graphs. For small graphs,
	        // prefer a deterministic bucket clustering to guarantee multiple drillable clusters.
	        if (n <= 250) {
	            var kSmall = Math.max(2, Math.min(8, Math.floor(Math.sqrt(n))));
	            var byIdSmall = {};
	            data.nodes.forEach(function (node) { byIdSmall[node.id] = node; });

	            function hashIdSmall(id) {
	                var h = 0;
	                for (var i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
	                return Math.abs(h);
	            }

	            var clustersSmall = {};
	            var assignmentsSmall = {};
	            data.nodes.forEach(function (node) {
	                var bucket = hashIdSmall(String(node.id)) % kSmall;
	                var cidb = 'cluster_' + bucket;
	                assignmentsSmall[node.id] = cidb;
	                if (!clustersSmall[cidb]) {
	                    clustersSmall[cidb] = { id: cidb, type: 'cluster', name: 'Cluster ' + (Object.keys(clustersSmall).length + 1), nodes: [], connections: 0, radius: 20, clusterId: cidb, x: Math.random(), y: Math.random() };
	                }
	                clustersSmall[cidb].nodes.push(node);
	                clustersSmall[cidb].connections += node.connections || 0;
	            });

	            var clusterListSmall = [];
	            for (var cidb2 in clustersSmall) {
	                var cb = clustersSmall[cidb2];
	                cb.radius = Math.max(8, Math.min(30, Math.sqrt(cb.nodes.length) * 3));
	                clusterListSmall.push(cb);
	            }

	            var edgeMapSmall = {};
	            data.edges.forEach(function (e) {
	                var sc = assignmentsSmall[e.source];
	                var tc = assignmentsSmall[e.target];
	                if (!sc || !tc || sc === tc) return;
	                var key = sc < tc ? sc + '|' + tc : tc + '|' + sc;
	                if (edgeMapSmall[key]) edgeMapSmall[key].weight += e.weight;
	                else edgeMapSmall[key] = { source: sc, target: tc, weight: e.weight, types: ['cluster'], label: 'connection' };
	            });

	            var clusterEdgesSmall = [];
	            for (var ek in edgeMapSmall) clusterEdgesSmall.push(edgeMapSmall[ek]);
	            return { nodes: clusterListSmall, edges: clusterEdgesSmall, clustered: true, clusterMap: clustersSmall };
	        }

        var k = Math.max(2, Math.min(50, Math.floor(Math.sqrt(n / 5))));
        var featureVectors = [];
        var tagIndex = {};
        var tagCounter = 0;

        data.nodes.forEach(function (node) {
            var vec = {};
            vec['_type_' + node.type] = 1;
            if (node.threatLevel) vec['_threat_' + node.threatLevel] = 1;
            (node.tags || []).forEach(function (t) {
                var key = '_tag_' + t.toLowerCase();
                if (!tagIndex[key]) tagIndex[key] = tagCounter++;
                vec[key] = 1;
            });
            featureVectors.push(vec);
        });

        var allKeys = Object.keys(tagIndex);
        var clusterCenters = [];
        for (var i = 0; i < k; i++) {
            var center = {};
            allKeys.forEach(function (key) { center[key] = Math.random(); });
            center._type_human = Math.random();
            center._type_other = Math.random();
            clusterCenters.push(center);
        }

        var assignments = new Array(n).fill(0);
        for (var iter = 0; iter < 8; iter++) {
            var newCenters = [];
            var counts = [];
            for (var ci = 0; ci < k; ci++) {
                newCenters[ci] = {};
                counts[ci] = 0;
            }

            for (var ni = 0; ni < n; ni++) {
                var bestDist = Infinity;
                var bestC = 0;
                var vec = featureVectors[ni];
                for (var cj = 0; cj < k; cj++) {
                    var dist = 0;
                    for (var key in vec) {
                        var diff = (vec[key] || 0) - (clusterCenters[cj][key] || 0);
                        dist += diff * diff;
                    }
                    if (dist < bestDist) { bestDist = dist; bestC = cj; }
                }
                assignments[ni] = bestC;
            }

            for (var ni2 = 0; ni2 < n; ni2++) {
                var c = assignments[ni2];
                var vec2 = featureVectors[ni2];
                counts[c]++;
                for (var key2 in vec2) {
                    newCenters[c][key2] = (newCenters[c][key2] || 0) + vec2[key2];
                }
            }

            for (var ck = 0; ck < k; ck++) {
                if (counts[ck] > 0) {
                    for (var key3 in newCenters[ck]) {
                        newCenters[ck][key3] /= counts[ck];
                    }
                } else {
                    newCenters[ck] = JSON.parse(JSON.stringify(clusterCenters[ck]));
                }
            }
            clusterCenters = newCenters;
        }

        var clusters = {};
        for (var i3 = 0; i3 < n; i3++) {
            var cid = 'cluster_' + assignments[i3];
            if (!clusters[cid]) {
                clusters[cid] = { id: cid, type: 'cluster', name: 'Cluster ' + (Object.keys(clusters).length + 1), nodes: [], connections: 0, radius: 20, clusterId: cid, x: Math.random(), y: Math.random() };
            }
            clusters[cid].nodes.push(data.nodes[i3]);
            clusters[cid].connections += data.nodes[i3].connections || 0;
        }

        var clusterList = [];
        for (var cid2 in clusters) {
            var c = clusters[cid2];
            c.radius = Math.max(8, Math.min(30, Math.sqrt(c.nodes.length) * 3));
            clusterList.push(c);
        }

        var clusterEdgeMap = {};
        data.edges.forEach(function (e) {
            var sNode = data.nodes.find(function (n) { return n.id === e.source; });
            var tNode = data.nodes.find(function (n) { return n.id === e.target; });
            if (!sNode || !tNode) return;
            var sc = 'cluster_' + assignments[data.nodes.indexOf(sNode)];
            var tc = 'cluster_' + assignments[data.nodes.indexOf(tNode)];
            if (sc === tc) return;
            var key = sc < tc ? sc + '|' + tc : tc + '|' + sc;
            if (clusterEdgeMap[key]) {
                clusterEdgeMap[key].weight += e.weight;
            } else {
                clusterEdgeMap[key] = { source: sc, target: tc, weight: e.weight, types: ['cluster'], label: 'connection' };
            }
        });

        var clusterEdges = [];
        for (var ek in clusterEdgeMap) clusterEdges.push(clusterEdgeMap[ek]);

	        // If the k-means-like pass collapsed into a single bucket (common with very dense graphs),
	        // fall back to a deterministic hash-bucketing so the user can drill into multiple clusters.
	        if (clusterList.length < 2) {
	            var k2 = Math.max(2, Math.min(8, Math.floor(Math.sqrt(n))));
	            var byId = {};
	            data.nodes.forEach(function (node) { byId[node.id] = node; });

	            function hashId(id) {
	                var h = 0;
	                for (var i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
	                return Math.abs(h);
	            }

	            var clusters2 = {};
	            var assignments2 = {};
	            data.nodes.forEach(function (node) {
	                var bucket = hashId(String(node.id)) % k2;
	                var cidb = 'cluster_' + bucket;
	                assignments2[node.id] = cidb;
	                if (!clusters2[cidb]) {
	                    clusters2[cidb] = { id: cidb, type: 'cluster', name: 'Cluster ' + (Object.keys(clusters2).length + 1), nodes: [], connections: 0, radius: 20, clusterId: cidb, x: Math.random(), y: Math.random() };
	                }
	                clusters2[cidb].nodes.push(node);
	                clusters2[cidb].connections += node.connections || 0;
	            });

	            var clusterList2 = [];
	            for (var cidb2 in clusters2) {
	                var cb = clusters2[cidb2];
	                cb.radius = Math.max(8, Math.min(30, Math.sqrt(cb.nodes.length) * 3));
	                clusterList2.push(cb);
	            }

	            var edgeMap2 = {};
	            data.edges.forEach(function (e) {
	                var sc = assignments2[e.source];
	                var tc = assignments2[e.target];
	                if (!sc || !tc || sc === tc) return;
	                var key = sc < tc ? sc + '|' + tc : tc + '|' + sc;
	                if (edgeMap2[key]) edgeMap2[key].weight += e.weight;
	                else edgeMap2[key] = { source: sc, target: tc, weight: e.weight, types: ['cluster'], label: 'connection' };
	            });

	            var clusterEdges2 = [];
	            for (var ek2 in edgeMap2) clusterEdges2.push(edgeMap2[ek2]);
	            return { nodes: clusterList2, edges: clusterEdges2, clustered: true, clusterMap: clusters2 };
	        }

	        return { nodes: clusterList, edges: clusterEdges, clustered: true, clusterMap: clusters };
	    }

    function getColor(node) {
        if (node.type === 'cluster') return '#a29bfe';
        if (node.type === 'human') {
            var t = (node.threatLevel || 'None').toLowerCase();
            if (t === 'critical') return '#ff2222';
            if (t === 'high') return '#ff6b6b';
            if (t === 'medium') return '#ffd93d';
            if (t === 'low') return '#6bcf7f';
            return '#4d9de0';
        }
        return '#818cf8';
    }

    function render() {
        if (!graph.container || !graph.isActive) return;
        var rect = graph.container.getBoundingClientRect();
        graph.width = Math.max(rect.width || 0, 800);
        graph.height = Math.max(rect.height || 0, 600);
        
        if (graph.width === 0 || graph.height === 0) {
            console.warn('[GraphView] Container has 0 dimensions:', graph.width, 'x', graph.height);
        }

        if (graph.container.querySelector('canvas')) {
            graph.useCanvas = true;
            if (!graph.canvas) {
                graph.canvas = graph.container.querySelector('canvas');
                graph.ctx = graph.canvas.getContext('2d', { alpha: true });
            }
            graph.canvas.width = graph.width;
            graph.canvas.height = graph.height;
            graph.canvas.style.backgroundColor = 'transparent';
        }
    }

    function drawNode(ctx, node, scale) {
        var x = node.x;
        var y = node.y;
        var r = node.radius * Math.max(0.3, Math.min(2, scale));

        if (r < 1.5) {
            ctx.fillStyle = getColor(node);
            ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
            return;
        }

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = getColor(node);
        ctx.fill();

        if (node === graph.hoveredNode || node === graph.selectedNode) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        if (r > 6 && (node === graph.hoveredNode || node === graph.selectedNode || scale > 0.8)) {
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            var tw = ctx.measureText(node.name).width || 0;
            ctx.fillRect(x - tw / 2 - 3, y - r - 16, tw + 6, 14);
            ctx.fillStyle = '#fff';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(node.name, x, y - r - 5);
        }

        if (node.type === 'cluster' && r > 10) {
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(node.nodes ? node.nodes.length : '', x, y + 3);
        }
    }

	    function drawEdge(ctx, edge, scale) {
	        var s = edge.source;
	        var t = edge.target;
	        if (!s || !t) return;
        var dx = t.x - s.x;
        var dy = t.y - s.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 3000) return;

	        var w = Math.max(0.3, Math.min(3, edge.weight * 0.5));
	        var alpha = Math.min(0.35, 0.05 + w * 0.06);
	        if (graph.hoveredNode && graph.hoveredNode.id) {
	            var hid = graph.hoveredNode.id;
	            var sid = typeof s === 'object' ? s.id : s;
	            var tid = typeof t === 'object' ? t.id : t;
	            var connected = (sid === hid || tid === hid);
	            alpha = connected ? 0.95 : 0.05;
	            if (connected) w = Math.min(6, w + EDGE_WIDTH_HOVER_BOOST);
	        }
	        ctx.beginPath();
	        ctx.moveTo(s.x, s.y);
	        ctx.lineTo(t.x, t.y);
	        ctx.strokeStyle = 'rgba(255,255,255,' + alpha + ')';
	        ctx.lineWidth = w;
	        ctx.stroke();
	    }

    function renderCanvasFrame() {
        if (!graph.ctx || !graph.isActive) return;

        var ctx = graph.ctx;
        var w = graph.width;
        var h = graph.height;

        ctx.clearRect(0, 0, w, h);

        var transform = graph.zoom ? d3.zoomTransform(graph.svg.node()) : d3.zoomIdentity;
        ctx.save();
        ctx.translate(transform.x, transform.y);
        ctx.scale(transform.k, transform.k);

        var scale = transform.k;

        var edges = graph.simulation ? graph.simulation.edges() : graph.edges;
        edges.forEach(function (e) { drawEdge(ctx, e, scale); });

        var nodes = graph.simulation ? graph.simulation.nodes() : graph.nodes;
        nodes.forEach(function (n) {
            if (n.x < -100 || n.x > w / scale + 100 || n.y < -100 || n.y > h / scale + 100) return;
            drawNode(ctx, n, scale);
        });

        ctx.restore();
    }

	    function initCanvasRenderer() {
        if (!graph.container) return;

        var existing = graph.container.querySelector('canvas');
        if (existing) existing.remove();

        var canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
        canvas.style.backgroundColor = 'transparent';
        graph.container.appendChild(canvas);
        graph.canvas = canvas;
        graph.ctx = canvas.getContext('2d', { alpha: true });
        graph.useCanvas = true;

        render();
        
        console.log('[GraphView] Canvas initialized:', graph.width, 'x', graph.height);

        function loop() {
            if (!graph.isActive || !graph.simulation) return;
            renderCanvasFrame();
            graph.animFrame = requestAnimationFrame(loop);
        }
        loop();

	        var zoom = d3.zoom()
	            .scaleExtent(ZOOM_EXTENTS)
	            .on('zoom', function (event) {
	                renderCanvasFrame();
	                graph.zoomTransform = event.transform;
	            })
		            .on('end', function (event) {
		                graph.zoomTransform = event.transform;
		            })
	            .filter(function (event) {
	                return !event.ctrlKey && !event.button;
	            });

        var svg = d3.select(graph.container).select('svg');
        if (!svg.size()) {
            svg = d3.select(graph.container).append('svg')
                .style('position', 'absolute')
                .style('top', '0')
                .style('left', '0')
                .style('width', '0')
                .style('height', '0')
                .style('overflow', 'hidden')
                .style('pointer-events', 'none');
        }
        graph.svg = svg;
        graph.zoom = zoom;

        d3.select(graph.container).call(zoom);

	        function pickNodeAtEvent(event) {
	            var rect = graph.container.getBoundingClientRect();
	            var mx = event.clientX - rect.left;
	            var my = event.clientY - rect.top;
	            var nodes = graph.simulation.nodes();
	            var found = null;
	            var transform = graph.zoomTransform || d3.zoomIdentity;
	            for (var i = nodes.length - 1; i >= 0; i--) {
	                var n = nodes[i];
	                if (!n) continue;
	                var nx = n.x * transform.k + transform.x;
	                var ny = n.y * transform.k + transform.y;
	                var nr = n.radius * transform.k;
	                var dx = mx - nx;
	                var dy = my - ny;
	                if (dx * dx + dy * dy < (nr + 5) * (nr + 5)) {
	                    found = n;
	                    break;
	                }
	            }
	            return found;
	        }

	        // Canvas mode previously only expanded clusters on dblclick; make it work on single click too.
	        graph.container.addEventListener('click', function (event) {
	            var found = pickNodeAtEvent(event);
	            if (found) handleNodeClick(found);
	        });

	        graph.container.addEventListener('mousemove', function (event) {
	            var found = pickNodeAtEvent(event);
	            if (found !== graph.hoveredNode) {
	                graph.hoveredNode = found;
	                updateHoverCard(found || null);
	                renderCanvasFrame();
	            }
	        });

	        graph.container.addEventListener('dblclick', function (event) {
	            var found = pickNodeAtEvent(event);
	            if (found) handleNodeClick(found);
	        });
	    }

	    function handleNodeClick(node) {
	        if (!node) return;
	        graph.selectedNode = node;

	        if (node.type === 'cluster' && node.nodes) {
	            console.log('[GraphView] Cluster click:', node.id, 'size=', node.nodes.length, 'expanded=', !!node._expanded, 'clusteringEnabled=', !!graph.clusteringEnabled);
	            expandCluster(node);
	            return;
	        }

        if (typeof window.openDetailView === 'function') {
            window.openDetailView(node.id, node.type === 'human' ? 'human' : 'other');
        }
    }

			    function expandCluster(clusterNode) {
			        if (!clusterNode.nodes || clusterNode.nodes.length === 0) return;
			        if (clusterNode._expanded) return;
			        console.log('[GraphView] Expanding cluster:', clusterNode.id, 'size=', clusterNode.nodes.length);
			        clusterNode._expanded = true;

		        // Once the user drills into clusters, keep the view unclustered to avoid
		        // immediately re-clustering the expanded nodes.
		        graph.clusteringEnabled = false;

		        // Switching to an unclustered view avoids mixed cluster↔individual edges that can
		        // break link resolution and produce "stacked" layouts.
		        graph.clusterLookup = null;
		        graph.nodes = (graph.rawNodes || []).slice();
		        graph.edges = (graph.rawEdges || []).slice();

		        // Seed positions around the clicked cluster center so the first render isn't a pile.
		        if (typeof clusterNode.x === 'number' && typeof clusterNode.y === 'number') {
		            for (var si = 0; si < graph.nodes.length; si++) {
		                var n = graph.nodes[si];
		                if (!n || !n.id) continue;
		                var ang = Math.random() * Math.PI * 2;
		                var rad = 160 + Math.random() * 420;
		                n.x = clusterNode.x + Math.cos(ang) * rad;
		                n.y = clusterNode.y + Math.sin(ang) * rad;
		                n.vx = 0; n.vy = 0;
		            }
		        }

		        if (graph.simulation) {
		            graph.simulation.stop();
		        }

		        startSimulation(graph.nodes, graph.edges, graph.width, graph.height);

	        if (!graph.useCanvas) {
	            var t = graph.zoomTransform || (graph.zoom && graph.svg ? d3.zoomTransform(graph.svg.node()) : d3.zoomIdentity);
	            initSVGRenderer();
	            if (graph.zoom && graph.svg) {
	                try { graph.svg.call(graph.zoom.transform, t); } catch (e) {}
	            }
	        }
	    }

			    function startSimulation(nodes, edges, width, height) {
        if (graph.simulation) {
            graph.simulation.stop();
        }

        console.log('[GraphView] Starting simulation with', nodes.length, 'nodes and', edges.length, 'edges');

		        var useClustering = false;
		        graph.clusterLookup = null;

	        graph.nodes = nodes;
	        // Resolve any link endpoints to node objects (and drop broken links) so rendering is reliable.
	        var nodeById = {};
	        for (var ni = 0; ni < nodes.length; ni++) {
	            var nn = nodes[ni];
	            if (!nn) continue;
	            nodeById[String(nn.id)] = nn;
	        }
	        var resolvedEdges = [];
	        for (var ei = 0; ei < edges.length; ei++) {
	            var e0 = edges[ei];
	            if (!e0) continue;
	            var s0 = typeof e0.source === 'object' ? e0.source : nodeById[String(e0.source)];
	            var t0 = typeof e0.target === 'object' ? e0.target : nodeById[String(e0.target)];
	            if (!s0 || !t0) continue;
	            e0.source = s0;
	            e0.target = t0;
	            resolvedEdges.push(e0);
	        }
	        graph.edges = resolvedEdges;

        var centerX = width / 2;
        var centerY = height / 2;

		        var isClusteredView = false;
		        graph.simulation = d3.forceSimulation(nodes)
		            .force('charge', d3.forceManyBody()
	                .strength(function (n) {
	                    if (n.type === 'cluster') return -600;
	                    return isClusteredView ? -120 : -220;
	                })
	                .distanceMin(10)
	                .distanceMax(width * 2))
		            .force('link', d3.forceLink(resolvedEdges).id(function (d) { return d.id; })
	                .distance(function (e) {
	                    if (isClusteredView) return 120;
	                    var w = e.weight || 1;
	                    return 90 + 40 / Math.min(6, w);
	                })
	                .strength(function (e) {
	                    if (isClusteredView) return 0.5;
	                    return Math.min(1, (e.weight || 1) * 0.08);
	                }))
	            .force('center', d3.forceCenter(centerX, centerY))
	            .force('x', d3.forceX(centerX).strength(0.02))
	            .force('y', d3.forceY(centerY).strength(0.02))
	            .force('collision', d3.forceCollide(function (n) { return (n.radius || 8) + (isClusteredView ? 10 : 6); }).strength(1))
	            .alphaDecay(0.08)
	            .velocityDecay(0.7)
	            .on('tick', function () {
	                if (graph.useCanvas) {
	                    renderCanvasFrame();
	                } else if (graph.svg) {
	                    renderSVGTick();
	                }
	            });

	        // Ensure a sane starting position so the "pre-calc" doesn't begin as a pile.
	        for (var si = 0; si < nodes.length; si++) {
	            var n0 = nodes[si];
	            if (!n0) continue;
	            if (typeof n0.x !== 'number' || !isFinite(n0.x)) n0.x = centerX + (Math.random() - 0.5) * 200;
	            if (typeof n0.y !== 'number' || !isFinite(n0.y)) n0.y = centerY + (Math.random() - 0.5) * 200;
	            n0.vx = 0; n0.vy = 0;
	        }

	        // "Pre-calc" layout: run a fixed number of ticks synchronously and then cool it down.
	        try {
	            graph.simulation.alpha(1).restart();
	            var ticks = isClusteredView ? 200 : 1200;
	            for (var i = 0; i < ticks; i++) graph.simulation.tick();
	        } catch (e) {}
	        graph.simulation.alpha(0);
	        // Let the simulation continue idling a bit in the background so links settle.
	        // We'll freeze again on interaction (expand/refresh) by replacing the simulation.
	        setTimeout(function () {
	            if (!graph.simulation) return;
	            try { graph.simulation.alpha(0).stop(); } catch (e) {}
	        }, 0);
	        if (graph.useCanvas) renderCanvasFrame();
	        else renderSVGTick();

	        return { clustered: useClustering };
	    }

    function renderSVGTick() {
        if (!graph.svg) return;
        var transform = graph.zoom ? d3.zoomTransform(graph.svg.node()) : d3.zoomIdentity;

        try {
            graph.svg.selectAll('.edge')
                .attr('x1', function (d) { return d.source.x || 0; })
                .attr('y1', function (d) { return d.source.y || 0; })
                .attr('x2', function (d) { return d.target.x || 0; })
                .attr('y2', function (d) { return d.target.y || 0; });

            graph.svg.selectAll('.node')
                .attr('cx', function (d) { return d.x || 0; })
                .attr('cy', function (d) { return d.y || 0; });
        } catch (e) {
            console.warn('[GraphView] Error in renderSVGTick:', e);
        }
    }

	    function initSVGRenderer() {
	        if (!graph.container) return;
	        graph.useCanvas = false;

        var container = d3.select(graph.container);
        container.selectAll('*').remove();

        graph.svg = container.append('svg')
            .attr('width', graph.width)
            .attr('height', graph.height)
            .style('cursor', 'default')
            .style('background-color', 'transparent');
        
        console.log('[GraphView] SVG initialized:', graph.width, 'x', graph.height);

        var g = graph.svg.append('g');

	        graph.zoom = d3.zoom()
	            .scaleExtent(ZOOM_EXTENTS)
	            .on('zoom', function (event) {
	                g.attr('transform', event.transform);
	                graph.zoomTransform = event.transform;
	            })
		            .on('end', function (event) {
		                graph.zoomTransform = event.transform;
		            })
	            .filter(function (event) {
	                return !event.ctrlKey && !event.button;
	            });

        graph.svg.call(graph.zoom);

        graph.svg.on('dblclick.zoom', null);

	        var edges = graph.edges;
	        var edgeGroup = g.append('g').attr('class', 'edges');
		        var edgeLines = edgeGroup.selectAll('line')
		            .data(edges)
		            .enter().append('line')
		            .attr('class', 'edge')
		            .attr('stroke', 'rgba(255,255,255,0.18)')
		            .attr('stroke-width', function (d) { return Math.max(0.5, Math.min(3, (d.weight || 1) * 0.5)); })
		            .attr('stroke-opacity', EDGE_OPACITY_BASE)
		            .attr('x1', function (d) { return d.source && typeof d.source === 'object' ? (d.source.x || 0) : 0; })
		            .attr('y1', function (d) { return d.source && typeof d.source === 'object' ? (d.source.y || 0) : 0; })
		            .attr('x2', function (d) { return d.target && typeof d.target === 'object' ? (d.target.x || 0) : 0; })
		            .attr('y2', function (d) { return d.target && typeof d.target === 'object' ? (d.target.y || 0) : 0; });

	        function applyHoverEdgeHighlight(node) {
	            if (!graph.svg) return;
	            if (!node || !node.id) {
	                graph.svg.selectAll('.edge')
	                    .attr('stroke-opacity', EDGE_OPACITY_BASE)
	                    .attr('stroke-width', function (d) { return Math.max(0.5, Math.min(3, (d.weight || 1) * 0.5)); });
	                return;
	            }
	            var hid = node.id;
	            graph.svg.selectAll('.edge')
	                .attr('stroke-opacity', function (d) {
	                    var s = d.source && typeof d.source === 'object' ? d.source.id : d.source;
	                    var t = d.target && typeof d.target === 'object' ? d.target.id : d.target;
	                    return (s === hid || t === hid) ? EDGE_OPACITY_HOVER : EDGE_OPACITY_DIM;
	                })
	                .attr('stroke-width', function (d) {
	                    var base = Math.max(0.5, Math.min(3, (d.weight || 1) * 0.5));
	                    var s = d.source && typeof d.source === 'object' ? d.source.id : d.source;
	                    var t = d.target && typeof d.target === 'object' ? d.target.id : d.target;
	                    return (s === hid || t === hid) ? Math.min(6, base + EDGE_WIDTH_HOVER_BOOST) : base;
	                });
	        }

        var nodeGroup = g.append('g').attr('class', 'nodes');
	        var nodeCircles = nodeGroup.selectAll('circle')
	            .data(graph.nodes)
	            .enter().append('circle')
	            .attr('class', 'node')
	            .attr('r', function (d) { return d.radius; })
	            .attr('cx', function (d) { return d.x || 0; })
	            .attr('cy', function (d) { return d.y || 0; })
	            .attr('fill', function (d) { return getColor(d); })
	            .attr('stroke', 'rgba(255,255,255,0.2)')
	            .attr('stroke-width', 0.5)
	            .style('cursor', 'pointer')
            .on('click', function (event, d) {
                event.stopPropagation();
                handleNodeClick(d);
            })
	            .on('mouseenter', function (event, d) {
	                graph.hoveredNode = d;
	                applyHoverEdgeHighlight(d);
	                updateHoverCard(d);
	            })
	            .on('mouseleave', function () {
	                graph.hoveredNode = null;
	                applyHoverEdgeHighlight(null);
	                updateHoverCard(null);
	            });

        var labelGroup = g.append('g').attr('class', 'labels');
	        var labels = labelGroup.selectAll('text')
	            .data(graph.nodes.filter(function (d) { return d.radius > 6 && (d.type === 'cluster' || graph.nodes.length < 300); }))
	            .enter().append('text')
            .attr('class', 'node-label')
            .attr('text-anchor', 'middle')
            .attr('dy', function (d) { return d.radius + 14; })
	            .attr('fill', 'rgba(255,255,255,0.5)')
	            .attr('font-size', '9px')
	            .text(function (d) { return d.type === 'cluster' ? (d.name || 'Cluster') : d.name; });

	        graph.svg.on('click', function () {
	            graph.selectedNode = null;
	        });

	        // If we're running with a "pre-calculated" stopped simulation, we still need a final position paint.
	        renderSVGTick();
	    }

	    function initGraphView() {
	        var container = document.getElementById('graphViewContainer');
	        if (!container) {
	            console.warn('[GraphView] Container not found');
	            return;
	        }
	        graph.container = container;
	        graph.isActive = true;
	        graph.clusteringEnabled = false;

	        render();
	        
	        console.log('[GraphView] Container dimensions:', graph.width, 'x', graph.height);

	        var data = buildGraphData();
	        graph.rawNodes = data.nodes || [];
	        graph.rawEdges = data.edges || [];
        
        console.log('[GraphView] Built graph data:', {
            nodes: data.nodes ? data.nodes.length : 0,
            edges: data.edges ? data.edges.length : 0,
            storeAvailable: !!window.pazatorStore,
            pazatorDataAvailable: !!window.pazatorData
        });

        if (!data.nodes || data.nodes.length === 0) {
            console.warn('[GraphView] No nodes to render');
            container.innerHTML = '<div class="gv-empty"><i class="fas fa-project-diagram"></i><h3>No data to graph</h3><p>Add people, entities, and relationships to see the graph.</p></div>';
            return;
        }

	        var totalNodes = data.nodes.length;
	        graph.useCanvas = totalNodes > CANVAS_THRESHOLD;
	        var result = { clustered: false };

	        if (graph.useCanvas) {
	            initCanvasRenderer();
	            result = startSimulation(data.nodes, data.edges, graph.width, graph.height);
	        } else {
	            container.innerHTML = '';
	            var svgContainer = document.createElement('div');
	            svgContainer.style.width = '100%';
	            svgContainer.style.height = '100%';
	            svgContainer.style.position = 'relative';
	            svgContainer.style.overflow = 'hidden';
	            container.appendChild(svgContainer);
	            graph.container = svgContainer;
	            render();
	            // Important: startSimulation sets `graph.nodes`/`graph.edges` (and may cluster).
	            // initSVGRenderer must run after that so it binds to the actual node/edge arrays.
	            result = startSimulation(data.nodes, data.edges, graph.width, graph.height);
	            initSVGRenderer();
	        }

	        var nodeCountEl = document.getElementById('gvNodeCount');
	        var edgeCountEl = document.getElementById('gvEdgeCount');
	        var layoutEl = document.getElementById('gvLayoutInfo');
	        var modeEl = document.getElementById('gvModeInfo');
        if (nodeCountEl) nodeCountEl.textContent = totalNodes;
        if (edgeCountEl) edgeCountEl.textContent = data.edges.length;
        if (layoutEl) layoutEl.textContent = result.clustered ? 'force-directed + k-means' : 'force-directed';
        if (modeEl) modeEl.textContent = result.clustered ? 'clustered (' + graph.nodes.length + ' groups)' : (graph.useCanvas ? 'canvas' : 'svg');

        var refreshBtn = document.getElementById('graphViewRefreshBtn');
        if (refreshBtn) {
            refreshBtn.onclick = function() { refresh(); };
        }
    }

	    function refresh() {
        if (graph.simulation) {
            graph.simulation.stop();
            graph.simulation = null;
        }
        if (graph.animFrame) {
            cancelAnimationFrame(graph.animFrame);
            graph.animFrame = null;
        }
	        graph.nodes = [];
	        graph.edges = [];
	        graph.rawNodes = [];
	        graph.rawEdges = [];
	        graph.hoveredNode = null;
	        graph.selectedNode = null;
	        graph.clusteringEnabled = false;
	        if (graph.container) {
	            graph.container.innerHTML = '';
	        }
        graph.isActive = true;
        initGraphView();
    }

	    function destroy() {
        graph.isActive = false;
        if (graph.simulation) {
            graph.simulation.stop();
            graph.simulation = null;
        }
        if (graph.animFrame) {
            cancelAnimationFrame(graph.animFrame);
            graph.animFrame = null;
        }
	        graph.nodes = [];
	        graph.edges = [];
	        graph.rawNodes = [];
	        graph.rawEdges = [];
	        graph.hoveredNode = null;
	        graph.selectedNode = null;
	        if (graph.container) {
	            graph.container.innerHTML = '';
	        }
	    }

    window.pazatorGraphView = {
        init: initGraphView,
        refresh: refresh,
        destroy: destroy
    };
})();
