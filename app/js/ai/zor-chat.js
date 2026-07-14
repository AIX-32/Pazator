let __aiAbortController = null;
let __aiProcessing = false;
let __aiProcessingGuard = false;

function cancelCurrentAIRequest() {
    __aiProcessing = false;
    __aiProcessingGuard = false;
    if (window.AIQueue) {
        AIQueue.cancelAll();
    }
    if (__aiAbortController) {
        __aiAbortController.abort();
    }
    __aiAbortController = null;
    hideAiTypingIndicator();
    if (typeof aiSendBtn !== 'undefined' && aiSendBtn) {
        aiSendBtn.classList.remove('loading');
        setAiSendLoading(false);
    }
    if (typeof aiInput !== 'undefined' && aiInput) aiInput.focus();
    addMessageToAIChat('Request cancelled.', 'system');
}

function addMessageToAIChat(message, sender, entityInfo) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ${sender}`;

    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    messageDiv.appendChild(textSpan);

    let container = messageDiv;

    if (message && /api\s*key/i.test(message) && sender === 'ai') {
        const link = document.createElement('a');
        link.href = 'https://aistudio.google.com/api-keys';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'btn glass-btn';
        link.style.cssText = 'display:inline-block;margin-top:8px;padding:6px 12px;font-size:0.75rem;text-decoration:none;';
        link.innerHTML = '<i class="fas fa-key"></i> Get a free test API key';
        messageDiv.appendChild(link);
    }

    if (entityInfo && entityInfo.name) {
        container = document.createElement('div');
        container.className = `ai-message-container ${sender}`;
        container.appendChild(messageDiv);

        const btn = document.createElement('button');
        btn.className = 'ai-entity-link';
        btn.innerHTML = `<i class="fas fa-external-link-alt"></i> ${escapeHtml(entityInfo.name)}`;
        btn.onclick = function () { openDetailView(entityInfo.id, entityInfo.type); };
        container.appendChild(btn);
    }

    requestAnimationFrame(() => {
        aiChatMessages.appendChild(container);

        aiChatMessages.scrollTo({
            top: aiChatMessages.scrollHeight,
            behavior: 'smooth'
        });

        container.offsetHeight;
    });

    const role = sender === 'user' ? 'user' : 'assistant';
    aiChatHistory.push(entityInfo ? { role, content: message, entityInfo } : { role, content: message });
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str || ''));
    return d.innerHTML;
}

function addToolCallCard(action, result) {
    const card = document.createElement('div');
    card.className = 'ai-message tool';
    const actionName = action.action || 'tool';
    let detail = '';
    if (action.data && action.data.name) detail = action.data.name;
    else if (action.title) detail = action.title;
    const success = result && result.success !== false;
    let label = escapeHtml(actionName);
    if (detail) label += ' \u2014 ' + escapeHtml(detail);
    label += '  ' + (success ? '\u2713' : '\u2717');
    card.textContent = label;
    if (!success) {
        card.classList.add('tool-failed');
        card.style.borderColor = '#ff6b6b';
        card.style.cursor = 'pointer';
        const errMsg = result && result.message ? result.message : 'Action failed.';
        card.title = errMsg;
        card.addEventListener('click', function () {
            if (typeof showModal === 'function') {
                showModal({
                    title: 'Tool Failed: ' + actionName,
                    type: 'error',
                    html: '<div style="font-size:0.85rem;color:#ddd;"><strong>Action:</strong> ' + escapeHtml(actionName) + (detail ? '<br><strong>Detail:</strong> ' + escapeHtml(detail) : '') + '<br><br><strong>Error:</strong><br><div style="background:rgba(0,0,0,0.3);padding:10px;border-radius:6px;margin-top:4px;font-size:0.8rem;color:#ff6b6b;font-family:monospace;white-space:pre-wrap;">' + escapeHtml(errMsg) + '</div></div>',
                    buttons: [
                        { text: 'OK', primary: true }
                    ]
                });
            } else {
                showAlert(errMsg, 'Tool Failed', 'error');
            }
        });
    }
    requestAnimationFrame(function () {
        aiChatMessages.appendChild(card);
        aiChatMessages.scrollTo({ top: aiChatMessages.scrollHeight, behavior: 'smooth' });
    });
}

function saveCurrentChat() {
    if (aiChatHistory.length === 0) return;

    const existingChats = JSON.parse(localStorage.getItem('chatHistory') || '[]');

    const firstUserMsg = aiChatHistory.find(m => m.role === 'user')?.content || 'New Chat';
    const newChat = {
        title: String(firstUserMsg).substring(0, 30),
        messages: aiChatHistory.map(m => {
            const msg = { role: String(m.role), content: String(m.content || '') };
            if (m.entityInfo) msg.entityInfo = m.entityInfo;
            return msg;
        }),
        titleGenerated: false
    };

    existingChats.push(newChat);

    try {
        localStorage.setItem('chatHistory', JSON.stringify(existingChats));
    } catch (e) {
        console.error('Error saving chat:', e);
    }

    updateChatHistoryPanel();
    showFloatingNotification('Conversation saved', 'success');
}

document.getElementById('saveChatBtn').addEventListener('click', saveCurrentChat);

async function generateChatTitle(currentChat, existingChats) {
    const userMessage = currentChat.messages.find(m => m.role === 'user')?.content;
    const aiMessage = currentChat.messages.find(m => m.role === 'assistant')?.content;

    if (!userMessage) return;

    try {
        const shortContext = `Context: ${pazatorData.humans.length} humans, ${pazatorData.chats.length} chats. User asked: "${userMessage.substring(0, 200)}". Response: "${aiMessage?.substring(0, 100) || ''}".`;

        const aiResponse = await geminiChat([
            { role: "system", content: "Generate a very short 3-5 word title for this conversation. Just respond with the title, nothing else." },
            { role: "user", content: shortContext }
        ]);

        currentChat.title = aiResponse.content ? aiResponse.content.trim().substring(0, 30) : userMessage.substring(0, 30);
        localStorage.setItem('chatHistory', JSON.stringify(existingChats));
        updateChatHistoryPanel();
    } catch (e) {
        currentChat.title = userMessage.substring(0, 30);
        localStorage.setItem('chatHistory', JSON.stringify(existingChats));
        updateChatHistoryPanel();
    }
}

function startNewChat() {
    aiChatHistory = [];
    aiChatMessages.innerHTML = '';
    updateChatHistoryPanel();
}

function updateChatHistoryPanel() {
    const container = document.getElementById('chatHistoryList');
    const stored = localStorage.getItem('chatHistory') || '[]';
    let chats = JSON.parse(stored);

    chats = chats.filter(c => c && typeof c === 'object' && c.title);

    if (chats.length === 0) {
        container.innerHTML = '<div class="ai-chat-empty-state"><i class="fas fa-comment-slash" style="font-size:1.5rem;opacity:0.3;margin-bottom:8px;display:block;text-align:center;"></i><div style="text-align:center;color:#888;font-size:0.8rem;">No saved conversations<br><small style="color:#666;">Chat with Zor and save to build a history</small></div></div>';
        return;
    }

    container.innerHTML = chats.map((chat, index) => `
        <div class="ai-chat-history-item" onclick="loadConversation(${index})" oncontextmenu="showChatContextMenu(event, ${index})">
            ${String(chat.title).substring(0, 40) || 'Chat ' + (index + 1)}
        </div>
    `).join('');
}

let selectedChatIndex = null;

function showChatContextMenu(e, index) {
    e.preventDefault();
    selectedChatIndex = index;
    const menu = document.getElementById('chatContextMenu');
    if (!menu) return;
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';
    menu.classList.add('active');
}

function hideChatContextMenu() {
    const menu = document.getElementById('chatContextMenu');
    if (!menu) return;
    menu.classList.remove('active');
}

document.addEventListener('click', hideChatContextMenu);

document.getElementById('renameChatOption')?.addEventListener('click', () => {
    if (selectedChatIndex === null) return;
    const chats = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    const chat = chats[selectedChatIndex];
    if (!chat) return;
    const newTitle = prompt('Enter new title:', chat.title);
    if (newTitle && newTitle.trim()) {
        chat.title = newTitle.trim().substring(0, 40);
        localStorage.setItem('chatHistory', JSON.stringify(chats));
        updateChatHistoryPanel();
    }
    hideChatContextMenu();
});

document.getElementById('deleteChatOption')?.addEventListener('click', () => {
    if (selectedChatIndex === null) return;
    if (!confirm('Delete this conversation?')) return;
    const chats = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    chats.splice(selectedChatIndex, 1);
    localStorage.setItem('chatHistory', JSON.stringify(chats));
    updateChatHistoryPanel();
    hideChatContextMenu();
});

function loadConversation(index) {
    const chats = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    const chat = chats[index];
    if (!chat || !chat.messages) return;

    aiChatHistory = [...chat.messages];
    aiChatMessages.innerHTML = '';

    chat.messages.forEach(msg => {
        const sender = msg.role === 'user' ? 'user' : 'ai';
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ${sender}`;
        messageDiv.textContent = msg.content;

        if (msg.entityInfo) {
            const container = document.createElement('div');
            container.className = `ai-message-container ${sender}`;
            container.appendChild(messageDiv);

            const btn = document.createElement('button');
            btn.className = 'ai-entity-link';
            btn.innerHTML = `<i class="fas fa-external-link-alt"></i> ${escapeHtml(msg.entityInfo.name)}`;
            btn.onclick = function () { openDetailView(msg.entityInfo.id, msg.entityInfo.type); };
            container.appendChild(btn);

            aiChatMessages.appendChild(container);
        } else {
            aiChatMessages.appendChild(messageDiv);
        }
    });

    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
}

