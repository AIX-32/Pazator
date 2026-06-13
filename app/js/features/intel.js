const aiSuggestTagsBtn = document.getElementById('aiSuggestTagsBtn');

aiSuggestTagsBtn?.addEventListener('click', async () => {
    if (pazatorData.humans.length === 0 && pazatorData.others.length === 0) {
        showAlert('No data to analyze. Add some people or entities first.', 'Notice', 'info');
        return;
    }

    aiSuggestTagsBtn.disabled = true;
    aiSuggestTagsBtn.innerHTML = '<div class="loader" style="--size:16px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Analyzing...';

    try {
        const humansData = pazatorData.humans.map(h => ({
            name: h.name,
            workplace: h.workplace || '',
            tags: h.tags || [],
            notes: h.extraNotes || ''
        }));

        const othersData = pazatorData.others.map(o => ({
            name: o.name,
            tags: o.tags || [],
            notes: (o.note || o.extraNotes || '')
        }));

        const existingTags = tags.slice();

        const prompt = `Analyze this intelligence data and suggest relevant tags. Return a JSON array of suggested tags with reasoning.

Existing tags (don't duplicate): ${existingTags.join(', ') || 'none'}

Humans/People:
${JSON.stringify(humansData, null, 2)}

Companies/Entities:
${JSON.stringify(othersData, null, 2)}

Return JSON in this format:
{
  "suggestedTags": [
    {"tag": "tag-name", "reason": "why this tag is useful", "appliesTo": ["person1", "person2"]}
  ]
}

Make tags:
- Lowercase with hyphens (e.g., "tech-company", "former-military")
- Specific and meaningful
- Based on workplace, name patterns, or notes
- Max 20 suggestions, focus on most useful tags`;

        const response = await Promise.race([
            geminiChat([
                { role: "system", content: "You are an intelligence analyst. Return ONLY valid JSON." },
                { role: "user", content: prompt }
            ]),
            new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 30000))
        ]);

        const responseText = response.content ? response.content : response;
        const result = extractJSONFromResponse(responseText);

        if (result && result.suggestedTags && Array.isArray(result.suggestedTags)) {
            showAISuggestTagsModal(result.suggestedTags);
        } else {
            showAlert('Could not parse AI response. Try again.', 'Error', 'error');
        }
    } catch (error) {
        console.error('AI tag suggestion error:', error);
        showAlert('Failed to get AI suggestions. Please try again.', 'Error', 'error');
    } finally {
        aiSuggestTagsBtn.disabled = false;
        aiSuggestTagsBtn.innerHTML = '<i class="fas fa-robot"></i> AI Suggest Tags';
    }
});

