const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const multer = require('multer');
const Database = require('better-sqlite3');
const agents = require('./agents');
const skillsMod = require('./skills');
const zeusContext = require('./zeus-context');
const claudeSpawn = require('./claude-spawn');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const WORKDIR_ROOT = path.join(DATA_DIR, 'zeus-workdir');
const UPLOADS_ROOT = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'central.db');
const MAX_SESSIONS = parseInt(process.env.CHAT_MAX_SESSIONS || '50', 10);
const CLAUDE_BIN = claudeSpawn.CLAUDE_BIN;
const DOC_INLINE_CHARS = 12000; // trecho do documento que vai direto no prompt; o resto fica no .txt
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
// Conversas abertas pelo botão flutuante: context = 'assistente' (recebem o mapa da plataforma e os dados da empresa)
if (!db.prepare(`PRAGMA table_info(sessions)`).all().some(c => c.name === 'context')) {
  db.exec(`ALTER TABLE sessions ADD COLUMN context TEXT`);
}

const stmt = {
  sessList: db.prepare(`SELECT s.id, s.title, s.created_at, s.updated_at,
    (SELECT COUNT(*) FROM messages WHERE session_id = s.id) AS msg_count
    FROM sessions s WHERE s.agent_id IS ? ORDER BY s.updated_at DESC`),
  sessGet: db.prepare(`SELECT * FROM sessions WHERE id = ?`),
  sessIns: db.prepare(`INSERT INTO sessions (id, title, created_at, updated_at, agent_id, context) VALUES (?, ?, ?, ?, ?, ?)`),
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
      } else {
        // PDF, Word, PowerPoint, Excel e texto: extrai o conteúdo e guarda um .txt ao lado pro Zeus ler inteiro
        const text = await agents.extractText(f.path, f.originalname, f.mimetype);
        if (text != null) {
          item.kind = 'doc';
          const txtPath = f.path + '.txt';
          fs.writeFileSync(txtPath, text);
          item.paths.push(txtPath);
          item.excerpt = text.replace(/\s+\n/g, '\n').slice(0, DOC_INLINE_CHARS);
          item.chars = text.length;
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
    lines.push('Você é Zeus, a IA da plataforma ZEUS Central. O CLAUDE.md carregado neste diretório descreve toda a plataforma (agentes, habilidades, conhecimento, pessoas, tarefas, ferramentas): consulte-o e use as ferramentas antes de dizer que não sabe. Responda de forma direta, em PT-BR, sem rodeios. Tom amigável-profissional. Sem travessões em respostas curtas. Nunca escreva raciocínio ou frases em inglês: o usuário vê tudo; trabalhe em silêncio e entregue só a resposta.');
    lines.push("Quando a resposta tiver números (métricas, comparações, evolução no tempo, rankings), mostre-os em visual na tela em vez de só texto, usando blocos de código com JSON válido: ```zeus-kpi {\"titulo\":\"Resumo da conta · Nome\",\"periodo\":\"Últimos 30 dias\",\"itens\":[{\"rotulo\":\"Investimento\",\"valor\":\"R$ 27.740,75\",\"delta\":\"+12% vs período anterior\"}]} ``` vira um painel de indicadores (3 a 10 itens, valor já formatado, delta opcional começando com + ou -); ```zeus-grafico {\"tipo\":\"barras\",\"titulo\":\"Leads por semana\",\"periodo\":\"...\",\"unidade\":\"\",\"categorias\":[\"S1\",\"S2\"],\"series\":[{\"nome\":\"Leads\",\"valores\":[120,150]}]} ``` vira gráfico: tipo \"barras\" (comparar categorias), \"linhas\" (evolução no tempo) ou \"ranking\" (barras horizontais, ex.: campanhas por investimento); unidade \"R$\", \"%\" ou \"\"; valores numéricos puros (sem R$ ou %), até 5 séries e 30 categorias. Escreva 1 ou 2 frases de leitura antes ou depois do visual. Não use isso para um número que cabe numa frase.");
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
          if (a.kind === 'doc') return `[documento: ${a.originalname}]`;
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
      } else if (a.kind === 'doc') {
        const txt = a.paths.find(p => p.endsWith('.txt')) || a.paths[0];
        lines.push(`- Documento "${a.originalname}" (${a.mime}), ${a.chars || 0} caracteres. Texto completo em: ${txt} (use Read se precisar além do trecho). Original: ${a.paths[0]}`);
        if (a.excerpt) { lines.push(`  Conteúdo${a.chars > (a.excerpt || '').length ? ' (início)' : ''}:`); lines.push('  """'); lines.push(a.excerpt); lines.push('  """'); }
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

// ─── Leitura do stream-json do claude ─────────────────────────────────────────
// O texto que o Claude escreve antes de usar uma ferramenta é narração ("vou checar..."), não resposta.
// Só o texto do último turno (depois da última ferramenta) vira a resposta; o resto vira status na tela.
const TOOL_LABEL = { Bash: 'Executando no servidor', Read: 'Lendo arquivo', Grep: 'Procurando no sistema', Glob: 'Procurando arquivos',
  WebSearch: 'Pesquisando na web', WebFetch: 'Lendo página da web', Write: 'Escrevendo arquivo', Edit: 'Editando arquivo', Task: 'Delegando tarefa', TodoWrite: 'Organizando etapas' };
const BASH_HINTS = [[/clickup/i, 'Consultando o ClickUp'], [/asaas/i, 'Consultando o Asaas'], [/google\.sh/i, 'Consultando o Google'], [/meta-ads|tools\/growth/i, 'Consultando a Meta Ads'],
  [/instagram|zeuspost/i, 'Consultando o Instagram'], [/zapsign/i, 'Consultando o ZapSign'], [/wapi\.sh/i, 'Acessando o WhatsApp'], [/sqlite3|\.db\b/i, 'Consultando o banco de dados'],
  [/apresentacao/i, 'Gerando a apresentação'], [/pm2|docker/i, 'Verificando o servidor']];
function streamState() { return { turn: '', final: '', tools: 0, toolName: null, toolInput: '' }; }
function toolLabel(name, input) {
  if (name === 'Bash' && input) { const h = BASH_HINTS.find(([re]) => re.test(input)); if (h) return h[1]; }
  if (TOOL_LABEL[name]) return TOOL_LABEL[name];
  if (/^mcp__/.test(name || '')) return 'Consultando integração';
  return 'Usando ' + (name || 'ferramenta');
}
function onStreamJson(j, st, emit) {
  if (j.type === 'stream_event' && j.event) {
    const ev = j.event;
    if (ev.type === 'message_start') { st.turn = ''; return; }
    if (ev.type === 'content_block_start' && ev.content_block && ev.content_block.type === 'tool_use') {
      st.tools++; st.toolName = ev.content_block.name; st.toolInput = '';
      if (st.turn) { st.turn = ''; emit('reset', {}); } // o que veio antes era narração, não resposta
      emit('status', { text: toolLabel(st.toolName) });
      return;
    }
    if (ev.type === 'content_block_delta' && ev.delta) {
      if (ev.delta.type === 'input_json_delta') { st.toolInput += ev.delta.partial_json || ''; return; }
      const t = ev.delta.text;
      if (t) { st.turn += t; emit('token', { text: t }); }
      return;
    }
    if (ev.type === 'content_block_stop' && st.toolName) {
      const lbl = toolLabel(st.toolName, st.toolInput);
      if (lbl !== toolLabel(st.toolName)) emit('status', { text: lbl });
      st.toolName = null;
      return;
    }
    return;
  }
  if (j.type === 'result') {
    st.final = st.turn || (typeof j.result === 'string' ? j.result : '');
    if (!st.turn && st.final) emit('token', { text: st.final });
  }
}

// ─── Spawn Claude streaming ───────────────────────────────────────────────────
function runClaude(sid, prompt, assistantMsgId, agentCtx, opts) {
  opts = opts || {};
  const workdir = path.join(WORKDIR_ROOT, sid);
  if (!fs.existsSync(workdir)) fs.mkdirSync(workdir, { recursive: true });
  const args = ['-p', prompt, '--output-format', 'stream-json', '--include-partial-messages', '--verbose'];
  if (agentCtx) {
    // Regenerado a cada mensagem: edição no agente (prompt, habilidades, arquivos) vale na hora
    const spFile = path.join(workdir, '.agente-system.md');
    fs.writeFileSync(spFile, agentCtx.text);
    args.push('--append-system-prompt-file', spFile);
  }
  // Sempre modelo explícito: o padrão do settings.json pode apontar pra um modelo que o CLI instalado não suporta.
  // Agente do catálogo sem modelo marcado usa o padrão dos agentes (Sonnet); o Zeus principal usa CENTRAL_CHAT_MODEL.
  args.push('--model', claudeSpawn.pickModel(agentCtx && agentCtx.model, !!agentCtx));
  // Esforço explícito e MCPs desligados (ver claude-spawn.js); widget assistente roda mais leve
  args.push(...claudeSpawn.commonArgs({ light: !!opts.light }));
  const started = Date.now();
  const proc = spawn(CLAUDE_BIN, args, { cwd: workdir, stdio: ['ignore', 'pipe', 'pipe'], env: claudeSpawn.claudeEnv() });
  let buf = '';
  let errBuf = '';
  const st = streamState();
  const emit = (ev, data) => busEmit(sid, ev, Object.assign({ id: assistantMsgId }, data));

  proc.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try { onStreamJson(JSON.parse(line), st, emit); } catch (_) {}
    }
  });
  proc.stderr.on('data', d => errBuf += d.toString());
  proc.on('close', (code) => {
    let fullText = st.final || st.turn;
    if (code !== 0 && !fullText) {
      fullText = '[erro do claude] ' + (errBuf.slice(-400) || ('exit ' + code));
    }
    console.log(`[chat] resposta em ${((Date.now() - started) / 1000).toFixed(1)}s, ${st.tools} ferramenta(s), sessão ${sid}${agentCtx ? ', agente ' + agentCtx.name : ''}`);
    stmt.msgUpd.run(fullText, 'done', assistantMsgId);
    stmt.sessTouch.run(Date.now(), sid);
    busEmit(sid, 'done', { id: assistantMsgId, content: fullText });
    if (opts.onDone) opts.onDone(fullText, code);
  });
  proc.on('error', (e) => {
    stmt.msgUpd.run('[erro] ' + e.message, 'error', assistantMsgId);
    busEmit(sid, 'done', { id: assistantMsgId, content: '[erro] ' + e.message });
    if (opts.onDone) opts.onDone('[erro] ' + e.message, -1);
  });
  return proc;
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
  const context = (req.body && req.body.context === 'assistente') ? 'assistente' : null;
  stmt.sessIns.run(id, title, now, now, agentId, context);
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

