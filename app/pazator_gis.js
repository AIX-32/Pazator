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
        <button id="gisRefreshBtn" class="btn glass-btn" style="padding:4px 8px;font-size:0.7rem;margin-left:auto;">
          <i class="fas fa-sync"></i>
        </button>
      </div>
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

  function init() {
    const map = getTrackerMap();
    if (map) {
      addLayers(map);
      setupEntityClickHandler(map);
    }
    initGISPanel();
  }

  const origEnsure = window.ensureTrackerTabReady || function () { };
  window.ensureTrackerTabReady = function () {
    origEnsure();
    setTimeout(init, 500);
  };

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      const map = getTrackerMap();
      if (map) {
        addLayers(map);
        setupEntityClickHandler(map);
      }
    }, 1000);
    setTimeout(initGISPanel, 1500);
    setTimeout(updateEntityCount, 2000);
  });

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
