// ============================================================
// Zor Tool-Calling System (opt-in alternative to full-context)
// ============================================================

const ZOR_TOOL_MODE_KEY = 'pazator_zor_tool_mode';

function _buildSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    var path = [];
    var cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
        var tag = cur.tagName.toLowerCase();
        if (cur.id) { path.unshift('#' + CSS.escape(cur.id)); break; }
        var parent = cur.parentElement;
        if (parent) {
            tag += ':nth-child(' + (Array.from(parent.children).indexOf(cur) + 1) + ')';
        }
        path.unshift(tag);
        cur = parent;
    }
    return path.join(' > ');
}

function isZorToolMode() {
    return localStorage.getItem(ZOR_TOOL_MODE_KEY) === 'true';
}

function setZorToolMode(enabled) {
    localStorage.setItem(ZOR_TOOL_MODE_KEY, enabled ? 'true' : 'false');
    var btn = document.getElementById('zorToolModeToggle');
    if (btn) {
        btn.classList.toggle('active', enabled);
    }
    if (enabled) {
        showFloatingNotification('CTXOD ON — Zor will fetch data on demand instead of full context dump', 'info');
    } else {
        showFloatingNotification('Full context mode — all data will be fed to Zor', 'info');
    }
}

function initZorToolModeToggle() {
    var btn = document.getElementById('zorToolModeToggle');
    if (btn) {
        btn.classList.toggle('active', isZorToolMode());
    }
}

