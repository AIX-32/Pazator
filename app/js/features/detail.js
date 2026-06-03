function showDetailView(data, type) {

    document.currentDetailData = { ...data, type };

    document.getElementById('detailTitle').textContent = `${data.name} - Details`;

    document.getElementById('profileName').textContent = data.name;
    document.getElementById('profileType').textContent = type.charAt(0).toUpperCase() + type.slice(1);
    document.getElementById('statId').textContent = `ID: ${data.id || '—'}`;

    if (type === 'human') {
        const friendsCount = data.friends ? data.friends.length : 0;
        const familyCount = data.family ? data.family.length : 0;
        const tagsCount = data.tags ? data.tags.length : 0;
        const creditValue = data.credit !== undefined ? Math.round(data.credit) : 'N/A';

        document.getElementById('statFriends').textContent = friendsCount;
        document.getElementById('statFamily').textContent = familyCount;
        document.getElementById('statTags').textContent = tagsCount;
        document.getElementById('statCredit').textContent = creditValue;

        const threatLevelEl = document.getElementById('statThreatLevel');
        const statThreatContainer = document.getElementById('statThreatLevelContainer');
        if (data.threatLevel) {
            threatLevelEl.textContent = data.threatLevel;
            threatLevelEl.style.color = getThreatLevelColor(data.threatLevel);
            statThreatContainer.style.display = 'block';
        } else {
            threatLevelEl.textContent = '—';
            statThreatContainer.style.display = 'none';
        }
    } else {
        document.getElementById('statFriends').textContent = 'N/A';
        document.getElementById('statFamily').textContent = 'N/A';
        document.getElementById('statTags').textContent = 'N/A';
        document.getElementById('statCredit').textContent = 'N/A';
        document.getElementById('statThreatLevelContainer').style.display = 'none';
    }

    const profilePictureContainer = document.getElementById('profilePictureContainer');
    if (data.imagePreview) {
        profilePictureContainer.innerHTML = `
                    <img class="profile-picture" src="${data.imagePreview}" alt="${data.name}" 
                         onerror="this.parentElement.innerHTML='<div class=\"profile-placeholder\"><i class=\"fas fa-user\"></i><div>Image Error</div></div>'">
                `;
    } else {
        profilePictureContainer.innerHTML = `
                    <div class="profile-placeholder">
                        <i class="fas fa-user"></i>
                        <div>No Image</div>
                    </div>
                `;
    }

    document.getElementById('detailName').textContent = data.name;

    if (type === 'human') {
        const setDetail = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value || '—';
        };
        const showContainer = (id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = '';
        };
        const hideContainer = (id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        };

        showContainer('detailGenderContainer');
        showContainer('detailBirthDateContainer');
        showContainer('detailAgeContainer');
        showContainer('detailMaritalStatusContainer');
        showContainer('detailOccupationContainer');
        showContainer('detailFriendsContainer');
        showContainer('detailFamilyContainer');

        document.getElementById('detailGender').textContent = data.gender || 'Not specified';
        document.getElementById('detailBirthDate').textContent = data.birthDate ? new Date(data.birthDate).toLocaleDateString() : 'Not specified';
        const age = data.birthDate ? calculateAge(data.birthDate) : null;
        document.getElementById('detailAge').textContent = age ? `${age} years old` : 'Unknown';
        document.getElementById('detailMaritalStatus').textContent = data.maritalStatus || 'Not specified';
        document.getElementById('detailOccupation').textContent = data.workplace || 'Not specified';

        showContainer('detailCreditContainer');
        document.getElementById('detailCredit').textContent = data.credit !== undefined ? Math.round(data.credit) : 'Not recorded';

        showContainer('detailClassContainer');
        document.getElementById('detailClass').textContent = data.socialClass || 'Not specified';

        setDetail('detailNationality', data.nationality);
        setDetail('detailCountryOfOrigin', data.countryOfOrigin);
        setDetail('detailImmigrationStatus', data.immigrationStatus);
        setDetail('detailLanguages', data.languages);
        setDetail('detailEthnicity', data.ethnicity);
        setDetail('detailReligion', data.religion);
        setDetail('detailPoliticalViews', data.politicalViews);
        setDetail('detailEducation', data.educationLevel);
        setDetail('detailIncomeLevel', data.incomeLevel);

        const threatLevelEl = document.getElementById('detailThreatLevel');
        if (data.threatLevel) {
            threatLevelEl.textContent = data.threatLevel;
            threatLevelEl.style.color = getThreatLevelColor(data.threatLevel);
        } else {
            threatLevelEl.textContent = 'Not specified';
            threatLevelEl.style.color = '';
        }

        const friendsList = data.friends && data.friends.length > 0
            ? data.friends.map(id => getHumanNameById(id)).join(', ')
            : 'None';
        document.getElementById('detailFriends').textContent = friendsList;

        const familyList = data.family && data.family.length > 0
            ? data.family.map(id => getHumanNameById(id)).join(', ')
            : 'None';
        document.getElementById('detailFamily').textContent = familyList;

        const tagsSection = document.getElementById('detailTagsSection');
        const tagsEl = document.getElementById('detailTags');
        if (data.tags && data.tags.length > 0) {
            tagsSection.style.display = '';
            tagsEl.textContent = data.tags.join(', ');
        } else {
            tagsSection.style.display = 'none';
        }

        const notesSection = document.getElementById('detailNotesSection');
        const notesEl = document.getElementById('detailNotes');
        if (data.extraNotes) {
            notesSection.style.display = '';
            notesEl.textContent = data.extraNotes;
        } else {
            notesSection.style.display = 'none';
        }

        // Linked Chats
        const linkedChatsSection = document.getElementById('detailLinkedChatsSection');
        if (linkedChatsSection && data.chats && data.chats.length > 0) {
            linkedChatsSection.style.display = '';
            const list = linkedChatsSection.querySelector('.linked-item-list') || (() => {
                const el = document.createElement('div');
                el.className = 'linked-item-list';
                linkedChatsSection.appendChild(el);
                return el;
            })();
            list.innerHTML = data.chats.map(chatRef => {
                const chat = (pazatorData.chats || []).find(c => c.id === chatRef || c.timestamp === chatRef);
                if (!chat) return '';
                return '<div class="linked-item" onclick="openSlidePanel(\'' + (chat.id || chatRef) + '\',\'chat\')">' +
                    '<div class="linked-icon chat-icon"><i class="fas fa-comment"></i></div>' +
                    '<span class="linked-name">' + (chat.source || 'Chat') + ' - ' + new Date(chat.timestamp).toLocaleDateString() + '</span>' +
                    '<span class="linked-date">' + (chat.suspicious ? '<span style="color:#ff6b6b;">⚠ Suspicious</span>' : '') + '</span>' +
                    '</div>';
            }).join('');
        } else if (linkedChatsSection) {
            linkedChatsSection.style.display = 'none';
        }

        // Linked Cases
        const linkedCasesSection = document.getElementById('detailLinkedCasesSection');
        if (linkedCasesSection) {
            const humanCases = cases.filter(c => c.entities && c.entities.includes(data.id));
            if (humanCases.length > 0) {
                linkedCasesSection.style.display = '';
                const list = linkedCasesSection.querySelector('.linked-item-list') || (() => {
                    const el = document.createElement('div');
                    el.className = 'linked-item-list';
                    linkedCasesSection.appendChild(el);
                    return el;
                })();
                list.innerHTML = humanCases.map(c => {
                    return '<div class="linked-item" onclick="switchTab(\'cases\');setTimeout(function(){selectCase(\'' + c.id + '\')},100)">' +
                        '<div class="linked-icon case-icon"><i class="fas fa-folder"></i></div>' +
                        '<span class="linked-name">' + escapeHtml(c.title) + '</span>' +
                        '<span class="linked-date">' + new Date(c.createdAt).toLocaleDateString() + '</span>' +
                        '</div>';
                }).join('');
            } else {
                linkedCasesSection.style.display = 'none';
            }
        }

        const familyGraphContainer = document.getElementById('familyGraphContainer');
        familyGraphContainer.style.display = '';

        document.getElementById('familyGraphContainer').style.display = '';
    } else {
        const hideAll = () => {
            ['detailGenderContainer', 'detailBirthDateContainer', 'detailAgeContainer', 'detailMaritalStatusContainer',
                'detailOccupationContainer', 'detailCreditContainer', 'detailClassContainer', 'detailFriendsContainer',
                'detailFamilyContainer', 'detailNationalityContainer', 'detailCountryOfOriginContainer',
                'detailImmigrationStatusContainer', 'detailLanguagesContainer', 'detailEthnicityContainer',
                'detailReligionContainer', 'detailPoliticalViewsContainer', 'detailEducationContainer',
                'detailIncomeLevelContainer'].forEach(hideContainer);
        };
        hideAll();
        document.getElementById('detailThreatLevel').textContent = 'N/A';
        document.getElementById('detailThreatLevel').style.color = '';
        document.getElementById('detailNotesSection').style.display = '';
        document.getElementById('detailTagsSection').style.display = 'none';
        document.getElementById('detailNotes').textContent = data.note || 'None';
        document.getElementById('familyGraphContainer').style.display = 'none';
    }

    // Timeline
    var timelineSection = document.getElementById('detailTimelineSection');
    var timelineFeed = document.getElementById('detailTimelineFeed');
    if (timelineSection && timelineFeed) {
        timelineSection.style.display = '';
        if (window.pazatorTimeline) {
            window.pazatorTimeline.render(timelineFeed, data.id);
        } else {
            var events = buildEntityTimeline(data.id, type);
            renderEntityTimeline('detailTimelineFeed', events);
        }
    }

    detailViewModal.style.display = 'flex';
    detailViewModal.style.zIndex = '1000';

}

