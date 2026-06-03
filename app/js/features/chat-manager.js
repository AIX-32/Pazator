function getVisibleChatIndices() {
    const history = ChatStorageManager.getChatHistory();
    return history.map((chat, i) => i).filter(i => {
        if (chatSourceFilter && chat.source !== chatSourceFilter) return false;
        if (chatSearchFilter) {
            const searchable = [
                chat.source,
                chat.content,
                chat.context,
                ...chat.participants.map(p => p.name)
            ].join(' ').toLowerCase();
            if (!searchable.includes(chatSearchFilter)) return false;
        }
        return true;
    });
}

function updateStorageMetrics() {
    const stats = ChatStorageManager.getStorageStats();
    if (storageUsedMetric) {
        storageUsedMetric.textContent = stats.totalSizeMB + 'MB';
    }

    const history = ChatStorageManager.getChatHistory();
    const sourceCounts = { whatsapp: 0, telegram: 0, discord: 0, signal: 0, manual: 0 };
    history.forEach(chat => {
        const source = chat.source?.toLowerCase() || 'manual';
        if (sourceCounts.hasOwnProperty(source)) {
            sourceCounts[source]++;
        } else {
            sourceCounts.manual++;
        }
    });

    const el = {
        whatsapp: document.getElementById('whatsappCount'),
        telegram: document.getElementById('telegramCount'),
        discord: document.getElementById('discordCount'),
        signal: document.getElementById('signalCount'),
        manual: document.getElementById('manualCount')
    };

    Object.entries(sourceCounts).forEach(([source, count]) => {
        if (el[source]) el[source].textContent = count;
    });

    const totalChatsEl = document.getElementById('totalChatsCount');
    if (totalChatsEl) totalChatsEl.textContent = stats.totalChats;
}

function triggerImportChats() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            let chatsToImport = [];
            if (Array.isArray(data)) {
                chatsToImport = data;
            } else if (data.chats && Array.isArray(data.chats)) {
                chatsToImport = data.chats;
            } else {
                showAlert('Invalid chat file format', 'Error', 'error');
                return;
            }

            let imported = 0;
            const existingHistory = ChatStorageManager.getChatHistory();
            const existingContent = new Set(existingHistory.map(c => c.content.substring(0, 100)));

            for (const chat of chatsToImport) {
                if (!existingContent.has(chat.content?.substring(0, 100))) {
                    ChatStorageManager.saveChat(chat);
                    imported++;
                }
            }

            loadSavedChats();
            showAlert(`Imported ${imported} new chats (${chatsToImport.length - imported} duplicates skipped)`, 'Import Complete', 'success');
        } catch (err) {
            console.error('Import error:', err);
            showAlert('Failed to import chats: ' + err.message, 'Error', 'error');
        }
    };
    input.click();
}

function triggerExportChatsJson() {
    exportChatReport('json');
}

function triggerViewChatStats() {
    const stats = ChatStorageManager.getStorageStats();
    const history = ChatStorageManager.getChatHistory();

    const sourceStats = {};
    history.forEach(chat => {
        sourceStats[chat.source] = (sourceStats[chat.source] || 0) + 1;
    });

    const avgMessages = history.length > 0
        ? Math.round(history.reduce((sum, c) => sum + (c.parsed?.messageCount || c.content.split(' ').length), 0) / history.length)
        : 0;

    const dateRange = history.length > 0
        ? {
            oldest: new Date(Math.min(...history.map(c => new Date(c.timestamp).getTime()))).toLocaleDateString(),
            newest: new Date(Math.max(...history.map(c => new Date(c.timestamp).getTime()))).toLocaleDateString()
        }
        : null;

    let report = `=== Chat Storage Statistics ===\n\n`;
    report += `Total Chats: ${stats.totalChats}\n`;
    report += `Total Size: ${stats.totalSizeMB}MB\n`;
    report += `Average Messages per Chat: ${avgMessages}\n\n`;

    report += `=== By Source ===\n`;
    Object.entries(sourceStats).forEach(([source, count]) => {
        report += `${source.toUpperCase()}: ${count} chats\n`;
    });

    if (dateRange) {
        report += `\n=== Date Range ===\n`;
        report += `Oldest: ${dateRange.oldest}\n`;
        report += `Newest: ${dateRange.newest}\n`;
    }

    showAlert(report, 'Chat Statistics', 'info');
}

function triggerFindDuplicates() {
    const history = ChatStorageManager.getChatHistory();

    const hashMap = new Map();
    const duplicates = [];

    history.forEach((chat, index) => {
        const hash = chat.content.substring(0, 500);
        if (hashMap.has(hash)) {
            duplicates.push({
                original: hashMap.get(hash),
                duplicate: index
            });
        } else {
            hashMap.set(hash, index);
        }
    });

    if (duplicates.length === 0) {
        showAlert('No duplicate chats found!', 'Duplicates Check', 'success');
    } else {
        let report = `Found ${duplicates.length} potential duplicate(s):\n\n`;
        duplicates.forEach((dup, i) => {
            const origChat = history[dup.original];
            const dupChat = history[dup.duplicate];
            report += `${i + 1}. Original: [${origChat.source.toUpperCase()}] ${origChat.participants.map(p => p.name).join(', ')} (${new Date(origChat.timestamp).toLocaleDateString()})\n`;
            report += `   Duplicate: [${dupChat.source.toUpperCase()}] ${dupChat.participants.map(p => p.name).join(', ')} (${new Date(dupChat.timestamp).toLocaleDateString()})\n\n`;
        });
        showAlert(report, 'Duplicate Chats Found', 'warning');
    }
}

function triggerExportChatReport() {
    exportChatReport('txt');
}

function triggerRefreshChatList() {
    loadSavedChats();
    updateStorageMetrics();
    showAlert('Chat list refreshed', 'Refresh', 'success');
}

function updateLastScanTime() {
    if (lastScanTime && lastAnalysisTimestamp) {
        lastScanTime.textContent = new Date(lastAnalysisTimestamp).toLocaleTimeString();
    }
}

document.getElementById('generateThreatReportBtn')?.addEventListener('click', () => {
    generateThreatReport();
});

document.getElementById('reviewArchiveBtn')?.addEventListener('click', () => {
    reviewHistoricalPatterns();
});

function sortByCredit() {
    pazatorData.humans.sort((a, b) => {
        const creditA = a.credit !== undefined ? a.credit : -1;
        const creditB = b.credit !== undefined ? b.credit : -1;
        return creditB - creditA;
    });

    saveData();
    renderObjectCanvas();
    updateCreditStats();

    showAlert(`Sorted ${pazatorData.humans.length} people by credit score!`, 'Sorted', 'success');
}

function updateCreditStats() {
    const creditStats = document.getElementById('creditStats');
    if (!creditStats || pazatorData.humans.length === 0) return;

    const highRisk = pazatorData.humans.filter(h => (h.credit || 185) < 125).length;
    const mediumRisk = pazatorData.humans.filter(h => (h.credit || 185) >= 125 && (h.credit || 185) < 250).length;
    const lowRisk = pazatorData.humans.filter(h => (h.credit || 185) >= 250).length;

    const total = pazatorData.humans.length;
    const highPct = Math.round((highRisk / total) * 100);
    const mediumPct = Math.round((mediumRisk / total) * 100);
    const lowPct = Math.round((lowRisk / total) * 100);

    creditStats.innerHTML = `
        <div class="stat-row"><span>High Risk (0-124):</span><span class="stat-red">${highPct}%</span></div>
        <div class="stat-row"><span>Medium (125-249):</span><span class="stat-yellow">${mediumPct}%</span></div>
        <div class="stat-row"><span>Low Risk (250-370):</span><span class="stat-green">${lowPct}%</span></div>
    `;

    updateIntelligenceCenterRiskChart(highPct, mediumPct, lowPct);

    const riskSummary = document.getElementById('intelRiskSummary');
    if (riskSummary) riskSummary.textContent = `${highPct}% high, ${mediumPct}% med, ${lowPct}% low`;
}

function updateIntelligenceCenterRiskChart(highPct, mediumPct, lowPct) {
    const highBar = document.getElementById('intelHighRiskBar');
    const mediumBar = document.getElementById('intelMediumRiskBar');
    const lowBar = document.getElementById('intelLowRiskBar');
    const highVal = document.getElementById('intelHighRisk');
    const mediumVal = document.getElementById('intelMediumRisk');
    const lowVal = document.getElementById('intelLowRisk');

    if (highBar) highBar.style.width = highPct + '%';
    if (mediumBar) mediumBar.style.width = mediumPct + '%';
    if (lowBar) lowBar.style.width = lowPct + '%';
    if (highVal) highVal.textContent = highPct + '%';
    if (mediumVal) mediumVal.textContent = mediumPct + '%';
    if (lowVal) lowVal.textContent = lowPct + '%';
}

