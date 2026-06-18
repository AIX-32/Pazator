const contextModal = document.getElementById('contextModal');
const cancelContextBtn = document.getElementById('cancelContextBtn');
const applyContextBtn = document.getElementById('applyContextBtn');
const contextNotes = document.getElementById('contextNotes');

document.getElementById('addContextOption')?.addEventListener('click', () => {
    chatOptionsMenu.classList.remove('active');

    loadContextData();
    contextModal.style.display = 'flex';
    contextModal.style.zIndex = '1005';
    contextModal.style.visibility = 'visible';
    contextModal.style.opacity = '1';
    contextModal.style.pointerEvents = 'auto';

    aiChatModal.style.pointerEvents = 'none';
});

function loadContextData() {
    loadContextPeople();
    loadContextChats();
    loadContextIntel();
    loadContextLogbook();
    loadContextCases();
    loadContextEntities();
    loadContextReports();
    contextNotes.value = '';
}

var _selectedContextPeople = [];

function loadContextPeople() {
    const container = document.getElementById('contextPeople');

    if (pazatorData.humans.length === 0) {
        container.innerHTML = '<p style="color: #777; text-align: center;">No people in database</p>';
        return;
    }

    _selectedContextPeople = [];
    container.innerHTML = '';

    var slot = document.createElement('div');
    slot.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);cursor:pointer;transition:all 0.15s;min-height:40px;margin-bottom:8px;';
    slot.innerHTML = '<span style="color:#444;font-size:0.8rem;">Search people...</span>';
    slot.addEventListener('mouseenter', function () { slot.style.borderColor = 'rgba(77,157,224,0.25)'; slot.style.background = 'rgba(77,157,224,0.04)'; });
    slot.addEventListener('mouseleave', function () { slot.style.borderColor = 'rgba(255,255,255,0.06)'; slot.style.background = 'rgba(255,255,255,0.02)'; });
    slot.addEventListener('click', function () {
        if (window.PazatorUI && window.PazatorUI.showEntityPicker) {
            PazatorUI.showEntityPicker({
                title: 'Add Person to Context',
                typeFilter: 'Person',
                zIndex: '1006',
                onSelect: function (id, name, obj) {
                    if (!_selectedContextPeople.some(function (p) { return p.id === id; })) {
                        var human = pazatorData.humans.find(function (h) { return h.id === id; });
                        if (human) {
                            _selectedContextPeople.push({
                                id: human.id,
                                name: human.name,
                                credit: human.credit,
                                extraNotes: human.extraNotes
                            });
                            renderContextPeopleChips();
                        }
                    }
                }
            });
        }
    });
    container.appendChild(slot);

    var chips = document.createElement('div');
    chips.id = 'contextPeopleChips';
    chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    container.appendChild(chips);
}

function renderContextPeopleChips() {
    var chips = document.getElementById('contextPeopleChips');
    if (!chips) return;
    chips.innerHTML = '';
    _selectedContextPeople.forEach(function (p) {
        var chip = document.createElement('span');
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;background:rgba(77,157,224,0.15);border:1px solid rgba(77,157,224,0.25);font-size:0.7rem;color:#ccc;';
        chip.innerHTML = '<span>' + escapeHtml(p.name) + '</span><span style="cursor:pointer;color:#888;font-size:0.8rem;padding:0 2px;" data-id="' + p.id + '">&times;</span>';
        chip.querySelector('[data-id]').addEventListener('click', function (e) {
            e.stopPropagation();
            _selectedContextPeople = _selectedContextPeople.filter(function (x) { return x.id !== p.id; });
            renderContextPeopleChips();
        });
        chips.appendChild(chip);
    });
    if (_selectedContextPeople.length > 0) {
        chips.style.display = 'flex';
    }
}

function loadContextChats() {
    const container = document.getElementById('contextChats');
    const chatHistory = ChatStorageManager.getChatHistory();

    if (chatHistory.length === 0) {
        container.innerHTML = '<p style="color: #777; text-align: center;">No chats uploaded yet</p>';
        return;
    }

    container.innerHTML = '';

    chatHistory.forEach(function (chat, index) {
        var div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.marginBottom = '4px';
        div.style.padding = '5px 8px';
        div.style.borderRadius = '4px';
        div.style.background = 'rgba(40, 40, 40, 0.5)';
        div.style.cursor = 'pointer';
        div.style.transition = 'all 0.2s ease';

        var date = new Date(chat.timestamp).toLocaleDateString();
        var participants = (chat.participants || []).map(function (p) { return p.name; }).join(', ');
        var messageCount = chat.parsed && chat.parsed.messageCount ? chat.parsed.messageCount : (chat.content ? chat.content.split(' ').length : 0);

        div.innerHTML = [
            '<input type="checkbox" id="context_chat_' + index + '" value="' + index + '" style="margin-right:6px;flex-shrink:0;">',
            '<label for="context_chat_' + index + '" style="flex:1;cursor:pointer;font-size:0.75rem;">',
            '  <strong>' + (chat.source || 'Unknown').toUpperCase() + '</strong>',
            '  <br><span style="color:#888;font-size:0.7rem;">' + escapeHtml(participants) + ' · ' + messageCount + ' msgs · ' + date + '</span>',
            '</label>'
        ].join('');

        div.addEventListener('mouseenter', function () { div.style.background = 'rgba(60, 60, 60, 0.6)'; });
        div.addEventListener('mouseleave', function () { div.style.background = 'rgba(40, 40, 40, 0.5)'; });

        container.appendChild(div);
    });
}

