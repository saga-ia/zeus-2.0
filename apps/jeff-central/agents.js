const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const multer = require('multer');
const Database = require('better-sqlite3');
const { SKILLS, ZEUS_AGENTS, CATEGORY_LABEL, GENERAL_RULES, LEGAL_WARN, zeusPrompt } = require('./agents-seed');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const AGENTS_ROOT = path.join(DATA_DIR, 'agents');
const DB_PATH = path.join(DATA_DIR, 'central.db');
// Quanto do texto dos arquivos de conhecimento vai direto no system prompt; o resto o agente lê sob demanda
const KNOWLEDGE_INLINE_CHARS = parseInt(process.env.AGENT_KNOWLEDGE_INLINE_CHARS || '60000', 10);
const MODELS = ['', 'opus', 'sonnet', 'haiku'];

if (!fs.existsSync(AGENTS_ROOT)) fs.mkdirSync(AGENTS_ROOT, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  kind TEXT NOT NULL DEFAULT 'custom',
  description TEXT,
  prompt TEXT,
  icebreakers TEXT,
  skills TEXT,
  warn TEXT,
  model TEXT,
  in_workspace INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_files (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  originalname TEXT,
  mime TEXT,
  size INTEGER,
  chars INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_files ON agent_files(agent_id, created_at);
`);

// ─── Seed dos Agentes ZEUS ────────────────────────────────────────────────────
(function seed() {
  const ins = db.prepare(`INSERT OR IGNORE INTO agents
    (id, name, category, kind, description, prompt, icebreakers, skills, warn, model, in_workspace, sort, created_at, updated_at)
    VALUES (?, ?, ?, 'zeus', ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`);
  const now = Date.now();
  db.transaction(() => {
    ZEUS_AGENTS.forEach((a, i) => {
      const [id, cat, name, desc, inWs, , ice, skills] = a;
      ins.run(id, name, cat, desc, zeusPrompt(a), JSON.stringify(ice), JSON.stringify(skills),
        cat === 'AJF' ? LEGAL_WARN : null, inWs ? 1 : 0, i, now, now);
    });
  })();
})();

const stmt = {
  list: db.prepare(`SELECT a.*, (SELECT COUNT(*) FROM agent_files f WHERE f.agent_id = a.id) AS file_count
    FROM agents a ORDER BY a.kind = 'zeus', a.sort, a.created_at DESC`),
  get: db.prepare(`SELECT * FROM agents WHERE id = ?`),
  ins: db.prepare(`INSERT INTO agents (id, name, category, kind, description, prompt, icebreakers, skills, warn, model, in_workspace, sort, created_at, updated_at)
    VALUES (@id, @name, @category, 'custom', @description, @prompt, @icebreakers, @skills, NULL, @model, 1, 0, @now, @now)`),
  del: db.prepare(`DELETE FROM agents WHERE id = ?`),
  ws: db.prepare(`UPDATE agents SET in_workspace = ?, updated_at = ? WHERE id = ?`),
  files: db.prepare(`SELECT * FROM agent_files WHERE agent_id = ? ORDER BY created_at ASC`),
  fileGet: db.prepare(`SELECT * FROM agent_files WHERE id = ? AND agent_id = ?`),
  fileIns: db.prepare(`INSERT INTO agent_files (id, agent_id, filename, originalname, mime, size, chars, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
  fileDel: db.prepare(`DELETE FROM agent_files WHERE id = ?`),
  filesDelAll: db.prepare(`DELETE FROM agent_files WHERE agent_id = ?`),
};

const newId = () => crypto.randomBytes(6).toString('base64url');
const parseJSON = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'agente';

function shape(a) {
  if (!a) return null;
  return {
    id: a.id,
    name: a.name,
    category: a.category || 'Geral',
    categoryLabel: CATEGORY_LABEL[a.category] || a.category || 'Geral',
    kind: a.kind,
    kindLabel: a.kind === 'zeus' ? (a.id === 'consultor-zeus' ? 'Consultor ZEUS' : 'Agente ZEUS') : 'Meu agente',
    description: a.description || '',
    prompt: a.prompt || '',
    icebreakers: parseJSON(a.icebreakers, []),
    skills: parseJSON(a.skills, []),
    warn: a.warn || null,
    model: a.model || '',
    inWorkspace: !!a.in_workspace,
    fileCount: a.file_count || 0,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

function agentDir(id) { return path.join(AGENTS_ROOT, id); }
function fileShape(f) {
  return { id: f.id, name: f.originalname, mime: f.mime, size: f.size, chars: f.chars, createdAt: f.created_at };
}
function getAgent(id) {
  const a = shape(stmt.get.get(id));
  if (a) a.files = stmt.files.all(id).map(fileShape);
  return a;
}

// ─── Extração de texto dos arquivos de conhecimento ───────────────────────────
function run(bin, args) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 64 * 1024 * 1024, timeout: 60000 }, (err, stdout) => err ? reject(err) : resolve(stdout));
  });
}
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|html?|xml|ya?ml|log|js|ts|py|sql)$/i;
function stripXml(s) {
  return s.replace(/<\/w:p>|<\/a:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
}
async function extractText(filePath, originalname, mime) {
  const name = originalname || filePath;
  if (/\.pdf$/i.test(name) || mime === 'application/pdf') return run('pdftotext', ['-layout', filePath, '-']);
  if (/\.docx$/i.test(name)) return stripXml(await run('unzip', ['-p', filePath, 'word/document.xml']));
  if (/\.pptx$/i.test(name)) return stripXml(await run('unzip', ['-p', filePath, 'ppt/slides/*.xml']));
  if (/\.xlsx$/i.test(name)) return stripXml(await run('unzip', ['-p', filePath, 'xl/sharedStrings.xml']));
  if (TEXT_EXT.test(name) || (mime && mime.startsWith('text/'))) return fs.readFileSync(filePath, 'utf8');
  return null; // imagem e outros: o agente abre o original com Read
}

// ─── Contexto do agente pro Claude ────────────────────────────────────────────
// Gera o system prompt (anexado ao do Claude Code) com persona, habilidades e base de conhecimento.
function buildAgentSystemPrompt(agentId) {
  const a = getAgent(agentId);
  if (!a) return null;
  const out = [];
  out.push(`# Agente: ${a.name}`);
  out.push('Nesta conversa você atua exclusivamente como o agente abaixo, na plataforma ZEUS. Mantenha a persona do começo ao fim.');
  out.push('');
  out.push(a.prompt || `Você é o agente "${a.name}". ${a.description}`);
  if (a.kind !== 'zeus') {
    out.push('');
    out.push('Regras gerais:');
    GENERAL_RULES.forEach(l => out.push('- ' + l));
  }
  if (a.warn) { out.push(''); out.push('Aviso obrigatório quando o tema for sensível: ' + a.warn); }

  const skills = SKILLS.filter(s => a.skills.includes(s.id));
  if (skills.length) {
    out.push('');
    out.push('## Habilidades ativas');
    skills.forEach(s => out.push(`- **${s.name}**: ${s.instruction}`));
  }

  if (a.files.length) {
    const dir = agentDir(a.id);
    out.push('');
    out.push('## Base de conhecimento');
    out.push('Estes arquivos foram definidos para este agente. Consulte-os antes de responder e priorize o que está neles sobre conhecimento genérico. Cite o arquivo quando usar a informação, ex: [nome-do-arquivo].');
    out.push('');
    const rows = stmt.files.all(a.id);
    rows.forEach(f => {
      const txt = path.join(dir, f.filename + '.txt');
      const hasTxt = fs.existsSync(txt);
      out.push(`- ${f.originalname} (${f.mime || 'arquivo'}) | original: ${path.join(dir, f.filename)}${hasTxt ? ' | texto extraído: ' + txt : ''}`);
    });
    let budget = KNOWLEDGE_INLINE_CHARS;
    const partial = [];
    for (const f of rows) {
      const txt = path.join(dir, f.filename + '.txt');
      if (!fs.existsSync(txt) || budget <= 0) { if (fs.existsSync(txt)) partial.push(f.originalname); continue; }
      let body = fs.readFileSync(txt, 'utf8');
      const truncated = body.length > budget;
      if (truncated) { body = body.slice(0, budget); partial.push(f.originalname); }
      budget -= body.length;
      out.push('');
      out.push(`### Conteúdo: ${f.originalname}${truncated ? ' (trecho inicial)' : ''}`);
      out.push('```');
      out.push(body);
      out.push('```');
    }
    if (partial.length) {
      out.push('');
      out.push(`Os arquivos ${partial.join(', ')} não couberam inteiros aqui: use Read no caminho do texto extraído quando a pergunta envolver esse conteúdo.`);
    }
    const noText = rows.filter(f => !fs.existsSync(path.join(dir, f.filename + '.txt')));
    if (noText.length) out.push(`Arquivos sem texto extraído (imagens etc.): ${noText.map(f => f.originalname).join(', ')}. Abra o original com Read quando for relevante.`);
  }
  return { text: out.join('\n'), model: a.model || '', name: a.name };
}

// ─── Upload ───────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _f, cb) => {
      const dir = agentDir(req.params.id);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 12).replace(/[^.\w]/g, '');
      cb(null, Date.now() + '_' + crypto.randomBytes(4).toString('hex') + ext);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
});