function updateIntelligenceCenterStats() {
    const humanCountEl = document.getElementById('intelHumanCount');
    const otherCountEl = document.getElementById('intelOtherCount');

    if (humanCountEl) humanCountEl.textContent = pazatorData.humans.length;
    if (otherCountEl) otherCountEl.textContent = pazatorData.others.length;

    const highRisk = pazatorData.humans.filter(h => (h.credit || 185) < 125).length;
    const mediumRisk = pazatorData.humans.filter(h => (h.credit || 185) >= 125 && (h.credit || 185) < 250).length;
    const lowRisk = pazatorData.humans.filter(h => (h.credit || 185) >= 250).length;
    const total = pazatorData.humans.length || 1;

    const highPct = Math.round((highRisk / total) * 100);
    const mediumPct = Math.round((mediumRisk / total) * 100);
    const lowPct = Math.round((lowRisk / total) * 100);

    updateIntelligenceCenterRiskChart(highPct, mediumPct, lowPct);

    const riskSummary = document.getElementById('intelRiskSummary');
    if (riskSummary) riskSummary.textContent = `${highPct}% high, ${mediumPct}% med, ${lowPct}% low`;

    if (highRisk > 0 && window.Tastur) {
        Tastur.emit('threat_detected', { count: highRisk });
    }
}
function updateAnalysisHubStats() {
    const humanCountEl = document.getElementById('analysisHumanCount');
    const creditAvgEl = document.getElementById('analysisCreditAvg');
    const metricHumans = document.getElementById('metricHumans');
    const metricEntities = document.getElementById('metricEntities');
    const metricTags = document.getElementById('metricTags');
    const metricHighRisk = document.getElementById('metricHighRisk');
    const riskSummary = document.getElementById('analysisRiskSummary');

    if (humanCountEl) humanCountEl.textContent = pazatorData.humans.length;
    if (metricHumans) metricHumans.textContent = pazatorData.humans.length;
    if (metricEntities) metricEntities.textContent = pazatorData.others.length;
    if (metricTags) metricTags.textContent = tags.length;

    const totalCredit = pazatorData.humans.reduce((sum, h) => sum + (h.credit || 185), 0);
    const avgCredit = pazatorData.humans.length ? Math.round(totalCredit / pazatorData.humans.length) : 0;
    if (creditAvgEl) creditAvgEl.textContent = avgCredit;

    const highRisk = pazatorData.humans.filter(h => (h.credit || 185) < 125).length;
    const mediumRisk = pazatorData.humans.filter(h => (h.credit || 185) >= 125 && (h.credit || 185) < 250).length;
    const lowRisk = pazatorData.humans.filter(h => (h.credit || 185) >= 250).length;

    if (metricHighRisk) metricHighRisk.textContent = highRisk;
    if (riskSummary) riskSummary.textContent = `${highRisk} high, ${mediumRisk} med, ${lowRisk} low`;
}

function updateHeaderStats() {
    const humansEl = document.getElementById('headerHumansCount');
    const othersEl = document.getElementById('headerOthersCount');
    const totalEl = document.getElementById('headerTotalCount');

    if (humansEl) humansEl.textContent = pazatorData.humans.length;
    if (othersEl) othersEl.textContent = pazatorData.others.length;
    if (totalEl) totalEl.textContent = pazatorData.humans.length + pazatorData.others.length;

    var sh = document.getElementById('sidebarHumansCount');
    var so = document.getElementById('sidebarOthersCount');
    var sc = document.getElementById('sidebarCasesCount');
    if (sh) sh.textContent = pazatorData.humans.length;
    if (so) so.textContent = pazatorData.others.length;
    if (sc) sc.textContent = (cases || []).length;
}

function generateThreatReport() {
    const humanCount = pazatorData.humans.length;
    const otherCount = pazatorData.others.length;
    const fraudLogs = JSON.parse(localStorage.getItem('fraudLogs') || '[]');
    const terroristLogs = JSON.parse(localStorage.getItem('terroristLogs') || '[]');
    const chatHistory = JSON.parse(localStorage.getItem('chatHistory') || '[]');

    let report = `=== SECURITY THREAT ASSESSMENT REPORT ===\n`;
    report += `Generated: ${new Date().toLocaleString()}\n\n`;

    report += `DATA OVERVIEW\n`;
    report += `================\n`;
    report += `Human Entries: ${humanCount}\n`;
    report += `Other Entries: ${otherCount}\n`;
    report += `Total Records: ${humanCount + otherCount}\n`;
    report += `Monitored Chats: ${chatHistory.length}\n\n`;

    report += `SECURITY FINDINGS\n`;
    report += `==================\n`;
    report += `Fraud Cases Detected: ${fraudLogs.length}\n`;
    report += `Terrorism Indicators: ${terroristLogs.length}\n`;

    const highRiskHumans = pazatorData.humans.filter(h => h.credit !== undefined && h.credit < 30).length;
    report += `High-Risk Individuals: ${highRiskHumans}\n\n`;

    report += `RECOMMENDATIONS\n`;
    report += `=================\n`;

    if (fraudLogs.length > 0) {
        report += `• Review ${fraudLogs.length} fraud cases for immediate action\n`;
    }

    if (terroristLogs.length > 0) {
        report += `• Investigate ${terroristLogs.length} terrorism indicators\n`;
    }

    if (highRiskHumans > 0) {
        report += `• Monitor ${highRiskHumans} high-risk individuals\n`;
    }

    report += `• Continue regular security sweeps\n`;
    report += `• Update threat intelligence databases\n\n`;

    showAlert(report, 'Security Report', 'info');
}

function reviewHistoricalPatterns() {
    const fraudLogs = JSON.parse(localStorage.getItem('fraudLogs') || '[]');
    const terroristLogs = JSON.parse(localStorage.getItem('terroristLogs') || '[]');
    const previousThreats = JSON.parse(localStorage.getItem('previousThreats') || '[]');
    const previousFraud = JSON.parse(localStorage.getItem('previousFraud') || '[]');

    if (fraudLogs.length === 0 && terroristLogs.length === 0 &&
        previousThreats.length === 0 && previousFraud.length === 0) {
        showAlert('No historical security incidents found.\n\nThis system tracks:\n• Fraud detection cases\n• Terrorism indicators\n• Threat assessments\n• Security pattern analysis\n\nContinue monitoring to build historical data.', 'No Data', 'info');
        return;
    }

    let report = `=== HISTORICAL SECURITY PATTERNS ===\n`;
    report += `Analysis Period: All Recorded Data\n\n`;

    if (previousThreats.length > 0) {
        report += `THREAT HISTORY (${previousThreats.length} cases)\n`;
        report += `====================================\n`;
        previousThreats.slice(-5).forEach((threat, index) => {
            report += `${index + 1}. ${threat.person || threat.name}\n`;
            report += `   Risk: ${threat.riskLevel || 'Unknown'}\n`;
            report += `   Reasons: ${(threat.reasons || threat.redFlags || []).slice(0, 2).join(', ') || 'Various factors'}\n\n`;
        });
    }

    if (previousFraud.length > 0) {
        report += `FRAUD HISTORY (${previousFraud.length} cases)\n`;
        report += `===================================\n`;
        previousFraud.slice(-5).forEach((fraud, index) => {
            report += `${index + 1}. ${fraud.person || fraud.name}\n`;
            report += `   Type: ${fraud.type || 'Unspecified'}\n`;
            report += `   Evidence: ${(fraud.evidence || fraud.redFlags || []).slice(0, 2).join(', ') || 'Multiple indicators'}\n\n`;
        });
    }

    report += `TREND ANALYSIS\n`;
    report += `================\n`;
    report += `Total Security Incidents: ${previousThreats.length + previousFraud.length}\n`;
    report += `Current Active Cases: ${fraudLogs.length + terroristLogs.length}\n`;
    report += `Security Trend: ${fraudLogs.length + terroristLogs.length > previousThreats.length + previousFraud.length ? 'INCREASING' : 'STABLE/DECREASING'}\n\n`;

    report += `RECOMMENDED ACTIONS\n`;
    report += `=====================\n`;
    report += `• Review recent ${fraudLogs.length + terroristLogs.length} active cases\n`;
    report += `• Analyze patterns in historical data\n`;
    report += `• Update security protocols based on findings\n`;
    report += `• Schedule regular pattern analysis reviews\n`;

    showAlert(report, 'Historical Analysis', 'info');
}

var _chatVirtualList = null;

