const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3027;
const DB_PATH = '/opt/jeff-worker/data/worker.db';
const JEFF_PHONE = process.env.PHONE || '5511910075450';

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/messages', (req, res) => {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const limit = parseInt(req.query.limit) || 60;
    const rows = db.prepare(`
      SELECT id, from_me, type,
             coalesce(body, transcription, '') as content,
             transcription, transcription_status,
             datetime(timestamp, 'unixepoch', '-3 hours') as ts_brt,
             timestamp
      FROM messages
      WHERE contact_phone = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(JEFF_PHONE, limit);
    db.close();
    res.json(rows.reverse());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SSE: notifica quando chegar mensagem nova
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  let lastId = 0;
  const db = new Database(DB_PATH, { readonly: true });

  const getLastId = () => {
    try {
      return db.prepare(`SELECT max(id) as m FROM messages WHERE contact_phone = ?`).get(JEFF_PHONE)?.m || 0;
    } catch { return 0; }
  };

  lastId = getLastId();

  const interval = setInterval(() => {
    const cur = getLastId();
    if (cur > lastId) {
      lastId = cur;
      res.write(`data: refresh\n\n`);
    } else {
      res.write(`: ping\n\n`);
    }
  }, 2000);

  req.on('close', () => {
    clearInterval(interval);
    try { db.close(); } catch {}
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`jeff-wpp-mirror running on http://0.0.0.0:${PORT}`);
});
