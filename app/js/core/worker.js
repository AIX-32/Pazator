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
            case 'graph_tick':
                handleGraphTick(msg);
                break;
            case 'heuristics_scan':
                handleHeuristicsScan(msg);
                break;
            case 'bulk_transform':
                handleBulkTransform(msg);
                break;
            case 'aggregate_stats':
                handleAggregateStats(msg);
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

function handleGraphTick(msg) {
    var nodes = msg.nodes || [];
    var edges = msg.edges || [];
    var width = msg.width || 800;
    var height = msg.height || 600;
    var iterations = msg.iterations || 50;
    var repulsion = msg.repulsion || 1000;
    var attraction = msg.attraction || 0.1;

    var positions = new Float64Array(nodes.length * 2);
    var velocities = new Float64Array(nodes.length * 2);
    for (var i = 0; i < nodes.length; i++) {
        positions[i * 2] = nodes[i].x || Math.random() * width;
        positions[i * 2 + 1] = nodes[i].y || Math.random() * height;
        velocities[i * 2] = 0;
        velocities[i * 2 + 1] = 0;
    }

    for (var iter = 0; iter < iterations; iter++) {
        var cooling = 1 - iter / iterations;

        for (var i = 0; i < nodes.length; i++) {
            var fx = 0, fy = 0;

            for (var j = 0; j < nodes.length; j++) {
                if (i === j) continue;
                var dx = positions[i * 2] - positions[j * 2];
                var dy = positions[i * 2 + 1] - positions[j * 2 + 1];
                var dist = Math.sqrt(dx * dx + dy * dy) || 1;
                var force = repulsion / (dist * dist);
                fx += (dx / dist) * force;
                fy += (dy / dist) * force;
            }

            for (var e = 0; e < edges.length; e++) {
                if (edges[e].source === i || edges[e].source === nodes[i].id) {
                    var targetIdx = edges[e].source === i ? edges[e].target : edges[e].source;
                    if (typeof targetIdx === 'string') {
                        for (var ni = 0; ni < nodes.length; ni++) {
                            if (nodes[ni].id === targetIdx) { targetIdx = ni; break; }
                        }
                    }
                    if (typeof targetIdx === 'number' && targetIdx >= 0 && targetIdx < nodes.length) {
                        var dx = positions[i * 2] - positions[targetIdx * 2];
                        var dy = positions[i * 2 + 1] - positions[targetIdx * 2 + 1];
                        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
                        fx -= dx * attraction * cooling;
                        fy -= dy * attraction * cooling;
                    }
                }
            }

            velocities[i * 2] = (velocities[i * 2] + fx) * cooling;
            velocities[i * 2 + 1] = (velocities[i * 2 + 1] + fy) * cooling;
            positions[i * 2] += velocities[i * 2];
            positions[i * 2 + 1] += velocities[i * 2 + 1];
        }
    }

    var result = [];
    for (var i = 0; i < nodes.length; i++) {
        result.push({
            id: nodes[i].id,
            x: Math.max(10, Math.min(width - 10, positions[i * 2])),
            y: Math.max(10, Math.min(height - 10, positions[i * 2 + 1]))
        });
    }
    self.postMessage({ id: msg.id, result: result });
}