// Ditado por voz: recebe o áudio gravado no navegador e devolve só o texto (Whisper via Groq)
const TRANSCRIBE_DIR = path.join(UPLOADS_ROOT, '_transcribe');
const uploadVoz = multer({
  storage: multer.diskStorage({
    destination: (_req, _f, cb) => { if (!fs.existsSync(TRANSCRIBE_DIR)) fs.mkdirSync(TRANSCRIBE_DIR, { recursive: true }); cb(null, TRANSCRIBE_DIR); },
    filename: (_req, file, cb) => cb(null, Date.now() + '_' + crypto.randomBytes(4).toString('hex') + (path.extname(file.originalname).replace(/[^.\w]/g, '').slice(0, 8) || '.webm')),
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});
router.post('/transcribe', uploadVoz.single('audio'), async (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'nenhum áudio recebido' });
  try {
    const text = (await transcribeAudio(f.path)).trim();
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    fs.rm(f.path, { force: true }, () => {});
  }
});

router.post('/sessions/:sid/send', upload.array('files', 6), async (req, res) => {
  const sid = req.params.sid;
  const sess = stmt.sessGet.get(sid);
  if (!sess) return res.status(404).json({ error: 'session not found' });
  const rawText = (req.body.text || '').toString();
  const files = req.files || [];
  if (!rawText.trim() && !files.length) return res.status(400).json({ error: 'mensagem vazia' });
  // Habilidade acionada com "/" no chat: vale só para esta mensagem
  const skill = req.body.skill ? skillsMod.find(String(req.body.skill)) : null;
  const text = skill ? `[Habilidade: ${skill.name}] ${rawText}` : rawText;

  let attachments = [];
  try {
    attachments = await processAttachments(sid, files);
  } catch (e) {
    return res.status(500).json({ error: 'falha processando anexo: ' + e.message });
  }

  const now = Date.now();
  const userMsgId = newId();
  stmt.msgIns.run(userMsgId, sid, 'user', text, JSON.stringify(attachments), 'done', now);

  if (sess.title === 'Nova conversa' && rawText.trim()) {
    stmt.sessTitle.run(rawText.trim().slice(0, 60), sid);
  }
  stmt.sessTouch.run(now, sid);

  const assistantMsgId = newId();
  stmt.msgIns.run(assistantMsgId, sid, 'zeus', '', '[]', 'pending', now + 1);

  busEmit(sid, 'user_msg', { id: userMsgId, role: 'user', content: text, attachments, created_at: now });
  busEmit(sid, 'zeus_start', { id: assistantMsgId });

  zeusContext.ensureContext(); // CLAUDE.md da plataforma em zeus-workdir/, carregado pelo claude em toda conversa
  const agentCtx = sess.agent_id ? agents.buildAgentSystemPrompt(sess.agent_id) : null;
  let prompt = buildPrompt(sid, text, attachments, agentCtx && agentCtx.name);
  // RAG: trechos da base de conhecimento da empresa relevantes pra mensagem (só entra se houver resultado)
  try {
    const kb = require('./knowledge').retrieve(rawText, { limit: 6, maxChars: 9000 });
    if (kb) prompt = kb + '\n\n' + prompt;
  } catch (e) { console.error('[chat] base de conhecimento', e.message); }
  if (sess.context === 'assistente') {
    try { prompt = require('./widget').assistantPrelude() + '\n\n' + prompt; } catch (e) { console.error('[chat] contexto do assistente', e.message); }
  }
  if (skill) {
    prompt = `=== Habilidade acionada pelo usuário nesta mensagem ===\n${skill.name}: ${skill.instruction}\n\n` + prompt;
  }
  runClaude(sid, prompt, assistantMsgId, agentCtx, { light: sess.context === 'assistente' });

  res.json({ ok: true, userId: userMsgId, assistantId: assistantMsgId });
});

