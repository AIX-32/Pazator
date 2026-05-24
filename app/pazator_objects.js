(function () {
    'use strict';

    var DEFAULT_TYPE_CONFIGS = {
        gender:            { label: 'Gender',              icon: 'fa-venus-mars',    color: '#ff6b9d' },
        maritalStatus:     { label: 'Marital Status',       icon: 'fa-heart',         color: '#ff6b9d' },
        nationality:       { label: 'Nationality',          icon: 'fa-flag',          color: '#4ecdc4' },
        countryOfOrigin:   { label: 'Country of Origin',    icon: 'fa-globe',         color: '#4ecdc4' },
        immigrationStatus: { label: 'Immigration Status',   icon: 'fa-passport',      color: '#ffa94d' },
        language:          { label: 'Language',             icon: 'fa-language',      color: '#74c0fc' },
        ethnicity:         { label: 'Ethnicity',            icon: 'fa-users',         color: '#b197fc' },
        religion:          { label: 'Religion',             icon: 'fa-pray',          color: '#e599f7' },
        politicalView:     { label: 'Political View',       icon: 'fa-landmark',      color: '#fcc419' },
        threatLevel:       { label: 'Threat Level',         icon: 'fa-shield-alt',    color: '#ff6b6b' },
        socialClass:       { label: 'Social Class',         icon: 'fa-layer-group',   color: '#ff922b' },
        incomeLevel:       { label: 'Income Level',         icon: 'fa-coins',         color: '#20c997' },
        educationLevel:    { label: 'Education Level',      icon: 'fa-graduation-cap',color: '#339af0' },
        workplace:         { label: 'Workplace / Occupation',icon: 'fa-briefcase',     color: '#748ffc' },
        occupation:        { label: 'Occupation',           icon: 'fa-briefcase',     color: '#748ffc' }
    };

    var DEFAULT_OBJECTS = {
        gender: [
            { name: 'Male' }, { name: 'Female' }, { name: 'Non-binary' },
            { name: 'Other' }, { name: 'Prefer not to say' }
        ],
        maritalStatus: [
            { name: 'Single' }, { name: 'Married' }, { name: 'Divorced' },
            { name: 'Widowed' }, { name: 'In Relationship' }
        ],
        immigrationStatus: [
            { name: 'Citizen' }, { name: 'Permanent Resident' },
            { name: 'Visa Holder' }, { name: 'Asylum Seeker' },
            { name: 'Refugee' }, { name: 'Undocumented' }, { name: 'Unknown' }
        ],
        socialClass: [
            { name: 'Low Class' }, { name: 'Medium Class' },
            { name: 'High Class' }, { name: '1%' }
        ],
        incomeLevel: [
            { name: 'Below Poverty' }, { name: 'Low' }, { name: 'Middle' },
            { name: 'Upper Middle' }, { name: 'High' }, { name: 'Wealthy' }
        ],
        educationLevel: [
            { name: 'No Formal Education' }, { name: 'Primary School' },
            { name: 'High School' }, { name: 'Associate\'s Degree' },
            { name: 'Bachelor\'s Degree' }, { name: 'Master\'s Degree' },
            { name: 'Doctorate' }, { name: 'Post-Doctorate' }
        ],
        threatLevel: [
            { name: 'None' }, { name: 'Low' }, { name: 'Medium' },
            { name: 'High' }, { name: 'Critical' }
        ]
    };

    var DB_KEY = 'pazator_objects_data';
    var TYPE_CFG_KEY = 'pazator_ontology_types';

    var OBJECT_TYPES = [];

    var registry = {
        _objects: {},
        _dirty: false,

        init: function () {
            this._loadTypeConfigs();
            var saved = localStorage.getItem(DB_KEY);
            if (saved) {
                try {
                    this._objects = JSON.parse(saved);
                } catch (e) {
                    this._objects = {};
                }
            }
            this._ensureDefaults();
            return this;
        },

        _loadTypeConfigs: function () {
            var saved = localStorage.getItem(TYPE_CFG_KEY);
            if (saved) {
                try {
                    var parsed = JSON.parse(saved);
                    OBJECT_TYPES.length = 0;
                    for (var key in parsed) {
                        OBJECT_TYPES.push(key);
                    }
                    this._typeConfigs = parsed;
                    return;
                } catch (e) {}
            }
            this._typeConfigs = {};
            for (var k in DEFAULT_TYPE_CONFIGS) {
                this._typeConfigs[k] = JSON.parse(JSON.stringify(DEFAULT_TYPE_CONFIGS[k]));
                OBJECT_TYPES.push(k);
            }
            this._saveTypeConfigs();
        },

        _saveTypeConfigs: function () {
            localStorage.setItem(TYPE_CFG_KEY, JSON.stringify(this._typeConfigs));
        },

        getTypeConfig: function (type) {
            return this._typeConfigs[type] ? JSON.parse(JSON.stringify(this._typeConfigs[type])) : null;
        },

        setTypeConfig: function (type, config) {
            if (!this._typeConfigs[type]) return;
            for (var key in config) {
                if (config.hasOwnProperty(key)) {
                    this._typeConfigs[type][key] = config[key];
                }
            }
            this._saveTypeConfigs();
        },

        createType: function (typeKey, config) {
            if (this._typeConfigs[typeKey]) return false;
            if (!config) config = { label: typeKey, icon: 'fa-tag', color: '#888' };
            this._typeConfigs[typeKey] = {
                label: config.label || typeKey,
                icon: config.icon || 'fa-tag',
                color: config.color || '#888'
            };
            OBJECT_TYPES.push(typeKey);
            this._objects[typeKey] = this._objects[typeKey] || [];
            this._saveTypeConfigs();
            this._dirty = true;
            this.save();
            return true;
        },

        renameType: function (oldKey, newKey) {
            if (!this._typeConfigs[oldKey] || this._typeConfigs[newKey]) return false;
            this._typeConfigs[newKey] = this._typeConfigs[oldKey];
            delete this._typeConfigs[oldKey];
            var idx = OBJECT_TYPES.indexOf(oldKey);
            if (idx !== -1) OBJECT_TYPES[idx] = newKey;
            if (this._objects[oldKey]) {
                this._objects[newKey] = this._objects[oldKey];
                delete this._objects[oldKey];
                this._objects[newKey].forEach(function (o) { o.type = newKey; });
            }
            this._saveTypeConfigs();
            this._dirty = true;
            this.save();
            return true;
        },

        deleteType: function (typeKey) {
            if (!this._typeConfigs[typeKey]) return false;
            delete this._typeConfigs[typeKey];
            var idx = OBJECT_TYPES.indexOf(typeKey);
            if (idx !== -1) OBJECT_TYPES.splice(idx, 1);
            delete this._objects[typeKey];
            this._saveTypeConfigs();
            this._dirty = true;
            this.save();
            return true;
        },

        _ensureDefaults: function () {
            var changed = false;
            for (var t = 0; t < OBJECT_TYPES.length; t++) {
                var type = OBJECT_TYPES[t];
                if (!registry._objects[type]) {
                    registry._objects[type] = [];
                    changed = true;
                }
                var defaults = DEFAULT_OBJECTS[type];
                if (defaults) {
                    defaults.forEach(function (d) {
                        var exists = registry._objects[type].some(function (o) {
                            return o.name.toLowerCase() === d.name.toLowerCase();
                        });
                        if (!exists) {
                            var order = registry._objects[type].length;
                            registry._objects[type].push({
                                id: registry._genId(type, d.name),
                                name: d.name,
                                type: type,
                                usageCount: 0,
                                order: order,
                                parentId: null,
                                created: Date.now()
                            });
                            changed = true;
                        }
                    });
                }
            }
            if (changed) this.save();
        },

        _genId: function (type, name) {
            return type + '_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now();
        },

        getOrCreate: function (type, name) {
            if (!name || !name.trim()) return null;
            name = name.trim();
            var list = this._objects[type] || [];
            var existing = list.find(function (o) {
                return o.name.toLowerCase() === name.toLowerCase();
            });
            if (existing) {
                existing.usageCount = (existing.usageCount || 0) + 1;
                this._dirty = true;
                this._debounceSave();
                return existing.id;
            }
            var obj = {
                id: this._genId(type, name),
                name: name,
                type: type,
                usageCount: 1,
                order: list.length,
                parentId: null,
                created: Date.now()
            };
            list.push(obj);
            this._objects[type] = list;
            this._dirty = true;
            this._debounceSave();
            return obj.id;
        },

        getById: function (id) {
            for (var t = 0; t < OBJECT_TYPES.length; t++) {
                var type = OBJECT_TYPES[t];
                var list = this._objects[type] || [];
                for (var i = 0; i < list.length; i++) {
                    if (list[i].id === id) return list[i];
                }
            }
            return null;
        },

        getByName: function (type, name) {
            if (!name) return null;
            var list = this._objects[type] || [];
            return list.find(function (o) {
                return o.name.toLowerCase() === name.toLowerCase();
            }) || null;
        },

        search: function (type, query) {
            query = (query || '').toLowerCase().trim();
            var list = this._objects[type] || [];
            if (!query) return list.slice(0, 20);
            return list.filter(function (o) {
                return o.name.toLowerCase().indexOf(query) !== -1;
            }).slice(0, 20);
        },

        getAll: function (type) {
            var list = (this._objects[type] || []).slice();
            list.sort(function (a, b) {
                return (a.order || 0) - (b.order || 0);
            });
            return list;
        },

        getAllByType: function () {
            var result = {};
            OBJECT_TYPES.forEach(function (t) {
                result[t] = registry._objects[t] || [];
            });
            return result;
        },

        getTypes: function () {
            return OBJECT_TYPES.slice();
        },

        getTypeLabel: function (type) {
            if (this._typeConfigs && this._typeConfigs[type]) {
                return this._typeConfigs[type].label;
            }
            return type;
        },

        getTypeIcon: function (type) {
            if (this._typeConfigs && this._typeConfigs[type]) {
                return this._typeConfigs[type].icon;
            }
            return 'fa-tag';
        },

        getTypeColor: function (type) {
            if (this._typeConfigs && this._typeConfigs[type]) {
                return this._typeConfigs[type].color;
            }
            return '#888';
        },

        remove: function (id) {
            for (var t = 0; t < OBJECT_TYPES.length; t++) {
                var type = OBJECT_TYPES[t];
                var list = this._objects[type] || [];
                var idx = list.findIndex(function (o) { return o.id === id; });
                if (idx !== -1) {
                    list.splice(idx, 1);
                    this._dirty = true;
                    this._debounceSave();
                    return true;
                }
            }
            return false;
        },

        _saveTimeout: null,
        _debounceSave: function () {
            if (this._saveTimeout) clearTimeout(this._saveTimeout);
            var self = this;
            this._saveTimeout = setTimeout(function () { self.save(); }, 500);
        },

        save: function () {
            if (!this._dirty) return;
            localStorage.setItem(DB_KEY, JSON.stringify(this._objects));
            this._dirty = false;
        },

        getHumanFields: function (human) {
            if (!human) return {};
            return {
                gender: human.gender,
                maritalStatus: human.maritalStatus,
                nationality: human.nationality,
                countryOfOrigin: human.countryOfOrigin,
                immigrationStatus: human.immigrationStatus,
                languages: human.languages,
                ethnicity: human.ethnicity,
                religion: human.religion,
                politicalViews: human.politicalViews,
                threatLevel: human.threatLevel,
                socialClass: human.socialClass,
                incomeLevel: human.incomeLevel,
                educationLevel: human.educationLevel,
                workplace: human.workplace,
                occupation: human.occupation
            };
        },

        ensureObjectsForHuman: function (human) {
            var fields = this.getHumanFields(human);
            var map = {};
            for (var key in fields) {
                var val = fields[key];
                if (!val) continue;
                if (typeof val === 'string') {
                    var id = this.getOrCreate(key, val);
                    if (id) map[key] = id;
                } else if (Array.isArray(val)) {
                    map[key] = val.map(function (v) {
                        return registry.getOrCreate(key, v);
                    }).filter(Boolean);
                }
            }
            return map;
        },

        getStats: function () {
            var stats = {};
            var total = 0;
            OBJECT_TYPES.forEach(function (t) {
                var list = registry._objects[t] || [];
                stats[t] = list.length;
                total += list.length;
            });
            stats.total = total;
            return stats;
        },

        /* --- Value management --- */

        updateObject: function (id, updates) {
            var obj = this.getById(id);
            if (!obj) return false;
            for (var key in updates) {
                if (updates.hasOwnProperty(key)) {
                    obj[key] = updates[key];
                }
            }
            this._dirty = true;
            this._debounceSave();
            return true;
        },

        bulkCreate: function (type, names) {
            if (!this._typeConfigs[type]) return [];
            var created = [];
            var list = this._objects[type] || [];
            names.forEach(function (name) {
                name = (name || '').trim();
                if (!name) return;
                var exists = list.some(function (o) {
                    return o.name.toLowerCase() === name.toLowerCase();
                });
                if (exists) return;
                var obj = {
                    id: registry._genId(type, name),
                    name: name,
                    type: type,
                    usageCount: 0,
                    order: list.length + created.length,
                    parentId: null,
                    created: Date.now()
                };
                created.push(obj);
            });
            if (created.length > 0) {
                list.push.apply(list, created);
                this._objects[type] = list;
                this._dirty = true;
                this._debounceSave();
            }
            return created;
        },

        reorderValues: function (type, orderedIds) {
            var list = this._objects[type] || [];
            var map = {};
            list.forEach(function (o) { map[o.id] = o; });
            var reordered = [];
            orderedIds.forEach(function (id, idx) {
                if (map[id]) {
                    map[id].order = idx;
                    reordered.push(map[id]);
                }
            });
            list.forEach(function (o) {
                if (reordered.indexOf(o) === -1) {
                    o.order = reordered.length;
                    reordered.push(o);
                }
            });
            this._objects[type] = reordered;
            this._dirty = true;
            this._debounceSave();
        },

        setParent: function (id, parentId) {
            var obj = this.getById(id);
            if (!obj) return false;
            obj.parentId = parentId || null;
            this._dirty = true;
            this._debounceSave();
            return true;
        },

        getChildren: function (id) {
            var results = [];
            OBJECT_TYPES.forEach(function (t) {
                var list = registry._objects[t] || [];
                list.forEach(function (o) {
                    if (o.parentId === id) results.push(o);
                });
            });
            return results;
        },

        renameValue: function (id, newName) {
            var obj = this.getById(id);
            if (!obj || !newName || !newName.trim()) return false;
            newName = newName.trim();
            var list = this._objects[obj.type] || [];
            var dup = list.some(function (o) {
                return o.id !== id && o.name.toLowerCase() === newName.toLowerCase();
            });
            if (dup) return false;
            obj.name = newName;
            this._dirty = true;
            this._debounceSave();
            return true;
        },

        /* --- Import / Export --- */

        exportJSON: function () {
            var types = {};
            OBJECT_TYPES.forEach(function (t) {
                types[t] = registry._typeConfigs[t] || { label: t, icon: 'fa-tag', color: '#888' };
            });
            return JSON.stringify({
                version: 2,
                exported: Date.now(),
                objectTypes: OBJECT_TYPES.slice(),
                typeConfigs: types,
                objects: this._objects
            }, null, 2);
        },

        importJSON: function (jsonStr) {
            try {
                var data = JSON.parse(jsonStr);
                if (!data.objects || !data.typeConfigs) return { success: false, error: 'Invalid ontology format' };
                this._objects = data.objects;
                this._typeConfigs = data.typeConfigs;
                OBJECT_TYPES.length = 0;
                for (var key in data.typeConfigs) {
                    OBJECT_TYPES.push(key);
                }
                this._saveTypeConfigs();
                this._dirty = true;
                this.save();
                return { success: true, count: Object.keys(data.objects).length };
            } catch (e) {
                return { success: false, error: e.message };
            }
        }
    };

    registry.init();

    window.pazatorObjects = registry;

    var autocompleteIdCounter = 0;

    function createAutocompleteField(container, options) {
        var opts = options || {};
        var type = opts.type || '';
        var placeholder = opts.placeholder || 'Search or type new...';
        var labelText = opts.label || '';
        var initialValue = opts.initialValue || '';
        var allowCreate = opts.allowCreate !== false;
        var allowMultiple = opts.allowMultiple === true;

        var id = 'obj_ac_' + (++autocompleteIdCounter);

        var wrapper = document.createElement('div');
        wrapper.className = 'obj-autocomplete-wrapper';
        wrapper.dataset.acType = type;
        wrapper.dataset.acId = id;

        var hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = opts.name || type;
        hiddenInput.id = id + '_hidden';
        hiddenInput.value = '';
        wrapper.appendChild(hiddenInput);

        var chipContainer = null;
        if (allowMultiple) {
            chipContainer = document.createElement('div');
            chipContainer.className = 'obj-chip-container';
            wrapper.appendChild(chipContainer);
        }

        var inputRow = document.createElement('div');
        inputRow.className = 'obj-ac-input-row';

        var textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'form-control obj-ac-input';
        textInput.placeholder = placeholder;
        textInput.id = id + '_input';
        textInput.autocomplete = 'off';
        inputRow.appendChild(textInput);

        var createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.className = 'obj-ac-create-btn';
        createBtn.title = 'Create as new object';
        createBtn.innerHTML = '<i class="fas fa-plus"></i>';
        createBtn.style.display = 'none';
        inputRow.appendChild(createBtn);

        wrapper.appendChild(inputRow);

        var dropdown = document.createElement('div');
        dropdown.className = 'obj-ac-dropdown';
        dropdown.id = id + '_dropdown';
        dropdown.style.position = 'fixed';

        if (labelText) {
            var label = document.createElement('label');
            label.className = 'obj-ac-label';
            label.textContent = labelText;
            wrapper.insertBefore(label, wrapper.firstChild);
        }

        var currentSearch = '';
        var selectedIds = allowMultiple ? [] : null;
        var selectedNames = allowMultiple ? [] : null;

        function setSelected(value, name) {
            if (allowMultiple) {
                if (value && !selectedIds.includes(value)) {
                    selectedIds.push(value);
                    selectedNames.push(name);
                    addChip(name, value);
                }
                hiddenInput.value = selectedIds.join(',');
            } else {
                hiddenInput.value = value || '';
                textInput.value = name || '';
            }
            if (opts.onChange) opts.onChange(value, name);
            dropdown.classList.remove('active');
        }

        function addChip(name, value) {
            if (!chipContainer) return;
            var chip = document.createElement('span');
            chip.className = 'obj-chip';
            chip.dataset.value = value;
            chip.innerHTML = '<span>' + escapeHtml(name) + '</span><button type="button" class="obj-chip-remove" data-value="' + value + '">&times;</button>';
            chipContainer.appendChild(chip);
            chip.querySelector('.obj-chip-remove').addEventListener('click', function (e) {
                e.stopPropagation();
                var val = this.dataset.value;
                var idx = selectedIds.indexOf(val);
                if (idx !== -1) {
                    selectedIds.splice(idx, 1);
                    selectedNames.splice(idx, 1);
                }
                chip.remove();
                hiddenInput.value = selectedIds.join(',');
                if (opts.onChange) opts.onChange(hiddenInput.value);
            });
        }

        function positionDropdown() {
            var rect = textInput.getBoundingClientRect();
            dropdown.style.top = (rect.bottom + 4) + 'px';
            dropdown.style.left = rect.left + 'px';
            dropdown.style.width = Math.max(rect.width, 200) + 'px';
        }

        function resetDropdown() {
            dropdown.innerHTML = '';
            dropdown.classList.remove('active');
            createBtn.style.display = 'none';
            if (dropdown.parentNode) dropdown.remove();
        }

        function showDropdown(results, searchVal) {
            dropdown.innerHTML = '';
            positionDropdown();
            document.body.appendChild(dropdown);
            if (!results || results.length === 0) {
                if (searchVal && allowCreate) {
                    var emptyMsg = document.createElement('div');
                    emptyMsg.className = 'obj-ac-empty';
                    emptyMsg.textContent = 'No matches found';
                    dropdown.appendChild(emptyMsg);
                    dropdown.classList.add('active');
                    createBtn.style.display = '';
                } else {
                    dropdown.classList.remove('active');
                    createBtn.style.display = 'none';
                }
                return;
            }
            results.forEach(function (obj) {
                var item = document.createElement('div');
                item.className = 'obj-ac-item';
                if (!allowMultiple && hiddenInput.value === obj.id) item.classList.add('selected');
                var nameSpan = document.createElement('span');
                nameSpan.className = 'obj-ac-item-name';
                nameSpan.textContent = obj.name;
                item.appendChild(nameSpan);
                if (obj.usageCount > 0) {
                    var countSpan = document.createElement('span');
                    countSpan.className = 'obj-ac-item-count';
                    countSpan.textContent = obj.usageCount + 'x';
                    item.appendChild(countSpan);
                }
                item.addEventListener('click', function () {
                    setSelected(obj.id, obj.name);
                    textInput.value = obj.name;
                    resetDropdown();
                });
                dropdown.appendChild(item);
            });
            if (searchVal && allowCreate) {
                var createItem = document.createElement('div');
                createItem.className = 'obj-ac-item obj-ac-create';
                createItem.innerHTML = '<i class="fas fa-plus-circle"></i> Create "' + escapeHtml(searchVal) + '"';
                createItem.addEventListener('click', function () {
                    var newId = pazatorObjects.getOrCreate(type, searchVal);
                    var newObj = pazatorObjects.getById(newId);
                    setSelected(newId, newObj ? newObj.name : searchVal);
                    textInput.value = newObj ? newObj.name : searchVal;
                    resetDropdown();
                });
                dropdown.appendChild(createItem);
                createBtn.style.display = '';
                createBtn.onclick = function () {
                    createItem.click();
                };
            } else {
                createBtn.style.display = 'none';
            }
            dropdown.classList.add('active');
        }

        function repositionDropdown() {
            if (dropdown.classList.contains('active')) {
                positionDropdown();
            }
        }

        textInput.addEventListener('input', function () {
            var val = this.value;
            currentSearch = val;
            if (!val) {
                resetDropdown();
                if (!allowMultiple) {
                    hiddenInput.value = '';
                }
                return;
            }
            var results = pazatorObjects.search(type, val);
            showDropdown(results, val);
        });

        textInput.addEventListener('focus', function () {
            this.placeholder = 'Search ' + placeholder.toLowerCase() + '...';
            var results = pazatorObjects.search(type, this.value);
            if (results.length > 0 || (this.value && allowCreate)) {
                showDropdown(results, this.value);
            }
        });

        textInput.addEventListener('blur', function () {
            this.placeholder = placeholder;
            setTimeout(function () {
                resetDropdown();
            }, 200);
        });

        window.addEventListener('scroll', repositionDropdown, true);
        window.addEventListener('resize', repositionDropdown);

        textInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                var firstItem = dropdown.querySelector('.obj-ac-item:not(.obj-ac-create)');
                var createItem = dropdown.querySelector('.obj-ac-create');
                if (firstItem) {
                    firstItem.click();
                } else if (createItem) {
                    createItem.click();
                }
            }
            if (e.key === 'Escape') {
                resetDropdown();
            }
            if (e.key === 'Backspace' && !this.value && allowMultiple && selectedIds.length > 0) {
                var lastId = selectedIds.pop();
                var lastName = selectedNames.pop();
                if (chipContainer) {
                    var chips = chipContainer.querySelectorAll('.obj-chip');
                    if (chips.length > 0) chips[chips.length - 1].remove();
                }
                hiddenInput.value = selectedIds.join(',');
                if (opts.onChange) opts.onChange(hiddenInput.value);
            }
        });

        container.appendChild(wrapper);

        if (initialValue) {
            var existing = pazatorObjects.getByName(type, initialValue);
            if (existing) {
                setSelected(existing.id, existing.name);
                textInput.value = existing.name;
            } else if (allowCreate) {
                var newId = pazatorObjects.getOrCreate(type, initialValue);
                var newObj = pazatorObjects.getById(newId);
                setSelected(newId, newObj ? newObj.name : initialValue);
                textInput.value = newObj ? newObj.name : initialValue;
            } else {
                textInput.value = initialValue;
            }
        }

        return {
            wrapper: wrapper,
            hiddenInput: hiddenInput,
            textInput: textInput,
            getValue: function () {
                if (allowMultiple) {
                    return selectedIds;
                }
                return hiddenInput.value;
            },
            getTextValue: function () {
                if (allowMultiple) {
                    return selectedNames;
                }
                return textInput.value;
            },
            setValue: function (val, name) {
                if (allowMultiple) return;
                hiddenInput.value = val || '';
                textInput.value = name || '';
            },
            reset: function () {
                hiddenInput.value = '';
                textInput.value = '';
                if (allowMultiple) {
                    selectedIds = [];
                    selectedNames = [];
                    if (chipContainer) chipContainer.innerHTML = '';
                }
                resetDropdown();
            },
            addValue: function (name) {
                if (!allowMultiple || !name) return;
                name = name.trim();
                if (selectedNames.indexOf(name) !== -1) return;
                var obj = pazatorObjects.getByName(type, name);
                if (obj) {
                    setSelected(obj.id, obj.name);
                } else {
                    var newId = pazatorObjects.getOrCreate(type, name);
                    var o = pazatorObjects.getById(newId);
                    if (o) setSelected(newId, o.name);
                }
            },
            clearValues: function () {
                if (allowMultiple) {
                    selectedIds = [];
                    selectedNames = [];
                    if (chipContainer) chipContainer.innerHTML = '';
                    hiddenInput.value = '';
                }
            },
            destroy: function () {
                wrapper.remove();
            }
        };
    }

    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    window.createAutocompleteField = createAutocompleteField;
    window.escapeHtml = escapeHtml;
    window.objEscapeHtml = escapeHtml;

})();