function openSlidePanel(id, type) {
    if (type === 'chat') {
        switchTab('chat-control');
    } else {
        openDetailView(id, type);
    }
}

/* === Entity Timeline === */
function buildEntityTimeline(entityId, entityType) {
    var events = [];
    var now = Date.now();

    function entityName(id, type) {
        if (type === 'human') return getHumanNameById(id);
        var e = pazatorData.others.find(function (o) { return o.id === id; });
        return e ? e.name : 'Unknown';
    }

    // 1. Relationships
    if (window.pazatorRelationships) {
        var rels = window.pazatorRelationships.getForEntity(entityId, entityType);
        rels.forEach(function (r) {
            var ts = new Date(r.createdAt).getTime();
            if (isNaN(ts)) ts = now;
            var isSource = r.sourceId === entityId;
            var otherId = isSource ? r.targetId : r.sourceId;
            var otherType = isSource ? r.targetType : r.sourceType;
            var otherName = entityName(otherId, otherType);
            var typeInfo = window.pazatorRelationships.getTypeInfo(r.type);
            events.push({
                type: 'relationship', timestamp: ts,
                title: typeInfo.label + ' → ' + otherName,
                description: r.notes || typeInfo.label + ' relationship',
                color: typeInfo.color, icon: typeInfo.icon,
                sourceData: r, sourceType: 'relationship'
            });
        });
    }

    // 2. Cases
    var entityCases = cases.filter(function (c) { return c.entities && c.entities.indexOf(entityId) >= 0; });
    entityCases.forEach(function (c) {
        events.push({
            type: 'case', timestamp: c.createdAt || 0,
            title: 'Case: ' + c.title,
            description: 'Case created — ' + c.status,
            color: '#ffd93d', icon: 'fa-folder',
            sourceData: c, sourceType: 'case'
        });
        if (c.timeline) {
            c.timeline.forEach(function (t) {
                if (t.type === 'entity-added' || t.type === 'entity-removed') {
                    events.push({
                        type: 'case_timeline', timestamp: t.timestamp,
                        title: 'Activity: ' + c.title,
                        description: stripHtml(t.content || ''),
                        color: '#4d9de0', icon: 'fa-stream',
                        sourceData: { case: c, timelineEntry: t }, sourceType: 'case_timeline'
                    });
                } else if (t.type === 'note') {
                    var content = t.content || '';
                    var en = entityName(entityId, entityType);
                    if (content.indexOf(entityId) >= 0 || (en && content.indexOf(en) >= 0)) {
                        events.push({
                            type: 'case_timeline', timestamp: t.timestamp,
                            title: 'Activity: ' + c.title,
                            description: stripHtml(content),
                            color: '#4d9de0', icon: 'fa-stream',
                            sourceData: { case: c, timelineEntry: t }, sourceType: 'case_timeline'
                        });
                    }
                }
            });
        }
    });

    // 3. Chats
    if (entityType === 'human') {
        var human = pazatorData.humans.find(function (h) { return h.id === entityId; });
        if (human && human.chats && human.chats.length > 0) {
            human.chats.forEach(function (chatRef) {
                var chat = (pazatorData.chats || []).find(function (c) { return c.id === chatRef || c.timestamp === chatRef; });
                if (chat) {
                    var ts = typeof chat.timestamp === 'number' ? chat.timestamp : new Date(chat.timestamp).getTime();
                    if (isNaN(ts)) ts = 0;
                    events.push({
                        type: 'chat', timestamp: ts,
                        title: 'Chat: ' + (chat.source || 'Unknown'),
                        description: 'Conversation' + (chat.suspicious ? ' (suspicious)' : ''),
                        color: '#00cec9', icon: 'fa-comment',
                        sourceData: chat, sourceType: 'chat'
                    });
                }
            });
        }
    }

    // 4. Tracker
    if (entityType === 'human') {
        var human = pazatorData.humans.find(function (h) { return h.id === entityId; });
        if (human && human.trackerAlias && human.trackerLinkedAt) {
            var ts = typeof human.trackerLinkedAt === 'number' ? human.trackerLinkedAt : new Date(human.trackerLinkedAt).getTime();
            if (isNaN(ts)) ts = 0;
            events.push({
                type: 'tracker', timestamp: ts,
                title: 'Tracker Linked: ' + human.trackerAlias,
                description: 'LCTX tracker alias linked',
                color: '#e17055', icon: 'fa-map-marker-alt',
                sourceData: human, sourceType: 'tracker'
            });
        }
    }

    // 5. AI Analysis
    if (analysesStore && analysesStore.length > 0) {
        var en = entityName(entityId, entityType);
        analysesStore.forEach(function (a) {
            var found = a.title && (a.title.indexOf(entityId) >= 0 || (en && a.title.indexOf(en) >= 0));
            if (!found && a.findings) {
                for (var i = 0; i < a.findings.length; i++) {
                    var f = a.findings[i];
                    var fStr = typeof f === 'string' ? f : (f && f.content ? f.content : '');
                    if (fStr.indexOf(entityId) >= 0 || (en && fStr.indexOf(en) >= 0)) { found = true; break; }
                }
            }
            if (found) {
                events.push({
                    type: 'analysis', timestamp: a.createdAt || 0,
                    title: 'Analysis: ' + (a.title || a.type || 'Untitled'),
                    description: 'AI analysis related to ' + (en || entityId),
                    color: '#a29bfe', icon: 'fa-robot',
                    sourceData: a, sourceType: 'analysis'
                });
            }
        });
    }

    // 6. Notes
    if (entityType === 'human') {
        var human = pazatorData.humans.find(function (h) { return h.id === entityId; });
        if (human && human.extraNotes) {
            events.push({
                type: 'note', timestamp: 0,
                title: 'Note',
                description: human.extraNotes.substring(0, 120) + (human.extraNotes.length > 120 ? '...' : ''),
                color: '#6bcf7f', icon: 'fa-sticky-note',
                sourceData: human, sourceType: 'note'
            });
        }
    } else {
        var other = pazatorData.others.find(function (o) { return o.id === entityId; });
        if (other && other.note) {
            events.push({
                type: 'note', timestamp: 0,
                title: 'Note',
                description: other.note.substring(0, 120) + (other.note.length > 120 ? '...' : ''),
                color: '#6bcf7f', icon: 'fa-sticky-note',
                sourceData: other, sourceType: 'note'
            });
        }
    }

    events.sort(function (a, b) { return b.timestamp - a.timestamp; });
    return events;
}