function showAISuggestTagsModal(suggestions) {
    let modal = document.getElementById('aiTagSuggestModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'aiTagSuggestModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 550px; max-height: 80vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2>AI Suggested Tags</h2>
                    <button id="aiTagModalClose" class="close-modal-btn" style="background: none; border: none; color: #888; font-size: 1.5rem; cursor: pointer;">&times;</button>
                </div>
                <div class="modal-body" id="aiTagModalBody"></div>
                <div class="modal-footer" style="display: flex; gap: 12px; justify-content: flex-end; padding: 16px; border-top: 1px solid #333;">
                    <button id="aiTagCancel" class="btn btn-secondary">Cancel</button>
                    <button id="aiTagAddAll" class="btn btn-primary">Add All Tags</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#aiTagModalClose').addEventListener('click', () => {
            modal.style.display = 'none';
        });
        modal.querySelector('#aiTagCancel').addEventListener('click', () => {
            modal.style.display = 'none';
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
    }

    let selectedTags = new Set();

    const renderSuggestions = () => {
        const body = modal.querySelector('#aiTagModalBody');
        body.innerHTML = suggestions.map((s, i) => `
            <div class="ai-tag-suggestion" data-index="${i}" style="padding: 12px; margin-bottom: 10px; background: rgba(30,30,30,0.8); border-radius: 8px; border: 1px solid #333; cursor: pointer; ${selectedTags.has(s.tag) ? 'border-color: #4ade80;' : ''}">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" class="ai-tag-checkbox" data-tag="${s.tag}" ${selectedTags.has(s.tag) ? 'checked' : ''}>
                    <span style="font-weight: 600; color: #fff;">${s.tag}</span>
                    ${tags.includes(s.tag) ? '<span style="font-size: 0.7rem; background: #666; padding: 2px 6px; border-radius: 4px; color: #ccc;">exists</span>' : ''}
                </div>
                <div style="font-size: 0.85rem; color: #888; margin-top: 6px; margin-left: 26px;">${s.reason}</div>
                ${s.appliesTo?.length ? `<div style="font-size: 0.75rem; color: #666; margin-top: 4px; margin-left: 26px;">Applies to: ${s.appliesTo.slice(0, 5).join(', ')}${s.appliesTo.length > 5 ? '...' : ''}</div>` : ''}
            </div>
        `).join('');

        body.querySelectorAll('.ai-tag-suggestion').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox') return;
                const checkbox = el.querySelector('.ai-tag-checkbox');
                checkbox.checked = !checkbox.checked;
                const tag = checkbox.dataset.tag;
                if (checkbox.checked) {
                    selectedTags.add(tag);
                } else {
                    selectedTags.delete(tag);
                }
                renderSuggestions();
            });
        });

        body.querySelectorAll('.ai-tag-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const tag = e.target.dataset.tag;
                if (e.target.checked) {
                    selectedTags.add(tag);
                } else {
                    selectedTags.delete(tag);
                }
                renderSuggestions();
            });
        });
    };

    renderSuggestions();

    modal.querySelector('#aiTagAddAll').onclick = () => {
        let added = 0;
        selectedTags.forEach(tag => {
            if (!tags.includes(tag)) {
                tags.push(tag);
                added++;
            }
        });
        if (added > 0) {
            renderTags();
        }
        modal.style.display = 'none';
        showAlert(`Added ${added} new tag(s)`, 'Tags Updated', 'success');
    };

    modal.style.display = 'flex';
}



if (showStatisticsBtn) showStatisticsBtn.addEventListener('click', () => {
    const humanCount = pazatorData.humans.length;
    const otherCount = pazatorData.others.length;
    const totalConnections = pazatorData.humans.reduce((total, human) => {
        return total + (human.family ? human.family.length : 0) + (human.friends ? human.friends.length : 0);
    }, 0);

    showAlert(`Statistics:
- Humans: ${humanCount}
- Others: ${otherCount}
- Total Entries: ${humanCount + otherCount}
- Connections: ${totalConnections}`, 'Statistics', 'info');
});

findConnectionsBtn?.addEventListener('click', async () => {
    if (!pazatorData.humans.length) {
        window.showFloatingNotification?.('No people data to analyze.', 'error');
        return;
    }
    if (!window.TIDE_INSTANCE) {
        window.showFloatingNotification?.('TIDE engine not loaded.', 'error');
        return;
    }
    var tide = window.TIDE_INSTANCE;
    var totalChunks = Math.ceil(pazatorData.humans.length / 20);
    TIDE_MONITOR.show('Connection Analysis', totalChunks);

    tide.onProgress(function (processed, total, label) {
        TIDE_MONITOR.updateProgress(processed, total, label || 'Analyzing relationships...');
    });

    try {
        var findings = await tide.analyze('connection', pazatorData.humans);

        TIDE_MONITOR.complete({
            totalChunks: totalChunks,
            totalFindings: findings.length,
            chunksText: 'Connection analysis completed',
            typesText: findings.length > 0 ? findings.length + ' hidden connections identified' : 'No connections found',
            detailText: ''
        });
        _saveTideReport('connection', findings, { total: findings.length });

        setTimeout(function () {
            TIDE_MONITOR.hide();
            var modal = document.getElementById('hiddenConnectionsModal');
            var loading = document.getElementById('connectionsLoading');
            var results = document.getElementById('connectionsResults');
            var none = document.getElementById('noConnections');
            var graph = document.getElementById('connectionsGraph');
            var list = document.getElementById('connectionsList');

            modal.style.display = 'flex';
            modal.style.zIndex = '1000';
            loading.style.display = 'block';
            results.style.display = 'none';
            none.style.display = 'none';
            graph.innerHTML = '';
            list.innerHTML = '';
            modal.querySelector('h2').textContent = 'TIDE Connection Analysis';

            if (findings.length > 0) {
                loading.style.display = 'none';
                results.style.display = 'block';
                var connections = findings.map(function (f) {
                    var parts = (f.subject || '').split(' <-> ');
                    return {
                        person1: parts[0] || 'Unknown',
                        person2: parts[1] || 'Unknown',
                        evidence: f.content || '',
                        reasons: [f.content || '']
                    };
                });
                if (typeof window.renderFraudstersGraph === 'function') {
                    window.renderFraudstersGraph(connections, graph);
                }
                if (typeof window.renderFraudstersList === 'function') {
                    window.renderFraudstersList(connections, list);
                }
            } else {
                loading.style.display = 'none';
                none.style.display = 'block';
                none.innerHTML = '<h3>No Hidden Connections Found</h3><p>TIDE did not detect any significant hidden relationships.</p>';
            }
        }, 800);
    } catch (err) {
        console.error('TIDE connection analysis failed:', err);
        TIDE_MONITOR.setStatus('Error: ' + err.message);
        setTimeout(function () { TIDE_MONITOR.hide(); }, 1500);
    }
});