function loadContextIntel() {
    const container = document.getElementById('contextIntel');
    container.innerHTML = '';

    const fraudLogs = JSON.parse(localStorage.getItem('fraudLogs') || '[]');
    const terroristLogs = JSON.parse(localStorage.getItem('terroristLogs') || '[]');
    var tideThreats = [];
    var tideFraud = [];
    try {
        tideThreats = JSON.parse(localStorage.getItem('previousThreats') || '[]');
        tideFraud = JSON.parse(localStorage.getItem('previousFraud') || '[]');
    } catch (e) {}

    var allLogs = [].concat(fraudLogs, terroristLogs, tideThreats, tideFraud);
    allLogs.sort(function (a, b) { return new Date(b.timestamp || 0) - new Date(a.timestamp || 0); });

    if (allLogs.length === 0) {
        container.innerHTML = '<p style="color: #777; text-align: center; font-size:0.8rem;">No intel findings yet</p>';
        return;
    }

    allLogs.forEach(function (log) {
        var div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.marginBottom = '4px';
        div.style.padding = '5px 8px';
        div.style.borderRadius = '4px';
        div.style.background = 'rgba(40, 40, 40, 0.5)';
        div.style.cursor = 'pointer';
        div.style.transition = 'all 0.2s ease';

        var label = log.type || log.title || 'Finding';
        var person = log.person || log.subject || 'Unknown';
        var date = log.timestamp ? new Date(log.timestamp).toLocaleDateString() : '';

        div.innerHTML = [
            '<input type="checkbox" class="ctx-intel-cb" value="' + (log.id || '') + '" style="margin-right:6px;flex-shrink:0;">',
            '<label style="flex:1;cursor:pointer;font-size:0.75rem;">',
            '  <strong>' + escapeHtml(label) + '</strong>',
            '  <br><span style="color:#888;font-size:0.7rem;">' + escapeHtml(person) + (date ? ' · ' + date : '') + '</span>',
            '</label>'
        ].join('');

        div.addEventListener('mouseenter', function () { div.style.background = 'rgba(60, 60, 60, 0.6)'; });
        div.addEventListener('mouseleave', function () { div.style.background = 'rgba(40, 40, 40, 0.5)'; });
        container.appendChild(div);
    });
}

function loadContextLogbook() {
    var container = document.getElementById('contextLogbook');
    container.innerHTML = '';
    var entries = typeof pazatorLogbook !== 'undefined' && pazatorLogbook.getEntries ? pazatorLogbook.getEntries() : [];
    if (!entries.length) {
        container.innerHTML = '<p style="color: #777; text-align: center; font-size:0.8rem;">No logbook entries</p>';
        return;
    }
    entries.forEach(function (e) {
        var div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.marginBottom = '4px';
        div.style.padding = '5px 8px';
        div.style.borderRadius = '4px';
        div.style.background = 'rgba(40, 40, 40, 0.5)';
        div.style.cursor = 'pointer';
        div.style.transition = 'all 0.2s ease';
        var date = e.createdAt ? new Date(e.createdAt).toLocaleDateString() : '';
        div.innerHTML = [
            '<input type="checkbox" class="ctx-logbook-cb" value="' + e.id + '" style="margin-right:6px;flex-shrink:0;">',
            '<label style="flex:1;cursor:pointer;font-size:0.75rem;">',
            '  <strong>' + escapeHtml(e.title || 'Untitled') + '</strong>',
            '  <br><span style="color:#888;font-size:0.7rem;">' + (e.category || 'general') + (date ? ' · ' + date : '') + '</span>',
            '</label>'
        ].join('');
        div.addEventListener('mouseenter', function () { div.style.background = 'rgba(60, 60, 60, 0.7)'; });
        div.addEventListener('mouseleave', function () { div.style.background = 'rgba(40, 40, 40, 0.7)'; });
        container.appendChild(div);
    });
}

function loadContextCases() {
    var container = document.getElementById('contextCases');
    container.innerHTML = '';
    if (typeof cases === 'undefined' || !cases.length) {
        container.innerHTML = '<p style="color: #777; text-align: center; font-size:0.8rem;">No cases created yet</p>';
        return;
    }
    cases.forEach(function (c) {
        var div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.marginBottom = '4px';
        div.style.padding = '5px 8px';
        div.style.borderRadius = '4px';
        div.style.background = 'rgba(40, 40, 40, 0.5)';
        div.style.cursor = 'pointer';
        div.style.transition = 'all 0.2s ease';
        var entityCount = (c.entities ? c.entities.length : 0) + (c.evidence ? c.evidence.length : 0);
        var date = c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '';
        div.innerHTML = [
            '<input type="checkbox" class="ctx-case-cb" value="' + c.id + '" style="margin-right:6px;flex-shrink:0;">',
            '<label style="flex:1;cursor:pointer;font-size:0.75rem;">',
            '  <strong>' + escapeHtml(c.title || c.name || 'Untitled Case') + '</strong>',
            '  <br><span style="color:#888;font-size:0.7rem;">' + (c.status || 'open') + ' · ' + entityCount + ' items' + (date ? ' · ' + date : '') + '</span>',
            '</label>'
        ].join('');
        div.addEventListener('mouseenter', function () { div.style.background = 'rgba(60, 60, 60, 0.7)'; });
        div.addEventListener('mouseleave', function () { div.style.background = 'rgba(40, 40, 40, 0.7)'; });
        container.appendChild(div);
    });
}

