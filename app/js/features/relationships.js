(function () {
    'use strict';

    var RELATION_TYPES = {
        friend: { label: 'Friend', color: '#4d9de0', icon: 'fa-user-friends' },
        family: { label: 'Family', color: '#6bcf7f', icon: 'fa-users' },
        associate: { label: 'Associate', color: '#ffd93d', icon: 'fa-handshake' },
        employer: { label: 'Employer', color: '#ff9f43', icon: 'fa-building' },
        employee: { label: 'Employee', color: '#ff9f43', icon: 'fa-user-tie' },
        owns: { label: 'Owns', color: '#a29bfe', icon: 'fa-crown' },
        communicates: { label: 'Communicates', color: '#00cec9', icon: 'fa-comments' },
        known: { label: 'Known', color: '#636e72', icon: 'fa-eye' },
        collaborator: { label: 'Collaborator', color: '#fd79a8', icon: 'fa-code-branch' },
        location_shared: { label: 'Location Shared', color: '#e17055', icon: 'fa-map-marker-alt' },
        relative: { label: 'Relative', color: '#6bcf7f', icon: 'fa-users' },
        custom: { label: 'Custom', color: '#b2bec3', icon: 'fa-tag' }
    };

    var relationships = [];
    var nextId = 1;
    var listeners = new Map();

    function on(event, handler) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(handler);
        return function () {
            var set = listeners.get(event);
            if (set) set.delete(handler);
        };
    }

    function emit(event, payload) {
        var set = listeners.get(event);
        if (!set) return;
        set.forEach(function (fn) {
            try { fn(payload); } catch (e) { console.error('[Relationships] handler error', e); }
        });
    }

    function generateId() {
        while (relationships.some(function (r) { return r.id === 'rel_' + nextId; })) { nextId++; }
        return 'rel_' + nextId++;
    }

    function getAll() {
        return relationships.slice();
    }

    function getById(id) {
        for (var i = 0; i < relationships.length; i++) {
            if (relationships[i].id === id) return relationships[i];
        }
        return null;
    }

    function getForEntity(entityId, entityType) {
        entityType = entityType || 'human';
        var result = [];
        for (var i = 0; i < relationships.length; i++) {
            var r = relationships[i];
            if ((r.sourceId === entityId && r.sourceType === entityType) ||
                (r.targetId === entityId && r.targetType === entityType)) {
                result.push(r);
            }
        }
        return result;
    }

    function getRelatedEntityIds(entityId, entityType) {
        entityType = entityType || 'human';
        var ids = [];
        var rels = getForEntity(entityId, entityType);
        for (var i = 0; i < rels.length; i++) {
            var r = rels[i];
            if (r.sourceId === entityId && r.sourceType === entityType) {
                if (ids.indexOf(r.targetId) === -1) ids.push(r.targetId);
            } else {
                if (ids.indexOf(r.sourceId) === -1) ids.push(r.sourceId);
            }
        }
        return ids;
    }

    function add(data) {
        if (!data.sourceId || !data.targetId) return null;
        if (!data.type) data.type = 'known';
        if (!RELATION_TYPES[data.type]) data.type = 'custom';

        var id = data.id || generateId();
        var rel = {
            id: id,
            sourceId: data.sourceId,
            sourceType: data.sourceType || 'human',
            targetId: data.targetId,
            targetType: data.targetType || 'human',
            type: data.type,
            strength: typeof data.strength === 'number' ? data.strength : 1,
            confidence: typeof data.confidence === 'number' ? data.confidence : 1,
            notes: data.notes || '',
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || new Date().toISOString(),
            metadata: data.metadata || {}
        };
        relationships.push(rel);
        emit('added', rel);
        emit('changed', { action: 'added', relationship: rel });
        return rel;
    }

    function remove(id) {
        for (var i = 0; i < relationships.length; i++) {
            if (relationships[i].id === id) {
                var removed = relationships.splice(i, 1)[0];
                emit('removed', removed);
                emit('changed', { action: 'removed', relationship: removed });
                return true;
            }
        }
        return false;
    }

    function update(id, data) {
        var rel = getById(id);
        if (!rel) return null;
        if (data.type && RELATION_TYPES[data.type]) rel.type = data.type;
        if (typeof data.strength === 'number') rel.strength = data.strength;
        if (typeof data.confidence === 'number') rel.confidence = data.confidence;
        if (data.notes !== undefined) rel.notes = data.notes;
        if (data.metadata) rel.metadata = Object.assign({}, rel.metadata, data.metadata);
        rel.updatedAt = new Date().toISOString();
        emit('updated', rel);
        emit('changed', { action: 'updated', relationship: rel });
        return rel;
    }

    function removeAllForEntity(entityId, entityType) {
        entityType = entityType || 'human';
        var toRemove = [];
        for (var i = 0; i < relationships.length; i++) {
            var r = relationships[i];
            if ((r.sourceId === entityId && r.sourceType === entityType) ||
                (r.targetId === entityId && r.targetType === entityType)) {
                toRemove.push(r);
            }
        }
        for (var j = 0; j < toRemove.length; j++) {
            remove(toRemove[j].id);
        }
        return toRemove.length;
    }

    function migrateFromLegacy(humans) {
        var count = 0;
        for (var i = 0; i < humans.length; i++) {
            var h = humans[i];
            if (!h || !h.id) continue;
            var existing = getRelatedEntityIds(h.id, 'human');
            if (h.family && h.family.length) {
                for (var f = 0; f < h.family.length; f++) {
                    var fid = h.family[f];
                    if (existing.indexOf(fid) === -1) {
                        add({
                            sourceId: h.id,
                            sourceType: 'human',
                            targetId: fid,
                            targetType: 'human',
                            type: 'family',
                            strength: 3,
                            confidence: 1,
                            notes: 'Migrated from legacy family field',
                            metadata: { migrated: true }
                        });
                        count++;
                    }
                }
            }
            if (h.friends && h.friends.length) {
                for (var fr = 0; fr < h.friends.length; fr++) {
                    var frId = h.friends[fr];
                    if (existing.indexOf(frId) === -1) {
                        add({
                            sourceId: h.id,
                            sourceType: 'human',
                            targetId: frId,
                            targetType: 'human',
                            type: 'friend',
                            strength: 2,
                            confidence: 1,
                            notes: 'Migrated from legacy friends field',
                            metadata: { migrated: true }
                        });
                        count++;
                    }
                }
            }
        }
        return count;
    }

    function toJSON() {
        return relationships.slice();
    }

    function fromJSON(data) {
        if (!Array.isArray(data)) return;
        relationships.length = 0;
        for (var i = 0; i < data.length; i++) {
            var r = data[i];
            if (r.id) {
                relationships.push(r);
                var numId = parseInt(r.id.replace('rel_', ''), 10);
                if (!isNaN(numId) && numId >= nextId) nextId = numId + 1;
            }
        }
    }

    function getTypes() {
        var types = [];
        for (var key in RELATION_TYPES) {
            types.push({ key: key, label: RELATION_TYPES[key].label, color: RELATION_TYPES[key].color, icon: RELATION_TYPES[key].icon });
        }
        return types;
    }

    function getTypeInfo(typeKey) {
        return RELATION_TYPES[typeKey] || RELATION_TYPES.custom;
    }

    function getStats() {
        var typeCounts = {};
        for (var i = 0; i < relationships.length; i++) {
            var t = relationships[i].type;
            typeCounts[t] = (typeCounts[t] || 0) + 1;
        }
        return {
            total: relationships.length,
            byType: typeCounts
        };
    }

    window.pazatorRelationships = {
        on: on,
        emit: emit,
        getAll: getAll,
        getById: getById,
        getForEntity: getForEntity,
        getRelatedEntityIds: getRelatedEntityIds,
        add: add,
        remove: remove,
        update: update,
        removeAllForEntity: removeAllForEntity,
        migrateFromLegacy: migrateFromLegacy,
        toJSON: toJSON,
        fromJSON: fromJSON,
        getTypes: getTypes,
        getTypeInfo: getTypeInfo,
        getStats: getStats,
        RELATION_TYPES: RELATION_TYPES
    };
})();
