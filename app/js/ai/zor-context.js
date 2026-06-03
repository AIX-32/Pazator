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
    loadContextFraudLogs();
    contextNotes.value = '';
}

function loadContextPeople() {
    const container = document.getElementById('contextPeople');

    if (pazatorData.humans.length === 0) {
        container.innerHTML = '<p style="color: #777; text-align: center;">No people in database</p>';
        return;
    }

    container.innerHTML = '';

    pazatorData.humans.forEach(human => {
        const personDiv = document.createElement('div');
        personDiv.style.display = 'flex';
        personDiv.style.alignItems = 'center';
        personDiv.style.marginBottom = '10px';
        personDiv.style.padding = '8px';
        personDiv.style.borderRadius = '5px';
        personDiv.style.background = 'rgba(40, 40, 40, 0.7)';
        personDiv.style.cursor = 'pointer';
        personDiv.style.transition = 'all 0.2s ease';

        personDiv.innerHTML = `
                    <input type="checkbox" id="context_person_${human.id}" value="${human.id}" style="margin-right: 10px;">
                    <label for="context_person_${human.id}" style="flex: 1; cursor: pointer;">
                        <strong>[${human.id}] ${human.name}</strong>
                        <br>
                        <small style="color: #666;">Credit: ${human.credit !== undefined ? Math.round(human.credit) : 'N/A'}</small>
                    </label>
                `;

        personDiv.addEventListener('mouseenter', () => {
            personDiv.style.background = 'rgba(60, 60, 60, 0.7)';
        });

        personDiv.addEventListener('mouseleave', () => {
            personDiv.style.background = 'rgba(40, 40, 40, 0.7)';
        });

        container.appendChild(personDiv);
    });
}

function loadContextChats() {
    const container = document.getElementById('contextChats');
    const chatHistory = ChatStorageManager.getChatHistory();

    if (chatHistory.length === 0) {
        container.innerHTML = '<p style="color: #777; text-align: center;">No chats uploaded yet</p>';
        return;
    }

    container.innerHTML = '';

    chatHistory.forEach((chat, index) => {
        const chatDiv = document.createElement('div');
        chatDiv.style.display = 'flex';
        chatDiv.style.alignItems = 'center';
        chatDiv.style.marginBottom = '10px';
        chatDiv.style.padding = '8px';
        chatDiv.style.borderRadius = '5px';
        chatDiv.style.background = 'rgba(40, 40, 40, 0.7)';
        chatDiv.style.cursor = 'pointer';
        chatDiv.style.transition = 'all 0.2s ease';

        const date = new Date(chat.timestamp).toLocaleDateString();
        const participants = chat.participants.map(p => p.name).join(', ');
        const messageCount = chat.parsed?.messageCount || chat.content.split(' ').length;

        chatDiv.innerHTML = `
                    <input type="checkbox" id="context_chat_${index}" value="${index}" style="margin-right: 10px;">
                    <label for="context_chat_${index}" style="flex: 1; cursor: pointer;">
                        <strong>${chat.source.toUpperCase()} Chat</strong>
                        <br>
                        <small style="color: #aaa;">${participants} • ${messageCount} messages • ${date}</small>
                    </label>
                `;

        chatDiv.addEventListener('mouseenter', () => {
            chatDiv.style.background = 'rgba(60, 60, 60, 0.7)';
        });

        chatDiv.addEventListener('mouseleave', () => {
            chatDiv.style.background = 'rgba(40, 40, 40, 0.7)';
        });

        container.appendChild(chatDiv);
    });
}