function stripHtml(html) {
    var div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
}

function renderEntityTimeline(containerId, events) {
    var container = document.getElementById(containerId);
    if (!container) return;
    if (!events || events.length === 0) {
        container.innerHTML = '<div class="slide-value" style="color:#555;padding:4px 0;">No timeline events</div>';
        return;
    }
    var html = '<div class="entity-timeline-feed">';
    for (var i = 0; i < events.length; i++) {
        var e = events[i];
        var timeStr = '';
        if (e.timestamp > 0) {
            var diff = Date.now() - e.timestamp;
            if (diff < 60000) timeStr = 'just now';
            else if (diff < 3600000) timeStr = Math.floor(diff / 60000) + 'm ago';
            else if (diff < 86400000) timeStr = Math.floor(diff / 3600000) + 'h ago';
            else if (diff < 2592000000) timeStr = Math.floor(diff / 86400000) + 'd ago';
            else timeStr = new Date(e.timestamp).toLocaleDateString();
        }
        html += '<div class="timeline-event" data-idx="' + i + '">' +
            '<div class="timeline-event-dot"></div>' +
            '<div class="timeline-event-line"></div>' +
            '<div class="timeline-event-content">' +
            '<div class="timeline-event-header">' +
            '<span class="timeline-event-title">' + escapeHtml(e.title) + '</span>' +
            (timeStr ? '<span class="timeline-event-time">' + timeStr + '</span>' : '') +
            '</div>' +
            (e.description ? '<div class="timeline-event-desc">' + escapeHtml(e.description) + '</div>' : '') +
            '</div></div>';
    }
    html += '</div>';
    container.innerHTML = html;

    container._timelineEvents = events;
    var els = container.querySelectorAll('.timeline-event');
    for (var i = 0; i < els.length; i++) {
        (function (evt) {
            els[i].addEventListener('click', function () {
                handleTimelineEventClick(evt);
            });
        })(events[i]);
    }
}

