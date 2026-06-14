function renderTerroristsGraph(terrorists, graphContainer) {
    graphContainer.innerHTML = '';

    const centerX = graphContainer.offsetWidth / 2;
    const centerY = graphContainer.offsetHeight / 2;
    const radius = Math.min(centerX, centerY) * 0.7;

    const terroristPositions = {};
    terrorists.forEach((terrorist, index) => {
        const angle = (index / terrorists.length) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * radius - 30;
        const y = centerY + Math.sin(angle) * radius - 30;

        terroristPositions[terrorist.person] = { x: x + 30, y: y + 30 };

        const node = document.createElement('div');
        node.className = 'connection-node';

        if (terrorist.threatLevel === 'high') {
            node.style.background = 'linear-gradient(145deg, #000, #333)';
        } else if (terrorist.threatLevel === 'medium') {
            node.style.background = 'linear-gradient(145deg, #333, #555)';
        } else {
            node.style.background = 'linear-gradient(145deg, #555, #777)';
        }
        node.textContent = terrorist.person.length > 10 ? terrorist.person.substring(0, 10) + '...' : terrorist.person;
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        graphContainer.appendChild(node);

        const label = document.createElement('div');
        label.className = 'connection-label';
        label.textContent = terrorist.threatLevel;
        label.style.left = `${x + 30}px`;
        label.style.top = `${y + 70}px`;
        label.style.background = 'rgba(30, 30, 30, 0.9)';
        graphContainer.appendChild(label);
    });
}

function renderTerroristsList(terrorists, listContainer) {
    listContainer.innerHTML = '';

    terrorists.forEach((terrorist, index) => {
        const item = document.createElement('div');
        item.className = 'connection-item';

        let threatClass = '';
        if (terrorist.threatLevel === 'high') {
            threatClass = 'style="background: linear-gradient(145deg, #000, #333);"';
        } else if (terrorist.threatLevel === 'medium') {
            threatClass = 'style="background: linear-gradient(145deg, #333, #555);"';
        }

        item.innerHTML = `
                    <div class="connection-item-header">
                        <strong>${terrorist.person}</strong>
                        <span class="connection-type" ${threatClass}>${terrorist.threatLevel} threat</span>
                    </div>
                    <p><strong>Evidence:</strong> ${terrorist.evidence}</p>
                    <div style="margin-top: 10px;">
                        <strong>Reasons:</strong>
                        <ul style="margin-top: 5px; padding-left: 20px;">
                            ${terrorist.reasons.map(reason => `<li>${reason}</li>`).join('')}
                        </ul>
                    </div>
                `;

        listContainer.appendChild(item);
    });
}