function generate54PeopleCommand() {
    try {
        const firstNames = [
            "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
            "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
            "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Nancy", "Daniel", "Lisa",
            "Matthew", "Betty", "Anthony", "Helen", "Mark", "Sandra", "Donald", "Donna",
            "Steven", "Carol", "Paul", "Ruth", "Andrew", "Sharon", "Joshua", "Michelle",
            "Kenneth", "Laura", "Kevin", "Sarah", "Brian", "Kimberly", "George", "Deborah",
            "Timothy", "Dorothy", "Ronald", "Lisa", "Jason", "Nancy", "Jacob", "Karen"
        ];

        const lastNames = [
            "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
            "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
            "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
            "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
            "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
            "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell"
        ];

        const politicalViews = [
            "Liberal", "Conservative", "Moderate", "Progressive",
            "Libertarian", "Socialist", "Green", "Centrist",
            "Anarchist", "Fascist", "Nationalist", "Populist",
            "Social Democrat", "Neo-Conservative", "Neo-Liberal",
            "Technocrat", "Monarchist", "Theocrat"
        ];

        const appearanceTraits = [
            "Tall", "Short", "Athletic", "Slender",
            "Average", "Stocky", "Petite", "Lanky",
            "Curvy", "Muscular", "Skinny", "Chubby",
            "Fit", "Overweight", "Underweight", "Well-proportioned"
        ];

        const professions = [
            "Doctor", "Teacher", "Engineer", "Artist", "Lawyer", "Nurse", "Manager", "Salesperson",
            "Chef", "Writer", "Designer", "Accountant", "Police Officer", "Firefighter", "Scientist", "Musician"
        ];

        const interests = [
            "Sports", "Reading", "Travel", "Cooking", "Music", "Art", "Technology", "Gardening",
            "Photography", "Dancing", "Hiking", "Gaming", "Movies", "Politics", "Volunteering", "Fitness"
        ];

        const actions = [];

        for (let i = 1; i <= 54; i++) {
            const isImmigrant = (i === 1 || i === 2);
            const gender = Math.random() > 0.5 ? "Male" : "Female";

            const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
            const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
            const fullName = `${firstName} ${lastName}`;

            const year = Math.floor(Math.random() * 55) + 1950;
            const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
            const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');

            const politicalView = politicalViews[Math.floor(Math.random() * politicalViews.length)];
            const appearance = appearanceTraits[Math.floor(Math.random() * appearanceTraits.length)];
            const profession = professions[Math.floor(Math.random() * professions.length)];
            const interest = interests[Math.floor(Math.random() * interests.length)];

            let extraNotes = `Political view: ${politicalView}; Looks: ${appearance}; Profession: ${profession}`;

            if (isImmigrant) {
                const countries = ["Mexico", "Canada", "Germany", "Japan", "India", "Brazil", "Australia", "France"];
                const country = countries[Math.floor(Math.random() * countries.length)];
                extraNotes = `Immigrant from ${country}; ${extraNotes}`;
            }

            const personTags = [profession.toLowerCase(), interest.toLowerCase()];

            actions.push({
                "action": "add_human",
                "data": {
                    "name": fullName,
                    "gender": gender,
                    "birthDate": `${year}-${month}-${day}`,
                    "friends": [],
                    "family": [],
                    "extraNotes": extraNotes,
                    "tags": personTags,
                    "imagePreview": null
                }
            });
        }

        const humanNames = actions.map(action => action.data.name);

        for (let i = 0; i < actions.length; i++) {
            const familyCount = Math.min(Math.floor(Math.random() * 3) + 1, actions.length - 1);
            const familyNames = [];

            const availableIndices = Array.from({ length: actions.length }, (_, idx) => idx).filter(idx => idx !== i);
            for (let j = 0; j < familyCount && availableIndices.length > 0; j++) {
                const randomIndex = Math.floor(Math.random() * availableIndices.length);
                const familyIndex = availableIndices.splice(randomIndex, 1)[0];
                familyNames.push(humanNames[familyIndex]);
            }

            actions.push({
                "action": "modify_human",
                "id": `temp_id_${i + 1}`,
                "data": {
                    "family": familyNames
                }
            });
        }

        return actions;
    } catch (error) {
        console.error('Error in generate54PeopleCommand:', error);
        addMessageToAIChat("Sorry, I encountered an error generating people. Please try again.", 'ai');
        return [];
    }
}