// ─── Router ───────────────────────────────────────────────────────────────────
const router = express.Router();

function cleanInput(b, forCreate) {
  const o = {};
  if (b.name !== undefined) o.name = String(b.name).trim().slice(0, 120);
  if (b.category !== undefined) o.category = String(b.category).trim().slice(0, 60) || 'Geral';
  if (b.description !== undefined) o.description = String(b.description).trim().slice(0, 500);
  if (b.prompt !== undefined) o.prompt = String(b.prompt).slice(0, 40000);
  if (b.icebreakers !== undefined) o.icebreakers = JSON.stringify((Array.isArray(b.icebreakers) ? b.icebreakers : [])
    .map(s => String(s).trim()).filter(Boolean).slice(0, 8));
  if (b.skills !== undefined) o.skills = JSON.stringify((Array.isArray(b.skills) ? b.skills : [])
    .filter(id => SKILLS.some(s => s.id === id)));
  if (b.model !== undefined) o.model = MODELS.includes(b.model) ? b.model : '';
  if (forCreate) {
    o.category = o.category || 'Geral';
    o.description = o.description || '';
    o.prompt = o.prompt || '';
    o.icebreakers = o.icebreakers || '[]';
    o.skills = o.skills || '[]';
    o.model = o.model || '';
  }
  return o;
}

