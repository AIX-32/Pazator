function _kvBackup(key, value) {
    if (typeof window !== 'undefined' && window.pazatorStore) {
        window.pazatorStore.kvSet(key, value).catch(function () {});
    }
}

function loadRecentSearches() {
    try {
        const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
        const parsed = stored ? JSON.parse(stored) : [];
        if (stored) _kvBackup(RECENT_SEARCHES_KEY, stored);
        return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
    } catch (e) {
        return [];
    }
}

function saveRecentSearches(list) {
    try {
        const val = JSON.stringify(Array.isArray(list) ? list : []);
        localStorage.setItem(RECENT_SEARCHES_KEY, val);
        _kvBackup(RECENT_SEARCHES_KEY, val);
    } catch (e) {
        console.warn('Could not persist recent searches', e);
    }
}

function addRecentSearch(term) {
    const value = String(term || '').trim();
    if (!value) return;

    const existing = loadRecentSearches();
    const lower = value.toLowerCase();
    const next = [value, ...existing.filter(x => String(x).toLowerCase() !== lower)].slice(0, 12);
    saveRecentSearches(next);
}

function clearRecentSearches() {
    saveRecentSearches([]);
    renderRecentSearches();
}

function renderRecentSearches() {
    const container = document.getElementById('recentSearchesContainer');
    if (!container) return;

    const items = loadRecentSearches();
    if (items.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = items.map(term => {
        const safeLabel = escapeHtml(term);
        const encoded = encodeURIComponent(term);
        return `<button type="button" class="recent-chip" data-term="${encoded}"><i class="fas fa-history"></i>${safeLabel}</button>`;
    }).join('') + `<button type="button" class="recent-clear-btn" title="Clear recent searches"><i class="fas fa-times"></i></button>`;

    container.querySelectorAll('.recent-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            const encoded = btn.getAttribute('data-term') || '';
            let term = encoded;
            try {
                term = decodeURIComponent(encoded);
            } catch (e) {
                term = encoded;
            }
            const input = document.getElementById('universalSearchInput');
            if (input) input.value = term;
            performSearch(term);
        });
    });

    container.querySelector('.recent-clear-btn')?.addEventListener('click', clearRecentSearches);
}

function initializeSearch() {
    const searchInput = document.getElementById('universalSearchInput');
    const resultsContainer = document.getElementById('searchResultsContainer');
    const clearBtn = document.getElementById('searchClearBtn');

    if (!searchInput || !resultsContainer) return;

    var debouncedSearch = window.PazatorUI ? PazatorUI.debounce(function () {
        performSearch(searchInput.value.trim());
    }, 500) : null;
    searchInput.addEventListener('input', function () {
        if (debouncedSearch) debouncedSearch();
        else performSearch(searchInput.value.trim());
        if (clearBtn) clearBtn.classList.toggle('visible', searchInput.value.length > 0);
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch(searchInput.value.trim());
        }
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            searchInput.focus();
            clearBtn.classList.remove('visible');
            performSearch('');
        });
    }

    document.querySelectorAll('.search-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.search-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            const query = searchInput.value.trim();
            if (query) performSearch(query);
        });
    });

    document.querySelectorAll('.search-chip input[type="checkbox"]').forEach(function (cb) {
        cb.addEventListener('change', function () {
            var query = searchInput.value.trim();
            if (query) performSearch(query);
        });
    });

    var saveBtn = document.getElementById('searchSaveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', function () {
            if (!window.pazatorFacets) return;
            var query = searchInput.value.trim();
            var name = prompt('Name this saved search:', query || 'untitled');
            if (!name || !name.trim()) return;
            var saved = pazatorFacets.addSaved(name.trim(), query, JSON.parse(JSON.stringify(_activeFacets)));
            renderSavedSearches();
            PazatorUI.showFloatingNotification('Saved search "' + name.trim() + '"', 'success');
        });
    }
}

var _activeFacets = {};
var _searchPage = 1;
var _searchPageSize = 30;
var _lastSearchQuery = '';
var _lastSearchResults = [];

