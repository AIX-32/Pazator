



var ZorTools = {
    tools: {
        search: {
            description: 'Search all people by name, tag, workplace, or any field. Returns matching people.',
            params: { q: 'search term' },
            run: function (p) {
                var q = (p.q || '').toLowerCase();
                if (!q) return { count: 0, list: [] };
                var r = pazatorData.humans.filter(function (h) { return JSON.stringify(h).toLowerCase().includes(q); });
                return { count: r.length, list: r.map(function (h) { return { id: h.id, name: h.name, threat: h.threatLevel || 'None', credit: h.credit, tags: h.tags || [] }; }) };
            }
        },
        get: {
            description: 'Get full details of one person by ID or exact name.',
            params: { id: 'person ID', name: 'or exact name' },
            run: function (p) {
                var person = null;
                if (p.id) person = pazatorData.humans.find(function (h) { return String(h.id) === String(p.id); });
                if (!person && p.name) person = pazatorData.humans.find(function (h) { return h.name.toLowerCase() === (p.name || '').toLowerCase(); });
                return person || { not_found: true };
            }
        },
        list: {
            description: 'Get a lightweight list of all people (names, threat level, credit).',
            params: {},
            run: function () {
                return { total: pazatorData.humans.length, people: pazatorData.humans.map(function (h) { return { id: h.id, name: h.name, threat: h.threatLevel || 'None', credit: h.credit }; }) };
            }
        },
        stats: {
            description: 'Get database stats: counts, threat distribution, average credit.',
            params: {},
            run: function () {
                var humans = pazatorData.humans;
                var threatCounts = { None: 0, Low: 0, Medium: 0, High: 0, Critical: 0 };
                var totalCredit = 0;
                for (var i = 0; i < humans.length; i++) {
                    var t = humans[i].threatLevel || 'None';
                    if (threatCounts[t] !== undefined) threatCounts[t]++;
                    totalCredit += (humans[i].credit || 185);
                }
                return {
                    humans: humans.length,
                    entities: pazatorData.others.length,
                    cases: cases.length,
                    tags: (tags || []).length,
                    threats: threatCounts,
                    avgCredit: humans.length > 0 ? Math.round(totalCredit / humans.length) : 0
                };
            }
        }
    },

    run: function (name, params) {
        var t = this.tools[name];
        if (!t) return { error: 'unknown tool "' + name + '". Valid tools: search(q), get(id/name), list, stats' };
        try { return t.run(params || {}); } catch (e) { return { error: e.message }; }
    }
};