function loadContextEntities() {
    var container = document.getElementById('contextEntities');
    container.innerHTML = '';
    var others = pazatorData && pazatorData.others ? pazatorData.others : [];
    if (!others.length) {
        container.innerHTML = '<p style="color: #777; text-align: center; font-size:0.8rem;">No other entities created yet</p>';
        return;
    }
    others.forEach(function (o) {
        var div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.marginBottom = '4px';
        div.style.padding = '5px 8px';
        div.style.borderRadius = '4px';
        div.style.background = 'rgba(40, 40, 40, 0.5)';
        div.style.cursor = 'pointer';
        div.style.transition = 'all 0.2s ease';
        div.innerHTML = [
            '<input type="checkbox" class="ctx-entity-cb" value="' + o.id + '" style="margin-right:6px;flex-shrink:0;">',
            '<label style="flex:1;cursor:pointer;font-size:0.75rem;">',
            '  <strong>' + escapeHtml(o.name || o.id || 'Unnamed') + '</strong>',
            '  <br><span style="color:#888;font-size:0.7rem;">' + (o.objectType || 'entity') + (o.note ? ' · ' + escapeHtml(o.note.substring(0, 40)) : '') + '</span>',
            '</label>'
        ].join('');
        div.addEventListener('mouseenter', function () { div.style.background = 'rgba(60, 60, 60, 0.7)'; });
        div.addEventListener('mouseleave', function () { div.style.background = 'rgba(40, 40, 40, 0.7)'; });
        container.appendChild(div);
    });
}

function loadContextReports() {
    var container = document.getElementById('contextReports');
    container.innerHTML = '';
    var raw;
    try { raw = localStorage.getItem('pazator_analysis_reports'); } catch (e) {}
    var reports = raw ? (JSON.parse(raw).reports || JSON.parse(raw)) : [];
    if (!Array.isArray(reports)) reports = [];
    if (!reports.length) {
        container.innerHTML = '<p style="color: #777; text-align: center; font-size:0.8rem;">No saved reports</p>';
        return;
    }
    reports.forEach(function (r) {
        var div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.marginBottom = '4px';
        div.style.padding = '5px 8px';
        div.style.borderRadius = '4px';
        div.style.background = 'rgba(40, 40, 40, 0.5)';
        div.style.cursor = 'pointer';
        div.style.transition = 'all 0.2s ease';
        var date = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '';
        var findCount = r.findings ? r.findings.length : 0;
        div.innerHTML = [
            '<input type="checkbox" class="ctx-report-cb" value="' + (r.id || '') + '" style="margin-right:6px;flex-shrink:0;">',
            '<label style="flex:1;cursor:pointer;font-size:0.75rem;">',
            '  <strong>' + escapeHtml(r.title || r.analysisType || 'Report') + '</strong>',
            '  <br><span style="color:#888;font-size:0.7rem;">' + findCount + ' findings' + (date ? ' · ' + date : '') + '</span>',
            '</label>'
        ].join('');
        div.addEventListener('mouseenter', function () { div.style.background = 'rgba(60, 60, 60, 0.7)'; });
        div.addEventListener('mouseleave', function () { div.style.background = 'rgba(40, 40, 40, 0.7)'; });
        container.appendChild(div);
    });
}

cancelContextBtn.addEventListener('click', () => {
    contextModal.style.display = 'none';
    contextModal.style.zIndex = '-1';
    aiChatModal.style.pointerEvents = 'auto';
});