function loadSavedChats() {
    const chatHistory = ChatStorageManager.getChatHistory();
    updateStorageMetrics();

    if (chatHistory.length === 0) {
        if (_chatVirtualList) { _chatVirtualList.destroy(); _chatVirtualList = null; }
        savedChatsList.innerHTML = '<p style="color: #777; text-align: center;">No saved chats found</p>';
        return;
    }

    var infoHtml = '';
    const stats = ChatStorageManager.getStorageStats();
    if (stats.isNearLimit) {
        infoHtml = '<div style="background: rgba(255, 193, 7, 0.2); border: 1px solid #ffc107; border-radius: 8px; padding: 10px 15px; margin-bottom: 15px; color: #ffc107; font-size: 0.85rem;"><i class="fas fa-exclamation-triangle"></i> Storage: ' + stats.totalSizeMB + 'MB - Consider exporting and clearing old chats</div>';
    }

    const visibleIndices = getVisibleChatIndices();

    if (visibleIndices.length === 0 && (chatSearchFilter || chatSourceFilter)) {
        if (_chatVirtualList) { _chatVirtualList.destroy(); _chatVirtualList = null; }
        savedChatsList.innerHTML = '<p style="color: #777; text-align: center;">No chats match your search/filter criteria</p>';
        return;
    }

    var chatTotalPages = Math.max(1, Math.ceil(visibleIndices.length / CHAT_PAGE_SIZE));
    if (chatPage > chatTotalPages) chatPage = chatTotalPages;
    var chatStart = (chatPage - 1) * CHAT_PAGE_SIZE;
    var chatEnd = Math.min(chatStart + CHAT_PAGE_SIZE, visibleIndices.length);
    var pageIndices = visibleIndices.slice(chatStart, chatEnd);

    if (_chatVirtualList) {
        _chatVirtualList.update(pageIndices.map(function (idx) {
            return { index: idx, chat: chatHistory[idx] };
        }));
        return;
    }

    savedChatsList.innerHTML = infoHtml;

    if (chatTotalPages > 1) {
        var chatPagination = document.createElement('div');
        chatPagination.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:10px;padding:8px 0 16px;font-size:0.85rem;color:#aaa;';
        chatPagination.innerHTML = '<button class="btn btn-secondary" style="padding:4px 14px;font-size:0.8rem;" onclick="chatPage=' + Math.max(1, chatPage - 1) + ';loadSavedChats();" ' + (chatPage <= 1 ? 'disabled' : '') + '>‹ Prev</button>' +
            '<span>Page ' + chatPage + ' of ' + chatTotalPages + ' (' + visibleIndices.length + ' chats)</span>' +
            '<button class="btn btn-secondary" style="padding:4px 14px;font-size:0.8rem;" onclick="chatPage=' + Math.min(chatTotalPages, chatPage + 1) + ';loadSavedChats();" ' + (chatPage >= chatTotalPages ? 'disabled' : '') + '>Next ›</button>';
        savedChatsList.appendChild(chatPagination);
    }

    if (window.PazatorUI && PazatorUI.VirtualList) {
        _chatVirtualList = PazatorUI.VirtualList(savedChatsList, {
            itemHeight: 130,
            overscan: 3,
            renderItem: function (item) {
                if (!item || !item.chat) return '';
                var chat = item.chat;
                var idx = item.index;
                var isSelected = selectedChatIndices.has(idx);
                var date = new Date(chat.timestamp).toLocaleDateString();
                var participants = chat.participants.map(function (p) { return p.name; }).join(', ');
                var wordCount = chat.content.split(' ').length;
                var messageCount = chat.parsed?.messageCount || wordCount;
                var hasEntities = chat.parsed?.entities;
                var entityCount = hasEntities ?
                    (hasEntities.urls?.length || 0) + (hasEntities.emails?.length || 0) + (hasEntities.phones?.length || 0) : 0;

                var bg = isSelected ? 'rgba(60, 100, 140, 0.4)' : 'rgba(40, 40, 40, 0.7)';
                var border = isSelected ? '1px solid #4a90d9' : '1px solid #333';
                return '<div style="background:' + bg + ';border:' + border + ';border-radius:8px;padding:15px;margin:0 0 8px;cursor:pointer;transition:all 0.2s ease;" data-idx="' + idx + '">' +
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
                    '<div style="display:flex;align-items:flex-start;gap:12px;flex:1;">' +
                    '<input type="checkbox" ' + (isSelected ? 'checked' : '') + ' data-idx="' + idx + '" style="margin-top:4px;width:18px;height:18px;cursor:pointer;">' +
                    '<div style="flex:1;"><h4 style="margin:0 0 8px;color:#fff;">' + chat.source.toUpperCase() + ' Chat' +
                    (entityCount > 0 ? '<span style="font-size:0.75rem;color:#ff9800;margin-left:8px;">(' + entityCount + ' entities)</span>' : '') + '</h4>' +
                    '<p style="margin:0 0 8px;color:#aaa;font-size:0.9rem;">Participants: ' + escapeHtml(participants) + '</p>' +
                    '<p style="margin:0 0 8px;color:#aaa;font-size:0.9rem;">' + messageCount + ' messages • ' + wordCount + ' words • ' + date + '</p>' +
                    (chat.context ? '<p style="margin:0;color:#888;font-size:0.85rem;">Context: ' + escapeHtml(chat.context) + '</p>' : '') +
                    '</div></div>' +
                    '<div style="display:flex;gap:8px;flex-shrink:0;">' +
                    '<button data-action="preview" data-idx="' + idx + '" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#ccc;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:0.8rem;"><i class="fas fa-eye"></i></button>' +
                    '<button data-action="analyze" data-idx="' + idx + '" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#ccc;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:0.8rem;"><i class="fas fa-search"></i></button>' +
                    '<button data-action="delete" data-idx="' + idx + '" style="background:rgba(255,0,0,0.15);border:1px solid rgba(255,0,0,0.3);color:#ff6b6b;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:0.8rem;"><i class="fas fa-trash"></i></button>' +
                    '</div></div></div>';
            },
            onItemClick: function (item, idx, e) {
                var target = e.target;
                var actionBtn = target.closest('[data-action]');
                if (actionBtn) {
                    var action = actionBtn.getAttribute('data-action');
                    var chatIdx = parseInt(actionBtn.getAttribute('data-idx'), 10);
                    if (action === 'preview') previewChat(chatIdx);
                    else if (action === 'analyze') analyzeSingleChat(chatIdx);
                    else if (action === 'delete') deleteChat(chatIdx);
                    return;
                }
                var cb = target.closest('input[type="checkbox"]');
                if (cb) {
                    toggleChatSelection(parseInt(cb.getAttribute('data-idx'), 10));
                    return;
                }
                var card = target.closest('[data-idx]');
                if (card) toggleChatSelection(parseInt(card.getAttribute('data-idx'), 10));
            }
        });
        _chatVirtualList.update(pageIndices.map(function (idx) {
            return { index: idx, chat: chatHistory[idx] };
        }));
    } else {
        pageIndices.forEach(function (idx) {
            var chat = chatHistory[idx];
            var card = document.createElement('div');
            var isSelected = selectedChatIndices.has(idx);
            card.style.cssText = 'background:' + (isSelected ? 'rgba(60,100,140,0.4)' : 'rgba(40,40,40,0.7)') + ';border:' + (isSelected ? '1px solid #4a90d9' : '1px solid #333') + ';border-radius:8px;padding:15px;margin-bottom:15px;cursor:pointer;transition:all 0.2s ease;';
            var date = new Date(chat.timestamp).toLocaleDateString();
            var participants = chat.participants.map(function (p) { return p.name; }).join(', ');
            var wordCount = chat.content.split(' ').length;
            card.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;"><div style="display:flex;align-items:flex-start;gap:12px;"><h4 style="margin:0 0 8px;color:#fff;">' + chat.source.toUpperCase() + '</h4><p style="margin:0;color:#aaa;font-size:0.9rem;">' + participants + ' • ' + date + '</p></div></div>';
            card.addEventListener('click', function () { toggleChatSelection(idx); });
            savedChatsList.appendChild(card);
        });
    }
}

function toggleChatSelection(index) {
    if (selectedChatIndices.has(index)) {
        selectedChatIndices.delete(index);
    } else {
        selectedChatIndices.add(index);
    }

    if (selectedChatIndices.size > 0) {
        bulkDeleteChatsBtn.style.display = 'inline-block';
    } else {
        bulkDeleteChatsBtn.style.display = 'none';
    }

    loadSavedChats();
}

function previewChat(index) {
    var chatHistory = ChatStorageManager.getChatHistory();
    var chat = chatHistory[index];

    if (!chat) {
        showAlert('Chat not found!', 'Error', 'error');
        return;
    }

    var participants = chat.participants.map(function (p) { return p.name; }).join(', ');
    var contentPreview = chat.content ? chat.content.substring(0, 500) : (chat.contentPreview || '');
    var wordCount = (chat.content || contentPreview || '').split(' ').length;
    var messageCount = chat.parsed && chat.parsed.messageCount ? chat.parsed.messageCount : 'N/A';
    var date = new Date(chat.timestamp).toLocaleString();

    var entities = '';
    if (chat.parsed && chat.parsed.entities) {
        var e = chat.parsed.entities;
        if (e.urls && e.urls.length) entities += '\nURLs: ' + e.urls.slice(0, 5).join('\n  ') + (e.urls.length > 5 ? '\n  ...' : '');
        if (e.emails && e.emails.length) entities += '\nEmails: ' + e.emails.join(', ');
        if (e.phones && e.phones.length) entities += '\nPhones: ' + e.phones.join(', ');
    }

    var fullContent = chat.content || '';
    var loadLink = '';
    if (fullContent.length > 500) {
        loadLink = '\n\n[Content truncated to 500 chars. Click "Load Full Content" to show all ' + fullContent.length + ' chars]';
    }

    var preview = '=== ' + chat.source.toUpperCase() + ' CHAT PREVIEW ===\n\n' +
        'Participants: ' + participants + '\n' +
        'Date: ' + date + '\n' +
        'Messages: ' + messageCount + '\n' +
        'Words: ' + wordCount + '\n' +
        'Context: ' + (chat.context || 'None') +
        (entities ? '\n\n--- Detected Entities ---' + entities : '') +
        '\n\n--- Content Preview ---\n' +
        contentPreview.substring(0, 500) +
        (fullContent.length > 500 ? '\n\n... (truncated to 500 chars)' : '') +
        loadLink;

    var buttons = [
        { text: 'Close', primary: true }
    ];
    if (fullContent.length > 500) {
        buttons.push({
            text: 'Load Full Content',
            primary: false,
            onClick: function () {
                showAlert(fullContent, 'Full Chat Content', 'info');
            }
        });
    }
    showModal({ title: 'Chat Preview', message: preview, type: 'info', buttons: buttons });
}

