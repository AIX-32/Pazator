(function () {
  const SYNC_CONFIG_KEY = 'pazator_sync_config';
  const SYNC_STATE_KEY = 'pazator_sync_state';
  const AUTH_TOKEN_KEY = 'pazator_auth_token';
  const USER_CACHE_KEY = 'pazator_user_cache';

  let syncConfig = null;
  let syncState = null;
  let authToken = null;
  let currentUser = null;
  let serverConnected;
  let retryTimer = null;

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

  function loadAuthToken() {
    try {
      authToken = localStorage.getItem(AUTH_TOKEN_KEY);
    } catch (e) {
      authToken = null;
    }
    return authToken;
  }

  function saveAuthToken(token) {
    authToken = token;
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(USER_CACHE_KEY);
      currentUser = null;
    }
  }

  function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = 'Bearer ' + authToken;
    }
    return headers;
  }

  function getServerUrl() {
    if (!syncConfig) return null;
    let url = syncConfig.url || 'http://localhost:3456';
    if (url.endsWith('/')) url = url.slice(0, -1);
    return url;
  }

  async function apiFetch(path, options) {
    const url = getServerUrl();
    if (!url) throw new Error('No sync server configured');
    options = options || {};
    const resp = await fetch(url + path, {
      ...options,
      headers: { ...getAuthHeaders(), ...(options.headers || {}) }
    });
    if (resp.status === 401) {
      saveAuthToken(null);
      updateSyncUI();
      throw new Error('Session expired. Please log in again.');
    }
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }
    return resp.json();
  }

  async function login(username, password) {
    const url = getServerUrl();
    if (!url) throw new Error('Configure sync server first');
    const resp = await fetch(url + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Login failed' }));
      throw new Error(err.error);
    }
    const result = await resp.json();
    saveAuthToken(result.token);
    currentUser = result.user;
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(result.user));
    updateSyncUI();
    return result;
  }

  async function register(username, password) {
    const url = getServerUrl();
    if (!url) throw new Error('Configure sync server first');
    const resp = await fetch(url + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Registration failed' }));
      throw new Error(err.error);
    }
    const result = await resp.json();
    saveAuthToken(result.token);
    currentUser = result.user;
    updateSyncUI();
    return result;
  }

  async function logout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    saveAuthToken(null);
    currentUser = null;
    updateSyncUI();
  }

  function loadUserCache() {
    try {
      const raw = localStorage.getItem(USER_CACHE_KEY);
      if (raw) currentUser = JSON.parse(raw);
    } catch (e) { /* ignore */ }
  }

  async function fetchCurrentUser() {
    try {
      const result = await apiFetch('/api/auth/me');
      currentUser = result.user;
      serverConnected = true;
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(result.user));
      updateSyncUI();
      return result.user;
    } catch (e) {
      if (authToken) {
        currentUser = currentUser || null;
      } else {
        currentUser = null;
      }
      serverConnected = false;
      updateSyncUI();
      return null;
    }
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
    try {
      if (!authToken) { showConfigModal(); return { success: false, error: 'Not logged in' }; }
      const data = collectLocalData();
      if (Object.keys(data).length === 0) {
        window.PazatorUI && window.PazatorUI.showFloatingNotification('No data to push', 'warning', 2000);
        return { success: false, error: 'No data' };
      }
      const result = await apiFetch('/api/sync', {
        method: 'POST',
        body: JSON.stringify({
          clientVersion: syncState ? syncState.version : 0,
          stores: data
        })
      });
      syncState.version = result.version;
      syncState.lastSync = new Date().toISOString();
      syncState.lastPush = new Date().toISOString();
      saveState(syncState);
      window.PazatorUI && window.PazatorUI.showFloatingNotification(
        `Pushed: ${result.added} added, ${result.modified} modified`,
        result.added > 0 || result.modified > 0 ? 'success' : 'info',
        3000
      );
      updateSyncUI();
      return { success: true, result };
    } catch (e) {
      window.PazatorUI && window.PazatorUI.showFloatingNotification(`Push failed: ${e.message}`, 'error', 4000);
      return { success: false, error: e.message };
    }
  }

  async function pull() {
    try {
      if (!authToken) { showConfigModal(); return { success: false, error: 'Not logged in' }; }
      const result = await apiFetch('/api/sync');
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
      updateSyncUI();
      return { success: true, count: totalImported };
    } catch (e) {
      window.PazatorUI && window.PazatorUI.showFloatingNotification(`Pull failed: ${e.message}`, 'error', 4000);
      return { success: false, error: e.message };
    }
  }

  async function getChanges() {
    try {
      return await apiFetch('/api/sync/changes?since=' + (syncState ? syncState.version : 0));
    } catch (e) {
      return [];
    }
  }

  async function getStatus() {
    try {
      return await apiFetch('/api/sync/status');
    } catch (e) {
      return null;
    }
  }

  function showConfigModal() {
    loadConfig();
    loadAuthToken();
    if (authToken && !currentUser) {
      fetchCurrentUser().then(() => { if (currentUser) showConfigModal(); });
      return;
    }

    const existing = document.getElementById('syncConfigModal');
    if (existing) existing.remove();

    const serverUrl = syncConfig && syncConfig.url ? syncConfig.url : 'http://localhost:3456';
    const serverLabel = syncConfig && syncConfig.label ? syncConfig.label : '';

    const loggedInCard = currentUser
      ? '<div style="display:flex;align-items:center;gap:10px;">' +
        '<span style="width:34px;height:34px;border-radius:50%;background:linear-gradient(145deg,#4d9de0,#3a7fc4);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas fa-user" style="color:#fff;font-size:13px;"></i></span>' +
        '<div style="flex:1;min-width:0;">' +
        '  <div style="color:var(--text-primary);font-size:0.85rem;font-weight:500;">' + currentUser.username + '</div>' +
        '  <div style="color:var(--text-muted);font-size:0.7rem;margin-top:1px;">Role: ' + currentUser.role + '</div>' +
        '</div>' +
        '<button id="syncLogoutBtn" style="padding:5px 10px;background:var(--danger-bg);border:1px solid var(--danger-border);color:var(--danger);border-radius:4px;cursor:pointer;font-size:0.7rem;"><i class="fas fa-sign-out-alt"></i></button>' +
        '</div>'
      : '<input type="text" id="syncLoginUser" class="form-control" placeholder="Username" style="width:100%;box-sizing:border-box;">' +
        '<input type="password" id="syncLoginPass" class="form-control" placeholder="Password" style="width:100%;box-sizing:border-box;margin-top:7px;">' +
        '<div id="syncAccountMsg" style="font-size:0.72rem;color:var(--text-muted);min-height:14px;margin-top:5px;"></div>' +
        '<div style="display:flex;gap:6px;margin-top:6px;">' +
        '  <button id="syncLoginBtn" style="flex:1;padding:7px;border:none;background:var(--btn-primary-bg);color:#111;border-radius:5px;cursor:pointer;font-size:0.75rem;font-weight:600;"><i class="fas fa-sign-in-alt"></i> Login</button>' +
        '  <button id="syncRegisterBtn" style="flex:1;padding:7px;border:1px solid var(--border-color);background:transparent;color:var(--text-secondary);border-radius:5px;cursor:pointer;font-size:0.75rem;"><i class="fas fa-user-plus"></i> Register</button>' +
        '</div>';

    const modal = document.createElement('div');
    modal.id = 'syncConfigModal';
    modal.innerHTML =
      '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;" id="syncModalBackdrop">' +
      '  <div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:7px;width:100%;max-width:500px;box-shadow:0 16px 48px rgba(0,0,0,0.4);">' +

      '    <div style="display:flex;align-items:center;gap:8px;padding:14px 16px 0 16px;">' +
      '      <span style="width:28px;height:28px;border-radius:6px;background:var(--info-bg);display:flex;align-items:center;justify-content:center;"><i class="fas fa-plug" style="font-size:12px;color:var(--info);"></i></span>' +
      '      <span style="flex:1;color:var(--text-primary);font-size:0.9rem;font-weight:600;">Sync Server</span>' +
      '      <span id="syncModalClose" style="width:26px;height:26px;border-radius:5px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-muted);font-size:16px;transition:background 0.15s;">&times;</span>' +
      '    </div>' +

      '    <div style="padding:14px 16px 12px 16px;display:flex;flex-direction:column;gap:10px;">' +

      '      <div style="background:var(--secondary-bg);border:1px solid var(--border-color);border-radius:7px;padding:12px 14px;">' +
      '        <div style="display:flex;align-items:center;gap:5px;margin-bottom:8px;">' +
      '          <i class="fas fa-user" style="font-size:10px;color:var(--info);width:14px;"></i>' +
      '          <span style="font-size:9px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Account</span>' +
      '        </div>' +
      '        <div id="syncAccountContainer">' + loggedInCard + '</div>' +
      '      </div>' +

      '      <div style="background:var(--secondary-bg);border:1px solid var(--border-color);border-radius:7px;padding:12px 14px;">' +
      '        <div style="display:flex;align-items:center;gap:5px;margin-bottom:8px;">' +
      '          <i class="fas fa-server" style="font-size:10px;color:var(--success);width:14px;"></i>' +
      '          <span style="font-size:9px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Server</span>' +
      '        </div>' +
      '        <div style="display:flex;gap:8px;">' +
      '          <div style="flex:2;">' +
      '            <label style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:3px;">URL</label>' +
      '            <input type="url" id="syncServerUrl" class="form-control" placeholder="http://localhost:3456" value="' + serverUrl + '" style="width:100%;box-sizing:border-box;">' +
      '          </div>' +
      '          <div style="flex:1;">' +
      '            <label style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:3px;">Label</label>' +
      '            <input type="text" id="syncServerLabel" class="form-control" placeholder="optional" value="' + serverLabel + '" style="width:100%;box-sizing:border-box;">' +
      '          </div>' +
      '        </div>' +
      '        <button id="syncTestBtn" style="width:100%;margin-top:8px;padding:6px;border:1px dashed var(--border-color);background:transparent;color:var(--text-muted);border-radius:5px;cursor:pointer;font-size:0.72rem;"><i class="fas fa-plug"></i> Test Connection</button>' +
      '        <div id="syncServerStatus" style="font-size:0.7rem;color:var(--text-muted);margin-top:5px;min-height:14px;"></div>' +
      '        <div id="syncServerInfo" style="display:none;margin-top:7px;padding:7px 9px;border-radius:5px;background:rgba(0,0,0,0.15);font-size:0.7rem;line-height:1.7;"></div>' +
      '      </div>' +
      '    </div>' +

      '    <div style="display:flex;gap:6px;justify-content:flex-end;padding:0 16px 14px 16px;">' +
      '      <button id="syncCancelBtn" style="padding:7px 14px;border:1px solid var(--border-color);background:transparent;color:var(--text-secondary);border-radius:5px;cursor:pointer;font-size:0.75rem;"><i class="fas fa-times"></i> Cancel</button>' +
      '      <button id="syncSaveBtn" style="padding:7px 14px;border:none;background:var(--btn-primary-bg);color:#111;border-radius:5px;cursor:pointer;font-size:0.75rem;font-weight:600;"><i class="fas fa-save"></i> Save & Close</button>' +
      '    </div>' +

      '  </div>' +
      '</div>';
    document.body.appendChild(modal);

    function closeModal() { modal.remove(); }

    document.getElementById('syncModalClose').addEventListener('click', closeModal);
    document.getElementById('syncCancelBtn').addEventListener('click', closeModal);
    document.getElementById('syncModalBackdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });

    if (!currentUser) {
      setTimeout(() => {
        const loginBtn = document.getElementById('syncLoginBtn');
        const regBtn = document.getElementById('syncRegisterBtn');
        const userInp = document.getElementById('syncLoginUser');
        const passInp = document.getElementById('syncLoginPass');
        const msgEl = document.getElementById('syncAccountMsg');
        if (loginBtn) loginBtn.addEventListener('click', async () => {
          const u = userInp.value.trim();
          const p = passInp.value.trim();
          if (!u || !p) { msgEl.textContent = 'Enter username and password'; msgEl.style.color = 'var(--danger)'; return; }
          msgEl.textContent = 'Logging in...'; msgEl.style.color = 'var(--text-muted)';
          try {
            await login(u, p);
            closeModal();
            showConfigModal();
          } catch (e) {
            msgEl.textContent = e.message; msgEl.style.color = 'var(--danger)';
          }
        });
        if (regBtn) regBtn.addEventListener('click', async () => {
          const u = userInp.value.trim();
          const p = passInp.value.trim();
          if (!u || !p) { msgEl.textContent = 'Enter username and password'; msgEl.style.color = 'var(--danger)'; return; }
          if (p.length < 6) { msgEl.textContent = 'Password must be at least 6 characters'; msgEl.style.color = 'var(--danger)'; return; }
          msgEl.textContent = 'Registering...'; msgEl.style.color = 'var(--text-muted)';
          try {
            await register(u, p);
            closeModal();
            showConfigModal();
          } catch (e) {
            msgEl.textContent = e.message; msgEl.style.color = 'var(--danger)';
          }
        });
      }, 50);
    } else {
      setTimeout(() => {
        const btn = document.getElementById('syncLogoutBtn');
        if (btn) btn.addEventListener('click', async () => { await logout(); closeModal(); showConfigModal(); });
      }, 50);
    }

    const statusEl = document.getElementById('syncServerStatus');
    const infoEl = document.getElementById('syncServerInfo');

    document.getElementById('syncTestBtn').addEventListener('click', async () => {
      const url = document.getElementById('syncServerUrl').value.trim().replace(/\/$/, '');
      statusEl.textContent = 'Testing connection...';
      statusEl.style.color = 'var(--text-muted)';
      try {
        const resp = await fetch(url + '/api/auth/health');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const isAuth = await fetch(url + '/api/sync/status', {
          headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {}
        });
        const s = await isAuth.json();
        statusEl.textContent = 'Connected: ' + s.server + (s.account ? ' | ' + s.account.username : ' | Not logged in');
        statusEl.style.color = 'var(--success)';
        infoEl.style.display = 'block';
        infoEl.innerHTML =
          '<b>Uptime:</b> ' + Math.floor(s.uptime) + 's · <b>Users:</b> ' + s.registeredUsers +
          (s.account ? '<br><b>Account:</b> ' + s.account.username + ' (' + s.account.role + ')<br><b>Records:</b> ' + s.account.records + '<br><b>Last sync:</b> ' + (s.account.lastSync ? new Date(s.account.lastSync).toLocaleString() : 'Never') : '');
      } catch (e) {
        statusEl.textContent = e.message;
        statusEl.style.color = 'var(--danger)';
        infoEl.style.display = 'none';
      }
    });

    document.getElementById('syncSaveBtn').addEventListener('click', () => {
      const url = document.getElementById('syncServerUrl').value.trim();
      const label = document.getElementById('syncServerLabel').value.trim();
      if (!url) { statusEl.textContent = 'Server URL is required'; statusEl.style.color = 'var(--danger)'; return; }
      saveConfig({ url: url.replace(/\/$/, ''), label: label || undefined });
      closeModal();
      window.PazatorUI && window.PazatorUI.showFloatingNotification('Sync config saved', 'success', 2000);
      updateSyncUI();
    });
  }

  function scheduleRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(async () => {
      if (authToken && !serverConnected) {
        try { await fetchCurrentUser(); } catch (e) { /* keep retrying */ }
        scheduleRetry();
      }
    }, 30000);
  }

  function updateSyncUI() {
    loadConfig();
    loadState();
    loadAuthToken();
    const dot = document.getElementById('syncStatusDot');
    const label = document.getElementById('syncStatusLabel');
    const meta = document.getElementById('syncStatusMeta');
    if (!label) return;

    if (currentUser && serverConnected === false) {
      const srv = syncConfig ? (syncConfig.label || syncConfig.url.replace(/^https?:\/\//, '')) : 'Server';
      if (dot) dot.style.background = '#ff9800';
      label.textContent = `${currentUser.username}@${srv}`;
      label.style.color = '#aaa';
      if (meta) meta.textContent = 'disconnected';
      scheduleRetry();
    } else if (currentUser && serverConnected === true) {
      const srv = syncConfig ? (syncConfig.label || syncConfig.url.replace(/^https?:\/\//, '')) : 'Server';
      const lastSync = syncState.lastSync ? new Date(syncState.lastSync).toLocaleString() : 'Never';
      if (dot) dot.style.background = '#4caf50';
      label.textContent = `${currentUser.username}@${srv}`;
      label.style.color = '#fff';
      if (meta) meta.textContent = `last sync: ${lastSync}`;
    } else if (currentUser && serverConnected === undefined) {
      const srv = syncConfig ? (syncConfig.label || syncConfig.url.replace(/^https?:\/\//, '')) : 'Server';
      if (dot) dot.style.background = '#ff9800';
      label.textContent = `${currentUser.username}@${srv}`;
      label.style.color = '#aaa';
      if (meta) meta.textContent = 'verifying...';
    } else if (authToken && !window.__pazatorSyncVerifying) {
      if (dot) dot.style.background = '#ff9800';
      label.textContent = 'Session loading...';
      label.style.color = '#aaa';
      if (meta) meta.textContent = 'Verifying...';
      window.__pazatorSyncVerifying = true;
      fetchCurrentUser().finally(() => { window.__pazatorSyncVerifying = false; });
    } else if (authToken && window.__pazatorSyncVerifying) {
    } else if (syncConfig) {
      const srv = syncConfig.label || syncConfig.url.replace(/^https?:\/\//, '');
      if (dot) dot.style.background = '#ff9800';
      label.textContent = srv;
      label.style.color = '#aaa';
      if (meta) meta.textContent = 'not logged in';
    } else {
      if (dot) dot.style.background = '#555';
      label.textContent = 'Not configured';
      label.style.color = '#777';
      if (meta) meta.textContent = '';
    }
  }

  function handleConfigClick(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('logoDropdownMenu');
    if (menu) menu.classList.remove('active');
    showConfigModal();
  }

  function initSync() {
    loadConfig();
    loadState();
    loadAuthToken();

    if (authToken) {
      loadUserCache();
      if (!currentUser) {
        window.__pazatorSyncVerifying = true;
      }
      updateSyncUI();
      if (!currentUser) {
        fetchCurrentUser().finally(() => { window.__pazatorSyncVerifying = false; });
      } else {
        fetchCurrentUser();
      }
    }

    const syncConfigOption = document.getElementById('syncConfigOption');
    if (syncConfigOption) syncConfigOption.addEventListener('click', handleConfigClick);

    updateSyncUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSync);
  } else {
    initSync();
  }

  window.pazatorSync = {
    push,
    pull,
    getChanges,
    getStatus,
    showConfigModal,
    updateSyncUI,
    getConfig: loadConfig,
    getState: loadState,
    login,
    register,
    logout,
    getCurrentUser: () => currentUser,
    getAuthToken: () => authToken
  };
})();