applyContextBtn.addEventListener('click', () => {
    const selectedContext = {
        people: [],
        chats: [],
        intel: [],
        logbook: [],
        cases: [],
        entities: [],
        reports: [],
        notes: contextNotes.value.trim(),
        timestamp: new Date().toISOString()
    };

    selectedContext.people = _selectedContextPeople.slice();

    const chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    document.querySelectorAll('#contextChats input[type="checkbox"]:checked').forEach(checkbox => {
        const chatIndex = parseInt(checkbox.value);
        if (chatHistory[chatIndex]) {
            selectedContext.chats.push(chatHistory[chatIndex]);
        }
    });

    document.querySelectorAll('#contextIntel .ctx-intel-cb:checked').forEach(cb => {
        var id = cb.value;
        var allIntel = [];
        try {
            JSON.parse(localStorage.getItem('fraudLogs') || '[]').forEach(function (l) { allIntel.push(l); });
            JSON.parse(localStorage.getItem('terroristLogs') || '[]').forEach(function (l) { allIntel.push(l); });
            JSON.parse(localStorage.getItem('previousThreats') || '[]').forEach(function (l) { allIntel.push(l); });
            JSON.parse(localStorage.getItem('previousFraud') || '[]').forEach(function (l) { allIntel.push(l); });
        } catch (e) {}
        var item = allIntel.find(function (l) { return l.id === id; });
        if (item) selectedContext.intel.push(item);
    });

    document.querySelectorAll('#contextLogbook .ctx-logbook-cb:checked').forEach(cb => {
        var entries = typeof pazatorLogbook !== 'undefined' && pazatorLogbook.getEntries ? pazatorLogbook.getEntries() : [];
        var item = entries.find(function (e) { return e.id === cb.value; });
        if (item) selectedContext.logbook.push(item);
    });

    document.querySelectorAll('#contextCases .ctx-case-cb:checked').forEach(cb => {
        if (typeof cases === 'undefined') return;
        var item = cases.find(function (c) { return c.id === cb.value; });
        if (item) selectedContext.cases.push(item);
    });

    document.querySelectorAll('#contextEntities .ctx-entity-cb:checked').forEach(cb => {
        var others = pazatorData && pazatorData.others ? pazatorData.others : [];
        var item = others.find(function (o) { return o.id === cb.value; });
        if (item) selectedContext.entities.push(item);
    });

    document.querySelectorAll('#contextReports .ctx-report-cb:checked').forEach(cb => {
        var raw;
        try { raw = localStorage.getItem('pazator_analysis_reports'); } catch (e) {}
        var reports = raw ? (JSON.parse(raw).reports || JSON.parse(raw)) : [];
        if (!Array.isArray(reports)) reports = [];
        var item = reports.find(function (r) { return r.id === cb.value; });
        if (item) selectedContext.reports.push(item);
    });

    storeAIContext(selectedContext);

    updateContextDisplay(selectedContext);

    contextModal.style.display = 'none';
    contextModal.style.zIndex = '-1';
    aiChatModal.style.pointerEvents = 'auto';

    showAlert('Context applied! Selected: ' + selectedContext.people.length + ' people, ' + selectedContext.chats.length + ' chats, ' + selectedContext.intel.length + ' intel, ' + selectedContext.logbook.length + ' logbook, ' + selectedContext.cases.length + ' cases, ' + selectedContext.entities.length + ' entities, ' + selectedContext.reports.length + ' reports.', 'Context Updated', 'success');
});

