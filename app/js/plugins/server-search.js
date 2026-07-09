(function () {
  'use strict';

  var pluginId = 'pazator-server-search';

  function getApiPath() {
    try {
      var cfg = JSON.parse(localStorage.getItem('pazator_sync_config') || 'null');
      var token = localStorage.getItem('pazator_auth_token');
      if (!cfg || !token) return null;
      return { url: cfg.url.replace(/\/+$/, ''), token: token };
    } catch (e) { return null; }
  }

  function doSearch(query, store, page) {
    var server = getApiPath();
    if (!server) {
      if (window.PazatorUI && window.PazatorUI.showFloatingNotification) {
        window.PazatorUI.showFloatingNotification('Server search requires PZLS connection', 'warning', 3000);
      }
      return Promise.reject(new Error('No server'));
    }
    var params = 'q=' + encodeURIComponent(query) + '&page=' + (page || 1) + '&perPage=50';
    if (store) params += '&store=' + encodeURIComponent(store);
    return fetch(server.url + '/api/search?' + params, {
      headers: { 'Authorization': 'Bearer ' + server.token }
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || 'Search failed'); });
      return r.json();
    });
  }

  var modalOpen = false;

  function openSearchModal() {
    if (modalOpen) return;
    modalOpen = true;

    var backdrop = document.createElement('div');
    backdrop.id = 'serverSearchModal';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding-top:80px;';
    backdrop.innerHTML =
      '<div style="background:#111;border:1px solid #333;border-radius:8px;width:100%;max-width:700px;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
      '  <div style="padding:16px 20px;border-bottom:1px solid #2a2a2a;">' +
      '    <div style="display:flex;gap:8px;align-items:center;">' +
      '      <i class="fas fa-search" style="color:#888;font-size:14px;"></i>' +
      '      <input type="text" id="serverSearchInput" placeholder="Search server-side entities..." style="flex:1;padding:8px 12px;border:1px solid #333;border-radius:4px;background:#1a1a1a;color:#eee;font-size:0.9rem;outline:none;">' +
      '      <select id="serverSearchStore" style="padding:8px;border:1px solid #333;border-radius:4px;background:#1a1a1a;color:#aaa;font-size:0.75rem;">' +
      '        <option value="">All stores</option>' +
      '        <option value="humans">Humans</option>' +
      '        <option value="others">Organizations</option>' +
      '        <option value="cases">Cases</option>' +
      '        <option value="chats">Chats</option>' +
      '      </select>' +
      '      <button id="serverSearchClose" style="width:28px;height:28px;border-radius:5px;border:none;background:transparent;color:#888;cursor:pointer;font-size:18px;">&times;</button>' +
      '    </div>' +
      '  </div>' +
      '  <div id="serverSearchResults" style="flex:1;overflow-y:auto;padding:12px 16px;min-height:200px;">' +
      '    <div style="text-align:center;padding:40px 0;color:#555;font-size:0.85rem;">Type a query (min 2 chars) to search across all entity data on the server</div>' +
      '  </div>' +
      '  <div id="serverSearchFooter" style="padding:8px 16px;border-top:1px solid #2a2a2a;font-size:0.7rem;color:#555;display:flex;justify-content:space-between;">' +
      '    <span id="serverSearchInfo">Server-side search via SQL LIKE</span>' +
      '    <span id="serverSearchPagination"></span>' +
      '  </div>' +
      '</div>';

    document.body.appendChild(backdrop);

    var input = document.getElementById('serverSearchInput');
    var resultsEl = document.getElementById('serverSearchResults');
    var infoEl = document.getElementById('serverSearchInfo');
    var paginationEl = document.getElementById('serverSearchPagination');
    var storeSelect = document.getElementById('serverSearchStore');

    var currentPage = 1;
    var totalPages = 0;
    var debounceTimer = null;

    function runSearch(page) {
      var q = input.value.trim();
      if (q.length < 2) {
        resultsEl.innerHTML = '<div style="text-align:center;padding:40px 0;color:#555;">Need at least 2 characters</div>';
        infoEl.textContent = 'Server-side search via SQL LIKE';
        paginationEl.textContent = '';
        return;
      }
      currentPage = page || 1;
      resultsEl.innerHTML = '<div style="text-align:center;padding:40px 0;color:#555;"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';
      doSearch(q, storeSelect.value, currentPage).then(function (result) {
        totalPages = result.totalPages || 0;
        infoEl.textContent = result.total + ' results for "' + result.query + '"';
        paginationEl.textContent = (result.totalPages > 1) ? 'Page ' + result.page + ' of ' + result.totalPages : '';

        if (!result.results || result.results.length === 0) {
          resultsEl.innerHTML = '<div style="text-align:center;padding:40px 0;color:#555;">No results found</div>';
          return;
        }

        resultsEl.innerHTML = result.results.map(function (r) {
          var data = r.data || {};
          var name = data.name || data.title || r.id;
          var type = data.objectType || data.type || '';
          var tags = Array.isArray(data.tags) ? data.tags.join(', ') : '';
          return '<div style="padding:10px 12px;border:1px solid #2a2a2a;border-radius:5px;margin-bottom:6px;cursor:pointer;transition:background 0.15s;" ' +
            'onmouseover="this.style.background=\'#1a1a1a\'" onmouseout="this.style.background=\'transparent\'" ' +
            'onclick="window.pazatorServerSearchResult && window.pazatorServerSearchResult(\'' + r.id + '\', \'' + r.store + '\')">' +
            '  <div style="display:flex;justify-content:space-between;align-items:center;">' +
            '    <div style="font-size:0.85rem;color:#eee;font-weight:500;">' + name + '</div>' +
            '    <span style="font-size:0.6rem;color:#555;text-transform:uppercase;letter-spacing:0.04em;border:1px solid #333;padding:2px 6px;border-radius:3px;">' + r.store + '</span>' +
            '  </div>' +
            (type ? '<div style="font-size:0.7rem;color:#888;margin-top:3px;">' + type + '</div>' : '') +
            (tags ? '<div style="font-size:0.65rem;color:#666;margin-top:2px;">' + tags + '</div>' : '') +
            '  <div style="font-size:0.6rem;color:#555;margin-top:3px;">ID: ' + r.id + ' · Updated: ' + new Date(r.updatedAt).toLocaleString() + '</div>' +
            '</div>';
        }).join('');

        if (totalPages > 1) {
          var pagHtml = '';
          if (currentPage > 1) pagHtml += '<button class="search-page-btn" data-page="' + (currentPage - 1) + '" style="padding:4px 10px;border:1px solid #444;background:transparent;color:#aaa;border-radius:3px;cursor:pointer;font-size:0.65rem;margin-right:4px;">Prev</button>';
          pagHtml += '<span style="color:#666;font-size:0.65rem;margin:0 4px;">Page ' + currentPage + '/' + totalPages + '</span>';
          if (currentPage < totalPages) pagHtml += '<button class="search-page-btn" data-page="' + (currentPage + 1) + '" style="padding:4px 10px;border:1px solid #444;background:transparent;color:#aaa;border-radius:3px;cursor:pointer;font-size:0.65rem;">Next</button>';
          resultsEl.innerHTML += '<div style="text-align:center;padding:10px 0;">' + pagHtml + '</div>';
          resultsEl.querySelectorAll('.search-page-btn').forEach(function (btn) {
            btn.onclick = function () { runSearch(parseInt(btn.dataset.page)); };
          });
        }
      }).catch(function (err) {
        resultsEl.innerHTML = '<div style="text-align:center;padding:40px 0;color:#ff6b6b;">Error: ' + err.message + '</div>';
      });
    }

    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () { runSearch(1); }, 400);
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') runSearch(1); });
    storeSelect.addEventListener('change', function () { runSearch(1); });

    function closeSearchModal() {
      modalOpen = false;
      backdrop.remove();
    }
    document.getElementById('serverSearchClose').onclick = closeSearchModal;
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeSearchModal(); });

    setTimeout(function () { input.focus(); }, 100);
  }

  // Expose a click handler for search results
  window.pazatorServerSearchResult = function (id, store) {
    if (window.pazatorObjects && window.pazatorObjects.showObjectDetail) {
      window.pazatorObjects.showObjectDetail(id, store);
    }
  };

  // Register the plugin - but we'll disable it after to make it default-off
  window.pazatorPlugins.register({
    id: pluginId,
    name: 'Server Search',
    version: '1.0.0',
    description: 'Server-side full-text search. Fetches results directly from the PZLS database via SQL LIKE queries instead of client-side filtering.',
    icon: 'fas fa-server',
    author: 'Pazator',
    menuItems: [{
      menu: 'data',
      label: 'Server Search',
      icon: 'fas fa-server',
      action: function () {
        var server = getApiPath();
        if (!server) {
          if (window.PazatorUI && window.PazatorUI.showFloatingNotification) {
            window.PazatorUI.showFloatingNotification('Connect to PZLS first (System → PZLS)', 'warning', 4000);
          }
          return;
        }
        openSearchModal();
      }
    }],
    onLoad: function () {},
    onUnload: function () {}
  });

})();
