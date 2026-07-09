(function () {
  'use strict';

  var modal = null;

  function apiFetch(path, options) {
    var token = localStorage.getItem('pazator_auth_token');
    var config = JSON.parse(localStorage.getItem('pazator_sync_config') || 'null');
    if (!config) return Promise.reject(new Error('No PZLS server configured'));
    var url = config.url.replace(/\/+$/, '') + path;
    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
        ...(options && options.headers ? options.headers : {})
      }
    }).then(function (r) {
      if (r.status === 401) throw new Error('Session expired. Re-login.');
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'HTTP ' + r.status); });
      return r.json();
    });
  }

  function getCurrentUser() {
    try { return JSON.parse(localStorage.getItem('pazator_user_cache') || 'null'); } catch (e) { return null; }
  }

  function closeModal() {
    if (modal) { modal.remove(); modal = null; }
  }

  function showPanel() {
    closeModal();
    var user = getCurrentUser();
    if (!user || user.role !== 'admin') {
      if (window.PazatorUI && window.PazatorUI.showFloatingNotification) {
        window.PazatorUI.showFloatingNotification('Admin access requires admin role on PZLS', 'warning', 3000);
      }
      return;
    }

    var backdrop = document.createElement('div');
    backdrop.id = 'adminPanelModal';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal = backdrop;

    backdrop.innerHTML =
      '<div style="background:#111;border:1px solid #333;border-radius:8px;width:100%;max-width:800px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.6);">' +
      '  <div style="display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid #2a2a2a;">' +
      '    <span style="width:30px;height:30px;border-radius:6px;background:rgba(255,180,50,0.15);display:flex;align-items:center;justify-content:center;"><i class="fas fa-shield-alt" style="font-size:14px;color:#ffb432;"></i></span>' +
      '    <span style="color:#eee;font-size:1rem;font-weight:600;flex:1;">Admin Panel</span>' +
      '    <span id="adminCloseBtn" style="width:28px;height:28px;border-radius:5px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#888;font-size:18px;">&times;</span>' +
      '  </div>' +
      '  <div style="display:flex;gap:0;border-bottom:1px solid #2a2a2a;padding:0 12px;">' +
      '    <button class="admin-tab" data-tab="audit" style="flex:1;padding:10px;border:none;background:none;color:#888;cursor:pointer;font-size:0.75rem;border-bottom:2px solid transparent;font-weight:500;"><i class="fas fa-history"></i> Audit Log</button>' +
      '    <button class="admin-tab" data-tab="users" style="flex:1;padding:10px;border:none;background:none;color:#888;cursor:pointer;font-size:0.75rem;border-bottom:2px solid transparent;font-weight:500;"><i class="fas fa-users"></i> Users</button>' +
      '    <button class="admin-tab" data-tab="stores" style="flex:1;padding:10px;border:none;background:none;color:#888;cursor:pointer;font-size:0.75rem;border-bottom:2px solid transparent;font-weight:500;"><i class="fas fa-database"></i> Stores</button>' +
      '    <button class="admin-tab" data-tab="config" style="flex:1;padding:10px;border:none;background:none;color:#888;cursor:pointer;font-size:0.75rem;border-bottom:2px solid transparent;font-weight:500;"><i class="fas fa-cog"></i> Config</button>' +
      '    <button class="admin-tab" data-tab="sessions" style="flex:1;padding:10px;border:none;background:none;color:#888;cursor:pointer;font-size:0.75rem;border-bottom:2px solid transparent;font-weight:500;"><i class="fas fa-key"></i> Sessions</button>' +
      '    <button class="admin-tab" data-tab="export" style="flex:1;padding:10px;border:none;background:none;color:#888;cursor:pointer;font-size:0.75rem;border-bottom:2px solid transparent;font-weight:500;"><i class="fas fa-file-export"></i> Export/Import</button>' +
      '  </div>' +
      '  <div id="adminPanelContent" style="flex:1;overflow-y:auto;padding:20px;min-height:300px;">' +
      '    <div style="display:flex;align-items:center;justify-content:center;height:200px;color:#555;"><i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i> Loading...</div>' +
      '  </div>' +
      '</div>';

    document.body.appendChild(backdrop);

    document.getElementById('adminCloseBtn').onclick = closeModal;
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeModal(); });

    var tabs = backdrop.querySelectorAll('.admin-tab');
    tabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        tabs.forEach(function (t) { t.style.color = '#888'; t.style.borderBottomColor = 'transparent'; });
        btn.style.color = '#ffb432'; btn.style.borderBottomColor = '#ffb432';
        switchTab(btn.dataset.tab);
      });
    });
    tabs[0].style.color = '#ffb432'; tabs[0].style.borderBottomColor = '#ffb432';
    switchTab('audit');
  }

  function switchTab(tabId) {
    var ctr = document.getElementById('adminPanelContent');
    if (!ctr) return;
    if (tabId === 'audit') renderAuditLog(ctr);
    else if (tabId === 'users') renderUserManagement(ctr);
    else if (tabId === 'stores') renderStores(ctr);
    else if (tabId === 'config') renderConfig(ctr);
    else if (tabId === 'sessions') renderMySessions(ctr);
    else if (tabId === 'export') renderExportImport(ctr);
  }

  // ─── Audit Log ─────────────────────────────────────────────────────────

  function renderAuditLog(ctr) {
    ctr.innerHTML =
      '<div style="display:flex;gap:8px;margin-bottom:14px;align-items:center;">' +
      '  <span style="font-size:0.75rem;color:#888;">Since seq:</span>' +
      '  <input type="number" id="auditSince" value="0" style="width:80px;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#1a1a1a;color:#ccc;font-size:0.75rem;">' +
      '  <button id="auditRefreshBtn" style="padding:6px 14px;border:none;background:#ffb432;color:#111;border-radius:4px;cursor:pointer;font-size:0.75rem;font-weight:600;"><i class="fas fa-sync"></i> Refresh</button>' +
      '  <span style="flex:1;"></span>' +
      '  <span id="auditCount" style="font-size:0.7rem;color:#666;"></span>' +
      '</div>' +
      '<div id="auditTableWrap" style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.7rem;">' +
      '  <thead><tr style="border-bottom:1px solid #333;color:#888;">' +
      '    <th style="text-align:left;padding:6px 8px;">Seq</th>' +
      '    <th style="text-align:left;padding:6px 8px;">Time</th>' +
      '    <th style="text-align:left;padding:6px 8px;">User</th>' +
      '    <th style="text-align:left;padding:6px 8px;">Action</th>' +
      '    <th style="text-align:left;padding:6px 8px;">Store</th>' +
      '    <th style="text-align:left;padding:6px 8px;">Entity</th>' +
      '  </tr></thead>' +
      '  <tbody id="auditBody"><tr><td colspan="6" style="text-align:center;padding:40px;color:#555;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr></tbody>' +
      '</table></div>';

    document.getElementById('auditRefreshBtn').onclick = loadAuditLog;
    loadAuditLog();
  }

  function loadAuditLog() {
    var since = document.getElementById('auditSince') ? parseInt(document.getElementById('auditSince').value) || 0 : 0;
    var body = document.getElementById('auditBody');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#555;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    apiFetch('/api/admin/ops?since=' + since + '&limit=200').then(function (result) {
      var countEl = document.getElementById('auditCount');
      if (countEl) countEl.textContent = 'Latest seq: ' + result.latestSeq + ' | Showing ' + result.count;
      if (!result.ops || result.ops.length === 0) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#555;">No operations found</td></tr>';
        return;
      }
      body.innerHTML = result.ops.map(function (op) {
        return '<tr style="border-bottom:1px solid #222;">' +
          '<td style="padding:6px 8px;color:#666;">' + op.seq + '</td>' +
          '<td style="padding:6px 8px;color:#999;">' + new Date(op.timestamp).toLocaleString() + '</td>' +
          '<td style="padding:6px 8px;color:#ccc;">' + (op.username || '—') + '</td>' +
          '<td style="padding:6px 8px;"><span style="color:' + (op.action === 'delete' ? '#ff6b6b' : op.action === 'create' ? '#69db7c' : '#ffd43b') + ';">' + op.action + '</span></td>' +
          '<td style="padding:6px 8px;color:#888;">' + op.store + '</td>' +
          '<td style="padding:6px 8px;color:#888;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + (op.entity_id || '') + '">' + (op.entity_id || '—') + '</td>' +
          '</tr>';
      }).join('');
    }).catch(function (err) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#ff6b6b;">Error: ' + err.message + '</td></tr>';
    });
  }

  // ─── User Management ───────────────────────────────────────────────────

  function renderUserManagement(ctr) {
    ctr.innerHTML =
      '<div style="margin-bottom:10px;font-size:0.75rem;color:#888;"><i class="fas fa-info-circle"></i> Manage users. Disabling a user prevents login and drops their sessions.</div>' +
      '<div id="usersTableWrap"><table style="width:100%;border-collapse:collapse;font-size:0.7rem;">' +
      '  <thead><tr style="border-bottom:1px solid #333;color:#888;">' +
      '    <th style="text-align:left;padding:6px 8px;">Username</th>' +
      '    <th style="text-align:left;padding:6px 8px;">Role</th>' +
      '    <th style="text-align:left;padding:6px 8px;">Created</th>' +
      '    <th style="text-align:left;padding:6px 8px;">Status</th>' +
      '    <th style="text-align:left;padding:6px 8px;">Sessions</th>' +
      '    <th style="text-align:left;padding:6px 8px;">Actions</th>' +
      '  </tr></thead>' +
      '  <tbody id="usersBody"><tr><td colspan="6" style="text-align:center;padding:40px;color:#555;"><i class="fas fa-spinner fa-spin"></i> Loading users...</td></tr></tbody>' +
      '</table></div>';

    loadUsers();
  }

  function loadUsers() {
    var body = document.getElementById('usersBody');
    if (!body) return;

    apiFetch('/api/admin/users').then(function (result) {
      if (!result.users || result.users.length === 0) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#555;">No users found</td></tr>';
        return;
      }
      var currentUser = getCurrentUser();
      body.innerHTML = result.users.map(function (u) {
        var isSelf = currentUser && currentUser.id === u.id;
        var disabled = u.disabled === 1 || u.disabled === true;
        return '<tr style="border-bottom:1px solid #222;">' +
          '<td style="padding:6px 8px;color:#eee;">' + u.username + (isSelf ? ' <span style="color:#888;font-size:0.65rem;">(you)</span>' : '') + '</td>' +
          '<td style="padding:6px 8px;color:#888;">' + u.role + '</td>' +
          '<td style="padding:6px 8px;color:#888;">' + (u.created_at ? new Date(u.created_at).toLocaleDateString() : '—') + '</td>' +
          '<td style="padding:6px 8px;"><span style="color:' + (disabled ? '#ff6b6b' : '#69db7c') + ';">' + (disabled ? 'Disabled' : 'Active') + '</span></td>' +
          '<td style="padding:6px 8px;"><button class="user-sessions-btn" data-user-id="' + u.id + '" data-username="' + u.username + '" style="padding:3px 8px;border:1px solid #444;background:transparent;color:#888;border-radius:3px;cursor:pointer;font-size:0.65rem;">View</button></td>' +
          '<td style="padding:6px 8px;">' +
          (isSelf ? '<span style="color:#555;font-size:0.65rem;">—</span>' :
            '<button class="user-toggle-btn" data-user-id="' + u.id + '" data-disable="' + (!disabled) + '" style="padding:3px 10px;border:none;background:' + (disabled ? '#69db7c' : '#ff6b6b') + ';color:#111;border-radius:3px;cursor:pointer;font-size:0.65rem;font-weight:600;">' + (disabled ? 'Enable' : 'Disable') + '</button>') +
          '</td>' +
          '</tr>';
      }).join('');

      body.querySelectorAll('.user-toggle-btn').forEach(function (btn) {
        btn.onclick = function () {
          var uid = btn.dataset.userId;
          var disable = btn.dataset.disable === 'true';
          apiFetch('/api/admin/users/' + uid, {
            method: 'PATCH',
            body: JSON.stringify({ disabled: disable })
          }).then(function () {
            if (window.PazatorUI && window.PazatorUI.showFloatingNotification) {
              window.PazatorUI.showFloatingNotification('User ' + (disable ? 'disabled' : 'enabled'), 'success', 2000);
            }
            loadUsers();
          }).catch(function (err) {
            if (window.PazatorUI && window.PazatorUI.showFloatingNotification) {
              window.PazatorUI.showFloatingNotification('Error: ' + err.message, 'error', 3000);
            }
          });
        };
      });

      body.querySelectorAll('.user-sessions-btn').forEach(function (btn) {
        btn.onclick = function () {
          var uid = btn.dataset.userId;
          var uname = btn.dataset.username;
          apiFetch('/api/admin/users/' + uid + '/sessions').then(function (result) {
            var sessions = result.sessions || [];
            var msg = 'Sessions for ' + uname + ': ' + sessions.length + ' active';
            if (sessions.length > 0) {
              var details = sessions.map(function (s) {
                return '<div style="padding:6px 0;border-bottom:1px solid #2a2a2a;font-size:0.7rem;display:flex;justify-content:space-between;align-items:center;">' +
                  '<span style="color:#999;">Created: ' + new Date(s.created_at).toLocaleString() + '<br><span style="color:#666;font-size:0.6rem;">Expires: ' + new Date(s.expires_at).toLocaleString() + '</span></span>' +
                  '<button class="kill-session-btn" data-token="' + s.token + '" style="padding:3px 8px;border:1px solid #ff6b6b;background:transparent;color:#ff6b6b;border-radius:3px;cursor:pointer;font-size:0.6rem;">Kill</button>' +
                  '</div>';
              }).join('');
              showSessionModal(uname, details);
            } else {
              if (window.showAlert) window.showAlert(msg);
            }
          }).catch(function (err) {
            if (window.showAlert) window.showAlert('Error: ' + err.message);
          });
        };
      });
    }).catch(function (err) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#ff6b6b;">Error: ' + err.message + '</td></tr>';
    });
  }

  function showSessionModal(username, detailsHtml) {
    var existing = document.getElementById('sessionModal');
    if (existing) existing.remove();
    var m = document.createElement('div');
    m.id = 'sessionModal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
    m.innerHTML =
      '<div style="background:#141414;border:1px solid #333;border-radius:8px;width:100%;max-width:450px;box-shadow:0 16px 48px rgba(0,0,0,0.5);">' +
      '  <div style="padding:14px 16px;border-bottom:1px solid #2a2a2a;display:flex;justify-content:space-between;align-items:center;">' +
      '    <span style="color:#eee;font-size:0.85rem;font-weight:500;">Sessions — ' + username + '</span>' +
      '    <span class="session-modal-close" style="width:24px;height:24px;border-radius:4px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#888;font-size:16px;">&times;</span>' +
      '  </div>' +
      '  <div style="padding:12px 16px;max-height:300px;overflow-y:auto;">' + detailsHtml + '</div>' +
      '</div>';
    document.body.appendChild(m);
    m.querySelector('.session-modal-close').onclick = function () { m.remove(); };
    m.addEventListener('click', function (e) { if (e.target === m) m.remove(); });
    m.querySelectorAll('.kill-session-btn').forEach(function (btn) {
      btn.onclick = function () {
        var token = btn.dataset.token;
        apiFetch('/api/admin/sessions/' + encodeURIComponent(token), { method: 'DELETE' }).then(function () {
          if (window.PazatorUI && window.PazatorUI.showFloatingNotification) {
            window.PazatorUI.showFloatingNotification('Session killed', 'success', 2000);
          }
          showSessionModal(username, detailsHtml.replace(btn.closest('[style*="padding:6px 0"]') ? btn.closest('[style*="padding:6px 0"]').outerHTML : '', ''));
          m.remove(); // close and reopen
        }).catch(function (err) {
          if (window.showAlert) window.showAlert('Error: ' + err.message);
        });
      };
    });
  }

  // ─── Stores (GET /api/sync/stores) ──────────────────────────────────────

  function renderStores(ctr) {
    ctr.innerHTML = '<div style="text-align:center;padding:40px;color:#555;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    apiFetch('/api/sync/stores').then(function (result) {
      var st = result.stores || [];
      if (!st.length) {
        ctr.innerHTML = '<div style="text-align:center;padding:40px;color:#555;">No stores found</div>';
        return;
      }
      var maxCount = 0;
      st.forEach(function (s) { if (s.count > maxCount) maxCount = s.count; });
      var h = '<div style="font-size:0.75rem;color:#888;margin-bottom:12px;">' + result.total + ' total records across ' + st.length + ' stores</div>' +
        '<div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:16px;">';
      st.forEach(function (s) {
        var pct = maxCount > 0 ? (s.count / maxCount * 100) : 0;
        h += '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;font-size:0.75rem;">' +
          '<span style="color:var(--text-muted, #888);width:100px;text-transform:uppercase;letter-spacing:0.08em;font-size:0.65rem;">' + s.store + '</span>' +
          '<div style="flex:1;height:20px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;"><div style="height:100%;width:' + pct + '%;background:#ffb432;opacity:0.7;border-radius:3px;"></div></div>' +
          '<span style="color:#eee;min-width:40px;text-align:right;font-weight:600;">' + s.count + '</span></div>';
      });
      h += '</div><div style="font-size:0.65rem;color:#555;margin-top:8px;">Latest seq: ' + result.latestSeq + '</div>';
      ctr.innerHTML = h;
    }).catch(function (err) {
      ctr.innerHTML = '<div style="text-align:center;padding:40px;color:#ff6b6b;">Error: ' + err.message + '</div>';
    });
  }

  // ─── Config (GET /api/admin/config) ─────────────────────────────────────

  function renderConfig(ctr) {
    ctr.innerHTML = '<div style="text-align:center;padding:40px;color:#555;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    apiFetch('/api/admin/config').then(function (data) {
      var envHtml = '';
      var envKeys = Object.keys(data.env || {});
      envKeys.forEach(function (k) {
        envHtml += '<tr><td style="color:#888;padding:5px 8px;font-size:0.65rem;">' + k + '</td><td style="padding:5px 8px;font-size:0.7rem;color:#ccc;">' + data.env[k] + '</td></tr>';
      });
      ctr.innerHTML =
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
        '  <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:14px;">' +
        '    <div style="font-size:0.65rem;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.08em;">Runtime</div>' +
        '    <table style="width:100%;font-size:0.7rem;"><tbody>' +
        '      <tr><td style="color:#888;padding:4px 0;">Node</td><td style="padding:4px 0;color:#eee;">' + data.node + '</td></tr>' +
        '      <tr><td style="color:#888;padding:4px 0;">Platform</td><td style="padding:4px 0;color:#eee;">' + data.platform + ' ' + data.arch + '</td></tr>' +
        '      <tr><td style="color:#888;padding:4px 0;">PID</td><td style="padding:4px 0;color:#eee;">' + data.pid + '</td></tr>' +
        '      <tr><td style="color:#888;padding:4px 0;">Uptime</td><td style="padding:4px 0;color:#eee;">' + Math.floor(data.uptime) + 's</td></tr>' +
        '      <tr><td style="color:#888;padding:4px 0;">Memory</td><td style="padding:4px 0;color:#eee;">' + (data.memory && data.memory.heapUsed ? (data.memory.heapUsed / 1024 / 1024).toFixed(1) + ' MB' : '—') + '</td></tr>' +
        '    </tbody></table></div>' +
        '  <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:14px;">' +
        '    <div style="font-size:0.65rem;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.08em;">Paths</div>' +
        '    <table style="width:100%;font-size:0.7rem;"><tbody>' +
        '      <tr><td style="color:#888;padding:4px 0;width:60px;">CWD</td><td style="padding:4px 0;color:#999;word-break:break-all;font-size:0.6rem;">' + data.cwd + '</td></tr>' +
        '      <tr><td style="color:#888;padding:4px 0;">DB</td><td style="padding:4px 0;color:#999;word-break:break-all;font-size:0.6rem;">' + data.dbPath + '</td></tr>' +
        '    </tbody></table></div></div>' +
        '  <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:14px;">' +
        '    <div style="font-size:0.65rem;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.08em;">Environment</div>' +
        '    <table style="width:100%;font-size:0.7rem;"><tbody>' + envHtml + '</tbody></table></div>';
    }).catch(function (err) {
      ctr.innerHTML = '<div style="text-align:center;padding:40px;color:#ff6b6b;">Error: ' + err.message + '</div>';
    });
  }

  // ─── My Sessions (GET /api/auth/sessions) ───────────────────────────────

  function renderMySessions(ctr) {
    ctr.innerHTML = '<div style="text-align:center;padding:40px;color:#555;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    apiFetch('/api/auth/sessions').then(function (result) {
      var s = result.sessions || [];
      var currentToken = localStorage.getItem('pazator_auth_token');
      if (!s.length) {
        ctr.innerHTML = '<div style="text-align:center;padding:40px;color:#555;">No active sessions</div>';
        return;
      }
      var h = '<div style="font-size:0.75rem;color:#888;margin-bottom:10px;">' + s.length + ' active session(s) for your account</div>' +
        '<div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;overflow:hidden;">' +
        '<table style="width:100%;border-collapse:collapse;font-size:0.7rem;">' +
        '<thead><tr style="border-bottom:1px solid #333;color:#888;font-size:0.65rem;">' +
        '  <th style="text-align:left;padding:8px 10px;">Token</th>' +
        '  <th style="text-align:left;padding:8px 10px;">Created</th>' +
        '  <th style="text-align:left;padding:8px 10px;">Expires</th>' +
        '  <th style="text-align:left;padding:8px 10px;"></th></tr></thead><tbody>';
      s.forEach(function (se) {
        var isCurrent = se.token === currentToken;
        h += '<tr style="border-bottom:1px solid #222;">' +
          '<td style="padding:8px 10px;color:#888;font-size:0.65rem;">' + se.token.slice(0, 16) + '..' + (isCurrent ? ' <span style="color:#69db7c;">(current)</span>' : '') + '</td>' +
          '<td style="padding:8px 10px;color:#999;">' + new Date(se.created_at).toLocaleString() + '</td>' +
          '<td style="padding:8px 10px;color:#999;">' + new Date(se.expires_at).toLocaleString() + '</td>' +
          '<td style="padding:8px 10px;">' + (isCurrent ? '' : '<button class="my-kill-session" data-token="' + se.token + '" style="padding:3px 10px;border:1px solid #ff6b6b;background:transparent;color:#ff6b6b;border-radius:3px;cursor:pointer;font-size:0.6rem;">Kill</button>') + '</td></tr>';
      });
      h += '</tbody></table></div>';
      ctr.innerHTML = h;
      ctr.querySelectorAll('.my-kill-session').forEach(function (btn) {
        btn.onclick = function () {
          var token = btn.dataset.token;
          apiFetch('/api/auth/sessions/' + encodeURIComponent(token), { method: 'DELETE' }).then(function () {
            if (window.PazatorUI && window.PazatorUI.showFloatingNotification) {
              window.PazatorUI.showFloatingNotification('Session killed', 'success', 2000);
            }
            renderMySessions(ctr);
          }).catch(function (err) {
            if (window.showAlert) window.showAlert('Error: ' + err.message);
          });
        };
      });
    }).catch(function (err) {
      ctr.innerHTML = '<div style="text-align:center;padding:40px;color:#ff6b6b;">Error: ' + err.message + '</div>';
    });
  }

  // ─── Export / Import ───────────────────────────────────────────────────

  function renderExportImport(ctr) {
    ctr.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">' +
      '  <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:20px;">' +
      '    <div style="font-size:0.85rem;font-weight:600;color:#eee;margin-bottom:8px;"><i class="fas fa-download" style="color:#69db7c;"></i> Export</div>' +
      '    <div style="font-size:0.7rem;color:#888;margin-bottom:14px;line-height:1.6;">Download all server data as JSON. Includes users, entities, operation log.</div>' +
      '    <button id="exportBtn" style="padding:8px 20px;border:none;background:#69db7c;color:#111;border-radius:4px;cursor:pointer;font-size:0.75rem;font-weight:600;"><i class="fas fa-file-export"></i> Download Export</button>' +
      '    <div id="exportStatus" style="font-size:0.7rem;color:#666;margin-top:8px;"></div>' +
      '  </div>' +
      '  <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:6px;padding:20px;">' +
      '    <div style="font-size:0.85rem;font-weight:600;color:#eee;margin-bottom:8px;"><i class="fas fa-upload" style="color:#ffd43b;"></i> Import</div>' +
      '    <div style="font-size:0.7rem;color:#888;margin-bottom:14px;line-height:1.6;">Restore from a previously exported JSON dump. <span style="color:#ff6b6b;">This replaces all server data.</span></div>' +
      '    <input type="file" id="importFileInput" accept=".json" style="display:none;">' +
      '    <button id="importBrowseBtn" style="padding:8px 20px;border:1px solid #ffd43b;background:transparent;color:#ffd43b;border-radius:4px;cursor:pointer;font-size:0.75rem;font-weight:500;"><i class="fas fa-folder-open"></i> Select File</button>' +
      '    <span id="importFileName" style="font-size:0.7rem;color:#888;margin-left:8px;"></span>' +
      '    <button id="importExecBtn" style="display:none;margin-top:10px;padding:8px 20px;border:none;background:#ff6b6b;color:#111;border-radius:4px;cursor:pointer;font-size:0.75rem;font-weight:600;"><i class="fas fa-exclamation-triangle"></i> Confirm Import</button>' +
      '    <div id="importStatus" style="font-size:0.7rem;color:#666;margin-top:8px;"></div>' +
      '  </div>' +
      '</div>';

    document.getElementById('exportBtn').onclick = function () {
      var st = document.getElementById('exportStatus');
      st.textContent = 'Exporting...';
      apiFetch('/api/admin/export').then(function (dump) {
        var blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'pazator-export-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(url);
        st.textContent = 'Exported ' + (dump.entities ? dump.entities.length : 0) + ' entities, ' + (dump.users ? dump.users.length : 0) + ' users';
        st.style.color = '#69db7c';
      }).catch(function (err) {
        st.textContent = 'Error: ' + err.message;
        st.style.color = '#ff6b6b';
      });
    };

    var fileInput = document.getElementById('importFileInput');
    document.getElementById('importBrowseBtn').onclick = function () { fileInput.click(); };
    fileInput.onchange = function () {
      var fn = document.getElementById('importFileName');
      var execBtn = document.getElementById('importExecBtn');
      var st = document.getElementById('importStatus');
      if (fileInput.files.length === 0) { fn.textContent = ''; execBtn.style.display = 'none'; return; }
      fn.textContent = fileInput.files[0].name;
      execBtn.style.display = 'inline-block';
      st.textContent = '';
    };
    document.getElementById('importExecBtn').onclick = function () {
      var st = document.getElementById('importStatus');
      var execBtn = document.getElementById('importExecBtn');
      if (!fileInput.files.length) { st.textContent = 'Select a file first'; return; }
      st.textContent = 'Reading file...';
      execBtn.disabled = true;
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var dump = JSON.parse(e.target.result);
          st.textContent = 'Importing...';
          apiFetch('/api/admin/import', {
            method: 'POST',
            body: JSON.stringify({ dump: dump })
          }).then(function (result) {
            st.textContent = 'Imported: ' + result.entities + ' entities, ' + result.users + ' users, ' + result.files + ' files';
            st.style.color = '#69db7c';
            execBtn.style.display = 'none';
            fileInput.value = '';
            document.getElementById('importFileName').textContent = '';
            if (window.PazatorUI && window.PazatorUI.showFloatingNotification) {
              window.PazatorUI.showFloatingNotification('Import complete — ' + result.entities + ' entities', 'success', 4000);
            }
          }).catch(function (err) {
            st.textContent = 'Error: ' + err.message;
            st.style.color = '#ff6b6b';
          }).finally(function () { execBtn.disabled = false; });
        } catch (parseErr) {
          st.textContent = 'Invalid JSON file';
          st.style.color = '#ff6b6b';
          execBtn.disabled = false;
        }
      };
      reader.readAsText(fileInput.files[0]);
    };
  }

  window.pazatorAdmin = { showPanel: showPanel };

})();