function updateContextDisplay(context) {
    const contextDisplay = document.getElementById('contextDisplay');

    if (!contextDisplay) return;

    contextDisplay.innerHTML = '';

    const hasContext = context.people.length > 0 || context.chats.length > 0 || context.intel.length > 0 || context.logbook.length > 0 || context.cases.length > 0 || context.entities.length > 0 || context.reports.length > 0 || context.notes;

    if (!hasContext) {
        contextDisplay.style.display = 'none';
        return;
    }

    contextDisplay.style.display = 'flex';

    context.people.forEach(person => {
        const card = document.createElement('div');
        card.className = 'context-card people';
        card.innerHTML = '<span class="card-icon"></span><span class="card-name" title="' + escapeHtml(person.name) + '">' + escapeHtml(person.name) + '</span>';
        card.addEventListener('click', function () {
            showAlert('Person: ' + person.name + '\nCredit: ' + (person.credit !== undefined ? Math.round(person.credit) : 'N/A') + '\nNotes: ' + (person.extraNotes || 'None'), 'Person Details', 'info');
        });
        contextDisplay.appendChild(card);
    });

    context.chats.forEach(function (chat) {
        const card = document.createElement('div');
        card.className = 'context-card chats';
        const participants = (chat.participants || []).map(function (p) { return p.name; }).join(', ');
        const wordCount = chat.content ? chat.content.split(' ').length : 0;
        card.innerHTML = '<span class="card-icon"></span><span class="card-name" title="' + ((chat.source || 'Unknown').toUpperCase()) + ' Chat - ' + participants + '">' + (chat.source || 'Unknown').toUpperCase() + ' Chat (' + wordCount + ' words)</span>';
        card.addEventListener('click', function () {
            showAlert((chat.source || 'Unknown').toUpperCase() + ' Chat\nParticipants: ' + participants + '\nWords: ' + wordCount + '\nContext: ' + (chat.context || 'None'), 'Chat Details', 'info');
        });
        contextDisplay.appendChild(card);
    });

    context.intel.forEach(function (log) {
        const card = document.createElement('div');
        card.className = 'context-card fraud';
        card.innerHTML = '<span class="card-icon"><i class="fas fa-shield-alt"></i></span><span class="card-name" title="' + escapeHtml(log.type || log.title || 'Finding') + ' - ' + escapeHtml(log.person || log.subject || 'Unknown') + '">' + escapeHtml(log.type || log.title || 'Intel') + ' (' + escapeHtml(log.person || log.subject || 'Unknown') + ')</span>';
        card.addEventListener('click', function () {
            showAlert((log.type || log.title || 'Intel Finding') + '\nPerson: ' + (log.person || log.subject || 'Unknown') + '\nSeverity: ' + (log.severity || 'Unknown') + '\nEvidence: ' + (log.evidence || 'None'), 'Intel Finding Details', 'warning');
        });
        contextDisplay.appendChild(card);
    });

    context.logbook.forEach(function (e) {
        const card = document.createElement('div');
        card.className = 'context-card';
        card.innerHTML = '<span class="card-icon"><i class="fas fa-book"></i></span><span class="card-name" title="' + escapeHtml(e.title || 'Untitled') + '">' + escapeHtml(e.title || 'Untitled') + '</span>';
        card.addEventListener('click', function () {
            showAlert('Logbook: ' + (e.title || 'Untitled') + '\nCategory: ' + (e.category || 'general') + '\n' + (e.body ? e.body.substring(0, 200) : ''), 'Logbook Entry', 'info');
        });
        contextDisplay.appendChild(card);
    });

    context.cases.forEach(function (c) {
        const card = document.createElement('div');
        card.className = 'context-card';
        card.innerHTML = '<span class="card-icon"><i class="fas fa-briefcase"></i></span><span class="card-name" title="' + escapeHtml(c.title || c.name || 'Case') + '">' + escapeHtml(c.title || c.name || 'Case') + '</span>';
        card.addEventListener('click', function () {
            showAlert('Case: ' + (c.title || c.name || 'Untitled') + '\nStatus: ' + (c.status || 'open') + '\nEntities: ' + (c.entities ? c.entities.length : 0), 'Case Details', 'info');
        });
        contextDisplay.appendChild(card);
    });

    context.entities.forEach(function (o) {
        const card = document.createElement('div');
        card.className = 'context-card';
        card.innerHTML = '<span class="card-icon"><i class="fas fa-building"></i></span><span class="card-name" title="' + escapeHtml(o.name || o.id || 'Entity') + '">' + escapeHtml(o.name || o.id || 'Entity') + '</span>';
        card.addEventListener('click', function () {
            showAlert('Entity: ' + (o.name || 'Unnamed') + '\nType: ' + (o.objectType || 'entity') + '\nNotes: ' + (o.note || 'None'), 'Entity Details', 'info');
        });
        contextDisplay.appendChild(card);
    });

    context.reports.forEach(function (r) {
        const card = document.createElement('div');
        card.className = 'context-card';
        card.innerHTML = '<span class="card-icon"><i class="fas fa-file-alt"></i></span><span class="card-name" title="' + escapeHtml(r.title || r.analysisType || 'Report') + '">' + escapeHtml(r.title || r.analysisType || 'Report') + '</span>';
        card.addEventListener('click', function () {
            showAlert('Report: ' + (r.title || r.analysisType || 'Untitled') + '\nFindings: ' + (r.findings ? r.findings.length : 0), 'Report Details', 'info');
        });
        contextDisplay.appendChild(card);
    });

    if (hasContext) {
        const clearBtn = document.createElement('div');
        clearBtn.className = 'context-card';
        clearBtn.style.backgroundColor = 'rgba(200, 50, 50, 0.3)';
        clearBtn.style.borderColor = '#cc4444';
        clearBtn.innerHTML = '<span class="card-icon"><i class="fas fa-trash-alt"></i></span><span class="card-name">Clear All Context</span>';
        clearBtn.addEventListener('click', function () {
            localStorage.removeItem('adminProvidedContext');
            updateContextDisplay({ people: [], chats: [], intel: [], logbook: [], cases: [], entities: [], reports: [] });
        });
        contextDisplay.appendChild(clearBtn);
    }
}

function storeAIContext(context) {
    let contextSummary = 'Context provided by admin:\n\n';

    setTimeout(() => {
        localStorage.removeItem('adminProvidedContext');
    }, 300000);

    if (context.people && context.people.length > 0) {
        contextSummary += 'PEOPLE:\n';
        context.people.forEach(person => {
            contextSummary += '- ' + person.name + ' (Credit: ' + (person.credit !== undefined ? Math.round(person.credit) : 'N/A') + ')\n';
            if (person.extraNotes) contextSummary += '  Notes: ' + person.extraNotes + '\n';
        });
        contextSummary += '\n';
    }

    if (context.chats && context.chats.length > 0) {
        contextSummary += 'CHATS:\n';
        context.chats.forEach((chat, index) => {
            var partCount = chat.participants ? chat.participants.length : 0;
            var wordCount = chat.content ? chat.content.split(' ').length : 0;
            contextSummary += (index + 1) + '. ' + (chat.source || 'Unknown').toUpperCase() + ' chat with ' + partCount + ' participants (' + wordCount + ' words)\n';
        });
        contextSummary += '\n';
    }

    if (context.intel && context.intel.length > 0) {
        contextSummary += 'INTEL FINDINGS:\n';
        context.intel.forEach(log => {
            contextSummary += '- ' + (log.type || log.title || 'Finding') + ' (' + (log.person || log.subject || 'Unknown') + ')\n';
        });
        contextSummary += '\n';
    }

    if (context.logbook && context.logbook.length > 0) {
        contextSummary += 'LOGBOOK ENTRIES:\n';
        context.logbook.forEach(e => {
            contextSummary += '- ' + (e.title || 'Untitled') + ' [' + (e.category || 'general') + ']\n';
            if (e.body) contextSummary += '  Body: ' + e.body.substring(0, 150) + '\n';
        });
        contextSummary += '\n';
    }

    if (context.cases && context.cases.length > 0) {
        contextSummary += 'CASES:\n';
        context.cases.forEach(c => {
            contextSummary += '- ' + (c.title || c.name || 'Untitled') + ' (' + (c.status || 'open') + ')\n';
        });
        contextSummary += '\n';
    }

    if (context.entities && context.entities.length > 0) {
        contextSummary += 'ENTITIES:\n';
        context.entities.forEach(o => {
            contextSummary += '- ' + (o.name || 'Unnamed') + ' (' + (o.objectType || 'entity') + ')\n';
            if (o.note) contextSummary += '  Notes: ' + o.note.substring(0, 150) + '\n';
        });
        contextSummary += '\n';
    }

    if (context.reports && context.reports.length > 0) {
        contextSummary += 'SAVED REPORTS:\n';
        context.reports.forEach(r => {
            contextSummary += '- ' + (r.title || r.analysisType || 'Report') + ' (' + (r.findings ? r.findings.length : 0) + ' findings)\n';
        });
        contextSummary += '\n';
    }

    if (context.notes) {
        contextSummary += 'ADDITIONAL NOTES: ' + context.notes + '\n';
    }

    localStorage.setItem('adminProvidedContext', JSON.stringify({
        summary: contextSummary,
        data: context,
        timestamp: context.timestamp
    }));
}

