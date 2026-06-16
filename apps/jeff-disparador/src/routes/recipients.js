'use strict';
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../db');
const { requireAuth } = require('../auth');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) return cb(null, true);
    cb(new Error('only CSV files allowed'));
  },
});

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

function parseCSV(content) {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  const phoneIdx = headers.findIndex(h => h === 'phone' || h === 'telefone' || h === 'numero');
  const nameIdx = headers.findIndex(h => h === 'name' || h === 'nome');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (!cols[phoneIdx]) continue;

    const phone = cols[phoneIdx].replace(/\D/g, '');
    if (phone.length < 10) continue;

    const name = nameIdx >= 0 ? cols[nameIdx] : null;
    const vars = {};
    headers.forEach((h, j) => {
      if (j !== phoneIdx && j !== nameIdx && cols[j]) vars[h] = cols[j];
    });

    rows.push({ phone, name, vars: Object.keys(vars).length ? JSON.stringify(vars) : null });
  }
  return rows;
}

router.post('/upload', upload.single('file'), (req, res) => {
  const campaignId = parseInt(req.params.id, 10);
  const campaign = db.prepare('SELECT status FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) return res.status(404).json({ error: 'campaign not found' });
  if (campaign.status === 'running') return res.status(409).json({ error: 'campaign is running' });

  if (!req.file) return res.status(400).json({ error: 'no file uploaded' });

  let content;
  try {
    content = fs.readFileSync(req.file.path, 'utf8');
    fs.unlinkSync(req.file.path);
  } catch (e) {
    return res.status(500).json({ error: 'failed to read file' });
  }

  const rows = parseCSV(content);
  if (!rows.length) return res.status(400).json({ error: 'no valid rows found in CSV' });

  const { replace } = req.query;
  const insert = db.prepare(
    'INSERT OR IGNORE INTO recipients (campaign_id, phone, name, vars, status) VALUES (?, ?, ?, ?, ?)'
  );

  db.transaction(() => {
    if (replace === '1') db.prepare('DELETE FROM recipients WHERE campaign_id = ?').run(campaignId);
    for (const row of rows) insert.run(campaignId, row.phone, row.name, row.vars, 'pending');
    const total = db.prepare('SELECT COUNT(*) AS n FROM recipients WHERE campaign_id = ?').get(campaignId).n;
    db.prepare('UPDATE campaigns SET total = ?, status = ? WHERE id = ?').run(total, 'ready', campaignId);
  })();

  const total = db.prepare('SELECT COUNT(*) AS n FROM recipients WHERE campaign_id = ?').get(campaignId).n;
  res.json({ ok: true, imported: rows.length, total });
});

router.get('/', (req, res) => {
  const campaignId = parseInt(req.params.id, 10);
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
  const offset = parseInt(req.query.offset || '0', 10);
  const status = req.query.status;

  let query = 'SELECT * FROM recipients WHERE campaign_id = ?';
  const params = [campaignId];
  if (status) { query += ' AND status = ?'; params.push(status); }
  query += ' ORDER BY id LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) AS n FROM recipients WHERE campaign_id = ?').get(campaignId).n;
  res.json({ recipients: rows, total });
});

router.delete('/', (req, res) => {
  const campaignId = parseInt(req.params.id, 10);
  const campaign = db.prepare('SELECT status FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) return res.status(404).json({ error: 'not found' });
  if (campaign.status === 'running') return res.status(409).json({ error: 'campaign is running' });
  db.prepare('DELETE FROM recipients WHERE campaign_id = ?').run(campaignId);
  db.prepare("UPDATE campaigns SET total = 0, sent = 0, failed = 0, status = 'draft' WHERE id = ?").run(campaignId);
  res.json({ ok: true });
});

module.exports = router;
