const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');

const DB_PATH = '/opt/jeff-worker/data/worker.db';
const PORT = process.env.PORT || 3015;

const db = new Database(DB_PATH, { fileMustExist: true });
db.pragma('journal_mode = WAL');

const getSetting = db.prepare(`SELECT value FROM app_settings WHERE key=?`);
const insertEvent = db.prepare(`
  INSERT INTO clickup_events (task_id, event_type, event_payload)
  VALUES (?, ?, ?)
`);

const app = express();
// guarda raw body pra HMAC
app.use(express.json({
  limit: '5mb',
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));

function verifySignature(req) {
  const row = getSetting.get('clickup_webhook_secret');
  const secret = row && row.value;
  if (!secret) return true; // se não configurado, aceita (modo dev)
  const sig = req.get('x-signature');
  if (!sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex');
  // signature do ClickUp vem como hex puro (não "sha256=...")
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch { return false; }
}

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'jeff-clickup-webhook', port: PORT });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/webhook', (req, res) => {
  if (!verifySignature(req)) {
    console.warn('[clickup-webhook] invalid signature');
    return res.status(401).json({ error: 'invalid_signature' });
  }
  const body = req.body || {};
  const event = body.event || 'unknown';
  const taskId = body.task_id || (body.history_items && body.history_items[0] && body.history_items[0].parent_id) || null;
  try {
    insertEvent.run(taskId, event, JSON.stringify(body));
    console.log(`[clickup-webhook] ${event} task=${taskId}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('[clickup-webhook] insert error', e.message);
    res.status(500).json({ error: 'db_error' });
  }
});

app.listen(PORT, () => console.log(`jeff-clickup-webhook listening on ${PORT}`));