function getAdminContext() {
    const storedContext = localStorage.getItem('adminProvidedContext');
    if (storedContext) {
        try {
            const context = JSON.parse(storedContext);
            return context.summary || '';
        } catch (e) {
            console.error('Error parsing admin context:', e);
            return '';
        }
    }
    return '';
}

askAIBtn.addEventListener('click', () => {

    const allModals = [typeModal, humanModal, otherModal, detailViewModal, classifyModal, document.getElementById('hiddenConnectionsModal')];
    allModals.forEach(modal => {
        if (modal) {
            modal.style.display = 'none';
            modal.style.zIndex = '-1';
        }
    });

    aiChatModal.style.display = 'flex';
    aiChatModal.style.zIndex = '1001';

    aiChatModal.style.visibility = 'visible';
    aiChatModal.style.opacity = '1';
    aiChatModal.style.pointerEvents = 'auto';

    updateChatHistoryPanel();

    if (aiChatHistory.length === 0 && aiChatMessages.children.length <= 1) {
        aiChatMessages.innerHTML = '<div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:40px 20px;text-align:center;"><i class="fas fa-brain" style="font-size:2.5rem;color:#555;margin-bottom:16px;"></i><h3 style="color:#aaa;margin:0 0 8px 0;">Ask Zor anything</h3><p style="color:#777;font-size:0.85rem;margin:0;max-width:300px;line-height:1.5;">Analyze data, find connections, create entries, or just ask questions about your intelligence.</p></div>';
    }

    setTimeout(function () {
        if (aiInput) aiInput.focus();
    }, 100);
});

document.getElementById('menuBtn')?.addEventListener('click', () => {
    const container = document.querySelector('.container');
    const threatsPanel = document.getElementById('threatsPanel');

    if (!threatsPanel) {
        console.warn('Threats panel not found');
        return;
    }

    if (threatsPanel.style.display === 'none' || threatsPanel.style.display === '') {
        threatsPanel.style.display = 'block';
        container?.classList.add('threats-split');

        loadPreviousFindings();
    } else {
        threatsPanel.style.display = 'none';
        container?.classList.remove('threats-split');
    }
});

document.querySelectorAll('.close').forEach(button => {
    button.addEventListener('click', (e) => {
        e.stopPropagation();

        const modal = button.closest('.modal') || button.closest('.detail-view') || button.closest('.ai-chat-modal');
        if (modal) {
            modal.classList.add('hiding');
            setTimeout(() => {
                modal.style.display = 'none';
                modal.style.zIndex = '-1';
                modal.classList.remove('hiding');
            }, 300);
        } else {

            [typeModal, humanModal, otherModal, detailViewModal, classifyModal, aiChatModal, document.getElementById('hiddenConnectionsModal')].forEach(modal => {
                if (modal && modal.style.display !== 'none') {
                    modal.classList.add('hiding');
                }
            });

            setTimeout(() => {
                typeModal.style.display = 'none';
                humanModal.style.display = 'none';
                otherModal.style.display = 'none';
                detailViewModal.style.display = 'none';
                classifyModal && (classifyModal.style.display = 'none');
                aiChatModal.style.display = 'none';
                document.getElementById('hiddenConnectionsModal').style.display = 'none';

                [typeModal, humanModal, otherModal, detailViewModal, classifyModal, aiChatModal, document.getElementById('hiddenConnectionsModal')].forEach(modal => {
                    modal.style.zIndex = '-1';
                    modal.classList.remove('hiding');
                });
            }, 300);
        }
    });
});