function loadContextFraudLogs() {
    const container = document.getElementById('contextFraudLogs');

    const fraudLogs = JSON.parse(localStorage.getItem('fraudLogs') || '[]');
    const terroristLogs = JSON.parse(localStorage.getItem('terroristLogs') || '[]');

    const allLogs = [
        ...fraudLogs.map(log => ({ ...log, category: 'fraud' })),
        ...terroristLogs.map(log => ({ ...log, category: 'terrorist' }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    container.innerHTML = '';

    if (allLogs.length === 0) {
        container.innerHTML = '<p style="color: #777; text-align: center;">No security logs generated yet<br>Run fraud/terrorist detection to generate logs</p>';
        return;
    }

    allLogs.forEach((log, index) => {
        const logDiv = document.createElement('div');
        logDiv.style.display = 'flex';
        logDiv.style.alignItems = 'center';
        logDiv.style.marginBottom = '10px';
        logDiv.style.padding = '8px';
        logDiv.style.borderRadius = '5px';
        logDiv.style.background = 'rgba(40, 40, 40, 0.7)';
        logDiv.style.cursor = 'pointer';
        logDiv.style.transition = 'all 0.2s ease';

        const severityColor = log.severity === 'high' ? '#ff6b6b' :
            log.severity === 'medium' ? '#ffd93d' : '#6bcf7f';

        const iconClass = log.category === 'fraud' ? 'fa-exclamation-circle' : 'fa-user-secret';
        const date = new Date(log.timestamp).toLocaleDateString();

        logDiv.innerHTML = `
                    <input type="checkbox" id="context_log_${log.id}" value="${log.id}" style="margin-right: 10px;">
                    <label for="context_log_${log.id}" style="flex: 1; cursor: pointer;">
                        <strong style="color: ${severityColor}"><i class="fas ${iconClass}" style="margin-right:6px;"></i>${log.type}</strong>
                        <br>
                        <small style="color: #aaa;">${log.person || 'Unknown person'} • ${log.confidence || 'Medium'} confidence • ${date}</small>
                    </label>
                `;

        logDiv.addEventListener('mouseenter', () => {
            logDiv.style.background = 'rgba(60, 60, 60, 0.7)';
        });

        logDiv.addEventListener('mouseleave', () => {
            logDiv.style.background = 'rgba(40, 40, 40, 0.7)';
        });

        container.appendChild(logDiv);
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
        fraudLogs: [],
        notes: contextNotes.value.trim(),
        timestamp: new Date().toISOString()
    };

    document.querySelectorAll('#contextPeople input[type="checkbox"]:checked').forEach(checkbox => {
        const human = pazatorData.humans.find(h => h.id === checkbox.value);
        if (human) {
            selectedContext.people.push({
                id: human.id,
                name: human.name,
                credit: human.credit,
                extraNotes: human.extraNotes
            });
        }
    });

    const chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    document.querySelectorAll('#contextChats input[type="checkbox"]:checked').forEach(checkbox => {
        const chatIndex = parseInt(checkbox.value);
        if (chatHistory[chatIndex]) {
            selectedContext.chats.push(chatHistory[chatIndex]);
        }
    });

    document.querySelectorAll('#contextFraudLogs input[type="checkbox"]:checked').forEach(checkbox => {
        const logId = checkbox.value;
        const allLogs = [
            ...JSON.parse(localStorage.getItem('fraudLogs') || '[]'),
            ...JSON.parse(localStorage.getItem('terroristLogs') || '[]')
        ];

        const selectedLog = allLogs.find(log => log.id === logId);
        if (selectedLog) {
            selectedContext.fraudLogs.push(selectedLog);
        }
    });

    storeAIContext(selectedContext);

    updateContextDisplay(selectedContext);

    contextModal.style.display = 'none';
    contextModal.style.zIndex = '-1';
    aiChatModal.style.pointerEvents = 'auto';

    showAlert(`Context applied! Selected: ${selectedContext.people.length} people, ${selectedContext.chats.length} chats, ${selectedContext.fraudLogs.length} fraud logs.`, 'Context Updated', 'success');
});

function updateContextDisplay(context) {
    const contextDisplay = document.getElementById('contextDisplay');

    if (!contextDisplay) return;

    contextDisplay.innerHTML = '';

    const hasContext = context.people.length > 0 || context.chats.length > 0 || context.fraudLogs.length > 0;

    if (!hasContext) {
        contextDisplay.style.display = 'none';
        return;
    }

    contextDisplay.style.display = 'flex';

    context.people.forEach(person => {
        const card = document.createElement('div');
        card.className = 'context-card people';
        card.innerHTML = `
                    <span class="card-icon"></span>
                    <span class="card-name" title="${person.name}">${person.name}</span>
                `;
        card.addEventListener('click', () => {
            showAlert(`Person: ${person.name}\nCredit: ${person.credit !== undefined ? Math.round(person.credit) : 'N/A'}\nNotes: ${person.extraNotes || 'None'}`, 'Person Details', 'info');
        });
        contextDisplay.appendChild(card);
    });

    context.chats.forEach((chat, index) => {
        const card = document.createElement('div');
        card.className = 'context-card chats';
        const participants = chat.participants.map(p => p.name).join(', ');
        const wordCount = chat.content.split(' ').length;
        card.innerHTML = `
                    <span class="card-icon"></span>
                    <span class="card-name" title="${chat.source.toUpperCase()} Chat - ${participants}">${chat.source.toUpperCase()} Chat (${wordCount} words)</span>
                `;
        card.addEventListener('click', () => {
            showAlert(`${chat.source.toUpperCase()} Chat\nParticipants: ${participants}\nWords: ${wordCount}\nContext: ${chat.context || 'None'}`, 'Chat Details', 'info');
        });
        contextDisplay.appendChild(card);
    });

    context.fraudLogs.forEach(log => {
        const card = document.createElement('div');
        card.className = 'context-card fraud';
        card.innerHTML = `
                    <span class="card-icon"><i class="fas fa-exclamation-circle"></i></span>
                    <span class="card-name" title="${log.type} - ${log.person || 'Unknown'}">${log.type} (${log.person || 'Unknown'})</span>
                `;
        card.addEventListener('click', () => {
            showAlert(`${log.type}\nPerson: ${log.person || 'Unknown'}\nSeverity: ${log.severity || 'Unknown'}\nEvidence: ${log.evidence || 'None'}`, 'Fraud Log Details', 'warning');
        });
        contextDisplay.appendChild(card);
    });

    if (hasContext) {
        const clearBtn = document.createElement('div');
        clearBtn.className = 'context-card';
        clearBtn.style.backgroundColor = 'rgba(200, 50, 50, 0.3)';
        clearBtn.style.borderColor = '#cc4444';
        clearBtn.innerHTML = `
                    <span class="card-icon"><i class="fas fa-trash-alt"></i></span>
                    <span class="card-name">Clear All Context</span>
                `;
        clearBtn.addEventListener('click', () => {
            localStorage.removeItem('adminProvidedContext');
            updateContextDisplay({ people: [], chats: [], fraudLogs: [] });
        });
        contextDisplay.appendChild(clearBtn);
    }
}

function storeAIContext(context) {
    let contextSummary = 'Context provided by admin:\n\n';

    setTimeout(() => {
        localStorage.removeItem('adminProvidedContext');
    }, 300000);

    if (context.people.length > 0) {
        contextSummary += 'PEOPLE:\n';
        context.people.forEach(person => {
            contextSummary += `- ${person.name} (Credit: ${person.credit !== undefined ? Math.round(person.credit) : 'N/A'})\n`;
            if (person.extraNotes) {
                contextSummary += `  Notes: ${person.extraNotes}\n`;
            }
        });
        contextSummary += '\n';
    }

    if (context.chats.length > 0) {
        contextSummary += 'CHATS:\n';
        context.chats.forEach((chat, index) => {
            contextSummary += `${index + 1}. ${chat.source.toUpperCase()} chat with ${chat.participants.length} participants (${chat.content.split(' ').length} words)\n`;
        });
        contextSummary += '\n';
    }

    if (context.fraudLogs.length > 0) {
        contextSummary += 'FRAUD ALERTS:\n';
        context.fraudLogs.forEach(log => {
            contextSummary += `- ${log.type}\n`;
        });
        contextSummary += '\n';
    }

    if (context.notes) {
        contextSummary += `ADDITIONAL NOTES: ${context.notes}\n`;
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
            if (aiSendBtn) {
                aiSendBtn.disabled = false;
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
    const command = aiInput.value.trim();
    if (command) {
        aiSendBtn.disabled = true;
        setAiSendLoading(true);

        requestAnimationFrame(() => {
            processAICommand(command);
        });
    }
});
