// Case Files Functions
function initCasesTab() {
    if (!casesTabInitialized) {
        const newCaseBtn = document.getElementById('newCaseBtn');
        const statusFilter = document.getElementById('caseStatusFilter');
        const editBtn = document.getElementById('caseEditBtn');
        const closeBtn = document.getElementById('caseCloseBtn');
        const addEntityBtn = document.getElementById('addEntityToCaseBtn');
        const addNoteBtn = document.getElementById('caseAddNoteBtn');
        const noteInput = document.getElementById('caseNoteInput');
        const zorBtn = document.getElementById('caseZorBtn');
        const addEvidenceBtn = document.getElementById('addEvidenceToCaseBtn');

        if (newCaseBtn) newCaseBtn.addEventListener('click', showNewCaseModal);
        if (statusFilter) statusFilter.addEventListener('change', renderCasesList);
        if (editBtn) editBtn.addEventListener('click', showEditCaseModal);
        if (closeBtn) closeBtn.addEventListener('click', toggleCaseStatus);
        if (addEntityBtn) addEntityBtn.addEventListener('click', showEntityPickerModal);
        if (addEvidenceBtn) addEvidenceBtn.addEventListener('click', showAddEvidenceModal);
        if (addNoteBtn) addNoteBtn.addEventListener('click', addCaseNote);
        if (noteInput) noteInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addCaseNote();
        });
        if (zorBtn) zorBtn.addEventListener('click', handoffCaseToZor);

        casesTabInitialized = true;
    }

    loadCases();
    renderCasesList();
}

var _casesLoaded = false;

function loadCases() {
    if (_casesLoaded) return;
    _casesLoaded = true;
    if (window.pazatorStore) {
        pazatorStore.kvGet('pazatorCases').then(function (saved) {
            if (saved) cases = saved;
        }).catch(function () {
            try {
                const saved = localStorage.getItem('pazatorCases');
                if (saved) cases = JSON.parse(saved);
            } catch (e) { cases = []; }
        });
    } else {
        try {
            const saved = localStorage.getItem('pazatorCases');
            cases = saved ? JSON.parse(saved) : [];
        } catch {
            cases = [];
        }
    }
}

function saveCases() {
    if (window.pazatorStore) {
        pazatorStore.kvSet('pazatorCases', cases).catch(function () {
try { localStorage.setItem('pazatorCases', JSON.stringify(cases)); } catch (e) { /* localStorage quota exceeded */ }
        });
    } else {
        try { localStorage.setItem('pazatorCases', JSON.stringify(cases)); } catch (e) { /* localStorage quota exceeded */ }
    }
}