refreshCreditsBtn?.addEventListener('click', () => {
    refreshPersonCredits();
});
sortByCreditBtn?.addEventListener('click', () => {
    sortByCredit();
});

intelAnalyzeBtn?.addEventListener('click', async () => {
    if (!pazatorData.humans.length) {
        window.showFloatingNotification?.('No people data to analyze. Add people first.', 'error');
        return;
    }
    if (!window.pazatorGemini?.getApiKey?.()) {
        const modal = document.getElementById('settingsModal');
        if (modal) modal.style.display = 'flex';
        window.showFloatingNotification?.('Gemini API key not configured. Open Settings to add one.', 'error');
        return;
    }
    if (!window.TIDE_INSTANCE) {
        window.showFloatingNotification?.('TIDE engine not loaded.', 'error');
        return;
    }
    var tide = window.TIDE_INSTANCE;
    var findCountEl = document.getElementById('intelFindingsCount');
    var resultsContainer = document.getElementById('intelResults');
    var resultsContent = document.getElementById('intelResultsContent');
    var countBadge = document.getElementById('intelResultsCount');
    var analBtn = document.getElementById('intelAnalyzeBtn');

    var typesToRun = ['threat', 'risk', 'intel'];
    var totalChunksEstimate = Math.ceil(pazatorData.humans.length / 20) * typesToRun.length * 2;
    TIDE_MONITOR.show('Multi-Phase Scan', totalChunksEstimate);

    analBtn.disabled = true;
    analBtn.innerHTML = '<div class="loader" style="--size:16px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> TIDE Deploying...';

    if (resultsContainer) resultsContainer.style.display = 'none';

    var allFindings = [];
    var runCount = 0;

    tide.onProgress(function (processed, total, label) {
        TIDE_MONITOR.updateProgress(processed, total, label || 'Processing...');
    });

    tide.onChunkComplete(function (chunkIndex, totalChunks, chunkResults) {
        if (chunkResults && chunkResults.length) {
            allFindings = allFindings.concat(chunkResults);
            TIDE_MONITOR.addFindings(chunkResults.length);
        }
    });

    tide.onComplete(function (findings) {
        if (findings && findings.length > 0) {
            if (window.renderFindingsToCards) window.renderFindingsToCards(findings);
            if (findCountEl) findCountEl.textContent = findings.length;
            if (countBadge) countBadge.textContent = findings.length + ' findings';
        }
        runCount++;
        if (runCount >= typesToRun.length) {
            var summary = tide.getSummary();
            TIDE_MONITOR.complete({
                totalChunks: summary.total || totalChunksEstimate,
                totalFindings: summary.total,
                chunksText: 'Processed all phases across ' + typesToRun.length + ' analysis types',
                typesText: summary.total > 0 ? summary.total + ' total findings generated' : 'No findings generated',
                detailText: summary.byType ? Object.keys(summary.byType).map(function (t) { return t + ': ' + summary.byType[t]; }).join(', ') : ''
            });
            _saveTideReport('multi', allFindings, summary);
            window.showFloatingNotification?.('TIDE analysis complete. ' + summary.total + ' total findings.', 'success');
        }
    });

    try {
        var people = pazatorData.humans;
        for (var i = 0; i < typesToRun.length; i++) {
            if (tide.isRunning()) {
                window.showFloatingNotification?.('TIDE is busy. Waiting...', 'info');
                TIDE_MONITOR.setStatus('Waiting for previous phase...');
                continue;
            }
            TIDE_MONITOR.setStatus('Deploying ' + typesToRun[i] + ' analysis on ' + people.length + ' entities...');
            TIDE_MONITOR.setFindingsCount(0, 0);
            await tide.analyze(typesToRun[i], people);
        }
    } catch (err) {
        console.error('TIDE analysis error:', err);
        window.showFloatingNotification?.('TIDE analysis failed: ' + err.message, 'error');
        TIDE_MONITOR.setStatus('Error: ' + err.message);
        setTimeout(function () { TIDE_MONITOR.hide(); }, 2000);
    } finally {
        analBtn.disabled = false;
        analBtn.innerHTML = '<i class="fas fa-play"></i> Deploy Agents';
    }
});