async function analyzeAllChats() {
    const chatHistory = ChatStorageManager.getChatHistory();

    if (chatHistory.length === 0) {
        showAlert('No chats to analyze!', 'Notice', 'info');
        return;
    }

    analyzeAllChatsBtn.disabled = true;
    const originalText = analyzeAllChatsBtn.innerHTML;
    analyzeAllChatsBtn.innerHTML = '<div class="loader" style="--size:16px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Analyzing...';

    try {
        const totalChatsBySource = {};

        const analysisResults = await ChatAnalysisService.batchAnalyze(chatHistory, {
            onProgress: (progress) => {
                analyzeAllChatsBtn.innerHTML = `<div class="loader" style="--size:16px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Analyzing... ${Math.round(progress)}%`;
            },
            onChatComplete: (result) => {
                if (result.result.isSuspicious) {
                    totalChatsBySource[result.source] = (totalChatsBySource[result.source] || 0) + 1;
                }
                // Auto-create humans from participants
                const chat = chatHistory.find(c => c.timestamp === result.timestamp && c.source === result.source);
                if (chat && chat.participants) {
                    chat.participants.forEach(p => {
                        const name = typeof p === 'object' ? p.name : p;
                        if (!name) return;
                        let human = pazatorData.humans.find(h => h.name.toLowerCase() === name.toLowerCase());
                        if (!human) {
                            human = {
                                id: 'human_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                                name: name,
                                credit: 185,
                                tags: [],
                                chats: [],
                                cases: [],
                                extraNotes: '',
                                friends: [],
                                family: [],
                                imagePreview: null,
                                threatLevel: null,
                                birthDate: null,
                                gender: null,
                                maritalStatus: null,
                                workplace: null,
                                nationality: null,
                                countryOfOrigin: null,
                                immigrationStatus: null,
                                languages: null,
                                ethnicity: null,
                                religion: null,
                                politicalViews: null,
                                educationLevel: null,
                                incomeLevel: null,
                                socialClass: null,
                                trustworthiness: null
                            };
                            pazatorData.humans.push(human);
                            _pendingChanges();
                        }
                        // Bidirectional link: add chat reference to human
                        if (!human.chats) human.chats = [];
                        if (!human.chats.includes(chat.id || chat.timestamp)) {
                            human.chats.push(chat.id || chat.timestamp);
                        }
                    });
                    // Store chat in pazatorData.chats
                    if (!pazatorData.chats) pazatorData.chats = [];
                    if (!pazatorData.chats.find(c => c.timestamp === chat.timestamp && c.source === chat.source)) {
                        pazatorData.chats.push({
                            id: chat.id || 'chat_' + Date.now(),
                            source: chat.source,
                            participants: chat.participants,
                            timestamp: chat.timestamp,
                            content: chat.content ? chat.content.substring(0, 500) : '',
                            suspicious: result.result.isSuspicious,
                            riskLevel: result.result.riskLevel || 'low',
                            redFlags: result.result.redFlags || []
                        });
                    }
                }
                // Auto-create case if suspicious
                if (result.result.isSuspicious && result.result.riskLevel === 'high') {
                    const existingCase = cases.find(c =>
                        c.title && c.title.includes('Suspicious') &&
                        c.source === result.source &&
                        Math.abs(c.createdAt - result.timestamp) < 86400000
                    );
                    if (!existingCase) {
                        const participantNames = chat ? chat.participants.map(p => typeof p === 'object' ? p.name : p).join(', ') : 'Unknown';
                        const newCase = {
                            id: 'case_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                            title: 'Suspicious Chat - ' + participantNames.substring(0, 40),
                            description: 'Auto-created from suspicious ' + (result.source || 'unknown') + ' chat. Risk level: ' + (result.result.riskLevel || 'low') + '. ' + (result.result.summary || ''),
                            status: 'open',
                            entities: [],
                            timeline: [{
                                type: 'note',
                                content: 'Case auto-created from suspicious chat analysis',
                                timestamp: Date.now()
                            }],
                            source: result.source,
                            createdAt: Date.now()
                        };
                        cases.push(newCase);
                        saveCases();
                    }
                }
            }
        });

        const totalSuspicious = analysisResults.filter(r => r.result.isSuspicious).length;
        const totalChats = chatHistory.length;
        const securityScore = Math.max(0, 100 - (totalSuspicious / totalChats * 100));

        const byRiskLevel = { high: [], medium: [], low: [] };
        analysisResults.forEach(item => {
            if (item.result.isSuspicious) {
                byRiskLevel[item.result.riskLevel || 'low'].push(item);
            }
        });

        const scoreClass = securityScore >= 80 ? 'good' : securityScore >= 50 ? 'medium' : 'bad';

        const allSuspiciousItems = [];
        ['high', 'medium', 'low'].forEach(level => {
            byRiskLevel[level].forEach(item => {
                allSuspiciousItems.push({ ...item, level });
            });
        });

        const modalHtml = `
            <div class="security-report">
                <div class="security-report-header">
                    <div class="security-score-badge ${scoreClass}">
                        <span class="score">${securityScore.toFixed(0)}%</span>
                        <span class="label">Score</span>
                    </div>
                    <div class="security-meta">
                        <h4>Security Analysis</h4>
                        <div class="stats">
                            <div class="stat">
                                <span class="val">${totalChats}</span>
                                <span class="lbl">Chats</span>
                            </div>
                            <div class="stat ${totalSuspicious > 0 ? 'warning' : ''}">
                                <span class="val">${totalSuspicious}</span>
                                <span class="lbl">Suspicious</span>
                            </div>
                        </div>
                    </div>
                </div>
                ${totalSuspicious > 0 ? `
                    <div class="security-issues">
                        <h5><i class="fas fa-exclamation-triangle"></i> Suspicious Chats</h5>
                        ${allSuspiciousItems.slice(0, 10).map(item => {
            const participantNames = Array.isArray(item.participants)
                ? item.participants.map(p => typeof p === 'object' ? p.name : p).join(', ')
                : 'Unknown';
            return `
                            <div class="security-issue-item ${item.level}">
                                <div class="item-header">
                                    <span class="risk-badge ${item.level}">${item.level.toUpperCase()}</span>
                                    <span class="src">[${item.source?.toUpperCase() || 'UNKNOWN'}]</span>
                                    <span class="names">${participantNames}</span>
                                </div>
                                <div class="flags-list">
                                    ${item.result.redFlags?.slice(0, 4).map(flag =>
                `<span class="flag-tag">${flag}</span>`
            ).join('') || '<span class="flag-tag">General concern</span>'}
                                </div>
                            </div>
                        `}).join('')}
                        ${allSuspiciousItems.length > 10 ? `<p style="color: #888; font-size: 0.85rem; text-align: center; margin-top: 10px;">+${allSuspiciousItems.length - 10} more</p>` : ''}
                    </div>
                ` : `
                    <div class="security-ok">
                        <i class="fas fa-shield-check"></i>
                        <p>All chats look secure.</p>
                    </div>
                `}
            </div>
        `;

        showModal({
            title: 'Chat Security Report',
            type: securityScore >= 80 ? 'success' : securityScore >= 50 ? 'warning' : 'error',
            html: modalHtml,
            buttons: [{ text: 'Close', primary: true }]
        });

    } catch (error) {
        console.error('Error analyzing all chats:', error);
        showAlert('Error analyzing chats. Please try again.', 'Error', 'error');
    } finally {
        analyzeAllChatsBtn.disabled = false;
        analyzeAllChatsBtn.innerHTML = originalText;
        lastAnalysisTimestamp = new Date().toISOString();
        updateLastScanTime();
    }
}

async function analyzeChatContent(content, source) {
    return ChatAnalysisService.analyze(content, source);
}

async function analyzeSingleChat(index) {
    const chatHistory = ChatStorageManager.getChatHistory();

    if (!chatHistory[index]) {
        showAlert('Chat not found!', 'Error', 'error');
        return;
    }

    const chat = chatHistory[index];
    const result = await ChatAnalysisService.analyze(chat.content, chat.source);

    let message = `=== Chat Analysis Result ===\n\n`;
    message += `Source: ${chat.source.toUpperCase()}\n`;
    message += `Participants: ${chat.participants.map(p => p.name).join(', ')}\n`;
    message += `Messages: ${chat.parsed?.messageCount || chat.content.split(' ').length}\n`;
    message += `Words: ${chat.content.split(' ').length}\n\n`;
    message += `Suspicious: ${result.isSuspicious ? 'YES' : 'NO'}\n`;
    message += `Risk Level: ${result.riskLevel?.toUpperCase() || 'LOW'}\n\n`;

    if (result.redFlags && result.redFlags.length > 0) {
        message += "Red Flags:\n" + result.redFlags.map(flag => "• " + flag).join("\n") + "\n\n";
    }

    if (result.entities) {
        if (result.entities.urls?.length > 0) {
            message += `URLs Found: ${result.entities.urls.length}\n`;
        }
        if (result.entities.emails?.length > 0) {
            message += `Emails Found: ${result.entities.emails.length}\n`;
        }
        if (result.entities.phones?.length > 0) {
            message += `Phone Numbers Found: ${result.entities.phones.length}\n`;
        }
        if (result.entities.urls?.length > 0 || result.entities.emails?.length > 0 || result.entities.phones?.length > 0) {
            message += '\n';
        }
    }

    message += `Summary: ${result.summary || 'No specific concerns'}`;

    if (result.recommendations?.length > 0) {
        message += `\n\nRecommendations:\n${result.recommendations.map(r => `• ${r}`).join('\n')}`;
    }

    showAlert(message, 'Single Chat Analysis', 'info');
}

async function deleteChat(index) {
    const confirmed = await showConfirm('Are you sure you want to delete this chat?', 'Confirm Deletion', 'warning');
    if (confirmed) {
        if (ChatStorageManager.deleteChat(index)) {
            loadSavedChats();
        } else {
            showAlert('Failed to delete chat', 'Error', 'error');
        }
    }
}

