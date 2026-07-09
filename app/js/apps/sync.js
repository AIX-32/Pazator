(function () {
  // inject PZLS modal styles once
  if (!document.getElementById('pzls-style')) {
    var s = document.createElement('style');
    s.id = 'pzls-style';
    s.textContent =
      '.pzls-modal .modal-content{max-width:520px}' +
      '.pzls-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
      '.pzls-user-row{display:flex;align-items:center;gap:10px}' +
      '.pzls-user-avatar{width:36px;height:36px;border-radius:50%;background:var(--info-bg);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--info)}' +
      '.pzls-user-info{flex:1;min-width:0}' +
      '.pzls-user-name{color:var(--text-primary);font-size:0.85rem;font-weight:500}' +
      '.pzls-user-role{color:var(--text-muted);font-size:0.7rem;margin-top:1px}' +
      '.pzls-logout-btn{padding:5px 10px;background:var(--danger-bg);border:1px solid var(--danger-border);color:var(--danger);border-radius:4px;cursor:pointer;font-size:0.7rem}' +
      '.pzls-msg{font-size:0.72rem;color:var(--danger);min-height:16px}' +
      '.pzls-btn-row{display:flex;gap:8px}' +
      '.pzls-btn{flex:1;justify-content:center}' +
      '.pzls-full-btn{width:100%;margin-top:4px;justify-content:center}' +
      '.pzls-status{font-size:0.75rem;color:var(--text-muted);margin-top:8px;min-height:16px}' +
      '.pzls-info-box{display:none;margin-top:8px;padding:10px 12px;border-radius:var(--border-radius-sm);background:rgba(0,0,0,0.25);font-size:0.7rem;line-height:1.8}';
    document.head.appendChild(s);
  }

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
    if (!url) throw new Error('No PZLS server configured');
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
    if (!url) throw new Error('Configure PZLS first');
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
    if (typeof updateSidebarProfile === 'function') updateSidebarProfile();
    return result;
  }

  async function register(username, password) {
    const url = getServerUrl();
    if (!url) throw new Error('Configure PZLS first');
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
    if (typeof updateSidebarProfile === 'function') updateSidebarProfile();
    return result;
  }

  async function logout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    saveAuthToken(null);
    currentUser = null;
    updateSyncUI();
    if (typeof updateSidebarProfile === 'function') updateSidebarProfile();
  }

  function loadUserCache() {
    try {
      const raw = localStorage.getItem(USER_CACHE_KEY);
      if (raw) currentUser = JSON.parse(raw);
    } catch (e) {  }
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
      ? '<div class="pzls-user-row">' +
        '<span class="pzls-user-avatar"><i class="fas fa-user"></i></span>' +
        '<div class="pzls-user-info">' +
        '  <div class="pzls-user-name">' + currentUser.username + '</div>' +
        '  <div class="pzls-user-role">Role: ' + currentUser.role + '</div>' +
        '</div>' +
        '<button id="syncLogoutBtn" class="pzls-logout-btn"><i class="fas fa-sign-out-alt"></i></button>' +
        '</div>'
      : '<div class="form-group"><label>Username</label><input type="text" id="syncLoginUser" class="form-control" placeholder="Username"></div>' +
        '<div class="form-group"><label>Password</label><input type="password" id="syncLoginPass" class="form-control" placeholder="Password"></div>' +
        '<div id="syncAccountMsg" class="pzls-msg"></div>' +
        '<div class="pzls-btn-row">' +
        '  <button id="syncLoginBtn" class="btn btn-primary pzls-btn"><i class="fas fa-sign-in-alt"></i> Login</button>' +
        '  <button id="syncRegisterBtn" class="btn glass-btn pzls-btn"><i class="fas fa-user-plus"></i> Register</button>' +
        '</div>';

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'syncConfigModal';
    modal.innerHTML =
      '<div class="modal-content pzls-modal">' +
      '  <div class="modal-header">' +
      '    <h2><i class="fas fa-plug"></i> PZLS</h2>' +
      '  </div>' +
      '  <div class="modal-body">' +
      '    <div class="pzls-grid">' +
      '      <div class="form-section">' +
      '        <h3><i class="fas fa-user"></i> Account</h3>' +
      '        <div id="syncAccountContainer">' + loggedInCard + '</div>' +
      '      </div>' +
      '      <div class="form-section">' +
      '        <h3><i class="fas fa-server"></i> Server</h3>' +
      '        <div class="form-group">' +
      '          <label>URL</label>' +
      '          <input type="url" id="syncServerUrl" class="form-control" placeholder="http://localhost:3456" value="' + serverUrl + '">' +
      '        </div>' +
      '        <div class="form-group">' +
      '          <label>Label</label>' +
      '          <input type="text" id="syncServerLabel" class="form-control" placeholder="optional" value="' + serverLabel + '">' +
      '        </div>' +
      '        <button id="syncTestBtn" class="btn glass-btn pzls-full-btn"><i class="fas fa-plug"></i> Test Connection</button>' +
      '        <div id="syncServerStatus" class="pzls-status"></div>' +
      '        <div id="syncServerInfo" class="pzls-info-box"></div>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="form-actions">' +
      '    <button id="syncDocsBtn" class="btn glass-btn"><i class="fas fa-book"></i> Docs</button>' +
      '    <button id="syncCancelBtn" class="btn glass-btn">Cancel</button>' +
      '    <button id="syncSaveBtn" class="btn btn-primary"><i class="fas fa-save"></i> Save & Close</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(modal);

    function closeModal() { modal.remove(); }

    document.getElementById('syncCancelBtn').addEventListener('click', closeModal);
    document.getElementById('syncDocsBtn').addEventListener('click', () => window.open('../docs/sync.html', '_blank'));
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

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
        try { await fetchCurrentUser(); } catch (e) {  }
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
      const srv = syncConfig ? (syncConfig.label || syncConfig.url.replace(/^https?:\/\//, '').split('/')[0]) : '';
      if (dot) dot.style.background = '#ff9800';
      label.textContent = `${currentUser.username}@${srv}`;
      label.style.color = '#aaa';
      if (meta) meta.textContent = 'disconnected';
      scheduleRetry();
    } else if (currentUser && serverConnected === true) {
      const srv = syncConfig ? (syncConfig.label || syncConfig.url.replace(/^https?:\/\//, '').split('/')[0]) : '';
      const lastSync = syncState.lastSync ? new Date(syncState.lastSync).toLocaleString() : 'Never';
      if (dot) dot.style.background = '#4caf50';
      label.textContent = `${currentUser.username}@${srv}`;
      label.style.color = '#fff';
      if (meta) meta.textContent = `last sync: ${lastSync}`;
    } else if (currentUser && serverConnected === undefined) {
      const srv = syncConfig ? (syncConfig.label || syncConfig.url.replace(/^https?:\/\//, '').split('/')[0]) : '';
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
      const srv = syncConfig.label || syncConfig.url.replace(/^https?:\/\//, '').split('/')[0];
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
    getAuthToken: () => authToken,
    getServerConnected: () => serverConnected
  };
})();