const ZOR_TOOLS = [
    { name: 'add_human', parameters: { type: 'object', properties: { name: { type: 'string' }, gender: { type: 'string' }, birthDate: { type: 'string' }, credit: { type: 'integer' }, threatLevel: { type: 'string', enum: ['None', 'Low', 'Medium', 'High', 'Critical'] }, tags: { type: 'array', items: { type: 'string' } }, workplace: { type: 'string' }, extraNotes: { type: 'string' } }, required: ['name'] } },
    { name: 'modify_human', parameters: { type: 'object', properties: { id: { type: 'string' }, data: { type: 'object', properties: { name: { type: 'string' }, credit: { type: 'integer' }, threatLevel: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, extraNotes: { type: 'string' } } } }, required: ['id', 'data'] } },
    { name: 'delete_human', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'add_other', parameters: { type: 'object', properties: { name: { type: 'string' }, note: { type: 'string' } }, required: ['name'] } },
    { name: 'modify_other', parameters: { type: 'object', properties: { id: { type: 'string' }, data: { type: 'object', properties: { name: { type: 'string' }, note: { type: 'string' } } } }, required: ['id', 'data'] } },
    { name: 'delete_other', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'list_humans', parameters: { type: 'object', properties: {} } },
    { name: 'list_others', parameters: { type: 'object', properties: {} } },
    { name: 'count_entries', parameters: { type: 'object', properties: {} } },
    { name: 'search', parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } },
    { name: 'get', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'list', parameters: { type: 'object', properties: {} } },
    { name: 'stats', parameters: { type: 'object', properties: {} } },
    { name: 'add_tag', parameters: { type: 'object', properties: { tag: { type: 'string' } }, required: ['tag'] } },
    { name: 'assign_tag', parameters: { type: 'object', properties: { id: { type: 'string' }, tag: { type: 'string' } }, required: ['id', 'tag'] } },
    { name: 'remove_tag', parameters: { type: 'object', properties: { id: { type: 'string' }, tag: { type: 'string' } }, required: ['id', 'tag'] } },
    { name: 'create_case', parameters: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' } }, required: ['title'] } },
    { name: 'add_case_note', parameters: { type: 'object', properties: { title: { type: 'string' }, note: { type: 'string' } }, required: ['title', 'note'] } },
    { name: 'close_case', parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } },
    { name: 'add_entity_to_case', parameters: { type: 'object', properties: { case_title: { type: 'string' }, entity_name: { type: 'string' } }, required: ['case_title', 'entity_name'] } },
    { name: 'list_karline_actions', parameters: { type: 'object', properties: {} } },
    { name: 'create_karline_action', parameters: { type: 'object', properties: { title: { type: 'string' }, type: { type: 'string', enum: ['static', 'dynamic'] }, date: { type: 'string' }, endDate: { type: 'string' }, goal: { type: 'string' }, description: { type: 'string' }, status: { type: 'string', enum: ['draft', 'active', 'completed', 'cancelled'] } }, required: ['title'] } },
    { name: 'update_karline_action', parameters: { type: 'object', properties: { id: { type: 'integer' }, data: { type: 'object', properties: { title: { type: 'string' }, type: { type: 'string' }, date: { type: 'string' }, endDate: { type: 'string' }, goal: { type: 'string' }, description: { type: 'string' }, status: { type: 'string' } } } }, required: ['id', 'data'] } },
    { name: 'delete_karline_action', parameters: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } },
    { name: 'ask_user', parameters: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } }, required: ['question', 'options'] } }
];