async function exportHumanToPDF(humanId) {
    const human = pazatorData.humans.find(h => h.id === humanId);
    if (!human) {
        showAlert('Person not found', 'Error', 'error');
        return;
    }

    if (!logoBase64) {
        await loadLogoForPDF();
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    let y = margin;

    doc.setFillColor(0, 0, 0);
    doc.rect(0, 0, pageWidth, 60, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(52);
    doc.setFont('helvetica', 'bold');
    doc.text('PAZATOR', margin, 30);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('SARPARAST', margin, 42);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, 52);

    if (logoBase64) {
        const logoSize = 30;
        const logoX = pageWidth - margin - logoSize;
        doc.addImage(logoBase64, 'PNG', logoX, 15, logoSize, logoSize);
    }

    y = 75;
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.text(human.name, margin, y);
    y += 12;

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const sections = [
        {
            title: 'BASIC INFORMATION', items: [
                { label: 'ID', value: human.id },
                { label: 'Gender', value: human.gender || 'Not specified' },
                { label: 'Birth Date', value: human.birthDate ? new Date(human.birthDate).toLocaleDateString() : 'Not specified' },
                { label: 'Age', value: human.birthDate ? calculateAge(human.birthDate) + ' years' : 'Not specified' },
                { label: 'Marital Status', value: human.maritalStatus || 'Not specified' },
                { label: 'Occupation', value: human.workplace || 'Not specified' }
            ]
        },
        {
            title: 'BACKGROUND', items: [
                { label: 'Nationality', value: human.nationality || 'Not specified' },
                { label: 'Country of Origin', value: human.countryOfOrigin || 'Not specified' },
                { label: 'Immigration Status', value: human.immigrationStatus || 'Not specified' },
                { label: 'Languages', value: human.languages || 'Not specified' }
            ]
        },
        {
            title: 'DEMOGRAPHICS', items: [
                { label: 'Ethnicity', value: human.ethnicity || 'Not specified' },
                { label: 'Religion', value: human.religion || 'Not specified' },
                { label: 'Political Views', value: human.politicalViews || 'Not specified' },
                { label: 'Threat Level', value: human.threatLevel || 'Not specified' }
            ]
        },
        {
            title: 'SOCIOECONOMIC', items: [
                { label: 'Credit Score', value: human.credit !== undefined ? Math.round(human.credit).toString() : 'Not recorded' },
                { label: 'Social Class', value: human.socialClass || 'Not specified' },
                { label: 'Income Level', value: human.incomeLevel || 'Not specified' },
                { label: 'Education', value: human.educationLevel || 'Not specified' }
            ]
        },
        {
            title: 'RELATIONSHIPS', items: [
                { label: 'Friends', value: (human.friends || []).map(function (id) { return getHumanNameById(id); }).filter(Boolean).join(', ') || 'None' },
                { label: 'Family', value: (human.family || []).map(function (id) { return getHumanNameById(id); }).filter(Boolean).join(', ') || 'None' }
            ]
        },
        {
            title: 'NOTES', items: [
                { label: 'Notes', value: human.extraNotes || 'No notes' }
            ]
        }
    ];

    sections.forEach(section => {
        if (y > pageHeight - 60) {
            doc.addPage();
            y = margin;
        }

        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(margin, y, margin + 40, y);
        y += 5;

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 60, 60);
        doc.text(section.title, margin, y);
        y += 8;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);

        section.items.forEach(item => {
            if (y > pageHeight - 30) {
                doc.addPage();
                y = margin;
            }

            doc.setFont('helvetica', 'bold');
            doc.text(item.label + ':', margin, y);
            doc.setFont('helvetica', 'normal');

            const valueLines = doc.splitTextToSize(item.value, contentWidth - 45);
            doc.text(valueLines, margin + 45, y);
            y += (valueLines.length * 4) + 4;
        });

        y += 8;
    });

    if (human.tags?.length) {
        if (y > pageHeight - 40) {
            doc.addPage();
            y = margin;
        }

        doc.line(margin, y, margin + 40, y);
        y += 5;

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 60, 60);
        doc.text('TAGS', margin, y);
        y += 8;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);

        const tagWidth = 30;
        const tagHeight = 7;
        let tagX = margin;
        let tagY = y;

        human.tags.forEach(tag => {
            const tagText = ' ' + tag + ' ';
            const textWidth = doc.getTextWidth(tagText);

            if (tagX + textWidth + 4 > pageWidth - margin) {
                tagX = margin;
                tagY += tagHeight + 3;
            }

            doc.setFillColor(240, 240, 240);
            doc.rect(tagX, tagY - 4, textWidth + 4, tagHeight, 'F');
            doc.setDrawColor(150, 150, 150);
            doc.rect(tagX, tagY - 4, textWidth + 4, tagHeight, 'S');
            doc.text(tagText, tagX + 2, tagY);

            tagX += textWidth + 8;
        });
    }

    y = pageHeight - 15;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'italic');
    doc.text('Pazator Intelligence System - SARPARAST', pageWidth / 2, y, { align: 'center' });

    doc.save(`pazator-${human.name.replace(/\s+/g, '-').toLowerCase()}-report.pdf`);
    showAlert(`PDF report generated for ${human.name}`, 'Export Complete', 'success');
}