const ZorTools = {
    tools: {
        search_people: {
            description: 'Search for people by name or any field (gender, nationality, workplace, threatLevel, tags, etc.). Returns matching people with basic info.',
            parameters: { query: 'Search term - matches against name and all fields' },
            handler: function (params) {
                const query = (params.query || '').toLowerCase();
                if (!query) return { count: 0, people: [] };
                var humans = pazatorData.humans;
                if (window.pazatorStore && query.length > 0) {
                    var nameMatch = pazatorStore.getHumanByName(query);
                    if (nameMatch) {
                        return {
                            count: 1,
                            people: [{
                                id: nameMatch.id, name: nameMatch.name, gender: nameMatch.gender,
                                nationality: nameMatch.nationality, workplace: nameMatch.workplace,
                                threatLevel: nameMatch.threatLevel || 'None', credit: nameMatch.credit,
                                tags: nameMatch.tags || []
                            }]
                        };
                    }
                }
                const results = humans.filter(function (h) {
                    return JSON.stringify(h).toLowerCase().includes(query);
                });
                return {
                    count: results.length,
                    people: results.map(function (h) {
                        return {
                            id: h.id, name: h.name, gender: h.gender,
                            nationality: h.nationality, workplace: h.workplace,
                            threatLevel: h.threatLevel || 'None', credit: h.credit,
                            tags: h.tags || []
                        };
                    })
                };
            }
        },
        get_person: {
            description: 'Get full details of a specific person by ID or exact name.',
            parameters: { id: 'Person ID (optional if name provided)', name: 'Exact person name (optional if id provided)' },
            handler: function (params) {
                var person = null;
                if (params.id && window.pazatorStore) {
                    person = pazatorStore.getHumanById(params.id);
                } else if (params.name && window.pazatorStore) {
                    person = pazatorStore.getHumanByName(params.name);
                }
                if (!person) {
                    person = params.id
                        ? pazatorData.humans.find(function (h) { return String(h.id) === String(params.id); })
                        : pazatorData.humans.find(function (h) { return h.name.toLowerCase() === (params.name || '').toLowerCase(); });
                }
                if (!person) return { found: false, message: 'Person not found' };
                return { found: true, person: person };
            }
        },
        list_all_people: {
            description: 'Get a lightweight list of all people (names and basic info only, not full details).',
            parameters: {},
            handler: function () {
                return {
                    count: pazatorData.humans.length,
                    people: pazatorData.humans.map(function (h) {
                        return { id: h.id, name: h.name, gender: h.gender, threatLevel: h.threatLevel || 'None', credit: h.credit };
                    })
                };
            }
        },
        list_all_entities: {
            description: 'Get a list of all organizations and non-person entities.',
            parameters: {},
            handler: function () {
                return {
                    count: pazatorData.others.length,
                    entities: pazatorData.others.map(function (o) {
                        return { id: o.id, name: o.name, note: o.note };
                    })
                };
            }
        },
        get_tags: {
            description: 'List all available tags in the system.',
            parameters: {},
            handler: function () {
                return { tags: tags || [] };
            }
        },
        search_by_tag: {
            description: 'Find all people who have a specific tag assigned.',
            parameters: { tag: 'The exact tag name to search for' },
            handler: function (params) {
                var tag = (params.tag || '').toLowerCase();
                if (!tag) return { count: 0, people: [] };
                var results = pazatorData.humans.filter(function (h) {
                    return (h.tags || []).some(function (t) { return t.toLowerCase() === tag; });
                });
                return {
                    count: results.length,
                    people: results.map(function (h) {
                        return { id: h.id, name: h.name, gender: h.gender, threatLevel: h.threatLevel || 'None', credit: h.credit };
                    })
                };
            }
        },
        get_stats: {
            description: 'Get overall database statistics (counts, averages, risk summary).',
            parameters: {},
            handler: function () {
                var totalHumans = pazatorData.humans.length;
                var totalOthers = pazatorData.others.length;
                var highRisk = pazatorData.humans.filter(function (h) {
                    var t = h.threatLevel || 'None';
                    return t === 'High' || t === 'Critical';
                }).length;
                var avgCredit = totalHumans > 0
                    ? pazatorData.humans.reduce(function (s, h) { return s + (h.credit || 0); }, 0) / totalHumans
                    : 0;
                return {
                    totalHumans: totalHumans,
                    totalEntities: totalOthers,
                    totalItems: totalHumans + totalOthers,
                    highRiskCount: highRisk,
                    averageCredit: Math.round(avgCredit * 10) / 10,
                    tagCount: (tags || []).length,
                    casesCount: cases.length
                };
            }
        },
        get_risk_summary: {
            description: 'Get the distribution of threat levels across all people.',
            parameters: {},
            handler: function () {
                var levels = { None: 0, Low: 0, Medium: 0, High: 0, Critical: 0 };
                pazatorData.humans.forEach(function (h) {
                    var level = h.threatLevel || 'None';
                    if (levels[level] !== undefined) levels[level]++;
                    else levels[level] = 1;
                });
                var total = pazatorData.humans.length || 1;
                return {
                    distribution: levels,
                    highRiskPercent: Math.round(((levels.High + levels.Critical) / total) * 100)
                };
            }
        },
        list_cases: {
            description: 'List all open case files and missions.',
            parameters: {},
            handler: function () {
                return {
                    count: cases.length,
                    cases: cases.map(function (c) {
                        return { id: c.id, title: c.title, status: c.status, severity: c.severity, description: (c.description || '').substring(0, 100) };
                    })
                };
            }
        },
        search_chats: {
            description: 'Search through archived chat message content for keywords.',
            parameters: { query: 'Search term' },
            handler: function (params) {
                var query = (params.query || '').toLowerCase();
                if (!query) return { count: 0, matches: [] };
                var allChats = pazatorData && pazatorData.chats ? pazatorData.chats : [];
                var results = [];
                for (var ci = 0; ci < allChats.length; ci++) {
                    var chat = allChats[ci];
                    if ((chat.content || '').toLowerCase().includes(query)) {
                        results.push({
                            source: chat.source,
                            participants: chat.participants,
                            snippet: (chat.content || '').substring(0, 200)
                        });
                        if (results.length >= 10) break;
                    }
                }
                return { count: results.length, matches: results };
            }
        },
        find_connections: {
            description: 'Find potential connections between people based on shared workplaces, tags, family, or other common fields.',
            parameters: { person_name: 'Name of a specific person to find connections for (optional)' },
            handler: function (params) {
                var name = (params.person_name || '').toLowerCase();
                var people = name
                    ? pazatorData.humans.filter(function (h) { return h.name.toLowerCase().includes(name); })
                    : pazatorData.humans;
                var connections = [];
                for (var i = 0; i < Math.min(people.length, 20); i++) {
                    for (var j = i + 1; j < Math.min(people.length, 20); j++) {
                        var a = people[i], b = people[j];
                        var reasons = [];
                        if (a.workplace && b.workplace && a.workplace.toLowerCase() === b.workplace.toLowerCase()) {
                            reasons.push('same workplace: ' + a.workplace);
                        }
                        if (a.nationality && b.nationality && a.nationality.toLowerCase() === b.nationality.toLowerCase()) {
                            reasons.push('same nationality: ' + a.nationality);
                        }
                        if (a.tags && b.tags) {
                            var shared = a.tags.filter(function (t) { return b.tags.indexOf(t) !== -1; });
                            if (shared.length > 0) reasons.push('shared tags: ' + shared.join(', '));
                        }
                        if (reasons.length > 0) {
                            connections.push({ person_a: a.name, person_b: b.name, reasons: reasons, strength: reasons.length });
                        }
                    }
                }
                connections.sort(function (x, y) { return y.strength - x.strength; });
                return { count: connections.length, connections: connections.slice(0, 20) };
            }
        },
        list_object_types: {
            description: 'List all object types in the system (e.g., gender, nationality, religion, politicalView, etc.) with counts.',
            parameters: {},
            handler: function () {
                if (!window.pazatorObjects) return { types: [] };
                var stats = pazatorObjects.getStats();
                var types = pazatorObjects.getTypes().filter(function (t) { return (stats[t] || 0) > 0; });
                return {
                    count: types.length,
                    types: types.map(function (t) {
                        return { type: t, label: pazatorObjects.getTypeLabel(t), count: stats[t] || 0, icon: pazatorObjects.getTypeIcon(t) };
                    })
                };
            }
        },
        get_objects_by_type: {
            description: 'Get all objects of a specific type (e.g., "nationality", "religion", "politicalView", "workplace", "gender", "threatLevel"). Returns objects sorted by usage count.',
            parameters: { type: 'The object type name (e.g., "nationality", "religion", "politicalView", "workplace")' },
            handler: function (params) {
                if (!window.pazatorObjects) return { count: 0, objects: [] };
                var type = params.type || '';
                var objects = pazatorObjects.getAll(type);
                return {
                    type: type,
                    label: pazatorObjects.getTypeLabel(type),
                    count: objects.length,
                    objects: objects.sort(function (a, b) { return (b.usageCount || 0) - (a.usageCount || 0); }).slice(0, 50)
                };
            }
        },
        get_object_detail: {
            description: 'Get details about a specific object and all humans connected to it. Use this to see who shares a particular attribute.',
            parameters: { type: 'Object type (e.g., "nationality", "religion", "politicalView")', name: 'Object name (e.g., "American", "Christian", "Liberal")' },
            handler: function (params) {
                if (!window.pazatorObjects) return { found: false };
                var obj = pazatorObjects.getByName(params.type, params.name);
                if (!obj) return { found: false, message: 'Object not found' };
                var matchedHumans = pazatorData.humans.filter(function (h) {
                    var fieldMap = {
                        gender: h.gender, maritalStatus: h.maritalStatus, nationality: h.nationality,
                        countryOfOrigin: h.countryOfOrigin, immigrationStatus: h.immigrationStatus,
                        language: h.languages, ethnicity: h.ethnicity, religion: h.religion,
                        politicalView: h.politicalViews, threatLevel: h.threatLevel, socialClass: h.socialClass,
                        incomeLevel: h.incomeLevel, educationLevel: h.educationLevel, workplace: h.workplace,
                        occupation: h.occupation
                    };
                    var val = fieldMap[params.type];
                    if (!val) return false;
                    if (Array.isArray(val)) return val.some(function (v) { return v.toLowerCase() === obj.name.toLowerCase(); });
                    return val.toLowerCase() === obj.name.toLowerCase();
                });
                return {
                    found: true,
                    object: obj,
                    connectedHumans: matchedHumans.map(function (h) {
                        return { id: h.id, name: h.name, threatLevel: h.threatLevel || 'None', credit: h.credit, tags: h.tags || [] };
                    }),
                    connectionCount: matchedHumans.length
                };
            }
        },
        search_objects: {
            description: 'Search for objects by name across all types or within a specific type.',
            parameters: { query: 'Search term', type: 'Optional - restrict to a specific object type' },
            handler: function (params) {
                if (!window.pazatorObjects) return { count: 0, results: [] };
                var query = (params.query || '').toLowerCase();
                if (!query) return { count: 0, results: [] };
                var searchType = params.type || null;
                var types = searchType ? [searchType] : pazatorObjects.getTypes();
                var results = [];
                types.forEach(function (t) {
                    var objects = pazatorObjects.search(t, query);
                    objects.forEach(function (o) {
                        results.push({ type: t, label: pazatorObjects.getTypeLabel(t), object: o });
                    });
                });
                results.sort(function (a, b) { return (b.object.usageCount || 0) - (a.object.usageCount || 0); });
                return { count: results.length, results: results.slice(0, 30) };
            }
        },
        add_object: {
            description: 'Create a new object of a given type (e.g., nationality, religion, politicalView, workplace). Use this when you need a specific field value that does not exist yet before assigning it to a human.',
            parameters: { type: 'Object type (e.g., "nationality", "religion", "politicalView", "workplace", "ethnicity", "language")', name: 'The name of the new object (e.g., "Canadian", "Buddhist", "Libertarian")' },
            handler: function (params) {
                if (!window.pazatorObjects) return { success: false, message: 'Object system not available' };
                var type = (params.type || '').trim();
                var name = (params.name || '').trim();
                if (!type || !name) return { success: false, message: 'Both type and name are required' };
                var validTypes = pazatorObjects.getTypes();
                if (validTypes.indexOf(type) === -1) return { success: false, message: 'Invalid type. Valid types: ' + validTypes.join(', ') };
                var id = pazatorObjects.getOrCreate(type, name);
                var obj = pazatorObjects.getById(id);
                return { success: true, object: obj, message: 'Object "' + name + '" (' + type + ') is ready' };
            }
        },
        heur_detect_aliases: {
            description: 'Scan the database to automatically identify duplicate entities, aliases, and shadow profiles based on birthdates, name similarity, and shared attributes.',
            parameters: {},
            handler: function () {
                if (!window.pazatorHeuristics) return { count: 0, duplicates: [], error: 'Heuristics system not loaded' };
                var results = pazatorHeuristics.scan(pazatorData.humans);
                return { count: results.length, duplicates: results };
            }
        },
        // ── Dynamic DOM tools ────────────────────────────────────
        get_dom_structure: {
            description: 'Get the full visible DOM structure of the current app view as a simplified tree. Use this to understand the current UI layout, find element selectors, and discover interactive elements.',
            parameters: {},
            handler: function () {
                var excludeSelectors = ['.ai-chat-modal', '.pz-select-tooltip', '.pz-select-highlight', '#pazator-floating-notifications'];
                function simplifyNode(el, depth) {
                    if (depth > 6) return null;
                    var tag = el.tagName ? el.tagName.toLowerCase() : '';
                    if (tag === 'script' || tag === 'style' || tag === 'noscript') return null;
                    var id = el.id || '';
                    var classes = Array.from(el.classList).filter(function (c) { return c.indexOf('pz-') !== 0 && c.indexOf('fa-') !== 0; });
                    var text = (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) ? (el.textContent || '').trim().substring(0, 80) : '';
                    var show = (id || classes.length || text || el.children.length === 0) && el.offsetParent !== null;
                    var children = [];
                    for (var i = 0; i < el.children.length; i++) {
                        var child = simplifyNode(el.children[i], depth + 1);
                        if (child) children.push(child);
                    }
                    if (!show && children.length === 0) return null;
                    var node = { tag: tag };
                    if (id) node.id = id;
                    if (classes.length) node.classes = classes;
                    if (text) node.text = text;
                    if (children.length) node.children = children;
                    var inputType = el.getAttribute && el.getAttribute('type');
                    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
                        node.inputType = inputType || tag;
                        node.placeholder = el.getAttribute('placeholder') || '';
                        node.value = (tag === 'input' && inputType === 'password') ? '*****' : (el.value ? el.value.substring(0, 40) : '');
                    }
                    return node;
                }
                var tree = { tag: 'body', children: [] };
                for (var i = 0; i < document.body.children.length; i++) {
                    var child = simplifyNode(document.body.children[i], 0);
                    if (child) tree.children.push(child);
                }
                return tree;
            }
        },
        get_element_info: {
            description: 'Get detailed information about a specific element by CSS selector. Returns tag, id, classes, text content, input value, attributes, position, visibility, and outerHTML.',
            parameters: { selector: 'CSS selector for the element (e.g., "#myId", ".myClass", "div > button:nth-child(2)")' },
            handler: function (params) {
                try {
                    var el = document.querySelector(params.selector);
                    if (!el) return { found: false, error: 'Element not found for selector: ' + params.selector };
                    var rect = el.getBoundingClientRect();
                    var tag = el.tagName.toLowerCase();
                    var id = el.id || '';
                    var classes = Array.from(el.classList);
                    var text = (el.textContent || '').trim().substring(0, 1000);
                    var value = '';
                    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
                        value = el.value || '';
                        if (el.type === 'password') value = '*****';
                    }
                    var attrs = {};
                    Array.from(el.attributes).forEach(function (a) { if (a.name !== 'style') attrs[a.name] = a.value; });
                    var inner = el.innerHTML.substring(0, 3000);
                    var outer = el.outerHTML.substring(0, 3000);
                    return {
                        found: true,
                        tag: tag,
                        id: id || undefined,
                        classes: classes.length ? classes : undefined,
                        text: text || undefined,
                        value: value || undefined,
                        attributes: Object.keys(attrs).length ? attrs : undefined,
                        position: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
                        visible: rect.width > 0 && rect.height > 0,
                        innerHTML: inner,
                        outerHTML: outer
                    };
                } catch (e) {
                    return { found: false, error: e.message };
                }
            }
        },
        click_element: {
            description: 'Simulate a click on an element identified by CSS selector. Use this to press buttons, toggle switches, open menus, or submit forms.',
            parameters: { selector: 'CSS selector for the element to click' },
            handler: function (params) {
                try {
                    var el = document.querySelector(params.selector);
                    if (!el) return { success: false, error: 'Element not found: ' + params.selector };
                    if (typeof el.click === 'function') {
                        el.click();
                    } else {
                        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    }
                    var tag = el.tagName.toLowerCase();
                    var text = (el.textContent || '').trim().substring(0, 100);
                    return { success: true, element: tag + (text ? ' (' + text + ')' : ''), message: 'Clicked ' + params.selector };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }
        },
        set_element_text: {
            description: 'Set the value of an input, textarea, or contenteditable element. Use to type into search fields, fill forms, or update editable content.',
            parameters: { selector: 'CSS selector for the element', value: 'The text value to set' },
            handler: function (params) {
                try {
                    var el = document.querySelector(params.selector);
                    if (!el) return { success: false, error: 'Element not found: ' + params.selector };
                    var val = params.value || '';
                    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                        var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
                        if (nativeSetter && nativeSetter.set) {
                            nativeSetter.set.call(el, val);
                        } else {
                            el.value = val;
                        }
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    } else if (el.isContentEditable) {
                        el.textContent = val;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                    } else {
                        el.textContent = val;
                    }
                    return { success: true, element: params.selector, value: val.substring(0, 100) };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }
        },
        get_visible_elements: {
            description: 'Get a list of all visible interactive elements (buttons, inputs, links, clickable items) currently on screen. Useful when you need to find what the user can interact with.',
            parameters: {},
            handler: function () {
                var interactives = [];
                var tags = { a: true, button: true, input: true, textarea: true, select: true, summary: true };
                var els = document.querySelectorAll('button, a, input, textarea, select, [role="button"], [tabindex]:not([tabindex="-1"]), .chat-option, .dropdown-item, .menu-dropdown-item, .tab, .tab-action');
                for (var i = 0; i < els.length; i++) {
                    var el = els[i];
                    if (el.closest('.ai-chat-modal') || el.closest('.pz-select-tooltip')) continue;
                    var rect = el.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) continue;
                    var text = (el.textContent || '').trim().substring(0, 80);
                    if (!text && el.tagName === 'INPUT') text = el.placeholder || '';
                    if (!text && el.tagName === 'A') text = el.getAttribute('href') || '';
                    if (!text) continue;
                    interactives.push({
                        selector: _buildSelector(el),
                        tag: el.tagName.toLowerCase(),
                        text: text,
                        disabled: el.disabled || false
                    });
                }
                return { count: interactives.length, elements: interactives };
            }
        },
        // ── END DOM tools ────────────────────────────────────────
        trac_get_timeline: {
            description: 'Get a comprehensive chronological timeline of all activities, case involvements, relationship logs, and communication intercepts for a specific entity.',
            parameters: { id: 'Person ID or exactly matching name' },
            handler: function (params) {
                if (!window.pazatorTimeline) return { error: 'Timeline system not loaded' };
                var targetId = params.id;
                if (!targetId && window.pazatorStore) {
                    return { error: 'Entity ID or name is required' };
                }
                // If it looks like a name instead of ID, try to find ID
                if (targetId && isNaN(targetId) && targetId.length > 4 && window.pazatorStore) {
                    var match = pazatorStore.getHumanByName(targetId);
                    if (match) targetId = match.id;
                }
                return pazatorTimeline.getEvents(targetId);
            }
        }
    },

    getToolDescriptions: function () {
        var desc = 'AVAILABLE TOOLS (use these to fetch specific data instead of asking for full context):\n\n';
        for (var name in this.tools) {
            if (!this.tools.hasOwnProperty(name)) continue;
            var tool = this.tools[name];
            desc += 'TOOL: ' + name + '\n';
            desc += '  Description: ' + tool.description + '\n';
            var pEntries = Object.entries(tool.parameters);
            if (pEntries.length > 0) {
                desc += '  Parameters:\n';
                for (var pi = 0; pi < pEntries.length; pi++) {
                    desc += '    ' + pEntries[pi][0] + ': ' + pEntries[pi][1] + '\n';
                }
            }
            desc += '\n';
        }
        desc += 'HOW TO USE TOOLS:\n';
        desc += 'Respond with ONLY this JSON format:\n';
        desc += '{"tool": "tool_name", "params": {"param1": "value1"}}\n\n';
        desc += 'After getting tool results, use them to answer the user.\n';
        desc += 'You can call multiple tools sequentially by responding with one tool call at a time.\n\n';
        desc += 'For data modification (add/edit/delete entries), use the action JSON format:\n';
        desc += '{"action": "add_human", "data": {...}} or {"action": "modify_human", "id": "...", "data": {...}}\n\n';
        desc += 'For simple chat or questions that dont need tools, just respond naturally.\n';
        desc += 'IMPORTANT: Do NOT request all data at once. Use specific targeted tools.';
        return desc;
    },

    executeTool: function (toolName, params) {
        var tool = this.tools[toolName];
        if (!tool) return { error: 'Unknown tool: ' + toolName };
        try {
            return tool.handler(params || {});
        } catch (e) {
            return { error: 'Tool execution error: ' + e.message };
        }
    }
};