function executeTool(name, args) {
    const db = pazatorData;
    function findHuman(id) {
        return db.humans.findIndex(h => h.id === id);
    }
    function findOther(id) {
        return db.others.findIndex(o => o.id === id);
    }
    switch (name) {
        case 'add_human': {
            const h = { id: generatePersonId(args.name, args.birthDate) };
            Object.keys(args).forEach(k => { h[k] = args[k]; });
            db.humans.push(h);
            markDataChanged(); renderObjectCanvas();
            return { success: true, message: 'Added human: ' + h.name, entityInfo: { id: h.id, type: 'human', name: h.name } };
        }
        case 'modify_human': {
            const mi = findHuman(args.id);
            if (mi === -1) return { success: false, message: 'Human not found: ' + args.id };
            Object.keys(args.data || {}).forEach(k => { if (k in db.humans[mi]) db.humans[mi][k] = args.data[k]; });
            markDataChanged(); renderObjectCanvas();
            return { success: true, message: 'Modified human: ' + db.humans[mi].name, entityInfo: { id: db.humans[mi].id, type: 'human', name: db.humans[mi].name } };
        }
        case 'delete_human': {
            const di = findHuman(args.id);
            if (di === -1) return { success: false, message: 'Human not found: ' + args.id };
            const dn = db.humans[di].name; db.humans.splice(di, 1);
            markDataChanged(); renderObjectCanvas();
            return { success: true, message: 'Deleted human: ' + dn };
        }
        case 'add_other': {
            const o = { id: Date.now().toString() + Math.random().toString(36).substr(2, 9), name: args.name, note: args.note || '' };
            db.others.push(o);
            markDataChanged(); renderObjectCanvas();
            return { success: true, message: 'Added other: ' + o.name, entityInfo: { id: o.id, type: 'other', name: o.name } };
        }
        case 'modify_other': {
            const moi = findOther(args.id);
            if (moi === -1) return { success: false, message: 'Other not found: ' + args.id };
            if (args.data) { if (args.data.name !== undefined) db.others[moi].name = args.data.name; if (args.data.note !== undefined) db.others[moi].note = args.data.note; }
            markDataChanged(); renderObjectCanvas();
            return { success: true, message: 'Modified other: ' + db.others[moi].name };
        }
        case 'delete_other': {
            const doi = findOther(args.id);
            if (doi === -1) return { success: false, message: 'Other not found: ' + args.id };
            const don = db.others[doi].name; db.others.splice(doi, 1);
            markDataChanged(); renderObjectCanvas();
            return { success: true, message: 'Deleted other: ' + don };
        }
        case 'list_humans':
            return { success: true, message: JSON.stringify(db.humans.map(h => ({ id: h.id, name: h.name, threatLevel: h.threatLevel || 'None', credit: h.credit, tags: h.tags || [] }))) };
        case 'list_others':
            return { success: true, message: JSON.stringify(db.others.map(o => ({ id: o.id, name: o.name, note: o.note }))) };
        case 'count_entries':
            return { success: true, message: JSON.stringify({ humans: db.humans.length, others: db.others.length }) };
        case 'search': {
            const q = (args.q || '').toLowerCase();
            const r = [];
            db.humans.forEach(h => { if ((h.name + ' ' + (h.extraNotes || '') + ' ' + (h.tags || []).join(' ')).toLowerCase().indexOf(q) !== -1) r.push({ type: 'human', id: h.id, name: h.name }); });
            db.others.forEach(o => { if ((o.name + ' ' + (o.note || '')).toLowerCase().indexOf(q) !== -1) r.push({ type: 'other', id: o.id, name: o.name }); });
            return { success: true, message: JSON.stringify(r) };
        }
        case 'get': {
            const ge = db.humans.find(h => h.id === args.id) || db.others.find(o => o.id === args.id);
            return ge ? { success: true, message: JSON.stringify(ge) } : { success: false, message: 'Not found: ' + args.id };
        }
        case 'list':
            return { success: true, message: JSON.stringify(db.humans.map(h => ({ id: h.id, name: h.name, threatLevel: h.threatLevel || 'None', credit: h.credit }))) };
        case 'stats': {
            const high = db.humans.filter(h => h.threatLevel === 'High' || h.threatLevel === 'Critical').length;
            const total = db.humans.reduce((s, h) => s + (h.credit || 0), 0);
            return { success: true, message: JSON.stringify({ totalHumans: db.humans.length, totalOthers: db.others.length, totalCases: (cases || []).length, totalTags: (tags || []).length, highRiskCount: high, averageCredit: db.humans.length ? (total / db.humans.length).toFixed(1) : 0 }) };
        }
        case 'add_tag':
            if (!args.tag) return { success: false, message: 'Tag name required' };
            if (tags.indexOf(args.tag) !== -1) return { success: true, message: 'Tag "' + args.tag + '" already exists' };
            tags.push(args.tag); markDataChanged(); renderTags();
            return { success: true, message: 'Added tag: ' + args.tag };
        case 'assign_tag': {
            const ati = findHuman(args.id);
            if (ati === -1) return { success: false, message: 'Human not found' };
            if (!db.humans[ati].tags) db.humans[ati].tags = [];
            if (db.humans[ati].tags.indexOf(args.tag) !== -1) return { success: true, message: args.tag + ' already assigned' };
            db.humans[ati].tags.push(args.tag);
            if (tags.indexOf(args.tag) === -1) { tags.push(args.tag); renderTags(); }
            markDataChanged(); renderObjectCanvas();
            return { success: true, message: 'Assigned tag "' + args.tag + '" to ' + db.humans[ati].name };
        }
        case 'remove_tag': {
            const rti = findHuman(args.id);
            if (rti === -1) return { success: false, message: 'Human not found' };
            if (!db.humans[rti].tags || db.humans[rti].tags.indexOf(args.tag) === -1) return { success: false, message: 'Tag not found on human' };
            db.humans[rti].tags = db.humans[rti].tags.filter(t => t !== args.tag);
            markDataChanged(); renderObjectCanvas();
            return { success: true, message: 'Removed tag "' + args.tag + '" from ' + db.humans[rti].name };
        }
        case 'create_case': {
            const nc = { id: 'case_' + Date.now(), title: args.title || 'Untitled', description: args.description || '', status: 'open', entities: [], timeline: [{ type: 'note', content: '<strong>Case created</strong>', timestamp: Date.now() }], createdAt: Date.now() };
            cases.push(nc); saveCases(); renderCasesList(); selectCase(nc.id);
            return { success: true, message: 'Created case: "' + nc.title + '"' };
        }
        case 'add_case_note': {
            const cn = (cases || []).find(c => c.title.toLowerCase() === (args.title || '').toLowerCase());
            if (!cn) return { success: false, message: 'Case not found' };
            cn.timeline.push({ type: 'note', content: '<strong>Note</strong>: ' + args.note, timestamp: Date.now() });
            saveCases();
            return { success: true, message: 'Note added to "' + cn.title + '"' };
        }
        case 'close_case': {
            const cc = (cases || []).find(c => c.title.toLowerCase() === (args.title || '').toLowerCase());
            if (!cc) return { success: false, message: 'Case not found' };
            cc.status = 'closed'; cc.timeline.push({ type: 'status-changed', content: '<strong>Case closed</strong>', timestamp: Date.now() });
            saveCases(); renderCasesList();
            return { success: true, message: 'Closed case: "' + cc.title + '"' };
        }
        case 'add_entity_to_case': {
            const ec = (cases || []).find(c => c.title.toLowerCase() === (args.case_title || '').toLowerCase());
            if (!ec) return { success: false, message: 'Case not found' };
            const ee = db.humans.find(h => h.name.toLowerCase() === (args.entity_name || '').toLowerCase()) || db.others.find(o => o.name.toLowerCase() === (args.entity_name || '').toLowerCase());
            if (!ee) return { success: false, message: 'Entity not found' };
            if (ec.entities.indexOf(ee.id) !== -1) return { success: true, message: ee.name + ' already in case' };
            ec.entities.push(ee.id); ec.timeline.push({ type: 'entity-added', content: '<strong>Entity added</strong>: ' + ee.name, timestamp: Date.now() });
            saveCases();
            return { success: true, message: 'Added ' + ee.name + ' to case' };
        }
        case 'list_karline_actions': {
            const ka = window.pazatorKarline;
            if (!ka) return { success: false, message: 'Karline module not loaded' };
            return { success: true, message: JSON.stringify(ka.getActions()) };
        }
        case 'create_karline_action': {
            const ka = window.pazatorKarline;
            if (!ka) return { success: false, message: 'Karline module not loaded' };
            if (!args.title) return { success: false, message: 'Title required' };
            const created = ka.createAction(args);
            return { success: true, message: JSON.stringify({ id: created.id, title: created.title }) };
        }
        case 'update_karline_action': {
            const ka = window.pazatorKarline;
            if (!ka) return { success: false, message: 'Karline module not loaded' };
            const kid = parseInt(args.id, 10);
            if (isNaN(kid)) return { success: false, message: 'Invalid ID' };
            ka.updateAction(kid, args.data || {});
            return { success: true, message: 'Updated Karline action #' + kid };
        }
        case 'delete_karline_action': {
            const ka = window.pazatorKarline;
            if (!ka) return { success: false, message: 'Karline module not loaded' };
            const kd = parseInt(args.id, 10);
            if (isNaN(kd)) return { success: false, message: 'Invalid ID' };
            ka.deleteAction(kd);
            return { success: true, message: 'Deleted Karline action #' + kd };
        }
        case 'ask_user':
            return null;
        default:
            return { success: false, message: 'Unknown tool: ' + name };
    }
}

