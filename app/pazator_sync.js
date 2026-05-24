(function() {
  const SYNC_CONFIG_KEY = 'pazator_sync_config';
  const SYNC_STATE_KEY = 'pazator_sync_state';

  let syncConfig = null;
  let syncState = null;

  function loadConfig() {
    try {
      const raw = localStorage.getItem(SYNC_CONFIG_KEY);
      syncConfig = raw ? JSON.parse(raw) : null;
    } catch (e) {
      syncConfig = null;
    }
    return syncConfig;
  }

  function saveConfig(config) {
    syncConfig = config;
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(SYNC_STATE_KEY);
      syncState = raw ? JSON.parse(raw) : { version: 0, lastSync: null, lastPush: null, lastPull: null };
    } catch (e) {
      syncState = { version: 0, lastSync: null, lastPush: null, lastPull: null };
    }
    return syncState;
  }

  function saveState(state) {
    syncState = state;
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
  }

  function getServerUrl() {
    if (!syncConfig) return null;
    let url = syncConfig.url || 'http://localhost:3456';
    if (url.endsWith('/')) url = url.slice(0, -1);
    return url;
  }

  function collectLocalData() {
    const data = {};
    const stores = ['humans', 'others', 'tags', 'cases', 'chats', 'relationships'];
    for (const store of stores) {
      const arr = window.pazatorStore && window.pazatorStore._data ? window.pazatorStore._data[store] : [];
      if (arr && arr.length > 0) {
        data[store] = {};
        for (const item of arr) {
          if (item && item.id) {
            data[store][item.id] = item;
          }
        }
      }
    }
    return data;
  }

  async function push() {
    const url = getServerUrl();
    if (!url) {
      window.PazatorUI && window.PazatorUI.showFloatingNotification('Configure sync server first', 'error', 3000);
      return { success: false, error: 'No sync server configured' };
    }

    const data = collectLocalData();
    if (Object.keys(data).length === 0) {
      window.PazatorUI && window.PazatorUI.showFloatingNotification('No data to push', 'warning', 2000);
      return { success: false, error: 'No data' };
    }

    try {
      const response = await fetch(`${url}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientVersion: syncState ? syncState.version : 0,
          stores: data
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `HTTP ${response.status}`);
      }

      const result = await response.json();
      syncState.version = result.version;
      syncState.lastSync = new Date().toISOString();
      syncState.lastPush = new Date().toISOString();
      saveState(syncState);

      window.PazatorUI && window.PazatorUI.showFloatingNotification(
        `Pushed: ${result.added} added, ${result.modified} modified`,
        result.added > 0 || result.modified > 0 ? 'success' : 'info',
        3000
      );
      return { success: true, result };
    } catch (e) {
      window.PazatorUI && window.PazatorUI.showFloatingNotification(`Push failed: ${e.message}`, 'error', 4000);
      return { success: false, error: e.message };
    }
  }

  async function pull() {
    const url = getServerUrl();
    if (!url) {
      window.PazatorUI && window.PazatorUI.showFloatingNotification('Configure sync server first', 'error', 3000);
      return { success: false, error: 'No sync server configured' };
    }

    try {
      const response = await fetch(`${url}/api/sync`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const result = await response.json();
      if (!result.data || Object.keys(result.data).length === 0) {
        window.PazatorUI && window.PazatorUI.showFloatingNotification('Server has no data', 'info', 2000);
        return { success: true, count: 0 };
      }

      let totalImported = 0;
      const stores = ['humans', 'others', 'tags', 'cases', 'chats', 'relationships'];
      for (const store of stores) {
        if (result.data[store]) {
          const items = Object.values(result.data[store]);
          if (items.length > 0 && window.pazatorStore && window.pazatorStore._data) {
            const existing = window.pazatorStore._data[store] || [];
            const existingIds = new Set(existing.map(e => e.id));
            for (const item of items) {
              if (!existingIds.has(item.id)) {
                existing.push(item);
                totalImported++;
              }
            }
            if (totalImported > 0 && window.pazatorStore.markDirty) {
              window.pazatorStore.markDirty(store);
            }
          }
        }
      }

      syncState.version = result.version;
      syncState.lastSync = new Date().toISOString();
      syncState.lastPull = new Date().toISOString();
      saveState(syncState);

      window.PazatorUI && window.PazatorUI.showFloatingNotification(
        `Pulled: ${totalImported} new records imported`,
        totalImported > 0 ? 'success' : 'info',
        3000
      );
      return { success: true, count: totalImported };
    } catch (e) {
      window.PazatorUI && window.PazatorUI.showFloatingNotification(`Pull failed: ${e.message}`, 'error', 4000);
      return { success: false, error: e.message };
    }
  }

  async function getChanges() {
    const url = getServerUrl();
    if (!url) return [];
    try {
      const response = await fetch(`${url}/api/sync/changes?since=${syncState ? syncState.version : 0}`);
      if (!response.ok) return [];
      return await response.json();
    } catch (e) {
      return [];
    }
  }

  async function getStatus() {
    const url = getServerUrl();
    if (!url) return null;
    try {
      const response = await fetch(`${url}/api/sync/status`);
      if (!response.ok) return null;
      return await response.json();
    } catch (e) {
      return null;
    }
  }

  function showConfigModal() {
    const existing = document.getElementById('syncConfigModal');
    if (existing) existing.remove();

    loadConfig();
    const modal = document.createElement('div');
    modal.id = 'syncConfigModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content sync-config-content">
        <button class="close" style="position:absolute;top:10px;left:10px;z-index:1001;">&times;</button>
        <div class="modal-header"><h2>Sync Server Configuration</h2></div>
        <div class="modal-body">
          <p style="color:#888;font-size:0.85rem;margin-bottom:16px;">
            Configure a Pazator Sync Server to push/pull your data. The server stores data as JSON files — no auth, no merge conflicts (resolved client-side).
          </p>
          <div class="form-group">
            <label>Server URL</label>
            <input type="url" id="syncServerUrl" class="form-control"
              placeholder="http://localhost:3456"
              value="${syncConfig && syncConfig.url ? syncConfig.url : 'http://localhost:3456'}">
          </div>
          <div class="form-group">
            <label>Label (optional)</label>
            <input type="text" id="syncServerLabel" class="form-control"
              placeholder="My server"
              value="${syncConfig && syncConfig.label ? syncConfig.label : ''}">
          </div>
          <div id="syncServerStatus" style="font-size:0.8rem;color:#888;margin-top:8px;"></div>
          <div id="syncServerInfo" style="display:none;margin-top:12px;padding:10px;border-radius:8px;background:rgba(0,0,0,0.2);font-size:0.8rem;"></div>
        </div>
        <div class="form-actions-horizontal">
          <button id="syncTestBtn" class="btn-enhanced glass-btn"><i class="fas fa-plug"></i> Test Connection</button>
          <button id="syncSaveBtn" class="btn-enhanced btn-primary"><i class="fas fa-save"></i> Save & Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('active'), 10);

    const closeBtn = modal.querySelector('.close');
    closeBtn.addEventListener('click', () => { modal.classList.remove('active'); setTimeout(() => modal.remove(), 300); });
    modal.addEventListener('click', (e) => { if (e.target === modal) { modal.classList.remove('active'); setTimeout(() => modal.remove(), 300); } });

    const statusEl = document.getElementById('syncServerStatus');
    const infoEl = document.getElementById('syncServerInfo');

    document.getElementById('syncTestBtn').addEventListener('click', async () => {
      const url = document.getElementById('syncServerUrl').value.trim().replace(/\/$/, '');
      statusEl.textContent = 'Testing connection...';
      statusEl.style.color = '#888';
      try {
        const resp = await fetch(`${url}/api/sync/status`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const status = await resp.json();
        statusEl.textContent = `Connected! Version ${status.version}, ${status.records} records, ${status.stores} stores.`;
        statusEl.style.color = '#4caf50';
        infoEl.style.display = 'block';
        infoEl.innerHTML = `
          <div><strong>Server:</strong> ${url}</div>
          <div><strong>Version:</strong> ${status.version}</div>
          <div><strong>Records:</strong> ${status.records}</div>
          <div><strong>Stores:</strong> ${status.stores}</div>
          <div><strong>Data size:</strong> ${(status.dataSizeBytes / 1024).toFixed(1)} KB</div>
          <div><strong>Total syncs:</strong> ${status.totalSyncs}</div>
          <div><strong>Last sync:</strong> ${status.lastSync ? new Date(status.lastSync).toLocaleString() : 'Never'}</div>
        `;
      } catch (e) {
        statusEl.textContent = `Connection failed: ${e.message}`;
        statusEl.style.color = '#f44336';
        infoEl.style.display = 'none';
      }
    });

    document.getElementById('syncSaveBtn').addEventListener('click', () => {
      const url = document.getElementById('syncServerUrl').value.trim();
      const label = document.getElementById('syncServerLabel').value.trim();
      if (!url) {
        statusEl.textContent = 'Server URL is required';
        statusEl.style.color = '#f44336';
        return;
      }
      saveConfig({ url: url.replace(/\/$/, ''), label: label || undefined });
      modal.classList.remove('active');
      setTimeout(() => modal.remove(), 300);
      window.PazatorUI && window.PazatorUI.showFloatingNotification('Sync config saved', 'success', 2000);
      updateSyncUI();
    });
  }

  function updateSyncUI() {
    loadConfig();
    loadState();
    const statusEl = document.getElementById('syncStatusIndicator');
    if (!statusEl) return;
    if (syncConfig) {
      const label = syncConfig.label || syncConfig.url.replace(/^https?:\/\//, '');
      const lastSync = syncState.lastSync ? new Date(syncState.lastSync).toLocaleString() : 'Never';
      statusEl.innerHTML = `<i class="fas fa-circle" style="color:#4caf50;font-size:8px;"></i> ${label} <span style="color:#555;font-size:0.7rem;">last: ${lastSync}</span>`;
      statusEl.title = `Sync server: ${syncConfig.url}\nLast push: ${syncState.lastPush ? new Date(syncState.lastPush).toLocaleString() : 'Never'}\nLast pull: ${syncState.lastPull ? new Date(syncState.lastPull).toLocaleString() : 'Never'}`;
    } else {
      statusEl.innerHTML = `<i class="fas fa-circle" style="color:#666;font-size:8px;"></i> Not configured`;
      statusEl.title = 'Click to configure sync server';
    }
  }

  async function handlePushClick(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('logoDropdownMenu');
    if (menu) menu.classList.remove('active');
    await push();
    updateSyncUI();
  }

  async function handlePullClick(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('logoDropdownMenu');
    if (menu) menu.classList.remove('active');
    await pull();
    updateSyncUI();
  }

  function handleConfigClick(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('logoDropdownMenu');
    if (menu) menu.classList.remove('active');
    showConfigModal();
  }

  document.addEventListener('DOMContentLoaded', function() {
    loadConfig();
    loadState();

    const pushOption = document.getElementById('pushOption');
    if (pushOption) pushOption.addEventListener('click', handlePushClick);

    const pullOption = document.getElementById('pullOption');
    if (pullOption) pullOption.addEventListener('click', handlePullClick);

    const syncConfigOption = document.getElementById('syncConfigOption');
    if (syncConfigOption) syncConfigOption.addEventListener('click', handleConfigClick);

    updateSyncUI();
  });

  window.pazatorSync = {
    push,
    pull,
    getChanges,
    getStatus,
    showConfigModal,
    updateSyncUI,
    getConfig: loadConfig,
    getState: loadState
  };
})();