async function processToolBasedCommand(command) {
    var maxRounds = 8;
    var conversation = [
        { role: 'system', content: getZorToolSystemPrompt() },
        { role: 'user', content: command }
    ];

    for (var round = 0; round < maxRounds; round++) {
        var aiResponse;
        try {
            var geminiCall = function () { return geminiChat(conversation); };
            if (window.AIQueue) {
                aiResponse = await AIQueue.enqueue(geminiCall, { cacheKey: 'tool_round_' + round + '_' + command.substring(0, 100) });
            } else {
                aiResponse = await geminiCall();
            }
        } catch (e) {
            addMessageToAIChat('Zor encountered an error: ' + e.message, 'ai');
            return;
        }

        var responseText = aiResponse.content ? aiResponse.content : aiResponse;
        if (!responseText || responseText.trim().length === 0) {
            addMessageToAIChat('Zor did not respond. Please try again.', 'ai');
            return;
        }

        var parsed = extractJSONFromResponse(responseText);

        if (parsed && parsed.tool) {
            displayAIChatNotification('Zor is using tool: ' + parsed.tool);
            var result = ZorTools.executeTool(parsed.tool, parsed.params || {});
            conversation.push({ role: 'assistant', content: responseText });
            conversation.push({
                role: 'user',
                content: 'Tool "' + parsed.tool + '" returned:\n' + JSON.stringify(result, null, 2) + '\n\nUse this data to answer my original request. If you need more data, call another tool.'
            });
        } else if (parsed && (parsed.action || (Array.isArray(parsed) && parsed.length > 0 && parsed[0].action))) {
            conversation.push({ role: 'assistant', content: responseText });
            if (Array.isArray(parsed)) {
                await handleBatchActions(parsed);
            } else {
                handleAIAction(parsed);
            }
            return;
        } else {
            addMessageToAIChat(responseText, 'ai');
            return;
        }
    }

    addMessageToAIChat('Zor needed more steps than expected. Please try a more specific question.', 'ai');
}