intelConnectionsBtn?.addEventListener('click', async () => {
    await deployConnectionAgents();
});

intelRefreshRiskBtn?.addEventListener('click', () => {
    refreshPersonCredits();
    updateCreditStats();
});

intelClearResults?.addEventListener('click', () => {
    const resultsEl = document.getElementById('intelResults');
    const contentEl = document.getElementById('intelResultsContent');
    const countBadge = document.getElementById('intelResultsCount');
    const findingsCountEl = document.getElementById('intelFindingsCount');
    if (resultsEl) resultsEl.style.display = 'none';
    if (contentEl) contentEl.innerHTML = '';
    if (countBadge) countBadge.textContent = '0 findings';
    if (findingsCountEl) findingsCountEl.textContent = '0';
});

document.getElementById('intelFilterType')?.addEventListener('change', function () {
    if (_lastIntelFindings && _lastIntelFindings.length > 0) {
        renderFindingsToCards(_lastIntelFindings);
    }
});

intelHeurBtn?.addEventListener('click', function () {
    if (!window.pazatorHeuristics) {
        showFloatingNotification('Heuristic Linkage system not available', 'error');
        return;
    }
    var duplicates = window.pazatorHeuristics.scan(pazatorData.humans);

    // Update summary text
    var summaryEl = document.getElementById('intelHeurSummary');
    if (summaryEl) {
        summaryEl.textContent = duplicates.length + ' suspected alias' + (duplicates.length !== 1 ? 'es' : '');
    }

    var contentEl = document.getElementById('heurModalContent');
    if (!contentEl) return;

    if (duplicates.length === 0) {
        contentEl.innerHTML = '<div style="text-align:center;color:#666;padding:48px 24px;">' +
            '<i class="fas fa-fingerprint" style="font-size:3rem;color:#333;margin-bottom:16px;display:block;"></i>' +
            '<h3>NO SUSPECTED DUPLICATES</h3>' +
            '<p style="font-size:0.85rem;color:#888;margin-top:6px;">All ingested entity linkages appear stable and distinct.</p>' +
            '</div>';
    } else {
        var html = '<div style="display:flex;flex-direction:column;gap:16px;">';
        duplicates.forEach(function (dup, index) {
            var color = dup.score >= 80 ? '#ff6b6b' : dup.score >= 60 ? '#ffd93d' : '#a29bfe';
            html += '<div class="heur-card" style="background:rgba(255,255,255,0.015);border:1px solid rgba(255,255,255,0.05);border-radius:6px;padding:16px;display:flex;flex-direction:column;gap:12px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<span style="font-size:0.8rem;font-weight:600;color:' + color + ';text-transform:uppercase;letter-spacing:0.05em;border:1px solid ' + color + '44;padding:3px 8px;border-radius:4px;">' +
                dup.score + '% Match Probability</span>' +
                '<span style="font-size:0.75rem;color:#555;">ID Resolve System #' + (index + 1) + '</span>' +
                '</div>' +
                '<div style="display:flex;gap:20px;align-items:center;margin:8px 0;">' +
                '<div style="flex:1;text-align:right;font-size:0.95rem;font-weight:600;color:#fff;">' + escapeHtml(dup.person1.name) + '</div>' +
                '<div style="color:#555;font-size:0.8rem;"><i class="fas fa-arrows-left-right"></i></div>' +
                '<div style="flex:1;text-align:left;font-size:0.95rem;font-weight:600;color:#fff;">' + escapeHtml(dup.person2.name) + '</div>' +
                '</div>' +
                '<div style="border-top:1px solid rgba(255,255,255,0.04);padding-top:10px;">' +
                '<div style="font-size:0.75rem;color:#888;margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.03em;">Correlation Evidence:</div>' +
                '<ul style="margin:0;padding-left:16px;font-size:0.8rem;color:rgba(255,255,255,0.6);line-height:1.5;">' +
                dup.reasons.map(function (r) { return '<li>' + escapeHtml(r) + '</li>'; }).join('') +
                '</ul>' +
                '</div>' +
                '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px;">' +
                '<button class="btn glass-btn btn-sm" onclick="heurInvestigate(\'' + dup.person1.id + '\',\'' + dup.person2.id + '\')">' +
                '<i class="fas fa-magnifying-glass"></i> Investigate Path</button>' +
                '<button class="btn btn-primary btn-sm" onclick="heurResolveLink(\'' + dup.person1.id + '\',\'' + dup.person2.id + '\')">' +
                '<i class="fas fa-link"></i> Link as Associates</button>' +
                '</div>' +
                '</div>';
        });
        html += '</div>';
        contentEl.innerHTML = html;
    }

    heurModal.style.display = 'flex';
    heurModal.style.zIndex = '1100';
});

