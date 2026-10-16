// Estilos de design salvos por marca (Agente de Design e chat do Zeus). Decisão do Jeff (09/10/2026):
// cada marca tem até 7 estilos; cada estilo junta várias referências (print do chat ou link de post do Instagram,
// que traz todas as lâminas), a receita escrita pelo Zeus, as artes aprovadas nesse estilo e as correções.
// Só vira estilo o que a pessoa aprovou e mandou salvar (o Zeus sempre pergunta antes).
// Disco (fonte da verdade): /opt/jeff-worker/projetos/design-modelos/marcas/<marcaId>/estilos/<slug>/
//   estilo.json · receita.md · refs/<refId>/NN.jpg · folha.jpg (capa com uma imagem de cada referência)
// Espelho pro chat e pra tela: data/social/_criacoes/estilo-<marcaId>-<slug>/v1-s0-capa.jpg e v1-sN-ref.jpg
// (servidos por /api/design/arquivo/..., sem botões de avaliação: referência não é arte nossa).
// Biblioteca: Agente de Design › <marca> › Estilos › <nome>, uma imagem por referência.
// Usado por tools/estilo (CLI do agente) e pelas rotas /api/design/estilos (aba Estilos).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const express = require('express');
const multer = require('multer');
const social = require('./social');

const BASE = process.env.DESIGN_MARCAS_DIR || '/opt/jeff-worker/projetos/design-modelos/marcas';
const CRIA_DIR = path.join(social.FILES_DIR, '_criacoes');
const COLETA = '/opt/jeff-worker/projetos/design-modelos/estruturas/_coleta';
const COLETAR = '/opt/jeff-worker/scripts/coletar-post.sh';
const MAX_ESTILOS = 7, MAX_REFS = 25; // Jeff pediu 25 referências por estilo (09/10/2026)

const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const agora = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 16).replace('T', ' '); // BRT
const ler = (f, pad) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return pad; } };

// ─── Marca ───────────────────────────────────────────────────────────────────
function marcas() { return social.db.prepare(`SELECT id, nome, dados FROM social_marcas ORDER BY created_at`).all(); }
function acharMarca(q) {
  const l = marcas(); q = String(q || '').trim(); const n = slugify(q).replace(/-/g, '');
  return l.find(m => m.id === q) || l.find(m => slugify(m.nome).replace(/-/g, '') === n)
    || l.find(m => { try { return slugify(JSON.parse(m.dados || '{}').instagram).replace(/-/g, '') === n.replace(/^@/, ''); } catch (_) { return false; } })
    || l.find(m => n && slugify(m.nome).replace(/-/g, '').includes(n)) || null;
}
function exigirMarca(q) { const m = acharMarca(q); if (!m) throw new Error(`marca não encontrada: ${q} (marcas: ${marcas().map(x => x.nome).join(', ')})`); return m; }

// ─── Estilo ──────────────────────────────────────────────────────────────────
const dirEstilos = (marcaId) => path.join(BASE, marcaId, 'estilos');
const dirEstilo = (marcaId, slug) => path.join(dirEstilos(marcaId), slug);
const espelho = (marcaId, slug) => path.join(CRIA_DIR, `estilo-${marcaId}-${slug}`);
const urlArq = (marcaId, slug, nome) => `/api/design/arquivo/estilo-${marcaId}-${slug}/${nome}`;

function carregar(marcaId, slug) {
  const e = ler(path.join(dirEstilo(marcaId, slug), 'estilo.json'), null); if (!e) return null;
  const rec = path.join(dirEstilo(marcaId, slug), 'receita.md');
  e.receita = fs.existsSync(rec) ? fs.readFileSync(rec, 'utf8') : '';
  e.capa = urlArq(marcaId, slug, 'v1-s0-capa.jpg');
  e.refsUrl = e.referencias.map((r, i) => urlArq(marcaId, slug, `v1-s${i + 1}-ref.jpg`));
  return e;
}
function salvar(e) { const d = dirEstilo(e.marcaId, e.slug); fs.mkdirSync(d, { recursive: true }); const { receita, capa, refsUrl, ...dados } = e; dados.atualizado = agora(); fs.writeFileSync(path.join(d, 'estilo.json'), JSON.stringify(dados, null, 1)); }

