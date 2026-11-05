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

// Dono da conversa (e-mail de quem abriu). NULL = conversa antiga, de antes dos membros: só administradores veem.
if (!db.prepare(`PRAGMA table_info(sessions)`).all().some(c => c.name === 'user_email')) {
  db.exec(`ALTER TABLE sessions ADD COLUMN user_email TEXT`);
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_sess_user ON sessions(user_email, agent_id, updated_at)`);

const stmt = {
  sessList: db.prepare(`SELECT s.id, s.title, s.created_at, s.updated_at,
    (SELECT COUNT(*) FROM messages WHERE session_id = s.id) AS msg_count
    FROM sessions s WHERE s.agent_id IS @agent AND (s.user_email IS @email OR (@admin = 1 AND s.user_email IS NULL)) ORDER BY s.updated_at DESC`),
  sessDono: db.prepare(`UPDATE sessions SET user_email = ? WHERE id = ?`),
  sessGet: db.prepare(`SELECT * FROM sessions WHERE id = ?`),
  sessIns: db.prepare(`INSERT INTO sessions (id, title, created_at, updated_at, agent_id, context) VALUES (?, ?, ?, ?, ?, ?)`),
  sessTouch: db.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`),
  sessTitle: db.prepare(`UPDATE sessions SET title = ? WHERE id = ?`),
  sessDel: db.prepare(`DELETE FROM sessions WHERE id = ?`),
  sessCount: db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE agent_id IS ? AND user_email IS ?`),
  sessOldest: db.prepare(`SELECT id FROM sessions WHERE agent_id IS ? AND user_email IS ? ORDER BY updated_at ASC LIMIT 1`),
  msgList: db.prepare(`SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC`),
  msgIns: db.prepare(`INSERT INTO messages (id, session_id, role, content, attachments, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`),
  msgUpd: db.prepare(`UPDATE messages SET content = ?, status = ? WHERE id = ?`),
  msgDel: db.prepare(`DELETE FROM messages WHERE id = ?`),
};

const newId = () => crypto.randomBytes(9).toString('base64url');

// Hora em que a resposta do ZEUS terminou (a tela mostra "respondeu às 14:32 · levou 2 min")
try { if (!db.prepare(`PRAGMA table_info(messages)`).all().some(c => c.name === 'finished_at')) db.exec(`ALTER TABLE messages ADD COLUMN finished_at INTEGER`); }
catch (e) { console.error('[chat] coluna finished_at:', e.message); }
const msgFim = db.prepare(`UPDATE messages SET finished_at = ? WHERE id = ?`);
// 👍/👎 nas respostas (1, -1 ou NULL) e o motivo opcional do 👎
try {
  const cols = db.prepare(`PRAGMA table_info(messages)`).all().map(c => c.name);
  if (!cols.includes('feedback')) db.exec(`ALTER TABLE messages ADD COLUMN feedback INTEGER`);
  if (!cols.includes('feedback_nota')) db.exec(`ALTER TABLE messages ADD COLUMN feedback_nota TEXT`);
} catch (e) { console.error('[chat] colunas de feedback:', e.message); }
const msgFeedback = db.prepare(`UPDATE messages SET feedback = ?, feedback_nota = ? WHERE id = ? AND session_id = ? AND role = 'zeus'`);

// Resposta que estava em andamento quando o servidor reiniciou nunca termina: a tela ficava em "Pensando..." para sempre.
// Na subida do servidor (só dele, não das ferramentas de linha de comando), fecha essas respostas com um aviso.
if (require.main && /server\.js$/.test(require.main.filename || '')) {
  try {
    const n = db.prepare(`UPDATE messages SET content = ?, status = 'done' WHERE role = 'zeus' AND status = 'pending'`)
      .run('A resposta foi interrompida porque o servidor da Central reiniciou no meio do caminho. Envie a mensagem de novo.').changes;
    if (n) console.log(`[chat] ${n} resposta(s) interrompida(s) por reinício fechada(s) com aviso`);
  } catch (e) { console.error('[chat] respostas pendentes do reinício:', e.message); }
}

// Aprovação de posts propostos pelo ZEUS no chat (bloco ```zeus-aprovacao): quem agenda é o servidor, ao clicar em Aprovar
const aprovacao = require('./aprovacao');
db.exec(`CREATE TABLE IF NOT EXISTS chat_aprovacoes (message_id TEXT NOT NULL, bloco INTEGER NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pendente', post_id INTEGER, quando TEXT, conta TEXT, note TEXT, erro TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY (message_id, bloco, idx));`);
const apvStmt = {
  list: db.prepare(`SELECT * FROM chat_aprovacoes WHERE message_id = ? ORDER BY bloco, idx`),
  up: db.prepare(`INSERT INTO chat_aprovacoes (message_id, bloco, idx, status, post_id, quando, conta, note, erro, updated_at) VALUES (@message_id, @bloco, @idx, @status, @post_id, @quando, @conta, @note, @erro, @updated_at)
    ON CONFLICT(message_id, bloco, idx) DO UPDATE SET status = excluded.status, post_id = excluded.post_id, quando = excluded.quando, conta = excluded.conta, note = excluded.note, erro = excluded.erro, updated_at = excluded.updated_at`),
  msgGet: db.prepare(`SELECT * FROM messages WHERE id = ?`),
};
const aprovacoesDaMsg = m => m.role === 'zeus' && aprovacao.temBloco(m.content) ? apvStmt.list.all(m.id).map(r => ({ bloco: r.bloco, idx: r.idx, status: r.status, postId: r.post_id, quando: r.quando, conta: r.conta, nota: r.note || '', erro: r.erro || '' })) : undefined;

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
// Aba Edição de Vídeo (agente editor-video): vídeo bruto de até 2 GB. O proxy aceita 2000m; disco é o limite real.
const AGENTE_VIDEO = 'editor-video';
const uploadVideo = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 6 } });
function uploadDaSessao(req, res, next) {
  const sess = stmt.sessGet.get(req.params.sid);
  const ehVideo = sess && sess.agent_id === AGENTE_VIDEO;
  if (ehVideo && claudeSpawn.restrito(req.user)) return res.status(403).json({ error: 'A Edição de Vídeo é só para administradores (precisa do terminal do servidor).' });
  (ehVideo ? uploadVideo : upload).array('files', 6)(req, res, (err) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: ehVideo ? 'Arquivo maior que 2 GB.' : 'Arquivo maior que 60 MB. Vídeo grande vai pela aba Edição de Vídeo.' });
    next(err);
  });
}

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
async function processAttachments(sid, files, opts) {
  opts = opts || {};
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
      } else if (isVideo && opts.video) {
        // Edição de Vídeo: só lê duração e formato (vídeo de 2 GB não pode travar o envio).
        // Quadros e transcrição com tempo saem sob demanda pela tools/video (quadros, transcrever).
        item.kind = 'video';
        try {
          const r = require('child_process').spawnSync(process.env.FFPROBE_BIN || 'ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', f.path], { encoding: 'utf8', timeout: 60000 });
          const j = JSON.parse(r.stdout || '{}'), v = (j.streams || [])[0] || {}, d = +((j.format || {}).duration || 0);
          item.info = `${Math.floor(d / 60)}min${String(Math.round(d % 60)).padStart(2, '0')}s, ${v.width || '?'}x${v.height || '?'}, ${(f.size / 1048576).toFixed(0)} MB`;
        } catch (_) {}
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
const HIST_MAX = 60000, HIST_MSG_MAX = 12000;
function buildPrompt(sid, currentMsgContent, attachments, agentName, restrito) {
  const msgs = stmt.msgList.all(sid).filter(m => m.status !== 'pending');
  const lines = [];
  const BOT = agentName ? 'AGENTE' : 'ZEUS';
  if (agentName) {
    lines.push(`Você é o agente "${agentName}" (persona, habilidades e base de conhecimento definidas no system prompt). Responda como esse agente.`);
  } else {
    lines.push('Você é Zeus, a IA da plataforma ZEUS Central. O CLAUDE.md carregado neste diretório descreve toda a plataforma (agentes, habilidades, conhecimento, pessoas, tarefas, ferramentas): consulte-o e use as ferramentas antes de dizer que não sabe. Responda de forma direta, em PT-BR, sem rodeios. Tom amigável-profissional. Sem travessões em respostas curtas. Nunca escreva raciocínio ou frases em inglês: o usuário vê tudo; trabalhe em silêncio e entregue só a resposta.');
    lines.push("Quando a resposta tiver números (métricas, comparações, evolução no tempo, rankings), mostre-os em visual na tela em vez de só texto, usando blocos de código com JSON válido: ```zeus-kpi {\"titulo\":\"Resumo da conta · Nome\",\"periodo\":\"Últimos 30 dias\",\"itens\":[{\"rotulo\":\"Investimento\",\"valor\":\"R$ 27.740,75\",\"delta\":\"+12% vs período anterior\"}]} ``` vira um painel de indicadores (3 a 10 itens, valor já formatado, delta opcional começando com + ou -); ```zeus-grafico {\"tipo\":\"barras\",\"titulo\":\"Leads por semana\",\"periodo\":\"...\",\"unidade\":\"\",\"categorias\":[\"S1\",\"S2\"],\"series\":[{\"nome\":\"Leads\",\"valores\":[120,150]}]} ``` vira gráfico: tipo \"barras\" (comparar categorias), \"linhas\" (evolução no tempo) ou \"ranking\" (barras horizontais, ex.: campanhas por investimento); unidade \"R$\", \"%\" ou \"\"; valores numéricos puros (sem R$ ou %), até 5 séries e 30 categorias. Escreva 1 ou 2 frases de leitura antes ou depois do visual. Não use isso para um número que cabe numa frase.");
  }
  // Vale para o ZEUS e para todo agente: nada de bastidor técnico na resposta (detalhes no CLAUDE.md da plataforma)
  lines.push('Escreva para o cliente, não para um desenvolvedor: nada de comandos, caminhos de arquivo, portas, PM2, DNS, Cloudflare, servidor ou nomes de ferramentas internas na resposta. Fale do resultado e do próximo passo em linguagem de negócio; etapa técnica pendente vira uma frase simples pedindo liberação. Detalhe técnico só se a pessoa for administradora e pedir.');
  lines.push('');
  if (msgs.length > 1) {
    lines.push('=== Histórico da conversa ===');
    // Conversa longa (ex.: designer com centenas de artes) passava de 100 KB por mensagem: lento, caro e estourava o
    // limite do sistema. Vão as mensagens mais recentes até HIST_MAX caracteres; as antigas ficam de fora com aviso.
    const anteriores = msgs.slice(0, -1);
    let inicio = anteriores.length, soma = 0;
    while (inicio > 0) {
      const tam = Math.min((anteriores[inicio - 1].content || '').length, HIST_MSG_MAX) + 40;
      if (soma + tam > HIST_MAX && inicio < anteriores.length) break;
      soma += tam; inicio--;
    }
    if (inicio > 0) lines.push(`(${inicio} mensagem(ns) mais antiga(s) desta conversa não incluída(s) aqui para manter a resposta rápida. Se precisar de algo de lá, diga que vai procurar e peça para a pessoa repetir o trecho.)`);
    for (const m of anteriores.slice(inicio)) {
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
      if (txt.length > HIST_MSG_MAX) txt = txt.slice(0, HIST_MSG_MAX) + ' [...mensagem longa cortada]';
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
      if (restrito && a.kind === 'image') {
        lines.push(`- Imagem "${a.originalname}": enviada junto desta mensagem (veja a imagem anexada).`);
      } else if (restrito && a.kind === 'video') {
        lines.push(`- Vídeo "${a.originalname}": alguns quadros vão anexados como imagem nesta mensagem.`);
        if (a.transcript) lines.push(`  Transcrição: "${a.transcript}"`);
      } else if (restrito && a.kind === 'doc') {
        const txtPath = a.paths.find(p => p.endsWith('.txt'));
        let full = ''; try { full = txtPath ? fs.readFileSync(txtPath, 'utf8') : (a.excerpt || ''); } catch (_) { full = a.excerpt || ''; }
        const cap = full.length > MEMBRO_DOC_CHARS;
        lines.push(`- Documento "${a.originalname}" (${a.mime}), ${a.chars || full.length} caracteres${cap ? ', mostrado até ' + MEMBRO_DOC_CHARS : ''}:`);
        lines.push('  ); lines.push(full.slice(0, MEMBRO_DOC_CHARS)); lines.push(');
      } else if (restrito) {
        lines.push(`- Arquivo "${a.originalname}" (${a.mime}): formato não lido nesta conversa.`);
      } else if (a.kind === 'image') {
        lines.push(`- Imagem em: ${a.paths[0]} (use Read pra visualizar)`);
      } else if (a.kind === 'audio') {
        lines.push(`- Áudio (já transcrito): "${a.transcript || '(vazio)'}"`);
      } else if (a.kind === 'video') {
        lines.push(`- Vídeo: ${a.paths[0]}${a.info ? ' (' + a.info + ')' : ''}`);
        if (a.info) lines.push('  Ainda não foi visto nem transcrito: use a ferramenta `/opt/jeff-apps/jeff-central/tools/video` (quadros, transcrever).');
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
// A ordem importa (vale o primeiro que bater): o roteiro de uma arte costuma citar "instagram", então design vem antes.
const BASH_HINTS = [[/tools\/design\s+html/i, 'Montando a arte em HTML'], [/tools\/design\s+(criar|ajustar|refazer)[\s\S]*tools\/design\s+(criar|ajustar|refazer)/i, 'Gerando as imagens'], [/tools\/design\s+(criar|refazer)/i, 'Gerando a imagem'], [/tools\/design\s+ajustar/i, 'Ajustando a imagem'],
  [/tools\/marca\b/i, 'Lendo o Brand Kit da marca'], [/tools\/site\b/i, 'Montando a página'], [/clickup/i, 'Consultando o ClickUp'], [/asaas/i, 'Consultando o Asaas'], [/google\.sh/i, 'Consultando o Google'], [/meta-ads|tools\/growth/i, 'Consultando a Meta Ads'],
  [/instagram|zeuspost/i, 'Consultando o Instagram'], [/zapsign/i, 'Consultando o ZapSign'], [/wapi\.sh/i, 'Acessando o WhatsApp'], [/sqlite3|\.db\b/i, 'Consultando o banco de dados'],
  [/apresentacao/i, 'Gerando a apresentação'], [/pm2|docker/i, 'Verificando o servidor']];
function streamState() { return { turn: '', final: '', tools: 0, toolName: null, toolInput: '' }; }
function toolLabel(name, input) {
  if (name === 'Bash' && input) { const h = BASH_HINTS.find(([re]) => re.test(input)); if (h) return h[1]; }
  if (TOOL_LABEL[name]) return TOOL_LABEL[name];
  if (/^mcp__/.test(name || '')) return 'Consultando integração';
  return 'Usando ' + (name || 'ferramenta');
}
// Quem está trabalhando (tela Jarvis acende o cartão): agente do time pela skill/subagente, ou a fonte de dados pelo comando
const TIME_SKILL = [[/^time-(\w+)/, m => m[1]], [/^(social|nina)/, () => 'nina'], [/^sobral|^ads($|-)/, () => 'sobral'], [/^maicom/, () => 'maicom'], [/^otavio/, () => 'otavio'],
  [/^icaro|^epiphany|^li-/, () => 'icaro'], [/^(arte-por-referencia|criativo-anuncio|analise-design-post|design)/, () => 'gustavo'], [/^minisite/, () => 'eduardo'],
  [/^smith|security|owasp|secrets|dependency/, () => 'smith'], [/^(yt-|video|remotion|talles)/, () => 'talles'], [/^site-premium|^cro/, () => 'eduardo']];
const FONTE_BASH = [[/tools\/growth|meta-ads|graph\.facebook/i, 'meta'], [/instagram|zeuspost/i, 'instagram'], [/tools\/linkedin/i, 'linkedin'], [/clickup/i, 'clickup'],
  [/asaas|financeiro/i, 'financeiro'], [/google\.sh/i, 'google'], [/wapi\.sh|whatsapp|evolution/i, 'whatsapp'], [/pipeline\.sh/i, 'otavio'], [/tools\/design|tools\/estilo|tools\/marca/i, 'gustavo'],
  [/sqlite3|\.db\b|psql/i, 'dados']];
function quemTrabalha(name, input) {
  let j = {}; try { j = JSON.parse(input || '{}'); } catch (_) {}
  if (name === 'Skill' && j.skill) { const s = String(j.skill).replace(/^[\w-]+:/, ''); for (const [re, f] of TIME_SKILL) { const m = re.exec(s); if (m) return { quem: f(m), tipo: 'agente' }; } return { quem: 'skill', tipo: 'fonte' }; }
  if ((name === 'Agent' || name === 'Task') && j.subagent_type) return { quem: String(j.subagent_type).split('-')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), tipo: 'agente' };
  if (name === 'Bash') { const cmd = String(j.command || ''); const h = FONTE_BASH.find(([re]) => re.test(cmd)); const q = h ? h[1] : 'servidor'; return { quem: q, tipo: ['otavio', 'gustavo'].includes(q) ? 'agente' : 'fonte' }; }
  if (name === 'WebSearch' || name === 'WebFetch') return { quem: 'web', tipo: 'fonte' };
  if (/^mcp__/.test(name || '')) return { quem: 'integracao', tipo: 'fonte' };
  return { quem: 'servidor', tipo: 'fonte' };
}
// Jarvis: envio de WhatsApp vira ilustração na tela. Lê o comando do wapi.sh (para quem, o quê) e, quando o resultado
// da ferramenta volta, diz se saiu ou falhou. Só mostra: quem envia continua sendo o Zeus, pelo wapi.sh.
const WA_ENVIO = /wapi\.sh\s+POST\s+(\/send-message|\/messages\/private|\/agent\/speak|\/messages\/[^\s/]+\/reply|\/send-media|\/send-file)\b/;
function waNome(jid) {
  if (!jid) return null;
  const num = jid.replace(/@.*/, '').replace(/\D/g, ''), full = /@/.test(jid) ? jid : num + '@c.us';
  let w = null;
  try {
    w = new Database(process.env.WORKER_DB_PATH || '/opt/jeff-worker/data/worker.db', { readonly: true, fileMustExist: true });
    const r = w.prepare('SELECT name FROM chats WHERE jid = ? AND name IS NOT NULL AND name <> \'\'').get(full)
      || w.prepare('SELECT COALESCE(name, push_name) AS name FROM contacts WHERE (jid = ? OR number = ?) AND COALESCE(name, push_name) IS NOT NULL').get(full, num)
      || w.prepare('SELECT name FROM contact_aliases WHERE (phone = ? OR c_us = ? OR lid = ?) AND name IS NOT NULL').get(num, full, jid);
    return r && r.name ? String(r.name) : null;
  } catch (_) { return null; } finally { try { if (w) w.close(); } catch (_) {} }
}
function waEnvio(cmd) {
  const m = WA_ENVIO.exec(cmd || ''); if (!m) return null;
  const resto = cmd.slice(m.index + m[0].length);
  const q = /^\s*'((?:[^']|'\\'')*)'/.exec(resto) || /^\s*"((?:[^"\\]|\\.)*)"/.exec(resto);
  let corpo = {};
  if (q) { try { corpo = JSON.parse(q[1].replace(/'\\''/g, "'")); } catch (_) { try { corpo = JSON.parse(q[1].replace(/\\"/g, '"')); } catch (_) {} } }
  const para = String(corpo.chatId || corpo.to || ''), texto = corpo.message || corpo.body || corpo.text || corpo.caption || null;
  return { para, nome: waNome(para), grupo: /@g\.us$/.test(para), texto: texto ? String(texto).slice(0, 1500) : null, voz: m[1] === '/agent/speak', midia: /media|file/.test(m[1]) };
}
function onStreamJson(j, st, emit) {
  if (j.type === 'stream_event' && j.event) {
    const ev = j.event;
    if (ev.type === 'message_start') { st.turn = ''; return; }
    if (ev.type === 'content_block_start' && ev.content_block && ev.content_block.type === 'tool_use') {
      st.tools++; st.toolName = ev.content_block.name; st.toolId = ev.content_block.id; st.toolInput = '';
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
      try { emit('acao', Object.assign({ label: lbl }, quemTrabalha(st.toolName, st.toolInput))); } catch (_) {}
      if (st.toolName === 'Bash') {
        try { const wa = waEnvio(JSON.parse(st.toolInput || '{}').command); if (wa) { (st.wa = st.wa || {})[st.toolId] = wa; emit('entrega', Object.assign({ chave: st.toolId, tipo: 'whatsapp', estado: 'enviando', em: Date.now() }, wa)); } } catch (_) {}
      }
      st.toolName = null;
      return;
    }
    return;
  }
  if (j.type === 'user' && st.wa && j.message && Array.isArray(j.message.content)) {
    for (const c of j.message.content) {
      const wa = c && c.type === 'tool_result' && st.wa[c.tool_use_id]; if (!wa) continue;
      const txt = typeof c.content === 'string' ? c.content : JSON.stringify(c.content || '');
      const ok = !c.is_error && !/"error"|"success"\s*:\s*false|"ok"\s*:\s*false|exit code [1-9]/i.test(txt);
      emit('entrega', Object.assign({ chave: c.tool_use_id, tipo: 'whatsapp', estado: ok ? 'ok' : 'erro', em: Date.now() }, wa));
      delete st.wa[c.tool_use_id];
    }
    return;
  }
  if (j.type === 'result') {
    st.isError = !!j.is_error;
    st.final = st.turn || (typeof j.result === 'string' ? j.result : '');
    // Texto de erro (inglês) não vai pra tela ao vivo; o 'done' leva a mensagem em PT-BR
    if (!st.turn && st.final && !st.isError) emit('token', { text: st.final });
  }
}

