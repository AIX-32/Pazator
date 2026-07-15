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

  const OFFLINE_QUEUE_KEY = 'pazator_sync_offline_queue';
  const MERGE_CONFLICTS_KEY = 'pazator_merge_conflicts';
  const SYNC_CURSOR_KEY = 'pazator_sync_cursor';

  function getEncryptionFn() {
    var w = window;
    return { isEnabled: (typeof w.isEncryptionEnabled === 'function' ? w.isEncryptionEnabled : function(){return false;}),
             encrypt: (typeof w.encryptForSync === 'function' ? w.encryptForSync : function(d){return d;}),
             decrypt: (typeof w.decryptFromSync === 'function' ? w.decryptFromSync : function(d){return d;}) };
  }

  function loadOfflineQueue() {
    try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)) || []; } catch(e) { return []; }
  }

  function saveOfflineQueue(queue) {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  }

  function addToOfflineQueue(op) {
    var queue = loadOfflineQueue();
    queue.push({ ...op, queuedAt: new Date().toISOString() });
    saveOfflineQueue(queue);
    updateSyncUI();
  }

  function loadMergeConflicts() {
    try { return JSON.parse(localStorage.getItem(MERGE_CONFLICTS_KEY)) || []; } catch(e) { return []; }
  }

  function saveMergeConflicts(conflicts) {
    localStorage.setItem(MERGE_CONFLICTS_KEY, JSON.stringify(conflicts));
  }

  async function flushOfflineQueue() {
    if (!authToken) { window.PazatorUI && window.PazatorUI.showFloatingNotification('No PZLS connection', 'error', 2500); return; }
    window.PazatorUI && window.PazatorUI.showFloatingNotification('Flush started…', 'info', 1500);
    var queue = loadOfflineQueue();
    if (!queue.length) { window.PazatorUI && window.PazatorUI.showFloatingNotification('Queue empty', 'info', 2000); return; }
    var remaining = [];
    for (var i = 0; i < queue.length; i++) {
      var op = queue[i];
      try {
        if (op.action === 'push') {
          await pushInternal(op.data);
        } else if (op.action === 'op') {
          await pushOpsInternal([op.op]);
        }
      } catch (e) {
        remaining.push(op);
      }
    }
    saveOfflineQueue(remaining);
    if (remaining.length === 0) {
      window.PazatorUI && window.PazatorUI.showFloatingNotification('Offline queue flushed', 'success', 2000);
    }
    updateSyncUI();
  }

  function collectLocalData() {
    var data = {};
    var stores = ['humans', 'others', 'tags', 'cases', 'chats', 'relationships'];
    for (var si = 0; si < stores.length; si++) {
      var store = stores[si];
      var arr = window.pazatorStore && window.pazatorStore._data ? window.pazatorStore._data[store] : [];
      if (arr && arr.length > 0) {
        data[store] = {};
        for (var ii = 0; ii < arr.length; ii++) {
          if (arr[ii] && arr[ii].id) {
            data[store][arr[ii].id] = arr[ii];
          }
        }
      }
    }
    return data;
  }

  function encryptStoreData(data) {
    var enc = getEncryptionFn();
    if (!enc.isEnabled()) return data;
    var out = {};
    for (var store in data) {
      if (!data.hasOwnProperty(store)) continue;
      out[store] = {};
      for (var id in data[store]) {
        if (!data[store].hasOwnProperty(id)) continue;
        out[store][id] = enc.encrypt(data[store][id]);
      }
    }
    return out;
  }

  function decryptStoreData(data) {
    var enc = getEncryptionFn();
    if (!enc.isEnabled()) return data;
    var out = {};
    for (var store in data) {
      if (!data.hasOwnProperty(store)) continue;
      out[store] = {};
      for (var id in data[store]) {
        if (!data[store].hasOwnProperty(id)) continue;
        out[store][id] = enc.decrypt(data[store][id]);
      }
    }
    return out;
  }

  function decryptEntity(entity) {
    var enc = getEncryptionFn();
    return enc.isEnabled() ? enc.decrypt(entity) : entity;
  }

  // ─── Incremental Pull (cursor-based) ──────────────────────────

  async function pullIncremental() {
    if (!authToken) { window.PazatorUI && window.PazatorUI.showFloatingNotification('No PZLS connection', 'error', 2500); return { success: false, error: 'Not logged in' }; }
    window.PazatorUI && window.PazatorUI.showFloatingNotification('Incremental pull started…', 'info', 1500);
    try {
      var cursor = localStorage.getItem(SYNC_CURSOR_KEY) || null;
      var totalImported = 0;
      var more = true;
      var page = 0;

      while (more && page < 100) {
        var path = '/api/sync/cursor?limit=500';
        if (cursor) path += '&cursor=' + encodeURIComponent(cursor);
        var result = await apiFetch(path);
        if (!result.entities || !result.entities.length) break;

        var imported = 0;
        for (var ei = 0; ei < result.entities.length; ei++) {
          var row = result.entities[ei];
          var decrypted = decryptEntity(row.data);
          if (!decrypted) continue;
          if (window.pazatorStore && window.pazatorStore._data) {
            var arr = window.pazatorStore._data[row.store];
            if (arr) {
              var exists = false;
              for (var xi = 0; xi < arr.length; xi++) {
                if (arr[xi] && arr[xi].id === row.id) { exists = true; break; }
              }
              if (!exists) {
                arr.push(decrypted);
                imported++;
              }
            }
          }
        }

        totalImported += imported;
        if (imported > 0 && window.pazatorStore && window.pazatorStore.markDirty) {
          window.pazatorStore.markDirty('all');
        }

        cursor = result.nextCursor || null;
        more = result.hasMore;
        page++;
      }

      localStorage.setItem(SYNC_CURSOR_KEY, cursor || '');
      syncState.lastSync = new Date().toISOString();
      syncState.lastPull = new Date().toISOString();
      saveState(syncState);

      window.PazatorUI && window.PazatorUI.showFloatingNotification(
        'Pulled: ' + totalImported + ' records',
        totalImported > 0 ? 'success' : 'info', 3000
      );
      updateSyncUI();
      return { success: true, count: totalImported };
    } catch (e) {
      window.PazatorUI && window.PazatorUI.showFloatingNotification('Pull failed: ' + e.message, 'error', 4000);
      return { success: false, error: e.message };
    }
  }

  async function pushInternal(data) {
    var encrypted = encryptStoreData(data);
    var result = await apiFetch('/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        clientVersion: syncState ? syncState.version : 0,
        stores: encrypted
      })
    });
    syncState.version = result.version;
    syncState.lastSync = new Date().toISOString();
    syncState.lastPush = new Date().toISOString();
    saveState(syncState);
    return result;
  }

  async function push() {
    try {
      if (!authToken) { showConfigModal(); return { success: false, error: 'Not logged in' }; }
      var data = collectLocalData();
      if (Object.keys(data).length === 0) {
        window.PazatorUI && window.PazatorUI.showFloatingNotification('No data to push', 'warning', 2000);
        return { success: false, error: 'No data' };
      }
      try {
        var result = await pushInternal(data);
        window.PazatorUI && window.PazatorUI.showFloatingNotification(
          'Pushed: ' + result.added + ' added, ' + result.modified + ' modified',
          result.added > 0 || result.modified > 0 ? 'success' : 'info', 3000
        );
        updateSyncUI();
        return { success: true, result: result };
      } catch (e) {
        // Offline — queue it
        addToOfflineQueue({ action: 'push', data: data });
        window.PazatorUI && window.PazatorUI.showFloatingNotification(
          'Server unreachable — queued for later (' + e.message + ')', 'warning', 4000
        );
        updateSyncUI();
        return { success: false, offline: true, error: e.message };
      }
    } catch (e) {
      window.PazatorUI && window.PazatorUI.showFloatingNotification('Push failed: ' + e.message, 'error', 4000);
      return { success: false, error: e.message };
    }
  }

  async function pull() {
    try {
      if (!authToken) { showConfigModal(); return { success: false, error: 'Not logged in' }; }
      var result = await apiFetch('/api/sync');
      if (!result.data || Object.keys(result.data).length === 0) {
        window.PazatorUI && window.PazatorUI.showFloatingNotification('Server has no data', 'info', 2000);
        return { success: true, count: 0 };
      }
      var decrypted = decryptStoreData(result.data);
      var totalImported = 0;
      var stores = ['humans', 'others', 'tags', 'cases', 'chats', 'relationships'];
      for (var si = 0; si < stores.length; si++) {
        var s = stores[si];
        if (decrypted[s]) {
          var items = Object.values(decrypted[s]);
          if (items.length > 0 && window.pazatorStore && window.pazatorStore._data) {
            var existing = window.pazatorStore._data[s] || [];
            var existingIds = new Set(existing.map(function(e) { return e.id; }));
            for (var ii = 0; ii < items.length; ii++) {
              if (!existingIds.has(items[ii].id)) {
                existing.push(items[ii]);
                totalImported++;
              }
            }
            if (totalImported > 0 && window.pazatorStore.markDirty) {
              window.pazatorStore.markDirty(s);
            }
          }
        }
      }
      syncState.version = result.version;
      syncState.lastSync = new Date().toISOString();
      syncState.lastPull = new Date().toISOString();
      saveState(syncState);
      window.PazatorUI && window.PazatorUI.showFloatingNotification(
        'Pulled: ' + totalImported + ' new records',
        totalImported > 0 ? 'success' : 'info', 3000
      );
      updateSyncUI();
      return { success: true, count: totalImported };
    } catch (e) {
      window.PazatorUI && window.PazatorUI.showFloatingNotification('Pull failed: ' + e.message, 'error', 4000);
      return { success: false, error: e.message };
    }
  }

  async function pushOpsInternal(ops) {
    var enc = getEncryptionFn();
    if (enc.isEnabled()) {
      ops = ops.map(function(op) {
        if (op.data) op.data = enc.encrypt(op.data);
        return op;
      });
    }
    var result = await apiFetch('/api/sync/ops', {
      method: 'POST',
      body: JSON.stringify({ operations: ops })
    });
    // Check for conflicts
    var conflicts = [];
    if (result.results) {
      for (var ri = 0; ri < result.results.length; ri++) {
        if (result.results[ri].conflict) {
          var c = result.results[ri];
          conflicts.push({
            entity_id: c.entity_id,
            serverVersion: c.serverVersion,
            serverData: enc.isEnabled() ? enc.decrypt(c.serverData) : c.serverData,
            clientData: ops[ri] ? ops[ri].data || null : null,
            timestamp: new Date().toISOString()
          });
        }
      }
    }
    if (conflicts.length > 0) {
      var existing = loadMergeConflicts();
      saveMergeConflicts(existing.concat(conflicts));
      showMergeConflictsNotification(conflicts);
    }
    return result;
  }

  function showMergeConflictsNotification(conflicts) {
    var names = conflicts.map(function(c) { return c.entity_id.slice(0, 8); }).join(', ');
    window.PazatorUI && window.PazatorUI.showFloatingNotification(
      conflicts.length + ' merge conflict(s): ' + names + '. Resolve in PZLS menu.', 'warning', 6000
    );
    updateSyncUI();
  }

  // ─── Merge Conflict Resolution ─────────────────────────────────

  function getConflicts() {
    return loadMergeConflicts();
  }

  function dismissConflict(entityId) {
    var conflicts = loadMergeConflicts();
    saveMergeConflicts(conflicts.filter(function(c) { return c.entity_id !== entityId; }));
    updateSyncUI();
  }

  function resolveConflict(entityId, resolution) {
    var conflicts = loadMergeConflicts();
    var idx = -1;
    for (var i = 0; i < conflicts.length; i++) {
      if (conflicts[i].entity_id === entityId) { idx = i; break; }
    }
    if (idx === -1) return;
    conflicts.splice(idx, 1);
    saveMergeConflicts(conflicts);
    updateSyncUI();
  }

  async function aiAutoSolveConflict(conflict) {
    if (!window.pazatorAI) {
      window.PazatorUI && window.PazatorUI.showFloatingNotification('AI system not available', 'error', 3000);
      return null;
    }
    try {
      var prompt = 'You are a merge conflict resolution assistant. Two versions of the same entity conflict:\n\n' +
        'SERVER VERSION:\n' + JSON.stringify(conflict.serverData, null, 2) + '\n\n' +
        'CLIENT VERSION:\n' + JSON.stringify(conflict.clientData, null, 2) + '\n\n' +
        'Merge them into a single coherent version. Preserve all unique fields. For conflicting fields, prefer the most recently modified value or merge intelligently. Return ONLY the merged JSON object.';
      var result = await window.pazatorAI.chat('', [{ role: 'user', content: prompt }]);
      var text = result;
      if (result && result.candidates && result.candidates[0]) text = result.candidates[0].content.parts[0].text;
      // Try to extract JSON from the response
      var jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        var merged = JSON.parse(jsonMatch[0]);
        return merged;
      }
      return null;
    } catch (e) {
      console.error('AI auto-solve failed:', e);
      return null;
    }
  }

  async function autoSolveAllConflicts() {
    var conflicts = loadMergeConflicts();
    if (!conflicts.length) {
      window.PazatorUI && window.PazatorUI.showFloatingNotification('No conflicts to resolve', 'info', 2000);
      return;
    }
    var storeNames = ['humans', 'others', 'tags', 'cases', 'chats', 'relationships'];
    var solved = 0;
    var failed = 0;
    for (var i = 0; i < conflicts.length; i++) {
      var merged = await aiAutoSolveConflict(conflicts[i]);
      if (merged && merged.id) {
        for (var si = 0; si < storeNames.length; si++) {
          var arr = window.pazatorStore && window.pazatorStore._data ? window.pazatorStore._data[storeNames[si]] : null;
          if (arr) {
            for (var xi = 0; xi < arr.length; xi++) {
              if (arr[xi] && arr[xi].id === conflicts[i].entity_id) {
                Object.assign(arr[xi], merged);
                break;
              }
            }
          }
        }
        resolveConflict(conflicts[i].entity_id, 'ai_merged');
        solved++;
      } else {
        failed++;
      }
    }
    if (window.pazatorStore && window.pazatorStore.markDirty) window.pazatorStore.markDirty('all');
    window.PazatorUI && window.PazatorUI.showFloatingNotification(
      'AI auto-solve: ' + solved + ' merged, ' + failed + ' failed', failed > 0 ? 'warning' : 'success', 4000
    );
    updateSyncUI();
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

  function getConflictCount() { var c = loadMergeConflicts(); return c ? c.length : 0; }
  function getOfflineQueueCount() { var q = loadOfflineQueue(); return q ? q.length : 0; }

  function updateSyncUI() {
    loadConfig();
    loadState();
    loadAuthToken();
    var dot = document.getElementById('syncStatusDot');
    var label = document.getElementById('syncStatusLabel');
    var meta = document.getElementById('syncStatusMeta');
    if (!label) return;

    var conflicts = getConflictCount();
    var queued = getOfflineQueueCount();

    var extra = '';
    if (conflicts > 0) extra += ' \u26A0 ' + conflicts + ' conflict(s)';
    if (queued > 0) extra += ' \u23F3 ' + queued + ' queued';

    if (currentUser && serverConnected === false) {
      var srv = syncConfig ? (syncConfig.label || syncConfig.url.replace(/^https?:\/\//, '').split('/')[0]) : '';
      if (dot) dot.style.background = '#ff9800';
      label.textContent = currentUser.username + '@' + srv;
      label.style.color = '#aaa';
      if (meta) meta.textContent = 'disconnected' + extra;
      scheduleRetry();
    } else if (currentUser && serverConnected === true) {
      var srv2 = syncConfig ? (syncConfig.label || syncConfig.url.replace(/^https?:\/\//, '').split('/')[0]) : '';
      var lastSync = syncState.lastSync ? new Date(syncState.lastSync).toLocaleString() : 'Never';
      if (dot) dot.style.background = '#4caf50';
      label.textContent = currentUser.username + '@' + srv2;
      label.style.color = '#fff';
      if (meta) meta.textContent = 'last sync: ' + lastSync + extra;
    } else if (currentUser && serverConnected === undefined) {
      var srv3 = syncConfig ? (syncConfig.label || syncConfig.url.replace(/^https?:\/\//, '').split('/')[0]) : '';
      if (dot) dot.style.background = '#ff9800';
      label.textContent = currentUser.username + '@' + srv3;
      label.style.color = '#aaa';
      if (meta) meta.textContent = 'verifying...' + extra;
    } else if (authToken && !window.__pazatorSyncVerifying) {
      if (dot) dot.style.background = '#ff9800';
      label.textContent = 'Session loading...';
      label.style.color = '#aaa';
      if (meta) meta.textContent = 'Verifying...' + extra;
      window.__pazatorSyncVerifying = true;
      fetchCurrentUser().finally(function() { window.__pazatorSyncVerifying = false; });
    } else if (authToken && window.__pazatorSyncVerifying) {
    } else if (syncConfig) {
      var srv4 = syncConfig.label || syncConfig.url.replace(/^https?:\/\//, '').split('/')[0];
      if (dot) dot.style.background = '#ff9800';
      label.textContent = srv4;
      label.style.color = '#aaa';
      if (meta) meta.textContent = 'not logged in' + extra;
    } else {
      if (dot) dot.style.background = '#555';
      label.textContent = 'Not configured';
      label.style.color = '#777';
      if (meta) meta.textContent = extra;
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

  // ─── Conflict Resolver UI ──────────────────────────────────────────

  window.showConflictResolver = function() {
    var conflicts = loadMergeConflicts();
    var existing = document.getElementById('conflictResolverModal');
    if (existing) existing.remove();

    var conflictRows = conflicts.length === 0
      ? '<div style="text-align:center;padding:30px;color:#666;font-size:0.8rem;">No conflicts to resolve</div>'
      : conflicts.map(function(c, idx) {
          return '<div style="border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:12px;margin-bottom:8px;background:rgba(0,0,0,0.2);">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<span style="font-size:0.75rem;color:#ff9800;"><i class="fas fa-exclamation-triangle"></i> ' + c.entity_id.slice(0, 16) + '..</span>' +
            '<div style="display:flex;gap:6px;">' +
            '<button class="btn btn-sm btn-primary" onclick="window.pazatorSync.autoSolveConflict(' + idx + ')"><i class="fas fa-magic"></i> AI Solve</button>' +
            '<button class="btn btn-sm btn-secondary" onclick="window.pazatorSync.dismissConflict(\'' + c.entity_id + '\');showConflictResolver();"><i class="fas fa-times"></i> Dismiss</button>' +
            '</div></div>' +
            '<div style="font-size:0.6rem;color:#888;margin-bottom:4px;">Server v' + c.serverVersion + '</div>' +
            '<pre style="font-size:0.6rem;color:#aaa;max-height:80px;overflow-y:auto;background:rgba(0,0,0,0.3);padding:6px;border-radius:4px;margin:0;">' + JSON.stringify(c.serverData, null, 1).slice(0, 300) + '</pre>' +
            '</div>';
        }).join('');

    var modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'conflictResolverModal';
    modal.innerHTML =
      '<div class="modal-content" style="max-width:600px;">' +
      '  <div class="modal-header">' +
      '    <h2><i class="fas fa-gavel"></i> Merge Conflicts</h2>' +
      '  </div>' +
      '  <div class="modal-body">' +
      '    <div style="margin-bottom:12px;font-size:0.7rem;color:#888;">Conflicts happen when two users edit the same entity. AI can merge them, or you can dismiss individual conflicts.' +
      (conflicts.length > 0 ? ' <strong style="color:#ff9800;">' + conflicts.length + ' pending</strong>' : '') +
      '    </div>' +
      '    <div id="conflictList">' + conflictRows + '</div>' +
      '  </div>' +
      '  <div class="form-actions">' +
      (conflicts.length > 0 ? '<button class="btn btn-primary" onclick="window.pazatorSync.autoSolveAllConflicts();this.closest(\'.modal\').remove();"><i class="fas fa-magic"></i> AI Auto-Solve All</button>' : '') +
      '    <button class="btn glass-btn" onclick="this.closest(\'.modal\').remove()">Close</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSync);
  } else {
    initSync();
  }

  window.pazatorSync = {
    push: push,
    pull: pull,
    pullIncremental: pullIncremental,
    flushOfflineQueue: flushOfflineQueue,
    getChanges: getChanges,
    getStatus: getStatus,
    showConfigModal: showConfigModal,
    updateSyncUI: updateSyncUI,
    showConflictResolver: showConflictResolver,
    getConfig: loadConfig,
    getState: loadState,
    login: login,
    register: register,
    logout: logout,
    getCurrentUser: function() { return currentUser; },
    getAuthToken: function() { return authToken; },
    getServerConnected: function() { return serverConnected; },
    getConflicts: function() { return loadMergeConflicts(); },
    dismissConflict: dismissConflict,
    resolveConflict: resolveConflict,
    autoSolveConflict: async function(idx) {
      var conflicts = loadMergeConflicts();
      if (idx < 0 || idx >= conflicts.length) return;
      var merged = await aiAutoSolveConflict(conflicts[idx]);
      if (merged && merged.id) {
        var storeNames = ['humans', 'others', 'tags', 'cases', 'chats', 'relationships'];
        for (var si = 0; si < storeNames.length; si++) {
          var arr = window.pazatorStore && window.pazatorStore._data ? window.pazatorStore._data[storeNames[si]] : null;
          if (arr) {
            for (var xi = 0; xi < arr.length; xi++) {
              if (arr[xi] && arr[xi].id === conflicts[idx].entity_id) {
                Object.assign(arr[xi], merged);
                break;
              }
            }
          }
        }
        resolveConflict(conflicts[idx].entity_id, 'ai_merged');
        if (window.pazatorStore && window.pazatorStore.markDirty) window.pazatorStore.markDirty('all');
        window.PazatorUI && window.PazatorUI.showFloatingNotification('Conflict resolved by AI', 'success', 3000);
      } else {
        window.PazatorUI && window.PazatorUI.showFloatingNotification('AI could not resolve this conflict', 'error', 3000);
      }
      showConflictResolver();
    },
    autoSolveAllConflicts: autoSolveAllConflicts,
    getOfflineQueue: loadOfflineQueue,
    getConflictCount: getConflictCount,
    getOfflineQueueCount: getOfflineQueueCount
  };
})();