function formatToolResult(name, raw) {
    if (raw === null) return 'Waiting for user answer...';
    try {
        const p = JSON.parse(raw.message);
        if (name === 'list_humans' && Array.isArray(p)) return 'Listed ' + p.length + ' humans.';
        if (name === 'list_others' && Array.isArray(p)) return 'Listed ' + p.length + ' others.';
        if (name === 'search' && Array.isArray(p)) return 'Found ' + p.length + ' results.';
        if (name === 'list_karline_actions' && Array.isArray(p)) return 'Listed ' + p.length + ' Karline actions.';
        if (name === 'stats') return 'Stats loaded.';
        if (name === 'count_entries') return p.humans + ' humans, ' + p.others + ' others.';
    } catch (e) { }
    if (name.indexOf('add_') === 0 || name.indexOf('modify_') === 0 || name.indexOf('delete_') === 0) return 'Done.';
    if (name === 'create_case' || name === 'create_karline_action') return 'Created.';
    if (name === 'add_tag' || name === 'assign_tag' || name === 'remove_tag') return raw.message;
    return raw.message;
}

async function processAICommand(command) {
    if (__aiProcessingGuard) return;
    __aiProcessingGuard = true;
    __aiAbortController = null;
    try {
        command = command.trim();

        if (command.toLowerCase().includes("make 54") && command.toLowerCase().includes("people")) {
            addMessageToAIChat(command, 'user');
            const actions = generate54PeopleCommand();
            await handleBatchActions(actions);
            return;
        }

        addMessageToAIChat(command, 'user');

        __aiProcessing = true;
        setAiSendLoading(true);
        showAiTypingIndicator();

        try {
            const adminContext = getAdminContext();
            let dataSummary = window.pazatorStore ? window.pazatorStore.getAICompatData() : {
                totalHumans: pazatorData.humans.length,
                totalEntities: pazatorData.others.length,
                tagCount: tags.length,
                casesCount: cases.length
            };

            let dataStr = '';
            if (pazatorData.humans.length < 50) {
                dataStr = 'ALL HUMANS:\n' + JSON.stringify(pazatorData.humans.map(h => ({ id: h.id, name: h.name, gender: h.gender, threatLevel: h.threatLevel || 'None', credit: h.credit, tags: h.tags || [] }))) + '\n\n';
                dataStr += 'ALL OTHERS:\n' + JSON.stringify(pazatorData.others.map(o => ({ id: o.id, name: o.name }))) + '\n\n';
                dataStr += 'TAGS: ' + JSON.stringify(tags || []) + '\n';
            }

            const systemPrompt = 'Act as Zor (Model: PZZ2), a grounded, blunt, mildly skeptical peer in "Pazator: SARPARAST" No emojis, no fluff, no "I\'m here to help". Be direct.\n\n' +
                'CURRENT DATABASE:\n' +
                (dataStr ||
                    'Humans: ' + pazatorData.humans.length + ' | Others: ' + pazatorData.others.length + ' | Cases: ' + (cases ? cases.length : 0) + ' | Tags: ' + (tags ? tags.length : 0) + '\n' +
                    'High-risk: ' + (dataSummary.highRiskCount || 0) + ' | Avg credit: ' + (dataSummary.averageCredit || 0) + '\n') +
                '\n' +
                'SCHEMA:\n' +
                'Human: name, gender, birthDate, workplace, credit(0-370), socialClass, maritalStatus, nationality, threatLevel(None/Low/Medium/High/Critical), tags, friends, family, extraNotes.\n' +
                'Other: name, note.\n' +
                '\n' +
                'You have tools available. Use them to interact with the database. When given a task, first explain your plan briefly, then execute tools. If a tool fails, comment on it. When all steps are done, summarize what you did. Use the ask_user tool if you need a decision.\n' +
                '\n' +
                (adminContext ? 'ADMIN CONTEXT:\n' + adminContext + '\n\n' : '') +
                'Previous conversation:\n' +
                aiChatHistory.map(m => m.role + ': ' + m.content).join('\n');

            const messages = [
                { role: "system", content: systemPrompt }
            ];

            for (let hi = 0; hi < aiChatHistory.length; hi++) {
                const hMsg = aiChatHistory[hi];
                if (hMsg.role === 'assistant' || hMsg.role === 'model') messages.push({ role: "model", content: hMsg.content });
                else messages.push({ role: "user", content: hMsg.content });
            }
            messages.push({ role: "user", content: command });

            const MAX_LOOPS = 15;
            let loopCount = 0;
            const agentDebug = typeof getAgentDebug === 'function' ? getAgentDebug() : false;

            while (loopCount < MAX_LOOPS) {
                loopCount++;

                if (agentDebug) {
                    console.group('Agent Loop, Turn ' + loopCount);
                    console.log('Messages:', JSON.parse(JSON.stringify(messages)));
                }

                let aiResponse;
                try {
                    if (window.AIQueue) {
                        aiResponse = await AIQueue.enqueue(function (signal) {
                            return window.pazatorAI.chatWithTools(messages, ZOR_TOOLS, signal);
                        });
                    } else {
                        __aiAbortController = new AbortController();
                        aiResponse = await window.pazatorAI.chatWithTools(messages, ZOR_TOOLS, __aiAbortController.signal);
                    }
                } catch (e) {
                    if (e.name === 'AbortError') {
                        addMessageToAIChat('Request cancelled.', 'system');
                    } else {
                        console.error('AI Error:', e);
                        addMessageToAIChat("Error: " + (e.message || e), 'ai');
                    }
                    if (agentDebug) console.groupEnd();
                    break;
                }

                const responseText = aiResponse.content || '';
                const functionCalls = aiResponse.functionCalls || [];

                if (agentDebug) {
                    console.log('Response text:', responseText);
                    console.log('Function calls:', functionCalls);
                }

                if (responseText.trim()) {
                    addMessageToAIChat(responseText, 'ai');
                }

                if (functionCalls.length === 0) {
                    if (agentDebug) console.groupEnd();
                    break;
                }

                const modelContent = { role: "model", content: responseText };
                messages.push(modelContent);

                const toolDelay = typeof getToolDelay === 'function' ? getToolDelay() : 0;

                for (let fi = 0; fi < functionCalls.length; fi++) {
                    const fc = functionCalls[fi];
                    addToolCallCard({ action: fc.name, data: fc.args }, { success: true });

                    if (fc.name === 'ask_user') {
                        const answer = await new Promise(function (resolve) {
                            if (typeof showModal === 'function') {
                                const opts = fc.args.options || ['Yes', 'No'];
                                const btns = opts.map(o => ({
                                    text: o, primary: o === opts[0], onClick: function () { hideModal(); resolve(o); }
                                }));
                                showModal({
                                    title: 'Zor asks:',
                                    type: 'question',
                                    html: '<div style="font-size:0.9rem;color:#ddd;">' + escapeHtml(fc.args.question || '') + '</div>',
                                    buttons: btns
                                });
                            } else {
                                resolve(prompt(fc.args.question || '') || '');
                            }
                        });
                        messages.push({
                            role: "function",
                            name: "ask_user",
                            response: { answer: answer }
                        });
                    } else {
                        const rawResult = executeTool(fc.name, fc.args);
                        const formatted = formatToolResult(fc.name, rawResult);
                        addMessageToAIChat('[' + fc.name + '] ' + formatted, 'tool');

                        if (toolDelay > 0) {
                            await new Promise(r => setTimeout(r, toolDelay));
                        }

                        messages.push({
                            role: "function",
                            name: fc.name,
                            response: { result: rawResult ? rawResult.message : 'error' }
                        });
                    }
                }

                showAiTypingIndicator();
                if (agentDebug) console.groupEnd();
            }

            if (loopCount >= MAX_LOOPS) {
                hideAiTypingIndicator();
                addMessageToAIChat("Zor reached the maximum number of actions for one request.", 'ai');
                if (agentDebug) console.groupEnd();
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                addMessageToAIChat('Request cancelled.', 'system');
            } else {
                console.error('AI Error:', error);
                addMessageToAIChat("Error: " + (error.message || error), 'ai');
            }
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            addMessageToAIChat('Request cancelled.', 'system');
        } else {
            console.error('Critical Error in processAICommand:', error);
            addMessageToAIChat("Critical error: " + (error.message || error), 'ai');
        }
    } finally {
        hideAiTypingIndicator();
        __aiAbortController = null;
        __aiProcessing = false;
        __aiProcessingGuard = false;
        requestAnimationFrame(() => {
            setAiSendLoading(false);
            aiInput.value = '';
            aiInput.focus();
        });
    }
}