// Anexos de membro: texto de documento entra no prompt até este limite; imagens (e quadros de vídeo) vão em base64
const MEMBRO_DOC_CHARS = 60000;
const IMG_MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
function imagensDoAnexo(attachments) {
  const out = [];
  (attachments || []).forEach(a => {
    if (a.kind === 'image') out.push(a.paths[0]);
    if (a.kind === 'video') a.paths.filter(p => p.endsWith('.jpg')).forEach(p => out.push(p));
  });
  return out;
}
function imagensDoMembro(paths) {
  return (paths || []).slice(0, 8).map(p => {
    try {
      const mime = IMG_MIME[path.extname(p).toLowerCase()];
      const buf = fs.readFileSync(p);
      if (!mime || buf.length > 4.5 * 1024 * 1024) return null;
      return { type: 'image', source: { type: 'base64', media_type: mime, data: buf.toString('base64') } };
    } catch (_) { return null; }
  }).filter(Boolean);
}

// Resposta em andamento por conversa: permite parar (botão ■) e editar a pergunta enquanto o ZEUS pensa
const emAndamento = new Map(); // sid -> { proc, assistantMsgId, parado, descartado }
function pararResposta(sid, opts) {
  const r = emAndamento.get(sid); if (!r) return null;
  r.parado = true; if (opts && opts.descartar) r.descartado = true;
  try { r.proc.kill('SIGTERM'); } catch (_) {}
  setTimeout(() => { try { if (r.proc.exitCode === null) r.proc.kill('SIGKILL'); } catch (_) {} }, 3000);
  return r;
}

