(function () {
    'use strict';

    var OBJECT_TYPES = [
        'gender', 'maritalStatus', 'nationality', 'countryOfOrigin',
        'immigrationStatus', 'language', 'ethnicity', 'religion',
        'politicalView', 'threatLevel', 'socialClass', 'incomeLevel',
        'educationLevel', 'workplace', 'occupation'
    ];

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

    var registry = {
        _objects: {},
        _dirty: false,

        init: function () {
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

        _ensureDefaults: function () {
            var changed = false;
            OBJECT_TYPES.forEach(function (type) {
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
                            registry._objects[type].push({
                                id: registry._genId(type, d.name),
                                name: d.name,
                                type: type,
                                usageCount: 0,
                                created: Date.now()
                            });
                            changed = true;
                        }
                    });
                }
            });
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
            return (this._objects[type] || []).slice();
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
            var labels = {
                gender: 'Gender',
                maritalStatus: 'Marital Status',
                nationality: 'Nationality',
                countryOfOrigin: 'Country of Origin',
                immigrationStatus: 'Immigration Status',
                language: 'Language',
                ethnicity: 'Ethnicity',
                religion: 'Religion',
                politicalView: 'Political View',
                threatLevel: 'Threat Level',
                socialClass: 'Social Class',
                incomeLevel: 'Income Level',
                educationLevel: 'Education Level',
                workplace: 'Workplace / Occupation',
                occupation: 'Occupation'
            };
            return labels[type] || type;
        },

        getTypeIcon: function (type) {
            var icons = {
                gender: 'fa-venus-mars',
                maritalStatus: 'fa-heart',
                nationality: 'fa-flag',
                countryOfOrigin: 'fa-globe',
                immigrationStatus: 'fa-passport',
                language: 'fa-language',
                ethnicity: 'fa-users',
                religion: 'fa-pray',
                politicalView: 'fa-landmark',
                threatLevel: 'fa-shield-alt',
                socialClass: 'fa-layer-group',
                incomeLevel: 'fa-coins',
                educationLevel: 'fa-graduation-cap',
                workplace: 'fa-briefcase',
                occupation: 'fa-briefcase'
            };
            return icons[type] || 'fa-tag';
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