async function handleBatchActions(actions) {
    try {
        let completedActions = 0;
        const totalActions = actions.length;
        let batchResponse = "I've completed the following actions:\n";
        let hasErrors = false;
        const entityInfos = [];

        const addHumanActions = actions.filter(action => action.action === "add_human");
        const otherActions = actions.filter(action => action.action !== "add_human");

        for (const action of addHumanActions) {
            try {
                const result = executeTool(action.action, action.data || {});
                if (result.success) {
                    batchResponse += `- ${result.message}\n`;
                    if (result.entityInfo) entityInfos.push(result.entityInfo);
                    completedActions++;
                } else {
                    batchResponse += `- Failed to add ${action.data?.name || 'unknown person'}: ${result.message}\n`;
                    hasErrors = true;
                }
            } catch (e) {
                batchResponse += `- Error adding ${action.data?.name || 'unknown person'}: ${e.message}\n`;
                hasErrors = true;
            }
        }

        if (addHumanActions.length > 0) {
            markDataChanged();
            renderObjectCanvas();
        }

        for (const action of otherActions) {
            try {
                const toolName = action.action;
                const toolArgs = action.data || {};
                if (action.id) toolArgs.id = action.id;
                const result = executeTool(toolName, toolArgs);
                if (result.success) {
                    batchResponse += `- ${result.message}\n`;
                    if (result.entityInfo) entityInfos.push(result.entityInfo);
                    completedActions++;
                } else {
                    batchResponse += `- Failed action: ${result.message}\n`;
                    hasErrors = true;
                }
            } catch (e) {
                batchResponse += `- Error processing action: ${e.message}\n`;
                hasErrors = true;
            }
        }

        if (addHumanActions.length >= 10) {
            createFamilyConnections();
            batchResponse += "- Created family connections between people\n";
        }

        if (completedActions > 0 && addHumanActions.length === 0) {
            markDataChanged();
            renderObjectCanvas();
        }

        batchResponse += `\nCompleted ${completedActions} out of ${totalActions} actions.`;
        if (hasErrors) {
            batchResponse += "\nSome actions failed. Please check the data and try again.";
        }

        addMessageToAIChat(batchResponse, 'ai');

        if (entityInfos.length > 0) {
            const entityRow = document.createElement('div');
            entityRow.className = 'ai-message ai';
            entityRow.style.display = 'flex';
            entityRow.style.flexWrap = 'wrap';
            entityRow.style.gap = '6px';
            entityRow.style.padding = '8px 12px';
            entityInfos.forEach(info => {
                const btn = document.createElement('button');
                btn.className = 'ai-entity-link';
                btn.innerHTML = `<i class="fas fa-external-link-alt"></i> ${escapeHtml(info.name)}`;
                btn.onclick = function () { openDetailView(info.id, info.type); };
                entityRow.appendChild(btn);
            });
            requestAnimationFrame(() => {
                aiChatMessages.appendChild(entityRow);
                aiChatMessages.scrollTo({ top: aiChatMessages.scrollHeight, behavior: 'smooth' });
            });
        }
    } catch (error) {
        console.error('Error in handleBatchActions:', error);
        addMessageToAIChat("Sorry, I encountered an error processing the batch actions. Please try again.", 'ai');
    }
}