function calculateAge(birthDate) {
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

function getThreatLevelColor(level) {
    switch (level?.toLowerCase()) {
        case 'critical': return '#d32f2f';
        case 'high': return '#f44336';
        case 'medium': return '#ff9800';
        case 'low': return '#4caf50';
        default: return '';
    }
}

function exportChatReport(format = 'txt') {
    const chatHistory = ChatStorageManager.getChatHistory();
    const stats = ChatStorageManager.getStorageStats();

    if (chatHistory.length === 0) {
        showAlert('No chats to export!', 'Notice', 'info');
        return;
    }

    if (format === 'json') {
        const exportData = {
            exportDate: new Date().toISOString(),
            stats: stats,
            chats: chatHistory
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pazator-chat-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
    }

    let report = `Pazator Chat Analysis Report\n`;
    report += `Generated: ${new Date().toLocaleString()}\n`;
    report += `Total Chats: ${chatHistory.length}\n`;
    report += `Total Size: ${stats.totalSizeMB}MB\n\n`;

    chatHistory.forEach((chat, index) => {
        const date = new Date(chat.timestamp).toLocaleDateString();
        const participants = chat.participants.map(p => p.name).join(', ');
        const wordCount = chat.content.split(' ').length;
        const messageCount = chat.parsed?.messageCount || 'N/A';

        report += `=== Chat ${index + 1} ===\n`;
        report += `Source: ${chat.source.toUpperCase()}\n`;
        report += `Date: ${date}\n`;
        report += `Participants: ${participants}\n`;
        report += `Messages: ${messageCount}\n`;
        report += `Word Count: ${wordCount}\n`;
        report += `Context: ${chat.context || 'None'}\n`;
        report += `Content Preview: ${chat.content.substring(0, 200)}${chat.content.length > 200 ? '...' : ''}\n\n`;
    });

    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pazator-chat-report-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function clearChatHistory() {
    const stats = ChatStorageManager.getStorageStats();
    const confirmed = await showConfirm(
        `Are you sure you want to clear ALL chat history? This will delete ${stats.totalChats} chats (${stats.totalSizeMB}MB) and cannot be undone.`,
        'Confirm Deletion',
        'warning'
    );
    if (confirmed) {
        ChatStorageManager.clearAllChats();
        loadSavedChats();
        showAlert('Chat history cleared successfully!', 'Success', 'success');
    }
}

document.getElementById('manualRefreshBtn')?.addEventListener('click', () => {
    manualRefresh();
});

async function deployConnectionAgents() {
    const modal = document.getElementById('hiddenConnectionsModal');
    const results = document.getElementById('connectionsResults');
    const loading = document.getElementById('connectionsLoading');
    const noResults = document.getElementById('noConnections');
    const graph = document.getElementById('connectionsGraph');
    const list = document.getElementById('connectionsList');

    const depth = parseInt(document.getElementById('connectionDepth')?.value || '2');
    const scope = document.getElementById('connectionScope')?.value || 'all';
    const agentCount = parseInt(document.getElementById('connectionAgentCount')?.value || '4');

    modal.style.display = 'flex';
    modal.style.zIndex = '1000';
    loading.style.display = 'block';
    results.style.display = 'none';
    noResults.style.display = 'none';
    graph.innerHTML = '';
    list.innerHTML = '';

    const people = pazatorData.humans.map(h => ({
        id: h.id, name: h.name, gender: h.gender,
        workplace: h.workplace, occupation: h.occupation,
        nationality: h.nationality, countryOfOrigin: h.countryOfOrigin,
        immigrationStatus: h.immigrationStatus, languages: h.languages || [],
        ethnicity: h.ethnicity, religion: h.religion,
        politicalViews: h.politicalViews, threatLevel: h.threatLevel,
        socialClass: h.socialClass, incomeLevel: h.incomeLevel,
        educationLevel: h.educationLevel, maritalStatus: h.maritalStatus,
        credit: h.credit, tags: h.tags || [],
        friends: h.friends || [], family: h.family || [],
        extraNotes: h.extraNotes || ''
    }));

    const agentSys = initAgentSystem();

    const connAgents = [];
    for (let i = 0; i < agentCount; i++) {
        connAgents.push({ id: i, name: 'Agent-' + (i + 1), status: 'idle', processed: 0, total: 0, findings: [] });
    }

    const getPersonProfile = (personId) => {
        const h = pazatorData.humans.find(x => x.id === personId);
        if (!h) return null;
        const profile = {};
        if (scope === 'all' || scope === 'tags') profile.tags = h.tags || [];
        if (scope === 'all' || scope === 'relations') {
            profile.friends = h.friends || [];
            profile.family = h.family || [];
        }
        if (scope === 'all' || scope === 'attributes') {
            profile.name = h.name;
            profile.workplace = h.workplace;
            profile.occupation = h.occupation;
            profile.nationality = h.nationality;
            profile.countryOfOrigin = h.countryOfOrigin;
            profile.ethnicity = h.ethnicity;
            profile.religion = h.religion;
            profile.politicalViews = h.politicalViews;
            profile.educationLevel = h.educationLevel;
        }
        return profile;
    };

    const explorePerson = async (person, depthLevel, visited) => {
        const key = person.id + '_d' + depthLevel;
        if (visited.has(key)) return [];
        visited.add(key);

        const profile = getPersonProfile(person.id);
        if (!profile) return [];

        const results = [];

        for (const other of pazatorData.humans) {
            if (other.id === person.id) continue;
            if (person.friends?.includes(other.id) || person.family?.includes(other.id)) continue;

            const otherProfile = getPersonProfile(other.id);
            if (!otherProfile) continue;

            const connections = findLocalConnections(profile, otherProfile, person, other);
            results.push(...connections);
        }

        if (depthLevel < depth) {
            const nextTargets = [...(person.friends || []), ...(person.family || [])];
            for (const friendId of nextTargets) {
                const friend = pazatorData.humans.find(x => x.id === friendId);
                if (friend) {
                    const deeper = await explorePerson(friend, depthLevel + 1, visited);
                    results.push(...deeper);
                }
            }
        }

        return results;
    };

    const allConnections = [];
    const visited = new Set();

    const chunks = [];
    const chunkSize = Math.ceil(people.length / agentCount);
    for (let i = 0; i < people.length; i += chunkSize) {
        chunks.push(people.slice(i, i + chunkSize));
    }

    const agentPromises = connAgents.map(async (agent, idx) => {
        agent.status = 'exploring';
        agent.total = chunks[idx]?.length || 0;
        agent.processed = 0;

        const agentChunk = chunks[idx] || [];
        const agentConnections = [];

        for (const person of agentChunk) {
            const found = await explorePerson(person, 1, visited);
            agentConnections.push(...found);
            agent.processed++;
        }

        agent.findings = agentConnections.slice(0, 20);
        agent.status = 'done';

        return agentConnections;
    });

    const resultsArray = await Promise.all(agentPromises);
    resultsArray.forEach(r => allConnections.push(...r));

    const unique = [];
    const seen = new Set();
    allConnections.forEach(c => {
        const key = [c.person1, c.person2].sort().join('|');
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(c);
        }
    });

    unique.sort((a, b) => (b.strength || 0) - (a.strength || 0));
    const topConnections = unique.slice(0, 50);

    loading.style.display = 'none';

    if (topConnections.length > 0) {
        results.style.display = 'block';
        renderConnectionsGraph(topConnections.slice(0, 20), graph);
        renderConnectionsList(topConnections, list);

        const countEl = document.getElementById('intelConnectionsCount');
        const summaryEl = document.getElementById('intelConnectionsSummary');
        if (countEl) countEl.textContent = topConnections.length;
        if (summaryEl) summaryEl.textContent = topConnections.length + ' found';
    } else {
        noResults.style.display = 'block';
    }
}

function findLocalConnections(profile1, profile2, person1, person2) {
    const connections = [];
    const shared = {};

    if (profile1.tags && profile2.tags) {
        const common = profile1.tags.filter(t => profile2.tags.includes(t));
        if (common.length > 0) shared.tags = common;
    }

    if (profile1.friends && profile2.friends) {
        const mutual = profile1.friends.filter(f => profile2.friends.includes(f));
        if (mutual.length > 0) shared.mutualFriends = mutual;
    }

    if (profile1.family && profile2.family) {
        const mutual = profile1.family.filter(f => profile2.family.includes(f));
        if (mutual.length > 0) shared.mutualFamily = mutual;
    }

    if (profile1.workplace && profile2.workplace && profile1.workplace === profile2.workplace) {
        shared.workplace = profile1.workplace;
    }

    if (profile1.nationality && profile2.nationality && profile1.nationality === profile2.nationality) {
        shared.nationality = profile1.nationality;
    }

    if (profile1.countryOfOrigin && profile2.countryOfOrigin && profile1.countryOfOrigin === profile2.countryOfOrigin) {
        shared.origin = profile1.countryOfOrigin;
    }

    if (profile1.religion && profile2.religion && profile1.religion === profile2.religion) {
        shared.religion = profile1.religion;
    }

    if (profile1.politicalViews && profile2.politicalViews && profile1.politicalViews === profile2.politicalViews) {
        shared.politics = profile1.politicalViews;
    }

    if (Object.keys(shared).length > 0) {
        const reasons = [];
        if (shared.tags) reasons.push('Shared tags: ' + shared.tags.join(', '));
        if (shared.mutualFriends) reasons.push('Mutual friends: ' + shared.mutualFriends.length);
        if (shared.mutualFamily) reasons.push('Mutual family: ' + shared.mutualFamily.length);
        if (shared.workplace) reasons.push('Same workplace: ' + shared.workplace);
        if (shared.nationality) reasons.push('Same nationality: ' + shared.nationality);
        if (shared.origin) reasons.push('Same origin: ' + shared.origin);
        if (shared.religion) reasons.push('Same religion: ' + shared.religion);
        if (shared.politics) reasons.push('Same politics: ' + shared.politics);

        connections.push({
            person1: person1.name,
            person2: person2.name,
            reason: reasons.join('; '),
            connectionType: Object.keys(shared)[0] || 'unknown',
            strength: Object.keys(shared).length,
            shared
        });
    }

    return connections;
}

function renderConnectionsGraph(connections, graphContainer) {
    var hasD3 = typeof d3 !== 'undefined';
    if (hasD3 && graphContainer) {
        renderForceGraphInElement(graphContainer, {
            connections: connections,
            width: graphContainer.clientWidth || 600,
            height: graphContainer.clientHeight || 300
        });
        return;
    }
    graphContainer.innerHTML = '';

    var people = [...new Set(connections.flatMap(function (conn) { return [conn.person1, conn.person2]; }))];

    var centerX = graphContainer.offsetWidth / 2;
    var centerY = graphContainer.offsetHeight / 2;
    var radius = Math.min(centerX, centerY) * 0.7;

    var personPositions = {};
    people.forEach(function (person, index) {
        var angle = (index / people.length) * Math.PI * 2;
        var x = centerX + Math.cos(angle) * radius - 30;
        var y = centerY + Math.sin(angle) * radius - 30;

        personPositions[person] = { x: x + 30, y: y + 30 };

        var node = document.createElement('div');
        node.className = 'connection-node';
        node.textContent = person.length > 10 ? person.substring(0, 10) + '...' : person;
        node.style.left = x + 'px';
        node.style.top = y + 'px';
        graphContainer.appendChild(node);
    });

    connections.forEach(function (connection) {
        var pos1 = personPositions[connection.person1];
        var pos2 = personPositions[connection.person2];

        if (pos1 && pos2) {
            var line = document.createElement('div');
            line.className = 'connection-line';

            var dx = pos2.x - pos1.x;
            var dy = pos2.y - pos1.y;
            var length = Math.sqrt(dx * dx + dy * dy);
            var angle = Math.atan2(dy, dx) * 180 / Math.PI;

            line.style.width = length + 'px';
            line.style.height = '3px';
            line.style.left = pos1.x + 'px';
            line.style.top = pos1.y + 'px';
            line.style.transform = 'rotate(' + angle + 'deg)';

            graphContainer.appendChild(line);

            var label = document.createElement('div');
            label.className = 'connection-label';
            label.textContent = connection.connectionType;
            label.style.left = ((pos1.x + pos2.x) / 2) + 'px';
            label.style.top = ((pos1.y + pos2.y) / 2) + 'px';
            graphContainer.appendChild(label);
        }
    });
}

/* D3 Force-Directed Graph */
function renderForceGraphInElement(container, opts) {
    opts = opts || {};
    var connections = opts.connections || [];
    var humans = opts.humans || pazatorData.humans;
    var others = opts.others || pazatorData.others;

    var width = opts.width || container.clientWidth || 800;
    var height = opts.height || container.clientHeight || 500;

    container.innerHTML = '';
    container.style.position = 'relative';
    container.style.overflow = 'hidden';

    /* Build node map from connections or full dataset */
    var nodes = [];
    var nodeMap = {};
    var links = [];

    function addNode(id, label, type, data) {
        if (nodeMap[id]) return;
        var threat = data && data.threatLevel ? String(data.threatLevel).toLowerCase() : '';
        var color = '#4d9de0';
        if (threat === 'critical') color = '#ff0000';
        else if (threat === 'high') color = '#ff6b6b';
        else if (threat === 'medium') color = '#ffd93d';
        else if (threat === 'low') color = '#6bcf7f';
        if (type === 'other') color = '#a29bfe';
        var node = { id: id, label: label, type: type, color: color, data: data };
        nodes.push(node);
        nodeMap[id] = node;
    }

    if (connections.length > 0) {
        /* Build graph from connections data */
        connections.forEach(function (c) {
            if (!nodeMap[c.person1]) addNode(c.person1, c.person1, 'human', null);
            if (!nodeMap[c.person2]) addNode(c.person2, c.person2, 'human', null);
            links.push({
                source: c.person1,
                target: c.person2,
                label: c.connectionType || 'connected',
                color: 'rgba(255,255,255,0.3)',
                strength: c.strength || 1
            });
        });
    } else {
        /* Build full graph from data */
        humans.forEach(function (h) { if (h && h.id) addNode(h.id, h.name || h.id, 'human', h); });
        others.forEach(function (o) { if (o && o.id) addNode(o.name || o.id, o.name || o.id, 'other', o); });

        if (window.pazatorRelationships) {
            var rels = window.pazatorRelationships.getAll();
            rels.forEach(function (r) {
                var src = nodeMap[r.sourceId];
                var tgt = nodeMap[r.targetId];
                if (src && tgt) {
                    var ti = window.pazatorRelationships.getTypeInfo(r.type);
                    links.push({
                        source: r.sourceId,
                        target: r.targetId,
                        label: ti.label,
                        color: ti.color,
                        strength: r.strength || 1,
                        type: r.type
                    });
                }
            });
        }

        /* Add shared-attribute connections */
        var attrFields = ['workplace', 'nationality', 'religion', 'countryOfOrigin', 'politicalView', 'ethnicity'];
        var attrIndex = {};
        humans.forEach(function (h) {
            if (!h || !h.id) return;
            attrFields.forEach(function (f) {
                var val = h[f];
                if (!val) return;
                if (!attrIndex[f]) attrIndex[f] = {};
                if (!attrIndex[f][val]) attrIndex[f][val] = [];
                attrIndex[f][val].push(h.id);
            });
        });
        Object.keys(attrIndex).forEach(function (field) {
            Object.keys(attrIndex[field]).forEach(function (val) {
                var ids = attrIndex[field][val];
                if (ids.length < 2) return;
                for (var i = 0; i < Math.min(ids.length, 10); i++) {
                    for (var j = i + 1; j < Math.min(ids.length, 10); j++) {
                        var alreadyLinked = links.some(function (l) {
                            return (l.source === ids[i] && l.target === ids[j]) || (l.source === ids[j] && l.target === ids[i]);
                        });
                        if (!alreadyLinked) {
                            links.push({
                                source: ids[i],
                                target: ids[j],
                                label: field,
                                color: 'rgba(255,255,255,0.12)',
                                strength: 0.5,
                                dashed: true
                            });
                        }
                    }
                }
            });
        });
    }

    if (nodes.length === 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;">No data to display</div>';
        return;
    }

    try {
        var svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .style('display', 'block')
            .style('background', 'transparent');

        var g = svg.append('g');

        var zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', function (event) {
                g.attr('transform', event.transform);
            });
        svg.call(zoom);

        /* Tooltip */
        var tooltip = d3.select(container)
            .append('div')
            .style('position', 'absolute')
            .style('background', 'rgba(10,10,10,0.92)')
            .style('color', '#eee')
            .style('padding', '8px 12px')
            .style('border-radius', '6px')
            .style('font-size', '12px')
            .style('pointer-events', 'none')
            .style('border', '1px solid #444')
            .style('z-index', '100')
            .style('opacity', '0')
            .style('max-width', '250px');

        /* Arrow marker */
        svg.append('defs').append('marker')
            .attr('id', 'arrow')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 28)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', '#888');

        /* Links */
        var linkGroup = g.append('g').attr('class', 'links');
        var link = linkGroup.selectAll('line')
            .data(links)
            .enter().append('line')
            .attr('stroke', function (d) { return d.color || 'rgba(255,255,255,0.2)'; })
            .attr('stroke-width', function (d) { return (d.strength || 0.5) * 2 + 0.5; })
            .attr('stroke-opacity', 0.6)
            .attr('stroke-dasharray', function (d) { return d.dashed ? '4,4' : null; })
            .attr('marker-end', function (d) { return d.type ? 'url(#arrow)' : null; });

        /* Link labels */
        var linkLabelGroup = g.append('g').attr('class', 'link-labels');
        var linkLabel = linkLabelGroup.selectAll('text')
            .data(links)
            .enter().append('text')
            .text(function (d) { return d.label; })
            .attr('font-size', '9px')
            .attr('fill', 'rgba(255,255,255,0.4)')
            .attr('text-anchor', 'middle')
            .attr('dy', '-4');

        /* Nodes */
        var nodeGroup = g.append('g').attr('class', 'nodes');
        var node = nodeGroup.selectAll('g')
            .data(nodes)
            .enter().append('g')
            .attr('cursor', 'pointer')
            .on('click', function (event, d) {
                event.stopPropagation();
                if (d.data && d.data.id) {
                    if (d.type === 'human') {
                        if (typeof openSlidePanel === 'function') openSlidePanel(d.data.id, 'human');
                    } else {
                        if (typeof openSlidePanel === 'function') openSlidePanel(d.data.id, 'other');
                    }
                } else if (d.id && !d.data) {
                    /* Try to find by name */
                    var found = pazatorData.humans.find(function (h) { return h.name === d.id || h.id === d.id; });
                    if (found && typeof openSlidePanel === 'function') openSlidePanel(found.id, 'human');
                }
            })
            .on('mouseenter', function (event, d) {
                tooltip.transition().duration(200).style('opacity', 1);
                var html = '<strong>' + escapeHtml(d.label || d.id) + '</strong>';
                html += '<br/><span style="color:#888;">' + d.type + '</span>';
                if (d.data && d.data.threatLevel) html += '<br/>Threat: ' + d.data.threatLevel;
                tooltip.html(html)
                    .style('left', (event.offsetX + 10) + 'px')
                    .style('top', (event.offsetY - 10) + 'px');
                d3.select(this).select('circle').transition().duration(200).attr('r', function (d) {
                    return d.type === 'human' ? 10 : 8;
                });
            })
            .on('mousemove', function (event) {
                tooltip.style('left', (event.offsetX + 10) + 'px').style('top', (event.offsetY - 10) + 'px');
            })
            .on('mouseleave', function () {
                tooltip.transition().duration(300).style('opacity', 0);
                d3.select(this).select('circle').transition().duration(200).attr('r', function (d) {
                    return d.type === 'human' ? 7 : 5;
                });
            })
            .call(d3.drag()
                .on('start', function (event, d) {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on('drag', function (event, d) {
                    d.fx = event.x;
                    d.fy = event.y;
                })
                .on('end', function (event, d) {
                    if (!event.active) simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                })
            );

        node.append('circle')
            .attr('r', function (d) { return d.type === 'human' ? 7 : 5; })
            .attr('fill', function (d) { return d.color || '#666'; })
            .attr('stroke', 'rgba(255,255,255,0.3)')
            .attr('stroke-width', 1.5);

        node.append('text')
            .text(function (d) { return (d.label || d.id).length > 12 ? (d.label || d.id).substring(0, 12) + '...' : (d.label || d.id); })
            .attr('dx', function (d) { return d.type === 'human' ? 12 : 10; })
            .attr('dy', 4)
            .attr('font-size', function (d) { return d.type === 'human' ? '10px' : '9px'; })
            .attr('fill', 'rgba(255,255,255,0.7)')
            .style('pointer-events', 'none')
            .style('text-shadow', '0 1px 3px rgba(0,0,0,0.8)');

        /* Force simulation */
        var simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(function (d) { return d.id; }).distance(80).strength(function (d) { return d.strength || 0.5; }))
            .force('charge', d3.forceManyBody().strength(-200))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(function (d) { return d.type === 'human' ? 15 : 12; }))
            .on('tick', function () {
                link
                    .attr('x1', function (d) { return d.source.x; })
                    .attr('y1', function (d) { return d.source.y; })
                    .attr('x2', function (d) { return d.target.x; })
                    .attr('y2', function (d) { return d.target.y; });
                linkLabel
                    .attr('x', function (d) { return (d.source.x + d.target.x) / 2; })
                    .attr('y', function (d) { return (d.source.y + d.target.y) / 2; });
                node.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });
            });

        /* Initial zoom to fit */
        var initialTransform = d3.zoomIdentity.translate(0, 0).scale(1);
        svg.call(zoom.transform, initialTransform);

        /* Resize observer */
        var resizeObserver = new ResizeObserver(function () {
            var w = container.clientWidth;
            var h = container.clientHeight;
            if (w > 0 && h > 0) {
                svg.attr('width', w).attr('height', h);
                simulation.force('center', d3.forceCenter(w / 2, h / 2));
                simulation.alpha(0.3).restart();
            }
        });
        resizeObserver.observe(container);

        /* Expose for cleanup and path highlighting */
        container._simulation = simulation;
        container._resizeObserver = resizeObserver;
        container._linkSelection = link;
        container._nodeSelection = node;

    } catch (e) {
        console.warn('D3 force graph error, falling back:', e);
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;">Graph render error</div>';
    }
}