function exportCaseAsJSON() {
    const caseData = cases.find(c => c.id === selectedCaseId);
    if (!caseData) return;
    const blob = new Blob([JSON.stringify(caseData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `case_${caseData.title.replace(/[^a-z0-9]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showFloatingNotification('Case exported', 'success');
}

function renderCasesList() {
    const container = document.getElementById('casesList');
    const filter = document.getElementById('caseStatusFilter')?.value || 'all';

    const filteredCases = filter === 'all'
        ? cases
        : cases.filter(c => c.status === filter);

    if (filteredCases.length === 0) {
        container.innerHTML = `
            <div class="cases-empty">
                <i class="fas fa-folder-open"></i>
                <p>${filter === 'all' ? 'No cases yet' : 'No ' + filter.replace('-', ' ') + ' cases'}</p>
                <small>Create a case to track operations</small>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredCases.map(c => `
        <div class="case-card ${selectedCaseId === c.id ? 'active' : ''}" onclick="selectCase('${c.id}')">
            <div class="case-card-header">
                <span class="case-card-title">${escapeHtml(c.title)}</span>
                <span class="case-card-badge ${c.status}">${c.status.replace('-', ' ')}</span>
            </div>
            <div class="case-card-meta">
                ${c.entities.length} entity ${c.entities.length === 1 ? 'tagged' : 'tagged'} • ${c.timeline.length} activity${(c.evidence && c.evidence.length > 0) ? ' • ' + c.evidence.length + ' evidence' : ''}
            </div>
        </div>
    `).join('');
}

function selectCase(caseId) {
    selectedCaseId = caseId;
    renderCasesList();

    const welcome = document.getElementById('casesWelcome');
    const detail = document.getElementById('casesDetail');

    welcome.style.display = 'none';
    detail.style.display = 'flex';

    const caseData = cases.find(c => c.id === caseId);
    if (!caseData) return;

    document.getElementById('caseTitle').textContent = caseData.title;

    const statusBadge = document.getElementById('caseStatusBadge');
    statusBadge.textContent = caseData.status.replace('-', ' ');
    statusBadge.className = 'case-status-badge ' + caseData.status;

    const createdAt = document.getElementById('caseCreatedAt');
    createdAt.textContent = 'Created ' + new Date(caseData.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const statusText = document.getElementById('caseStatusText');
    statusText.textContent = caseData.status.replace('-', ' ');

    document.getElementById('caseEntityCount').textContent = caseData.entities.length;
    document.getElementById('caseActivityCount').textContent = caseData.timeline.length;
    document.getElementById('caseEvidenceCount').textContent = (caseData.evidence || []).length;

    document.getElementById('caseDescription').textContent = caseData.description || 'No description provided';

    renderCaseEntities(caseData);
    renderCaseEvidence(caseData);
    // Link humans in this case to the case's entity list
    if (caseData.entities && caseData.entities.length > 0) {
        caseData.entities.forEach(entityId => {
            const human = pazatorData.humans.find(h => h.id === entityId);
            if (human) {
                if (!human.cases) human.cases = [];
                if (!human.cases.includes(caseData.id)) {
                    human.cases.push(caseData.id);
                    _pendingChanges();
                }
            }
        });
    }
    renderCaseTimeline(caseData);
}

function renderCaseEntities(caseData) {
    const container = document.getElementById('caseEntitiesList');

    if (caseData.entities.length === 0) {
        container.innerHTML = '<div class="case-empty-entities"><i class="fas fa-users"></i><span>No entities tracked yet</span></div>';
        return;
    }

    container.innerHTML = caseData.entities.map(entityId => {
        const human = pazatorData.humans.find(h => h.id === entityId);
        const other = pazatorData.others.find(o => o.id === entityId);
        const entity = human || other;

        if (!entity) return '';

        const icon = human ? 'fa-user' : 'fa-building';
        const typeLabel = human ? 'human' : 'other';

        return `
            <div class="case-entity-card" onclick="viewDetailFromCase('${entityId}', '${typeLabel}')">
                <i class="fas ${icon}"></i>
                <span>${escapeHtml(entity.name)}</span>
                <i class="fas fa-external-link-alt remove-entity" onclick="event.stopPropagation(); removeEntityFromCase('${caseId}', '${entityId}')"></i>
            </div>
        `;
    }).join('');
}

function timeAgo(ts) {
    var diff = Date.now() - ts;
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    return days + 'd ago';
}

function renderCaseTimeline(caseData) {
    const container = document.getElementById('caseTimeline');

    if (caseData.timeline.length === 0) {
        container.innerHTML = '<div class="case-empty-timeline"><i class="fas fa-stream"></i><span>No activity logged yet</span></div>';
        return;
    }

    container.innerHTML = [...caseData.timeline].reverse().map(item => `
        <div class="case-timeline-item ${item.type}">
            <span class="case-timeline-time" title="${new Date(item.timestamp).toLocaleString()}">${timeAgo(item.timestamp)}</span>
            <span class="case-timeline-content">${item.content}</span>
        </div>
    `).join('');
}

async function handoffCaseToZor() {
    const caseData = cases.find(c => c.id === selectedCaseId);
    if (!caseData) return;

    const zorBtn = document.getElementById('caseZorBtn');
    zorBtn.disabled = true;
    zorBtn.innerHTML = '<div class="loader" style="--size:16px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Analyzing...';

    const startTime = Date.now();
    caseData.timeline.push({
        type: 'note',
        content: '<strong>Zor analyzing case...</strong>',
        timestamp: startTime
    });
    saveCases();
    selectCase(selectedCaseId);

    const caseEntities = caseData.entities.map(id => {
        const human = pazatorData.humans.find(h => h.id === id);
        const other = pazatorData.others.find(o => o.id === id);
        return human || other;
    }).filter(Boolean);

    const analysisPrompt = `
You are analyzing case: "${caseData.title}"

Description: ${caseData.description || 'No description provided'}

Entities in this case:
${caseEntities.map(e => `- ${e.name} (${e.type || 'unknown'})${e.extraNotes ? ': ' + e.extraNotes : ''}${e.tags?.length ? ' [Tags: ' + e.tags.join(', ') + ']' : ''}`).join('\n')}

Previous activity:
${caseData.timeline.map(t => `- [${new Date(t.timestamp).toLocaleString()}] ${t.content.replace(/<[^>]*>/g, '')}`).join('\n')}

Based on all this information, provide a brief analysis (2-3 sentences) of:
1. What this case appears to be about
2. Any notable patterns or connections you see
3. Recommended next steps

Be concise and actionable.
`;

    try {
        const aiResponse = await geminiChat([
            { role: "system", content: "You are Zor, a concise intelligence analyst. Give brief, actionable insights." },
            { role: "user", content: analysisPrompt }
        ]);

        const analysis = aiResponse.content || 'Analysis complete - no insights generated.';

        caseData.timeline.push({
            type: 'note',
            content: `<strong>Zor Analysis</strong>: ${escapeHtml(analysis)}`,
            timestamp: Date.now()
        });

        zorBtn.disabled = false;
        zorBtn.innerHTML = '<i class="fas fa-robot"></i> Hand off to Zor';

        saveCases();
        selectCase(selectedCaseId);
        showFloatingNotification('Zor analysis complete', 'success');

    } catch (error) {
        caseData.timeline.push({
            type: 'note',
            content: `<strong>Zor Error</strong>: Analysis failed`,
            timestamp: Date.now()
        });

        zorBtn.disabled = false;
        zorBtn.innerHTML = '<i class="fas fa-robot"></i> Hand off to Zor';

        saveCases();
        selectCase(selectedCaseId);
        showFloatingNotification('Zor analysis failed', 'error');
    }
}

function showNewCaseModal() {
    const allEntities = [
        ...pazatorData.humans.map(h => ({ ...h, type: 'human' })),
        ...pazatorData.others.map(o => ({ ...o, type: 'other' }))
    ];

    const modal = document.createElement('div');
    modal.className = 'modal case-modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 520px;">
            <div class="modal-header">
                <h2>New Case</h2>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Case Title</label>
                    <input type="text" id="caseTitleInput" class="form-control" placeholder="Operation name...">
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="caseDescInput" class="form-control" rows="3" placeholder="What is this case about?"></textarea>
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select id="caseStatusInput" class="form-control">
                        <option value="open">Open</option>
                        <option value="in-progress">In Progress</option>
                        <option value="closed">Closed</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Link Entities <span style="color: #666; font-weight: normal; font-size: 0.8rem;">(optional)</span></label>
                    <div class="case-form-entity-picker">
                        ${allEntities.length > 0 ? allEntities.map(e => `
                            <label class="case-form-entity-item">
                                <input type="checkbox" class="case-entity-checkbox" value="${e.id}" data-type="${e.type}">
                                <i class="fas ${e.type === 'human' ? 'fa-user' : 'fa-building'}" style="color: ${e.type === 'human' ? '#818cf8' : '#34d399'};"></i>
                                <span>${escapeHtml(e.name)}</span>
                            </label>
                        `).join('') : '<p style="color: #666; font-size: 0.85rem;">No entities in database yet</p>'}
                    </div>
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="createNewCase()">Create Case</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.classList.add('active');
    document.getElementById('caseTitleInput').focus();
}

function createNewCase() {
    const title = document.getElementById('caseTitleInput').value.trim();
    const description = document.getElementById('caseDescInput').value.trim();
    const status = document.getElementById('caseStatusInput').value;

    if (!title) {
        showFloatingNotification('Case title is required', 'error');
        return;
    }

    const checkboxes = document.querySelectorAll('.case-entity-checkbox:checked');
    const entities = Array.from(checkboxes).map(cb => cb.value);

    const newCase = {
        id: 'case_' + Date.now(),
        title,
        description,
        status,
        entities,
        evidence: [],
        timeline: [{
            type: 'note',
            content: '<strong>Case created</strong>',
            timestamp: Date.now()
        }],
        createdAt: Date.now()
    };

    if (entities.length > 0) {
        newCase.timeline.push({
            type: 'entity-added',
            content: '<strong>Entities linked</strong>: ' + entities.length + ' entit' + (entities.length === 1 ? 'y' : 'ies') + ' added on creation',
            timestamp: Date.now() + 1
        });
    }

    cases.push(newCase);
    saveCases();

    document.querySelector('.case-modal')?.remove();

    renderCasesList();
    selectCase(newCase.id);
    showFloatingNotification('Case created successfully', 'success');
}

function showEditCaseModal() {
    const caseData = cases.find(c => c.id === selectedCaseId);
    if (!caseData) return;

    const modal = document.createElement('div');
    modal.className = 'modal case-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Edit Case</h2>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Case Title</label>
                    <input type="text" id="caseTitleInput" class="form-control" value="${escapeHtml(caseData.title)}">
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="caseDescInput" class="form-control" rows="3">${escapeHtml(caseData.description || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select id="caseStatusInput" class="form-control">
                        <option value="open" ${caseData.status === 'open' ? 'selected' : ''}>Open</option>
                        <option value="in-progress" ${caseData.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
                        <option value="closed" ${caseData.status === 'closed' ? 'selected' : ''}>Closed</option>
                    </select>
                </div>
            </div>
            <div class="form-actions">
                <button class="btn btn-danger" onclick="deleteCase()">Delete Case</button>
                <div style="flex: 1;"></div>
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="saveCaseEdits()">Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.classList.add('active');
}

function saveCaseEdits() {
    const caseData = cases.find(c => c.id === selectedCaseId);
    if (!caseData) return;

    const title = document.getElementById('caseTitleInput').value.trim();
    const description = document.getElementById('caseDescInput').value.trim();
    const status = document.getElementById('caseStatusInput').value;

    if (!title) {
        showFloatingNotification('Case title is required', 'error');
        return;
    }

    const oldStatus = caseData.status;

    caseData.title = title;
    caseData.description = description;
    caseData.status = status;

    if (oldStatus !== status) {
        caseData.timeline.push({
            type: 'status-changed',
            content: `<strong>Status changed</strong> from ${oldStatus.replace('-', ' ')} to ${status.replace('-', ' ')}`,
            timestamp: Date.now()
        });
    }

    saveCases();
    document.querySelector('.case-modal')?.remove();
    renderCasesList();
    selectCase(selectedCaseId);
    showFloatingNotification('Case updated', 'success');
}

function deleteCase() {
    if (!confirm('Delete this case? This cannot be undone.')) return;

    cases = cases.filter(c => c.id !== selectedCaseId);
    saveCases();

    document.querySelector('.case-modal')?.remove();

    selectedCaseId = null;
    document.getElementById('casesDetail').style.display = 'none';
    document.getElementById('casesWelcome').style.display = 'flex';

    renderCasesList();
    showFloatingNotification('Case deleted', 'info');
}

function toggleCaseStatus() {
    const caseData = cases.find(c => c.id === selectedCaseId);
    if (!caseData) return;

    if (caseData.status === 'closed') {
        caseData.status = 'open';
    } else {
        caseData.status = 'closed';
        caseData.timeline.push({
            type: 'status-changed',
            content: '<strong>Case closed</strong>',
            timestamp: Date.now()
        });
    }

    saveCases();
    renderCasesList();
    selectCase(selectedCaseId);
}

function showEntityPickerModal() {
    const caseData = cases.find(c => c.id === selectedCaseId);
    if (!caseData) return;

    const allEntities = [
        ...pazatorData.humans.map(h => ({ ...h, type: 'human' })),
        ...pazatorData.others.map(o => ({ ...o, type: 'other' }))
    ];

    const availableEntities = allEntities.filter(e => !caseData.entities.includes(e.id));

    if (availableEntities.length === 0 && caseData.entities.length === 0) {
        showFloatingNotification('No entities to add', 'info');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal case-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Add Entities</h2>
            </div>
            <div class="modal-body">
                ${caseData.entities.length > 0 ? `
                    <div class="case-bulk-actions">
                        <button class="btn btn-secondary btn-sm" onclick="addAllEntitiesToCase()">
                            <i class="fas fa-plus"></i> Add All (${availableEntities.length})
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="addRelatedEntitiesToCase()">
                            <i class="fas fa-link"></i> Add Related
                        </button>
                    </div>
                ` : ''}
                <h4 style="margin: 16px 0 8px; color: #888; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px;">Available Entities</h4>
                <div class="entity-picker-list">
                    ${availableEntities.length > 0 ? availableEntities.map(e => `
                        <div class="entity-picker-item ${e.type}" onclick="addEntityToCase('${e.id}', '${e.type}')">
                            <i class="fas ${e.type === 'human' ? 'fa-user' : 'fa-building'}"></i>
                            <span>${escapeHtml(e.name)}</span>
                            <span style="margin-left: auto; color: #666; font-size: 0.8rem;">
                                ${getRelatedCount(e)}
                            </span>
                        </div>
                    `).join('') : '<p style="color: #666; text-align: center; padding: 20px;">All entities are already in this case</p>'}
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.classList.add('active');
}

function getRelatedCount(entity) {
    let count = 0;
    if (entity.friends) count += entity.friends.length;
    if (entity.family) count += entity.family.length;
    if (entity.workplace) {
        const workplaceEntity = pazatorData.others.find(o => o.name === entity.workplace);
        if (workplaceEntity && !caseData?.entities?.includes(workplaceEntity.id)) count++;
    }
    return count > 0 ? `${count} related` : '';
}

function addAllEntitiesToCase() {
    const caseData = cases.find(c => c.id === selectedCaseId);
    if (!caseData) return;

    const allEntities = [
        ...pazatorData.humans.map(h => ({ ...h, type: 'human' })),
        ...pazatorData.others.map(o => ({ ...o, type: 'other' }))
    ];

    const availableEntities = allEntities.filter(e => !caseData.entities.includes(e.id));
    let added = 0;

    availableEntities.forEach(e => {
        if (!caseData.entities.includes(e.id)) {
            caseData.entities.push(e.id);
            caseData.timeline.push({
                type: 'entity-added',
                content: `<strong>Entity added</strong>: ${e.name}`,
                timestamp: Date.now()
            });
            added++;
        }
    });

    saveCases();
    document.querySelector('.case-modal')?.remove();
    selectCase(selectedCaseId);
    showFloatingNotification(`Added ${added} entities to case`, 'success');
}

function addRelatedEntitiesToCase() {
    const caseData = cases.find(c => c.id === selectedCaseId);
    if (!caseData) return;

    const relatedIds = new Set();

    caseData.entities.forEach(entityId => {
        const entity = pazatorData.humans.find(h => h.id === entityId)
            || pazatorData.others.find(o => o.id === entityId);

        if (entity) {
            if (entity.friends) {
                entity.friends.forEach(friendId => relatedIds.add(friendId));
            }
            if (entity.family) {
                entity.family.forEach(familyId => relatedIds.add(familyId));
            }
            if (entity.workplace) {
                const workplace = pazatorData.others.find(o => o.name === entity.workplace);
                if (workplace) relatedIds.add(workplace.id);
            }
        }
    });

    let added = 0;
    relatedIds.forEach(id => {
        if (!caseData.entities.includes(id)) {
            const entity = pazatorData.humans.find(h => h.id === id) || pazatorData.others.find(o => o.id === id);
            if (entity) {
                caseData.entities.push(id);
                caseData.timeline.push({
                    type: 'entity-added',
                    content: `<strong>Related entity added</strong>: ${entity.name}`,
                    timestamp: Date.now()
                });
                added++;
            }
        }
    });

    saveCases();
    document.querySelector('.case-modal')?.remove();
    selectCase(selectedCaseId);

    if (added > 0) {
        showFloatingNotification(`Added ${added} related entities`, 'success');
    } else {
        showFloatingNotification('No new related entities found', 'info');
    }
}

function addEntityToCase(entityId, type) {
    const caseData = cases.find(c => c.id === selectedCaseId);
    if (!caseData || caseData.entities.includes(entityId)) return;

    const entity = type === 'human'
        ? pazatorData.humans.find(h => h.id === entityId)
        : pazatorData.others.find(o => o.id === entityId);

    caseData.entities.push(entityId);
    caseData.timeline.push({
        type: 'entity-added',
        content: `<strong>Entity added</strong>: ${entity?.name || 'Unknown'}`,
        timestamp: Date.now()
    });

    saveCases();
    document.querySelector('.case-modal')?.remove();
    selectCase(selectedCaseId);
    showFloatingNotification('Entity added to case', 'success');
}

function removeEntityFromCase(caseId, entityId) {
    const caseData = cases.find(c => c.id === caseId);
    if (!caseData) return;

    caseData.entities = caseData.entities.filter(e => e !== entityId);
    saveCases();
    selectCase(caseId);
}

function addCaseNote() {
    const caseData = cases.find(c => c.id === selectedCaseId);
    if (!caseData) return;

    const input = document.getElementById('caseNoteInput');
    const note = input.value.trim();

    if (!note) return;

    caseData.timeline.push({
        type: 'note',
        content: `<strong>Note</strong>: ${escapeHtml(note)}`,
        timestamp: Date.now()
    });

    input.value = '';
    saveCases();
    selectCase(selectedCaseId);
}

function viewDetailFromCase(entityId, type) {
    const human = pazatorData.humans.find(h => h.id === entityId);
    const other = pazatorData.others.find(o => o.id === entityId);
    const entity = human || other;

    if (entity) {
        showDetailView(entity, type);
    }
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Evidence System
var analysesStore = [];

function loadAnalyses() {
    try {
        var saved = localStorage.getItem('pazatorAnalyses');
        analysesStore = saved ? JSON.parse(saved) : [];
    } catch (e) {
        analysesStore = [];
    }
}

function saveAnalyses() {
    localStorage.setItem('pazatorAnalyses', JSON.stringify(analysesStore));
}

function storeAnalysisResult(type, title, findings) {
    var entry = {
        id: 'analysis_' + Date.now(),
        type: type,
        title: title,
        findings: findings,
        createdAt: Date.now()
    };
    analysesStore.push(entry);
    saveAnalyses();
    return entry;
}

function renderCaseEvidence(caseData) {
    var container = document.getElementById('caseEvidenceList');
    if (!container) return;

    if (!caseData.evidence || caseData.evidence.length === 0) {
        container.innerHTML = '<div class="case-empty-evidence"><i class="fas fa-gavel"></i><span>No evidence attached</span></div>';
        return;
    }

    container.innerHTML = caseData.evidence.map(function (ev) {
        var typeClass = 'evidence-intelligence';
        var icon = 'fa-brain';
        if (ev.type === 'threat') { typeClass = 'evidence-threat'; icon = 'fa-exclamation-triangle'; }
        else if (ev.type === 'fraud') { typeClass = 'evidence-fraud'; icon = 'fa-shield-alt'; }
        else if (ev.type === 'chat') { typeClass = 'evidence-chat'; icon = 'fa-comments'; }

        return '<div class="case-evidence-item">' +
            '<div class="evidence-icon ' + typeClass + '"><i class="fas ' + icon + '"></i></div>' +
            '<div class="evidence-info">' +
            '<div class="evidence-title">' + escapeHtml(ev.title) + '</div>' +
            '<div class="evidence-meta">' + (ev.findingCount || 0) + ' finding' + (ev.findingCount === 1 ? '' : 's') + ' &middot; ' + new Date(ev.addedAt).toLocaleDateString() + '</div>' +
            '</div>' +
            '<i class="fas fa-trash remove-evidence" onclick="removeEvidenceFromCase(\'' + caseData.id + '\', \'' + ev.id + '\')" title="Remove evidence"></i>' +
            '</div>';
    }).join('');
}

function showAddEvidenceModal() {
    var caseData = cases.find(function (c) { return c.id === selectedCaseId; });
    if (!caseData) return;

    loadAnalyses();

    if (analysesStore.length === 0) {
        showFloatingNotification('No analysis results available. Run an analysis first.', 'info');
        return;
    }

    var alreadyAdded = (caseData.evidence || []).map(function (e) { return e.id; });

    var modal = document.createElement('div');
    modal.className = 'modal case-modal';
    modal.innerHTML = '<div class="modal-content" style="max-width: 500px;">' +
        '<div class="modal-header"><h2>Add Evidence</h2></div>' +
        '<div class="modal-body">' +
        '<p style="color: #888; font-size: 0.85rem; margin-bottom: 12px;">Select from saved analysis results to attach as evidence to this case.</p>' +
        '<div class="evidence-picker-list">' +
        analysesStore.filter(function (a) { return alreadyAdded.indexOf(a.id) < 0; }).map(function (a) {
            var typeClass = 'evidence-intelligence';
            var icon = 'fa-brain';
            if (a.type === 'threat') { typeClass = 'evidence-threat'; icon = 'fa-exclamation-triangle'; }
            else if (a.type === 'fraud') { typeClass = 'evidence-fraud'; icon = 'fa-shield-alt'; }

            return '<div class="evidence-picker-item" onclick="addEvidenceToCase(\'' + a.id + '\')">' +
                '<div class="evidence-icon ' + typeClass + '" style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas ' + icon + '"></i></div>' +
                '<div style="flex:1;min-width:0;">' +
                '<div style="color:#e0e0e0;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(a.title) + '</div>' +
                '<div style="color:#666;font-size:0.8rem;">' + a.findings.length + ' finding' + (a.findings.length === 1 ? '' : 's') + ' &middot; ' + a.type + ' &middot; ' + new Date(a.createdAt).toLocaleDateString() + '</div>' +
                '</div>' +
                '<i class="fas fa-plus" style="color:#818cf8;cursor:pointer;"></i>' +
                '</div>';
        }).join('') +
        (analysesStore.filter(function (a) { return alreadyAdded.indexOf(a.id) < 0; }).length === 0 ? '<p style="color:#666;text-align:center;padding:20px;">All analysis results are already attached as evidence</p>' : '') +
        '</div></div>' +
        '<div class="form-actions"><button class="btn btn-secondary" onclick="this.closest(\'.modal\').remove()">Close</button></div>' +
        '</div>';
    document.body.appendChild(modal);
    modal.classList.add('active');
}

function addEvidenceToCase(analysisId) {
    var caseData = cases.find(function (c) { return c.id === selectedCaseId; });
    if (!caseData) return;

    var analysis = analysesStore.find(function (a) { return a.id === analysisId; });
    if (!analysis) return;

    if (!caseData.evidence) caseData.evidence = [];
    if (caseData.evidence.find(function (e) { return e.id === analysisId; })) return;

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
    document.querySelector('.case-modal')?.remove();
    selectCase(selectedCaseId);
    showFloatingNotification('Evidence added to case', 'success');
}

function removeEvidenceFromCase(caseId, evidenceId) {
    var caseData = cases.find(function (c) { return c.id === caseId; });
    if (!caseData) return;

    caseData.evidence = (caseData.evidence || []).filter(function (e) { return e.id !== evidenceId; });
    saveCases();
    selectCase(caseId);
}

// Settings Functions