// ─── Spawn Claude streaming ───────────────────────────────────────────────────
function runClaude(sid, prompt, assistantMsgId, agentCtx, opts) {
  opts = opts || {};
  const workdir = path.join(WORKDIR_ROOT, sid);
  if (!fs.existsSync(workdir)) fs.mkdirSync(workdir, { recursive: true });
  const restrito = claudeSpawn.restrito(opts.user);
  // Membro não tem Read: as imagens vão embutidas na própria mensagem (entrada stream-json), sem caminho de arquivo
  const imagens = restrito ? imagensDoMembro(opts.imagens) : [];
  // O prompt vai SEMPRE pela entrada padrão: como argumento de linha de comando, conversa longa passava do limite
  // de 128 KB por argumento do Linux (erro spawn E2BIG) e o agente nem iniciava.
  const viaStdin = true;
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--include-partial-messages', '--verbose'];
  if (agentCtx) {
    // Regenerado a cada mensagem: edição no agente (prompt, habilidades, arquivos) vale na hora
    const spFile = path.join(workdir, '.agente-system.md');
    fs.writeFileSync(spFile, agentCtx.text);
    args.push('--append-system-prompt-file', spFile);
  } else if (!restrito) {
    // Chat principal do ZEUS (sem agente), só Proprietário/Admin: atalhos do time Alpha e das referências do servidor
    const zt = path.join(__dirname, 'zeus-time.md');
    if (fs.existsSync(zt)) args.push('--append-system-prompt-file', zt);
  }
  // Sempre modelo explícito: o padrão do settings.json pode apontar pra um modelo que o CLI instalado não suporta.
  // Agente do catálogo sem modelo marcado usa o padrão dos agentes (Sonnet); o Zeus principal usa CENTRAL_CHAT_MODEL.
  args.push('--model', claudeSpawn.pickModel(agentCtx && agentCtx.model, !!agentCtx));
  // Esforço explícito e MCPs desligados (ver claude-spawn.js); widget assistente roda mais leve
  args.push(...claudeSpawn.commonArgs({ light: !!opts.light }));
  args.push(...claudeSpawn.bloqueio(opts.user));
  const started = Date.now();
  let proc;
  try { proc = spawn(CLAUDE_BIN, args, { cwd: workdir, stdio: [viaStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'], env: claudeSpawn.claudeEnv() }); }
  catch (e) {
    console.error(`[chat] não iniciou o agente (sessão ${sid}):`, e.message);
    const msg = '[erro] Não consegui iniciar a resposta. Tente de novo; se repetir, avise o administrador.';
    stmt.msgUpd.run(msg, 'error', assistantMsgId);
    const fimErr = Date.now(); try { msgFim.run(fimErr, assistantMsgId); } catch (_) {}
    busEmit(sid, 'done', { id: assistantMsgId, content: msg, finished_at: fimErr });
    if (opts.onDone) opts.onDone(msg, -1);
    return { kill() {}, exitCode: -1, on() {} };
  }
  const andamento = { proc, assistantMsgId, parado: false, descartado: false };
  emAndamento.set(sid, andamento);
  const soltar = () => { if (emAndamento.get(sid) === andamento) emAndamento.delete(sid); };
  if (viaStdin) {
    proc.stdin.on('error', () => {});
    proc.stdin.end(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: prompt }].concat(imagens) } }) + '\n');
  }
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
    soltar();
    // Pergunta editada: a resposta antiga foi apagada do banco; não grava nem avisa a tela
    if (andamento.descartado) { console.log(`[chat] resposta descartada (pergunta editada), sessão ${sid}`); if (opts.onDone) opts.onDone('', code); return; }
    let fullText = st.final || st.turn;
    // Parada pelo botão ■: guarda o que já tinha sido escrito, marcado como interrompido
    if (andamento.parado) {
      fullText = (fullText ? fullText.trim() + '\n\n' : '') + '_(resposta interrompida)_';
      code = 0;
    }
    // Erro do claude (conta, limite, queda) nunca é gravado cru: vira mensagem em PT-BR e a rotina não entrega
    let falhou = false;
    if (!andamento.parado) {
      const quebrou = st.isError || (code !== 0 && !fullText);
      const ruim = claudeSpawn.falhaClaude(quebrou ? `${fullText || ''}\n${errBuf.slice(-400)}` : fullText, quebrou);
      if (ruim) {
        console.error(`[chat] falha do claude (exit ${code}), sessão ${sid}: ${String(fullText || errBuf).trim().slice(0, 300)}`);
        fullText = ruim; falhou = true; if (code === 0) code = 1;
      }
    }
    console.log(`[chat] resposta em ${((Date.now() - started) / 1000).toFixed(1)}s, ${st.tools} ferramenta(s), sessão ${sid}${agentCtx ? ', agente ' + agentCtx.name : ''}`);
    // Blocos zeus-memoria viram memórias da pessoa e saem do texto exibido
    if (opts.user && opts.user.email && code === 0) { try { fullText = require('./memoria').extrair(opts.user.email, fullText, sid).texto; } catch (e) { console.error('[chat] memória', e.message); } }
    // Links de arte do Agente de Design conferidos no disco antes de gravar (nunca salva imagem quebrada)
    try { const r = require('./design').corrigirLinksArte(fullText); if (r.corrigidos || r.removidos) console.log(`[chat] links de arte: ${r.corrigidos} corrigido(s), ${r.removidos} indisponível(is), sessão ${sid}`); fullText = r.texto; } catch (e) { console.error('[chat] links de arte', e.message); }
    stmt.msgUpd.run(fullText, 'done', assistantMsgId);
    stmt.sessTouch.run(Date.now(), sid);
    const fimOk = Date.now(); try { msgFim.run(fimOk, assistantMsgId); } catch (_) {}
    busEmit(sid, 'done', { id: assistantMsgId, content: fullText, finished_at: fimOk });
    // Título-resumo da conversa (Haiku) depois da 1ª resposta; a tela recarrega a lista quando chega
    if (code === 0) { try { require('./titulos').agendar(sid, t => busEmit(sid, 'titulo', { title: t })); } catch (e) { console.error('[chat] título', e.message); } }
    if (opts.onDone) opts.onDone(fullText, code, falhou);
  });
  proc.on('error', (e) => {
    soltar();
    console.error(`[chat] erro no processo (sessão ${sid}):`, e.message);
    const msg = '[erro] ' + claudeSpawn.FALHA_GERAL;
    stmt.msgUpd.run(msg, 'error', assistantMsgId);
    const fimErr = Date.now(); try { msgFim.run(fimErr, assistantMsgId); } catch (_) {}
    busEmit(sid, 'done', { id: assistantMsgId, content: msg, finished_at: fimErr });
    if (opts.onDone) opts.onDone(msg, -1, true);
  });
  return proc;
}