function handleHeuristicsScan(msg) {
    var humans = msg.humans || [];
    var threshold = msg.threshold || 0.8;
    var matches = [];

    function normalizeName(name) {
        return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    }

    function nameSimilarity(a, b) {
        var na = normalizeName(a);
        var nb = normalizeName(b);
        if (!na || !nb) return 0;
        if (na === nb) return 1;
        var maxLen = Math.max(na.length, nb.length);
        if (maxLen === 0) return 0;
        var edits = 0;
        var minLen = Math.min(na.length, nb.length);
        for (var i = 0; i < minLen; i++) {
            if (na[i] !== nb[i]) edits++;
        }
        edits += Math.abs(na.length - nb.length);
        return 1 - edits / maxLen;
    }

    for (var i = 0; i < humans.length; i++) {
        for (var j = i + 1; j < humans.length; j++) {
            var a = humans[i], b = humans[j];
            var score = 0;
            var reasons = [];

            var nameSim = nameSimilarity(a.name, b.name);
            if (nameSim > 0.7) {
                score += nameSim * 0.4;
                reasons.push('name similarity: ' + (nameSim * 100).toFixed(0) + '%');
            }

            if (a.birthDate && b.birthDate && a.birthDate === b.birthDate) {
                score += 0.3;
                reasons.push('same birth date');
            }

            if (a.nationality && b.nationality && a.nationality.toLowerCase() === b.nationality.toLowerCase()) {
                score += 0.15;
                reasons.push('same nationality');
            }

            if (a.workplace && b.workplace && a.workplace.toLowerCase() === b.workplace.toLowerCase()) {
                score += 0.15;
                reasons.push('same workplace');
            }

            if (score >= threshold) {
                matches.push({
                    id_a: a.id, name_a: a.name,
                    id_b: b.id, name_b: b.name,
                    score: Math.min(1, score),
                    reasons: reasons
                });
            }
        }
    }

    matches.sort(function (x, y) { return y.score - x.score; });
    self.postMessage({ id: msg.id, result: { matches: matches, total: matches.length } });
}

function handleBulkTransform(msg) {
    var items = msg.items || [];
    var transform = msg.transform || '';

    var result;
    switch (transform) {
        case 'extract_tags':
            result = [];
            var allTags = {};
            for (var i = 0; i < items.length; i++) {
                var tags = items[i].tags;
                if (Array.isArray(tags)) {
                    for (var t = 0; t < tags.length; t++) {
                        allTags[tags[t]] = (allTags[tags[t]] || 0) + 1;
                    }
                }
            }
            var tagArr = [];
            for (var key in allTags) tagArr.push({ value: key, count: allTags[key] });
            tagArr.sort(function (a, b) { return b.count - a.count; });
            result = tagArr;
            break;
        case 'compute_age':
            result = items.map(function (item) {
                var age = 0;
                if (item.birthDate) {
                    var dob = new Date(item.birthDate);
                    if (!isNaN(dob.getTime())) {
                        var now = new Date();
                        age = now.getFullYear() - dob.getFullYear();
                        var mDiff = now.getMonth() - dob.getMonth();
                        if (mDiff < 0 || (mDiff === 0 && now.getDate() < dob.getDate())) age--;
                    }
                }
                return { id: item.id, age: Math.max(0, age) };
            });
            break;
        default:
            result = { error: 'Unknown transform: ' + transform };
    }
    self.postMessage({ id: msg.id, result: result });
}

function handleAggregateStats(msg) {
    var humans = msg.humans || [];
    var others = msg.others || [];

    var threatCounts = { None: 0, Low: 0, Medium: 0, High: 0, Critical: 0 };
    var creditRisk = { high: 0, medium: 0, low: 0 };
    var totalCredit = 0;

    for (var i = 0; i < humans.length; i++) {
        var h = humans[i];
        var t = h.threatLevel || 'None';
        threatCounts[t] = (threatCounts[t] || 0) + 1;

        var c = h.credit || 185;
        totalCredit += c;
        if (c < 125) creditRisk.high++;
        else if (c < 250) creditRisk.medium++;
        else creditRisk.low++;
    }

    var genderCounts = {};
    var nationalityCounts = {};
    for (var i = 0; i < humans.length; i++) {
        var h = humans[i];
        if (h.gender) genderCounts[h.gender] = (genderCounts[h.gender] || 0) + 1;
        if (h.nationality) nationalityCounts[h.nationality] = (nationalityCounts[h.nationality] || 0) + 1;
    }

    self.postMessage({
        id: msg.id,
        result: {
            totalHumans: humans.length,
            totalOthers: others.length,
            threatCounts: threatCounts,
            creditRisk: creditRisk,
            avgCredit: humans.length ? Math.round(totalCredit / humans.length) : 0,
            genderCounts: genderCounts,
            nationalityCounts: nationalityCounts,
            highRiskCount: creditRisk.high
        }
    });
}