async function findPotentialFraud() {
    var modal = document.getElementById('hiddenConnectionsModal');

    findFraudBtn.disabled = true;
    findFraudBtn.textContent = 'TIDE Analyzing...';

    if (!window.TIDE_INSTANCE) {
        showAlert('TIDE engine not loaded.', 'Error', 'error');
        findFraudBtn.disabled = false;
        findFraudBtn.textContent = 'Find Potential Fraud';
        return;
    }

    var tide = window.TIDE_INSTANCE;
    var people = pazatorData.humans;
    var totalChunks = Math.ceil(people.length / 20) * 2;
    TIDE_MONITOR.show('Fraud Detection', totalChunks);

    tide.onProgress(function (processed, total, label) {
        TIDE_MONITOR.updateProgress(processed, total, label || 'Scanning for fraud indicators...');
    });

    try {
        var findings = await tide.analyze('fraud', people);

        TIDE_MONITOR.complete({
            totalChunks: totalChunks,
            totalFindings: findings.length,
            chunksText: 'Fraud analysis completed',
            typesText: findings.length > 0 ? findings.length + ' potential fraud cases identified' : 'No fraud detected',
            detailText: ''
        });
        _saveFindingsReport('fraud', findings, { total: findings.length });

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
            modal.querySelector('h2').textContent = 'TIDE Fraud Analysis';

            if (findings.length > 0) {
                loading.style.display = 'none';
                results.style.display = 'block';

                var fraudsters = findings.map(function (f) {
                    return {
                        person: f.subject,
                        riskLevel: f.tags && f.tags.length > 0 ? (f.tags[0] === 'high' ? 'high' : 'medium') : 'medium',
                        evidence: f.evidence || f.content || '',
                        reasons: [f.content || '']
                    };
                });

                renderFraudstersGraph(fraudsters, graph);
                renderFraudstersList(fraudsters, list);

                var logs = fraudsters.map(function (f) {
                    return {
                        type: 'Fraud Detection Alert',
                        severity: f.riskLevel || 'medium',
                        person: f.person,
                        evidence: f.evidence,
                        reasons: f.reasons || [],
                        detectionMethod: 'TIDE Pattern Analysis',
                        confidence: f.riskLevel === 'high' ? 'High' : f.riskLevel === 'medium' ? 'Medium' : 'Low'
                    };
                });

                if (typeof storeFraudLogs === 'function') storeFraudLogs(logs);
            } else {
                loading.style.display = 'none';
                none.style.display = 'block';
                none.innerHTML = '<h3>No Fraud Detected</h3><p>TIDE analysis completed but found no significant fraud indicators.</p>';
            }
        }, 800);
    } catch (error) {
        console.error('TIDE fraud analysis failed:', error);
        TIDE_MONITOR.setStatus('Error: ' + error.message);
        setTimeout(function () {
            TIDE_MONITOR.hide();
            modal.querySelector('h2').textContent = 'Hidden Connections Analysis';
            showAlert('TIDE fraud analysis failed: ' + error.message, 'Error', 'error');
        }, 1500);
    } finally {
        findFraudBtn.disabled = false;
        findFraudBtn.textContent = 'Find Potential Fraud';
    }
}

function renderFraudstersGraph(fraudsters, graphContainer) {
    graphContainer.innerHTML = '';

    const centerX = graphContainer.offsetWidth / 2;
    const centerY = graphContainer.offsetHeight / 2;
    const radius = Math.min(centerX, centerY) * 0.7;

    const fraudsterPositions = {};
    fraudsters.forEach((fraudster, index) => {
        const angle = (index / fraudsters.length) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * radius - 30;
        const y = centerY + Math.sin(angle) * radius - 30;

        fraudsterPositions[fraudster.person] = { x: x + 30, y: y + 30 };

        const node = document.createElement('div');
        node.className = 'connection-node';

        if (fraudster.riskLevel === 'high') {
            node.style.background = 'linear-gradient(145deg, #ff3939, #ff5a5a)';
        } else if (fraudster.riskLevel === 'medium') {
            node.style.background = 'linear-gradient(145deg, #ff9939, #ffaa5a)';
        } else {
            node.style.background = 'linear-gradient(145deg, #ffffff, #dddddd)';
        }
        node.textContent = fraudster.person.length > 10 ? fraudster.person.substring(0, 10) + '...' : fraudster.person;
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        graphContainer.appendChild(node);

        const label = document.createElement('div');
        label.className = 'connection-label';
        label.textContent = fraudster.riskLevel;
        label.style.left = `${x + 30}px`;
        label.style.top = `${y + 70}px`;
        label.style.background = 'rgba(30, 30, 30, 0.9)';
        graphContainer.appendChild(label);
    });
}

function renderFraudstersList(fraudsters, listContainer) {
    listContainer.innerHTML = '';

    fraudsters.forEach((fraudster, index) => {
        const item = document.createElement('div');
        item.className = 'connection-item';

        let riskClass = '';
        if (fraudster.riskLevel === 'high') {
            riskClass = 'style="background: linear-gradient(145deg, #ff3939, #ff5a5a);"';
        } else if (fraudster.riskLevel === 'medium') {
            riskClass = 'style="background: linear-gradient(145deg, #ff9939, #ffaa5a);"';
        }

        item.innerHTML = `
                    <div class="connection-item-header">
                        <strong>${fraudster.person}</strong>
                        <span class="connection-type" ${riskClass}>${fraudster.riskLevel} risk</span>
                    </div>
                    <p><strong>Evidence:</strong> ${fraudster.evidence}</p>
                    <div style="margin-top: 10px;">
                        <strong>Reasons:</strong>
                        <ul style="margin-top: 5px; padding-left: 20px;">
                            ${fraudster.reasons.map(reason => `<li>${reason}</li>`).join('')}
                        </ul>
                    </div>
                `;

        listContainer.appendChild(item);
    });
}

