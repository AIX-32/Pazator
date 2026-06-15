(function () {
  const CLASSIFICATION_LEVELS = [
    { id: 'unclassified',  label: 'Unclassified',  level: 0, color: '#6b7280', icon: 'fa-circle' },
    { id: 'confidential',  label: 'Confidential',  level: 1, color: '#3b82f6', icon: 'fa-lock' },
    { id: 'secret',        label: 'Secret',        level: 2, color: '#f59e0b', icon: 'fa-lock' },
    { id: 'top_secret',    label: 'Top Secret',    level: 3, color: '#ef4444', icon: 'fa-shield' },
    { id: 'ts_sci',        label: 'TS//SCI',      level: 4, color: '#dc2626', icon: 'fa-shield-halved' },
  ];

  const LEVEL_MAP = Object.fromEntries(CLASSIFICATION_LEVELS.map(l => [l.id, l]));

  function getLevel(id) { return LEVEL_MAP[id] || LEVEL_MAP.unclassified; }

  function getBadgeHTML(entity) {
    const cl = entity && entity.classification;
    if (!cl || cl.level === 'unclassified' || !cl.level) return '';
    const def = getLevel(cl.level);
    return `<span class="cl-badge" style="background:${def.color};color:#fff;" title="Classified: ${def.label}">${def.label}</span>`;
  }

  function assignClassification(entity, levelId, username) {
    entity.classification = {
      level: levelId || 'unclassified',
      classifiedBy: username || 'unknown',
      classifiedAt: new Date().toISOString()
    };
    return entity;
  }

  function removeClassification(entity) {
    delete entity.classification;
    return entity;
  }

  function getClassifiedEntities() {
    const stores = ['humans', 'others'];
    const result = { humans: [], others: [] };
    for (const store of stores) {
      const arr = window.pazatorStore && window.pazatorStore._data ? window.pazatorStore._data[store] : [];
      for (const item of arr) {
        if (item && item.classification && item.classification.level && item.classification.level !== 'unclassified') {
          result[store].push(item);
        }
      }
    }
    return result;
  }

  function classifyRecent(minutes, levelId, username) {
    minutes = minutes || 30;
    levelId = levelId || 'confidential';
    const cutoff = Date.now() - minutes * 60 * 1000;
    const stores = ['humans', 'others'];
    let count = 0;
    for (const store of stores) {
      const arr = window.pazatorStore && window.pazatorStore._data ? window.pazatorStore._data[store] : [];
      for (const item of arr) {
        if (item) {
          const updated = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
          const created = item.createdAt ? new Date(item.createdAt).getTime() : 0;
          if (updated > cutoff || created > cutoff) {
            assignClassification(item, levelId, username);
            count++;
          }
        }
      }
    }
    if (count > 0 && window.pazatorStore && window.pazatorStore.markDirty) {
      window.pazatorStore.markDirty('humans');
      window.pazatorStore.markDirty('others');
    }
    return count;
  }

  function showClassifyModal(entity, type, onSave) {
    const existing = document.getElementById('pzClassifyModal');
    if (existing) existing.remove();

    const currentLevel = entity && entity.classification ? entity.classification.level : 'unclassified';

    const modal = document.createElement('div');
    modal.id = 'pzClassifyModal';
    modal.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;" id="pzClassifyBackdrop">
        <div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:10px;width:100%;max-width:400px;box-shadow:0 16px 48px rgba(0,0,0,0.4);">
          <div style="display:flex;align-items:center;gap:10px;padding:16px 18px 0 18px;">
            <span style="width:30px;height:30px;border-radius:7px;background:var(--info-bg);display:flex;align-items:center;justify-content:center;"><i class="fas fa-shield-alt" style="font-size:13px;color:var(--info);"></i></span>
            <span style="flex:1;color:var(--text-primary);font-size:0.95rem;font-weight:600;">Classify Entity</span>
            <span id="pzClassifyClose" style="width:26px;height:26px;border-radius:5px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-muted);font-size:18px;">&times;</span>
          </div>
          <div style="padding:14px 18px 12px 18px;">
            <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:12px;">
              Assign classification level to <strong>${entity ? entity.name || entity.id : 'selected entity'}</strong>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;" id="pzClassifyLevels">
              ${CLASSIFICATION_LEVELS.map(l => `
                <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:7px;border:2px solid ${currentLevel === l.id ? l.color : 'var(--border-color)'};background:${currentLevel === l.id ? l.color + '18' : 'transparent'};cursor:pointer;transition:all 0.15s;" class="pz-cl-level" data-level="${l.id}">
                  <input type="radio" name="pzClLevel" value="${l.id}" ${currentLevel === l.id ? 'checked' : ''} style="accent-color:${l.color};">
                  <span style="width:20px;height:20px;border-radius:50%;background:${l.color};display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas ${l.icon}" style="font-size:10px;color:#fff;"></i></span>
                  <span style="flex:1;font-size:0.85rem;font-weight:500;color:var(--text-primary);">${l.label}</span>
                  <span style="font-size:0.7rem;color:var(--text-muted);">Lvl ${l.level}</span>
                </label>
              `).join('')}
            </div>
          </div>
          <div style="display:flex;gap:6px;justify-content:flex-end;padding:0 18px 16px 18px;">
            <button id="pzClassifyCancel" style="padding:7px 14px;border:1px solid var(--border-color);background:transparent;color:var(--text-secondary);border-radius:5px;cursor:pointer;font-size:0.75rem;"><i class="fas fa-times"></i> Cancel</button>
            <button id="pzClassifyClear" style="padding:7px 14px;border:1px solid var(--danger-border);background:transparent;color:var(--danger);border-radius:5px;cursor:pointer;font-size:0.75rem;"><i class="fas fa-undo"></i> Remove</button>
            <button id="pzClassifyApply" style="padding:7px 14px;border:none;background:var(--btn-primary-bg);color:#111;border-radius:5px;cursor:pointer;font-size:0.75rem;font-weight:600;"><i class="fas fa-shield-alt"></i> Apply</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(modal);

    function close() { modal.remove(); }

    modal.querySelector('#pzClassifyClose').addEventListener('click', close);
    modal.querySelector('#pzClassifyCancel').addEventListener('click', close);
    modal.querySelector('#pzClassifyBackdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });

    modal.querySelectorAll('.pz-cl-level').forEach(el => {
      el.addEventListener('click', () => {
        modal.querySelectorAll('.pz-cl-level').forEach(x => {
          const lvl = x.dataset.level;
          const def = getLevel(lvl);
          x.style.borderColor = 'var(--border-color)';
          x.style.background = 'transparent';
        });
        const lvl = el.dataset.level;
        const def = getLevel(lvl);
        el.style.borderColor = def.color;
        el.style.background = def.color + '18';
        el.querySelector('input[type="radio"]').checked = true;
      });
    });

    modal.querySelector('#pzClassifyApply').addEventListener('click', () => {
      const checked = modal.querySelector('input[name="pzClLevel"]:checked');
      if (!checked) return;
      const levelId = checked.value;
      if (onSave) onSave(levelId);
      close();
    });

    modal.querySelector('#pzClassifyClear').addEventListener('click', () => {
      if (onSave) onSave('unclassified');
      close();
    });
  }

  function showBulkClassifyModal() {
    const existing = document.getElementById('pzBulkClassifyModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'pzBulkClassifyModal';
    modal.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;" id="pzBulkBackdrop">
        <div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:10px;width:100%;max-width:420px;box-shadow:0 16px 48px rgba(0,0,0,0.4);">
          <div style="display:flex;align-items:center;gap:10px;padding:16px 18px 0 18px;">
            <span style="width:30px;height:30px;border-radius:7px;background:var(--warning-bg);display:flex;align-items:center;justify-content:center;"><i class="fas fa-shield-alt" style="font-size:13px;color:var(--warning);"></i></span>
            <span style="flex:1;color:var(--text-primary);font-size:0.95rem;font-weight:600;">Bulk Classify</span>
            <span id="pzBulkClose" style="width:26px;height:26px;border-radius:5px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-muted);font-size:18px;">&times;</span>
          </div>
          <div style="padding:14px 18px 12px 18px;">
            <div class="form-group" style="margin-bottom:10px;">
              <label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px;">Time Range</label>
              <select id="pzBulkTimeRange" class="form-control">
                <option value="30">Past 30 minutes</option>
                <option value="60">Past hour</option>
                <option value="180">Past 3 hours</option>
                <option value="1440">Past 24 hours</option>
                <option value="10080">Past 7 days</option>
                <option value="0">All time</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:10px;">
              <label style="font-size:0.75rem;color:var(--text-muted);display:block;margin-bottom:4px;">Classification Level</label>
              <select id="pzBulkLevel" class="form-control">
                ${CLASSIFICATION_LEVELS.filter(l => l.level > 0).map(l => `<option value="${l.id}">${l.label}</option>`).join('')}
              </select>
            </div>
            <div style="padding:8px 10px;border-radius:6px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);font-size:0.75rem;color:var(--text-secondary);">
              <i class="fas fa-info-circle" style="margin-right:5px;"></i>
              This will classify all entities updated or created within the selected time range.
            </div>
            <div id="pzBulkResult" style="margin-top:8px;font-size:0.8rem;color:var(--success);min-height:18px;"></div>
          </div>
          <div style="display:flex;gap:6px;justify-content:flex-end;padding:0 18px 16px 18px;">
            <button id="pzBulkCancel" style="padding:7px 14px;border:1px solid var(--border-color);background:transparent;color:var(--text-secondary);border-radius:5px;cursor:pointer;font-size:0.75rem;"><i class="fas fa-times"></i> Cancel</button>
            <button id="pzBulkApply" style="padding:7px 14px;border:none;background:var(--btn-primary-bg);color:#111;border-radius:5px;cursor:pointer;font-size:0.75rem;font-weight:600;"><i class="fas fa-shield-alt"></i> Classify</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(modal);

    function close() { modal.remove(); }

    modal.querySelector('#pzBulkClose').addEventListener('click', close);
    modal.querySelector('#pzBulkCancel').addEventListener('click', close);
    modal.querySelector('#pzBulkBackdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });

    modal.querySelector('#pzBulkApply').addEventListener('click', () => {
      const minutes = parseInt(modal.querySelector('#pzBulkTimeRange').value, 10);
      const levelId = modal.querySelector('#pzBulkLevel').value;
      const username = window.pazatorSync ? window.pazatorSync.getCurrentUser()?.username || 'local' : 'local';
      const count = classifyRecent(minutes || 999999, levelId, username);
      const resultEl = modal.querySelector('#pzBulkResult');
      if (count > 0) {
        resultEl.innerHTML = `<i class="fas fa-check-circle"></i> Classified ${count} entit${count === 1 ? 'y' : 'ies'} as ${getLevel(levelId).label}.`;
        window.PazatorUI && window.PazatorUI.showFloatingNotification(`Classified ${count} entities`, 'success', 3000);
      } else {
        resultEl.innerHTML = '<i class="fas fa-info-circle"></i> No entities found in the selected time range.';
      }
    });
  }

  window.pazatorClassification = {
    levels: CLASSIFICATION_LEVELS,
    getLevel,
    getBadgeHTML,
    assignClassification,
    removeClassification,
    getClassifiedEntities,
    classifyRecent,
    showClassifyModal,
    showBulkClassifyModal,
  };
})();