document.getElementById('closeHeurModal')?.addEventListener('click', function () {
    heurModal.style.display = 'none';
});

document.getElementById('closeHeurModalBtn')?.addEventListener('click', function () {
    heurModal.style.display = 'none';
});

window.heurInvestigate = function (id1, id2) {
    heurModal.style.display = 'none';
    showFloatingNotification('Graph view has been removed.', 'info');
};

window.heurResolveLink = async function (id1, id2) {
    // Make them friends/associates
    var p1 = pazatorData.humans.find(function (h) { return String(h.id) === String(id1); });
    var p2 = pazatorData.humans.find(function (h) { return String(h.id) === String(id2); });
    if (!p1 || !p2) return;

    p1.friends = p1.friends || [];
    p2.friends = p2.friends || [];

    if (p1.friends.indexOf(id2) === -1) p1.friends.push(id2);
    if (p2.friends.indexOf(id1) === -1) p2.friends.push(id1);

    // Save to DB
    if (window.pazatorStore && typeof pazatorStore.saveToDb === 'function') {
        await pazatorStore.saveToDb();
    }

    showFloatingNotification('Resolved: Established bidirectional link between ' + p1.name + ' and ' + p2.name, 'success');

    // Refresh HEUR modal list
    document.getElementById('intelHeurBtn')?.click();
};

var _lastIntelFindings = [];

