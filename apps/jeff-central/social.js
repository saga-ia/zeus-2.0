// Social Media: Brand Kit de cada marca (objetivo, marca, público, identidade e estilo visual).
// É o que o agente de design lê para criar os posts de imagem com IA (CLI tools/marca).
// Várias marcas por empresa (a agência atende clientes): cada uma com logo, cores, descrição de estilo e referências.
// Arquivos (logo e referências) ficam em data/social/<id>/ e só saem com sessão.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');
const claudeSpawn = require('./claude-spawn');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const FILES_DIR = path.join(DATA_DIR, 'social');
if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'central.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS social_marcas (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  dados TEXT NOT NULL DEFAULT '{}',
  logo TEXT,
  refs TEXT NOT NULL DEFAULT '[]',
  completo INTEGER NOT NULL DEFAULT 0,
  por TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`);

const newId = () => crypto.randomBytes(8).toString('base64url');
const parseJSON = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const txt = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

// Opções fixas das telas (a mesma lista está no front)
const OBJETIVOS = { vender: 'Vender mais produtos/serviços', autoridade: 'Construir autoridade', engajamento: 'Aumentar engajamento', leads: 'Gerar leads qualificados' };
const TONS = ['Descontraído', 'Profissional', 'Inspirador', 'Educativo', 'Divertido', 'Acolhedor', 'Direto', 'Sofisticado', 'Amigável', 'Motivacional'];
const FIDELIDADE = { fiel: 'Cópia fiel: segue o layout exatamente, só troca o conteúdo', forte: 'Inspiração forte: mesmos estilos e elementos, mas layouts variados', livre: 'Referência livre: pega a vibe geral, pode ser criativo' };
const HEX = /^#[0-9a-f]{6}$/i;
// campo → tamanho máximo
const CAMPOS = { nome: 120, pais: 40, oQueFaz: 600, tag: 80, instagram: 60, website: 200, diferencial: 1200, produtos: 1200,
  clienteIdeal: 1200, dores: 1500, desejos: 1500, objecoes: 1500, persona: 1200, palavrasUsa: 800, palavrasEvita: 800, descricaoEstilo: 4000 };

// Limpa o que veio da tela: só campos conhecidos, com tamanho e formato válidos
function limpar(b) {
  const d = {};
  Object.entries(CAMPOS).forEach(([k, n]) => { if (b[k] !== undefined) d[k] = txt(b[k], n); });
  if (d.instagram) d.instagram = d.instagram.replace(/^@+/, '').replace(/\s+/g, '');
  if (OBJETIVOS[b.objetivo]) d.objetivo = b.objetivo;
  if (Array.isArray(b.tons)) d.tons = b.tons.filter(t => TONS.includes(t)).slice(0, 10);
  if (b.formalidade !== undefined) { const f = parseInt(b.formalidade, 10); if (f >= 0 && f <= 100) d.formalidade = f; }
  if (b.cores && typeof b.cores === 'object') {
    const c = {};
    ['primaria', 'secundaria', 'destaque'].forEach(k => { if (HEX.test(b.cores[k] || '')) c[k] = b.cores[k].toUpperCase(); });
    if (b.cores.paleta) c.paleta = txt(b.cores.paleta, 40);
    c.personalizar = !!b.cores.personalizar;
    d.cores = c;
  }
  if (Array.isArray(b.coresLogo)) d.coresLogo = b.coresLogo.filter(x => HEX.test(x)).map(x => x.toUpperCase()).slice(0, 5);
  if (FIDELIDADE[b.fidelidade]) d.fidelidade = b.fidelidade;
  return d;
}

const stmt = {
  list: db.prepare(`SELECT * FROM social_marcas ORDER BY updated_at DESC`),
  get: db.prepare(`SELECT * FROM social_marcas WHERE id = ?`),
  ins: db.prepare(`INSERT INTO social_marcas (id, nome, dados, completo, por, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`),
  upd: db.prepare(`UPDATE social_marcas SET nome = ?, dados = ?, completo = ?, updated_at = ? WHERE id = ?`),
  logo: db.prepare(`UPDATE social_marcas SET logo = ?, updated_at = ? WHERE id = ?`),
  refs: db.prepare(`UPDATE social_marcas SET refs = ?, updated_at = ? WHERE id = ?`),
  del: db.prepare(`DELETE FROM social_marcas WHERE id = ?`),
};
function publico(r) {
  if (!r) return null;
  return { id: r.id, nome: r.nome, dados: parseJSON(r.dados, {}), logo: r.logo ? `/api/social/${r.id}/arquivo/${r.logo}` : null,
    refs: parseJSON(r.refs, []).map(x => Object.assign({}, x, { url: `/api/social/${r.id}/arquivo/${x.arquivo}` })),
    completo: !!r.completo, por: r.por, created_at: r.created_at, updated_at: r.updated_at };
}
const dirDe = (id) => path.join(FILES_DIR, id);
const quem = (u) => (u && (u.name || u.email)) || 'ZEUS';

// data:image/...;base64 → arquivo. SVG chega já convertido em PNG pela tela.
const TIPOS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp' };
function gravarImagem(id, base, dataUrl) {
  const m = /^data:(image\/[\w+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m || !TIPOS[m[1]]) throw new Error('envie PNG, JPG ou WebP');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 5 * 1024 * 1024) throw new Error('imagem acima de 5MB');
  const dir = dirDe(id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const nome = `${base}.${TIPOS[m[1]]}`;
  fs.writeFileSync(path.join(dir, nome), buf);
  return nome;
}
function apagarArquivo(id, nome) { try { if (nome) fs.unlinkSync(path.join(dirDe(id), path.basename(nome))); } catch (_) {} }

// Completo = tem o mínimo que o agente de design precisa
function estaCompleto(nome, d) { return !!(nome && d.objetivo && d.oQueFaz && d.clienteIdeal && (d.tons || []).length && d.descricaoEstilo); }

const router = express.Router();

router.get('/', (_req, res) => res.json({ marcas: stmt.list.all().map(publico) }));
router.get('/:id', (req, res) => {
  const r = stmt.get.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'marca não encontrada' });
  res.json(publico(r));
});

router.post('/', (req, res) => {
  const d = limpar(req.body || {});
  const nome = d.nome || 'Nova marca';
  const id = newId(), agora = Date.now();
  stmt.ins.run(id, nome, JSON.stringify(d), estaCompleto(d.nome, d) ? 1 : 0, quem(req.user), agora, agora);
  registrar('Social Media', `Marca criada: ${nome}`, req.user);
  res.json(publico(stmt.get.get(id)));
});

router.put('/:id', (req, res) => {
  const r = stmt.get.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'marca não encontrada' });
  const d = Object.assign(parseJSON(r.dados, {}), limpar(req.body || {}));
  const nome = d.nome || r.nome;
  const completo = estaCompleto(d.nome, d);
  stmt.upd.run(nome, JSON.stringify(d), completo ? 1 : 0, Date.now(), r.id);
  if (completo && !r.completo) registrar('Social Media', `Brand Kit concluído: ${nome}`, req.user);
  res.json(publico(stmt.get.get(r.id)));
});

router.delete('/:id', (req, res) => {
  const r = stmt.get.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'marca não encontrada' });
  stmt.del.run(r.id);
  try { fs.rmSync(dirDe(r.id), { recursive: true, force: true }); } catch (_) {}
  registrar('Social Media', `Marca excluída: ${r.nome}`, req.user);
  res.json({ ok: true });
});

// Logo
router.put('/:id/logo', (req, res) => {
  const r = stmt.get.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'marca não encontrada' });
  try {
    const nome = gravarImagem(r.id, 'logo-' + Date.now().toString(36), (req.body || {}).dataUrl);
    if (r.logo && r.logo !== nome) apagarArquivo(r.id, r.logo);
    stmt.logo.run(nome, Date.now(), r.id);
    res.json(publico(stmt.get.get(r.id)));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/:id/logo', (req, res) => {
  const r = stmt.get.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'marca não encontrada' });
  apagarArquivo(r.id, r.logo);
  stmt.logo.run(null, Date.now(), r.id);
  res.json(publico(stmt.get.get(r.id)));
});

// Referências visuais (posts que a marca quer seguir)
const MAX_REFS = 8;
router.post('/:id/refs', (req, res) => {
  const r = stmt.get.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'marca não encontrada' });
  const refs = parseJSON(r.refs, []);
  if (refs.length >= MAX_REFS) return res.status(400).json({ error: `máximo de ${MAX_REFS} referências` });
  try {
    const rid = newId();
    const arquivo = gravarImagem(r.id, 'ref-' + rid, (req.body || {}).dataUrl);
    refs.push({ id: rid, arquivo, nome: txt((req.body || {}).nome, 120) || 'referência', em: Date.now() });
    stmt.refs.run(JSON.stringify(refs), Date.now(), r.id);
    res.json(publico(stmt.get.get(r.id)));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/:id/refs/:rid', (req, res) => {
  const r = stmt.get.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'marca não encontrada' });
  const refs = parseJSON(r.refs, []);
  const x = refs.find(f => f.id === req.params.rid);
  if (x) apagarArquivo(r.id, x.arquivo);
  stmt.refs.run(JSON.stringify(refs.filter(f => f.id !== req.params.rid)), Date.now(), r.id);
  res.json(publico(stmt.get.get(r.id)));
});

router.get('/:id/arquivo/:nome', (req, res) => {
  const nome = path.basename(req.params.nome);
  const p = path.join(dirDe(path.basename(req.params.id)), nome);
  if (!/^(logo|ref)-[\w-]+\.(png|jpg|webp)$/.test(nome) || !fs.existsSync(p)) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=86400');
  res.sendFile(p);
});

// ─── IA: gera ou refina a descrição do estilo visual ─────────────────────────
// Olha logo e referências (Read nas imagens) e cruza com o que a marca contou nos passos anteriores.
function resumoMarca(nome, d) {
  const L = [];
  const add = (rot, v) => { if (v) L.push(`- ${rot}: ${v}`); };
  add('Marca', nome); add('Objetivo principal', OBJETIVOS[d.objetivo]); add('País', d.pais); add('O que faz', d.oQueFaz);
  add('Diferencial', d.diferencial); add('Produtos/serviços', d.produtos); add('Cliente ideal', d.clienteIdeal);
  add('Dores do público', d.dores); add('Desejos do público', d.desejos); add('Objeções', d.objecoes);
  add('Tom de voz', (d.tons || []).join(', ')); add('Personalidade', d.persona);
  if (d.formalidade !== undefined) add('Formalidade (0 informal, 100 formal)', d.formalidade);
  const c = d.cores || {};
  add('Cores da marca', [c.primaria && 'primária ' + c.primaria, c.secundaria && 'secundária ' + c.secundaria, c.destaque && 'destaque ' + c.destaque].filter(Boolean).join(', '));
  return L.join('\n');
}
function claudeComImagens(prompt, cwd) {
  // A pasta da marca só nasce com logo/referência: sem ela o spawn falha com ENOENT
  try { fs.mkdirSync(cwd, { recursive: true }); } catch (_) {}
  return new Promise((resolve, reject) => {
    // Só leitura de arquivo (pra ver as imagens), sem Bash/escrita/internet
    const p = spawn(claudeSpawn.CLAUDE_BIN, ['-p', '--output-format', 'text', '--model', 'sonnet',
      '--disallowedTools', 'Bash Edit Write NotebookEdit WebFetch WebSearch Task Agent Glob Grep', ...claudeSpawn.commonArgs({ light: true })],
      { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: claudeSpawn.claudeEnv() });
    let out = '', err = '';
    const t = setTimeout(() => { try { p.kill('SIGTERM'); } catch (_) {} }, 150000);
    p.stdout.on('data', x => { out += x; });
    p.stderr.on('data', x => { err += x; });
    p.on('close', code => { clearTimeout(t); const ruim = claudeSpawn.checaSaida(out, err, code); if (ruim) return reject(new Error(ruim)); resolve(out.trim()); });
    p.on('error', e => { clearTimeout(t); reject(e); });
    p.stdin.on('error', () => {});
    p.stdin.end(prompt);
  });
}
router.post('/:id/ia/estilo', async (req, res) => {
  const r = stmt.get.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'marca não encontrada' });
  const b = req.body || {};
  const d = Object.assign(parseJSON(r.dados, {}), limpar(b.dados || {}));
  const atual = txt(b.atual, 4000), pedido = txt(b.pedido, 600);
  const dir = dirDe(r.id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const refs = parseJSON(r.refs, []);
  const imgs = [];
  if (r.logo) imgs.push(`- Logo: ${path.join(dir, r.logo)}`);
  refs.forEach((x, i) => imgs.push(`- Referência visual ${i + 1}: ${path.join(dir, x.arquivo)}`));
  const prompt = [
    'Você é diretor de arte de social media. Escreva a DESCRIÇÃO DO ESTILO VISUAL desta marca: é o texto que um gerador de imagens com IA vai seguir em todos os posts dela.',
    '', 'Dados da marca:', resumoMarca(r.nome, d) || '(poucos dados)',
    imgs.length ? '\nImagens da marca (abra cada uma com Read antes de escrever e descreva o que realmente vê: paleta, tipografia, composição, tratamento de foto, elementos gráficos):\n' + imgs.join('\n') : '',
    refs.length && d.fidelidade ? `\nNível de fidelidade às referências escolhido: ${FIDELIDADE[d.fidelidade]}.` : '',
    atual ? `\nDescrição atual (ponto de partida, mantenha o que estiver bom):\n${atual}` : '',
    pedido ? `\nAjuste pedido pelo usuário: ${pedido}` : '',
    '', 'Regras da resposta:',
    '- Um único parágrafo corrido em português do Brasil, de 70 a 130 palavras, sem título, sem lista, sem aspas, sem markdown e sem travessão.',
    '- Cubra: sensação geral, layout e respiro, tipografia, uso das cores, elementos gráficos e texturas, estilo das fotos (pessoas, luz, enquadramento).',
    '- Cores: cite só os hex das cores da marca listadas acima (e os que aparecem de fato na logo). Nunca invente hex novo; para neutros de apoio, diga apenas branco, off-white ou cinza claro. Se a marca não tiver cores definidas, descreva a paleta em palavras, sem hex.',
    '- Seja concreto e visual, nada genérico. Não invente elementos que contradigam as imagens.',
    '- Responda só com o parágrafo.'
  ].filter(x => x !== '').join('\n');
  try {
    const texto = (await claudeComImagens(prompt, dir)).replace(/^["“]|["”]$/g, '').replace(/\s*[—–]\s*/g, ', ').trim();
    res.json({ descricao: texto.slice(0, 4000) });
  } catch (e) { res.status(502).json({ error: 'Não consegui gerar agora: ' + e.message }); }
});

// Registro de atividades (Configurações)
function registrar(sec, detalhe, user) { try { require('./config').registrar(sec, detalhe, quem(user)); } catch (_) {} }

module.exports = { router, OBJETIVOS, FIDELIDADE, FILES_DIR, publico, stmt, resumoMarca, claudeComImagens, dirDe, db };
