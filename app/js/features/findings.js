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
    const hiddenConnectionsModal = document.getElementById('hiddenConnectionsModal');
    const connectionsLoading = document.getElementById('connectionsLoading');
    const connectionsResults = document.getElementById('connectionsResults');
    const noConnections = document.getElementById('noConnections');
    const connectionsGraph = document.getElementById('connectionsGraph');
    const connectionsList = document.getElementById('connectionsList');

    connectionsLoading.style.display = 'block';
    connectionsResults.style.display = 'none';
    noConnections.style.display = 'none';
    hiddenConnectionsModal.style.display = 'flex';
    hiddenConnectionsModal.style.zIndex = '1000';

    document.querySelector('#hiddenConnectionsModal h2').textContent = 'Potential Fraud/Drug Sellers Analysis';

    findFraudBtn.disabled = true;

    const fraudLogs = [];
    findFraudBtn.textContent = 'Analyzing...';

    try {

        const humansData = pazatorData.humans.map(human => ({
            id: human.id,
            name: human.name,
            gender: human.gender,
            birthDate: human.birthDate,
            workplace: human.workplace,
            friends: human.friends || [],
            family: human.family || [],
            extraNotes: human.extraNotes || '',
            tags: human.tags || []
        }));

        const adminContext = getAdminContext();
        const context = "You are an AI investigator analyzing people to identify potential fraudsters or drug sellers. " +
            "Your task is to identify as many individuals as possible who might be involved in fraudulent activities or drug selling based on their data. " +
            "Be comprehensive and identify multiple potential cases, even borderline ones.\n\n" +
            (adminContext ? `ADMIN CONTEXT TO CONSIDER:\n${adminContext}\n\n` : '') +
            "Here's the data about the people:\n" +
            JSON.stringify(humansData, null, 2) + "\n\n" +
            "Based on the information provided, identify potential fraudsters or drug sellers. " +
            "Look for suspicious patterns such as:\n" +
            "- People with suspicious tags or notes (e.g., \"cash only\", \"no questions asked\", \"discount meds\", etc.)\n" +
            "- People with unusual financial patterns or unexplained wealth\n" +
            "- People with connections to known suspicious individuals\n" +
            "- People with frequent unexplained meetings or transactions\n" +
            "- People with aliases or multiple identities\n" +
            "- People with criminal records or suspicious backgrounds\n" +
            "- People with tags indicating illegal activities\n" +
            "- People with overlapping tags with known suspicious individuals\n" +
            "- People with financial-related tags but no clear workplace\n" +
            "- People with multiple \"high risk\" tags\n" +
            "- People with vague or inconsistent information\n" +
            "- People with connections to many others but no clear social ties\n" +
            "- People with tags suggesting illegal goods or services\n\n" +
            "Return your findings as a JSON array of potential fraudsters/drug sellers in this format:\n" +
            "[\n" +
            "    {\n" +
            "        \"person\": \"Person Name\",\n" +
            "        \"riskLevel\": \"high\", // Options: high, medium, low\n" +
            "        \"reasons\": [\n" +
            "            \"Has suspicious tags like 'cash only'\",\n" +
            "            \"Multiple unexplained connections to other suspicious individuals\"\n" +
            "        ],\n" +
            "        \"evidence\": \"Mentions selling medications in extra notes\"\n" +
            "    },\n" +
            "    {\n" +
            "        \"person\": \"Another Person\",\n" +
            "        \"riskLevel\": \"medium\",\n" +
            "        \"reasons\": [\n" +
            "            \"Frequent meetings with known suspicious individuals\",\n" +
            "            \"Unexplained wealth\"\n" +
            "        ],\n" +
            "        \"evidence\": \"Works in cash-based business with no official records\"\n" +
            "    }\n" +
            "]\n\n" +
            "Be comprehensive and identify as many potential cases as possible, including borderline cases. " +
            "Even if you're not completely certain, include people who have some suspicious indicators. " +
            "Aim to identify at least 10-20% of the people if possible. " +
            "If no suspicious individuals are found, return an empty array.";

        const aiResponse = await geminiChat([
            { role: "system", content: context },
            { role: "user", content: "Analyze the data and find potential fraudsters or drug sellers. Be comprehensive and identify as many potential cases as possible." }
        ]);

        const responseText = aiResponse.content ? aiResponse.content : aiResponse;

        try {

            const fraudsters = extractJSONFromResponse(responseText);

            if (fraudsters && Array.isArray(fraudsters) && fraudsters.length > 0) {

                connectionsLoading.style.display = 'none';
                connectionsResults.style.display = 'block';

                renderFraudstersGraph(fraudsters, connectionsGraph);

                renderFraudstersList(fraudsters, connectionsList);

                fraudsters.forEach(fraudster => {
                    storeFinding('fraud', {
                        name: fraudster.person,
                        riskLevel: fraudster.riskLevel,
                        evidence: fraudster.evidence,
                        reasons: fraudster.reasons
                    });
                });

                const fraudLogs = fraudsters.map((fraudster, index) => ({
                    type: 'Fraud Detection Alert',
                    severity: fraudster.riskLevel || 'medium',
                    person: fraudster.person,
                    evidence: fraudster.evidence,
                    reasons: fraudster.reasons || [],
                    detectionMethod: 'AI Pattern Analysis',
                    confidence: fraudster.riskLevel === 'high' ? 'High' : fraudster.riskLevel === 'medium' ? 'Medium' : 'Low'
                }));

                storeFraudLogs(fraudLogs);
            } else {

                connectionsLoading.style.display = 'none';
                noConnections.style.display = 'block';
                noConnections.innerHTML = `
                            <h3>No Potential Fraud/Drug Sellers Found</h3>
                            <p>I couldn't identify any individuals with strong indicators of fraudulent activities or drug selling.</p>
                        `;
            }
        } catch (parseError) {
            console.error('Error parsing AI response:', parseError);
            connectionsLoading.style.display = 'none';
            noConnections.style.display = 'block';
            noConnections.innerHTML = `
                        <h3>Error Processing Results</h3>
                        <p>I found some potential cases, but had trouble processing them.</p>
                        <div style="background: rgba(40, 40, 40, 0.7); padding: 15px; border-radius: 10px; margin-top: 15px; white-space: pre-wrap;">${responseText}</div>
                    `;
        }
    } catch (error) {
        console.error('Error finding potential fraud:', error);
        connectionsLoading.style.display = 'none';
        noConnections.style.display = 'block';
        noConnections.innerHTML = `
                    <h3>Error Analyzing Data</h3>
                    <p>Sorry, I encountered an error while analyzing for potential fraud. Please try again.</p>
                `;
    } finally {
        findFraudBtn.disabled = false;
        findFraudBtn.textContent = 'Find Potential Fraud';

        document.querySelector('#hiddenConnectionsModal h2').textContent = 'Hidden Connections Analysis';
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
            try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
        });
    } else {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
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