function renderFindingsToCards(findings) {
    _lastIntelFindings = findings;
    var filterVal = (document.getElementById('intelFilterType')?.value || 'all');
    var filtered = filterVal === 'all' ? findings : findings.filter(function (f) { return (f.type || 'info') === filterVal; });

    var container = document.getElementById('intelResultsContent');
    var countBadge = document.getElementById('intelResultsCount');
    var resultsEl = document.getElementById('intelResults');

    if (!container) return;

    container.innerHTML = '';
    resultsEl.style.display = 'block';
    countBadge.textContent = filtered.length + ' finding' + (filtered.length !== 1 ? 's' : '') + (filterVal !== 'all' ? ' (' + findings.length + ' total)' : '');

    var lastAnalysisId = window._lastIntelAnalysisId;

    filtered.forEach(function (finding) {
        var card = document.createElement('div');
        card.className = 'intel-finding intel-finding-' + (finding.type || 'info');

        var typeIcon = {
            threat: 'fa-exclamation-triangle',
            risk: 'fa-shield-alt',
            connection: 'fa-link',
            positive: 'fa-check-circle',
            info: 'fa-info-circle'
        }[finding.type] || 'fa-info-circle';

        var typeLabel = {
            threat: 'Threat',
            risk: 'Risk',
            connection: 'Connection',
            positive: 'Positive',
            info: 'Info'
        }[finding.type] || 'Info';

        card.innerHTML =
            '<div class="intel-finding-header">' +
            '<div class="intel-finding-type">' +
            '<i class="fas ' + typeIcon + '"></i>' +
            '<span>' + typeLabel + '</span>' +
            '</div>' +
            '<div class="intel-finding-subject">' + (finding.subject || 'Unknown') + '</div>' +
            '</div>' +
            '<div class="intel-finding-content">' + (finding.content || finding.description || '') + '</div>' +
            (finding.evidence ? '<div class="intel-finding-evidence"><i class="fas fa-fingerprint"></i> ' + finding.evidence + '</div>' : '') +
            '<div class="intel-finding-footer">' +
            (finding.tags || []).map(function (tag) { return '<span class="intel-finding-tag">' + tag + '</span>'; }).join('') +
            (lastAnalysisId ? '<button class="intel-save-evidence-btn" onclick="addAnalysisToEvidence(\'' + lastAnalysisId + '\')"><i class="fas fa-gavel"></i> Add to Case</button>' : '') +
            '</div>';

        container.appendChild(card);
    });

    if (findings.length === 0) {
        container.innerHTML =
            '<div class="intel-empty-state">' +
            '<i class="fas fa-search"></i>' +
            '<p>No findings detected</p>' +
            '<small>The analysis completed but no significant patterns were found</small>' +
            '</div>';
    }
}

function _saveTideReport(analysisType, findings, summary) {
    if (!findings || !findings.length) {
        console.log('[saveTideReport] no findings to save for', analysisType);
        return;
    }
    if (window.pazatorReportManager && window.pazatorReportManager.saveTideReport) {
        console.log('[saveTideReport] delegating to ReportManager for', analysisType, findings.length, 'findings');
        window.pazatorReportManager.saveTideReport(analysisType, findings, summary);
        return;
    }
    console.log('[saveTideReport] using localStorage fallback for', analysisType, findings.length, 'findings');
    try {
        var key = 'pazator_analysis_reports';
        var data = JSON.parse(localStorage.getItem(key)) || { reports: [] };
        var label = analysisType === 'multi' ? 'Intelligence Scan' : analysisType;
        var report = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            title: label + ' \u2014 ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            type: 'tide_analysis',
            analysisType: analysisType,
            createdAt: new Date().toISOString(),
            findingsCount: findings.length,
            summary: summary ? (summary.total + ' findings') : '',
            findings: findings
        };
        data.reports.push(report);
        localStorage.setItem(key, JSON.stringify(data));
        console.log('[saveTideReport] saved via localStorage fallback, total reports:', data.reports.length);
    } catch (e) { console.warn('[saveTideReport] failed:', e); }
}

function addAnalysisToEvidence(analysisId) {
    if (!cases || cases.length === 0) {
        showFloatingNotification('No cases yet. Create a case first.', 'info');
        return;
    }
    if (!selectedCaseId) {
        var caseList = cases.map(function (c, i) { return (i + 1) + '. ' + c.title; }).join('\n');
        showFloatingNotification('Select a case first, then add evidence from the case detail panel.', 'info');
        return;
    }
    var caseData = cases.find(function (c) { return c.id === selectedCaseId; });
    if (!caseData) {
        showFloatingNotification('Select a case first.', 'info');
        return;
    }
    loadAnalyses();
    var analysis = analysesStore.find(function (a) { return a.id === analysisId; });
    if (!analysis) return;
    if (!caseData.evidence) caseData.evidence = [];
    if (caseData.evidence.find(function (e) { return e.id === analysisId; })) {
        showFloatingNotification('This analysis is already attached as evidence to the current case.', 'info');
        return;
    }
    caseData.evidence.push({
        id: analysis.id,
        type: analysis.type,
        title: analysis.title,
        findingCount: analysis.findings.length,
        addedAt: Date.now()
    });
    caseData.timeline.push({
        type: 'note',
        content: '<strong>Evidence added</strong>: ' + escapeHtml(analysis.title),
        timestamp: Date.now()
    });
    saveCases();
    selectCase(selectedCaseId);
    showFloatingNotification('Evidence added to case: ' + caseData.title, 'success');
}