router.get('/', (_req, res) => {
  res.json({
    agents: stmt.list.all().map(shape),
    skills: SKILLS.map(({ id, name, group }) => ({ id, name, group })),
    categories: ['Geral', 'Marketing', 'Vendas', 'Produto', 'Pessoas', 'AJF'].map(c => ({ id: c, label: CATEGORY_LABEL[c] || c })),
  });
});

router.get('/:id', (req, res) => {
  const a = getAgent(req.params.id);
  if (!a) return res.status(404).json({ error: 'agente não encontrado' });
  res.json({ agent: a });
});

router.post('/', (req, res) => {
  const o = cleanInput(req.body || {}, true);
  if (!o.name) return res.status(400).json({ error: 'nome obrigatório' });
  const id = slug(o.name) + '-' + newId().slice(0, 4).toLowerCase().replace(/[^a-z0-9]/g, 'x');
  stmt.ins.run(Object.assign({ id, now: Date.now() }, o));
  res.json({ agent: getAgent(id) });
});

router.patch('/:id', (req, res) => {
  const cur = stmt.get.get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'agente não encontrado' });
  const o = cleanInput(req.body || {}, false);
  if (o.name === '') return res.status(400).json({ error: 'nome obrigatório' });
  if (req.body && req.body.inWorkspace !== undefined) o.in_workspace = req.body.inWorkspace ? 1 : 0;
  const keys = Object.keys(o);
  if (keys.length) {
    db.prepare(`UPDATE agents SET ${keys.map(k => k + ' = @' + k).join(', ')}, updated_at = @now WHERE id = @id`)
      .run(Object.assign({ id: cur.id, now: Date.now() }, o));
  }
  res.json({ agent: getAgent(cur.id) });
});

router.delete('/:id', (req, res) => {
  const cur = stmt.get.get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'agente não encontrado' });
  if (cur.kind === 'zeus') return res.status(400).json({ error: 'Agentes ZEUS não podem ser excluídos, só removidos do workspace' });
  stmt.filesDelAll.run(cur.id);
  stmt.del.run(cur.id);
  const dir = agentDir(cur.id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  res.json({ ok: true });
});

router.post('/:id/files', (req, res, next) => {
  if (!stmt.get.get(req.params.id)) return res.status(404).json({ error: 'agente não encontrado' });
  next();
}, upload.array('files', 10), async (req, res) => {
  const out = [];
  for (const f of req.files || []) {
    let chars = null;
    try {
      const text = await extractText(f.path, f.originalname, f.mimetype);
      if (text && text.trim()) {
        fs.writeFileSync(f.path + '.txt', text);
        chars = text.length;
      }
    } catch (e) {
      console.error('[agents] extração falhou', f.originalname, e.message);
    }
    const id = newId();
    stmt.fileIns.run(id, req.params.id, f.filename, f.originalname, f.mimetype, f.size, chars, Date.now());
    out.push(id);
  }
  res.json({ ok: true, added: out.length, agent: getAgent(req.params.id) });
});

router.get('/:id/files/:fid', (req, res) => {
  const f = stmt.fileGet.get(req.params.fid, req.params.id);
  if (!f) return res.status(404).end();
  res.download(path.join(agentDir(req.params.id), f.filename), f.originalname);
});

router.delete('/:id/files/:fid', (req, res) => {
  const f = stmt.fileGet.get(req.params.fid, req.params.id);
  if (!f) return res.status(404).json({ error: 'arquivo não encontrado' });
  stmt.fileDel.run(f.id);
  const p = path.join(agentDir(req.params.id), f.filename);
  for (const x of [p, p + '.txt']) if (fs.existsSync(x)) fs.rmSync(x, { force: true });
  res.json({ ok: true, agent: getAgent(req.params.id) });
});

module.exports = { router, getAgent, buildAgentSystemPrompt };