window.addEventListener('click', (event) => {
    const modals = [
        { element: typeModal, condition: event.target === typeModal },
        { element: humanModal, condition: event.target === humanModal },
        { element: otherModal, condition: event.target === otherModal },
        { element: detailViewModal, condition: event.target === detailViewModal },
        { element: classifyModal, condition: event.target === classifyModal },
        { element: aiChatModal, condition: event.target === aiChatModal },
        { element: chatUploadModal, condition: event.target === chatUploadModal },
        { element: dataUploadModal, condition: event.target === dataUploadModal },
        { element: aiImportModal, condition: event.target === aiImportModal },
        { element: document.getElementById('hiddenConnectionsModal'), condition: event.target === document.getElementById('hiddenConnectionsModal') }
    ];

    modals.forEach(({ element, condition }) => {
        if (element && condition && element.style.display === 'flex') {
            element.classList.add('hiding');
            setTimeout(() => {
                element.style.display = 'none';
                element.style.zIndex = '-1';
                element.classList.remove('hiding');
            }, 300);
        }
    });

    [typeModal, humanModal, otherModal, detailViewModal, classifyModal, aiChatModal, chatUploadModal, dataUploadModal, aiImportModal, document.getElementById('hiddenConnectionsModal')].forEach(modal => {
        if (modal && modal.style.display === 'none') {
            modal.style.zIndex = '-1';
        }
    });
});

window.addEventListener('error', (event) => {
    console.error('Global error caught:', event.error);

    const errorMessage = event.error?.message || event.message || '';
    const isAIError = errorMessage.includes('AI') ||
        errorMessage.includes('geminiChat') ||
        errorMessage.includes('processAICommand') ||
        errorMessage.includes('handleAIAction') ||
        errorMessage.includes('extractJSONFromResponse');

    event.preventDefault();

    if (aiChatModal && aiChatModal.style.display === 'flex' && isAIError) {
        try {
            addMessageToAIChat("Sorry, I encountered an unexpected error. Please try rephrasing your request.", 'ai');
            __aiProcessing = false;
            if (typeof aiSendBtn !== 'undefined' && aiSendBtn) {
                setAiSendLoading(false);
            }
            if (aiInput) {
                aiInput.value = '';
            }
        } catch (e) {
            console.error('Error handling global error:', e);
        }
    }
});

document.getElementById('humanTypeBtn').addEventListener('click', () => {
    typeModal.style.display = 'none';
    initAcFields();
    resetAcFields();
    populateSelectOptions();
    humanModal.style.display = 'flex';
    humanModal.style.zIndex = '1000';
});

document.getElementById('otherTypeBtn').addEventListener('click', () => {
    typeModal.style.display = 'none';
    document.getElementById('otherModalTitle').textContent = 'Create Job / Company Entry';
    document.querySelector('#otherForm label[for="otherName"]').textContent = 'Company / Job Title';
    document.querySelector('#otherForm label[for="type"]').textContent = 'Industry / Role';
    document.querySelector('#otherForm label[for="otherNote"]').textContent = 'Company Notes';
    otherModal.style.display = 'flex';
    otherModal.style.zIndex = '1000';
});

document.getElementById('genericTypeBtn').addEventListener('click', () => {
    typeModal.style.display = 'none';
    document.getElementById('otherModalTitle').textContent = 'Create Custom Entry';
    document.querySelector('#otherForm label[for="otherName"]').textContent = 'Name';
    document.querySelector('#otherForm label[for="type"]').textContent = 'Category';
    document.querySelector('#otherForm label[for="otherNote"]').textContent = 'Notes';
    otherModal.style.display = 'flex';
    otherModal.style.zIndex = '1000';
});

document.getElementById('cancelHumanBtn').addEventListener('click', () => {
    humanModal.style.display = 'none';
    humanModal.style.zIndex = '-1';
    resetAcFields();
});

document.getElementById('cancelOtherBtn').addEventListener('click', () => {
    otherModal.style.display = 'none';
    otherModal.style.zIndex = '-1';
});

document.getElementById('closeDetail').addEventListener('click', () => {
    detailViewModal.classList.add('hiding');
    setTimeout(() => {
        detailViewModal.style.display = 'none';
        detailViewModal.style.zIndex = '-1';
        detailViewModal.classList.remove('hiding');
    }, 300);
});

document.getElementById('closeAIChat').addEventListener('click', () => {
    aiChatModal.classList.add('hiding');
    setTimeout(() => {
        aiChatModal.style.display = 'none';
        aiChatModal.style.zIndex = '-1';
        aiChatModal.classList.remove('hiding');
        aiChatModal.classList.remove('debug');
    }, 300);
});

document.getElementById('closeConnectionsModal').addEventListener('click', () => {
    const hiddenConnectionsModal = document.getElementById('hiddenConnectionsModal');
    hiddenConnectionsModal.style.display = 'none';
    hiddenConnectionsModal.style.zIndex = '-1';
});



document.getElementById('editEntryBtn').addEventListener('click', () => {
    const data = document.currentDetailData;
    if (!data) return;

    detailViewModal.style.display = 'none';
    detailViewModal.style.zIndex = '-1';

    if (data.type === 'human') {
        openHumanFormForEdit(data);
        humanModal.style.zIndex = '1000';
    } else {
        openOtherFormForEdit(data);
        otherModal.style.zIndex = '1000';
    }
});

