(function () {
    'use strict';

    var STORAGE_KEY = 'pazator_snappy_shots';
    var MAX_SHOTS = 20;
    var shots = [];

    function load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            shots = raw ? JSON.parse(raw) : [];
        } catch (e) {
            shots = [];
        }
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(shots));
        } catch (e) {
            // storage full — silently fail
        }
    }

    function notify(msg, type) {
        var fn = window.showFloatingNotification || window.PazatorUI && window.PazatorUI.showFloatingNotification;
        if (fn) fn(msg, type || 'info');
    }

    function download(shot) {
        var a = document.createElement('a');
        a.href = shot.dataUrl;
        a.download = 'snappy-' + new Date(shot.ts).toISOString().slice(0, 19).replace(/:/g, '-') + '.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    async function capture() {
        if (typeof html2canvas === 'undefined') {
            notify('html2canvas not loaded', 'error');
            return null;
        }
        try {
            var canvas = await html2canvas(document.documentElement, {
                scale: 1,
                useCORS: true,
                logging: false,
                backgroundColor: '#0a0a0a'
            });
            var dataUrl = canvas.toDataURL('image/png');
            var shot = {
                id: Date.now(),
                ts: new Date().toISOString(),
                dataUrl: dataUrl,
                width: canvas.width,
                height: canvas.height
            };
            shots.unshift(shot);
            if (shots.length > MAX_SHOTS) shots.length = MAX_SHOTS;
            save();
            notify('Snappy captured (' + shots.length + ' total)', 'success');
            return shot;
        } catch (e) {
            console.error('[Snappy] capture failed:', e);
            notify('Screenshot failed', 'error');
            return null;
        }
    }

    function showModal() {
        load();
        var existing = document.getElementById('snappyModal');
        if (existing) existing.remove();

        var modal = document.createElement('div');
        modal.id = 'snappyModal';
        modal.className = 'modal';

        var gridItems = shots.length === 0
            ? '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#555;">No screenshots yet — press <kbd style="background:rgba(255,255,255,0.1);padding:2px 8px;border-radius:4px;">P</kbd> anywhere</div>'
            : shots.map(function (s, i) {
                return '<div class="snappy-card" data-index="' + i + '" style="position:relative;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);cursor:pointer;">' +
                    '<img src="' + s.dataUrl + '" style="width:100%;display:block;aspect-ratio:16/10;object-fit:cover;" loading="lazy">' +
                    '<div style="padding:6px 8px;font-size:0.7rem;color:#888;background:rgba(0,0,0,0.5);display:flex;justify-content:space-between;align-items:center;">' +
                    '<span>' + new Date(s.ts).toLocaleString() + '</span>' +
                    '<span style="color:#555;">' + (s.width || '?') + 'x' + (s.height || '?') + '</span>' +
                    '</div>' +
                    '<button class="snappy-dl" data-index="' + i + '" style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.7);border:none;color:#fff;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;" title="Download"><i class="fas fa-download"></i></button>' +
                    '</div>';
            }).join('');

        modal.innerHTML =
            '<div class="modal-content" style="max-width:800px;max-height:90vh;">' +
            '<button class="close">&times;</button>' +
            '<div class="modal-header"><h2><i class="fas fa-camera"></i> Snappy</h2></div>' +
            '<div class="modal-body">' +
            '<p style="color:#888;font-size:0.85rem;margin-bottom:12px;">' + shots.length + ' shot' + (shots.length !== 1 ? 's' : '') + ' saved.</p>' +
            '<div id="snappyGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;max-height:55vh;overflow-y:auto;padding:2px;">' +
            gridItems +
            '</div>' +
            (shots.length > 0
                ? '<div style="margin-top:12px;display:flex;gap:8px;">' +
                '<button id="snappyClearAll" class="btn-enhanced" style="background:rgba(244,67,54,0.2);border-color:rgba(244,67,54,0.3);"><i class="fas fa-trash"></i> Clear All</button>' +
                '</div>'
                : '') +
            '</div>' +
            '</div>';

        document.body.appendChild(modal);
        setTimeout(function () { modal.classList.add('active'); }, 10);

        modal.querySelector('.close').addEventListener('click', function () {
            modal.classList.remove('active');
            setTimeout(function () { modal.remove(); }, 300);
        });
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                modal.classList.remove('active');
                setTimeout(function () { modal.remove(); }, 300);
            }
        });

        modal.querySelectorAll('.snappy-dl').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var idx = parseInt(this.dataset.index);
                var shot = shots[idx];
                if (shot) download(shot);
            });
        });

        modal.querySelectorAll('.snappy-card').forEach(function (card) {
            card.addEventListener('click', function (e) {
                if (e.target.closest('.snappy-dl')) return;
                var idx = parseInt(this.dataset.index);
                var shot = shots[idx];
                if (shot) {
                    var w = window.open('', '_blank');
                    if (w) {
                        w.document.write('<html><head><title>Snappy</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#000;}img{max-width:100%;max-height:100vh;}</style></head><body><img src="' + shot.dataUrl + '"></body></html>');
                        w.document.close();
                    }
                }
            });
        });

        var clearBtn = document.getElementById('snappyClearAll');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                shots = [];
                save();
                modal.classList.remove('active');
                setTimeout(function () { modal.remove(); }, 300);
                notify('All screenshots cleared', 'info');
            });
        }
    }

    function handleKeydown(e) {
        if (e.key !== 'p' && e.key !== 'P') return;
        var tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        capture();
    }

    load();

    document.addEventListener('keydown', handleKeydown);

  function initSnappy() {
    var snappyOption = document.getElementById('snappyOption');
    if (snappyOption) {
      snappyOption.addEventListener('click', function (e) {
        e.stopPropagation();
        var menu = document.getElementById('logoDropdownMenu');
        if (menu) menu.classList.remove('active');
        showModal();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSnappy);
  } else {
    initSnappy();
  }

    window.pazatorSnappy = {
        capture: capture,
        showModal: showModal,
        download: download,
        shots: shots
    };
})();