router.get('/file/:sid/:name', (req, res) => {
  const p = path.join(UPLOADS_ROOT, req.params.sid, req.params.name);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p);
});

// ─── Rotinas: roda um pedido agendado como uma conversa normal (fica salva em Conversas) ──────────
// Usado por rotinas.js. Cria a sessão "Rotina: <nome>", grava a mensagem e resolve com o texto final.
const ROTINA_TIMEOUT_MS = parseInt(process.env.CENTRAL_ROTINA_TIMEOUT_MS || String(20 * 60 * 1000), 10);
function runRoutine(opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const agentId = opts.agentId && agents.getAgent(opts.agentId) ? String(opts.agentId) : null;
    const skill = opts.skillId ? skillsMod.find(String(opts.skillId)) : null;
    const rawText = String(opts.text || '').trim();
    if (!rawText) return resolve({ sid: null, text: '', error: 'rotina sem instrução' });
    const sid = newId();
    const now = Date.now();
    stmt.sessIns.run(sid, ('Rotina: ' + (opts.title || rawText)).slice(0, 60), now, now, agentId, null);
    pruneSessions(agentId);
    const text = skill ? `[Habilidade: ${skill.name}] ${rawText}` : rawText;
    const userMsgId = newId();
    stmt.msgIns.run(userMsgId, sid, 'user', text, '[]', 'done', now);
    const assistantMsgId = newId();
    stmt.msgIns.run(assistantMsgId, sid, 'zeus', '', '[]', 'pending', now + 1);

    zeusContext.ensureContext();
    const agentCtx = agentId ? agents.buildAgentSystemPrompt(agentId) : null;
    let prompt = buildPrompt(sid, text, [], agentCtx && agentCtx.name);
    try {
      const kb = require('./knowledge').retrieve(rawText, { limit: 6, maxChars: 9000 });
      if (kb) prompt = kb + '\n\n' + prompt;
    } catch (e) { console.error('[rotina] base de conhecimento', e.message); }
    if (skill) prompt = `=== Habilidade acionada nesta rotina ===\n${skill.name}: ${skill.instruction}\n\n` + prompt;
    const prelude = `=== Rotina automática "${opts.title || 'sem nome'}" ===\n`
      + 'Esta mensagem foi disparada por uma rotina agendada da ZEUS Central, sem ninguém online pra responder perguntas. '
      + 'Execute com o que tem, usando as ferramentas do servidor quando precisar de dados reais, e entregue o resultado final completo em PT-BR. '
      + 'Não faça perguntas de volta; se faltar algo, diga o que faltou no fim da resposta. '
      + (opts.entrega === 'whatsapp' ? 'O resultado será enviado por WhatsApp: escreva curto, sem tabelas, sem títulos markdown (#) e sem blocos zeus-kpi/zeus-grafico; use *negrito* do WhatsApp com moderação.'
        : opts.entrega === 'email' ? 'O resultado será enviado por e-mail em texto simples: sem tabelas e sem blocos zeus-kpi/zeus-grafico.' : '');
    prompt = prelude + '\n\n' + (opts.ferramentas ? opts.ferramentas + '\n\n' : '') + prompt;
    let done = false;
    const proc = runClaude(sid, prompt, assistantMsgId, agentCtx, {
      onDone: (out, code) => {
        if (done) return; done = true; clearTimeout(timer);
        const erro = /^\[erro/.test(out || '') || (code !== 0 && !out);
        resolve({ sid, text: out || '', error: erro ? (out || 'exit ' + code) : null });
      },
    });
    const timer = setTimeout(() => {
      if (done) return;
      try { proc.kill('SIGTERM'); } catch (_) {}
      setTimeout(() => { if (!done) { done = true; resolve({ sid, text: '', error: `tempo esgotado (${Math.round(ROTINA_TIMEOUT_MS / 60000)} min)` }); } }, 5000);
    }, ROTINA_TIMEOUT_MS);
  });
}

module.exports = { router, runRoutine, _onStreamJson: onStreamJson, _streamState: streamState };