function listar(marcaId) {
  const d = dirEstilos(marcaId); if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(s => !s.startsWith('_')).map(s => carregar(marcaId, s)).filter(Boolean)
    .sort((a, b) => String(b.ultimoUso || b.criado).localeCompare(String(a.ultimoUso || a.criado)));
}
function acharEstilo(marcaId, q) {
  const l = listar(marcaId), s = slugify(q);
  const e = l.find(x => x.slug === s) || l.find(x => slugify(x.nome) === s) || l.find(x => s && (x.slug.includes(s) || s.includes(x.slug)));
  if (!e) throw new Error(`estilo não encontrado: ${q}${l.length ? ` (estilos da marca: ${l.map(x => x.nome).join(', ')})` : ' (a marca ainda não tem estilos)'}`);
  return e;
}

// Python/PIL monta a capa (uma imagem de cada referência lado a lado) e a miniatura de cada referência
function montarImagens(e) {
  const d = dirEstilo(e.marcaId, e.slug), esp = espelho(e.marcaId, e.slug);
  fs.rmSync(esp, { recursive: true, force: true }); fs.mkdirSync(esp, { recursive: true });
  const primeiras = e.referencias.map(r => path.join(d, r.imagens[0]));
  const py = `import sys, json
from PIL import Image
imgs, capa, esp = json.loads(sys.argv[1]), sys.argv[2], sys.argv[3]
ims = []
for k, f in enumerate(imgs):
    im = Image.open(f).convert("RGB"); t = im.copy(); t.thumbnail((900, 1200)); t.save(f"{esp}/v1-s{k+1}-ref.jpg", quality=85); ims.append(im)
if ims:
    H = 600; ims = [im.resize((max(1, round(im.width * H / im.height)), H)) for im in ims[:6]]
    W = sum(i.width for i in ims) + 12 * (len(ims) - 1); fol = Image.new("RGB", (W, H), "white"); x = 0
    for i in ims: fol.paste(i, (x, 0)); x += i.width + 12
    fol.thumbnail((1800, 600)); fol.save(capa, quality=86)`;
  const r = spawnSync('python3', ['-I', '-c', py, JSON.stringify(primeiras), path.join(d, 'folha.jpg'), esp], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('não montei as imagens do estilo: ' + (r.stderr || '').trim().split('\n').pop());
  if (fs.existsSync(path.join(d, 'folha.jpg'))) fs.copyFileSync(path.join(d, 'folha.jpg'), path.join(esp, 'v1-s0-capa.jpg'));
}

// Biblioteca: Agente de Design › <marca> › Estilos › <nome>
function biblioteca(e, novas, marcaNome) {
  try {
    const kb = require('./knowledge');
    const pasta = kb.garantirPasta(e.nome, kb.garantirPasta('Estilos', kb.garantirPasta(marcaNome, kb.garantirPasta('Agente de Design', null))));
    e.biblioteca = { folderId: pasta };
    novas.forEach(r => r.imagens.forEach((img, j) => kb.registrarArquivo({ caminho: path.join(dirEstilo(e.marcaId, e.slug), img), nome: path.basename(img),
      titulo: `Referência ${r.id}${r.imagens.length > 1 ? ' · lâmina ' + (j + 1) : ''}${r.perfil ? ' · @' + r.perfil : ''}`, mime: 'image/jpeg', folderId: pasta, tags: ['estilo', e.nome] })));
  } catch (err) { console.error('[estilos] biblioteca', err.message); }
}

// itens: caminhos de imagem (print do chat) ou links de post do Instagram (baixa todas as lâminas)
function importar(e, itens) {
  const links = itens.filter(x => /instagram\.com\/(p|reel)\//.test(x));
  const novosLinks = links.filter(x => { const m = x.match(/instagram\.com\/(?:p|reel)\/([\w-]+)/); return m && !fs.existsSync(path.join(COLETA, m[1], 'post.json')); });
  if (novosLinks.length) { const r = spawnSync(COLETAR, novosLinks, { encoding: 'utf8', timeout: 300000 }); if (r.status !== 0) console.error('[estilos] coleta', (r.stderr || r.stdout || '').slice(-300)); }
  const d = dirEstilo(e.marcaId, e.slug), novas = [];
  for (const [i, x] of itens.entries()) {
    if (e.referencias.length + novas.length >= MAX_REFS) { e._foraDoLimite = itens.length - i; console.log(`limite de ${MAX_REFS} referências por estilo: ${e._foraDoLimite} ficaram de fora`); break; }
    const m = x.match(/instagram\.com\/(?:p|reel)\/([\w-]+)/);
    let ref;
    if (m) {
      const src = path.join(COLETA, m[1]); if (!fs.existsSync(path.join(src, 'post.json'))) { console.log(`não consegui baixar ${x}`); continue; }
      if (e.referencias.some(r => r.id === m[1])) { console.log(`já estava no estilo: ${x}`); continue; }
      const pj = ler(path.join(src, 'post.json'), {}), dest = path.join(d, 'refs', m[1]); fs.mkdirSync(dest, { recursive: true });
      const lams = fs.readdirSync(src).filter(f => /^\d+\.jpg$/.test(f)).sort();
      lams.forEach(f => fs.copyFileSync(path.join(src, f), path.join(dest, f)));
      ref = { id: m[1], tipo: 'link', origem: pj.url || x.split('?')[0], perfil: pj.perfil || null, imagens: lams.map(f => `refs/${m[1]}/${f}`), em: agora() };
    } else if (fs.existsSync(x) && fs.statSync(x).isFile()) {
      const id = 'print' + Date.now().toString(36) + novas.length, dest = path.join(d, 'refs', id); fs.mkdirSync(dest, { recursive: true });
      const r = spawnSync('python3', ['-I', '-c', 'import sys\nfrom PIL import Image\nImage.open(sys.argv[1]).convert("RGB").save(sys.argv[2], quality=90)', x, path.join(dest, '01.jpg')], { encoding: 'utf8' });
      if (r.status !== 0) { console.log(`não é imagem: ${x}`); continue; }
      ref = { id, tipo: 'print', origem: path.basename(x), perfil: null, imagens: [`refs/${id}/01.jpg`], em: agora() };
    } else { console.log(`ignorado (não é print nem link de post do Instagram): ${x}`); continue; }
    novas.push(ref);
  }
  e.referencias.push(...novas);
  return novas;
}

function criar(marcaQ, nome, itens) {
  const m = exigirMarca(marcaQ), l = listar(m.id), slug = slugify(nome);
  if (!slug) throw new Error('dê um nome ao estilo');
  if (l.some(x => x.slug === slug)) throw new Error(`a marca já tem um estilo "${nome}". Use "estilo add ${m.nome} ${slug} ..." para juntar referências`);
  if (l.length >= MAX_ESTILOS) throw new Error(`LIMITE: ${m.nome} já tem ${MAX_ESTILOS} estilos (${l.map(x => x.nome).join(', ')}). Pergunte qual a pessoa quer substituir e rode "estilo excluir" nele antes`);
  if (!itens.length) throw new Error('mande pelo menos um print ou link de referência');
  const e = { slug, nome: String(nome).trim().slice(0, 60), marcaId: m.id, criado: agora(), usos: 0, ultimoUso: null, referencias: [], exemplos: [], correcoes: [] };
  fs.mkdirSync(dirEstilo(m.id, slug), { recursive: true });
  const novas = importar(e, itens); delete e._foraDoLimite;
  if (!novas.length) { fs.rmSync(dirEstilo(m.id, slug), { recursive: true, force: true }); throw new Error('nenhuma referência válida: nada foi salvo'); }
  biblioteca(e, novas, m.nome); salvar(e); montarImagens(e);
  return carregar(m.id, slug);
}
function adicionar(marcaQ, estiloQ, itens) {
  const m = exigirMarca(marcaQ), e = acharEstilo(m.id, estiloQ);
  const novas = importar(e, itens), fora = e._foraDoLimite || 0; delete e._foraDoLimite;
  if (!novas.length) throw new Error(fora ? `O estilo já tem ${e.referencias.length} referências, o limite de ${MAX_REFS}. Tire alguma antes de adicionar.` : 'Essas referências já estavam no estilo.');
  biblioteca(e, novas, m.nome); salvar(e); montarImagens(e);
  return Object.assign(carregar(m.id, e.slug), fora ? { aviso: `Entraram ${novas.length}. ${fora} ficaram de fora pelo limite de ${MAX_REFS} referências por estilo.` } : {});
}
function removerRef(marcaQ, estiloQ, n) {
  const m = exigirMarca(marcaQ), e = acharEstilo(m.id, estiloQ), i = Number(n) - 1;
  if (!(i >= 0 && i < e.referencias.length)) throw new Error(`referência ${n} não existe (o estilo tem ${e.referencias.length})`);
  if (e.referencias.length === 1) throw new Error('é a única referência: para apagar o estilo use "estilo excluir"');
  const [r] = e.referencias.splice(i, 1);
  const lix = path.join(dirEstilos(m.id), '_lixeira', `${e.slug}-${r.id}-${Date.now()}`); fs.mkdirSync(path.dirname(lix), { recursive: true });
  try { fs.renameSync(path.join(dirEstilo(m.id, e.slug), 'refs', r.id), lix); } catch (_) {}
  salvar(e); montarImagens(e); return carregar(m.id, e.slug);
}
function receita(marcaQ, estiloQ, texto) {
  const m = exigirMarca(marcaQ), e = acharEstilo(m.id, estiloQ);
  fs.writeFileSync(path.join(dirEstilo(m.id, e.slug), 'receita.md'), String(texto).trim() + '\n'); salvar(e); return carregar(m.id, e.slug);
}
// Arte aprovada nesse estilo: /api/design/arquivo/<criacao>/<arquivo> ou caminho
function exemplo(marcaQ, estiloQ, arte) {
  const m = exigirMarca(marcaQ), e = acharEstilo(m.id, estiloQ);
  const u = String(arte).match(/\/api\/design\/arquivo\/([\w-]+)\/([\w.-]+)/);
  const ex = u ? { criacao: u[1], arquivo: path.join(CRIA_DIR, u[1], u[2]), url: `/api/design/arquivo/${u[1]}/${u[2]}` } : { criacao: null, arquivo: path.resolve(arte), url: null };
  if (!fs.existsSync(ex.arquivo)) throw new Error('arte não encontrada: ' + arte);
  if (e.exemplos.some(x => x.arquivo === ex.arquivo)) return carregar(m.id, e.slug);
  e.exemplos.unshift(Object.assign(ex, { em: agora() })); e.exemplos = e.exemplos.slice(0, 20); salvar(e); return carregar(m.id, e.slug);
}
function correcao(marcaQ, estiloQ, texto) {
  const m = exigirMarca(marcaQ), e = acharEstilo(m.id, estiloQ);
  e.correcoes.push({ texto: String(texto).trim().slice(0, 500), em: agora() }); salvar(e); return carregar(m.id, e.slug);
}
function usar(marcaQ, estiloQ) {
  const m = exigirMarca(marcaQ), e = acharEstilo(m.id, estiloQ);
  e.usos = (e.usos || 0) + 1; e.ultimoUso = agora(); salvar(e); return carregar(m.id, e.slug);
}
function renomear(marcaQ, estiloQ, novo) {
  const m = exigirMarca(marcaQ), e = acharEstilo(m.id, estiloQ), slug = slugify(novo);
  if (!slug) throw new Error('nome vazio');
  if (slug !== e.slug && listar(m.id).some(x => x.slug === slug)) throw new Error(`já existe um estilo "${novo}"`);
  if (slug !== e.slug) { fs.renameSync(dirEstilo(m.id, e.slug), dirEstilo(m.id, slug)); fs.rmSync(espelho(m.id, e.slug), { recursive: true, force: true }); }
  const antigo = e.nome; e.slug = slug; e.nome = String(novo).trim().slice(0, 60);
  try { if (e.biblioteca && e.biblioteca.folderId) require('./knowledge').renomearPasta(e.biblioteca.folderId, e.nome); } catch (err) { console.error('[estilos] renomear na biblioteca', err.message); }
  salvar(e); montarImagens(e); return Object.assign(carregar(m.id, slug), { antigo });
}
// Excluir = mover pra _lixeira (dá pra recuperar). Na Biblioteca a pasta fica marcada como excluída.
function excluir(marcaQ, estiloQ) {
  const m = exigirMarca(marcaQ), e = acharEstilo(m.id, estiloQ);
  const lix = path.join(dirEstilos(m.id), '_lixeira', `${e.slug}-${Date.now()}`); fs.mkdirSync(path.dirname(lix), { recursive: true });
  fs.renameSync(dirEstilo(m.id, e.slug), lix); fs.rmSync(espelho(m.id, e.slug), { recursive: true, force: true });
  try { if (e.biblioteca && e.biblioteca.folderId) require('./knowledge').renomearPasta(e.biblioteca.folderId, `${e.nome} (estilo excluído)`); } catch (_) {}
  return { nome: e.nome, lixeira: lix };
}

// ─── Imagens que já existem no servidor (pra montar estilo sem mandar de novo) ─
// Prints que a pessoa anexou no chat (data/uploads/<sessão>/) e artes já criadas pelo Agente de Design.
// Chave de cada imagem: "chat:<sessão>/<arquivo>" ou "arte:<criação>/<arquivo>". Só resolve dentro dessas pastas.
const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const UPLOADS = path.join(DATA_DIR, 'uploads');
function enviados(email, admin, dias) {
  const desde = Date.now() - (dias || 120) * 86400e3, out = [];
  const rows = social.db.prepare(`SELECT m.session_id sid, m.attachments, m.created_at em, s.title, s.user_email FROM messages m JOIN sessions s ON s.id = m.session_id
    WHERE m.role = 'user' AND m.created_at >= ? AND m.attachments LIKE '%"kind":"image"%' ORDER BY m.created_at DESC`).all(desde);
  for (const r of rows) {
    if (!admin && r.user_email && r.user_email !== email) continue;
    let at = []; try { at = JSON.parse(r.attachments || '[]'); } catch (_) {}
    for (const a of at) {
      if (a.kind !== 'image' || !a.paths || !a.paths[0] || !fs.existsSync(a.paths[0])) continue;
      out.push({ chave: `chat:${r.sid}/${path.basename(a.paths[0])}`, nome: a.originalname || path.basename(a.paths[0]), em: r.em, conversa: r.title || 'Conversa', sid: r.sid });
    }
  }
  return out.slice(0, 400);
}
function artes() {
  // Todas as criações (o Jeff gera centenas por dia: limite cortava as de dias atrás). Miniatura: a mesma do Criações (?mini=1).
  const out = [];
  for (const r of social.db.prepare(`SELECT c.id, c.dados, c.versoes, c.created_at, c.updated_at, c.marca_id, m.nome marca FROM social_criacoes c LEFT JOIN social_marcas m ON m.id = c.marca_id ORDER BY c.created_at DESC`).all()) {
    let v = []; try { v = JSON.parse(r.versoes || '[]'); } catch (_) {}
    const ult = v[v.length - 1]; if (!ult || !(ult.imagens || []).length) continue;
    let d = {}; try { d = JSON.parse(r.dados || '{}'); } catch (_) {}
    const titulo = String(d.ideia || d.prompt || 'Arte').replace(/[*#]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 90);
    (ult.imagens || []).forEach((n, k) => out.push({ chave: `arte:${r.id}/${n}`, nome: titulo + (ult.imagens.length > 1 ? ` · lâmina ${k + 1}` : ''), em: r.created_at,
      conversa: titulo, grupo: r.id, marca: r.marca || '', marcaId: r.marca_id || '', url: `/api/design/arquivo/${r.id}/${n}`, mini: `/api/design/arquivo/${r.id}/${n}?mini=1` }));
  }
  return out;
}
// chave → caminho no disco (só dentro de uploads/ ou _criacoes/; a sessão do chat precisa ser da pessoa, salvo admin)
function caminhoDaChave(chave, email, admin) {
  const m = String(chave).match(/^(chat|arte):([\w-]+)\/([\w.-]+)$/); if (!m) throw new Error('imagem inválida: ' + chave);
  if (m[1] === 'chat') {
    const s = social.db.prepare(`SELECT user_email FROM sessions WHERE id = ?`).get(m[2]);
    if (!s || (!admin && s.user_email && s.user_email !== email)) throw new Error('imagem não encontrada: ' + chave);
  }
  const p = m[1] === 'chat' ? path.join(UPLOADS, m[2], m[3]) : path.join(CRIA_DIR, m[2], m[3]);
  if (!fs.existsSync(p)) throw new Error('imagem não encontrada: ' + chave);
  return p;
}
// miniatura (360 px) em cache, pra galeria não baixar cada print em tamanho cheio
function miniatura(p) {
  const dir = path.join(path.dirname(p), '_mini'), dst = path.join(dir, path.basename(p).replace(/\.\w+$/, '') + '.jpg');
  if (fs.existsSync(dst)) return dst;
  fs.mkdirSync(dir, { recursive: true });
  const r = spawnSync('python3', ['-I', '-c', 'import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert("RGB"); im.thumbnail((360,480)); im.save(sys.argv[2], quality=80)', p, dst], { encoding: 'utf8', timeout: 20000 });
  return r.status === 0 && fs.existsSync(dst) ? dst : p;
}

// ─── Rotas da aba Estilos (/api/design/estilos) ──────────────────────────────
const router = express.Router();
const upload = multer({ dest: path.join(require('os').tmpdir(), 'estilos-up'), limits: { fileSize: 25 * 1024 * 1024, files: MAX_REFS } });
const resp = (fn) => (req, res) => { try { res.json(fn(req)); } catch (e) { res.status(400).json({ error: e.message }); } };
const limparUp = (req) => (req.files || []).forEach(f => fs.rm(f.path, { force: true }, () => {}));
const publico = (e) => e && ({ aviso: e.aviso || null, max: MAX_REFS, slug: e.slug, nome: e.nome, criado: e.criado, atualizado: e.atualizado, usos: e.usos || 0, ultimoUso: e.ultimoUso, capa: e.capa,
  referencias: e.referencias.map((r, i) => ({ id: r.id, tipo: r.tipo, origem: r.origem, perfil: r.perfil, laminas: r.imagens.length, url: e.refsUrl[i] })),
  exemplos: e.exemplos.filter(x => x.url).map(x => ({ url: x.url, criacao: x.criacao, em: x.em })), correcoes: e.correcoes, receita: e.receita });
router.get('/imagens', resp(req => {
  const u = req.user || {}, admin = !!u.admin;
  const lista = req.query.tipo === 'artes' ? artes() : enviados(u.email, admin, +req.query.dias || 120).map(x => Object.assign(x, { url: `/api/chat/file/${x.sid}/${x.chave.split('/').pop()}` }));
  return { imagens: lista.map(x => x.mini ? x : Object.assign(x, { mini: '/api/design/estilos/mini?chave=' + encodeURIComponent(x.chave) })) };
}));
router.get('/mini', (req, res) => {
  try { const u = req.user || {}; res.set('Cache-Control', 'private, max-age=604800'); res.sendFile(miniatura(caminhoDaChave(req.query.chave, u.email, !!u.admin))); }
  catch (e) { res.status(404).end(); }
});
router.get('/', resp(req => { const m = exigirMarca(req.query.marca); return { marca: { id: m.id, nome: m.nome }, max: MAX_ESTILOS, estilos: listar(m.id).map(publico) }; }));
router.post('/', upload.array('files', MAX_REFS), (req, res) => {
  try { const links = String(req.body.links || '').split(/\s+/).filter(Boolean); const e = criar(req.body.marca, req.body.nome, [...(req.files || []).map(f => renomearUp(f)), ...escolhidas(req), ...links]); res.json(publico(e)); }
  catch (err) { res.status(400).json({ error: err.message }); } finally { limparUp(req); }
});
router.post('/:slug/refs', upload.array('files', MAX_REFS), (req, res) => {
  try { const links = String(req.body.links || '').split(/\s+/).filter(Boolean); res.json(publico(adicionar(req.body.marca, req.params.slug, [...(req.files || []).map(f => renomearUp(f)), ...escolhidas(req), ...links]))); }
  catch (err) { res.status(400).json({ error: err.message }); } finally { limparUp(req); }
});
router.delete('/:slug/refs/:n', resp(req => publico(removerRef(req.query.marca, req.params.slug, req.params.n))));
router.put('/:slug', express.json({ limit: '64kb' }), resp(req => {
  const b = req.body || {}; let e;
  if (b.nome) e = renomear(b.marca, req.params.slug, b.nome);
  if (typeof b.receita === 'string') e = receita(b.marca, e ? e.slug : req.params.slug, b.receita);
  return publico(e || acharEstilo(exigirMarca(b.marca).id, req.params.slug));
}));
router.delete('/:slug', resp(req => excluir(req.query.marca, req.params.slug)));
// imagens escolhidas na galeria (prints do chat e artes já criadas): chaves em JSON
function escolhidas(req) { let l = []; try { l = JSON.parse(req.body.escolhidas || '[]'); } catch (_) {} const u = req.user || {}; return (Array.isArray(l) ? l : []).slice(0, MAX_REFS).map(k => caminhoDaChave(k, u.email, !!u.admin)); }
// o multer salva sem extensão; o PIL abre pelo conteúdo, mas o nome original ajuda na origem
function renomearUp(f) { const p = f.path + (path.extname(f.originalname || '') || '.jpg'); fs.renameSync(f.path, p); f.path = p; return p; }

module.exports = { router, enviados, artes, caminhoDaChave, listar, acharMarca, exigirMarca, acharEstilo, carregar, criar, adicionar, removerRef, receita, exemplo, correcao, usar, renomear, excluir, MAX_ESTILOS, MAX_REFS, dirEstilo, BASE };