/* ===== PATH FINDING (BFS over relationship graph) ===== */

function getEntityNameById(id) {
    if (!id) return 'Unknown';
    var h = pazatorData.humans.find(function (x) { return x.id === id; });
    if (h) return h.name;
    var o = pazatorData.others.find(function (x) { return x.id === id; });
    return o ? o.name : id;
}

function findPath(startId, endId) {
    if (!window.pazatorRelationships) {
        showFloatingNotification('Relationship system not available', 'error');
        return null;
    }
    if (startId === endId) {
        return [{ nodeId: startId, relType: null, relLabel: '' }];
    }
    var visited = new Set();
    var queue = [{ nodeId: startId, path: [{ nodeId: startId, relType: null, relLabel: '' }] }];
    visited.add(startId);

    while (queue.length > 0) {
        var current = queue.shift();
        var rels = window.pazatorRelationships.getForEntity(current.nodeId);
        for (var i = 0; i < rels.length; i++) {
            var rel = rels[i];
            var neighborId = rel.sourceId === current.nodeId ? rel.targetId : rel.sourceId;
            if (visited.has(neighborId)) continue;
            visited.add(neighborId);
            var typeInfo = window.pazatorRelationships.getTypeInfo(rel.type);
            var newPath = current.path.concat([{ nodeId: neighborId, relType: rel.type, relLabel: typeInfo.label }]);
            if (neighborId === endId) return newPath;
            queue.push({ nodeId: neighborId, path: newPath });
        }
    }
    return null;
}