function createFamilyConnections() {
    try {
        if (pazatorData.humans.length < 5) return;
        for (let i = 0; i < pazatorData.humans.length; i++) {
            const person = pazatorData.humans[i];
            if (person.family && person.family.length > 0) continue;
            const familyCount = Math.min(Math.floor(Math.random() * 3) + 1, pazatorData.humans.length - 1);
            const familyIds = [];
            const availablePeople = pazatorData.humans.filter((p, idx) => idx !== i);
            for (let j = 0; j < familyCount && availablePeople.length > 0; j++) {
                const randomIndex = Math.floor(Math.random() * availablePeople.length);
                const familyMember = availablePeople.splice(randomIndex, 1)[0];
                familyIds.push(familyMember.id);
            }
            const personIndex = pazatorData.humans.findIndex(p => p.id === person.id);
            if (personIndex !== -1) {
                pazatorData.humans[personIndex].family = familyIds;
            }
        }
        saveData();
        renderObjectCanvas();
    } catch (error) {
        console.error('Error in createFamilyConnections:', error);
    }
}

newDataBtn.addEventListener('click', () => {
    document.getElementById('humanModalTitle').textContent = 'Create Human Entry';
    document.getElementById('otherModalTitle').textContent = 'Create Job / Company Entry';

    document.getElementById('humanForm').reset();
    document.getElementById('otherForm').reset();
    document.getElementById('humanId').value = '';
    document.getElementById('otherId').value = '';

    humanModal.style.display = 'none';
    otherModal.style.display = 'none';
    detailViewModal.style.display = 'none';
    aiChatModal.style.display = 'none';

    [humanModal, otherModal, detailViewModal, aiChatModal].forEach(modal => {
        modal.style.zIndex = '-1';
    });

    populateSelectOptions();
    populateTagsForHuman();

    typeModal.style.display = 'flex';
    typeModal.style.zIndex = '1000';
});

let _windowedActive = false;
let _dragState = null;

function toggleWindowedMode() {
    _windowedActive = !_windowedActive;
    const btn = document.getElementById('windowToggleBtn');
    if (_windowedActive) {
        aiChatModal.classList.add('windowed');
        aiChatModal.style.top = '60px';
        aiChatModal.style.right = '20px';
        aiChatModal.style.left = 'auto';
        aiChatModal.style.bottom = 'auto';
        btn.classList.add('active');
        btn.querySelector('i').className = 'fas fa-window-maximize';
    } else {
        aiChatModal.classList.remove('windowed');
        aiChatModal.style.top = '';
        aiChatModal.style.right = '';
        aiChatModal.style.left = '';
        aiChatModal.style.bottom = '';
        btn.classList.remove('active');
        btn.querySelector('i').className = 'fas fa-window-restore';
    }
}

function _dragStart(e) {
    if (!aiChatModal.classList.contains('windowed')) return;
    if (e.target.closest('.header-right')) return;
    const rect = aiChatModal.getBoundingClientRect();
    _dragState = {
        offsetX: (e.clientX || e.touches[0].clientX) - rect.left,
        offsetY: (e.clientY || e.touches[0].clientY) - rect.top
    };
    document.addEventListener('mousemove', _dragMove);
    document.addEventListener('mouseup', _dragEnd);
    document.addEventListener('touchmove', _dragMove, { passive: true });
    document.addEventListener('touchend', _dragEnd);
}