// Limite de conversas guardadas vale por pessoa (e por agente): o histórico de um não apaga o do outro
// Preferências > "Guardar conversas por": apaga conversas paradas há mais de N dias (0 = sem limite). Roda a cada hora.
function purgarAntigas() {
  try {
    const dias = parseInt(require('./config').secao('prefs').retencaoDias, 10);
    if (!dias) return;
    const limite = Date.now() - dias * 24 * 3600 * 1000;
    const velhas = db.prepare(`SELECT id FROM sessions WHERE updated_at < ?`).all(limite);
    velhas.forEach(s => deleteSession(s.id));
    if (velhas.length) console.log(`[chat] retenção: ${velhas.length} conversa(s) com mais de ${dias} dias apagadas`);
  } catch (e) { console.error('[chat] retenção', e.message); }
}
setTimeout(purgarAntigas, 60 * 1000); setInterval(purgarAntigas, 60 * 60 * 1000);

function pruneSessions(agentId, email) {
  email = email || null;
  while (stmt.sessCount.get(agentId, email).n > MAX_SESSIONS) {
    const o = stmt.sessOldest.get(agentId, email);
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

// A conversa é de quem abriu. Administrador também abre conversas antigas (sem dono) e,
// pelo link direto, a de qualquer pessoa (auditoria); na lista, cada um vê só as suas.
function donoOk(sess, user) {
  if (!user) return true;
  if (sess.user_email) return !!user.email && sess.user_email === user.email || !!user.admin;
  return !!user.admin;
}
router.param('sid', (req, res, next, sid) => {
  const sess = stmt.sessGet.get(sid);
  if (sess && !donoOk(sess, req.user)) return res.status(403).json({ error: 'Esta conversa é de outra pessoa.' });
  next();
});

router.get('/sessions', (req, res) => {
  const agentId = req.query.agent ? String(req.query.agent) : null;
  const u = req.user || {};
  res.json({ sessions: stmt.sessList.all({ agent: agentId, email: u.email || null, admin: u.admin ? 1 : 0 }), max: MAX_SESSIONS });
});

router.post('/sessions', express.json(), (req, res) => {
  const id = newId();
  const now = Date.now();
  const title = (req.body && req.body.title) || 'Nova conversa';
  const agentId = (req.body && req.body.agent_id) ? String(req.body.agent_id) : null;
  if (agentId && !agents.getAgent(agentId)) return res.status(404).json({ error: 'agente não encontrado' });
  if (agentId && !agents.canAccess(agentId, req.user)) return res.status(403).json({ error: 'sem acesso a este agente' });
  const context = (req.body && ['assistente', 'jarvis'].includes(req.body.context)) ? req.body.context : null;
  stmt.sessIns.run(id, title, now, now, agentId, context);
  const dono = (req.user && req.user.email) || null;
  if (dono) stmt.sessDono.run(dono, id);
  pruneSessions(agentId, dono);
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
    aprovacoes: aprovacoesDaMsg(m),
  }));
  res.json({ session: sess, messages: msgs });
});