function handleTimelineEventClick(event) {
    if (!event) return;
    switch (event.sourceType) {
        case 'case':
        case 'case_timeline':
            var caseId = event.sourceType === 'case' ? event.sourceData.id : event.sourceData.case.id;
            switchTab('cases');
            setTimeout(function () { selectCase(caseId); }, 100);
            break;
        case 'chat':
            switchTab('chat-control');
            break;
    }
}

// ===== Cross-Entity Search =====
function initCrossSearch() {
    var input = document.getElementById('crossSearchInput');
    var results = document.getElementById('crossSearchResults');
    var count = document.getElementById('crossSearchCount');
    var clear = document.getElementById('crossSearchClear');
    if (!input) return;

    var debounceTimer;
    input.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () { performCrossSearch(); }, 300);
    });

    if (clear) {
        clear.addEventListener('click', function () {
            input.value = '';
            results.style.display = 'none';
            if (count) count.style.display = 'none';
            clear.style.display = 'none';
        });
    }

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { clear.click(); }
    });
}

function performCrossSearch() {
    var input = document.getElementById('crossSearchInput');
    var results = document.getElementById('crossSearchResults');
    var count = document.getElementById('crossSearchCount');
    var clear = document.getElementById('crossSearchClear');
    if (!input || !results) return;

    var query = input.value.trim().toLowerCase();
    if (query.length < 2) {
        results.style.display = 'none';
        if (count) count.style.display = 'none';
        if (clear) clear.style.display = 'none';
        return;
    }

    if (clear) clear.style.display = 'inline-block';

    var matches = [];

    // Search humans
    pazatorData.humans.forEach(function (h) {
        if ((h.name && h.name.toLowerCase().includes(query)) ||
            (h.extraNotes && h.extraNotes.toLowerCase().includes(query)) ||
            (h.tags && h.tags.some(function (t) { return t.toLowerCase().includes(query); })) ||
            (h.nationality && h.nationality.toLowerCase().includes(query)) ||
            (h.workplace && h.workplace.toLowerCase().includes(query))) {
            matches.push({ id: h.id, type: 'human', name: h.name, sub: h.threatLevel ? 'Threat: ' + h.threatLevel : (h.workplace || '') });
        }
    });

    // Search chats
    (pazatorData.chats || []).forEach(function (c) {
        if ((c.source && c.source.toLowerCase().includes(query)) ||
            (c.content && c.content.toLowerCase().includes(query)) ||
            (c.participants && c.participants.some(function (p) {
                var pname = typeof p === 'object' ? p.name : p;
                return pname && pname.toLowerCase().includes(query);
            }))) {
            var pnames = (c.participants || []).map(function (p) { return typeof p === 'object' ? p.name : p; }).join(', ');
            matches.push({ id: c.id || c.timestamp, type: 'chat', name: (c.source || 'Chat') + ' - ' + new Date(c.timestamp).toLocaleDateString(), sub: pnames });
        }
    });

    // Search cases
    cases.forEach(function (c) {
        if ((c.title && c.title.toLowerCase().includes(query)) ||
            (c.description && c.description.toLowerCase().includes(query)) ||
            (c.timeline && c.timeline.some(function (t) { return t.content && t.content.toLowerCase().includes(query); }))) {
            matches.push({ id: c.id, type: 'case', name: c.title, sub: c.status + ' - ' + (c.entities ? c.entities.length : 0) + ' entities' });
        }
    });

    if (count) {
        count.textContent = matches.length + ' results';
        count.style.display = 'inline-block';
    }

    if (matches.length === 0) {
        results.innerHTML = '<div class="search-result-empty">No results found for "' + query + '"</div>';
        results.style.display = 'block';
        return;
    }

    // Limit display
    var display = matches.slice(0, 50);
    results.innerHTML = display.map(function (m) {
        var icon = m.type === 'human' ? 'fa-user' : m.type === 'chat' ? 'fa-comment' : 'fa-folder';
        return '<div class="search-result-item" onclick="openSlidePanel(\'' + m.id + '\',\'' + m.type + '\')">' +
            '<div class="result-icon ' + m.type + '"><i class="fas ' + icon + '"></i></div>' +
            '<span class="result-name">' + escapeHtml(m.name) + '</span>' +
            '<span class="result-meta">' + escapeHtml(m.sub || '') + '</span></div>';
    }).join('');
    if (matches.length > 50) {
        results.innerHTML += '<div style="padding:8px;text-align:center;color:#666;font-size:0.8rem;">+ ' + (matches.length - 50) + ' more results</div>';
    }
    results.style.display = 'block';
}