function getZorToolSystemPrompt() {
    var adminContext = getAdminContext();
    var prompt = 'You are Zor (model PZZ1), an AI assistant for the Pazator intelligence platform.\n\n';
    prompt += 'You are direct, grounded, and mildly skeptical. Cut the fluff. No emojis. Be blunt.\n\n';
    prompt += 'You have access to TOOLS that let you fetch data on demand. ';
    prompt += 'Use these tools to get specific information rather than asking for all data at once.\n\n';
    prompt += ZorTools.getToolDescriptions();
    prompt += '\n\nHuman entries have fields: name, gender, birthDate, workplace/occupation, credit (0-370), socialClass, maritalStatus, nationality, countryOfOrigin, immigrationStatus, languages, ethnicity, religion, politicalViews, threatLevel (None/Low/Medium/High/Critical), educationLevel, incomeLevel, friends, family, extraNotes, tags.\n\n';
    prompt += 'OBJECT SYSTEM: Field values (nationality, religion, politicalViews, ethnicity, workplace, etc.) are tracked as reusable objects with usage counts — use list_object_types / get_objects_by_type / search_objects tools to explore them. When setting a field, just use the name string (e.g. "Canadian") and it will be automatically created. Use the add_object tool to explicitly create a new object before referencing it.\n\n';
    prompt += 'Case file actions: {"action": "create_case", "title": "...", "description": "...", "status": "open"}\n';
    prompt += '  {"action": "edit_case", "title": "...", "description": "..."}\n';
    prompt += '  {"action": "add_case_note", "title": "...", "note": "..."}\n';
    prompt += '  {"action": "close_case", "title": "..."}\n';
    prompt += '  {"action": "add_entity_to_case", "case_title": "...", "entity_name": "..."}\n\n';
    prompt += 'Other action formats:\n';
    prompt += '  {"action": "add_human", "data": {"name": "John", "gender": "Male", ...}}\n';
    prompt += '  {"action": "add_other", "data": {"name": "OrgName", "note": "..."}}\n';
    prompt += '  {"action": "delete_human", "id": "12345"}\n';
    prompt += '  {"action": "modify_human", "id": "12345", "data": {"field": "value"}}\n';
    prompt += '  {"action": "list_humans"}\n  {"action": "list_others"}\n  {"action": "count_entries"}\n';
    prompt += '  {"action": "add_tag", "tag": "newTag"}\n';
    prompt += '  {"action": "assign_tag", "id": "12345", "tag": "employee"}\n';
    prompt += '  {"action": "remove_tag", "id": "12345", "tag": "employee"}\n';
    prompt += '  {"action": "add_object", "data": {"type": "nationality", "name": "Canadian"}}\n\n';
    prompt += 'DOM INTERACTION (NEW): You can read and control the UI dynamically:\n';
    prompt += '  - get_dom_structure: Get visible HTML tree of the current view\n';
    prompt += '  - get_element_info(selector): Full details of any element\n';
    prompt += '  - get_visible_elements: List all buttons, inputs, links on screen\n';
    prompt += '  - click_element(selector): Click buttons/tabs/links\n';
    prompt += '  - set_element_text(selector, value): Type into inputs/textareas\n';
    prompt += '  When the user selects an element via the blue highlight/click UI tool, its CSS selector is provided — use it with these tools.\n\n';
    prompt += 'Previous conversation:\n';
    prompt += aiChatHistory.map(function (m) { return m.role + ': ' + m.content; }).join('\n') + '\n\n';
    if (adminContext) {
        prompt += 'ADMIN CONTEXT:\n' + adminContext + '\n\n';
    }
    return prompt;
}
// ============================================================
