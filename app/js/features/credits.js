function calculateCreditScore(human) {
    let score = 185;

    const positiveTags = ['rich', 'professional', 'trusted', 'reliable', 'honest', 'successful', 'educated', 'business', 'leader', 'owner', 'manager', 'doctor', 'engineer', 'investor', 'executive', 'professional', 'veteran'];
    const negativeTags = ['suspicious', 'fraud', 'dangerous', 'criminal', 'scam', 'untrusted', 'debt', 'bankrupt', 'unemployed', 'unstable'];

    if (human.tags && human.tags.length > 0) {
        human.tags.forEach(tag => {
            const t = tag.toLowerCase();
            if (positiveTags.includes(t)) score += 15;
            if (negativeTags.includes(t)) score -= 25;
        });
    }

    if (human.workplace) {
        const wp = human.workplace.toLowerCase();
        if (wp.includes('bank') || wp.includes('corp') || wp.includes('inc') || wp.includes('llc') || wp.includes('ltd') || wp.includes('group')) {
            score += 20;
        } else if (human.workplace) {
            score += 10;
        }
    }

    if (human.socialClass === '1%') score = Math.min(370, score + 100);
    else if (human.socialClass === 'high class') score = Math.min(370, score + 50);
    else if (human.socialClass === 'low class') score = Math.max(0, score - 50);

    const connections = (human.friends ? human.friends.length : 0) + (human.family ? human.family.length : 0);
    if (connections > 5) score = Math.min(370, score + 20);
    else if (connections === 0) score = Math.max(0, score - 20);

    if (human.extraNotes) {
        const notes = human.extraNotes.toLowerCase();
        if (notes.includes('trust') || notes.includes('reliable') || notes.includes('good') || notes.includes('stable')) score += 20;
        if (notes.includes('suspicious') || notes.includes('warning') || notes.includes('risk') || notes.includes('investigate')) score -= 35;
    }

    return Math.max(0, Math.min(370, Math.round(score)));
}

function inferSocialClass(creditScore) {
    if (creditScore >= 300) return '1%';
    if (creditScore >= 220) return 'high class';
    if (creditScore >= 140) return 'medium class';
    return 'low class';
}

function getCreditRiskLevel(score) {
    if (score < 125) return 'high';
    if (score < 250) return 'medium';
    return 'low';
}

function showCreditEvalModal() {
    const modal = document.getElementById('creditEvalModal');
    const progressContainer = document.getElementById('creditEvalProgressContainer');
    const resultsContainer = document.getElementById('creditEvalResults');
    const closeBtn = document.getElementById('creditEvalCloseBtn');
    const icon = document.getElementById('creditEvalIcon');
    const title = document.getElementById('creditEvalTitle');

    if (modal) modal.classList.add('active');
    if (progressContainer) progressContainer.style.display = 'block';
    if (resultsContainer) resultsContainer.style.display = 'none';
    if (closeBtn) closeBtn.style.display = 'none';
    if (icon) {
        icon.classList.remove('done');
        icon.classList.add('processing');
        icon.innerHTML = '<i class="fas fa-brain fa-spin"></i>';
    }
    if (title) title.textContent = 'AI Credit Evaluation';

    updateCreditEvalProgress(0, pazatorData.humans.length, '-');
}

function updateCreditEvalProgress(current, total, currentName) {
    const progressFill = document.getElementById('creditEvalProgressFill');
    const progressText = document.getElementById('creditEvalProgressText');
    const currentNameEl = document.getElementById('creditEvalCurrentName');

    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    if (progressFill) progressFill.style.width = pct + '%';
    if (progressText) progressText.textContent = `${current} / ${total}`;
    if (currentNameEl) currentNameEl.textContent = currentName || '-';
}

function showCreditEvalComplete(results) {
    const modal = document.getElementById('creditEvalModal');
    const progressContainer = document.getElementById('creditEvalProgressContainer');
    const resultsContainer = document.getElementById('creditEvalResults');
    const closeBtn = document.getElementById('creditEvalCloseBtn');
    const icon = document.getElementById('creditEvalIcon');
    const title = document.getElementById('creditEvalTitle');

    if (progressContainer) progressContainer.style.display = 'none';
    if (resultsContainer) resultsContainer.style.display = 'block';
    if (closeBtn) closeBtn.style.display = 'inline-flex';
    if (icon) {
        icon.classList.remove('processing');
        icon.classList.add('done');
        icon.innerHTML = '<i class="fas fa-check"></i>';
    }
    if (title) title.textContent = 'Evaluation Complete';

    const highCount = document.getElementById('creditEvalHighCount');
    const mediumCount = document.getElementById('creditEvalMediumCount');
    const lowCount = document.getElementById('creditEvalLowCount');
    const detail = document.getElementById('creditEvalDetail');

    if (highCount) highCount.textContent = results.high;
    if (mediumCount) mediumCount.textContent = results.medium;
    if (lowCount) lowCount.textContent = results.low;
    if (detail) {
        detail.innerHTML = `Analyzed <strong>${results.total}</strong> people. ` +
            `Average score: <strong>${results.average}</strong>. ` +
            `Scores range from <strong>${results.min}</strong> to <strong>${results.max}</strong>.`;
    }
}

