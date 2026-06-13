var __aiAbortController = null;
var __aiProcessing = false;

function cancelCurrentAIRequest() {
    __aiProcessing = false;
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
        var link = document.createElement('a');
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
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str || ''));
    return d.innerHTML;
}

function addToolCallCard(action, result) {
    var card = document.createElement('div');
    card.className = 'ai-message tool';
    var actionName = action.action || 'tool';
    var detail = '';
    if (action.data && action.data.name) detail = action.data.name;
    else if (action.title) detail = action.title;
    var success = result && result.success !== false;
    var label = escapeHtml(actionName);
    if (detail) label += ' \u2014 ' + escapeHtml(detail);
    label += '  ' + (success ? '\u2713' : '\u2717');
    card.textContent = label;
    if (!success) {
        card.classList.add('tool-failed');
        card.style.borderColor = '#ff6b6b';
        card.style.cursor = 'pointer';
        var errMsg = result && result.message ? result.message : 'Action failed.';
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
    console.log('saveCurrentChat called, aiChatHistory:', aiChatHistory);
    if (aiChatHistory.length === 0) return;

    const existingChats = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    console.log('Existing chats:', existingChats);

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

    console.log('Saving new chat:', newChat);
    console.log('JSON string:', JSON.stringify(newChat));
    existingChats.push(newChat);

    const finalJson = JSON.stringify(existingChats);
    console.log('Final JSON to save:', finalJson);

    try {
        localStorage.setItem('chatHistory', finalJson);
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

async function processAICommand(command) {
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
            var dataSummary = window.pazatorStore ? window.pazatorStore.getAICompatData() : {
                totalHumans: pazatorData.humans.length,
                totalEntities: pazatorData.others.length,
                tagCount: tags.length,
                casesCount: cases.length
            };
            var topRisky = dataSummary.topRiskyPeople || [];
            var topRiskyStr = topRisky.length > 0 ? topRisky.map(function (p) {
                return '  - ' + p.name + ' (Threat: ' + p.threatLevel + ', Credit: ' + p.credit + ')';
            }).join('\n') : '  None';

            var dataStr = '';
            if (pazatorData.humans.length < 50) {
                dataStr = 'ALL HUMANS:\n' + JSON.stringify(pazatorData.humans.map(function (h) { return { id: h.id, name: h.name, gender: h.gender, threatLevel: h.threatLevel || 'None', credit: h.credit, tags: h.tags || [] }; })) + '\n\n';
                dataStr += 'ALL OTHERS:\n' + JSON.stringify(pazatorData.others.map(function (o) { return { id: o.id, name: o.name }; })) + '\n\n';
                dataStr += 'TAGS: ' + JSON.stringify(tags || []) + '\n';
            }

            var systemPrompt = 'Act as Zor (Model: PZZ1), a grounded, blunt, mildly skeptical peer in "Pazator: SARPARAST" No emojis, no fluff, no "I\'m here to help". Be direct.\n\n' +
'CURRENT DATABASE:\n' +
(dataStr || 
  'Humans: ' + pazatorData.humans.length + ' | Others: ' + pazatorData.others.length + ' | Cases: ' + (cases ? cases.length : 0) + ' | Tags: ' + (tags ? tags.length : 0) + '\n' +
  'High-risk: ' + (dataSummary.highRiskCount || 0) + ' | Avg credit: ' + (dataSummary.averageCredit || 0) + '\n') +
'\n' +
'SCHEMA:\n' +
'Human: name, gender, birthDate, workplace, credit(0-370), socialClass, maritalStatus, nationality, threatLevel(None/Low/Medium/High/Critical), tags, friends, family, extraNotes.\n' +
'Other: name, note.\n' +
'\n' +
'You operate in turns. Each turn you can:\n' +
'  - Output a JSON action object or an ARRAY of actions\n' +
'  - Output natural text to converse\n' +
'  - Output {"action": "end", "data": {"response": "..."}} when done\n' +
'\n' +
'JSON ACTIONS (single or in an array):\n' +
'{"action": "add_human", "data": {name, gender, birthDate, credit, threatLevel, tags, ...}}\n' +
'{"action": "modify_human", "id": "...", "data": {field: value}}\n' +
'{"action": "delete_human", "id": "..."}\n' +
'{"action": "add_other", "data": {name, note}}\n' +
'{"action": "modify_other", "id": "...", "data": {...}}\n' +
'{"action": "delete_other", "id": "..."}\n' +
'{"action": "list_humans"}\n' +
'{"action": "list_others"}\n' +
'{"action": "count_entries"}\n' +
'{"action": "search", "with": {"q": "search term"}} — search all entities by name/tag/field\n' +
'{"action": "get", "with": {"id": "entity ID"}} — get full details of one person\n' +
'{"action": "list"} — list all people (name, threat, credit)\n' +
'{"action": "stats"} — database statistics\n' +
'{"action": "add_tag", "tag": "name"}\n' +
'{"action": "assign_tag", "id": "...", "tag": "name"}\n' +
'{"action": "remove_tag", "id": "...", "tag": "name"}\n' +
'{"action": "create_case", "title": "...", "description": "..."}\n' +
'{"action": "add_case_note", "title": "...", "note": "..."}\n' +
'{"action": "close_case", "title": "..."}\n' +
'{"action": "add_entity_to_case", "case_title": "...", "entity_name": "..."}\n' +
'{"action": "run_javascript", "data": {code: "..."}}\n' +
'\n' +
'Examples:\n' +
'  Single: {"action": "list_humans"}\n' +
'  Array: [{"action": "add_human", "data": {name: "John"}}, {"action": "add_human", "data": {name: "Jane"}}]\n' +
'\n' +
'Rules:\n' +
'  - Use real IDs from list_humans/list_others, never fake IDs\n' +
'  - If data is in the CURRENT DATABASE section above, use it directly without listing first\n' +
'  - Use {"action": "end", "data": {"response": "..."}} to finish\n' +
'\n' +
(adminContext ? 'ADMIN CONTEXT:\n' + adminContext + '\n\n' : '') +
'Previous conversation:\n' +
aiChatHistory.map(function (m) { return m.role + ': ' + m.content; }).join('\n');

            var messages = [
                { role: "system", content: systemPrompt }
            ];

            for (var hi = 0; hi < aiChatHistory.length; hi++) {
                var hMsg = aiChatHistory[hi];
                messages.push({ role: hMsg.role === 'user' ? 'user' : 'model', content: hMsg.content });
            }
            messages.push({ role: "user", content: command });

            var MAX_LOOPS = 15;
            var loopCount = 0;
            var agentDone = false;
            var textTurnCount = 0;
            var agentDebug = typeof getAgentDebug === 'function' ? getAgentDebug() : false;

            while (loopCount < MAX_LOOPS && !agentDone) {
                loopCount++;

                if (agentDebug) {
                    console.group('Agent Loop, Turn ' + loopCount);
                    console.log('Messages sent to API:', JSON.parse(JSON.stringify(messages)));
                }

                var aiResponse;
                try {
                    if (window.AIQueue) {
                        aiResponse = await AIQueue.enqueue(function (signal) {
                            return geminiChat(messages, signal);
                        });
                    } else {
                        __aiAbortController = new AbortController();
                        aiResponse = await geminiChat(messages, __aiAbortController.signal);
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

                var responseText = aiResponse.content ? aiResponse.content : aiResponse;
                if (agentDebug) {
                    console.log('API response:', responseText);
                }

                var parsed = extractJSONFromResponse(responseText);

                if (parsed) {

                    if (parsed.action === "end") {
                        agentDone = true;
                        var finalText = parsed.data && parsed.data.response ? parsed.data.response : "Done.";
                        hideAiTypingIndicator();
                        addMessageToAIChat(finalText, 'ai');
                        if (agentDebug) console.groupEnd();
                        break;
                    }

                    messages.push({ role: "model", content: responseText });

                    var actions = Array.isArray(parsed) ? parsed : [parsed];
                    var results = [];
                    var hasInvalid = false;

                    for (var ai = 0; ai < actions.length; ai++) {
                        var action = actions[ai];
                        if (!action || !action.action) {
                            hasInvalid = true;
                            continue;
                        }
                        var actionResult = await handleAIAction(action, true);
                        results.push(actionResult);
                        addToolCallCard(action, actionResult);
                    }

                    if (hasInvalid) {
                        messages.push({
                            role: "user",
                            content: "Your last JSON object was missing the required \"action\" field. Every turn you MUST output {\"action\": \"...\"}. Examples: {\"action\": \"list_humans\"}, {\"action\": \"add_human\", \"data\": {\"name\": \"John\"}}. Use {\"action\": \"end\", \"data\": {\"response\": \"...\"}} to finish."
                        });
                        continue;
                    }

                    var resultMessages = [];
                    for (var ri = 0; ri < results.length; ri++) {
                        if (results[ri] && results[ri].message) {
                            resultMessages.push(results[ri].message);
                        }
                    }
                    var dbState = pazatorData.humans.length + ' humans, ' + pazatorData.others.length + ' others, ' + (cases ? cases.length : 0) + ' cases';
                    messages.push({
                        role: "user",
                        content: "Tool result: " + (resultMessages.length > 0 ? resultMessages.join(' | ') : 'Action executed.') + ' | DB now: ' + dbState
                    });

                    if (agentDebug) console.groupEnd();

                    var toolDelay = typeof getToolDelay === 'function' ? getToolDelay() : 0;
                    if (toolDelay > 0) {
                        await new Promise(function (r) { setTimeout(r, toolDelay); });
                    }

                    textTurnCount = 0;
                    showAiTypingIndicator();
                } else {

                    if (textTurnCount < 1) {
                        textTurnCount++;
                        addMessageToAIChat(responseText, 'ai');
                        messages.push({ role: "model", content: responseText });
                        if (agentDebug) console.groupEnd();
                        showAiTypingIndicator();
                        continue;
                    }

                    agentDone = true;
                    hideAiTypingIndicator();
                    addMessageToAIChat(responseText, 'ai');
                    if (agentDebug) console.groupEnd();
                }
            }

            if (loopCount >= MAX_LOOPS && !agentDone) {
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
        requestAnimationFrame(() => {
            setAiSendLoading(false);
            aiInput.value = '';

            aiInput.focus();
        });
    }
}

function extractJSONFromResponse(responseText) {

    try {
        return JSON.parse(responseText);
    } catch (e) {

    }

    const jsonArrayMatches = responseText.match(/\[[\s\S]*?\]/g);
    if (jsonArrayMatches && jsonArrayMatches.length > 1) {
        try {

            let combinedArray = [];
            for (const match of jsonArrayMatches) {
                const parsedArray = JSON.parse(match);
                if (Array.isArray(parsedArray)) {
                    combinedArray = combinedArray.concat(parsedArray);
                } else {
                    combinedArray.push(parsedArray);
                }
            }
            return combinedArray;
        } catch (e) {

        }
    }

    const arrayMatch = responseText.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
        try {
            return JSON.parse(arrayMatch[0]);
        } catch (e) {

        }
    }

    const objectMatch = responseText.match(/\{[\s\S]*\}/);
    if (objectMatch) {
        try {
            var parsedObj = JSON.parse(objectMatch[0]);
            if (parsedObj && (parsedObj.action || parsedObj.use)) {
                return parsedObj;
            }
        } catch (e) {

        }
    }

    const jsonObjects = [];
    let braceCount = 0;
    let currentObject = '';
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < responseText.length; i++) {
        const char = responseText[i];

        if (escapeNext) {
            escapeNext = false;
        } else if (char === '\\') {
            escapeNext = true;
        } else if (char === '"' && !escapeNext) {
            inString = !inString;
        }

        if (!inString) {
            if (char === '{') {
                if (braceCount === 0) {
                    currentObject = '';
                }
                braceCount++;
            } else if (char === '}') {
                braceCount--;
                if (braceCount === 0 && currentObject) {
                    currentObject += char;
                    try {
                        const obj = JSON.parse(currentObject);
                        if (obj.action) {
                            jsonObjects.push(obj);
                        }
                    } catch (e) {

                    }
                    currentObject = '';
                    continue;
                }
            }
        }

        if (braceCount > 0) {
            currentObject += char;
        }
    }

    if (jsonObjects.length > 0) {
        return jsonObjects.length === 1 ? jsonObjects[0] : jsonObjects;
    }

    return null;
}

async function handleBatchActions(actions) {
    try {
        let completedActions = 0;
        let totalActions = actions.length;
        let batchResponse = "I've completed the following actions:\n";
        let hasErrors = false;
        let entityInfos = [];

        const addHumanActions = actions.filter(action => action.action === "add_human");
        const otherActions = actions.filter(action => action.action !== "add_human");

        for (const action of addHumanActions) {
            try {
                const result = await handleAIAction(action, true);
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
                const result = await handleAIAction(action, true);
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
        addMessageToAIChat("Sorry, I encountered an error creating family connections. Please try again.", 'ai');
    }
}

async function handleAIAction(action, isBatch = false) {
    let response = "Action completed.";
    let shouldRespond = !isBatch;
    let success = true;
    let entityInfo = null;

    switch (action.action) {
        case "add_human":
            try {
                const newHuman = {
                    id: generatePersonId(action.data?.name, action.data?.birthDate),
                    ...action.data
                };
                pazatorData.humans.push(newHuman);
                markDataChanged();
                renderObjectCanvas();
                response = `Added human: ${newHuman.name}`;
                entityInfo = { id: newHuman.id, type: 'human', name: newHuman.name };
            } catch (e) {
                response = `Failed to add human: ${e.message}`;
                success = false;
            }
            break;

        case "add_other":
            try {
                const newOther = {
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    ...action.data
                };
                pazatorData.others.push(newOther);
                markDataChanged();
                renderObjectCanvas();
                response = `Added other: ${newOther.name}`;
                entityInfo = { id: newOther.id, type: 'other', name: newOther.name };
            } catch (e) {
                response = `Failed to add other: ${e.message}`;
                success = false;
            }
            break;

        case "delete_human":
            const humanIndex = window.pazatorStore ? pazatorStore.findHumanIndexById(action.id) : pazatorData.humans.findIndex(h => h.id === action.id);
            if (humanIndex !== -1) {
                const deletedName = pazatorData.humans[humanIndex].name;
                pazatorData.humans.splice(humanIndex, 1);
                markDataChanged();
                renderObjectCanvas();
                response = `Deleted human: ${deletedName}`;
            } else {
                response = "Couldn't find that human entry to delete.";
                success = false;
            }
            break;

        case "delete_other":
            const otherIndex = pazatorData.others.findIndex(o => o.id === action.id);
            if (otherIndex !== -1) {
                const deletedName = pazatorData.others[otherIndex].name;
                pazatorData.others.splice(otherIndex, 1);
                markDataChanged();
                renderObjectCanvas();
                response = `Deleted other: ${deletedName}`;
            } else {
                response = "Couldn't find that other entry to delete.";
                success = false;
            }
            break;

        case "modify_human":
            const modHumanIndex = window.pazatorStore ? pazatorStore.findHumanIndexById(action.id) : pazatorData.humans.findIndex(h => h.id === action.id);
            if (modHumanIndex !== -1) {

                if (action.data.family && Array.isArray(action.data.family)) {

                    const familyIds = action.data.family.map(name => {
                        const familyMember = pazatorData.humans.find(h => h.name === name);
                        return familyMember ? familyMember.id : null;
                    }).filter(id => id !== null);

                    action.data.family = familyIds;
                }

                pazatorData.humans[modHumanIndex] = {
                    ...pazatorData.humans[modHumanIndex],
                    ...action.data
                };
                markDataChanged();
                renderObjectCanvas();
                response = `Modified human: ${pazatorData.humans[modHumanIndex].name}`;
                entityInfo = { id: pazatorData.humans[modHumanIndex].id, type: 'human', name: pazatorData.humans[modHumanIndex].name };
            } else {

                const nameMatch = action.id.match(/temp_id_(\d+)/);
                if (nameMatch) {
                    const personIndex = parseInt(nameMatch[1]) - 1;
                    if (personIndex < pazatorData.humans.length) {

                        if (action.data.family && Array.isArray(action.data.family)) {
                            const familyIds = action.data.family.map(name => {
                                const familyMember = pazatorData.humans.find(h => h.name === name);
                                return familyMember ? familyMember.id : null;
                            }).filter(id => id !== null);

                            action.data.family = familyIds;
                        }

                        pazatorData.humans[personIndex] = {
                            ...pazatorData.humans[personIndex],
                            ...action.data
                        };
                        markDataChanged();
                        renderObjectCanvas();
                        response = `Modified human: ${pazatorData.humans[personIndex].name}`;
                        entityInfo = { id: pazatorData.humans[personIndex].id, type: 'human', name: pazatorData.humans[personIndex].name };
                    } else {
                        response = "Couldn't find that human entry to modify.";
                        success = false;
                    }
                } else {
                    response = "Couldn't find that human entry to modify.";
                    success = false;
                }
            }
            break;

        case "modify_other":
            const modOtherIndex = pazatorData.others.findIndex(o => o.id === action.id);
            if (modOtherIndex !== -1) {
                pazatorData.others[modOtherIndex] = {
                    ...pazatorData.others[modOtherIndex],
                    ...action.data
                };
                markDataChanged();
                renderObjectCanvas();
                response = `Modified other: ${pazatorData.others[modOtherIndex].name}`;
                entityInfo = { id: pazatorData.others[modOtherIndex].id, type: 'other', name: pazatorData.others[modOtherIndex].name };
            } else {
                response = "Couldn't find that other entry to modify.";
                success = false;
            }
            break;

        case "list_humans":
            const humanNames = pazatorData.humans.map(h => h.name).join(', ');
            response = `Here are your human entries: ${humanNames || 'None'}`;
            break;

        case "list_others":
            const otherNames = pazatorData.others.map(o => o.name).join(', ');
            response = `Here are your other entries: ${otherNames || 'None'}`;
            break;

        case "count_entries":
            const humanCount = pazatorData.humans.length;
            const otherCount = pazatorData.others.length;
            response = `You have ${humanCount} human entries and ${otherCount} other entries, for a total of ${humanCount + otherCount} entries.`;
            break;

        case "add_tag":
            if (action.tag && !tags.includes(action.tag)) {
                tags.push(action.tag);
                markDataChanged();
                renderTags();
                response = `I've added the tag '${action.tag}' to the tag list.`;
            } else if (tags.includes(action.tag)) {
                response = `The tag '${action.tag}' already exists.`;
            } else {
                response = `Invalid tag name.`;
                success = false;
            }
            break;

        case "assign_tag":
            const humanToTag = window.pazatorStore ? pazatorStore.findHumanIndexById(action.id) : pazatorData.humans.findIndex(h => h.id === action.id);
            if (humanToTag !== -1) {
                if (!pazatorData.humans[humanToTag].tags) {
                    pazatorData.humans[humanToTag].tags = [];
                }
                if (!pazatorData.humans[humanToTag].tags.includes(action.tag)) {
                    pazatorData.humans[humanToTag].tags.push(action.tag);
                    markDataChanged();
                    renderObjectCanvas();
                    response = `I've assigned the tag '${action.tag}' to ${pazatorData.humans[humanToTag].name}.`;
                } else {
                    response = `${pazatorData.humans[humanToTag].name} already has the tag '${action.tag}'.`;
                }
            } else {
                response = "Couldn't find that human entry to assign a tag to.";
                success = false;
            }
            break;

        case "remove_tag":
            const humanToRemoveTag = window.pazatorStore ? pazatorStore.findHumanIndexById(action.id) : pazatorData.humans.findIndex(h => h.id === action.id);
            if (humanToRemoveTag !== -1) {
                if (pazatorData.humans[humanToRemoveTag].tags && pazatorData.humans[humanToRemoveTag].tags.includes(action.tag)) {
                    pazatorData.humans[humanToRemoveTag].tags = pazatorData.humans[humanToRemoveTag].tags.filter(t => t !== action.tag);
                    markDataChanged();
                    renderObjectCanvas();
                    response = `I've removed the tag '${action.tag}' from ${pazatorData.humans[humanToRemoveTag].name}.`;
                } else {
                    response = `${pazatorData.humans[humanToRemoveTag].name} doesn't have the tag '${action.tag}'.`;
                }
            } else {
                response = "Couldn't find that human entry to remove a tag from.";
                success = false;
            }
            break;

        case "add_object":
            try {
                var objType = (action.data?.type || '').trim();
                var objName = (action.data?.name || '').trim();
                if (!objType || !objName) {
                    response = "Both type and name are required for add_object.";
                    success = false;
                } else if (!window.pazatorObjects) {
                    response = "Object system not available.";
                    success = false;
                } else {
                    var validTypes = pazatorObjects.getTypes();
                    if (validTypes.indexOf(objType) === -1) {
                        response = "Invalid type '" + objType + "'. Valid types: " + validTypes.join(', ');
                        success = false;
                    } else {
                        var objId = pazatorObjects.getOrCreate(objType, objName);
                        var createdObj = pazatorObjects.getById(objId);
                        response = "Object '" + objName + "' (" + objType + ") is ready." + (createdObj ? " Usage count: " + createdObj.usageCount : "");
                    }
                }
            } catch (e) {
                response = "Failed to add object: " + e.message;
                success = false;
            }
            break;

        case "create_case":
            try {
                const newCase = {
                    id: 'case_' + Date.now(),
                    title: action.title || 'Untitled Case',
                    description: action.description || '',
                    status: action.status || 'open',
                    entities: [],
                    timeline: [{
                        type: 'note',
                        content: '<strong>Case created</strong>',
                        timestamp: Date.now()
                    }],
                    createdAt: Date.now()
                };
                cases.push(newCase);
                saveCases();
                renderCasesList();
                selectCase(newCase.id);
                response = `Created case: "${newCase.title}"`;
            } catch (e) {
                response = `Failed to create case: ${e.message}`;
                success = false;
            }
            break;

        case "edit_case":
            try {
                const caseData = cases.find(c => c.id === action.id || c.title.toLowerCase() === action.title?.toLowerCase());
                if (caseData) {
                    if (action.title) caseData.title = action.title;
                    if (action.description !== undefined) caseData.description = action.description;
                    if (action.status) caseData.status = action.status;
                    caseData.timeline.push({
                        type: 'note',
                        content: `<strong>Case edited</strong>`,
                        timestamp: Date.now()
                    });
                    saveCases();
                    renderCasesList();
                    if (selectedCaseId === caseData.id) selectCase(caseData.id);
                    response = `Updated case: "${caseData.title}"`;
                } else {
                    response = "Couldn't find that case.";
                    success = false;
                }
            } catch (e) {
                response = `Failed to edit case: ${e.message}`;
                success = false;
            }
            break;

        case "add_case_note":
            try {
                const caseData = cases.find(c => c.id === action.id || c.title.toLowerCase() === action.title?.toLowerCase());
                if (caseData) {
                    caseData.timeline.push({
                        type: 'note',
                        content: `<strong>Note</strong>: ${action.note}`,
                        timestamp: Date.now()
                    });
                    saveCases();
                    if (selectedCaseId === caseData.id) selectCase(caseData.id);
                    response = `Added note to case "${caseData.title}": "${action.note}"`;
                } else {
                    response = "Couldn't find that case.";
                    success = false;
                }
            } catch (e) {
                response = `Failed to add note: ${e.message}`;
                success = false;
            }
            break;

        case "close_case":
            try {
                const caseData = cases.find(c => c.id === action.id || c.title.toLowerCase() === action.title?.toLowerCase());
                if (caseData) {
                    caseData.status = 'closed';
                    caseData.timeline.push({
                        type: 'status-changed',
                        content: '<strong>Case closed</strong>',
                        timestamp: Date.now()
                    });
                    saveCases();
                    renderCasesList();
                    response = `Closed case: "${caseData.title}"`;
                } else {
                    response = "Couldn't find that case.";
                    success = false;
                }
            } catch (e) {
                response = `Failed to close case: ${e.message}`;
                success = false;
            }
            break;

        case "add_entity_to_case":
            try {
                const caseData = cases.find(c => c.id === action.case_id || c.title.toLowerCase() === action.case_title?.toLowerCase());
                if (caseData) {
                    const entity = pazatorData.humans.find(h => h.id === action.entity_id || h.name.toLowerCase() === action.entity_name?.toLowerCase())
                        || pazatorData.others.find(o => o.id === action.entity_id || o.name.toLowerCase() === action.entity_name?.toLowerCase());
                    if (entity && !caseData.entities.includes(entity.id)) {
                        caseData.entities.push(entity.id);
                        caseData.timeline.push({
                            type: 'entity-added',
                            content: `<strong>Entity added</strong>: ${entity.name}`,
                            timestamp: Date.now()
                        });
                        saveCases();
                        if (selectedCaseId === caseData.id) selectCase(caseData.id);
                        response = `Added ${entity.name} to case "${caseData.title}"`;
                    } else if (!entity) {
                        response = "Couldn't find that entity.";
                        success = false;
                    } else {
                        response = `${entity.name} is already in this case.`;
                    }
                } else {
                    response = "Couldn't find that case.";
                    success = false;
                }
            } catch (e) {
                response = `Failed to add entity to case: ${e.message}`;
                success = false;
            }
            break;

        case "run_javascript":
            try {
                var jsCode = action.data?.code || action.code || '';
                var jsTitle = action.data?.title || action.title || 'JavaScript Action';
                var jsDesc = action.data?.description || action.description || '';
                if (!jsCode) {
                    response = "No JavaScript code provided.";
                    success = false;
                } else if (typeof showModal !== 'function') {
                    response = "Cannot show confirmation dialog.";
                    success = false;
                } else {
                    var confirmed = await new Promise(function (resolve) {
                        showModal({
                            title: 'Run JavaScript',
                            type: 'warning',
                            html: '<div style="font-size:0.85rem;">' +
                                '<div style="margin-bottom:8px;"><strong>Title:</strong> ' + escapeHtml(jsTitle) + '</div>' +
                                (jsDesc ? '<div style="margin-bottom:8px;color:#aaa;"><strong>Description:</strong> ' + escapeHtml(jsDesc) + '</div>' : '') +
                                '<div style="margin-bottom:6px;font-size:0.75rem;color:#888;">Code to execute:</div>' +
                                '<pre style="background:rgba(0,0,0,0.4);padding:10px;border-radius:6px;font-size:0.75rem;font-family:monospace;max-height:300px;overflow:auto;white-space:pre-wrap;word-break:break-word;color:#ddd;">' + escapeHtml(jsCode) + '</pre>' +
                                '</div>',
                            buttons: [
                                { text: 'Cancel', primary: false, onClick: function () { hideModal(); resolve(false); } },
                                { text: 'Run', primary: true, danger: true, onClick: function () { hideModal(); resolve(true); } }
                            ]
                        });
                    });
                    if (confirmed) {
                        try {
                            var result = new Function(jsCode)();
                            if (result && typeof result.then === 'function') {
                                result = await result;
                            }
                            response = 'JavaScript executed successfully' + (result !== undefined ? ': ' + JSON.stringify(result) : '.');
                        } catch (e) {
                            response = 'JavaScript error: ' + e.message;
                            success = false;
                        }
                    } else {
                        response = 'JavaScript execution cancelled.';
                        success = false;
                    }
                }
            } catch (e) {
                response = 'Failed to run JavaScript: ' + e.message;
                success = false;
            }
            break;

        case "search":
        case "get":
        case "list":
        case "stats":
            try {
                var toolResult = ZorTools.run(action.action, action.with || {});
                if (toolResult.error) {
                    response = "Tool error: " + toolResult.error;
                    success = false;
                } else {
                    response = action.action + " returned: " + JSON.stringify(toolResult);
                }
            } catch (e) {
                response = "Tool error: " + e.message;
                success = false;
            }
            break;

        default:
            if (action.action && action.action !== '?') {
                response = "Unknown action: \"" + action.action + "\". Valid actions: add_human, add_other, modify_human, modify_other, delete_human, delete_other, list_humans, list_others, count_entries, add_tag, assign_tag, remove_tag, add_object, create_case, edit_case, add_case_note, close_case, add_entity_to_case, run_javascript, end.";
            } else {
                response = "Your JSON object is missing the required \"action\" field. Every turn you MUST output a JSON object with an \"action\" key. Examples: {\"action\": \"list_humans\"}, {\"action\": \"add_human\", \"data\": {\"name\": \"...\"}}, {\"action\": \"end\", \"data\": {\"response\": \"Done.\"}}.";
            }
            success = false;
            shouldRespond = true;
    }

    if (isBatch) {
        return { success, message: response, entityInfo };
    } else if (shouldRespond) {
        addMessageToAIChat(response, 'ai', entityInfo);
    }

    return { success, message: response, entityInfo };
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

// ── Windowed mode toggle ──────────────────────────────────────────
var _windowedActive = false;
var _dragState = null;

function toggleWindowedMode() {
    _windowedActive = !_windowedActive;
    var btn = document.getElementById('windowToggleBtn');
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

// ── Drag logic ────────────────────────────────────────────────────
function _dragStart(e) {
    if (!aiChatModal.classList.contains('windowed')) return;
    if (e.target.closest('.header-right')) return;
    var rect = aiChatModal.getBoundingClientRect();
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
    var cx = e.clientX || (e.touches && e.touches[0].clientX);
    var cy = e.clientY || (e.touches && e.touches[0].clientY);
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

// ── Init ──────────────────────────────────────────────────────────
var _windowToggleBtn = document.getElementById('windowToggleBtn');
if (_windowToggleBtn) _windowToggleBtn.addEventListener('click', toggleWindowedMode);

var _selectBtn = document.getElementById('zorSelectBtn');
if (_selectBtn) _selectBtn.addEventListener('click', toggleSelectMode);
var _selectActive = false;
var _selectOverlay = null;
var _selectTooltip = null;
var _lastHighlighted = null;

function toggleSelectMode() {
    _selectActive = !_selectActive;
    var btn = document.getElementById('zorSelectBtn');
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
    var el = e.target;
    if (el.closest('.pz-select-tooltip') || el.closest('.ai-chat-modal')) return;
    if (_lastHighlighted) _lastHighlighted.classList.remove('pz-select-highlight');
    _lastHighlighted = el;
    el.classList.add('pz-select-highlight');
}

function _selectOnClick(e) {
    if (!_selectActive) return;
    var el = e.target;
    if (el.closest('.pz-select-tooltip') || el.closest('.ai-chat-modal') || el.closest('.header-right')) {
        e.preventDefault();
        e.stopPropagation();
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    _selectActive = false;
    _selectCleanup();
    var info = _captureElementInfo(el);
    addMessageToAIChat('(Selected element fed to Zor for context)', 'system');
    var msg = '**Element selected:**\n```json\n' + JSON.stringify(info, null, 2) + '\n```\n\nThis element is now the active selection. Use the tool `get_element_info` with selector `' + info.selector + '` to interact with it.';
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
    var btn = document.getElementById('zorSelectBtn');
    if (btn) {
        btn.classList.remove('active');
        btn.style.borderColor = '';
        btn.style.color = '';
        btn.style.boxShadow = '';
    }
}

function _captureElementInfo(el) {
    var rect = el.getBoundingClientRect();
    var tag = el.tagName.toLowerCase();
    var id = el.id || '';
    var classes = Array.from(el.classList).filter(function (c) { return c.indexOf('pz-') !== 0; });
    var text = (el.textContent || '').trim().substring(0, 500);
    var value = '';
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
        value = el.value || '';
        if (el.type === 'password') value = '*****';
    }
    var attrs = {};
    Array.from(el.attributes).forEach(function (a) {
        if (a.name !== 'style' && a.name.indexOf('on') !== 0) attrs[a.name] = a.value;
    });
    var selector = _buildSelector(el);
    var html = el.outerHTML.substring(0, 2000);
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
    var path = [];
    var cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
        var tag = cur.tagName.toLowerCase();
        if (cur.id) { path.unshift('#' + CSS.escape(cur.id)); break; }
        var parent = cur.parentElement;
        if (parent) {
            var siblings = Array.from(parent.children).filter(function (s) { return s.tagName === cur.tagName; });
            var idx = siblings.indexOf(cur) + 1;
            tag += ':nth-child(' + (Array.from(parent.children).indexOf(cur) + 1) + ')';
        }
        path.unshift(tag);
        cur = parent;
    }
    return path.join(' > ');
}

var _headerEl = aiChatModal && aiChatModal.querySelector('.ai-chat-header');
if (_headerEl) {
    _headerEl.addEventListener('mousedown', _dragStart);
    _headerEl.addEventListener('touchstart', _dragStart, { passive: true });
}
