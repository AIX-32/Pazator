(function () {
  const GIS_CONFIG_KEY = 'pazator_gis_config';
  let gisLayers = {};
  let gisSourcesAdded = false;
  let geocoderControl = null;
  let heatmapLayerIds = [];

  function loadConfig() {
    try {
      const raw = localStorage.getItem(GIS_CONFIG_KEY);
      return raw ? JSON.parse(raw) : { heatmap: true, clusters: true, labels: true };
    } catch (e) {
      return { heatmap: true, clusters: true, labels: true };
    }
  }

  function saveConfig(config) {
    localStorage.setItem(GIS_CONFIG_KEY, JSON.stringify(config));
  }

  function getTrackerMap() {
    return (typeof trackerMap !== 'undefined' ? trackerMap : null) || null;
  }

  function collectGeoEntities() {
    const entities = [];
    const data = window.pazatorStore && window.pazatorStore._data;
    if (!data) return entities;

    for (const h of (data.humans || [])) {
      if (h.latitude != null && h.longitude != null) {
        entities.push({
          id: h.id,
          name: h.name || 'Unknown',
          type: 'human',
          lat: parseFloat(h.latitude),
          lng: parseFloat(h.longitude),
          threatLevel: h.threatLevel || 'unknown',
          credit: h.credit || 0,
          tags: h.tags || [],
          description: h.occupation || h.workplace || ''
        });
      }
    }
    for (const o of (data.others || [])) {
      if (o.latitude != null && o.longitude != null) {
        entities.push({
          id: o.id,
          name: o.name || 'Unknown',
          type: 'other',
          lat: parseFloat(o.latitude),
          lng: parseFloat(o.longitude),
          threatLevel: 'unknown',
          credit: 0,
          tags: o.tags || [],
          description: o.type || o.note || ''
        });
      }
    }
    return entities;
  }

  function getThreatColor(threatLevel) {
    const colors = {
      'critical': '#ff0000',
      'high': '#ff4444',
      'medium': '#ffaa00',
      'low': '#44bb44',
      'none': '#888888',
      'unknown': '#888888'
    };
    return colors[threatLevel ? threatLevel.toLowerCase() : 'unknown'] || '#888888';
  }

  function addGeoEntitySources(map) {
    if (!map || typeof map.getSource !== 'function') return;
    if (gisSourcesAdded) return;

    const entities = collectGeoEntities();

    if (!map.getSource('pazator-entities')) {
      map.addSource('pazator-entities', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: entities.map(e => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
            properties: {
              id: e.id,
              name: e.name,
              type: e.type,
              threatLevel: e.threatLevel,
              credit: e.credit,
              tags: (e.tags || []).join(', '),
              description: e.description
            }
          }))
        },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });
    }

    gisSourcesAdded = true;
  }

  function addLayers(map) {
    if (!map) return;
    addGeoEntitySources(map);

    const existingLayerIds = [];
    try {
      if (map.getLayer) {
        const style = map.getStyle();
        if (style && style.layers) {
          for (const l of style.layers) existingLayerIds.push(l.id);
        }
      }
    } catch (e) { }

    if (!existingLayerIds.includes('pazator-clusters')) {
      map.addLayer({
        id: 'pazator-clusters',
        type: 'circle',
        source: 'pazator-entities',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step', ['get', 'point_count'],
            '#818cf8', 10, '#6366f1', 50, '#4f46e5'
          ],
          'circle-radius': [
            'step', ['get', 'point_count'],
            20, 10, 30, 50, 40
          ],
          'circle-opacity': 0.7,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff'
        }
      });
    }

    if (!existingLayerIds.includes('pazator-cluster-count')) {
      map.addLayer({
        id: 'pazator-cluster-count',
        type: 'symbol',
        source: 'pazator-entities',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12
        },
        paint: {
          'text-color': '#ffffff'
        }
      });
    }

    if (!existingLayerIds.includes('pazator-entity-points')) {
      map.addLayer({
        id: 'pazator-entity-points',
        type: 'circle',
        source: 'pazator-entities',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['get', 'threatLevel'],
          'circle-radius': 8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
          'circle-opacity': 0.8
        }
      });
    }

    addHeatmapLayer(map, existingLayerIds);
  }

  function addHeatmapLayer(map, existingIds) {
    if (!map) return;
    const config = loadConfig();
    if (!config.heatmap) return;

    if (!existingIds) {
      try {
        if (map.getLayer) {
          const style = map.getStyle();
          existingIds = [];
          if (style && style.layers) {
            for (const l of style.layers) existingIds.push(l.id);
          }
        }
      } catch (e) { existingIds = []; }
    }

    if (!existingIds.includes('pazator-heatmap')) {
      map.addLayer({
        id: 'pazator-heatmap',
        type: 'heatmap',
        source: 'pazator-entities',
        paint: {
          'heatmap-weight': ['get', 'credit'],
          'heatmap-intensity': 0.6,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(33,102,172,0)',
            0.2, 'rgb(103,169,207)',
            0.4, 'rgb(209,229,240)',
            0.6, 'rgb(253,219,199)',
            0.8, 'rgb(239,138,98)',
            1, 'rgb(178,24,43)'
          ],
          'heatmap-radius': 30,
          'heatmap-opacity': 0.6
        }
      });
      heatmapLayerIds.push('pazator-heatmap');
    }
  }

  function toggleHeatmap(visible) {
    const map = getTrackerMap();
    if (!map) return;
    const config = loadConfig();
    config.heatmap = visible;
    saveConfig(config);

    try {
      if (visible) {
        if (!map.getLayer('pazator-heatmap')) {
          addHeatmapLayer(map);
        } else {
          map.setLayoutProperty('pazator-heatmap', 'visibility', 'visible');
        }
      } else {
        if (map.getLayer('pazator-heatmap')) {
          map.setLayoutProperty('pazator-heatmap', 'visibility', 'none');
        }
      }
    } catch (e) {
      if (visible) addHeatmapLayer(map);
    }
  }

  function toggleClusters(visible) {
    const map = getTrackerMap();
    if (!map) return;
    const config = loadConfig();
    config.clusters = visible;
    saveConfig(config);

    try {
      ['pazator-clusters', 'pazator-cluster-count', 'pazator-entity-points'].forEach(id => {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
        }
      });
    } catch (e) { }
  }

  function refreshEntities() {
    const map = getTrackerMap();
    if (!map) return;

    try {
      if (map.getSource('pazator-entities')) {
        const entities = collectGeoEntities();
        map.getSource('pazator-entities').setData({
          type: 'FeatureCollection',
          features: entities.map(e => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
            properties: {
              id: e.id,
              name: e.name,
              type: e.type,
              threatLevel: e.threatLevel,
              credit: e.credit,
              tags: (e.tags || []).join(', '),
              description: e.description
            }
          }))
        });
      }
    } catch (e) { }
  }

  async function geocode(query) {
    if (!query || query.trim().length < 2) return [];
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
        { headers: { 'User-Agent': 'Pazator/1.0' } }
      );
      if (!resp.ok) return [];
      return await resp.json();
    } catch (e) {
      return [];
    }
  }

  async function reverseGeocode(lat, lng) {
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
        { headers: { 'User-Agent': 'Pazator/1.0' } }
      );
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) {
      return null;
    }
  }

  function flyTo(lat, lng, zoom) {
    const map = getTrackerMap();
    if (!map) return;
    map.flyTo({ center: [lng, lat], zoom: zoom || 12, duration: 1500 });
  }

  function fitAllEntities() {
    const map = getTrackerMap();
    if (!map) return;
    const entities = collectGeoEntities();
    if (entities.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    entities.forEach(e => bounds.extend([e.lng, e.lat]));
    map.fitBounds(bounds, { padding: 50, duration: 1000 });
  }

  function initGISPanel() {
    if (document.getElementById('gisPanel')) return;

    const sidebar = document.querySelector('.tracker-sidebar');
    if (!sidebar) return;

    const panel = document.createElement('div');
    panel.id = 'gisPanel';
    panel.className = 'sidebar-section sidebar-mini';
    panel.innerHTML = `
      <div class="sidebar-section-header">
        <i class="fas fa-globe"></i>
        <h3>GIS Layers</h3>
        <i class="fas fa-chevron-down sidebar-section-toggle"></i>
        <button id="gisRefreshBtn" class="btn glass-btn" style="padding:4px 8px;font-size:0.7rem;flex-shrink:0;">
          <i class="fas fa-sync"></i>
        </button>
      </div>
      <div class="sidebar-section-body">
        <div style="display:flex;flex-direction:column;gap:6px;">
          <label class="gis-toggle" style="display:flex;align-items:center;gap:8px;font-size:0.8rem;cursor:pointer;">
            <input type="checkbox" id="gisHeatmapToggle" checked>
            <span>Heatmap</span>
          </label>
          <label class="gis-toggle" style="display:flex;align-items:center;gap:8px;font-size:0.8rem;cursor:pointer;">
            <input type="checkbox" id="gisClustersToggle" checked>
            <span>Clusters</span>
          </label>
        </div>
        <div style="margin-top:8px;">
          <div style="display:flex;gap:6px;">
            <input type="text" id="gisGeocodeInput" class="form-control" placeholder="Search location..."
              style="flex:1;padding:6px 8px;font-size:0.8rem;background:rgba(20,20,20,0.6);border:1px solid var(--border-color);color:#ddd;border-radius:7px;">
            <button id="gisGeocodeBtn" class="btn btn-primary" style="padding:6px 10px;font-size:0.8rem;">
              <i class="fas fa-search"></i>
            </button>
          </div>
          <div id="gisGeocodeResults" style="display:none;margin-top:6px;background:rgba(0,0,0,0.3);border-radius:6px;max-height:150px;overflow-y:auto;"></div>
        </div>
        <div style="margin-top:8px;display:flex;gap:6px;">
          <button id="gisFitAllBtn" class="btn glass-btn" style="flex:1;padding:6px;font-size:0.75rem;">
            <i class="fas fa-expand"></i> Fit All
          </button>
        </div>
        <div id="entityLocationCount" style="margin-top:6px;font-size:0.75rem;color:#888;text-align:center;"></div>
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <span style="font-size:0.75rem;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Custom Layers</span>
            <button id="gisAddLayerBtn" class="btn glass-btn" style="padding:3px 8px;font-size:0.65rem;">
              <i class="fas fa-plus"></i> Add
            </button>
          </div>
          <div id="gisCustomLayersList"></div>
        </div>
      </div>
    `;

    const connectSection = sidebar.querySelector('.sidebar-section:nth-child(3)');
    if (connectSection) {
      connectSection.parentNode.insertBefore(panel, connectSection);
    } else {
      sidebar.appendChild(panel);
    }

    document.getElementById('gisHeatmapToggle').addEventListener('change', function () {
      toggleHeatmap(this.checked);
    });
    document.getElementById('gisClustersToggle').addEventListener('change', function () {
      toggleClusters(this.checked);
    });
    document.getElementById('gisRefreshBtn').addEventListener('click', function () {
      refreshEntities();
      updateEntityCount();
      window.PazatorUI && window.PazatorUI.showFloatingNotification('GIS data refreshed', 'info', 1500);
    });
    document.getElementById('gisFitAllBtn').addEventListener('click', fitAllEntities);

    var addLayerBtn = document.getElementById('gisAddLayerBtn');
    if (addLayerBtn) addLayerBtn.addEventListener('click', showAddLayerModal);

    const geocodeInput = document.getElementById('gisGeocodeInput');
    const geocodeBtn = document.getElementById('gisGeocodeBtn');
    const geocodeResults = document.getElementById('gisGeocodeResults');

    async function doGeocode() {
      const query = geocodeInput.value.trim();
      if (!query) return;
      geocodeResults.style.display = 'block';
      geocodeResults.innerHTML = '<div style="color:#888;padding:8px;font-size:0.8rem;">Searching...</div>';
      const results = await geocode(query);
      if (results.length === 0) {
        geocodeResults.innerHTML = '<div style="color:#888;padding:8px;font-size:0.8rem;">No results found</div>';
        return;
      }
      geocodeResults.innerHTML = results.map(r => `
        <div class="gis-geocode-item" data-lat="${r.lat}" data-lon="${r.lon}"
          style="padding:8px 10px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.8rem;transition:background 0.2s;"
          onmouseover="this.style.background='rgba(255,255,255,0.05)'"
          onmouseout="this.style.background='transparent'">
          <div style="color:#ddd;">${r.display_name}</div>
        </div>
      `).join('');
      geocodeResults.querySelectorAll('.gis-geocode-item').forEach(el => {
        el.addEventListener('click', function () {
          const lat = parseFloat(this.dataset.lat);
          const lon = parseFloat(this.dataset.lon);
          flyTo(lat, lon, 14);
          geocodeResults.style.display = 'none';
          geocodeInput.value = this.textContent.trim().split(',')[0];
        });
      });
    }

    geocodeBtn.addEventListener('click', doGeocode);
    geocodeInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doGeocode();
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#gisGeocodeResults') && !e.target.closest('#gisGeocodeInput') && !e.target.closest('#gisGeocodeBtn')) {
        geocodeResults.style.display = 'none';
      }
    });

    updateEntityCount();
  }

  function updateEntityCount() {
    const el = document.getElementById('entityLocationCount');
    if (!el) return;
    const entities = collectGeoEntities();
    el.textContent = `${entities.length} entities with location data`;
  }

  function setupEntityClickHandler(map) {
    if (!map) return;
    if (map._pazatorClickHandler) return;
    map._pazatorClickHandler = true;

    map.on('click', 'pazator-entity-points', function (e) {
      if (!e.features || e.features.length === 0) return;
      const feature = e.features[0];
      const props = feature.properties;
      if (!props) return;

      const entityId = props.id;
      const entityName = props.name || 'Unknown';

      if (window.PazatorUI) {
        window.PazatorUI.showFloatingNotification(
          `${entityName} — click to open detail view`,
          'info',
          3000
        );
      }
    });

    map.on('click', 'pazator-clusters', function (e) {
      if (!e.features || e.features.length === 0) return;
      const feature = e.features[0];
      const clusterId = feature.properties.cluster_id;
      const source = map.getSource('pazator-entities');
      if (source) {
        source.getClusterExpansionZoom(clusterId, function (err, zoom) {
          if (err) return;
          const geometry = feature.geometry;
          if (geometry) {
            map.easeTo({
              center: geometry.coordinates,
              zoom: zoom + 1,
              duration: 500
            });
          }
        });
      }
    });

    map.on('mouseenter', 'pazator-entity-points', function () {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'pazator-entity-points', function () {
      map.getCanvas().style.cursor = '';
    });
  }

  var GIS_LAYERS_KEY = 'pazator_gis_layers';
  var customLayers = [];

  function loadCustomLayers() {
    try {
      var raw = localStorage.getItem(GIS_LAYERS_KEY);
      customLayers = raw ? JSON.parse(raw) : [];
    } catch (e) {
      customLayers = [];
    }
  }

  function saveCustomLayers() {
    localStorage.setItem(GIS_LAYERS_KEY, JSON.stringify(customLayers));
  }

  function normalizeGeoJSON(data) {
    if (!data) return null;
    if (data.type === 'FeatureCollection') return data;
    if (data.type === 'Feature') return { type: 'FeatureCollection', features: [data] };
    if (['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection'].indexOf(data.type) !== -1) {
      return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: data, properties: {} }] };
    }
    return null;
  }

  function detectGeoTypes(fc) {
    var types = {};
    var features = fc.features || [];
    for (var i = 0; i < features.length; i++) {
      var geom = features[i].geometry;
      if (geom && geom.type) {
        var base = geom.type.indexOf('Multi') === 0 ? geom.type.replace('Multi', '') : geom.type;
        types[base] = true;
      }
    }
    return types;
  }

  function addCustomLayerToMap(map, layer) {
    if (!map || !layer || !layer.geojson) return;
    var srcId = 'pazator-custom-' + layer.id;
    if (map.getSource(srcId)) return;

    var fc = normalizeGeoJSON(layer.geojson);
    if (!fc) return;

    try {
      map.addSource(srcId, { type: 'geojson', data: fc });
    } catch (e) {
      return;
    }

    var color = layer.color || '#818cf8';
    var types = detectGeoTypes(fc);

    if (types.Circle || types.Point) {
      var circleId = srcId + '-circle';
      if (!map.getLayer(circleId)) {
        map.addLayer({
          id: circleId,
          type: 'circle',
          source: srcId,
          filter: ['in', '$type', 'Point', 'MultiPoint'],
          paint: {
            'circle-color': color,
            'circle-radius': 7,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
            'circle-opacity': 0.85
          }
        });
      }
      var labelId = srcId + '-label';
      if (!map.getLayer(labelId)) {
        map.addLayer({
          id: labelId,
          type: 'symbol',
          source: srcId,
          filter: ['in', '$type', 'Point', 'MultiPoint'],
          layout: {
            'text-field': ['get', 'name'],
            'text-offset': [0, 1.5],
            'text-size': 11,
            'text-anchor': 'top',
            'text-optional': true
          },
          paint: {
            'text-color': '#fff',
            'text-halo-color': '#000',
            'text-halo-width': 1
          }
        });
      }
    }

    if (types.LineString) {
      var lineId = srcId + '-line';
      if (!map.getLayer(lineId)) {
        map.addLayer({
          id: lineId,
          type: 'line',
          source: srcId,
          filter: ['in', '$type', 'LineString', 'MultiLineString'],
          paint: {
            'line-color': color,
            'line-width': 3,
            'line-opacity': 0.85
          }
        });
      }
    }

    if (types.Polygon) {
      var fillId = srcId + '-fill';
      if (!map.getLayer(fillId)) {
        map.addLayer({
          id: fillId,
          type: 'fill',
          source: srcId,
          filter: ['in', '$type', 'Polygon', 'MultiPolygon'],
          paint: {
            'fill-color': color,
            'fill-opacity': 0.3,
            'fill-outline-color': color
          }
        });
      }
    }
  }

  function removeCustomLayerFromMap(map, layerId) {
    if (!map) return;
    var prefix = 'pazator-custom-' + layerId;
    var ids = [prefix + '-circle', prefix + '-label', prefix + '-line', prefix + '-fill'];
    for (var i = 0; i < ids.length; i++) {
      try { if (map.getLayer(ids[i])) map.removeLayer(ids[i]); } catch (e) {}
    }
    try { if (map.getSource(prefix)) map.removeSource(prefix); } catch (e) {}
  }

  function syncCustomLayerVisibility(map, layer) {
    if (!map) return;
    var prefix = 'pazator-custom-' + layer.id;
    var visible = layer.visible !== false;
    var ids = [prefix + '-circle', prefix + '-label', prefix + '-line', prefix + '-fill'];
    for (var i = 0; i < ids.length; i++) {
      try {
        if (map.getLayer(ids[i])) {
          map.setLayoutProperty(ids[i], 'visibility', visible ? 'visible' : 'none');
        }
      } catch (e) {}
    }
  }

  function renderCustomLayerList() {
    var container = document.getElementById('gisCustomLayersList');
    if (!container) return;

    if (customLayers.length === 0) {
      container.innerHTML = '<div style="font-size:0.75rem;color:#666;padding:4px 0;">No custom layers added yet.</div>';
      return;
    }

    container.innerHTML = customLayers.map(function (layer) {
      var visible = layer.visible !== false;
      return '<div class="gis-custom-layer" data-id="' + layer.id + '" style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:0.8rem;">' +
        '<input type="checkbox" ' + (visible ? 'checked' : '') + ' class="gis-layer-toggle" style="cursor:pointer;">' +
        '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + (layer.color || '#818cf8') + ';flex-shrink:0;"></span>' +
        '<span style="flex:1;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(layer.name) + '</span>' +
        '<button class="gis-layer-delete" style="background:none;border:none;color:#ff6b6b;cursor:pointer;padding:2px 4px;font-size:0.7rem;">&times;</button>' +
        '</div>';
    }).join('');

    container.querySelectorAll('.gis-layer-toggle').forEach(function (cb, idx) {
      cb.addEventListener('change', function () {
        var layer = customLayers[idx];
        if (layer) {
          layer.visible = this.checked;
          saveCustomLayers();
          var map = getTrackerMap();
          if (map) syncCustomLayerVisibility(map, layer);
        }
      });
    });

    container.querySelectorAll('.gis-layer-delete').forEach(function (btn, idx) {
      btn.addEventListener('click', function () {
        var layer = customLayers[idx];
        if (layer) {
          var map = getTrackerMap();
          if (map) removeCustomLayerFromMap(map, layer.id);
          customLayers.splice(idx, 1);
          saveCustomLayers();
          renderCustomLayerList();
        }
      });
    });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }

  function showAddLayerModal() {
    if (typeof showModal !== 'function') return;
    showModal({
      title: 'Add Custom Layer',
      type: 'info',
      html: '<div style="display:flex;flex-direction:column;gap:10px;">' +
        '<label style="font-size:0.8rem;color:#aaa;">Layer Name</label>' +
        '<input id="addLayerName" class="form-control input-flat" style="padding:8px;font-size:0.85rem;" placeholder="My Layer">' +
        '<label style="font-size:0.8rem;color:#aaa;">Color</label>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;" id="addLayerColors">' +
        ['#818cf8','#ff6b6b','#6bcf7f','#ffd93d','#ff9f43','#00d2d3','#a29bfe','#fd79a8'].map(function (c) {
          return '<span class="gis-color-swatch" data-color="' + c + '" style="display:inline-block;width:28px;height:28px;border-radius:50%;background:' + c + ';cursor:pointer;border:2px solid transparent;"></span>';
        }).join('') +
        '</div>' +
        '<label style="font-size:0.8rem;color:#aaa;">GeoJSON</label>' +
        '<textarea id="addLayerGeoJSON" class="form-control input-flat" style="padding:8px;font-size:0.8rem;font-family:monospace;min-height:160px;resize:vertical;" placeholder="Paste GeoJSON here or use Import button..."></textarea>' +
        '<div style="display:flex;gap:6px;">' +
        '<button id="addLayerImportBtn" class="btn glass-btn" style="flex:1;padding:8px;font-size:0.8rem;"><i class="fas fa-file-upload"></i> Import File</button>' +
        '</div>' +
        '</div>',
      buttons: [
        { text: 'Cancel', primary: false },
        { text: 'Add Layer', primary: true, onClick: function () {
          var name = document.getElementById('addLayerName').value.trim();
          var geojsonText = document.getElementById('addLayerGeoJSON').value.trim();
          var colorEl = document.querySelector('#addLayerColors .gis-color-swatch.selected');
          var color = colorEl ? colorEl.dataset.color : '#818cf8';
          if (!name) { showAlert('Please enter a layer name.'); return; }
          if (!geojsonText) { showAlert('Please paste GeoJSON or import a file.'); return; }
          var geojson;
          try { geojson = JSON.parse(geojsonText); } catch (e) { showAlert('Invalid JSON: ' + e.message); return; }
          var fc = normalizeGeoJSON(geojson);
          if (!fc) { showAlert('Invalid GeoJSON. Must be a Feature, FeatureCollection, or geometry object.'); return; }
          var layer = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name: name,
            color: color,
            geojson: fc,
            visible: true
          };
          customLayers.push(layer);
          saveCustomLayers();
          var map = getTrackerMap();
          if (map) addCustomLayerToMap(map, layer);
          renderCustomLayerList();
        }}
      ]
    });

    setTimeout(function () {
      var swatches = document.querySelectorAll('#addLayerColors .gis-color-swatch');
      swatches.forEach(function (s) {
        s.addEventListener('click', function () {
          swatches.forEach(function (x) { x.style.borderColor = 'transparent'; });
          this.style.borderColor = '#fff';
          this.classList.add('selected');
        });
      });
      swatches[0] && swatches[0].click();

      document.getElementById('addLayerImportBtn').addEventListener('click', function () {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.geojson,.json';
        input.addEventListener('change', function () {
          var file = input.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function (e) {
            document.getElementById('addLayerGeoJSON').value = e.target.result;
          };
          reader.readAsText(file);
        });
        input.click();
      });
    }, 50);
  }

  function initCustomLayers(map) {
    loadCustomLayers();
    for (var i = 0; i < customLayers.length; i++) {
      addCustomLayerToMap(map, customLayers[i]);
    }
    renderCustomLayerList();
  }

  function init() {
    const map = getTrackerMap();
    if (map) {
      addLayers(map);
      setupEntityClickHandler(map);
      initCustomLayers(map);
    }
    initGISPanel();
  }

  window.pazatorGIS = {
    init,
    addLayers,
    refreshEntities,
    geocode,
    reverseGeocode,
    flyTo,
    fitAllEntities,
    toggleHeatmap,
    toggleClusters,
    collectGeoEntities,
    updateEntityCount
  };
})();
