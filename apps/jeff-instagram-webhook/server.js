const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const DB_PATH = '/opt/jeff-worker/data/worker.db';
const PORT = process.env.PORT || 3019;

const db = new Database(DB_PATH, { fileMustExist: true });
db.pragma('journal_mode = WAL');

const setting = (k) => {
  const r = db.prepare('SELECT value FROM app_settings WHERE key=?').get(k);
  return r ? r.value : null;
};

const insertEvent = db.prepare(`
  INSERT INTO ig_webhook_events
  (object, event_type, ig_user_id, sender_id, message_text, comment_id, media_id, raw_json)
  VALUES (@object, @event_type, @ig_user_id, @sender_id, @message_text, @comment_id, @media_id, @raw_json)
`);
const listEvents = db.prepare(`
  SELECT * FROM ig_webhook_events ORDER BY received_at DESC LIMIT ? OFFSET ?
`);
const countEvents = db.prepare(`SELECT COUNT(*) AS n FROM ig_webhook_events`);

const app = express();
// raw body para validação de assinatura
app.use('/webhook', express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); }
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, count: countEvents.get().n });
});

app.get('/api/events', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = parseInt(req.query.offset || '0', 10);
  const rows = listEvents.all(limit, offset).map(r => ({
    ...r,
    raw: (() => { try { return JSON.parse(r.raw_json); } catch { return null; } })()
  }));
  res.json({ ok: true, total: countEvents.get().n, items: rows });
});

// Meta verify (GET) — handshake inicial
app.get('/webhook', (req, res) => {
  const expected = setting('jeff_meta_ig_webhook_verify_token');
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === expected) {
    console.log('[ig-webhook] verify ok');
    return res.status(200).send(challenge);
  }
  console.warn(`[ig-webhook] verify FAIL mode=${mode} token_match=${token === expected}`);
  return res.status(403).send('Forbidden');
});

// Validação de assinatura X-Hub-Signature-256
// Retorna o nome do secret que casou (fb|ig) ou null
function verifySig(req) {
  if (!req.rawBody) return null;
  const got = req.header('x-hub-signature-256') || '';
  if (!got) return null;
  const secrets = {
    fb: setting('jeff_meta_app_secret_zeus'),
    ig: setting('jeff_meta_app_secret_ig'),
  };
  for (const [name, secret] of Object.entries(secrets)) {
    if (!secret) continue;
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
    try {
      if (got.length === expected.length &&
          crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
        return name;
      }
    } catch { /* continue */ }
  }
  return null;
}

app.post('/webhook', (req, res) => {
  const sigApp = verifySig(req);
  if (!sigApp) {
    console.warn('[ig-webhook] signature FAIL');
    return res.status(401).send('invalid signature');
  }
  const body = req.body || {};
  const obj = body.object || null;

  // Meta envia 'entry' como array; cada entry pode ter 'messaging' (DMs) ou 'changes' (comments/mentions)
  for (const entry of body.entry || []) {
    const igUserId = entry.id || null;

    // DMs (messaging)
    for (const msg of entry.messaging || []) {
      insertEvent.run({
        object: obj,
        event_type: 'message',
        ig_user_id: igUserId,
        sender_id: (msg.sender || {}).id || null,
        message_text: (msg.message || {}).text || null,
        comment_id: null,
        media_id: null,
        raw_json: JSON.stringify(msg)
      });
    }

    // changes (comments, mentions, etc)
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      insertEvent.run({
        object: obj,
        event_type: ch.field || 'change',
        ig_user_id: igUserId,
        sender_id: (v.from || {}).id || null,
        message_text: v.text || v.message || null,
        comment_id: v.id || v.comment_id || null,
        media_id: (v.media || {}).id || v.media_id || null,
        raw_json: JSON.stringify(ch)
      });
    }
  }

  console.log(`[ig-webhook] received object=${obj} entries=${(body.entry||[]).length} signed_by=${sigApp}`);
  // Meta exige 200 rápido (<5s) ou retenta
  res.status(200).send('OK');
});

app.listen(PORT, '0.0.0.0', () => console.log(`[instagram-webhook] listening on 0.0.0.0:${PORT}`));