// ===== PDF Export for Cases =====
async function exportCaseToPDF(caseId) {
    var caseData = cases.find(function (c) { return c.id === caseId; });
    if (!caseData) { showAlert('Case not found', 'Error', 'error'); return; }

    if (!logoBase64) { await loadLogoForPDF(); }

    var jsPDF = window.jspdf.jsPDF;
    if (!jsPDF) { showAlert('PDF library not loaded', 'Error', 'error'); return; }

    var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var pw = doc.internal.pageSize.getWidth();
    var ph = doc.internal.pageSize.getHeight();
    var m = 20;
    var y = m;

    doc.setFillColor(0, 0, 0);
    doc.rect(0, 0, pw, 55, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(44);
    doc.setFont('helvetica', 'bold');
    doc.text('PAZATOR', m, 25);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Case Report', m, 38);
    doc.setFontSize(8);
    doc.text('Generated: ' + new Date().toLocaleDateString(), m, 48);

    if (logoBase64) { doc.addImage(logoBase64, 'PNG', pw - m - 25, 12, 25, 25); }

    y = 70;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(caseData.title, m, y);
    y += 12;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Status: ' + (caseData.status || 'open').replace('-', ' '), m, y);
    y += 6;
    doc.text('Created: ' + new Date(caseData.createdAt).toLocaleDateString(), m, y);
    y += 6;
    doc.text('Entities: ' + (caseData.entities ? caseData.entities.length : 0), m, y);
    y += 10;

    doc.setDrawColor(0, 0, 0);
    doc.line(m, y, m + 40, y);
    y += 8;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60, 60, 60);
    doc.text('DESCRIPTION', m, y);
    y += 7;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    var descLines = doc.splitTextToSize(caseData.description || 'No description', pw - m * 2);
    doc.text(descLines, m, y);
    y += descLines.length * 4 + 8;

    // Entities
    if (caseData.entities && caseData.entities.length > 0) {
        if (y > ph - 60) { doc.addPage(); y = m; }
        doc.setDrawColor(0, 0, 0);
        doc.line(m, y, m + 40, y);
        y += 8;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 60, 60);
        doc.text('ENTITIES', m, y);
        y += 7;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        caseData.entities.forEach(function (eid) {
            var human = pazatorData.humans.find(function (h) { return h.id === eid; });
            var name = human ? human.name : eid;
            doc.text('- ' + name, m + 5, y);
            y += 5;
            if (y > ph - 20) { doc.addPage(); y = m; }
        });
        y += 5;
    }

    // Timeline
    if (caseData.timeline && caseData.timeline.length > 0) {
        if (y > ph - 60) { doc.addPage(); y = m; }
        doc.setDrawColor(0, 0, 0);
        doc.line(m, y, m + 40, y);
        y += 8;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 60, 60);
        doc.text('TIMELINE', m, y);
        y += 7;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        caseData.timeline.forEach(function (item) {
            var time = new Date(item.timestamp).toLocaleString();
            doc.setFont('helvetica', 'bold');
            doc.text(time, m, y);
            y += 4;
            doc.setFont('helvetica', 'normal');
            var contentLines = doc.splitTextToSize(item.content.replace(/<[^>]*>/g, ''), pw - m * 2 - 10);
            doc.text(contentLines, m + 5, y);
            y += contentLines.length * 4 + 6;
            if (y > ph - 20) { doc.addPage(); y = m; }
        });
    }

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'italic');
    doc.text('Pazator Intelligence System - SARPARAST', pw / 2, ph - 10, { align: 'center' });

    doc.save('pazator-case-' + caseData.id.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() + '-report.pdf');
    showAlert('PDF report generated for case', 'Export Complete', 'success');
}