function hideCreditEvalModal() {
    const modal = document.getElementById('creditEvalModal');
    if (modal) modal.classList.remove('active');
}

async function refreshPersonCredits() {
    if (pazatorData.humans.length === 0) {
        showAlert('No humans to evaluate. Add some people first.', 'No Data', 'info');
        return;
    }

    if (!window.TIDE_INSTANCE) {
        showAlert('TIDE engine not loaded. Using fallback calculation.', 'Error', 'error');
        pazatorData.humans.forEach(function (h) {
            h.credit = calculateCreditScore(h);
            h.credit = Math.round(h.credit * 3.7);
            h.socialClass = inferSocialClass(h.credit);
        });
        saveData();
        renderObjectCanvas();
        updateCreditStats();
        return;
    }

    showCreditEvalModal();

    if (refreshCreditsBtn) {
        refreshCreditsBtn.disabled = true;
        refreshCreditsBtn.classList.add('loading');
        var trigger = refreshCreditsBtn.querySelector('.intel-action-trigger');
        if (trigger) trigger.innerHTML = '<div class="loader" style="--size:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></div> Evaluating...';
    }

    var tide = window.TIDE_INSTANCE;
    var humansToEvaluate = pazatorData.humans.map(function (h) {
        return {
            id: h.id, name: h.name, gender: h.gender || '', birthDate: h.birthDate || '',
            workplace: h.workplace || '', socialClass: h.socialClass || '',
            friends: h.friends || [], family: h.family || [],
            extraNotes: h.extraNotes || '', tags: h.tags || [], credit: h.credit || 185
        };
    });

    tide.onProgress(function (processed, total, label) {
        updateCreditEvalProgress(processed, total, label);
    });

    try {
        var result = await tide.analyze('credit', humansToEvaluate);

        pazatorData.humans.forEach(function (h) {
            var stored = result.scores ? result.scores[h.id] : undefined;
            if (stored !== undefined) {
                h.credit = stored;
            } else {
                h.credit = Math.floor(Math.random() * 150) + 110;
            }
            h.socialClass = tide.inferSocialClass(h.credit);
        });

        showCreditEvalComplete({
            high: result.high || 0,
            medium: result.medium || 0,
            low: result.low || 0,
            total: result.total || pazatorData.humans.length,
            average: result.average || 0,
            min: result.min || 0,
            max: result.max || 0
        });

        saveData();
        renderObjectCanvas();
        updateCreditStats();

    } catch (error) {
        console.error('TIDE credit evaluation failed:', error);
        showAlert('AI evaluation failed: ' + error.message + '. Using fallback calculation.', 'Error', 'error');

        pazatorData.humans.forEach(function (h) {
            h.credit = calculateCreditScore(h);
            h.credit = Math.round(h.credit * 3.7);
            h.socialClass = inferSocialClass(h.credit);
        });

        saveData();
        renderObjectCanvas();
        updateCreditStats();
        hideCreditEvalModal();
    }

    if (refreshCreditsBtn) {
        refreshCreditsBtn.disabled = false;
        refreshCreditsBtn.classList.remove('loading');
        var trigger = refreshCreditsBtn.querySelector('.intel-action-trigger');
        if (trigger) trigger.innerHTML = '<i class="fas fa-sync"></i> Refresh';
    }
}

document.getElementById('creditEvalCloseBtn')?.addEventListener('click', hideCreditEvalModal);

document.getElementById('creditEvalModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'creditEvalModal') {
        const resultsVisible = document.getElementById('creditEvalResults')?.style.display !== 'none';
        if (resultsVisible) hideCreditEvalModal();
    }
});

