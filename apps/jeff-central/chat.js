const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const multer = require('multer');
const Database = require('better-sqlite3');
const agents = require('./agents');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const WORKDIR_ROOT = path.join(DATA_DIR, 'zeus-workdir');
const UPLOADS_ROOT = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'central.db');
const MAX_SESSIONS = parseInt(process.env.CHAT_MAX_SESSIONS || '50', 10);
const CLAUDE_BIN = process.env.CLAUDE_BIN || '/root/.nvm/versions/node/v20.20.2/bin/claude';
const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';

[DATA_DIR, WORKDIR_ROOT, UPLOADS_ROOT].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT,
  attachments TEXT,
  status TEXT DEFAULT 'done',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_msg_session ON messages(session_id, created_at);
`);
// Conversas de agente: agent_id preenchido. Conversas com o Zeus geral: agent_id NULL.
if (!db.prepare(`PRAGMA table_info(sessions)`).all().some(c => c.name === 'agent_id')) {
  db.exec(`ALTER TABLE sessions ADD COLUMN agent_id TEXT`);
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_sess_agent ON sessions(agent_id, updated_at)`);

const stmt = {
  sessList: db.prepare(`SELECT s.id, s.title, s.created_at, s.updated_at,
    (SELECT COUNT(*) FROM messages WHERE session_id = s.id) AS msg_count
    FROM sessions s WHERE s.agent_id IS ? ORDER BY s.updated_at DESC`),
  sessGet: db.prepare(`SELECT * FROM sessions WHERE id = ?`),
  sessIns: db.prepare(`INSERT INTO sessions (id, title, created_at, updated_at, agent_id) VALUES (?, ?, ?, ?, ?)`),
  sessTouch: db.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`),
  sessTitle: db.prepare(`UPDATE sessions SET title = ? WHERE id = ?`),
  sessDel: db.prepare(`DELETE FROM sessions WHERE id = ?`),
  sessCount: db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE agent_id IS ?`),
  sessOldest: db.prepare(`SELECT id FROM sessions WHERE agent_id IS ? ORDER BY updated_at ASC LIMIT 1`),
  msgList: db.prepare(`SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC`),
  msgIns: db.prepare(`INSERT INTO messages (id, session_id, role, content, attachments, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`),
  msgUpd: db.prepare(`UPDATE messages SET content = ?, status = ? WHERE id = ?`),
  msgDel: db.prepare(`DELETE FROM messages WHERE id = ?`),
};

const newId = () => crypto.randomBytes(9).toString('base64url');