function openDetailView(id, type) {
    const normalizedType = (type || '').toLowerCase();
    const data = normalizedType === 'human'
        ? pazatorData.humans.find(h => h.id === id)
        : pazatorData.others.find(o => o.id === id);

    if (data) {
        showDetailView(data, normalizedType);
    } else {
        console.warn(`openDetailView: Unable to find entry ${id} (${type})`);
    }
}

function getHumanNameById(id) {
    const human = pazatorData.humans.find(h => h.id === id);
    return human ? human.name : 'Unknown';
}

function scheduleFamilyGraphRender(human) {
    const attempt = () => {
        const graphContainer = document.getElementById('familyGraph');
        if (!graphContainer) return;

        const rect = graphContainer.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) {
            requestAnimationFrame(attempt);
            return;
        }
        renderFamilyGraph(human);
    };

    // Two frames to allow modal layout to settle before measuring.
    requestAnimationFrame(() => requestAnimationFrame(attempt));
}

function renderFamilyGraph(human) {
    const graphContainer = document.getElementById('familyGraph');
    graphContainer.innerHTML = '';

    if (!human.family || human.family.length === 0) {
        graphContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#666;">No family relationships</div>';
        return;
    }

    const centerX = graphContainer.offsetWidth / 2;
    const centerY = graphContainer.offsetHeight / 2;

    const centralNode = document.createElement('div');
    centralNode.className = 'graph-node';
    centralNode.classList.add('graph-node-center');
    centralNode.textContent = human.name;
    graphContainer.appendChild(centralNode);

    const centerNodeRadiusX = (centralNode.offsetWidth || 72) / 2;
    const centerNodeRadiusY = (centralNode.offsetHeight || 72) / 2;
    centralNode.style.left = `${centerX - centerNodeRadiusX}px`;
    centralNode.style.top = `${centerY - centerNodeRadiusY}px`;

    const familyCount = human.family.length;
    human.family.forEach((familyId, index) => {
        const familyMember = window.pazatorStore ? pazatorStore.getHumanById(familyId) : pazatorData.humans.find(function (h) { return h.id === familyId; });
        if (!familyMember) return;

        const angle = (index / familyCount) * Math.PI * 2;
        const maxDistance = Math.min(centerX, centerY) - Math.max(centerNodeRadiusX, centerNodeRadiusY) - 20;
        const distance = Math.max(90, Math.min(160, maxDistance));
        const x = centerX + Math.cos(angle) * distance;
        const y = centerY + Math.sin(angle) * distance;

        const node = document.createElement('div');
        node.className = 'graph-node';
        node.classList.add('graph-node-member');
        node.textContent = familyMember.name;
        graphContainer.appendChild(node);

        const nodeRadiusX = (node.offsetWidth || 72) / 2;
        const nodeRadiusY = (node.offsetHeight || 72) / 2;
        node.style.left = `${x - nodeRadiusX}px`;
        node.style.top = `${y - nodeRadiusY}px`;

        const line = document.createElement('div');
        line.className = 'graph-line';

        const dx = x - centerX;
        const dy = y - centerY;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;

        line.style.width = `${length}px`;
        line.style.left = `${centerX}px`;
        line.style.top = `${centerY}px`;
        line.style.transform = `rotate(${angleDeg}deg)`;

        graphContainer.appendChild(line);
    });
}

