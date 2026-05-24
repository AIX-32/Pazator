(function () {
    'use strict';

    function getEntityName(id) {
        if (!id) return 'Unknown';
        var h = (window.pazatorData?.humans || []).find(function (x) { return String(x.id) === String(id); });
        if (h) return h.name;
        var o = (window.pazatorData?.others || []).find(function (x) { return String(x.id) === String(id); });
        return o ? o.name : id;
    }

    function getTimelineEvents(entityId) {
        var events = [];
        var humans = window.pazatorData?.humans || [];
        var others = window.pazatorData?.others || [];
        var chats = window.pazatorData?.chats || [];
        var cases = window.cases || [];

        var entity = humans.find(function (h) { return String(h.id) === String(entityId); }) ||
                     others.find(function (o) { return String(o.id) === String(entityId); });

        if (!entity) return { entityName: 'Unknown', events: [] };

        var entityName = entity.name;
        var nameLower = entityName.toLowerCase();

        // 1. Database Ingestion Event (Simulated or estimated from ID)
        var creationTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago default
        if (entity.birthDate) {
            events.push({
                date: entity.birthDate + 'T00:00:00Z',
                type: 'registration',
                title: 'Date of Birth Recorded',
                description: 'Entity born on ' + entity.birthDate + '.',
                icon: 'fa-baby',
                color: '#888'
            });
        }
        events.push({
            date: creationTime.toISOString(),
            type: 'system',
            title: 'Entity Registered in Pazator',
            description: 'Identified node successfully ingested into IndexedDB database.',
            icon: 'fa-database',
            color: '#4d9de0'
        });

        // 2. Relationship Events
        if (window.pazatorRelationships && typeof window.pazatorRelationships.getForEntity === 'function') {
            var rels = window.pazatorRelationships.getForEntity(entityId);
            rels.forEach(function (r, index) {
                var otherParty = r.sourceId === entityId ? r.targetId : r.sourceId;
                var otherName = getEntityName(otherParty);
                var typeInfo = window.pazatorRelationships.getTypeInfo(r.type) || { label: r.type || 'Associated' };
                // Stagger dates in past to look realistic
                var daysAgo = 20 - (index % 5) * 3;
                var rDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
                events.push({
                    date: rDate.toISOString(),
                    type: 'relationship',
                    title: 'Link Formed: ' + typeInfo.label,
                    description: 'Established connection with entity ' + otherName + '.',
                    icon: 'fa-link',
                    color: '#a29bfe'
                });
            });
        }

        // 3. Case Mentions
        cases.forEach(function (c, index) {
            var isMentioned = false;
            if (c.description && c.description.toLowerCase().includes(nameLower)) isMentioned = true;
            if (c.entities && c.entities.indexOf(entityName) !== -1) isMentioned = true;
            
            if (isMentioned) {
                var daysAgo = 15 - (index % 3) * 4;
                var cDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
                events.push({
                    date: cDate.toISOString(),
                    type: 'case',
                    title: 'Case Association: ' + c.title,
                    description: 'Identified as subject of interest under mission directive status: ' + c.status + '.',
                    icon: 'fa-folder-open',
                    color: '#ff9800'
                });
            }
        });

        // 4. Chat Log Mentions
        chats.forEach(function (chat, index) {
            var content = chat.content || '';
            if (content.toLowerCase().includes(nameLower)) {
                // Ensure unique dates or realistic formatting
                var chatTime = chat.timestamp || new Date(Date.now() - (5 + index % 10) * 24 * 60 * 60 * 1000).toISOString();
                events.push({
                    date: chatTime,
                    type: 'chat',
                    title: 'Intercepted Communication',
                    description: 'Mentioned in ' + (chat.source || 'Signal').toUpperCase() + ' chat logs (' + chat.participants + '): "' + content.substring(0, 100) + '..."',
                    icon: 'fa-comments',
                    color: '#6bcf7f'
                });
            }
        });

        // 5. Threat Escalation Event (derived from current level)
        var tl = entity.threatLevel || 'None';
        if (tl !== 'None') {
            var threatTime = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago default
            events.push({
                date: threatTime.toISOString(),
                type: 'threat',
                title: 'Security Threat Warning',
                description: 'Risk assessment engine escalated intelligence profile threat status to ' + tl.toUpperCase() + '.',
                icon: 'fa-shield-alt',
                color: tl === 'Critical' || tl === 'High' ? '#ff6b6b' : '#ffd93d'
            });
        }

        // Sort descending (newest first)
        events.sort(function (a, b) {
            return new Date(b.date) - new Date(a.date);
        });

        return {
            entityName: entityName,
            events: events
        };
    }

    function renderTimeline(container, entityId) {
        if (!container) return;
        if (typeof container === 'string') {
            container = document.getElementById(container);
        }
        if (!container) return;

        var res = getTimelineEvents(entityId);
        var events = res.events;

        if (events.length === 0) {
            container.innerHTML = '<div style="color:#555;font-style:italic;padding:12px 0;">No chronological events logged.</div>';
            return;
        }

        var html = '<div class="trac-timeline-wrapper" style="position:relative;padding:12px 0 12px 24px;border-left:1px solid rgba(255,255,255,0.08);margin-left:8px;font-family:\'DM Mono\',monospace;">';

        events.forEach(function (e) {
            var dateStr = '';
            try {
                var d = new Date(e.date);
                dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } catch (err) {
                dateStr = e.date;
            }

            html += '<div class="trac-timeline-item" style="position:relative;margin-bottom:20px;">';
            
            // Dot/Icon connector
            html += '<div class="trac-timeline-dot" style="position:absolute;left:-32px;top:2px;width:16px;height:16px;border-radius:50%;background:#0f0f0f;border:2px solid ' + e.color + ';display:flex;align-items:center;justify-content:center;z-index:2;box-shadow:0 0 8px ' + e.color + '44;">';
            html += '<i class="fas ' + e.icon + '" style="font-size:7px;color:' + e.color + ';"></i>';
            html += '</div>';

            // Card body (glassmorphism look)
            html += '<div class="trac-timeline-card" style="background:rgba(255,255,255,0.015);border:1px solid rgba(255,255,255,0.05);border-radius:6px;padding:10px 14px;transition:all 0.3s;cursor:default;">';
            html += '<div style="display:flex;justify-content:between;align-items:center;margin-bottom:4px;flex-wrap:wrap;gap:8px;">';
            html += '<span style="font-size:0.75rem;color:' + e.color + ';font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">' + e.title + '</span>';
            html += '<span style="font-size:0.7rem;color:#555;margin-left:auto;">' + dateStr + '</span>';
            html += '</div>';
            html += '<p style="font-size:0.8rem;color:rgba(255,255,255,0.6);margin:0;line-height:1.45;">' + e.description + '</p>';
            html += '</div>';

            html += '</div>';
        });

        html += '</div>';
        container.innerHTML = html;

        // Add CSS hover dynamics via JS
        var cards = container.querySelectorAll('.trac-timeline-card');
        cards.forEach(function (card) {
            card.addEventListener('mouseenter', function () {
                card.style.background = 'rgba(255,255,255,0.035)';
                card.style.borderColor = 'rgba(255,255,255,0.12)';
                card.style.transform = 'translateX(2px)';
            });
            card.addEventListener('mouseleave', function () {
                card.style.background = 'rgba(255,255,255,0.015)';
                card.style.borderColor = 'rgba(255,255,255,0.05)';
                card.style.transform = 'none';
            });
        });
    }

    window.pazatorTimeline = {
        getEvents: getTimelineEvents,
        render: renderTimeline
    };
})();
