(function () {
    'use strict';

    var FACET_TYPES = [
        'threatLevel',
        'nationality',
        'religion',
        'occupation',
        'ethnicity',
        'gender',
        'maritalStatus',
        'immigrationStatus',
        'socialClass',
        'incomeLevel',
        'educationLevel',
        'countryOfOrigin'
    ];

    var FACET_LABELS = {
        threatLevel: 'Threat Level',
        nationality: 'Nationality',
        religion: 'Religion',
        occupation: 'Occupation',
        ethnicity: 'Ethnicity',
        gender: 'Gender',
        maritalStatus: 'Marital Status',
        immigrationStatus: 'Immigration Status',
        socialClass: 'Social Class',
        incomeLevel: 'Income Level',
        educationLevel: 'Education Level',
        countryOfOrigin: 'Country of Origin',
        tag: 'Tags'
    };

    var SAVED_KEY = 'pazator_saved_searches';

    function FacetIndex() {
        this._values = {};
        this._items = {};
        this._allIds = new Set();
        this._ready = false;
    }

    FacetIndex.prototype.build = function (humans, others) {
        var self = this;
        FACET_TYPES.forEach(function (t) { self._values[t] = {}; });
        this._values.tag = {};
        this._items = {};
        this._allIds = new Set();

        function add(item, src) {
            if (!item || !item.id) return;
            item._src = src;
            self._allIds.add(item.id);
            self._items[item.id] = item;
            FACET_TYPES.forEach(function (f) {
                var v = item[f];
                if (!v) return;
                if (Array.isArray(v)) {
                    v.forEach(function (x) { if (x) self._add(f, x, item.id); });
                } else {
                    self._add(f, v, item.id);
                }
            });
            (item.tags || []).forEach(function (t) {
                if (t) self._add('tag', t, item.id);
            });
            if (item.birthDate) {
                var y = item.birthDate.substring(0, 4);
                if (y) self._add('year', y, item.id);
            }
        }

        (humans || []).forEach(function (h) { add(h, 'human'); });
        (others || []).forEach(function (o) { add(o, 'other'); });
        this._ready = true;
    };

    FacetIndex.prototype._add = function (facet, value, id) {
        var key = String(value).toLowerCase().trim();
        if (!key) return;
        if (!this._values[facet]) this._values[facet] = {};
        if (!this._values[facet][key]) this._values[facet][key] = new Set();
        this._values[facet][key].add(id);
    };

    FacetIndex.prototype.getValues = function (facet) {
        var idx = this._values[facet];
        if (!idx) return [];
        var out = [];
        for (var key in idx) {
            out.push({ value: key, count: idx[key].size });
        }
        out.sort(function (a, b) { return b.count - a.count; });
        return out;
    };

    FacetIndex.prototype.getCounts = function (ids) {
        var self = this;
        var set = ids ? new Set(ids) : this._allIds;
        var result = {};
        function countMap(facet) {
            var m = {};
            var idx = self._values[facet];
            if (!idx) return m;
            for (var key in idx) {
                var c = 0;
                idx[key].forEach(function (id) { if (set.has(id)) c++; });
                if (c > 0) m[key] = c;
            }
            return m;
        }
        FACET_TYPES.forEach(function (f) { result[f] = countMap(f); });
        result.tag = countMap('tag');
        return result;
    };

    FacetIndex.prototype.filterByFacets = function (ids, activeFacets) {
        var self = this;
        if (!activeFacets || Object.keys(activeFacets).length === 0) {
            return ids ? Array.from(ids) : Array.from(this._allIds);
        }
        var sets = [];
        for (var f in activeFacets) {
            var sel = activeFacets[f];
            if (!sel || !sel.length) continue;
            var s = new Set();
            sel.forEach(function (v) {
                var key = v.toLowerCase().trim();
                var bucket = (self._values[f] || {})[key];
                if (bucket) bucket.forEach(function (id) { s.add(id); });
            });
            if (s.size) sets.push(s);
        }
        if (!sets.length) return ids ? Array.from(ids) : Array.from(this._allIds);
        var source = ids ? new Set(ids) : this._allIds;
        var out = [];
        source.forEach(function (id) {
            var ok = sets.every(function (s) { return s.has(id); });
            if (ok) out.push(id);
        });
        return out;
    };

    FacetIndex.prototype.getItem = function (id) {
        return this._items[id] || null;
    };

    FacetIndex.prototype.getItems = function (ids) {
        var self = this;
        return (ids || []).map(function (id) { return self._items[id]; }).filter(Boolean);
    };

    FacetIndex.prototype.search = function (query, typeFilter, fieldFilters) {
        var self = this;
        var q = (query || '').toLowerCase().trim();
        var results = [];
        this._allIds.forEach(function (id) {
            var item = self._items[id];
            if (!item) return;
            if (typeFilter !== 'all' && typeFilter !== item._src) return;
            if (!q) {
                results.push({ id: id, matches: ['all'] });
                return;
            }
            var matchFields = [];
            function check(val, label) {
                if (!val) return;
                if (Array.isArray(val)) {
                    val.forEach(function (v) { if (v && String(v).toLowerCase().includes(q)) matchFields.push(label + ': ' + String(v).substring(0, 60)); });
                } else if (String(val).toLowerCase().includes(q)) {
                    matchFields.push(label + ': ' + String(val).substring(0, 60));
                }
            }
            if (fieldFilters.name !== false) check(item.name, 'Name');
            if (fieldFilters.workplace !== false) check(item.workplace, 'Workplace');
            if (fieldFilters.notes !== false) {
                check(item.extraNotes, 'Notes');
                check(item.note, 'Notes');
            }
            if (fieldFilters.tags !== false) check(item.tags, 'Tags');
            if (fieldFilters.dates !== false) check(item.birthDate, 'Birth Date');
            if (fieldFilters.relationships !== false) {
                if (item.friends || item.family) {
                    var names = [];
                    var all = (item.friends || []).concat(item.family || []);
                    all.forEach(function (fid) {
                        var p = self._items[fid];
                        if (p && p.name && p.name.toLowerCase().includes(q)) names.push(p.name);
                    });
                    if (names.length) matchFields.push('Relations: ' + names.join(', '));
                }
            }
            if (matchFields.length) results.push({ id: id, matches: matchFields });
        });

        if (q) {
            results.sort(function (a, b) { return b.matches.length - a.matches.length; });
            return results;
        }
        return results.map(function (r) { return r; });
    };

    function loadSaved() {
        try {
            var raw = localStorage.getItem(SAVED_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    function saveSaved(arr) {
        localStorage.setItem(SAVED_KEY, JSON.stringify(arr));
    }

    function addSaved(name, query, facets) {
        var list = loadSaved();
        var idx = list.findIndex(function (s) { return s.name === name; });
        if (idx !== -1) list.splice(idx, 1);
        list.unshift({ name: name, query: query || '', facets: facets || {}, created: Date.now() });
        if (list.length > 50) list.pop();
        saveSaved(list);
        return list;
    }

    function removeSaved(name) {
        var list = loadSaved().filter(function (s) { return s.name !== name; });
        saveSaved(list);
        return list;
    }

    function getSaved() {
        return loadSaved();
    }

    var _instance = null;

    function getInstance() {
        if (!_instance) _instance = new FacetIndex();
        return _instance;
    }

    window.pazatorFacets = {
        FacetIndex: FacetIndex,
        getInstance: getInstance,
        FACET_TYPES: FACET_TYPES,
        FACET_LABELS: FACET_LABELS,
        addSaved: addSaved,
        removeSaved: removeSaved,
        getSaved: getSaved
    };
})();