function renderTags() {
    tagsContainer.innerHTML = '';
    var countEl = document.getElementById('tagCount');
    if (countEl) countEl.textContent = tags.length;

    if (tags.length === 0) {
        tagsContainer.innerHTML = '<span style="color: #666; font-size: 0.85rem;">No tags yet</span>';
        return;
    }

    const showBtn = document.createElement('button');
    showBtn.className = 'tags-more-btn';
    showBtn.textContent = `Show tags (${tags.length})`;
    showBtn.addEventListener('click', showAllTagsPopup);
    tagsContainer.appendChild(showBtn);
}

function showAllTagsPopup() {
    let overlay = document.querySelector('.tags-popup-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'tags-popup-overlay';
        overlay.innerHTML = `
            <div class="tags-popup">
                <h3>
                    All Tags
                    <span class="close-popup">&times;</span>
                </h3>
                <div class="popup-tags"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('.close-popup').addEventListener('click', () => {
            overlay.classList.remove('active');
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    }

    const popupTags = overlay.querySelector('.popup-tags');
    popupTags.innerHTML = '';

    tags.forEach(tag => {
        const tagElement = document.createElement('div');
        tagElement.className = 'popup-tag';
        tagElement.innerHTML = `
            ${tag}
            <span class="remove-tag" data-tag="${tag}">&times;</span>
        `;

        const removeBtn = tagElement.querySelector('.remove-tag');
        removeBtn.addEventListener('click', () => {
            tags = tags.filter(t => t !== tag);
            renderTags();
            showAllTagsPopup();
        });

        popupTags.appendChild(tagElement);
    });

    overlay.classList.add('active');
}

function populateSelectOptions(selectedFriends = [], selectedFamily = []) {
    const friendsSelect = document.getElementById('friends');
    const familySelect = document.getElementById('family');

    friendsSelect.innerHTML = '';
    familySelect.innerHTML = '';

    pazatorData.humans.forEach(human => {
        const displayName = `[${human.id}] ${human.name}`;

        const friendOption = document.createElement('option');
        friendOption.value = human.id;
        friendOption.textContent = displayName;
        if (selectedFriends.includes(human.id)) {
            friendOption.selected = true;
        }
        friendsSelect.appendChild(friendOption);

        const familyOption = document.createElement('option');
        familyOption.value = human.id;
        familyOption.textContent = displayName;
        if (selectedFamily.includes(human.id)) {
            familyOption.selected = true;
        }
        familySelect.appendChild(familyOption);
    });
}

function populateTagsForHuman(selectedTags = []) {
    const tagsSelect = document.getElementById('humanTags');

    tagsSelect.innerHTML = '';

    tags.forEach(tag => {
        const tagOption = document.createElement('option');
        tagOption.value = tag;
        tagOption.textContent = tag;
        if (selectedTags.includes(tag)) {
            tagOption.selected = true;
        }
        tagsSelect.appendChild(tagOption);
    });
}

function openHumanFormForEdit(human) {
    document.getElementById('humanModalTitle').textContent = 'Edit Human Entry';
    document.getElementById('humanId').value = human.id;
    document.getElementById('humanName').value = human.name;
    document.getElementById('birthDate').value = human.birthDate || '';
    document.getElementById('credit').value = human.credit || '';
    document.getElementById('humanExtraNotes').value = human.extraNotes || '';

    initAcFields();

    setAcValue('gender', human.gender || '');
    setAcValue('maritalStatus', human.maritalStatus || '');
    setAcValue('workplace', human.workplace || '');
    setAcValue('nationality', human.nationality || '');
    setAcValue('countryOfOrigin', human.countryOfOrigin || '');
    setAcValue('immigrationStatus', human.immigrationStatus || '');
    setAcValue('ethnicity', human.ethnicity || '');
    setAcValue('religion', human.religion || '');
    setAcValue('politicalView', human.politicalViews || '');
    setAcValue('threatLevel', human.threatLevel || '');
    setAcValue('socialClass', human.socialClass || '');
    setAcValue('incomeLevel', human.incomeLevel || '');
    setAcValue('educationLevel', human.educationLevel || '');

    if (human.languages) {
        var langInst = _acInstances['language'];
        if (langInst) {
            langInst.clearValues();
            human.languages.split(',').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (lang) {
                langInst.addValue(lang);
            });
        }
    }

    populateSelectOptions(human.friends || [], human.family || []);

    populateTagsForHuman(human.tags || []);

    var trackerSelect = document.getElementById('humanTrackerSelect');
    var trackerAliasInput = document.getElementById('humanTrackerAlias');
    if (trackerSelect) {
        var option = trackerSelect.querySelector('option[value="' + (human.trackerAlias || '').replace(/["\\]/g, '\\$&') + '"]');
        if (option) {
            trackerSelect.value = human.trackerAlias || '';
        }
    }
    if (trackerAliasInput) {
        trackerAliasInput.value = human.trackerAlias || '';
    }

    humanModal.style.display = 'flex';
    humanModal.style.zIndex = '1000';
}

function openOtherFormForEdit(other) {
    document.getElementById('otherModalTitle').textContent = 'Edit Company Entry';
    document.getElementById('otherId').value = other.id;
    document.getElementById('otherName').value = other.name;
    document.getElementById('otherNote').value = other.note || '';

    otherModal.style.display = 'flex';
    otherModal.style.zIndex = '1000';
}

async function deleteCurrentEntry() {
    const data = document.currentDetailData;
    if (!data) return;

    const confirmed = await showConfirm(`Are you sure you want to delete "${data.name}"?`, 'Confirm Deletion', 'warning');
    if (confirmed) {
        if (data.type === 'human') {
            pazatorData.humans = pazatorData.humans.filter(h => h.id !== data.id);
            if (window.pazatorStore) pazatorStore.rebuildIndexes();
        } else {
            pazatorData.others = pazatorData.others.filter(o => o.id !== data.id);
        }

        saveData();
        renderObjectCanvas();
        detailViewModal.style.display = 'none';
        detailViewModal.style.zIndex = '-1';
    }
}
