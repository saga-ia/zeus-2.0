const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const multer = require('multer');
const Database = require('better-sqlite3');
const { AGENT_HOME, AGENT_PANELS, ZEUS_AGENTS, CATEGORY_LABEL, GENERAL_RULES, VIZ_RULE, LEGAL_WARN, zeusPrompt } = require('./agents-seed');
// Catálogo de habilidades dinâmico (regras + skills do servidor, com as edições feitas pela interface)
const skillsMod = require('./skills');

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
    panel: AGENT_PANELS[a.id] || null,
    home: AGENT_HOME[a.id] || null,
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

// Governança definida em Configurações > Agentes (categorias próprias e avisos de assunto sensível)
function agentesCfg() {
  try {
    const r = db.prepare(`SELECT data FROM config_kv WHERE section = 'agentes'`).get();
    const j = r ? JSON.parse(r.data) : {};
    return { categorias: Array.isArray(j.categorias) ? j.categorias : [], avisos: Array.isArray(j.avisos) ? j.avisos : [] };
  } catch (_) { return { categorias: [], avisos: [] }; }
}
const ACAO_AVISO = {
  avisar: 'responda normalmente, mas avise o usuário sobre o cuidado necessário com esse assunto',
  recusar: 'não trate o assunto; explique com educação que ele não pode ser tratado aqui e oriente o próximo passo',
  humano: 'não resolva sozinho; diga que o assunto precisa de uma pessoa responsável e peça para o usuário acionar o time',
  registrar: 'responda normalmente e sinalize no fim da resposta: [assunto sensível registrado]',
};

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
  // Agentes ZEUS têm as regras gravadas no banco pelo seed antigo: garante a regra de visuais em todos
  if (!(a.prompt || '').includes('zeus-kpi')) { out.push(''); out.push('Visuais na tela: ' + VIZ_RULE); }
  if (a.warn) { out.push(''); out.push('Aviso obrigatório quando o tema for sensível: ' + a.warn); }
  const avisos = agentesCfg().avisos;
  if (avisos.length) {
    out.push('');
    out.push('## Assuntos sensíveis (regra da empresa, vale para todos os agentes)');
    avisos.forEach(v => out.push(`- Quando a conversa envolver "${v.assunto}": ${ACAO_AVISO[v.acao] || ACAO_AVISO.avisar}.${v.descricao ? ' Contexto: ' + v.descricao : ''}`));
  }

  const skills = skillsMod.all().filter(s => a.skills.includes(s.id));
  if (skills.length) {
    out.push('');
    out.push('## Habilidades ativas');
    if (skills.some(s => s.kind === 'skill')) {
      out.push('Algumas habilidades abaixo são skills instaladas neste servidor: para usá-las, invoque a ferramenta Skill com o nome indicado e siga as instruções que ela carrega. Não descreva a skill nem peça permissão, apenas execute.');
    }
    skills.forEach(s => out.push(`- **${s.name}**${s.kind === 'skill' ? ` (skill: ${s.slug})` : ''}: ${s.instruction}`));
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
    .filter(id => !!skillsMod.find(id)));
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
    skills: skillsMod.all().map(({ id, name, group, kind, desc, slug, origem }) => ({ id, name, group, kind: kind || 'regra', desc: desc || '', slug: slug || '', origem: origem || '' })),
    categories: ['Geral', 'Marketing', 'Vendas', 'Produto', 'Pessoas', 'AJF'].map(c => ({ id: c, label: CATEGORY_LABEL[c] || c }))
      .concat(agentesCfg().categorias.filter(c => !['Geral', 'Marketing', 'Vendas', 'Produto', 'Pessoas', 'AJF'].includes(c.name)).map(c => ({ id: c.name, label: c.name, custom: true }))),
  });
});

router.get('/:id', (req, res) => {
  const a = getAgent(req.params.id);
  if (!a) return res.status(404).json({ error: 'agente não encontrado' });
  res.json({ agent: a });
});

// ─── Criar com ZEUS: conversa que monta o agente, e "Enriquecer" do prompt ────
const claudeSpawn = require('./claude-spawn');
const CLAUDE_BIN = claudeSpawn.CLAUDE_BIN;
const ASSIST_DIR = path.join(DATA_DIR, 'assist-workdir');
const ASSIST_NO_TOOLS = 'Bash Edit Write NotebookEdit WebFetch WebSearch Task Agent Read Glob Grep';
if (!fs.existsSync(ASSIST_DIR)) fs.mkdirSync(ASSIST_DIR, { recursive: true });

function claudeTexto(prompt, model) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    // Só texto, sem ferramentas: esforço leve e sem MCPs (ver claude-spawn.js)
    const p = spawn(CLAUDE_BIN, ['-p', '--output-format', 'text', '--model', model || 'sonnet', '--disallowedTools', ASSIST_NO_TOOLS, ...claudeSpawn.commonArgs({ light: true })],
      { cwd: ASSIST_DIR, stdio: ['pipe', 'pipe', 'pipe'], env: claudeSpawn.claudeEnv() });
    let out = '', err = '';
    const t = setTimeout(() => { try { p.kill('SIGTERM'); } catch (_) {} }, 150000);
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('close', code => { clearTimeout(t); if (!out.trim()) return reject(new Error(err.slice(-300) || 'claude saiu com código ' + code)); resolve(out); });
    p.on('error', e => { clearTimeout(t); reject(e); });
    p.stdin.on('error', () => {});
    p.stdin.end(prompt);
  });
}
function jsonDe(txt) {
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(txt.slice(a, b + 1)); } catch { return null; }
}