function _dragMove(e) {
    if (!_dragState) return;
    const cx = e.clientX || (e.touches && e.touches[0].clientX);
    const cy = e.clientY || (e.touches && e.touches[0].clientY);
    if (cx == null) return;
    aiChatModal.style.left = (cx - _dragState.offsetX) + 'px';
    aiChatModal.style.top = (cy - _dragState.offsetY) + 'px';
    aiChatModal.style.right = 'auto';
    aiChatModal.style.bottom = 'auto';
}

function _dragEnd() {
    _dragState = null;
    document.removeEventListener('mousemove', _dragMove);
    document.removeEventListener('mouseup', _dragEnd);
    document.removeEventListener('touchmove', _dragMove);
    document.removeEventListener('touchend', _dragEnd);
}

const _windowToggleBtn = document.getElementById('windowToggleBtn');
if (_windowToggleBtn) _windowToggleBtn.addEventListener('click', toggleWindowedMode);

const _selectBtn = document.getElementById('zorSelectBtn');
if (_selectBtn) _selectBtn.addEventListener('click', toggleSelectMode);
let _selectActive = false;
let _selectOverlay = null;
let _selectTooltip = null;
let _lastHighlighted = null;

function toggleSelectMode() {
    _selectActive = !_selectActive;
    const btn = document.getElementById('zorSelectBtn');
    if (_selectActive) {
        btn.classList.add('active');
        btn.style.borderColor = '#4d9de0';
        btn.style.color = '#4d9de0';
        btn.style.boxShadow = '0 0 12px rgba(77,157,224,0.2)';
        document.body.classList.add('pz-select-mode');
        _selectTooltip = document.createElement('div');
        _selectTooltip.className = 'pz-select-tooltip';
        _selectTooltip.innerHTML = 'Click any element to select it &nbsp;<kbd>Esc</kbd> to cancel';
        document.body.appendChild(_selectTooltip);
        document.addEventListener('mouseover', _selectOnHover, true);
        document.addEventListener('click', _selectOnClick, true);
        document.addEventListener('keydown', _selectOnKeydown);
    } else {
        _selectCleanup();
    }
}

function _selectOnHover(e) {
    if (!_selectActive) return;
    let el = e.target;
    if (el.closest('.pz-select-tooltip') || el.closest('.ai-chat-modal')) return;
    if (_lastHighlighted) _lastHighlighted.classList.remove('pz-select-highlight');
    _lastHighlighted = el;
    el.classList.add('pz-select-highlight');
}

function _selectOnClick(e) {
    if (!_selectActive) return;
    const el = e.target;
    if (el.closest('.pz-select-tooltip') || el.closest('.ai-chat-modal') || el.closest('.header-right')) {
        e.preventDefault();
        e.stopPropagation();
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    _selectActive = false;
    _selectCleanup();
    const info = _captureElementInfo(el);
    addMessageToAIChat('(Selected element fed to Zor for context)', 'system');
    const msg = '**Element selected:**\n```json\n' + JSON.stringify(info, null, 2) + '\n```\n\nThis element is now the active selection. Use the tool `get_element_info` with selector `' + info.selector + '` to interact with it.';
    addMessageToAIChat(msg, 'ai');
    if (window.aiInput) { aiInput.focus(); }
}

function _selectOnKeydown(e) {
    if (e.key === 'Escape' && _selectActive) {
        _selectActive = false;
        _selectCleanup();
    }
}

function _selectCleanup() {
    document.body.classList.remove('pz-select-mode');
    if (_lastHighlighted) { _lastHighlighted.classList.remove('pz-select-highlight'); _lastHighlighted = null; }
    if (_selectTooltip) { _selectTooltip.remove(); _selectTooltip = null; }
    document.removeEventListener('mouseover', _selectOnHover, true);
    document.removeEventListener('click', _selectOnClick, true);
    document.removeEventListener('keydown', _selectOnKeydown);
    const btn = document.getElementById('zorSelectBtn');
    if (btn) {
        btn.classList.remove('active');
        btn.style.borderColor = '';
        btn.style.color = '';
        btn.style.boxShadow = '';
    }
}

function _captureElementInfo(el) {
    const rect = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const id = el.id || '';
    const classes = Array.from(el.classList).filter(c => c.indexOf('pz-') !== 0);
    const text = (el.textContent || '').trim().substring(0, 500);
    let value = '';
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
        value = el.value || '';
        if (el.type === 'password') value = '*****';
    }
    const attrs = {};
    Array.from(el.attributes).forEach(a => {
        if (a.name !== 'style' && a.name.indexOf('on') !== 0) attrs[a.name] = a.value;
    });
    const selector = _buildSelector(el);
    const html = el.outerHTML.substring(0, 2000);
    return {
        tag: tag,
        id: id || undefined,
        classes: classes.length ? classes : undefined,
        selector: selector,
        text: text || undefined,
        value: value || undefined,
        attributes: Object.keys(attrs).length ? attrs : undefined,
        position: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
        visible: rect.width > 0 && rect.height > 0,
        html: html
    };
}

function _buildSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const path = [];
    let cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
        let tag = cur.tagName.toLowerCase();
        if (cur.id) { path.unshift('#' + CSS.escape(cur.id)); break; }
        const parent = cur.parentElement;
        if (parent) {
            const siblings = Array.from(parent.children).filter(s => s.tagName === cur.tagName);
            const idx = siblings.indexOf(cur) + 1;
            tag += ':nth-child(' + (Array.from(parent.children).indexOf(cur) + 1) + ')';
        }
        path.unshift(tag);
        cur = parent;
    }
    return path.join(' > ');
}

const _headerEl = aiChatModal && aiChatModal.querySelector('.ai-chat-header');
if (_headerEl) {
    _headerEl.addEventListener('mousedown', _dragStart);
    _headerEl.addEventListener('touchstart', _dragStart, { passive: true });
}