async function findPotentialTerrorists() {
    var modal = document.getElementById('hiddenConnectionsModal');

    findTerroristsBtn.disabled = true;
    findTerroristsBtn.textContent = 'TIDE Analyzing...';

    if (!window.TIDE_INSTANCE) {
        showAlert('TIDE engine not loaded.', 'Error', 'error');
        findTerroristsBtn.disabled = false;
        findTerroristsBtn.textContent = 'Find Potential Terrorists';
        return;
    }

    var tide = window.TIDE_INSTANCE;
    var people = pazatorData.humans;
    var totalChunks = Math.ceil(people.length / 20) * 2;
    TIDE_MONITOR.show('Terrorist Threat Analysis', totalChunks);

    tide.onProgress(function (processed, total, label) {
        TIDE_MONITOR.updateProgress(processed, total, label || 'Scanning for threat indicators...');
    });

    try {
        var findings = await tide.analyze('terrorist', people);

        TIDE_MONITOR.complete({
            totalChunks: totalChunks,
            totalFindings: findings.length,
            chunksText: 'Threat analysis completed',
            typesText: findings.length > 0 ? findings.length + ' potential threats identified' : 'No threats detected',
            detailText: ''
        });
        _saveCreditReport('terrorist', findings, { total: findings.length });

        setTimeout(function () {
            TIDE_MONITOR.hide();
            var loading = document.getElementById('connectionsLoading');
            var results = document.getElementById('connectionsResults');
            var none = document.getElementById('noConnections');
            var graph = document.getElementById('connectionsGraph');
            var list = document.getElementById('connectionsList');

            loading.style.display = 'block';
            results.style.display = 'none';
            none.style.display = 'none';
            modal.style.display = 'flex';
            modal.style.zIndex = '1000';
            modal.querySelector('h2').textContent = 'TIDE Terrorist Analysis';

            if (findings.length > 0) {
                loading.style.display = 'none';
                results.style.display = 'block';

                var terrorists = findings.map(function (f) {
                    return {
                        person: f.subject,
                        threatLevel: f.tags && f.tags.length > 0 ? (f.tags[0] === 'high' ? 'high' : 'medium') : 'medium',
                        evidence: f.evidence || f.content || '',
                        reasons: [f.content || '']
                    };
                });

                renderTerroristsGraph(terrorists, graph);
                renderTerroristsList(terrorists, list);

                var logs = terrorists.map(function (t) {
                    return {
                        type: 'Terrorist Threat Alert',
                        severity: t.threatLevel || 'medium',
                        person: t.person,
                        evidence: t.evidence,
                        reasons: t.reasons || [],
                        detectionMethod: 'TIDE Security Analysis',
                        confidence: t.threatLevel === 'high' ? 'High' : t.threatLevel === 'medium' ? 'Medium' : 'Low'
                    };
                });

                if (typeof storeTerroristLogs === 'function') storeTerroristLogs(logs);
            } else {
                loading.style.display = 'none';
                none.style.display = 'block';
                none.innerHTML = '<h3>No Threats Found</h3><p>TIDE analysis completed but found no significant indicators.</p>';
            }
        }, 800);
    } catch (error) {
        console.error('TIDE terrorist analysis failed:', error);
        TIDE_MONITOR.setStatus('Error: ' + error.message);
        setTimeout(function () {
            TIDE_MONITOR.hide();
            showAlert('TIDE terrorist analysis failed: ' + error.message, 'Error', 'error');
        }, 1500);
    } finally {
        findTerroristsBtn.disabled = false;
        findTerroristsBtn.textContent = 'Find Potential Terrorists';
    }
}

function _saveCreditReport(analysisType, findings, summary) {
    if (!findings || !findings.length) {
        console.log('[saveCreditReport] no findings to save for', analysisType);
        return;
    }
    if (window.pazatorReportManager && window.pazatorReportManager.saveTideReport) {
        console.log('[saveCreditReport] delegating to ReportManager for', analysisType, findings.length, 'findings');
        window.pazatorReportManager.saveTideReport(analysisType, findings, summary);
        return;
    }
    console.log('[saveCreditReport] using localStorage fallback for', analysisType, findings.length, 'findings');
    try {
        var key = 'pazator_analysis_reports';
        var data = JSON.parse(localStorage.getItem(key)) || { reports: [] };
        var labels = { terrorist: 'Terrorist', fraud: 'Fraud', connection: 'Connection' };
        var label = labels[analysisType] || analysisType;
        var report = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            title: label + ' Analysis \u2014 ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            type: 'tide_analysis',
            analysisType: analysisType,
            createdAt: new Date().toISOString(),
            findingsCount: findings.length,
            summary: summary ? (summary.total + ' findings') : '',
            findings: findings
        };
        data.reports.push(report);
        localStorage.setItem(key, JSON.stringify(data));
        console.log('[saveCreditReport] saved via localStorage fallback, total reports:', data.reports.length);
    } catch (e) { console.warn('[saveCreditReport] failed:', e); }
}