router.post('/sessions/:sid/messages/:mid/aprovacao', express.json(), async (req, res) => {
  if (!req.user || !req.user.admin) return res.status(403).json({ error: 'Só administradores aprovam publicações.' });
  const sess = stmt.sessGet.get(req.params.sid);
  const m = apvStmt.msgGet.get(req.params.mid);
  if (!sess || !m || m.session_id !== sess.id || m.role !== 'zeus' || !aprovacao.temBloco(m.content)) return res.status(404).json({ error: 'proposta não encontrada' });
  const b = req.body || {}, bloco = parseInt(b.bloco, 10) || 0, idx = parseInt(b.idx, 10);
  const blk = aprovacao.aprovacoesDe(m.content)[bloco], item = blk && blk.itens[idx];
  if (!item) return res.status(400).json({ error: 'item inválido' });
  const atual = apvStmt.list.all(m.id).find(r => r.bloco === bloco && r.idx === idx);
  if (atual && atual.status === 'aprovado') return res.status(409).json({ error: 'esse post já foi aprovado e agendado (#' + atual.post_id + ')' });
  if (db.prepare(`SELECT 1 FROM messages WHERE session_id = ? AND status = 'pending' LIMIT 1`).get(sess.id)) return res.status(409).json({ error: 'o ZEUS ainda está respondendo; decida quando ele terminar' });
  const rotulo = item.id || ('post ' + (idx + 1)), nota = String(b.nota || '').trim().slice(0, 2000);
  const grava = (status, extra) => apvStmt.up.run(Object.assign({ message_id: m.id, bloco, idx, status, post_id: null, quando: null, conta: null, note: nota || null, erro: null, updated_at: Date.now() }, extra || {}));
  const registrar = (deUsuario, doZeus) => { const t = Date.now(); stmt.msgIns.run(newId(), sess.id, 'user', deUsuario, '[]', 'done', t); stmt.msgIns.run(newId(), sess.id, 'zeus', doZeus, '[]', 'done', t + 1); stmt.sessTouch.run(t + 1, sess.id); };
  const saida = () => ({ ok: true, aprovacoes: aprovacoesDaMsg(m) });
  if (b.decisao === 'reprovar') {
    grava('reprovado');
    if (nota) dispararTurno(sess.id, sess, nota, aprovacao.pedidoDeRefazer(item, nota), [], null, req.user);
    else registrar(`Reprovei o ${rotulo}.`, 'Anotado. Esse post não vai ser agendado. Quando quiser, me diga o que mudar que eu refaço.');
    return res.json(saida());
  }
  if (b.decisao !== 'aprovar') return res.status(400).json({ error: 'decisão inválida' });
  try {
    const { quando, conta, post: r, quandoBR } = await aprovacao.agendar(blk, item, b);
    grava('aprovado', { post_id: r.id, quando, conta });
    if (!b.lote) registrar(`Aprovei o ${rotulo}.`, `Post agendado no ZEUS POST (#${r.id}) para ${quandoBR}${item.conta_nome ? ' em ' + item.conta_nome : ''}. Dá para ver e editar em Instagram › Posts › Calendário.`);
    res.json(Object.assign(saida(), { post: r }));
  } catch (e) {
    grava('erro', { erro: String(e.message || e).slice(0, 500) });
    res.status(502).json(Object.assign(saida(), { ok: false, error: 'Não consegui agendar: ' + e.message }));
  }
});