function performSearch(query) {
    const resultsContainer = document.getElementById('searchResultsContainer');
    const resultsCount = document.getElementById('searchResultsCount');
    if (query !== _lastSearchQuery) _searchPage = 1;
    _lastSearchQuery = query || '';

    if (!query) {
        renderRecentSearches();
        renderSavedSearches();
        if (Object.keys(_activeFacets).length === 0) {
            resultsContainer.innerHTML = `
                <div class="search-empty-state">
                    <i class="fas fa-search search-empty-icon"></i>
                    <p class="search-empty-title">Start typing to search</p>
                    <p class="search-empty-hint">Results will appear here</p>
                </div>
            `;
            if (resultsCount) resultsCount.textContent = '';
            _lastSearchResults = [];
            renderFacetBar([]);
            return;
        }
    }

    addRecentSearch(query);
    renderRecentSearches();
    renderSavedSearches();

    if (window.Tastur) {
        Tastur.emit('search_performed', { query: query });
    }

    var searchNames = document.getElementById('searchNames')?.checked ?? true;
    var searchJobs = document.getElementById('searchJobs')?.checked ?? true;
    var searchDates = document.getElementById('searchDates')?.checked ?? true;
    var searchNotes = document.getElementById('searchNotes')?.checked ?? true;
    var searchTags = document.getElementById('searchTags')?.checked ?? true;
    var searchRelationships = document.getElementById('searchRelationships')?.checked ?? true;

    var activePill = document.querySelector('.search-pill.active');
    var typeFilter = activePill ? activePill.getAttribute('data-type') : 'all';

    var queryLower = query.toLowerCase();
    var results = [];
    var seenIds = new Set();

    function addMatches(items, src) {
        items.forEach(function (item) {
            if (seenIds.has(item.id)) return;
            var matches = [];
            if (item.id && String(item.id).toLowerCase().includes(queryLower)) {
                matches.push({ field: 'ID', value: String(item.id) });
            }
            if (searchNames && item.name && item.name.toLowerCase().includes(queryLower)) {
                matches.push({ field: 'Name', value: item.name });
            }
            if (searchJobs && item.workplace && item.workplace.toLowerCase().includes(queryLower)) {
                matches.push({ field: 'Workplace', value: item.workplace });
            }
            if (searchDates && item.birthDate && item.birthDate.toLowerCase().includes(queryLower)) {
                matches.push({ field: 'Birth Date', value: item.birthDate });
            }
            if (searchNotes) {
                var note = item.extraNotes || item.note || '';
                if (note.toLowerCase().includes(queryLower)) {
                    matches.push({ field: 'Notes', value: note.substring(0, 100) + (note.length > 100 ? '...' : '') });
                }
            }
            if (searchTags && item.tags && item.tags.some(function (t) { return t.toLowerCase().includes(queryLower); })) {
                var matching = item.tags.filter(function (t) { return t.toLowerCase().includes(queryLower); });
                matches.push({ field: 'Tags', value: matching.join(', ') });
            }
            if (searchRelationships && src === 'human') {
                (item.friends || []).forEach(function (fid) {
                    var f = pazatorData.humans.find(function (h) { return h.id === fid; });
                    if (f && f.name && f.name.toLowerCase().includes(queryLower)) {
                        matches.push({ field: 'Friends', value: f.name });
                    }
                });
                (item.family || []).forEach(function (fid) {
                    var f = pazatorData.humans.find(function (h) { return h.id === fid; });
                    if (f && f.name && f.name.toLowerCase().includes(queryLower)) {
                        matches.push({ field: 'Family', value: f.name });
                    }
                });
            }
            if (matches.length > 0) {
                seenIds.add(item.id);
                results.push({ type: src, data: item, matches: matches });
            }
        });
    }

    if (typeFilter === 'all' || typeFilter === 'human') addMatches(pazatorData.humans, 'human');
    if (typeFilter === 'all' || typeFilter === 'other') addMatches(pazatorData.others, 'other');

    results.sort(function (a, b) { return b.matches.length - a.matches.length; });

    var facetFiltered = applyFacetFilters(results);
    _lastSearchResults = facetFiltered;
    renderFacetBar(results);
    displaySearchResults(facetFiltered, query);
    if (resultsCount) {
        resultsCount.textContent = facetFiltered.length + ' result' + (facetFiltered.length !== 1 ? 's' : '') + ' found' +
            (facetFiltered.length !== results.length ? ' (filtered from ' + results.length + ')' : '');
    }
}

function applyFacetFilters(results) {
    if (Object.keys(_activeFacets).length === 0) return results;
    return results.filter(function (r) {
        for (var facet in _activeFacets) {
            var selected = _activeFacets[facet];
            if (!selected || selected.length === 0) continue;
            var item = r.data;
            var values = [];
            if (facet === 'tag') {
                values = (item.tags || []).map(function (t) { return t.toLowerCase().trim(); });
            } else {
                var v = item[facet];
                if (Array.isArray(v)) {
                    values = v.map(function (x) { return String(x).toLowerCase().trim(); });
                } else if (v) {
                    values = [String(v).toLowerCase().trim()];
                }
            }
            if (!selected.some(function (s) { return values.indexOf(s.toLowerCase().trim()) !== -1; })) {
                return false;
            }
        }
        return true;
    });
}