function _saveFindingsReport(analysisType, findings, summary) {
    if (!findings || !findings.length) {
        console.log('[saveFindingsReport] no findings to save for', analysisType);
        return;
    }
    if (window.pazatorReportManager && window.pazatorReportManager.saveTideReport) {
        console.log('[saveFindingsReport] delegating to ReportManager for', analysisType, findings.length, 'findings');
        window.pazatorReportManager.saveTideReport(analysisType, findings, summary);
        return;
    }
    console.log('[saveFindingsReport] using localStorage fallback for', analysisType, findings.length, 'findings');
    try {
        var key = 'pazator_analysis_reports';
        var data = JSON.parse(localStorage.getItem(key)) || { reports: [] };
        var labels = { fraud: 'Fraud', terrorist: 'Terrorist', connection: 'Connection' };
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
        console.log('[saveFindingsReport] saved via localStorage fallback, total reports:', data.reports.length);
    } catch (e) { console.warn('[saveFindingsReport] failed:', e); }
}

function loadPreviousFindings() {
    const threatsList = document.getElementById('threatsList');
    const fraudList = document.getElementById('fraudList');

    threatsList.innerHTML = '';
    fraudList.innerHTML = '';

    if (window.pazatorStore) {
        Promise.all([
            pazatorStore.kvGet('previousThreats'),
            pazatorStore.kvGet('previousFraud')
        ]).then(function (results) {
            var storedThreats = results[0] || [];
            var storedFraud = results[1] || [];
            renderFindingsData(storedThreats, storedFraud, threatsList, fraudList);
        }).catch(function () {
            var storedThreats = JSON.parse(localStorage.getItem('previousThreats') || '[]');
            var storedFraud = JSON.parse(localStorage.getItem('previousFraud') || '[]');
            renderFindingsData(storedThreats, storedFraud, threatsList, fraudList);
        });
    } else {
        var storedThreats = JSON.parse(localStorage.getItem('previousThreats') || '[]');
        var storedFraud = JSON.parse(localStorage.getItem('previousFraud') || '[]');
        renderFindingsData(storedThreats, storedFraud, threatsList, fraudList);
    }
}

function renderFindingsData(storedThreats, storedFraud, threatsList, fraudList) {

    if (storedThreats.length === 0 && storedFraud.length === 0) {
        const sampleThreats = [];
        const sampleFraud = [];

        pazatorData.humans.slice(0, Math.min(3, pazatorData.humans.length)).forEach((human, index) => {
            if (index % 2 === 0) {
                sampleThreats.push({
                    name: human.name,
                    riskLevel: index === 0 ? 'high' : 'medium',
                    evidence: `Suspicious patterns detected for ${human.name}`,
                    reasons: [
                        human.workplace ? `Works at ${human.workplace}` : 'Unknown workplace',
                        human.tags && human.tags.length > 0 ? `Has tags: ${human.tags.join(', ')}` : 'No tags'
                    ]
                });
            } else {
                sampleFraud.push({
                    name: human.name,
                    riskLevel: index === 1 ? 'high' : 'medium',
                    evidence: `Potential fraudulent activity detected for ${human.name}`,
                    reasons: [
                        human.credit !== undefined ? `Credit score: ${human.credit}` : 'No credit score',
                        human.socialClass ? `Social class: ${human.socialClass}` : 'Unknown social class'
                    ]
                });
            }
        });

        localStorage.setItem('previousThreats', JSON.stringify(sampleThreats));
        localStorage.setItem('previousFraud', JSON.stringify(sampleFraud));

        renderFindings(sampleThreats, threatsList);
        renderFindings(sampleFraud, fraudList);
    } else {
        renderFindings(storedThreats, threatsList);
        renderFindings(storedFraud, fraudList);
    }
}