function seedPlaceholderData() {
    if (pazatorData.humans.length > 0 || pazatorData.others.length > 0) return;

    var firstNames = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Christopher', 'Karen', 'Daniel', 'Lisa', 'Matthew', 'Nancy', 'Anthony', 'Betty', 'Mark', 'Margaret', 'Donald', 'Sandra', 'Steven', 'Ashley', 'Andrew', 'Kimberly', 'Paul', 'Emily', 'Joshua', 'Donna', 'Kenneth', 'Michelle'];
    var lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Hill', 'Green', 'Adams'];
    var workplaces = ['Apex Systems', 'BlueCore LLC', 'City Hospital', 'Delta Corp', 'Edge Networks', 'First National Bank', 'Global Trade Co', 'Horizon Group', 'Iron Mountain', 'Junction LLC', 'Keystone Inc', 'Liberty Mutual', 'Meridian Corp', 'North Star Ltd', 'Omega Dynamics', 'Pinnacle Group', 'Quantum Labs', 'RidgePoint Inc', 'Summit Partners', 'Titan Industries', 'Unity Health', 'Vertex Solutions', 'Westfield Corp', 'Xenon Technologies', 'Zenith Group', 'Atlas Corp', 'Brickstone Ltd', 'Crestview Partners', 'Dover Solutions', 'Elm Street Ventures', 'Fairfield Inc', 'Grand River Co', 'Highland Associates', 'Island Pacific', 'Jade Systems', 'Kingsley Corp'];
    var nationalities = ['American', 'British', 'Canadian', 'Australian', 'German', 'French', 'Italian', 'Spanish', 'Mexican', 'Brazilian', 'Indian', 'Chinese', 'Japanese', 'South Korean', 'Nigerian', 'Egyptian', 'Turkish', 'Russian', 'Swedish', 'Dutch'];
    var religions = ['Christianity', 'Islam', 'Hinduism', 'Buddhism', 'Judaism', 'Sikhism', 'Not specified'];
    var tags = ['professional', 'high-value', 'flagged', 'regular', 'trusted', 'high-risk', 'vip', 'suspicious', 'new', 'returning', 'verified', 'pending-review', 'local', 'international', 'government', 'contractor'];
    var threatLevels = ['None', 'None', 'None', 'None', 'Low', 'Low', 'Medium', 'High', 'Critical'];
    var socialClasses = ['low class', 'medium class', 'medium class', 'medium class', 'high class', 'high class', '1%'];
    var immigrationStatuses = ['Citizen', 'Citizen', 'Citizen', 'Permanent Resident', 'Visa Holder', 'Refugee'];

    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function randBetween(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

    function generatePersonId(name, birthDate) {
        var n = (name || 'x').substring(0, 4).toLowerCase();
        var d = birthDate ? birthDate.replace(/-/g, '') : '0000';
        return 'p_' + n + '_' + d + '_' + Date.now().toString(36);
    }

    for (var i = 0; i < 40; i++) {
        var firstName = pick(firstNames);
        var lastName = pick(lastNames);
        var name = firstName + ' ' + lastName;
        var year = randBetween(1960, 2000);
        var month = String(randBetween(1, 12)).padStart(2, '0');
        var day = String(randBetween(1, 28)).padStart(2, '0');
        var birthDate = year + '-' + month + '-' + day;
        var threatLevel = pick(threatLevels);
        var credit = threatLevel === 'Critical' ? randBetween(30, 90) : threatLevel === 'High' ? randBetween(60, 130) : threatLevel === 'Medium' ? randBetween(100, 190) : threatLevel === 'Low' ? randBetween(160, 250) : randBetween(180, 300);

        var personTags = [pick(tags)];
        if (threatLevel === 'High' || threatLevel === 'Critical') personTags.push('flagged', 'high-risk');
        if (credit > 250) personTags.push('high-value', 'verified');
        if (credit < 100) personTags.push('flagged');

        var familyCount = randBetween(0, 3);
        var family = [];
        for (var f = 0; f < familyCount; f++) {
            var fn = pick(firstNames) + ' ' + pick(lastNames);
            var existing = pazatorData.humans.find(function (h) { return h.name === fn; });
            family.push(existing ? existing.id : fn);
        }

        var human = {
            id: generatePersonId(name, birthDate),
            name: name,
            gender: pick(['Male', 'Female']),
            birthDate: birthDate,
            workplace: pick(workplaces),
            credit: credit,
            threatLevel: threatLevel,
            socialClass: pick(socialClasses),
            maritalStatus: pick(['Single', 'Married', 'Married', 'Divorced']),
            nationality: pick(nationalities),
            immigrationStatus: pick(immigrationStatuses),
            tags: personTags,
            friends: [],
            family: family,
            extraNotes: ''
        };
        pazatorData.humans.push(human);
    }

    var orgNames = ['Delta Corp', 'Apex Systems', 'Global Trade Co', 'City Hospital', 'First National Bank', 'Quantum Labs', 'Zenith Group', 'Summit Partners', 'Titan Industries', 'Liberty Mutual'];
    var orgTypes = ['Corporation', 'Non-profit', 'Government Agency', 'Educational Institution', 'Healthcare Provider', 'Financial Services'];

    for (var o = 0; o < 10; o++) {
        pazatorData.others.push({
            id: 'org_' + Date.now() + '_' + o,
            name: orgNames[o] || 'Organization ' + (o + 1),
            note: 'A ' + pick(orgTypes).toLowerCase() + ' specializing in ' + pick(['technology', 'finance', 'healthcare', 'logistics', 'consulting', 'manufacturing']) + '.'
        });
    }

    if (!tags || tags.length === 0) {
        window.tags = ['professional', 'high-value', 'flagged', 'regular', 'trusted', 'high-risk', 'vip', 'suspicious', 'new', 'verified', 'local', 'international', 'government', 'contractor'];
    }

    if (typeof saveData === 'function') saveData();
    if (typeof renderObjectCanvas === 'function') renderObjectCanvas();
    if (typeof renderTags === 'function') renderTags();
    console.log('[Seed] Added ' + pazatorData.humans.length + ' people and ' + pazatorData.others.length + ' entities');
}

async function wipeAllData() {
    var ok = await showConfirm('Wipe all entries, cases, tags, and chat history? API key and settings will be preserved. This cannot be undone.', 'Wipe All Data', 'warning');
    if (!ok) return;

    var preserveKeys = ['pazator_ai_provider', 'pazator_ai_gemini_api_key', 'pazator_ai_gemini_model', 'pazator_ai_deepseek_api_key', 'pazator_ai_deepseek_model', 'pz_passwordEnabled', 'pz_passwordHash', 'skipIntro', 'noBlur', 'classificationState', 'adminProvidedContext'];

    pazatorData.humans = [];
    pazatorData.others = [];
    pazatorData.cases = [];
    pazatorData.chats = [];
    pazatorData.relationships = [];
    pazatorData.timeline = [];
    if (Array.isArray(tags)) tags.length = 0;
    if (Array.isArray(cases)) cases.length = 0;

    for (var i = localStorage.length - 1; i >= 0; i--) {
        var key = localStorage.key(i);
        if (key && preserveKeys.indexOf(key) === -1) {
            localStorage.removeItem(key);
        }
    }

    if (window.pazatorStore && typeof pazatorStore.clearAll === 'function') {
        pazatorStore.clearAll();
    }
    if (window.pazatorRelationships && typeof pazatorRelationships.clear === 'function') {
        pazatorRelationships.clear();
    }
    if (window.pazatorTimeline && typeof pazatorTimeline.clear === 'function') {
        pazatorTimeline.clear();
    }

    try {
        var req = indexedDB.deleteDatabase('PazatorDB');
    } catch (e) {}
    try {
        var req2 = indexedDB.deleteDatabase('PazatorV2');
    } catch (e) {}

    if (typeof saveData === 'function') saveData();
    if (typeof renderObjectCanvas === 'function') renderObjectCanvas();
    if (typeof renderTags === 'function') renderTags();
    if (typeof updateHeaderStats === 'function') updateHeaderStats();
    if (typeof updateCreditStats === 'function') updateCreditStats();
    if (typeof renderCasesList === 'function') renderCasesList();

    var resultsEl = document.getElementById('intelResults');
    if (resultsEl) resultsEl.style.display = 'none';
    var countBadge = document.getElementById('intelResultsCount');
    if (countBadge) countBadge.textContent = '0 findings';
    var findingsCountEl = document.getElementById('intelFindingsCount');
    if (findingsCountEl) findingsCountEl.textContent = '0';

    showFloatingNotification('All data wiped. API key and settings preserved.', 'info');
}