function toggleFacet(facet, value) {
    if (!_activeFacets[facet]) _activeFacets[facet] = [];
    var arr = _activeFacets[facet];
    var idx = arr.indexOf(value);
    if (idx !== -1) {
        arr.splice(idx, 1);
        if (arr.length === 0) delete _activeFacets[facet];
    } else {
        arr.push(value);
    }
    performSearch(_lastSearchQuery);
}

function clearAllFacets() {
    _activeFacets = {};
    performSearch(_lastSearchQuery);
}

function renderFacetBar(results) {
    var bar = document.getElementById('facetBar');
    var inner = document.getElementById('facetBarInner');
    var clearBtn = document.getElementById('facetClearBtn');
    if (!bar || !inner) return;

    var hasActiveFacets = Object.keys(_activeFacets).length > 0;

    if (!results || results.length === 0) {
        bar.style.display = 'none';
        clearBtn.style.display = 'none';
        return;
    }

    bar.style.display = 'flex';

    var facetCounts = {};
    results.forEach(function (r) {
        var item = r.data;
        function count(facet, val) {
            if (!val) return;
            var k = String(val).toLowerCase().trim();
            if (!facetCounts[facet]) facetCounts[facet] = {};
            if (!facetCounts[facet][k]) facetCounts[facet][k] = 0;
            facetCounts[facet][k]++;
        }
        var facets = ['threatLevel', 'nationality', 'religion', 'occupation', 'ethnicity', 'gender', 'immigrationStatus', 'socialClass', 'incomeLevel'];
        facets.forEach(function (f) {
            var v = item[f];
            if (Array.isArray(v)) v.forEach(function (x) { count(f, x); });
            else count(f, v);
        });
        (item.tags || []).forEach(function (t) { count('tag', t); });
    });

    var html = '';
    var facetOrder = ['threatLevel', 'nationality', 'religion', 'occupation', 'tag'];
    facetOrder.forEach(function (facet) {
        var counts = facetCounts[facet];
        if (!counts) return;
        var entries = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 8);
        if (entries.length === 0) return;
        var label = (window.pazatorFacets && pazatorFacets.FACET_LABELS[facet]) || facet;
        var isActive = _activeFacets[facet] && _activeFacets[facet].length > 0;
        html += '<div class="facet-group">';
        html += '<span class="facet-label">' + label + '</span>';
        html += '<div class="facet-options">';
        entries.forEach(function (key) {
            var active = _activeFacets[facet] && _activeFacets[facet].indexOf(key) !== -1;
            html += '<button class="facet-pill' + (active ? ' active' : '') + '" data-facet="' + facet + '" data-value="' + encodeURIComponent(key) + '">' +
                escapeHtml(key) + ' <span class="facet-count">' + counts[key] + '</span></button>';
        });
        html += '</div></div>';
    });

    if (html) {
        inner.innerHTML = html;
        inner.querySelectorAll('.facet-pill').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var f = this.getAttribute('data-facet');
                var v = decodeURIComponent(this.getAttribute('data-value'));
                toggleFacet(f, v);
            });
        });
    } else {
        inner.innerHTML = '';
    }

    clearBtn.style.display = hasActiveFacets ? '' : 'none';
}