function highlightPathOnGraph(container, path) {
    if (!container || !path || path.length < 2) return;
    var linkSel = container._linkSelection;
    var nodeSel = container._nodeSelection;
    if (!linkSel || !nodeSel) return;

    linkSel.attr('stroke', function (d) { return d.color || 'rgba(255,255,255,0.2)'; })
        .attr('stroke-width', function (d) { return (d.strength || 0.5) * 2 + 0.5; })
        .attr('stroke-opacity', 0.6);
    nodeSel.select('circle').attr('stroke', 'rgba(255,255,255,0.3)').attr('stroke-width', 1.5);
    linkSel.attr('stroke-dasharray', function (d) { return d.dashed ? '4,4' : null; });

    var pathNodeIds = new Set();
    var pathEdges = [];
    for (var i = 0; i < path.length; i++) {
        pathNodeIds.add(path[i].nodeId);
    }
    for (var i = 1; i < path.length; i++) {
        var a = path[i - 1].nodeId, b = path[i].nodeId;
        pathEdges.push(a < b ? a + '|' + b : b + '|' + a);
    }
    var edgeSet = new Set(pathEdges);

    nodeSel.each(function (d) {
        var circle = d3.select(this).select('circle');
        if (pathNodeIds.has(d.id)) {
            circle.attr('stroke', '#00ff88').attr('stroke-width', 3);
        }
    });
    linkSel.each(function (d) {
        var sid = typeof d.source === 'object' ? d.source.id : d.source;
        var tid = typeof d.target === 'object' ? d.target.id : d.target;
        var key = sid < tid ? sid + '|' + tid : tid + '|' + sid;
        if (edgeSet.has(key)) {
            d3.select(this).attr('stroke', '#00ff88').attr('stroke-width', 3).attr('stroke-opacity', 1).attr('stroke-dasharray', null);
        }
    });
}

function clearPathHighlightFromGraph(container) {
    if (!container) return;
    var linkSel = container._linkSelection;
    var nodeSel = container._nodeSelection;
    if (!linkSel || !nodeSel) return;
    linkSel.attr('stroke', function (d) { return d.color || 'rgba(255,255,255,0.2)'; })
        .attr('stroke-width', function (d) { return (d.strength || 0.5) * 2 + 0.5; })
        .attr('stroke-opacity', 0.6)
        .attr('stroke-dasharray', function (d) { return d.dashed ? '4,4' : null; });
    nodeSel.select('circle').attr('stroke', 'rgba(255,255,255,0.3)').attr('stroke-width', 1.5);
    var resultEl = container._pathResultEl;
    if (resultEl) resultEl.innerHTML = '';
}

function buildPathText(path) {
    if (!path || path.length === 0) return 'No path found.';
    var parts = [];
    for (var i = 0; i < path.length; i++) {
        var name = getEntityNameById(path[i].nodeId);
        if (i === 0) {
            parts.push(name);
        } else {
            parts.push(' → <span class="path-rel">' + path[i].relLabel + '</span> → ' + name);
        }
    }
    return parts.join('');
}

function populateGraphEntitySelect(selectId, excludeId) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Select entity...</option>';
    pazatorData.humans.forEach(function (h) {
        if (h.id !== excludeId) {
            var opt = document.createElement('option');
            opt.value = h.id;
            opt.textContent = h.name + ' (Human)';
            sel.appendChild(opt);
        }
    });
    pazatorData.others.forEach(function (o) {
        if (o.id !== excludeId) {
            var opt = document.createElement('option');
            opt.value = o.id;
            opt.textContent = o.name + ' (Entity)';
            sel.appendChild(opt);
        }
    });
}

function findAndHighlightPath() {
    var container = document.getElementById('fullGraphContainer');
    if (!container) return;
    var startId = document.getElementById('pathStartSelect')?.value;
    var endId = document.getElementById('pathEndSelect')?.value;
    if (!startId || !endId) {
        showFloatingNotification('Select both start and end entities', 'warning');
        return;
    }
    if (startId === endId) {
        showFloatingNotification('Start and end entities are the same', 'info');
        return;
    }
    clearPathHighlightFromGraph(container);
    var path = findPath(startId, endId);
    var resultEl = document.getElementById('pathResult');
    if (!path) {
        if (resultEl) resultEl.innerHTML = '<span style="color:#ff6b6b;">No connecting path found between these entities.</span>';
        return;
    }
    highlightPathOnGraph(container, path);
    if (resultEl) {
        resultEl.innerHTML = '<div style="margin-bottom:4px;color:#00ff88;font-weight:600;">✓ Path found (' + (path.length - 1) + ' hops)</div>' +
            '<div class="path-text">' + buildPathText(path) + '</div>';
    }
}

function clearGraphPath() {
    var container = document.getElementById('fullGraphContainer');
    if (container) clearPathHighlightFromGraph(container);
}

/* Relationship Management */
function showAddRelationship(entityId, entityType) {
    entityType = entityType || 'human';
    var existing = document.getElementById('relManagerModal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'relManagerModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.style.zIndex = '10001';

    var types = window.pazatorRelationships ? window.pazatorRelationships.getTypes() : [];
    var entityName = 'Unknown';
    if (entityType === 'human') entityName = getHumanNameById(entityId);
    else {
        var e = pazatorData.others.find(function (o) { return o.id === entityId; });
        if (e) entityName = e.name;
    }

    var candidateOptions = '';
    pazatorData.humans.forEach(function (h) {
        if (h.id !== entityId) {
            candidateOptions += '<option value="' + h.id + '">' + escapeHtml(h.name) + ' (Human)</option>';
        }
    });
    pazatorData.others.forEach(function (o) {
        if (o.id !== entityId) {
            candidateOptions += '<option value="' + o.id + '" data-type="other">' + escapeHtml(o.name) + ' (Entity)</option>';
        }
    });

    var typeOptions = '';
    types.forEach(function (t) {
        typeOptions += '<option value="' + t.key + '" style="color:' + t.color + ';">' + t.label + '</option>';
    });

    modal.innerHTML =
        '<div class="modal-content" style="max-width:500px;">' +
        '<button class="close" onclick="document.getElementById(\'relManagerModal\').remove()">&times;</button>' +
        '<div class="modal-header"><h2>Add Relationship</h2></div>' +
        '<div class="modal-body">' +
        '<p style="color:#888;margin-bottom:16px;">Creating relationship for <strong>' + escapeHtml(entityName) + '</strong></p>' +
        '<div class="form-group">' +
        '<label>Target Entity</label>' +
        '<select id="relTargetSelect" class="form-control">' + candidateOptions + '</select>' +
        '</div>' +
        '<div class="form-group">' +
        '<label>Relationship Type</label>' +
        '<select id="relTypeSelect" class="form-control">' + typeOptions + '</select>' +
        '</div>' +
        '<div class="form-group">' +
        '<label>Strength (1-5)</label>' +
        '<input type="range" id="relStrength" min="1" max="5" value="3" style="width:100%;">' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;color:#666;"><span>Weak</span><span>Strong</span></div>' +
        '</div>' +
        '<div class="form-group">' +
        '<label>Notes (optional)</label>' +
        '<textarea id="relNotes" class="form-control" rows="2" placeholder="Context about this relationship..."></textarea>' +
        '</div>' +
        '</div>' +
        '<div class="form-actions-horizontal">' +
        '<button class="btn-enhanced glass-btn" onclick="document.getElementById(\'relManagerModal\').remove()">Cancel</button>' +
        '<button class="btn-enhanced btn-primary" onclick="confirmAddRelationship(\'' + entityId + '\',\'' + entityType + '\')"><i class="fas fa-link"></i> Add Relationship</button>' +
        '</div></div>';

    document.body.appendChild(modal);
}

function confirmAddRelationship(entityId, entityType) {
    var targetSelect = document.getElementById('relTargetSelect');
    var typeSelect = document.getElementById('relTypeSelect');
    var strength = parseInt(document.getElementById('relStrength').value) || 3;
    var notes = document.getElementById('relNotes').value || '';

    var targetId = targetSelect.value;
    if (!targetId) {
        showAlert('Please select a target entity', 'Error', 'error');
        return;
    }
    var targetOption = targetSelect.options[targetSelect.selectedIndex];
    var targetType = targetOption.getAttribute('data-type') || 'human';
    var relType = typeSelect.value;

    if (window.pazatorRelationships) {
        var existing = window.pazatorRelationships.getForEntity(entityId, entityType);
        var alreadyExists = existing.some(function (r) {
            return (r.sourceId === entityId && r.targetId === targetId) ||
                (r.sourceId === targetId && r.targetId === entityId);
        });
        if (alreadyExists) {
            showAlert('A relationship between these entities already exists', 'Error', 'error');
            return;
        }
        window.pazatorRelationships.add({
            sourceId: entityId,
            sourceType: entityType,
            targetId: targetId,
            targetType: targetType,
            type: relType,
            strength: strength,
            notes: notes
        });
    }

    var modal = document.getElementById('relManagerModal');
    if (modal) modal.remove();
    showAlert('Relationship added', 'Success', 'success');
    refreshDetailView();
}

function removeRelationship(relId) {
    if (!window.pazatorRelationships) return;
    if (!confirm('Remove this relationship?')) return;
    window.pazatorRelationships.remove(relId);
    refreshDetailView();
}

function refreshDetailView() {
    var modal = document.getElementById('detailViewModal');
    if (modal && modal.style.display === 'flex' && document.currentDetailData) {
        showDetailView(document.currentDetailData, document.currentDetailData.type);
    }
}

/* Listen for relationship changes to refresh UI */
if (window.pazatorRelationships) {
    window.pazatorRelationships.on('changed', function () {
        if (window.pazatorStore) {
            window.pazatorStore.markDirty('relationships');
        }
    });
}

function renderConnectionsList(connections, listContainer) {
    listContainer.innerHTML = '';

    connections.forEach((connection, index) => {
        const item = document.createElement('div');
        item.className = 'connection-item';

        item.innerHTML = `
            <div class="connection-item-header">
                <strong>${connection.person1} <-> ${connection.person2}</strong>
                <span class="connection-type">${connection.connectionType}</span>
            </div>
            <p>${connection.reason}</p>
        `;

        listContainer.appendChild(item);
    });
}