function renderFindings(findings, container) {
    findings.forEach(item => {
        const findingItem = document.createElement('div');
        findingItem.className = 'finding-item';
        findingItem.innerHTML = `
                    <div class="finding-header">
                        <span class="finding-name">${item.name}</span>
                        <span class="finding-risk finding-${item.riskLevel}">${item.riskLevel} ${container.id === 'threatsList' ? 'threat' : 'risk'}</span>
                    </div>
                    <div class="finding-evidence">Evidence: ${item.evidence}</div>
                    <div class="finding-reasons">
                        <strong>Reasons:</strong>
                        <ul>
                            ${item.reasons.map(reason => `<li>${reason}</li>`).join('')}
                        </ul>
                    </div>
                `;
        container.appendChild(findingItem);
    });
}

function _storeItem(key, value) {
    if (window.pazatorStore) {
        pazatorStore.kvSet(key, value).catch(function () {
            try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* localStorage quota exceeded */ }
        });
    } else {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* localStorage quota exceeded */ }
    }
}

function _loadItem(key, fallback) {
    if (window.pazatorStore) {
        return pazatorStore.kvGet(key);
    }
    try {
        return Promise.resolve(JSON.parse(localStorage.getItem(key) || 'null') || fallback);
    } catch (e) {
        return Promise.resolve(fallback);
    }
}

function storeFinding(type, finding) {
    const storageKey = type === 'threat' ? 'previousThreats' : 'previousFraud';
    _loadItem(storageKey, []).then(function (currentFindings) {
        currentFindings.push(finding);
        if (currentFindings.length > 10) currentFindings.shift();
        _storeItem(storageKey, currentFindings);
    });
}

function storeFraudLogs(logs) {
    const newLogs = logs.map(log => ({
        ...log,
        id: `fraud_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        status: 'new'
    }));
    _loadItem('fraudLogs', []).then(function (currentLogs) {
        currentLogs.push(...newLogs);
        if (currentLogs.length > 50) currentLogs.splice(0, currentLogs.length - 50);
        _storeItem('fraudLogs', currentLogs);
        if (document.getElementById('contextFraudLogs')) {
            loadContextFraudLogs();
        }
    });
}

function storeTerroristLogs(logs) {
    const newLogs = logs.map(log => ({
        ...log,
        id: `terrorist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        status: 'new'
    }));
    _loadItem('terroristLogs', []).then(function (currentLogs) {
        currentLogs.push(...newLogs);
        if (currentLogs.length > 50) currentLogs.splice(0, currentLogs.length - 50);
        _storeItem('terroristLogs', currentLogs);
    });
}

async function getSignedInUsername() {
    try {
        if (typeof puter === 'undefined' || !puter.auth) return '';

        // Prefer explicit getter if available.
        if (typeof puter.auth.getUser === 'function') {
            const user = await puter.auth.getUser();
            const username = user?.username || user?.name || user?.display_name || user?.displayName;
            if (username) return String(username);
        }

        // Common fallback shapes.
        const user = puter.auth.user || puter.user || puter?.auth?.currentUser;
        const username = user?.username || user?.name || user?.display_name || user?.displayName;
        return username ? String(username) : '';
    } catch (e) {
        return '';
    }
}

async function updateAccountSection() {
    const signInBtn = document.getElementById('signInBtn');
    const greeting = document.getElementById('accountGreeting');

    if (!greeting) return;

    const signedIn = Boolean(
        typeof puter !== 'undefined' &&
        puter.auth &&
        typeof puter.auth.isSignedIn === 'function' &&
        puter.auth.isSignedIn()
    );

    if (!signedIn) {
        greeting.style.display = 'none';
        greeting.textContent = '';
        if (signInBtn) signInBtn.style.display = 'block';
        return;
    }

    if (signInBtn) signInBtn.style.display = 'none';
    greeting.style.display = 'block';
    greeting.textContent = 'Welcome back';

    const username = await getSignedInUsername();
    if (username) {
        greeting.textContent = `Good to see you back ${username}.`;
    }
}