analyzeAllChatsBtn?.addEventListener('click', async () => {
    await analyzeAllChats();
});

refreshChatListBtn?.addEventListener('click', () => {
    loadSavedChats();
});

exportChatReportBtn?.addEventListener('click', () => {
    exportChatReport();
});

clearChatHistoryBtn?.addEventListener('click', () => {
    clearChatHistory();
});

document.getElementById('archiveOldChatsBtn')?.addEventListener('click', function () {
    var result = ChatStorageManager.archiveOldChats();
    showFloatingNotification('Archived ' + result.archived + ' old chats (' + result.active + ' remain active)', 'info');
    loadSavedChats();
});

document.getElementById('restoreArchivedChatsBtn')?.addEventListener('click', function () {
    var count = ChatStorageManager.restoreArchivedChats();
    if (count > 0) {
        showFloatingNotification('Restored ' + count + ' archived chats', 'success');
        loadSavedChats();
    } else {
        showFloatingNotification('No archived chats to restore', 'info');
    }
});

var chatSearchDebounced = window.PazatorUI ? PazatorUI.debounce(function (e) {
    chatSearchFilter = (e.target.value || '').toLowerCase();
    loadSavedChats();
}, 400) : function (e) {
    chatSearchFilter = (e.target.value || '').toLowerCase();
    loadSavedChats();
};
chatSearchInput?.addEventListener('input', chatSearchDebounced);

chatFilterSource?.addEventListener('change', (e) => {
    chatSourceFilter = e.target.value;
    loadSavedChats();
});

selectAllChatsBtn?.addEventListener('click', () => {
    const history = ChatStorageManager.getChatHistory();
    const visibleIndices = getVisibleChatIndices();

    if (selectedChatIndices.size === visibleIndices.size) {
        selectedChatIndices.clear();
        selectAllChatsBtn.innerHTML = '<i class="fas fa-check-square"></i> Select';
        bulkDeleteChatsBtn.style.display = 'none';
    } else {
        visibleIndices.forEach(i => selectedChatIndices.add(i));
        selectAllChatsBtn.innerHTML = '<i class="fas fa-square"></i> Deselect';
        bulkDeleteChatsBtn.style.display = 'inline-block';
    }
    loadSavedChats();
});

bulkDeleteChatsBtn?.addEventListener('click', async () => {
    if (selectedChatIndices.size === 0) return;

    const confirmed = await showConfirm(
        `Delete ${selectedChatIndices.size} selected chats? This cannot be undone.`,
        'Confirm Bulk Delete',
        'warning'
    );

    if (confirmed) {
        const history = ChatStorageManager.getChatHistory();
        const sortedIndices = [...selectedChatIndices].sort((a, b) => b - a);

        sortedIndices.forEach(index => {
            ChatStorageManager.deleteChat(index);
        });

        selectedChatIndices.clear();
        selectAllChatsBtn.innerHTML = '<i class="fas fa-check-square"></i> Select';
        bulkDeleteChatsBtn.style.display = 'none';
        loadSavedChats();
        showAlert(`Deleted ${sortedIndices.length} chats`, 'Success', 'success');
    }
});

// Cross-entity search
setTimeout(initCrossSearch, 200);

// PDF export for cases
document.getElementById('exportCasePdfBtn')?.addEventListener('click', function () {
    if (selectedCaseId) exportCaseToPDF(selectedCaseId);
});