// Fim do "Aprovar todos": um resumo só na conversa (os posts foram aprovados um a um com lote: true)
router.post('/sessions/:sid/messages/:mid/aprovacao-resumo', express.json(), (req, res) => {
  if (!req.user || !req.user.admin) return res.status(403).json({ error: 'Só administradores aprovam publicações.' });
  const sess = stmt.sessGet.get(req.params.sid), m = apvStmt.msgGet.get(req.params.mid);
  if (!sess || !m || m.session_id !== sess.id || m.role !== 'zeus' || !aprovacao.temBloco(m.content)) return res.status(404).json({ error: 'proposta não encontrada' });
  const bloco = parseInt((req.body || {}).bloco, 10) || 0, blk = aprovacao.aprovacoesDe(m.content)[bloco];
  if (!blk) return res.status(400).json({ error: 'bloco inválido' });
  const r = aprovacao.resumoLote(blk, apvStmt.list.all(m.id).filter(x => x.bloco === bloco));
  const t = Date.now(); stmt.msgIns.run(newId(), sess.id, 'user', r.usuario, '[]', 'done', t); stmt.msgIns.run(newId(), sess.id, 'zeus', r.resposta, '[]', 'done', t + 1); stmt.sessTouch.run(t + 1, sess.id);
  res.json({ ok: true, aprovacoes: aprovacoesDaMsg(m) });
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

router.post('/sessions/:sid/send', uploadDaSessao, async (req, res) => {
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
    attachments = await processAttachments(sid, files, { video: sess.agent_id === AGENTE_VIDEO });
  } catch (e) {
    return res.status(500).json({ error: 'falha processando anexo: ' + e.message });
  }

  const ids = dispararTurno(sid, sess, rawText, text, attachments, skill, req.user);
  res.json({ ok: true, userId: ids.userMsgId, assistantId: ids.assistantMsgId });
});

// Grava a mensagem da pessoa, abre a resposta pendente e dispara o claude. Usado pelo /send e pela reprovação de posts.
function dispararTurno(sid, sess, rawText, text, attachments, skill, user) {
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
  const restrito = claudeSpawn.restrito(user);
  let prompt = buildPrompt(sid, text, attachments, agentCtx && agentCtx.name, restrito);
  if (restrito) prompt = 'Nesta conversa você NÃO tem terminal, arquivos do servidor nem busca de URLs (a pessoa não é administradora da conta). Não tente usar essas ferramentas: responda com o que está no contexto, na base de conhecimento, nos anexos e na pesquisa web. Se o pedido depender de dados do servidor, diga que um administrador pode fazer por ele.\n\n' + prompt;
  // RAG: trechos da base de conhecimento da empresa relevantes pra mensagem (só entra se houver resultado)
  try {
    const kb = require('./knowledge').retrieve(rawText, { limit: 6, maxChars: 9000 });
    if (kb) prompt = kb + '\n\n' + prompt;
  } catch (e) { console.error('[chat] base de conhecimento', e.message); }
  if (sess.context === 'assistente') {
    try { prompt = require('./widget').assistantPrelude() + '\n\n' + prompt; } catch (e) { console.error('[chat] contexto do assistente', e.message); }
  }
  // Jarvis (tela /jarvis): a resposta é falada em voz alta e os números viram painéis na tela
  if (sess.context === 'jarvis') {
    prompt = '[Modo voz (Jarvis): sua resposta final vai ser FALADA em voz alta. Escreva como se fala, em PT-BR, curto: no máximo 3 ou 4 frases, '
      + 'sem markdown, sem listas, sem links, sem emoji, sem caminho de arquivo. Números importantes vão num bloco zeus-kpi ou zeus-grafico (vira painel na tela) '
      + 'e na fala você diz só a leitura principal. Quando o pedido for de alguém do time (tráfego, copy, arte, social, vendas...), acione a skill dele. '
      + 'A tela do Jarvis ILUSTRA o que foi feito, além dos números. Inclua no fim da resposta o bloco que couber (JSON válido, um por entrega): '
      + 'site ou página publicada: ```zeus-site {"titulo":"Nome","url":"https://...","descricao":"o que é, 1 frase"}``` (só depois de publicar e verificar); '
      + 'arte, imagem ou carrossel criado: ```zeus-imagens {"titulo":"Carrossel X","imagens":[{"url":"/api/design/arquivo/...","legenda":"Capa"}]}``` (endereços /api/design/arquivo/... ou /api/chat/file/...); '
      + 'ação feita fora (e-mail, agenda, tarefa, post, cobrança, contrato, anúncio): ```zeus-feito {"tipo":"email|agenda|tarefa|post|cobranca|contrato|anuncio|outro","titulo":"E-mail enviado para Fulano","detalhes":[{"rotulo":"Assunto","valor":"..."}],"link":"https://... (opcional)"}```; '
      + 'briefing que ainda está sendo montado com a pessoa: ```zeus-quadro {"titulo":"Campanha X","agente":"nina","campos":[{"rotulo":"Objetivo","valor":"..."},{"rotulo":"Prazo","valor":""}]}``` (valor vazio = falta). '
      + 'Mensagem de WhatsApp enviada pelo wapi.sh aparece sozinha na tela, não precisa de bloco. Nunca invente bloco de algo que não aconteceu.]\n\n' + prompt;
  }
  if (skill) {
    prompt = `=== Habilidade acionada pelo usuário nesta mensagem ===\n${skill.name}: ${skill.instruction}\n\n` + prompt;
  }
  // Quem está falando (a central tem vários membros): o ZEUS trata pelo nome e respeita o papel
  if (user && user.name) {
    const papel = { owner: 'Proprietário', admin: 'Administrador', gestor: 'Gestor', membro: 'Membro' }[user.role] || 'Membro';
    prompt = `[Pessoa nesta conversa: ${user.name}${user.email ? ' <' + user.email + '>' : ''} · papel: ${papel}]\n\n` + prompt;
    // Memória da pessoa (tela /memoria): entra no prompt e o ZEUS pode guardar fatos novos num bloco zeus-memoria
    if (user.email && sess.context !== 'assistente') { try { prompt = require('./memoria').paraPrompt(user.email) + '\n\n' + prompt; } catch (e) { console.error('[chat] memória', e.message); } }
  }
  runClaude(sid, prompt, assistantMsgId, agentCtx, { light: sess.context === 'assistente', user: user, imagens: imagensDoAnexo(attachments) });
  return { userMsgId, assistantMsgId };
}


// 👍/👎 numa resposta: valor 1, -1 ou 0 (tira a avaliação); nota = motivo opcional do 👎
router.post('/sessions/:sid/messages/:mid/feedback', express.json(), (req, res) => {
  const v = Number(req.body && req.body.valor);
  const valor = v === 1 ? 1 : v === -1 ? -1 : null;
  const nota = valor === -1 && req.body.nota ? String(req.body.nota).slice(0, 2000) : null;
  const r = msgFeedback.run(valor, nota, req.params.mid, req.params.sid);
  if (!r.changes) return res.status(404).json({ error: 'resposta não encontrada' });
  if (valor) console.log(`[chat] avaliação ${valor === 1 ? '👍' : '👎'} na sessão ${req.params.sid}${nota ? ': ' + nota.slice(0, 120) : ''}`);
  res.json({ ok: true, feedback: valor });
});

// Botão ■ Parar: encerra a resposta em andamento (o que já foi escrito fica, marcado como interrompido)
router.post('/sessions/:sid/stop', (req, res) => {
  const r = pararResposta(req.params.sid);
  if (!r) {
    // Nada rodando neste processo (ex.: servidor reiniciou): fecha qualquer resposta pendente que tenha ficado
    const pend = stmt.msgList.all(req.params.sid).filter(m => m.role === 'zeus' && m.status === 'pending');
    pend.forEach(m => { stmt.msgUpd.run((m.content ? m.content.trim() + '\n\n' : '') + '_(resposta interrompida)_', 'done', m.id); busEmit(req.params.sid, 'done', { id: m.id, content: (m.content ? m.content.trim() + '\n\n' : '') + '_(resposta interrompida)_', finished_at: Date.now() }); });
    return res.json({ ok: true, parado: pend.length > 0 });
  }
  console.log(`[chat] resposta parada pelo usuário, sessão ${req.params.sid}`);
  res.json({ ok: true, parado: true });
});

// Editar uma pergunta já enviada: para a resposta em andamento, apaga essa pergunta e tudo que veio depois
// (some do histórico que o ZEUS lê) e envia o texto corrigido, mantendo os anexos da mensagem original
router.post('/sessions/:sid/messages/:mid/edit', express.json(), (req, res) => {
  const sid = req.params.sid;
  const sess = stmt.sessGet.get(sid);
  if (!sess) return res.status(404).json({ error: 'session not found' });
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ error: 'mensagem vazia' });
  const msgs = stmt.msgList.all(sid);
  const i = msgs.findIndex(m => m.id === req.params.mid);
  if (i < 0 || msgs[i].role !== 'user') return res.status(404).json({ error: 'mensagem não encontrada' });
  pararResposta(sid, { descartar: true });
  let attachments = [];
  try { attachments = JSON.parse(msgs[i].attachments || '[]'); } catch (_) {}
  msgs.slice(i).forEach(m => stmt.msgDel.run(m.id));
  console.log(`[chat] pergunta editada, ${msgs.length - i} mensagem(ns) substituída(s), sessão ${sid}`);
  const ids = dispararTurno(sid, sess, text, text, attachments, null, req.user);
  res.json({ ok: true, userId: ids.userMsgId, assistantId: ids.assistantMsgId });
});

router.get('/file/:sid/:name', (req, res) => {
  if (!stmt.sessGet.get(req.params.sid)) return res.status(404).end();
  const p = path.join(UPLOADS_ROOT, req.params.sid, path.basename(req.params.name));
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
    if (opts.userEmail) stmt.sessDono.run(opts.userEmail, sid); // fica nas Conversas de quem criou a rotina
    pruneSessions(agentId, opts.userEmail || null);
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
      user: opts.user || null,
      onDone: (out, code, falhou) => {
        if (done) return; done = true; clearTimeout(timer);
        const erro = falhou || /^\[erro/.test(out || '') || (code !== 0 && !out);
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

module.exports = { router, runRoutine, transcribeAudio, _onStreamJson: onStreamJson, _streamState: streamState };
