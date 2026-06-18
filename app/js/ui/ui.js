(function () {
    'use strict';

    var PazatorUI = {};

    PazatorUI.debounce = function (fn, delay) {
        var timer = null;
        return function debounced() {
            var args = arguments;
            var ctx = this;
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () {
                timer = null;
                fn.apply(ctx, args);
            }, delay);
        };
    };

    PazatorUI.throttle = function (fn, limit) {
        var inThrottle = false;
        var lastFn = null;
        return function () {
            var args = arguments;
            var ctx = this;
            if (!inThrottle) {
                fn.apply(ctx, args);
                inThrottle = true;
                setTimeout(function () {
                    inThrottle = false;
                    if (lastFn) {
                        lastFn();
                        lastFn = null;
                    }
                }, limit);
            } else {
                lastFn = function () { fn.apply(ctx, args); };
            }
        };
    };

    PazatorUI.createLoadingOverlay = function () {
        if (document.getElementById('pazator-loading-overlay')) return;
        var overlay = document.createElement('div');
        overlay.id = 'pazator-loading-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:9999;display:none;align-items:center;justify-content:center;flex-direction:column;gap:16px;font-family:sans-serif;';
        overlay.innerHTML = '<div class="loader" style="--size:3rem;border:3px solid rgba(255,255,255,0.1);border-top-color:#fff;border-radius:50%;width:3rem;height:3rem;animation:pazator-spin 0.8s linear infinite;"></div><div id="pazator-loading-text" style="color:#fff;font-size:1rem;font-weight:500;">Loading...</div>';
        document.body.appendChild(overlay);
        var style = document.createElement('style');
        style.textContent = '@keyframes pazator-spin { to { transform: rotate(360deg); } }';
        document.head.appendChild(style);
    };

    PazatorUI.showLoading = function (text) {
        var overlay = document.getElementById('pazator-loading-overlay');
        if (!overlay) {
            PazatorUI.createLoadingOverlay();
            overlay = document.getElementById('pazator-loading-overlay');
        }
        var textEl = document.getElementById('pazator-loading-text');
        if (textEl) textEl.textContent = text || 'Loading...';
        overlay.style.display = 'flex';
    };

    PazatorUI.hideLoading = function () {
        var overlay = document.getElementById('pazator-loading-overlay');
        if (overlay) overlay.style.display = 'none';
    };

    var pendingRequests = 0;
    PazatorUI.trackRequest = function (promise, text) {
        pendingRequests++;
        PazatorUI.showLoading(text);
        var wrapped = promise.then(function (r) {
            pendingRequests--;
            if (pendingRequests <= 0) PazatorUI.hideLoading();
            return r;
        }, function (e) {
            pendingRequests--;
            if (pendingRequests <= 0) PazatorUI.hideLoading();
            throw e;
        });
        return wrapped;
    };

    function createDisableOverlay(btn) {
        if (!btn || btn.disabled) return;
        btn.disabled = true;
        var origHtml = btn.innerHTML;
        btn.dataset.origHtml = origHtml;
        btn.innerHTML = '<div class="loader" style="--size:1rem;border:2px solid rgba(255,255,255,0.2);border-top-color:#fff;border-radius:50%;width:1rem;height:1rem;animation:pazator-spin 0.8s linear infinite;display:inline-block;vertical-align:middle;margin-right:6px;"></div><span style="opacity:0.7;">' + (btn.dataset.loadingText || 'Working...') + '</span>';
    }

    function removeDisableOverlay(btn) {
        if (!btn) return;
        btn.disabled = false;
        if (btn.dataset.origHtml) {
            btn.innerHTML = btn.dataset.origHtml;
            delete btn.dataset.origHtml;
        }
    }

    PazatorUI.withButtonLoading = function (btn, fn) {
        return function () {
            createDisableOverlay(btn);
            var result = fn.apply(this, arguments);
            if (result && typeof result.then === 'function') {
                return result.then(function (r) {
                    removeDisableOverlay(btn);
                    return r;
                }, function (e) {
                    removeDisableOverlay(btn);
                    throw e;
                });
            }
            removeDisableOverlay(btn);
            return result;
        };
    };

    PazatorUI.VirtualList = function (container, options) {
        if (!container) return null;
        var opts = options || {};
        var itemHeight = opts.itemHeight || 48;
        var overscan = opts.overscan || 5;
        var renderItem = opts.renderItem || function () { return ''; };
        var onItemClick = opts.onItemClick || null;
        var onItemContext = opts.onItemContext || null;
        var data = [];
        var visibleStart = 0;
        var visibleEnd = 0;
        var scrollTop = 0;
        var totalHeight = 0;

        container.style.overflow = 'auto';
        container.style.position = 'relative';
        container.style.willChange = 'transform';

        var inner = document.createElement('div');
        inner.style.position = 'relative';
        inner.style.width = '100%';
        container.appendChild(inner);

        function update(items) {
            data = items || [];
            totalHeight = data.length * itemHeight;
            inner.style.height = totalHeight + 'px';
            render();
        }

        var lastStart = -1, lastEnd = -1;
        function render() {
            scrollTop = container.scrollTop;
            var viewportHeight = container.clientHeight || 400;
            var newStart = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
            var newEnd = Math.min(data.length, Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan);
            if (newStart === lastStart && newEnd === lastEnd) return;
            visibleStart = newStart; visibleEnd = newEnd;
            lastStart = newStart; lastEnd = newEnd;

            var children = inner.children;
            var needed = visibleEnd - visibleStart;
            var i = 0;

            for (i = 0; i < needed; i++) {
                var idx = visibleStart + i;
                var item = data[idx];
                var el = children[i];
                if (!el) {
                    el = document.createElement('div');
                    el.style.position = 'absolute';
                    el.style.left = '0';
                    el.style.right = '0';
                    el.style.height = itemHeight + 'px';
                    el.style.overflow = 'hidden';
                    el.addEventListener('click', function (e) {
                        var index = parseInt(this.dataset.index, 10);
                        if (onItemClick && !isNaN(index)) onItemClick(data[index], index, e);
                    });
                    el.addEventListener('contextmenu', function (e) {
                        e.preventDefault();
                        var index = parseInt(this.dataset.index, 10);
                        if (onItemContext && !isNaN(index)) onItemContext(data[index], index, e);
                    });
                    inner.appendChild(el);
                }
                el.style.top = (idx * itemHeight) + 'px';
                el.dataset.index = idx;
                if (item) {
                    var rendered = renderItem(item, idx);
                    if (el.innerHTML !== rendered) el.innerHTML = rendered;
                }
                el.style.display = '';
            }

            while (children.length > needed) {
                inner.removeChild(children[children.length - 1]);
            }
        }

        container.addEventListener('scroll', function () {
            requestAnimationFrame(render);
        }, { passive: true });

        var resizeObserver = null;
        try {
            resizeObserver = new ResizeObserver(function () { render(); });
            resizeObserver.observe(container);
        } catch (e) { }

        return {
            update: update,
            render: render,
            getData: function () { return data; },
            destroy: function () {
                if (resizeObserver) resizeObserver.disconnect();
                inner.innerHTML = '';
            }
        };
    };

    PazatorUI.Paginator = function (container, options) {
        if (!container) return null;
        var opts = options || {};
        var pageSize = opts.pageSize || 50;
        var onPageChange = opts.onPageChange || function () { };
        var totalItems = 0;
        var currentPage = 1;
        var totalPages = 0;

        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.style.gap = '8px';
        container.style.padding = '8px 0';

        var prevBtn = document.createElement('button');
        prevBtn.textContent = '‹ Prev';
        prevBtn.style.cssText = 'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#ccc;padding:4px 14px;border-radius:4px;cursor:pointer;font-size:0.85rem;';
        prevBtn.addEventListener('click', function () {
            if (currentPage > 1) {
                currentPage--;
                updateUI();
                onPageChange(currentPage);
            }
        });

        var pageInfo = document.createElement('span');
        pageInfo.style.cssText = 'color:#aaa;font-size:0.85rem;min-width:100px;text-align:center;';

        var nextBtn = document.createElement('button');
        nextBtn.textContent = 'Next ›';
        nextBtn.style.cssText = 'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#ccc;padding:4px 14px;border-radius:4px;cursor:pointer;font-size:0.85rem;';
        nextBtn.addEventListener('click', function () {
            if (currentPage < totalPages) {
                currentPage++;
                updateUI();
                onPageChange(currentPage);
            }
        });

        container.appendChild(prevBtn);
        container.appendChild(pageInfo);
        container.appendChild(nextBtn);

        function updateUI() {
            totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
            pageInfo.textContent = 'Page ' + currentPage + ' of ' + totalPages + ' (' + totalItems + ' items)';
            prevBtn.style.opacity = currentPage <= 1 ? '0.4' : '1';
            prevBtn.style.cursor = currentPage <= 1 ? 'default' : 'pointer';
            nextBtn.style.opacity = currentPage >= totalPages ? '0.4' : '1';
            nextBtn.style.cursor = currentPage >= totalPages ? 'default' : 'pointer';
        }

        function setTotal(n) {
            totalItems = n;
            totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
            if (currentPage > totalPages) currentPage = totalPages;
            updateUI();
        }

        function setPage(n) {
            currentPage = Math.max(1, Math.min(n, totalPages));
            updateUI();
        }

        setTotal(0);

        return {
            setTotal: setTotal,
            setPage: setPage,
            getPage: function () { return currentPage; },
            getPageSize: function () { return pageSize; },
            getTotal: function () { return totalItems; },
            element: container
        };
    };

    var floatingNotifContainer = null;
    PazatorUI.showFloatingNotification = function (message, type, duration) {
        if (!floatingNotifContainer) {
            floatingNotifContainer = document.createElement('div');
            floatingNotifContainer.id = 'pazator-floating-notifications';
            floatingNotifContainer.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:10000;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
            document.body.appendChild(floatingNotifContainer);
        }
        var notif = document.createElement('div');
        notif.style.cssText = 'background:rgba(20,20,20,0.95);border:1px solid rgba(255,255,255,0.12);color:#e0e0e0;padding:10px 18px;border-radius:8px;font-size:0.85rem;box-shadow:0 4px 20px rgba(0,0,0,0.5);backdrop-filter:blur(8px);pointer-events:auto;animation:pazator-notif-in 0.25s ease-out;max-width:360px;word-wrap:break-word;';
        var color = type === 'error' ? '#ff6b6b' : type === 'warning' ? '#ffd93d' : type === 'success' ? '#6bcf7f' : '#4d9de0';
        notif.style.borderLeft = '3px solid ' + color;
        notif.textContent = message;
        floatingNotifContainer.appendChild(notif);
        var dur = duration || (type === 'error' ? 5000 : 3000);
        setTimeout(function () {
            notif.style.opacity = '0';
            notif.style.transition = 'opacity 0.3s ease';
            setTimeout(function () {
                if (notif.parentNode) notif.parentNode.removeChild(notif);
            }, 300);
        }, dur);
    };

    var notifStyleAdded = false;
    function ensureNotifStyle() {
        if (notifStyleAdded) return;
        notifStyleAdded = true;
        var s = document.createElement('style');
        s.textContent = '@keyframes pazator-notif-in { from { opacity:0;transform:translateY(10px); } to { opacity:1;transform:translateY(0); } }';
        document.head.appendChild(s);
    }
    ensureNotifStyle();

    var _tc = { Person: '#888', Organization: '#aaa', Location: '#666', Unknown: '#555' };

    function _esc(s) {
        if (!s) return '';
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    PazatorUI.showEntityPicker = function (opts) {
        opts = opts || {};
        var onSelect = opts.onSelect || function () {};
        var title = opts.title || 'Select Entity';

        var modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        if (opts.zIndex) modal.style.zIndex = opts.zIndex;

        var content = document.createElement('div');
        content.className = 'modal-content';
        content.style.maxWidth = '480px';

        var header = document.createElement('div');
        header.className = 'modal-header';
        var h2 = document.createElement('h2');
        h2.textContent = title;
        var closeBtn = document.createElement('button');
        closeBtn.className = 'close';
        closeBtn.type = 'button';
        closeBtn.innerHTML = '&times;';
        header.appendChild(h2);
        header.appendChild(closeBtn);

        var searchWrap = document.createElement('div');
        searchWrap.className = 'explorer-search-wrap';
        var searchInput = document.createElement('input');
        searchInput.className = 'explorer-search';
        searchInput.type = 'text';
        searchInput.placeholder = 'Search...';
        searchInput.autocomplete = 'off';
        searchInput.spellcheck = false;
        searchWrap.appendChild(searchInput);

        var body = document.createElement('div');
        body.className = 'modal-body';
        body.innerHTML = '<div class="explorer-info-placeholder">Type to search</div>';

        content.appendChild(header);
        content.appendChild(searchWrap);
        content.appendChild(body);
        modal.appendChild(content);
        document.body.appendChild(modal);

        var currentResults = [];

        function renderResults(results) {
            currentResults = results || [];
            if (!results || !results.length) {
                body.innerHTML = '<div class="explorer-info-placeholder">No results</div>';
                return;
            }
            var html = '';
            for (var i = 0; i < results.length; i++) {
                var m = results[i];
                var icon = m.objectType === 'Person' ? 'fa-user' : 'fa-building';
                var c = _tc[m.objectType] || _tc.Unknown;
                html += '<div class="es-item" data-id="' + m.id + '"><span class="es-icon" style="color:' + c + '"><i class="fas ' + icon + '"></i></span><span class="es-name"><div>' + _esc(m.name || m.id) + '</div><div class="explorer-info-meta">' + _esc(String(m.id)) + '</div></span><span class="es-type">' + (m.objectType || '') + '</span></div>';
            }
            body.innerHTML = html;
            Array.from(body.children).forEach(function (el) {
                el.addEventListener('mousedown', function (e) {
                    e.preventDefault();
                    var id = el.dataset.id;
                    for (var j = 0; j < currentResults.length; j++) {
                        if (String(currentResults[j].id) === id) {
                            modal.remove();
                            onSelect(currentResults[j].id, currentResults[j].name || currentResults[j].id, currentResults[j]);
                            return;
                        }
                    }
                });
            });
        }

        function doSearch() {
            var q = searchInput.value.trim();
            if (!q) { body.innerHTML = '<div class="explorer-info-placeholder">Type to search</div>'; return; }
            if (window.pazatorStore && window.pazatorStore.searchObjects) {
                var results = window.pazatorStore.searchObjects(q, 30);
                if (opts.typeFilter) {
                    results = results.filter(function (r) { return r.objectType === opts.typeFilter; });
                }
                renderResults(results);
            }
        }

        searchInput.addEventListener('input', doSearch);
        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { modal.remove(); }
            if (e.key === 'Enter') { var f = body.querySelector('.es-item'); if (f) f.click(); }
        });

        function close() { modal.remove(); }
        closeBtn.addEventListener('click', close);
        modal.addEventListener('click', function (e) { if (e.target === modal) close(); });

        setTimeout(function () { searchInput.focus(); }, 50);
        return { close: close };
    };

    PazatorUI.EntityPicker = function (container, opts) {
        opts = opts || {};
        var onChange = opts.onSelect || function () {};
        var placeholder = opts.placeholder || 'Search entities...';
        var val = null;
        var wrap = document.createElement('div');
        wrap.className = 'entity-picker';
        var input = document.createElement('input');
        input.type = 'text';
        input.placeholder = placeholder;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.className = 'entity-picker-input';
        var clearBtn = document.createElement('span');
        clearBtn.className = 'entity-picker-clear';
        clearBtn.innerHTML = '&times;';
        clearBtn.style.display = 'none';
        var resultsEl = document.createElement('div');
        resultsEl.className = 'entity-picker-results';
        resultsEl.style.display = 'none';
        wrap.appendChild(input);
        wrap.appendChild(clearBtn);
        wrap.appendChild(resultsEl);
        container.appendChild(wrap);

        function renderResults(results) {
            if (!results || !results.length) { resultsEl.style.display = 'none'; return; }
            var html = '';
            for (var i = 0; i < results.length; i++) {
                var m = results[i];
                var icon = m.objectType === 'Person' ? 'fa-user' : 'fa-building';
                var c = _tc[m.objectType] || _tc.Unknown;
                html += '<div class="ep-item" data-id="' + m.id + '"><span class="ep-icon" style="color:' + c + '"><i class="fas ' + icon + '"></i></span><span class="ep-name">' + _esc(m.name || m.id) + '</span><span class="ep-type">' + (m.objectType || '') + '</span></div>';
            }
            resultsEl.innerHTML = html;
            resultsEl.style.display = '';
            Array.from(resultsEl.children).forEach(function (el) {
                el.addEventListener('mousedown', function (e) {
                    e.preventDefault();
                    var id = el.dataset.id;
                    for (var j = 0; j < results.length; j++) {
                        if (String(results[j].id) === id) { selectItem(results[j]); break; }
                    }
                });
            });
        }

        function selectItem(item) {
            val = item.id;
            input.value = item.name || item.id;
            resultsEl.style.display = 'none';
            clearBtn.style.display = '';
            onChange(item.id, item.name || item.id, item);
        }

        function doSearch() {
            var q = input.value.trim();
            if (!q) { resultsEl.style.display = 'none'; return; }
            if (window.pazatorStore && window.pazatorStore.searchObjects) {
                renderResults(window.pazatorStore.searchObjects(q, 20));
            }
        }

        input.addEventListener('input', doSearch);
        input.addEventListener('blur', function () { setTimeout(function () { resultsEl.style.display = 'none'; }, 200); });
        input.addEventListener('focus', function () { if (input.value) doSearch(); });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { resultsEl.style.display = 'none'; input.blur(); }
            if (e.key === 'Enter') { var f = resultsEl.querySelector('.ep-item'); if (f) f.click(); }
        });
        clearBtn.addEventListener('click', function () { val = null; input.value = ''; clearBtn.style.display = 'none'; input.focus(); onChange(null, null, null); });

        return {
            getValue: function () { return val; },
            setValue: function (id, name) {
                if (!id) { val = null; input.value = ''; clearBtn.style.display = 'none'; return; }
                val = id; input.value = name || id; clearBtn.style.display = '';
            },
            clear: function () { val = null; input.value = ''; clearBtn.style.display = 'none'; },
            destroy: function () { container.removeChild(wrap); }
        };
    };

    window.PazatorUI = PazatorUI;
})();