// ─── SSE bus ──────────────────────────────────────────────────────────────────
const buses = new Map(); // sessionId -> Set<res>
function busAdd(sid, res) {
  if (!buses.has(sid)) buses.set(sid, new Set());
  buses.get(sid).add(res);
}
function busDel(sid, res) {
  const b = buses.get(sid);
  if (b) { b.delete(res); if (!b.size) buses.delete(sid); }
}
function busEmit(sid, ev, data) {
  const b = buses.get(sid);
  if (!b) return;
  const payload = `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const r of b) { try { r.write(payload); } catch (_) {} }
}

// ─── Multer upload ────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const sid = req.params.sid;
    const dir = path.join(UPLOADS_ROOT, sid);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 12).replace(/[^.\w]/g, '') || '';
    cb(null, Date.now() + '_' + crypto.randomBytes(4).toString('hex') + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 60 * 1024 * 1024, files: 6 } });

// ─── Helpers de mídia ─────────────────────────────────────────────────────────
function getGroqKey() {
  try {
    const wdb = new Database(process.env.WORKER_DB_PATH || '/opt/jeff-worker/data/worker.db', { readonly: true, fileMustExist: true });
    const row = wdb.prepare(`SELECT value FROM app_settings WHERE key='groq_api_key'`).get();
    wdb.close();
    if (row && row.value) return row.value;
  } catch (_) {}
  try {
    const envPath = process.env.WORKER_ENV_PATH || '/opt/jeff-worker/.env';
    const txt = fs.readFileSync(envPath, 'utf8');
    const m = txt.match(/^\s*GROQ_API_KEY\s*=\s*(.+?)\s*$/m);
    if (m) return m[1].replace(/^['"]|['"]$/g, '');
  } catch (_) {}
  return null;
}

async function ffmpegRun(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => err += d.toString());
    p.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg: ' + err.slice(-300))));
  });
}

async function extractAudioFromVideo(srcPath) {
  const out = srcPath.replace(/\.[^.]+$/, '') + '.audio.m4a';
  await ffmpegRun(['-y', '-i', srcPath, '-vn', '-acodec', 'aac', '-b:a', '64k', out]);
  return out;
}

async function extractFrames(srcPath, count = 4) {
  const dir = srcPath + '.frames';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await ffmpegRun(['-y', '-i', srcPath, '-vf', `fps=1/3,scale=720:-1`, '-frames:v', String(count), path.join(dir, 'frame_%02d.jpg')]);
  return fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).map(f => path.join(dir, f));
}

async function transcribeAudio(audioPath) {
  const key = getGroqKey();
  if (!key) throw new Error('groq_api_key não configurada em Chaves — necessária para transcrever áudio');
  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', fs.createReadStream(audioPath));
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'json');
  form.append('language', 'pt');
  const headers = form.getHeaders();
  headers['Authorization'] = 'Bearer ' + key;
  const https = require('https');
  return new Promise((resolve, reject) => {
    const req = https.request({
      method: 'POST',
      hostname: 'api.groq.com',
      path: '/openai/v1/audio/transcriptions',
      headers,
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          if (res.statusCode >= 300) return reject(new Error('groq: ' + (j.error?.message || body.slice(0, 200))));
          resolve(j.text || '');
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    form.pipe(req);
  });
}

// ─── Processamento de anexos ──────────────────────────────────────────────────
async function processAttachments(sid, files) {
  const out = [];
  for (const f of files) {
    const item = {
      filename: f.filename,
      originalname: f.originalname,
      mime: f.mimetype,
      size: f.size,
      kind: 'file',
      paths: [f.path],
      transcript: null,
    };
    const isImage = f.mimetype && f.mimetype.startsWith('image/');
    const isAudio = f.mimetype && f.mimetype.startsWith('audio/');
    const isVideo = f.mimetype && f.mimetype.startsWith('video/');
    try {
      if (isImage) {
        item.kind = 'image';
      } else if (isAudio) {
        item.kind = 'audio';
        item.transcript = await transcribeAudio(f.path);
      } else if (isVideo) {
        item.kind = 'video';
        const framePaths = await extractFrames(f.path, 4).catch(() => []);
        item.paths.push(...framePaths);
        const audioPath = await extractAudioFromVideo(f.path).catch(() => null);
        if (audioPath) {
          item.paths.push(audioPath);
          item.transcript = await transcribeAudio(audioPath).catch((e) => '[falha ao transcrever: ' + e.message + ']');
        }
      }
    } catch (e) {
      item.error = e.message;
    }
    out.push(item);
  }
  return out;
}

// ─── Monta prompt pro Claude ──────────────────────────────────────────────────
function buildPrompt(sid, currentMsgContent, attachments, agentName) {
  const msgs = stmt.msgList.all(sid).filter(m => m.status !== 'pending');
  const lines = [];
  const BOT = agentName ? 'AGENTE' : 'ZEUS';
  if (agentName) {
    lines.push(`Você é o agente "${agentName}" (persona, habilidades e base de conhecimento definidas no system prompt). Responda como esse agente.`);
  } else {
    lines.push('Você é Zeus, assistente do Jefferson Henrike. Responda de forma direta, em PT-BR, sem rodeios. Tom amigável-profissional. Sem travessões em respostas curtas.');
  }
  lines.push('');
  if (msgs.length > 1) {
    lines.push('=== Histórico da conversa ===');
    for (const m of msgs.slice(0, -1)) {
      const who = m.role === 'user' ? 'JEFF' : BOT;
      let txt = m.content || '';
      const att = m.attachments ? JSON.parse(m.attachments) : [];
      if (att.length) {
        const desc = att.map(a => {
          if (a.kind === 'image') return `[imagem: ${a.originalname}]`;
          if (a.kind === 'audio') return `[áudio: "${(a.transcript || '').slice(0, 200)}"]`;
          if (a.kind === 'video') return `[vídeo: "${(a.transcript || '').slice(0, 200)}"]`;
          return `[arquivo: ${a.originalname}]`;
        }).join(' ');
        txt = (txt + ' ' + desc).trim();
      }
      lines.push(`${who}: ${txt}`);
    }
    lines.push('=== Fim do histórico ===');
    lines.push('');
  }
  lines.push('=== Nova mensagem do Jeff ===');
  lines.push(currentMsgContent || '(sem texto)');
  if (attachments && attachments.length) {
    lines.push('');
    lines.push('Anexos:');
    for (const a of attachments) {
      if (a.kind === 'image') {
        lines.push(`- Imagem em: ${a.paths[0]} (use Read pra visualizar)`);
      } else if (a.kind === 'audio') {
        lines.push(`- Áudio (já transcrito): "${a.transcript || '(vazio)'}"`);
      } else if (a.kind === 'video') {
        lines.push(`- Vídeo: ${a.paths[0]}`);
        if (a.transcript) lines.push(`  Transcrição: "${a.transcript}"`);
        const frames = a.paths.filter(p => p.endsWith('.jpg'));
        if (frames.length) {
          lines.push(`  Frames extraídos (use Read pra ver):`);
          frames.forEach(p => lines.push(`    - ${p}`));
        }
      } else {
        lines.push(`- Arquivo: ${a.paths[0]} (${a.mime})`);
      }
      if (a.error) lines.push(`  [erro no processamento: ${a.error}]`);
    }
  }
  lines.push('');
  lines.push('Responda agora:');
  return lines.join('\n');
}

// ─── Spawn Claude streaming ───────────────────────────────────────────────────
function runClaude(sid, prompt, assistantMsgId, agentCtx) {
  const workdir = path.join(WORKDIR_ROOT, sid);
  if (!fs.existsSync(workdir)) fs.mkdirSync(workdir, { recursive: true });
  const args = ['-p', prompt, '--output-format', 'stream-json', '--include-partial-messages', '--verbose'];
  if (agentCtx) {
    // Regenerado a cada mensagem: edição no agente (prompt, habilidades, arquivos) vale na hora
    const spFile = path.join(workdir, '.agente-system.md');
    fs.writeFileSync(spFile, agentCtx.text);
    args.push('--append-system-prompt-file', spFile);
    if (agentCtx.model) args.push('--model', agentCtx.model);
  }
  const proc = spawn(CLAUDE_BIN, args, { cwd: workdir, stdio: ['ignore', 'pipe', 'pipe'] });
  let buf = '';
  let fullText = '';
  let errBuf = '';

  proc.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const j = JSON.parse(line);
        if (j.type === 'stream_event' && j.event && j.event.type === 'content_block_delta') {
          const t = j.event.delta && j.event.delta.text;
          if (t) {
            fullText += t;
            busEmit(sid, 'token', { id: assistantMsgId, text: t });
          }
        } else if (j.type === 'result') {
          if (typeof j.result === 'string' && j.result && !fullText) {
            fullText = j.result;
            busEmit(sid, 'token', { id: assistantMsgId, text: j.result });
          }
        }
      } catch (_) {}
    }
  });
  proc.stderr.on('data', d => errBuf += d.toString());
  proc.on('close', (code) => {
    if (code !== 0 && !fullText) {
      fullText = '[erro do claude] ' + (errBuf.slice(-400) || ('exit ' + code));
    }
    stmt.msgUpd.run(fullText, 'done', assistantMsgId);
    stmt.sessTouch.run(Date.now(), sid);
    busEmit(sid, 'done', { id: assistantMsgId, content: fullText });
  });
  proc.on('error', (e) => {
    stmt.msgUpd.run('[erro] ' + e.message, 'error', assistantMsgId);
    busEmit(sid, 'done', { id: assistantMsgId, content: '[erro] ' + e.message });
  });
}

function pruneSessions(agentId) {
  while (stmt.sessCount.get(agentId).n > MAX_SESSIONS) {
    const o = stmt.sessOldest.get(agentId);
    if (!o) break;
    deleteSession(o.id);
  }
}

function deleteSession(sid) {
  stmt.sessDel.run(sid);
  for (const root of [path.join(UPLOADS_ROOT, sid), path.join(WORKDIR_ROOT, sid)]) {
    if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────
const router = express.Router();

router.get('/sessions', (req, res) => {
  const agentId = req.query.agent ? String(req.query.agent) : null;
  res.json({ sessions: stmt.sessList.all(agentId), max: MAX_SESSIONS });
});

router.post('/sessions', express.json(), (req, res) => {
  const id = newId();
  const now = Date.now();
  const title = (req.body && req.body.title) || 'Nova conversa';
  const agentId = (req.body && req.body.agent_id) ? String(req.body.agent_id) : null;
  if (agentId && !agents.getAgent(agentId)) return res.status(404).json({ error: 'agente não encontrado' });
  stmt.sessIns.run(id, title, now, now, agentId);
  pruneSessions(agentId);
  res.json({ id, title, agent_id: agentId });
});

router.delete('/sessions/:sid', (req, res) => {
  deleteSession(req.params.sid);
  res.json({ ok: true });
});

router.get('/sessions/:sid/messages', (req, res) => {
  const sess = stmt.sessGet.get(req.params.sid);
  if (!sess) return res.status(404).json({ error: 'session not found' });
  const msgs = stmt.msgList.all(req.params.sid).map(m => ({
    ...m,
    attachments: m.attachments ? JSON.parse(m.attachments) : [],
  }));
  res.json({ session: sess, messages: msgs });
});

router.get('/sessions/:sid/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(': hello\n\n');
  busAdd(req.params.sid, res);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, 25000);
  req.on('close', () => { clearInterval(ping); busDel(req.params.sid, res); });
});

router.post('/sessions/:sid/send', upload.array('files', 6), async (req, res) => {
  const sid = req.params.sid;
  const sess = stmt.sessGet.get(sid);
  if (!sess) return res.status(404).json({ error: 'session not found' });
  const text = (req.body.text || '').toString();
  const files = req.files || [];
  if (!text.trim() && !files.length) return res.status(400).json({ error: 'mensagem vazia' });

  let attachments = [];
  try {
    attachments = await processAttachments(sid, files);
  } catch (e) {
    return res.status(500).json({ error: 'falha processando anexo: ' + e.message });
  }

  const now = Date.now();
  const userMsgId = newId();
  stmt.msgIns.run(userMsgId, sid, 'user', text, JSON.stringify(attachments), 'done', now);

  if (sess.title === 'Nova conversa' && text.trim()) {
    stmt.sessTitle.run(text.trim().slice(0, 60), sid);
  }
  stmt.sessTouch.run(now, sid);

  const assistantMsgId = newId();
  stmt.msgIns.run(assistantMsgId, sid, 'zeus', '', '[]', 'pending', now + 1);

  busEmit(sid, 'user_msg', { id: userMsgId, role: 'user', content: text, attachments, created_at: now });
  busEmit(sid, 'zeus_start', { id: assistantMsgId });

  const agentCtx = sess.agent_id ? agents.buildAgentSystemPrompt(sess.agent_id) : null;
  const prompt = buildPrompt(sid, text, attachments, agentCtx && agentCtx.name);
  runClaude(sid, prompt, assistantMsgId, agentCtx);

  res.json({ ok: true, userId: userMsgId, assistantId: assistantMsgId });
});

router.get('/file/:sid/:name', (req, res) => {
  const p = path.join(UPLOADS_ROOT, req.params.sid, req.params.name);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p);
});

module.exports = { router };