document.getElementById('classifyEntryBtn')?.addEventListener('click', () => {
    const data = document.currentDetailData;
    if (!data) return;
    const entity = data.type === 'human'
        ? (pazatorData.humans || []).find(h => h.id === data.id)
        : (pazatorData.others || []).find(o => o.id === data.id);
    if (!entity) return;
    const username = window.pazatorSync ? window.pazatorSync.getCurrentUser()?.username || 'local' : 'local';
    window.pazatorClassification.showClassifyModal(entity, data.type, (levelId) => {
        if (levelId === 'unclassified') {
            window.pazatorClassification.removeClassification(entity);
        } else {
            window.pazatorClassification.assignClassification(entity, levelId, username);
        }
        if (window.pazatorStore && window.pazatorStore.markDirty) {
            window.pazatorStore.markDirty(data.type === 'human' ? 'humans' : 'others');
        }
        if (typeof refreshDetailView === 'function') {
            refreshDetailView();
        }
    });
});

document.getElementById('deleteEntryBtn').addEventListener('click', () => {
    deleteCurrentEntry();
});

document.getElementById('exportPdfBtn').addEventListener('click', async () => {
    console.log('Export PDF button clicked');
    const data = document.currentDetailData;
    console.log('Current detail data:', data);
    if (!data) {
        showAlert('No entry selected', 'Error', 'error');
        return;
    }

    if (data.type === 'human') {
        console.log('Calling exportHumanToPDF with id:', data.id);
        try {
            await exportHumanToPDF(data.id);
        } catch (err) {
            console.error('PDF export error:', err);
            showAlert('PDF export failed: ' + err.message, 'Error', 'error');
        }
    } else {
        showAlert('PDF export is only available for people entries', 'Notice', 'info');
    }
});

function updateSendButtonText(text) {
    const span = aiSendBtn.querySelector('.btn-icon-text');
    if (span) {
        span.textContent = text;
    } else {
        aiSendBtn.innerHTML = `<i class="fas fa-paper-plane"></i><span class="btn-icon-text">${text}</span>`;
    }
}

function updateImproveButtonText(text) {
    const span = aiImproveBtn.querySelector('.btn-icon-text');
    if (span) {
        span.textContent = text;
    } else {
        aiImproveBtn.innerHTML = `<i class="fas fa-wand"></i><span class="btn-icon-text">${text}</span>`;
    }
}

function displayAIChatNotification(message) {
    const notification = document.getElementById('aiNotification');
    const notificationText = document.getElementById('notificationText');

    if (notification && notificationText) {
        notificationText.textContent = message;
        notification.style.display = 'block';

        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }
}

function clearNotifications() {
    const notification = document.getElementById('aiNotification');
    if (notification) {
        notification.style.display = 'none';
    }
}

async function improvePrompt() {
    const originalPrompt = aiInput.value.trim();
    if (!originalPrompt) {
        addMessageToAIChat("Please enter a prompt to improve.", 'ai');
        return;
    }

    try {
        aiImproveBtn.disabled = true;
        aiSendBtn.disabled = true;

        displayAIChatNotification('Improving prompt...');

        const context = `
                    You are an expert prompt engineer. Your job is to improve prompts that will be used with another AI system.
                    You are NOT the AI that will fulfill the request - you are only improving the prompt for another AI to process.
                    
                    The prompt is for a data management application called Pazator where users manage human and other entries.
                    
                    Original prompt: ${originalPrompt}
                    
                    Your task is to enhance this prompt to make it more specific, detailed, and likely to produce better results.
                    Consider:
                    - Adding more context or specificity
                    - Clarifying ambiguous terms
                    - Making the request more structured
                    - Adding relevant details that might help achieve better results
                    - Ensuring the prompt is clear and actionable
                    
                    Return only the improved prompt, nothing else.
                `;

        const aiResponse = await geminiChat([
            { role: "system", content: context },
            { role: "user", content: `Please improve this prompt: ${originalPrompt}` }
        ]);

        const improvedPrompt = aiResponse.content ? aiResponse.content : aiResponse;

        aiInput.value = improvedPrompt;

        addMessageToAIChat("Prompt improved! You can now send the improved version or improve it again.", 'ai');
    } catch (error) {
        console.error('Error improving prompt:', error);
        addMessageToAIChat("Sorry, I encountered an error improving your prompt. Please try again.", 'ai');
    } finally {
        aiImproveBtn.disabled = false;
        updateImproveButtonText('');

        if (!aiSendBtn.disabled) {
            aiSendBtn.disabled = false;
        }

        aiInput.focus();
    }
}

document.getElementById('aiImproveBtn').addEventListener('click', () => {
    improvePrompt();
});

aiSendBtn.addEventListener('click', () => {
    if (__aiProcessing) {
        cancelCurrentAIRequest();
        return;
    }
    const command = aiInput.value.trim();
    if (command) {
        __aiProcessing = true;
        setAiSendLoading(true);

        requestAnimationFrame(() => {
            processAICommand(command);
        });
    }
});
