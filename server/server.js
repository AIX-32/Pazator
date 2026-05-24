const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3456;
const DATA_DIR = path.join(__dirname, 'data');

app.use(cors());
app.use(express.json({ limit: '50mb' }));

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const REPO_FILE = path.join(DATA_DIR, 'repo.json');
const CHANGELOG_FILE = path.join(DATA_DIR, 'changelog.json');

function readRepo() {
  try {
    if (fs.existsSync(REPO_FILE)) {
      return JSON.parse(fs.readFileSync(REPO_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Error reading repo:', e.message);
  }
  return { version: 0, data: {} };
}

function writeRepo(repo) {
  fs.writeFileSync(REPO_FILE, JSON.stringify(repo, null, 2));
}

function readChangelog() {
  try {
    if (fs.existsSync(CHANGELOG_FILE)) {
      return JSON.parse(fs.readFileSync(CHANGELOG_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Error reading changelog:', e.message);
  }
  return [];
}

function appendChangelog(entry) {
  const log = readChangelog();
  log.push(entry);
  fs.writeFileSync(CHANGELOG_FILE, JSON.stringify(log, null, 2));
}

app.get('/api/sync', (req, res) => {
  const repo = readRepo();
  res.json({ version: repo.version, data: repo.data });
});

app.post('/api/sync', (req, res) => {
  const { clientVersion, data, stores } = req.body;
  const repo = readRepo();

  if (!data && !stores) {
    return res.status(400).json({ error: 'No data provided' });
  }

  const newData = data || stores || {};
  const merged = { ...repo.data };

  const added = [];
  const modified = [];
  const removed = [];

  for (const storeName of Object.keys(newData)) {
    if (!merged[storeName]) merged[storeName] = {};
    const incoming = newData[storeName];
    for (const id of Object.keys(incoming)) {
      if (!merged[storeName][id]) {
        added.push({ store: storeName, id });
      } else if (JSON.stringify(merged[storeName][id]) !== JSON.stringify(incoming[id])) {
        modified.push({ store: storeName, id });
      }
      merged[storeName][id] = incoming[storeName] || incoming[id] || incoming;
    }
  }

  repo.version += 1;
  repo.data = merged;
  writeRepo(repo);

  appendChangelog({
    version: repo.version,
    timestamp: new Date().toISOString(),
    clientVersion: clientVersion || 0,
    added,
    modified,
    action: 'push'
  });

  res.json({
    version: repo.version,
    added: added.length,
    modified: modified.length,
    message: `Sync successful. ${added.length} added, ${modified.length} modified.`
  });
});

app.get('/api/sync/changes', (req, res) => {
  const repo = readRepo();
  const clientVersion = parseInt(req.query.since) || 0;
  const changelog = readChangelog();
  const changes = changelog.filter(e => e.version > clientVersion);
  res.json({
    currentVersion: repo.version,
    clientVersion,
    pendingChanges: changes.length,
    changes: changes.slice(-50)
  });
});

app.get('/api/sync/status', (req, res) => {
  const repo = readRepo();
  const changelog = readChangelog();
  const dataSize = JSON.stringify(repo.data).length;
  const storeCount = Object.keys(repo.data).length;
  let recordCount = 0;
  for (const store of Object.values(repo.data)) {
    recordCount += Object.keys(store).length;
  }
  res.json({
    version: repo.version,
    stores: storeCount,
    records: recordCount,
    dataSizeBytes: dataSize,
    totalSyncs: changelog.length,
    lastSync: changelog.length > 0 ? changelog[changelog.length - 1].timestamp : null
  });
});

app.get('/api/resolve', (req, res) => {
  const repo = readRepo();
  const humans = repo.data.humans || {};
  const others = repo.data.others || {};
  const threshold = parseFloat(req.query.threshold) || 0.6;

  const results = [];

  const names = {};
  for (const [id, h] of Object.entries(humans)) {
    if (h.name) {
      const normalized = h.name.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!names[normalized]) names[normalized] = [];
      names[normalized].push({ id, type: 'human', ...h });
    }
  }
  for (const [id, o] of Object.entries(others)) {
    if (o.name) {
      const normalized = o.name.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!names[normalized]) names[normalized] = [];
      names[normalized].push({ id, type: 'other', ...o });
    }
  }

  const allEntities = [...Object.values(humans).map(h => ({ ...h, _type: 'human' })),
                      ...Object.values(others).map(o => ({ ...o, _type: 'other' }))];

  for (let i = 0; i < allEntities.length; i++) {
    for (let j = i + 1; j < allEntities.length; j++) {
      const a = allEntities[i];
      const b = allEntities[j];
      if (!a.name || !b.name) continue;

      let score = 0;
      const reasons = [];

      const nameSim = getJaroWinkler(a.name, b.name);
      if (nameSim > 0.8) {
        score += nameSim * 40;
        reasons.push(`Name similarity: ${(nameSim * 100).toFixed(0)}%`);
      }

      if (a.birthDate && b.birthDate && a.birthDate === b.birthDate) {
        score += 20;
        reasons.push('Same birth date');
      }

      if (a.nationality && b.nationality && a.nationality === b.nationality) {
        score += 10;
        reasons.push('Same nationality');
      }

      if (a.workplace && b.workplace && a.workplace === b.workplace) {
        score += 10;
        reasons.push('Same workplace');
      }

      if (a.tags && b.tags && Array.isArray(a.tags) && Array.isArray(b.tags)) {
        const common = a.tags.filter(t => b.tags.includes(t));
        score += common.length * 5;
        if (common.length > 0) reasons.push(`Shared tags: ${common.join(', ')}`);
      }

      if (score > 0) {
        const normalizedScore = Math.min(score / 100, 1);
        if (normalizedScore >= threshold) {
          results.push({
            entity1: { id: a.id, name: a.name, type: a._type },
            entity2: { id: b.id, name: b.name, type: b._type },
            score: normalizedScore,
            reasons
          });
        }
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  res.json({ count: results.length, threshold, results: results.slice(0, 200) });
});

function getJaroWinkler(s1, s2) {
  if (s1 === s2) return 1.0;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchDist = Math.floor(Math.max(len1, len2) / 2) - 1;
  const matches1 = new Array(len1).fill(false);
  const matches2 = new Array(len2).fill(false);
  let matches = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(len2, i + matchDist + 1);
    for (let j = start; j < end; j++) {
      if (matches2[j]) continue;
      if (s1[i] !== s2[j]) continue;
      matches1[i] = true;
      matches2[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!matches1[i]) continue;
    while (!matches2[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Pazator Sync Server running on http://localhost:${PORT}`);
  console.log(`  API endpoints:`);
  console.log(`    GET  /api/sync          - Pull all data`);
  console.log(`    POST /api/sync          - Push data`);
  console.log(`    GET  /api/sync/changes  - Get changes since version`);
  console.log(`    GET  /api/sync/status   - Server status`);
  console.log(`    GET  /api/resolve       - Entity resolution`);
});