router.post('/assist', async (req, res) => {
  const b = req.body || {};
  const draft = b.draft && typeof b.draft === 'object' ? b.draft : {};
  const cats = ['Geral', 'Marketing', 'Vendas', 'Produto', 'Pessoas', 'AJF'];
  try {
    if (b.mode === 'enrich') {
      const atual = String(draft.prompt || '').slice(0, 20000);
      if (!atual.trim() && !String(draft.description || '').trim()) return res.status(400).json({ error: 'escreva um prompt ou um descritivo antes de enriquecer' });
      const prompt = [
        'Você melhora prompts de agentes de IA da plataforma ZEUS. Responda em PT-BR.',
        `Agente: ${draft.name || '(sem nome)'} | Categoria: ${draft.category || 'Geral'} | Descritivo: ${draft.description || '-'}`,
        '', '=== Prompt atual ===', atual || '(vazio: crie a partir do nome e do descritivo)', '=== Fim ===', '',
        'Reescreva o prompt mantendo a intenção original e deixando-o completo e acionável. Estrutura, em segunda pessoa ("Você é..."):',
        '1. Papel e objetivo  2. Público e contexto  3. Como trabalhar (passo a passo)  4. Formato das respostas  5. Regras e o que nunca fazer.',
        'Não invente dados da empresa: onde faltar informação, deixe um marcador [preencher: ...]. Entre 250 e 800 palavras.',
        'Não use ferramentas. Responda APENAS com JSON válido: {"prompt":"..."}',
      ].join('\n');
      const j = jsonDe(await claudeTexto(prompt, 'sonnet'));
      if (!j || !j.prompt) throw new Error('resposta da IA fora do formato');
      return res.json({ prompt: String(j.prompt).slice(0, 40000) });
    }

    // mode build: conversa → rascunho completo do agente
    const msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-20)
      .map(m => ({ role: m.role === 'zeus' ? 'zeus' : 'user', content: String(m.content || '').slice(0, 6000) }))
      .filter(m => m.content.trim());
    if (!msgs.some(m => m.role === 'user')) return res.status(400).json({ error: 'descreva o agente que você quer criar' });
    const prompt = [
      'Você é o ZEUS e ajuda o usuário a criar um agente de IA na plataforma ZEUS. Sempre em PT-BR, direto e amigável.',
      '', 'Categorias válidas: ' + cats.join(', '),
      'Habilidades disponíveis (use só estes ids):',
      ...skillsMod.all().map(s => `- ${s.id}: ${s.name} [${s.group}]`),
      '', 'Rascunho atual do agente (JSON): ' + JSON.stringify({
        name: draft.name || '', category: draft.category || 'Geral', description: draft.description || '',
        prompt: String(draft.prompt || '').slice(0, 12000), icebreakers: draft.icebreakers || [], skills: draft.skills || [],
      }),
      '', '=== Conversa ===',
      ...msgs.map(m => (m.role === 'user' ? 'USUÁRIO: ' : 'ZEUS: ') + m.content),
      '=== Fim da conversa ===', '',
      'Tarefa: crie ou atualize o agente com base na conversa (se o rascunho já existe, aplique só o que o usuário pediu e preserve o resto).',
      '- name: curto e claro (até 60 caracteres).',
      '- description: uma frase de até 140 caracteres, que aparece no card.',
      '- prompt: completo, em segunda pessoa ("Você é..."), com papel, público, objetivo, como trabalhar passo a passo, formato das respostas e regras/limites. Entre 250 e 800 palavras. Não invente dados da empresa: use [preencher: ...] onde faltar.',
      '- icebreakers: 4 perguntas curtas que um usuário faria a esse agente.',
      '- skills: de 1 a 4 ids da lista acima que façam sentido.',
      '- resposta: 1 a 3 frases ao usuário dizendo o que você montou. Se faltar algo importante, faça no máximo 2 perguntas objetivas no fim.',
      'Não use ferramentas. Responda APENAS com JSON válido:',
      '{"resposta":"...","agente":{"name":"...","category":"...","description":"...","prompt":"...","icebreakers":["..."],"skills":["..."]}}',
    ].join('\n');
    const j = jsonDe(await claudeTexto(prompt, 'sonnet'));
    if (!j || !j.agente) throw new Error('resposta da IA fora do formato');
    const a = j.agente;
    const out = {
      name: String(a.name || '').trim().slice(0, 120),
      category: cats.includes(a.category) ? a.category : (draft.category || 'Geral'),
      description: String(a.description || '').trim().slice(0, 500),
      prompt: String(a.prompt || '').slice(0, 40000),
      icebreakers: (Array.isArray(a.icebreakers) ? a.icebreakers : []).map(x => String(x).trim()).filter(Boolean).slice(0, 8),
      skills: (Array.isArray(a.skills) ? a.skills : []).filter(id => !!skillsMod.find(id)),
    };
    res.json({ reply: String(j.resposta || 'Pronto, montei o agente. Revise na prévia ao lado.'), draft: out });
  } catch (e) {
    console.error('[agents] assist', e.message);
    res.status(500).json({ error: 'não consegui gerar agora: ' + e.message });
  }
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

module.exports = { router, getAgent, buildAgentSystemPrompt, extractText };
