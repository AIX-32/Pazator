(function () {
  const RESOLVER_CACHE_KEY = 'pazator_resolver_cache';
  const RESOLVER_HISTORY_KEY = 'pazator_resolver_history';

  let resolverResults = [];
  let localResults = [];

  function loadCache() {
    try {
      const raw = localStorage.getItem(RESOLVER_CACHE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveCache(results) {
    localStorage.setItem(RESOLVER_CACHE_KEY, JSON.stringify(results.slice(0, 100)));
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(RESOLVER_HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveHistory(action) {
    const history = loadHistory();
    history.push({ ...action, timestamp: new Date().toISOString() });
    localStorage.setItem(RESOLVER_HISTORY_KEY, JSON.stringify(history.slice(-50)));
  }

  function getSyncServerUrl() {
    if (window.pazatorSync && window.pazatorSync.getConfig) {
      const cfg = window.pazatorSync.getConfig();
      return cfg ? cfg.url.replace(/\/$/, '') : null;
    }
    return null;
  }

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  function nameSimilarity(a, b) {
    if (!a || !b) return 0;
    const an = a.toLowerCase().trim();
    const bn = b.toLowerCase().trim();
    if (an === bn) return 1;
    const dist = levenshtein(an, bn);
    const maxLen = Math.max(an.length, bn.length);
    if (maxLen === 0) return 1;
    return 1 - dist / maxLen;
  }

  function scanLocal() {
    const data = window.pazatorStore && window.pazatorStore._data;
    if (!data) return [];

    const allEntities = [];
    for (const h of (data.humans || [])) {
      allEntities.push({ ...h, _type: 'human' });
    }
    for (const o of (data.others || [])) {
      allEntities.push({ ...o, _type: 'other' });
    }

    const results = [];
    for (let i = 0; i < allEntities.length; i++) {
      for (let j = i + 1; j < allEntities.length; j++) {
        const a = allEntities[i];
        const b = allEntities[j];
        if (!a.name || !b.name) continue;

        let score = 0;
        const reasons = [];

        const nameSim = nameSimilarity(a.name, b.name);
        if (nameSim > 0.7) {
          score += nameSim * 45;
          reasons.push(`Name similarity: ${(nameSim * 100).toFixed(0)}%`);
        }

        if (a.birthDate && b.birthDate && a.birthDate === b.birthDate) {
          score += 25;
          reasons.push('Same birth date');
        }

        if (a.nationality && b.nationality && a.nationality === b.nationality) {
          score += 10;
          reasons.push('Same nationality');
        }

        if (a.workplace && b.workplace && a.workplace === b.workplace) {
          score += 10;
          reasons.push('Same workplace');
        }

        if (a.tags && b.tags && Array.isArray(a.tags) && Array.isArray(b.tags)) {
          const common = a.tags.filter(t => b.tags.includes(t));
          score += common.length * 5;
          if (common.length > 0) reasons.push(`Shared tags: ${common.join(', ')}`);
        }

        if (score > 20) {
          const normalizedScore = Math.min(score / 100, 1);
          results.push({
            entity1: { id: a.id, name: a.name, type: a._type },
            entity2: { id: b.id, name: b.name, type: b._type },
            score: normalizedScore,
            reasons
          });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 200);
  }

  async function scanRemote() {
    const url = getSyncServerUrl();
    if (!url) return null;

    try {
      const threshold = document.getElementById('resolverThreshold') ?
        parseFloat(document.getElementById('resolverThreshold').value) : 0.6;
      const resp = await fetch(`${url}/api/resolve?threshold=${threshold}`);
      if (!resp.ok) return null;
      const result = await resp.json();
      return result.results || [];
    } catch (e) {
      return null;
    }
  }

  async function runResolver(useRemote = false) {
    const resultsPanel = document.getElementById('resolverResults');
    if (resultsPanel) {
      resultsPanel.innerHTML = '<div style="color:#888;padding:20px;text-align:center;"><i class="fas fa-spinner fa-spin"></i> Running entity resolution...</div>';
    }

    localResults = scanLocal();

    if (useRemote) {
      const remote = await scanRemote();
      if (remote && remote.length > 0) {
        const localIds = new Set(localResults.map(r => `${r.entity1.id}-${r.entity2.id}`));
        for (const r of remote) {
          if (!localIds.has(`${r.entity1.id}-${r.entity2.id}`)) {
            localResults.push(r);
          }
        }
        localResults.sort((a, b) => b.score - a.score);
      }
    }

    resolverResults = localResults;
    saveCache(resolverResults);
    saveHistory({ action: 'scan', count: resolverResults.length, remote: useRemote });

    renderResults(resolverResults);
    return resolverResults;
  }

  function renderResults(results) {
    const panel = document.getElementById('resolverResults');
    if (!panel) return;

    if (results.length === 0) {
      panel.innerHTML = `
        <div style="color:#888;padding:30px;text-align:center;">
          <i class="fas fa-check-circle" style="font-size:2rem;color:#4caf50;margin-bottom:10px;"></i>
          <p>No potential duplicates found</p>
          <small>Entity resolution complete — all clear</small>
        </div>
      `;
      return;
    }

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:8px;">
        <span style="color:#888;font-size:0.8rem;">${results.length} potential match${results.length > 1 ? 'es' : ''}</span>
        <button id="resolverMergeAllBtn" class="btn glass-btn" style="padding:4px 10px;font-size:0.75rem;">
          <i class="fas fa-compress-alt"></i> Merge All
        </button>
      </div>
      <div style="max-height:400px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">
        ${results.map((r, idx) => `
          <div class="resolver-card" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div style="flex:1;">
                <div style="font-size:0.85rem;font-weight:600;color:#ddd;">
                  ${escapeHtml(r.entity1.name)}
                  <span style="color:#666;font-size:0.7rem;font-weight:400;"> (${r.entity1.type})</span>
                </div>
                <div style="font-size:0.75rem;color:#888;margin:2px 0;">${escapeHtml(r.entity1.id)}</div>
                <div style="text-align:center;color:#666;font-size:0.7rem;margin:4px 0;">
                  <i class="fas fa-exchange-alt"></i>
                </div>
                <div style="font-size:0.85rem;font-weight:600;color:#ddd;">
                  ${escapeHtml(r.entity2.name)}
                  <span style="color:#666;font-size:0.7rem;font-weight:400;"> (${r.entity2.type})</span>
                </div>
                <div style="font-size:0.75rem;color:#888;margin:2px 0;">${escapeHtml(r.entity2.id)}</div>
              </div>
              <div style="text-align:right;flex-shrink:0;margin-left:12px;">
                <div style="font-size:1.2rem;font-weight:700;${r.score > 0.8 ? 'color:#f44336' : r.score > 0.6 ? 'color:#ff9800' : 'color:#ffeb3b'}">
                  ${(r.score * 100).toFixed(0)}%
                </div>
                <div style="font-size:0.65rem;color:#888;">match</div>
              </div>
            </div>
            ${r.reasons && r.reasons.length > 0 ? `
              <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">
                ${r.reasons.map(rs => `<span style="font-size:0.65rem;color:#888;background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px;">${escapeHtml(rs)}</span>`).join('')}
              </div>
            ` : ''}
            <div style="margin-top:8px;display:flex;gap:6px;">
              <button class="resolver-merge-btn btn btn-primary" data-idx="${idx}" style="flex:1;padding:5px;font-size:0.75rem;">
                <i class="fas fa-compress-alt"></i> Merge
              </button>
              <button class="resolver-dismiss-btn btn glass-btn" data-idx="${idx}" style="padding:5px;font-size:0.75rem;">
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    panel.querySelectorAll('.resolver-merge-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const idx = parseInt(this.dataset.idx);
        mergeEntities(resolverResults[idx]);
      });
    });
    panel.querySelectorAll('.resolver-dismiss-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const idx = parseInt(this.dataset.idx);
        resolverResults.splice(idx, 1);
        renderResults(resolverResults);
      });
    });

    const mergeAllBtn = document.getElementById('resolverMergeAllBtn');
    if (mergeAllBtn) {
      mergeAllBtn.addEventListener('click', function () {
        if (confirm(`Merge all ${resolverResults.length} pairs? This will consolidate duplicate entities.`)) {
          for (const r of [...resolverResults]) {
            mergeEntities(r);
          }
          resolverResults = [];
          renderResults(resolverResults);
        }
      });
    }
  }

  function mergeEntities(pair) {
    if (!pair || !pair.entity1 || !pair.entity2) return;
    const data = window.pazatorStore && window.pazatorStore._data;
    if (!data) return;

    const store1 = pair.entity1.type === 'human' ? data.humans : data.others;
    const store2 = pair.entity2.type === 'human' ? data.humans : data.others;

    const e1 = store1.find(e => e.id === pair.entity1.id);
    const e2 = store2.find(e => e.id === pair.entity2.id);
    if (!e1 || !e2) return;

    const merged = { ...e2 };
    for (const key of Object.keys(e1)) {
      if (key === 'id') continue;
      if (!merged[key] || merged[key] === '' || merged[key] === null || merged[key] === undefined) {
        merged[key] = e1[key];
      } else if (key === 'notes' || key === 'extraNotes') {
        merged[key] = [e1[key], e2[key]].filter(Boolean).join('\n---\n');
      } else if (key === 'tags' && Array.isArray(e1[key]) && Array.isArray(e2[key])) {
        merged[key] = [...new Set([...e1[key], ...e2[key]])];
      }
    }
    merged.mergedFrom = [e1.id, e2.id];

    const idx1 = store1.indexOf(e1);
    if (idx1 > -1) store1.splice(idx1, 1);
    const idx2 = store2.indexOf(e2);
    if (idx2 > -1) store2.splice(idx2, 1);

    if (pair.entity1.type === 'human') {
      data.humans.push(merged);
    } else {
      data.others.push(merged);
    }

    if (window.pazatorStore) {
      window.pazatorStore.markDirty('humans');
      window.pazatorStore.markDirty('others');
    }

    saveHistory({ action: 'merge', entity1: pair.entity1, entity2: pair.entity2 });
    window.PazatorUI && window.PazatorUI.showFloatingNotification(
      `Merged: ${pair.entity1.name} → ${pair.entity2.name}`,
      'success',
      3000
    );
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function showResolverModal() {
    const existing = document.getElementById('resolverModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'resolverModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content resolver-content" style="max-width:700px;">
        <button class="close" style="position:absolute;top:10px;left:10px;z-index:1001;">&times;</button>
        <div class="modal-header">
          <h2><i class="fas fa-fingerprint"></i> Entity Resolution 2.0</h2>
        </div>
        <div class="modal-body">
          <p style="color:#888;font-size:0.85rem;margin-bottom:16px;">
            ML-based probabilistic matching to find duplicate or related entities across your data sources.
          </p>

          <div style="display:flex;gap:12px;margin-bottom:16px;align-items:center;">
            <div style="flex:1;">
              <label style="font-size:0.75rem;color:#888;display:block;margin-bottom:4px;">Match threshold</label>
              <input type="range" id="resolverThreshold" min="0.3" max="0.95" step="0.05" value="0.6"
                style="width:100%;">
              <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:#555;">
                <span>Low</span>
                <span id="resolverThresholdValue">60%</span>
                <span>High</span>
              </div>
            </div>
            <div>
              <label style="font-size:0.75rem;color:#888;display:block;margin-bottom:4px;">&nbsp;</label>
              <label class="gis-toggle" style="display:flex;align-items:center;gap:6px;font-size:0.8rem;cursor:pointer;">
                <input type="checkbox" id="resolverUseRemote">
                <span>Server-side</span>
              </label>
            </div>
          </div>

          <div style="display:flex;gap:8px;margin-bottom:16px;">
            <button id="resolverScanBtn" class="btn btn-primary" style="flex:1;padding:10px;">
              <i class="fas fa-search"></i> Scan for Duplicates
            </button>
            <button id="resolverCacheBtn" class="btn glass-btn" style="padding:10px;">
              <i class="fas fa-history"></i> Show Cached
            </button>
          </div>

          <div id="resolverResults" style="min-height:100px;">
            <div style="color:#888;padding:30px;text-align:center;">
              <i class="fas fa-fingerprint" style="font-size:2rem;margin-bottom:10px;opacity:0.3;"></i>
              <p>Run a scan to find potential duplicate entities</p>
              <small>Client-side scanning works offline. Server-side requires a sync server connection.</small>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('active'), 10);

    const closeBtn = modal.querySelector('.close');
    closeBtn.addEventListener('click', () => { modal.classList.remove('active'); setTimeout(() => modal.remove(), 300); });
    modal.addEventListener('click', (e) => { if (e.target === modal) { modal.classList.remove('active'); setTimeout(() => modal.remove(), 300); } });

    const thresholdInput = document.getElementById('resolverThreshold');
    const thresholdValue = document.getElementById('resolverThresholdValue');
    thresholdInput.addEventListener('input', function () {
      thresholdValue.textContent = Math.round(parseFloat(this.value) * 100) + '%';
    });

    document.getElementById('resolverScanBtn').addEventListener('click', async function () {
      const useRemote = document.getElementById('resolverUseRemote').checked;
      this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';
      this.disabled = true;
      await runResolver(useRemote);
      this.innerHTML = '<i class="fas fa-search"></i> Scan for Duplicates';
      this.disabled = false;
    });

    document.getElementById('resolverCacheBtn').addEventListener('click', function () {
      const cached = loadCache();
      if (cached.length === 0) {
        window.PazatorUI && window.PazatorUI.showFloatingNotification('No cached results', 'info', 2000);
        return;
      }
      resolverResults = cached;
      renderResults(cached);
      window.PazatorUI && window.PazatorUI.showFloatingNotification(`Loaded ${cached.length} cached results`, 'info', 2000);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    const cached = loadCache();
    if (cached.length > 0) {
      resolverResults = cached;
    }

    const resolverBtn = document.getElementById('intelResolverBtn');
    if (resolverBtn) {
      resolverBtn.addEventListener('click', function () {
        showResolverModal();
      });
    }

    const resolverSummary = document.getElementById('intelResolverSummary');
    if (resolverSummary) {
      const cachedCount = loadCache().length;
      resolverSummary.textContent = cachedCount > 0
        ? `${cachedCount} cached match${cachedCount > 1 ? 'es' : ''}`
        : 'ML-based probabilistic matching';
    }
  });

  window.pazatorResolver = {
    runResolver,
    scanLocal,
    scanRemote,
    mergeEntities,
    showResolverModal,
    getResults: () => resolverResults
  };
})();
