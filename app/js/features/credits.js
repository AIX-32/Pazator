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

    showCreditEvalModal();

    if (refreshCreditsBtn) {
        refreshCreditsBtn.disabled = true;
        refreshCreditsBtn.innerHTML = '<div class="loader" style="--size:16px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Evaluating...';
    }

    const humansToEvaluate = pazatorData.humans.map(h => ({
        id: h.id,
        name: h.name,
        gender: h.gender || '',
        birthDate: h.birthDate || '',
        workplace: h.workplace || '',
        socialClass: h.socialClass || '',
        friends: h.friends || [],
        family: h.family || [],
        extraNotes: h.extraNotes || '',
        tags: h.tags || []
    }));

    var cacheKey = 'credits_' + humansToEvaluate.length + '_' + humansToEvaluate.reduce(function (acc, h) {
        return acc + (h.name || '') + (h.credit || 185);
    }, '').substring(0, 200);
    var cachedResult = null;
    if (window.AIQueue) {
        cachedResult = AIQueue.getCached(cacheKey);
    }

    const contextPrompt = `You are a credit risk analyst. Evaluate each person's credit score based on ALL available data.
    
Consider these factors:
- Name (some names associated with certain backgrounds/regions)
- Gender
- Birth date (calculate age)
- Workplace (professional environment indicates stability)
- Social class (already assigned class)
- Friends count (social stability)
- Family count (family support network)
- Tags (professional tags = positive, negative tags = risk)
- Notes (explicit mentions of trust, reliability, warnings, suspicions)

Credit Score Range: 0-370
- 0-124: HIGH RISK (financial instability, high risk of default)
- 125-249: MEDIUM RISK (moderate risk)
- 250-370: LOW RISK (stable, reliable)

Return a JSON array with credit scores for ALL people. Format:
[{"id": "person_id", "creditScore": 250}, {"id": "person_id2", "creditScore": 180}]

IMPORTANT: Return scores for ALL ${humansToEvaluate.length} people. Be realistic - use the full range.`;

    try {
        var aiResponse;
        if (cachedResult) {
            aiResponse = { content: JSON.stringify(cachedResult) };
        } else if (window.AIQueue) {
            aiResponse = await AIQueue.enqueue(function () {
                return geminiChat([
                    { role: "system", content: contextPrompt },
                    { role: "user", content: "Here is the data:\n" + JSON.stringify(humansToEvaluate, null, 2) + "\n\nReturn credit scores for all people." }
                ]);
            }, { cacheKey: cacheKey });
        } else {
            aiResponse = await geminiChat([
                { role: "system", content: contextPrompt },
                { role: "user", content: "Here is the data:\n" + JSON.stringify(humansToEvaluate, null, 2) + "\n\nReturn credit scores for all people." }
            ]);
        }

        const responseText = aiResponse.content || String(aiResponse);

        let scores = [];
        try {
            const parsed = JSON.parse(responseText);
            if (Array.isArray(parsed)) {
                scores = parsed;
            }
        } catch {
            const match = responseText.match(/\[[\s\S]*\]/);
            if (match) {
                try {
                    scores = JSON.parse(match[0]);
                } catch { }
            }
        }

        const scoreMap = new Map();
        scores.forEach(s => {
            if (s && s.id && typeof s.creditScore === 'number') {
                scoreMap.set(s.id, Math.max(0, Math.min(370, Math.round(s.creditScore))));
            }
        });

        let evaluated = 0;
        const total = pazatorData.humans.length;

        for (const human of pazatorData.humans) {
            const score = scoreMap.get(human.id);
            if (score !== undefined) {
                human.credit = score;
            } else {
                human.credit = Math.floor(Math.random() * 150) + 110;
            }

            human.socialClass = inferSocialClass(human.credit);

            evaluated++;
            updateCreditEvalProgress(evaluated, total, human.name);

            await new Promise(r => setTimeout(r, 50));
        }

        const highCount = pazatorData.humans.filter(h => h.credit < 125).length;
        const mediumCount = pazatorData.humans.filter(h => h.credit >= 125 && h.credit < 250).length;
        const lowCount = pazatorData.humans.filter(h => h.credit >= 250).length;
        const avgScore = Math.round(pazatorData.humans.reduce((sum, h) => sum + h.credit, 0) / pazatorData.humans.length);
        const minScore = Math.min(...pazatorData.humans.map(h => h.credit));
        const maxScore = Math.max(...pazatorData.humans.map(h => h.credit));

        showCreditEvalComplete({
            high: highCount,
            medium: mediumCount,
            low: lowCount,
            total: total,
            average: avgScore,
            min: minScore,
            max: maxScore
        });

        saveData();
        renderObjectCanvas();
        updateCreditStats();

    } catch (error) {
        console.error('AI credit evaluation failed:', error);
        showAlert('AI evaluation failed: ' + error.message + '. Using fallback calculation.', 'Error', 'error');

        pazatorData.humans.forEach(human => {
            human.credit = calculateCreditScore(human);
            human.credit = Math.round(human.credit * 3.7);
            human.socialClass = inferSocialClass(human.credit);
        });

        saveData();
        renderObjectCanvas();
        updateCreditStats();
        hideCreditEvalModal();
    }

    if (refreshCreditsBtn) {
        refreshCreditsBtn.disabled = false;
        refreshCreditsBtn.innerHTML = '<i class="fas fa-sync"></i> Refresh Credits';
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

    document.querySelector('#hiddenConnectionsModal h2').textContent = 'Potential Terrorist Analysis';

    findTerroristsBtn.disabled = true;
    findTerroristsBtn.textContent = 'Analyzing...';

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

        const context = "You are an AI security analyst analyzing people to identify potential terrorist threats. " +
            "Your task is to identify as many individuals as possible who might pose security risks based on their data. " +
            "Be comprehensive and identify multiple potential cases, even borderline ones.\n\n" +
            "Here's the data about the people:\n" +
            JSON.stringify(humansData, null, 2) + "\n\n" +
            "Based on the information provided, identify potential security threats. " +
            "Look for suspicious patterns such as:\n" +
            "- People with extremist views or radical ideologies mentioned in notes\n" +
            "- People with connections to known extremist groups or individuals\n" +
            "- People with travel patterns to conflict zones or high-risk areas\n" +
            "- People with unusual financial transactions or funding sources\n" +
            "- People with military or weapons training background\n" +
            "- People with communications suggesting planning of harmful activities\n" +
            "- People with suspicious meeting patterns or covert gatherings\n" +
            "- People with dual citizenship or unclear nationality status\n" +
            "- People with tags indicating extremist or radical affiliations\n" +
            "- People with tags suggesting military or weapons expertise\n" +
            "- People with travel-related tags to conflict zones\n" +
            "- People with financial tags but unexplained income sources\n" +
            "- People with communication-related tags suggesting coordination\n" +
            "- People with multiple 'suspicious' tags\n\n" +
            "Return your findings as a JSON array of potential threats in this format:\n" +
            "[\n" +
            "    {\n" +
            "        \"person\": \"Person Name\",\n" +
            "        \"threatLevel\": \"high\", // Options: high, medium, low\n" +
            "        \"reasons\": [\n" +
            "            \"Has extremist views mentioned in notes\",\n" +
            "            \"Recent travel to conflict zones\"\n" +
            "        ],\n" +
            "        \"evidence\": \"Mentions radical ideologies and weapons training in extra notes\"\n" +
            "    },\n" +
            "    {\n" +
            "        \"person\": \"Another Person\",\n" +
            "        \"threatLevel\": \"medium\",\n" +
            "        \"reasons\": [\n" +
            "            \"Connections to known extremist individuals\",\n" +
            "            \"Unusual financial transactions\"\n" +
            "        ],\n" +
            "        \"evidence\": \"Received large cash payments from unknown sources\"\n" +
            "    }\n" +
            "]\n\n" +
            "Be comprehensive and identify as many potential cases as possible, including borderline cases. " +
            "Even if you're not completely certain, include people who have some suspicious indicators. " +
            "Aim to identify at least 10-20% of the people if possible. " +
            "If no suspicious individuals are found, return an empty array.";

        const aiResponse = await geminiChat([
            { role: "system", content: context },
            { role: "user", content: "Analyze the data and find potential terrorist threats. Be comprehensive and identify as many potential cases as possible." }
        ]);

        const responseText = aiResponse.content ? aiResponse.content : aiResponse;

        try {

            const terrorists = extractJSONFromResponse(responseText);

            if (terrorists && Array.isArray(terrorists) && terrorists.length > 0) {

                connectionsLoading.style.display = 'none';
                connectionsResults.style.display = 'block';

                renderTerroristsGraph(terrorists, connectionsGraph);

                renderTerroristsList(terrorists, connectionsList);

                terrorists.forEach(terrorist => {
                    storeFinding('threat', {
                        name: terrorist.person,
                        riskLevel: terrorist.threatLevel,
                        evidence: terrorist.evidence,
                        reasons: terrorist.reasons
                    });
                });

                const terroristLogs = terrorists.map((terrorist, index) => ({
                    type: 'Terrorist Threat Alert',
                    severity: terrorist.threatLevel || 'medium',
                    person: terrorist.person,
                    evidence: terrorist.evidence,
                    reasons: terrorist.reasons || [],
                    detectionMethod: 'AI Security Analysis',
                    confidence: terrorist.threatLevel === 'high' ? 'High' : terrorist.threatLevel === 'medium' ? 'Medium' : 'Low'
                }));

                storeTerroristLogs(terroristLogs);
            } else {

                connectionsLoading.style.display = 'none';
                noConnections.style.display = 'block';
                noConnections.innerHTML = `
                            <h3>No Potential Terrorist Threats Found</h3>
                            <p>I couldn't identify any individuals with strong indicators of terrorist activities.</p>
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
        console.error('Error finding potential terrorists:', error);
        connectionsLoading.style.display = 'none';
        noConnections.style.display = 'block';
        noConnections.innerHTML = `
                    <h3>Error Analyzing Data</h3>
                    <p>Sorry, I encountered an error while analyzing for potential terrorist threats. Please try again.</p>
                `;
    } finally {
        findTerroristsBtn.disabled = false;
        findTerroristsBtn.textContent = 'Find Potential Terrorists';

        document.querySelector('#hiddenConnectionsModal h2').textContent = 'Hidden Connections Analysis';
    }
}