function displaySearchResults(results, query) {
    const resultsContainer = document.getElementById('searchResultsContainer');

    if (results.length === 0) {
        resultsContainer.innerHTML = `
            <div class="search-empty-state">
                <i class="fas fa-frown search-empty-icon"></i>
                <p class="search-empty-title">No results found${query ? ' for "' + escapeHtml(query) + '"' : ''}</p>
                <p class="search-empty-hint">Try different keywords or check the field filters above</p>
            </div>
        `;
        return;
    }

    var totalResults = results.length;
    var totalPages = Math.max(1, Math.ceil(totalResults / _searchPageSize));
    if (_searchPage > totalPages) _searchPage = totalPages;
    var start = (_searchPage - 1) * _searchPageSize;
    var end = Math.min(start + _searchPageSize, totalResults);
    var pageResults = results.slice(start, end);

    const humans = pageResults.filter(r => r.type === 'human');
    const entities = pageResults.filter(r => r.type === 'other');

    let html = '';

    const renderGroup = (group, groupType) => {
        if (groupType === 'human') {
            html += `<div class="search-group-header"><i class="fas fa-user"></i> People <span>(${group.length})</span></div>`;
        } else {
            html += `<div class="search-group-header"><i class="fas fa-building"></i> Entities <span>(${group.length})</span></div>`;
        }

        group.forEach(result => {
            const item = result.data;
            const isHuman = groupType === 'human';

            let threatBadge = '';
            if (isHuman && item.threatLevel && item.threatLevel !== 'None') {
                threatBadge = `<span class="search-badge threat-${item.threatLevel}">${item.threatLevel}</span>`;
            }

            let creditBadge = '';
            if (isHuman && item.credit !== undefined) {
                let cls = 'credit-low';
                if (item.credit > 150) cls = 'credit-mid';
                if (item.credit > 250) cls = 'credit-high';
                creditBadge = `<span class="search-badge ${cls}">${Math.round(item.credit)}</span>`;
            }

            let detailHtml = '';
            if (isHuman && item.workplace) {
                detailHtml += `<span><i class="fas fa-building"></i>${item.workplace}</span>`;
            }
            if (isHuman && item.birthDate) {
                detailHtml += `<span><i class="fas fa-calendar"></i>${item.birthDate}</span>`;
            }
            if (!isHuman) {
                const note = item.note || item.extraNotes || '';
                if (note) {
                    detailHtml += `<span><i class="fas fa-file-alt"></i>${note.substring(0, 80)}${note.length > 80 ? '...' : ''}</span>`;
                }
            }

            const matchTags = result.matches.slice(0, 4).map(m =>
                `<span class="search-match-tag">${escapeHtml(m.field)}: ${escapeHtml(m.value.substring(0, 30))}${m.value.length > 30 ? '...' : ''}</span>`
            ).join('');

            const tags = (item.tags || []).slice(0, 8).map(t =>
                `<span class="search-card-tag">${escapeHtml(t)}</span>`
            ).join('');

            const typeLabel = isHuman ? 'P' : 'E';
            const typeClass = isHuman ? 'person' : 'entity';

            html += `
            <div class="search-card" onclick="openDetailView('${item.id}', '${groupType}')">
                <div class="search-card-type ${typeClass}">${typeLabel}</div>
                <div class="search-card-body">
                    <div class="search-card-top">
                        <span class="search-card-name">${escapeHtml(item.name)}</span>
                        <div class="search-card-badges">${threatBadge}${creditBadge}</div>
                    </div>
                    ${detailHtml ? `<div class="search-card-detail">${detailHtml}</div>` : ''}
                    <div class="search-card-matches">${matchTags}</div>
                    ${tags ? `<div class="search-card-tags">${tags}</div>` : ''}
                </div>
            </div>`;
        });
    };

    if (humans.length > 0) renderGroup(humans, 'human');
    if (entities.length > 0) renderGroup(entities, 'other');

    if (totalPages > 1) {
        html += '<div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:16px 0;font-size:0.85rem;color:#aaa;border-top:1px solid rgba(255,255,255,0.06);margin-top:16px;">' +
            '<button class="btn btn-secondary" style="padding:4px 14px;font-size:0.8rem;" onclick="_searchPage=' + Math.max(1, _searchPage - 1) + ';performSearch(document.getElementById(\'universalSearchInput\').value.trim());" ' + (_searchPage <= 1 ? 'disabled' : '') + '>‹ Prev</button>' +
            '<span>Page ' + _searchPage + ' of ' + totalPages + ' (' + results.length + ' total)</span>' +
            '<button class="btn btn-secondary" style="padding:4px 14px;font-size:0.8rem;" onclick="_searchPage=' + Math.min(totalPages, _searchPage + 1) + ';performSearch(document.getElementById(\'universalSearchInput\').value.trim());" ' + (_searchPage >= totalPages ? 'disabled' : '') + '>Next ›</button>' +
            '</div>';
    }

    resultsContainer.innerHTML = html;
}

function renderSavedSearches() {
    var container = document.getElementById('savedSearchesContainer');
    if (!container) return;
    if (!window.pazatorFacets) { container.innerHTML = ''; return; }
    var saved = pazatorFacets.getSaved();
    if (saved.length === 0) { container.innerHTML = ''; return; }

    container.innerHTML = '<span class="saved-searches-label"><i class="fas fa-bookmark"></i></span> ' +
        saved.slice(0, 8).map(function (s) {
            var safe = escapeHtml(s.name);
            return '<button type="button" class="saved-chip" data-name="' + encodeURIComponent(s.name) + '"><i class="fas fa-bookmark"></i>' + safe + '</button>';
        }).join('');

    container.querySelectorAll('.saved-chip').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var name = decodeURIComponent(this.getAttribute('data-name'));
            var saved = pazatorFacets.getSaved();
            var found = saved.find(function (s) { return s.name === name; });
            if (!found) return;
            var input = document.getElementById('universalSearchInput');
            if (input) input.value = found.query || '';
            _activeFacets = found.facets || {};
            performSearch(found.query || '');
        });
    });
}

function initSearchTab() {
    if (!searchTabInitialized) {
        initializeSearch();
        searchTabInitialized = true;
    }
    renderRecentSearches();
    renderSavedSearches();
    var bar = document.getElementById('facetBar');
    var clearBtn = document.getElementById('facetClearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearAllFacets);
    }
}


