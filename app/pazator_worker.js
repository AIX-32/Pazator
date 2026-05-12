self.onmessage = function (e) {
    var msg = e.data;
    var type = msg.type || '';

    try {
        switch (type) {
            case 'parse_csv':
                handleParseCSV(msg);
                break;
            case 'calculate_credits':
                handleCalculateCredits(msg);
                break;
            case 'find_connections':
                handleFindConnections(msg);
                break;
            case 'deduplicate_chats':
                handleDeduplicateChats(msg);
                break;
            case 'search':
                handleSearch(msg);
                break;
            default:
                self.postMessage({ id: msg.id, error: 'Unknown task type: ' + type });
        }
    } catch (err) {
        self.postMessage({ id: msg.id, error: err.message });
    }
};

function handleParseCSV(msg) {
    var text = msg.text || '';
    var lines = text.split('\n').filter(function (l) { return l.trim(); });
    if (lines.length === 0) {
        self.postMessage({ id: msg.id, result: { headers: [], rows: [] } });
        return;
    }
    var headers = parseCSVLine(lines[0]);
    var rows = [];
    for (var i = 1; i < lines.length; i++) {
        var row = parseCSVLine(lines[i]);
        if (row.length === headers.length) {
            var obj = {};
            for (var j = 0; j < headers.length; j++) {
                obj[headers[j].trim().toLowerCase()] = row[j].trim();
            }
            rows.push(obj);
        }
    }
    self.postMessage({ id: msg.id, result: { headers: headers, rows: rows, total: lines.length - 1 } });
}

function parseCSVLine(line) {
    var result = [];
    var current = '';
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                result.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
    }
    result.push(current);
    return result;
}

function handleCalculateCredits(msg) {
    var humans = msg.humans || [];
    var results = humans.map(function (h) {
        var credit = calculateCreditScore(h);
        return { id: h.id, credit: credit };
    });
    self.postMessage({ id: msg.id, result: results });
}

function calculateCreditScore(human) {
    if (!human) return 185;
    var score = 185;
    if (human.threatLevel === 'Critical') score -= 80;
    else if (human.threatLevel === 'High') score -= 50;
    else if (human.threatLevel === 'Medium') score -= 20;
    else if (human.threatLevel === 'Low') score -= 5;

    if (human.socialClass === '1%') score += 40;
    else if (human.socialClass === 'high class') score += 25;
    else if (human.socialClass === 'medium class') score += 10;
    else if (human.socialClass === 'low class') score -= 10;

    if (human.educationLevel) {
        var edu = human.educationLevel.toLowerCase();
        if (edu.includes('doctor') || edu.includes('phd') || edu.includes('post-doctor')) score += 30;
        else if (edu.includes('master') || edu.includes('graduate')) score += 20;
        else if (edu.includes('bachelor') || edu.includes('undergraduate')) score += 10;
        else if (edu.includes('none') || edu.includes('no formal')) score -= 15;
    }
    if (human.incomeLevel) {
        var inc = human.incomeLevel.toLowerCase();
        if (inc === 'wealthy') score += 35;
        else if (inc === 'high') score += 25;
        else if (inc === 'upper middle') score += 15;
        else if (inc === 'middle') score += 5;
        else if (inc === 'low') score -= 10;
        else if (inc === 'below poverty') score -= 25;
    }
    if (human.immigrationStatus) {
        var imm = human.immigrationStatus.toLowerCase();
        if (imm === 'citizen') score += 10;
        else if (imm === 'permanent resident') score += 5;
        else if (imm === 'visa holder') score -= 5;
        else if (imm === 'asylum seeker' || imm === 'refugee') score -= 15;
        else if (imm === 'undocumented') score -= 25;
    }
    return Math.max(0, Math.min(370, Math.round(score)));
}

function handleFindConnections(msg) {
    var humans = msg.humans || [];
    var name = (msg.personName || '').toLowerCase();
    var people = name
        ? humans.filter(function (h) { return h.name && h.name.toLowerCase().includes(name); })
        : humans;
    var connections = [];
    var limit = Math.min(people.length, 20);
    for (var i = 0; i < limit; i++) {
        for (var j = i + 1; j < limit; j++) {
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
    self.postMessage({ id: msg.id, result: { count: connections.length, connections: connections.slice(0, 20) } });
}

function handleDeduplicateChats(msg) {
    var chats = msg.chats || [];
    var seen = new Set();
    var unique = [];
    var removed = 0;
    for (var i = 0; i < chats.length; i++) {
        var chat = chats[i];
        var key = (chat.source || '') + '|' + (chat.content || '').substring(0, 200);
        if (seen.has(key)) {
            removed++;
        } else {
            seen.add(key);
            unique.push(chat);
        }
    }
    self.postMessage({ id: msg.id, result: { unique: unique, removed: removed } });
}

function handleSearch(msg) {
    var data = msg.data || [];
    var query = (msg.query || '').toLowerCase();
    var fields = msg.fields || ['name', 'extraNotes', 'notes', 'workplace', 'occupation', 'nationality', 'tags'];
    var results = [];
    for (var i = 0; i < data.length; i++) {
        var item = data[i];
        var match = false;
        for (var fi = 0; fi < fields.length; fi++) {
            var val = item[fields[fi]];
            if (val) {
                if (Array.isArray(val)) {
                    for (var vi = 0; vi < val.length; vi++) {
                        if (String(val[vi]).toLowerCase().includes(query)) { match = true; break; }
                    }
                } else if (String(val).toLowerCase().includes(query)) {
                    match = true; break;
                }
            }
            if (match) break;
        }
        if (match) results.push(item);
    }
    self.postMessage({ id: msg.id, result: results, total: results.length });
}
