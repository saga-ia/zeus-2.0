// LinkedIn (API oficial): conecta o perfil pessoal via OAuth e administra os posts (rascunho, agendado, publicado).
// Produtos do app: "Share on LinkedIn" (w_member_social) e "Sign In with LinkedIn using OpenID Connect".
// Chaves em app_settings do worker.db: linkedin_client_id/secret (Jeff grava); o token do perfil é gravado aqui na conexão.
// Sem refresh token no app padrão: o token vale ~60 dias e a tela avisa quando precisar reconectar.
// Posts ficam em linkedin_posts (central.db) e as imagens em data/linkedin/<post>/; o agendador roda só no servidor.
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const WORKER_DB_PATH = process.env.WORKER_DB_PATH || '/opt/jeff-worker/data/worker.db';
const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const IMG_DIR = path.join(DATA_DIR, 'linkedin');
const PUBLIC_HOST = process.env.PUBLIC_HOST || 'central.jefersonhenrike.com';
const REDIRECT_URI = `https://${PUBLIC_HOST}/api/social/linkedin/callback`;
const SCOPES = 'openid profile email w_member_social';
// API versionada (rest/*): cada versão vale ~1 ano. Tenta da mais nova pra trás; a que funcionar fica guardada.
const VERSOES = ['202609', '202606', '202603', '202512', '202509'];
const MAX_IMAGENS = 9;
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };

// ─── Chaves (worker.db) ───────────────────────────────────────────────────────
function lerChave(nome) {
  const w = new Database(WORKER_DB_PATH, { readonly: true, fileMustExist: true });
  try { const r = w.prepare('SELECT value FROM app_settings WHERE key = ?').get(nome); return r && r.value ? String(r.value).trim() : null; }
  finally { w.close(); }
}
function gravarChaves(obj) {
  const w = new Database(WORKER_DB_PATH, { fileMustExist: true, timeout: 5000 });
  try {
    const st = w.prepare(`INSERT INTO app_settings(key, value, updated_at) VALUES(?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`);
    w.transaction(() => { for (const [k, v] of Object.entries(obj)) st.run(k, v == null ? '' : String(v)); })();
  } finally { w.close(); }
}

// ─── Posts (central.db) ───────────────────────────────────────────────────────
const db = new Database(path.join(DATA_DIR, 'central.db'), { timeout: 5000 });
db.exec(`CREATE TABLE IF NOT EXISTS linkedin_posts (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'rascunho',
  texto TEXT NOT NULL DEFAULT '',
  imagens TEXT NOT NULL DEFAULT '[]',
  agendado_para INTEGER,
  publicado_em INTEGER,
  urn TEXT,
  url TEXT,
  erro TEXT,
  origem TEXT,
  por TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_li_status ON linkedin_posts(status, agendado_para);`);
// Estratégia (linkedin-estrategia.js): pilar e formato do post, tipo 'newsletter' (só copiar e colar: a API não publica
// edição de newsletter) e a data sugerida pelo plano da semana (não agenda sozinha: alguém aprova antes)
for (const [c, t] of [['pilar', 'TEXT'], ['tipo', "TEXT NOT NULL DEFAULT 'post'"], ['formato', 'TEXT'], ['sugerido_para', 'INTEGER']]) {
  if (!db.prepare('PRAGMA table_info(linkedin_posts)').all().some(x => x.name === c)) db.exec(`ALTER TABLE linkedin_posts ADD COLUMN ${c} ${t}`);
}
const st = {
  get: db.prepare('SELECT * FROM linkedin_posts WHERE id = ?'),
  list: db.prepare('SELECT * FROM linkedin_posts ORDER BY COALESCE(publicado_em, agendado_para, updated_at) DESC LIMIT 200'),
  ins: db.prepare(`INSERT INTO linkedin_posts (id, status, texto, imagens, agendado_para, origem, por, pilar, tipo, formato, sugerido_para, created_at, updated_at)
    VALUES (@id, @status, @texto, @imagens, @agendado_para, @origem, @por, @pilar, @tipo, @formato, @sugerido_para, @t, @t)`),
  upd: db.prepare(`UPDATE linkedin_posts SET texto = @texto, imagens = @imagens, status = @status, agendado_para = @agendado_para,
    erro = NULL, updated_at = @t WHERE id = @id`),
  pegar: db.prepare(`UPDATE linkedin_posts SET status = 'publicando', updated_at = ? WHERE id = ? AND status IN ('rascunho','agendado','erro')`),
  ok: db.prepare(`UPDATE linkedin_posts SET status = 'publicado', publicado_em = ?, urn = ?, url = ?, erro = NULL, updated_at = ? WHERE id = ?`),
  falhou: db.prepare(`UPDATE linkedin_posts SET status = 'erro', erro = ?, updated_at = ? WHERE id = ?`),
  vencidos: db.prepare(`SELECT id FROM linkedin_posts WHERE status = 'agendado' AND agendado_para <= ? ORDER BY agendado_para LIMIT 5`),
  travados: db.prepare(`UPDATE linkedin_posts SET status = 'erro', erro = 'publicação interrompida (servidor reiniciou no meio); confira no LinkedIn antes de tentar de novo', updated_at = ? WHERE status = 'publicando' AND updated_at < ?`),
  del: db.prepare('DELETE FROM linkedin_posts WHERE id = ?'),
};
const novoId = () => crypto.randomBytes(9).toString('base64url');
const parse = (s, d) => { try { return JSON.parse(s); } catch (_) { return d; } };
function postPublico(r) {
  if (!r) return null;
  return {
    id: r.id, status: r.status, texto: r.texto, agendadoPara: r.agendado_para, publicadoEm: r.publicado_em,
    url: r.url, erro: r.erro, origem: r.origem, por: r.por, criadoEm: r.created_at, atualizadoEm: r.updated_at,
    imagens: parse(r.imagens, []).map(a => '/api/social/linkedin/img/' + r.id + '/' + a),
    engajamento: r.status === 'publicado' ? engResumo(r.id) : null,
    pilar: r.pilar || null, tipo: r.tipo || 'post', formato: r.formato || null, sugeridoPara: r.sugerido_para || null,
  };
}

// ─── Imagens: de onde podem vir ───────────────────────────────────────────────
// Referências aceitas: data URL (upload), /api/design/arquivo/<criação>/<arte> (Agente de Design),
// /api/chat/file/<sessão>/<arquivo> (anexo do chat), /api/social/linkedin/img/<post>/<arq> (outro post) e,
// só pelo terminal (CLI do ZEUS), caminho de arquivo local.
function lerImagem(ref, { local } = {}) {
  ref = String(ref || '').trim().replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '');
  let m;
  if ((m = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(ref))) return { buf: Buffer.from(m[2], 'base64'), mime: m[1] };
  let p = null;
  if ((m = /^\/api\/design\/arquivo\/([\w-]+)\/([\w.-]+)$/.exec(ref))) {
    const d = require('./design');
    p = d.arteNaPasta(path.basename(m[1]), path.basename(m[2])) || d.arteNaBiblioteca(path.basename(m[1]), path.basename(m[2]));
  } else if ((m = /^\/api\/chat\/file\/([\w-]+)\/([^/]+)$/.exec(ref))) {
    p = path.join(DATA_DIR, 'uploads', path.basename(m[1]), path.basename(decodeURIComponent(m[2])));
  } else if ((m = /^\/api\/social\/linkedin\/img\/([\w-]+)\/([\w.-]+)$/.exec(ref))) {
    p = path.join(IMG_DIR, path.basename(m[1]), path.basename(m[2]));
  } else if (local && path.isAbsolute(ref)) {
    p = ref;
  }
  if (!p || !fs.existsSync(p)) throw new Error('imagem não encontrada: ' + ref.slice(0, 120));
  const mime = MIME[path.extname(p).toLowerCase()];
  if (!mime) throw new Error('formato de imagem não aceito (use PNG, JPG, GIF ou WebP): ' + path.basename(p));
  return { buf: fs.readFileSync(p), mime };
}
// Copia as imagens pra pasta do post (o rascunho não depende do arquivo original continuar existindo)
function guardarImagens(id, refs, opts) {
  const dir = path.join(IMG_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const nomes = [];
  (refs || []).slice(0, MAX_IMAGENS).forEach((ref, k) => {
    const im = lerImagem(ref, opts);
    if (im.buf.length > 8 * 1024 * 1024) throw new Error('imagem acima de 8 MB');
    const nome = `img-${Date.now().toString(36)}-${k}${EXT[im.mime] || '.png'}`;
    fs.writeFileSync(path.join(dir, nome), im.buf);
    nomes.push(nome);
  });
  return nomes;
}
// Lista final de imagens: as que já são deste post ficam como estão, as novas são copiadas
function resolverImagens(id, refs, opts) {
  const atuais = new Set(parse((st.get.get(id) || {}).imagens, []));
  const final = [];
  for (const ref of (refs || []).slice(0, MAX_IMAGENS)) {
    const m = /\/api\/social\/linkedin\/img\/([\w-]+)\/([\w.-]+)/.exec(String(ref));
    if (m && m[1] === id && atuais.has(m[2])) final.push(m[2]);
    else final.push(...guardarImagens(id, [ref], opts));
  }
  return final;
}

// ─── Resposta do chat (markdown) → texto de LinkedIn ──────────────────────────
// O LinkedIn não renderiza markdown: tira marcação, blocos de código e imagens (que viram anexos do post).
function imagensDoMarkdown(md) {
  const urls = [];
  const add = u => { u = u.replace(/[?#].*$/, ''); if (!urls.includes(u)) urls.push(u); };
  for (const m of String(md || '').matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)) add(m[1]);
  for (const m of String(md || '').matchAll(/\/api\/design\/arquivo\/[\w-]+\/[\w.-]+\.(?:png|jpe?g|webp)/g)) add(m[0]);
  return urls.filter(u => /^\/api\/(design\/arquivo|chat\/file)\//.test(u.replace(/^https?:\/\/[^/]+/, ''))).slice(0, MAX_IMAGENS);
}
function textoDoMarkdown(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1: $2')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}[ \t]+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1')
    .replace(/(^|[ \t])\*([^*\n]+)\*(?=[ \t]|$|[.,!?])/gm, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '• ')
    .replace(/^[ \t]*\|?[ \t]*:?-{3,}[-|: \t]*$\n?/gm, '')
    .replace(/^[ \t]*\|(.+)\|[ \t]*$/gm, (_, l) => l.split('|').map(s => s.trim()).filter(Boolean).join(' · '))
    .replace(/^>[ \t]?/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 3000);
}

// ─── IA: escrever ou reescrever o post ────────────────────────────────────────
const IA_DIR = path.join(DATA_DIR, 'assist-workdir');
function claudeTexto(prompt, tempoMs) {
  const claudeSpawn = require('./claude-spawn');
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    if (!fs.existsSync(IA_DIR)) fs.mkdirSync(IA_DIR, { recursive: true });
    const p = spawn(claudeSpawn.CLAUDE_BIN, ['-p', '--output-format', 'text', '--model', 'sonnet',
      '--disallowedTools', 'Bash Edit Write NotebookEdit WebFetch WebSearch Task Agent Read Glob Grep', ...claudeSpawn.commonArgs({ light: true })],
      { cwd: IA_DIR, stdio: ['pipe', 'pipe', 'pipe'], env: claudeSpawn.claudeEnv() });
    let out = '', err = '';
    const t = setTimeout(() => { try { p.kill('SIGTERM'); } catch (_) {} }, tempoMs || 150000);
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('close', code => { clearTimeout(t); const ruim = claudeSpawn.checaSaida(out, err, code); if (ruim) return reject(new Error(ruim)); resolve(out.trim()); });
    p.on('error', e => { clearTimeout(t); reject(e); });
    p.stdin.on('error', () => {});
    p.stdin.end(prompt);
  });
}
const TONS = { autoridade: 'autoridade e opinião firme, de quem faz', historia: 'história pessoal com lição no fim', pratico: 'prático, em passos ou lista curta', provocativo: 'provocativo, contrariando uma crença comum do mercado', bastidor: 'bastidor do dia a dia da empresa' };
async function gerarTexto({ tema, base, tom, objetivo, tamanho, autor, pilar }) {
  let estrategia = '';
  try { estrategia = require('./linkedin-estrategia').blocoPrompt(null, pilar); } catch (e) { console.error('[linkedin] estratégia', e.message); }
  const alvo = { curto: '400 a 700 caracteres', medio: '900 a 1.500 caracteres', longo: '1.800 a 2.600 caracteres' }[tamanho] || '900 a 1.500 caracteres';
  const prompt = [
    `Você escreve posts de LinkedIn em PT-BR para ${autor || 'o dono da empresa'}, publicados no perfil pessoal dele.`,
    base ? 'Reescreva o conteúdo abaixo como um post de LinkedIn, mantendo os fatos e números.' : 'Escreva um post de LinkedIn sobre o tema abaixo.',
    tema ? `Tema / pedido: ${String(tema).slice(0, 2000)}` : '',
    base ? `=== Conteúdo base ===\n${String(base).slice(0, 8000)}\n=== Fim ===` : '',
    estrategia,
    tom ? `Tom deste post: ${TONS[tom] || tom}.` : (estrategia ? '' : 'Tom: profissional, direto e humano.'),
    objetivo ? `Objetivo do post: ${String(objetivo).slice(0, 300)}.` : '',
    `Tamanho: ${alvo}.`,
    'Regras:',
    '- As 2 primeiras linhas são o gancho: é o que aparece antes do "ver mais" (cerca de 200 caracteres). Precisam dar vontade de abrir.',
    '- Parágrafos de 1 a 3 linhas, com linha em branco entre eles. Lista com "•" quando ajudar.',
    '- Sem markdown (nada de **, #, links em colchetes). Sem travessão (— ou –): use vírgula, ponto ou dois-pontos.',
    '- Sem clichês de IA ("no mundo de hoje", "não é sobre X, é sobre Y", "vamos juntos", "jornada"). Escreva como gente.',
    '- Feche com uma pergunta ou chamada simples para comentar. No máximo 3 hashtags, na última linha.',
    '- Não invente dados, clientes ou números que não estejam no pedido.',
    'Responda SÓ com o texto do post, pronto para colar.',
  ].filter(Boolean).join('\n');
  const t = await claudeTexto(prompt);
  return t.replace(/^```\w*\n?|```$/g, '').trim().slice(0, 3000);
}

// ─── OAuth ────────────────────────────────────────────────────────────────────
function status() {
  const id = lerChave('linkedin_client_id'), secret = lerChave('linkedin_client_secret');
  const token = lerChave('linkedin_access_token'), exp = parseInt(lerChave('linkedin_token_expires_at') || '0', 10);
  const conectado = !!token && exp > Date.now();
  return {
    configurado: !!(id && secret),
    conectado,
    expirado: !!token && exp <= Date.now(),
    nome: conectado ? lerChave('linkedin_member_name') : null,
    expiraEm: conectado ? exp : null,
  };
}
const estados = new Map();
function urlAutorizacao(email) {
  const id = lerChave('linkedin_client_id');
  if (!id) throw new Error('linkedin_client_id não configurado');
  const state = crypto.randomBytes(16).toString('hex');
  estados.set(state, { email, t: Date.now() });
  for (const [k, v] of estados) if (Date.now() - v.t > 10 * 60000) estados.delete(k);
  const q = new URLSearchParams({ response_type: 'code', client_id: id, redirect_uri: REDIRECT_URI, state, scope: SCOPES });
  return 'https://www.linkedin.com/oauth/v2/authorization?' + q;
}
async function trocarCodigo(code) {
  const r = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI,
      client_id: lerChave('linkedin_client_id'), client_secret: lerChave('linkedin_client_secret') }),
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || 'HTTP ' + r.status);
  const u = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { authorization: 'Bearer ' + j.access_token }, signal: AbortSignal.timeout(20000) });
  const ui = await u.json().catch(() => ({}));
  if (!u.ok || !ui.sub) throw new Error('não consegui ler o perfil (userinfo HTTP ' + u.status + ')');
  gravarChaves({
    linkedin_access_token: j.access_token,
    linkedin_token_expires_at: Date.now() + (Number(j.expires_in) || 5184000) * 1000,
    linkedin_member_sub: ui.sub,
    linkedin_member_name: ui.name || [ui.given_name, ui.family_name].filter(Boolean).join(' '),
  });
  return { nome: ui.name };
}
function credencial() {
  const s = status();
  if (!s.conectado) throw new Error(s.expirado ? 'conexão com o LinkedIn expirou: reconecte na tela LinkedIn da Central' : 'LinkedIn não conectado: conecte na tela LinkedIn da Central');
  return { token: lerChave('linkedin_access_token'), autor: 'urn:li:person:' + lerChave('linkedin_member_sub') };
}

// ─── API de publicação ────────────────────────────────────────────────────────
async function rest(caminho, token, opts) {
  const salva = lerChave('linkedin_api_version');
  const ordem = salva ? [salva].concat(VERSOES.filter(v => v !== salva)) : VERSOES;
  let ultimo = null;
  for (const v of ordem) {
    const r = await fetch('https://api.linkedin.com/rest/' + caminho, Object.assign({}, opts, {
      headers: Object.assign({ authorization: 'Bearer ' + token, 'LinkedIn-Version': v, 'X-Restli-Protocol-Version': '2.0.0', 'content-type': 'application/json' }, (opts && opts.headers) || {}),
      signal: AbortSignal.timeout(60000),
    }));
    if (r.status === 426 || r.status === 400) {
      const txt = await r.text();
      if (/VERSION/i.test(txt)) { ultimo = txt; continue; }
      throw new Error('LinkedIn HTTP ' + r.status + ': ' + txt.slice(0, 300));
    }
    if (v !== salva) { try { gravarChaves({ linkedin_api_version: v }); } catch (_) {} }
    return r;
  }
  throw new Error('nenhuma versão da API do LinkedIn aceita: ' + String(ultimo).slice(0, 200));
}
async function subirImagem(token, autor, buf, mime) {
  const r = await rest('images?action=initializeUpload', token, { method: 'POST', body: JSON.stringify({ initializeUploadRequest: { owner: autor } }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.value) throw new Error('falha ao preparar imagem: HTTP ' + r.status + ' ' + JSON.stringify(j).slice(0, 200));
  const up = await fetch(j.value.uploadUrl, { method: 'PUT', headers: { authorization: 'Bearer ' + token, 'content-type': mime || 'image/png' }, body: buf, signal: AbortSignal.timeout(120000) });
  if (!up.ok) throw new Error('falha ao enviar imagem: HTTP ' + up.status);
  return j.value.image;
}
// O texto do post usa o formato "little text": esses caracteres precisam de barra antes, senão o post quebra ou corta
function escaparTexto(t) { return String(t).replace(/[\\|{}@\[\]()<>#*_~]/g, c => '\\' + c); }
// Hashtag no fim continua hashtag: o LinkedIn reconhece "#palavra" escrito como {hashtag|\#|palavra}
function textoParaApi(t) {
  return String(t).split(/(#[\p{L}\p{N}_]+)/u).map(p => /^#[\p{L}\p{N}_]+$/u.test(p) ? `{hashtag|\\#|${p.slice(1)}}` : escaparTexto(p)).join('');
}

// imagens: [{ buf, mime }] (0 a 9)
async function publicarAgora({ texto, imagens }) {
  if (!texto || !String(texto).trim()) throw new Error('texto vazio');
  if (String(texto).length > 3000) throw new Error('texto passa de 3.000 caracteres (limite do LinkedIn)');
  const { token, autor } = credencial();
  const corpo = {
    author: autor,
    commentary: textoParaApi(texto),
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };
  const ims = (imagens || []).slice(0, MAX_IMAGENS);
  const ids = [];
  for (const im of ims) ids.push(await subirImagem(token, autor, im.buf, im.mime));
  if (ids.length === 1) corpo.content = { media: { id: ids[0] } };
  else if (ids.length > 1) corpo.content = { multiImage: { images: ids.map(id => ({ id, altText: '' })) } };
  const r = await rest('posts', token, { method: 'POST', body: JSON.stringify(corpo) });
  if (r.status !== 201) { const txt = await r.text(); throw new Error('LinkedIn HTTP ' + r.status + ': ' + txt.slice(0, 300)); }
  const urn = r.headers.get('x-restli-id') || r.headers.get('x-linkedin-id') || '';
  return { urn, url: urn ? 'https://www.linkedin.com/feed/update/' + urn + '/' : null };
}

// ─── Posts: criar, editar, publicar, agendar ──────────────────────────────────
function criarPost({ texto, imagens, origem, por, agendadoPara, pilar, tipo, formato, sugeridoPara }, opts) {
  const id = novoId(), t = Date.now();
  const news = tipo === 'newsletter';
  if (news && agendadoPara) throw new Error('newsletter não é agendada pela API: ela fica pronta para copiar e colar no LinkedIn');
  const nomes = guardarImagens(id, imagens, opts);
  st.ins.run({ id, status: agendadoPara ? 'agendado' : 'rascunho', texto: String(texto || '').slice(0, news ? 20000 : 3000), imagens: JSON.stringify(nomes),
    agendado_para: agendadoPara || null, origem: origem || 'manual', por: por || null, pilar: pilar ? String(pilar).slice(0, 60) : null,
    tipo: news ? 'newsletter' : 'post', formato: formato || null, sugerido_para: sugeridoPara || null, t });
  return postPublico(st.get.get(id));
}
function editarPost(id, { texto, imagens, agendadoPara }) {
  const r = st.get.get(id);
  if (!r) throw new Error('post não encontrado');
  if (r.status === 'publicado' || r.status === 'publicando') throw new Error('post já publicado não pode ser editado aqui');
  const nomes = imagens === undefined ? parse(r.imagens, []) : resolverImagens(id, imagens);
  const quando = agendadoPara === undefined ? r.agendado_para : (agendadoPara || null);
  if (quando && r.tipo === 'newsletter') throw new Error('newsletter não é agendada pela API: copie o texto e publique no LinkedIn');
  if (quando && quando < Date.now() - 60000) throw new Error('horário de agendamento já passou');
  st.upd.run({ id, texto: texto === undefined ? r.texto : String(texto).slice(0, r.tipo === 'newsletter' ? 20000 : 3000), imagens: JSON.stringify(nomes),
    status: quando ? 'agendado' : 'rascunho', agendado_para: quando, t: Date.now() });
  return postPublico(st.get.get(id));
}
async function publicarPost(id) {
  const r = st.get.get(id);
  if (!r) throw new Error('post não encontrado');
  if (r.tipo === 'newsletter') throw new Error('a API do LinkedIn não publica edição de newsletter: copie o texto e publique pelo LinkedIn');
  // Rascunho do plano marca o que falta com [dado: ...] e [arte sugerida: ...]: isso nunca pode sair publicado
  const marca = /\[(dado|arte sugerida|preencher)\s*:[^\]]*\]/i.exec(r.texto || '');
  if (marca) { st.falhou.run('o texto ainda tem um marcador para preencher: ' + marca[0].slice(0, 80) + '. Complete ou apague e agende de novo.', Date.now(), id); throw new Error('o texto ainda tem um marcador para preencher (' + marca[0].slice(0, 60) + ')'); }
  if (!st.pegar.run(Date.now(), id).changes) throw new Error(r.status === 'publicado' ? 'esse post já foi publicado' : 'esse post já está sendo publicado');
  try {
    const imagens = parse(r.imagens, []).map(n => ({ buf: fs.readFileSync(path.join(IMG_DIR, id, n)), mime: MIME[path.extname(n).toLowerCase()] || 'image/png' }));
    const out = await publicarAgora({ texto: r.texto, imagens });
    const t = Date.now();
    st.ok.run(t, out.urn, out.url, t, id);
    console.log('[linkedin] publicado', id, out.urn);
    return postPublico(st.get.get(id));
  } catch (e) {
    st.falhou.run(String(e.message || e).slice(0, 500), Date.now(), id);
    console.error('[linkedin] falhou', id, e.message);
    throw e;
  }
}
function excluirPost(id) {
  const r = st.get.get(id);
  if (!r) return;
  if (r.status === 'publicando') throw new Error('post está sendo publicado agora');
  st.del.run(id);
  fs.rm(path.join(IMG_DIR, path.basename(id)), { recursive: true, force: true }, () => {});
}

// Agendador: só o servidor chama (a CLI do ZEUS também carrega este módulo e não pode publicar sozinha)
let _timer = null;
// ─── Engajamento dos posts publicados ─────────────────────────────────────────
// O app tem só "Share on LinkedIn": a leitura de REAÇÕES do próprio post funciona (tipo e quando, sem o nome de quem
// reagiu). Comentários (r_member_social) o LinkedIn fechou; impressões, alcance e totais de comentários e compartilhamentos
// vêm do memberCreatorPostAnalytics (r_member_postAnalytics, produto Community Management API, pedido à parte).
// Esse bloco tenta as estatísticas toda vez: se a permissão for liberada, elas aparecem sem mudar código.
// Cache em linkedin_engajamento (15 min); o agendador atualiza os posts dos últimos 30 dias.
db.exec(`CREATE TABLE IF NOT EXISTS linkedin_engajamento (post_id TEXT PRIMARY KEY, dados TEXT NOT NULL, erro TEXT, atualizado_em INTEGER NOT NULL)`);
const stEng = {
  get: db.prepare('SELECT * FROM linkedin_engajamento WHERE post_id = ?'),
  up: db.prepare(`INSERT INTO linkedin_engajamento (post_id, dados, erro, atualizado_em) VALUES (?, ?, ?, ?)
    ON CONFLICT(post_id) DO UPDATE SET dados = excluded.dados, erro = excluded.erro, atualizado_em = excluded.atualizado_em`),
  erro: db.prepare('UPDATE linkedin_engajamento SET erro = ?, atualizado_em = ? WHERE post_id = ?'),
  velhos: db.prepare(`SELECT p.id FROM linkedin_posts p LEFT JOIN linkedin_engajamento g ON g.post_id = p.id
    WHERE p.status = 'publicado' AND p.urn IS NOT NULL AND p.publicado_em > ? AND (g.atualizado_em IS NULL OR g.atualizado_em < ?)
    ORDER BY p.publicado_em DESC LIMIT 3`),
};
const ENG_CACHE = 15 * 60000;
const ENG_STATS = { IMPRESSION: 'impressoes', MEMBERS_REACHED: 'alcance', REACTION: 'reacoes', COMMENT: 'comentarios', RESHARE: 'compartilhamentos' };
const _engFazendo = new Map();
const diaBRT = ms => new Date(ms - 3 * 3600000).toISOString().slice(0, 10);

function engResumo(postId) {
  const g = stEng.get.get(postId);
  if (!g) return null;
  const d = parse(g.dados, {});
  return { reacoes: d.reacoes ? d.reacoes.total : null, impressoes: d.estatisticas ? d.estatisticas.impressoes : null,
    comentarios: d.estatisticas ? d.estatisticas.comentarios : null, atualizadoEm: g.atualizado_em };
}
async function lerReacoes(token, urn) {
  const out = { total: 0, porTipo: {}, pessoas: 0, paginas: 0, porDia: {}, primeira: null, ultima: null };
  for (let start = 0; start < 2000; start += 100) {
    const r = await rest(`reactions/(entity:${encodeURIComponent(urn)})?q=entity&sort=(value:REVERSE_CHRONOLOGICAL)&start=${start}&count=100`, token, { method: 'GET' });
    const t = await r.text();
    if (!r.ok) throw new Error('LinkedIn HTTP ' + r.status + ': ' + t.slice(0, 200));
    const j = parse(t, {}), els = j.elements || [];
    for (const el of els) {
      const quando = (el.created && el.created.time) || (el.lastModified && el.lastModified.time) || null;
      const quem = String((el.created && el.created.actor) || (el.lastModified && el.lastModified.actor) || '');
      out.total++;
      out.porTipo[el.reactionType || 'LIKE'] = (out.porTipo[el.reactionType || 'LIKE'] || 0) + 1;
      if (/^urn:li:organization:/.test(quem)) out.paginas++; else out.pessoas++;
      if (quando) {
        out.porDia[diaBRT(quando)] = (out.porDia[diaBRT(quando)] || 0) + 1;
        if (!out.primeira || quando < out.primeira) out.primeira = quando;
        if (!out.ultima || quando > out.ultima) out.ultima = quando;
      }
    }
    const total = j.paging && j.paging.total;
    if (els.length < 100 || (total != null && start + 100 >= total)) break;
  }
  return out;
}
// Estatísticas do post (impressões etc.). Sem a permissão: { semPermissao: true }, sem quebrar o resto.
async function lerEstatisticas(token, urn) {
  const tipo = /^urn:li:ugcPost:/.test(urn) ? 'ugc' : 'share';
  const out = {};
  for (const [q, nome] of Object.entries(ENG_STATS)) {
    const r = await rest(`memberCreatorPostAnalytics?q=entity&entity=(${tipo}:${encodeURIComponent(urn)})&queryType=${q}&aggregation=TOTAL`, token, { method: 'GET' });
    const t = await r.text();
    if (r.status === 403) return { semPermissao: true };
    if (!r.ok) throw new Error('LinkedIn HTTP ' + r.status + ': ' + t.slice(0, 200));
    const els = parse(t, {}).elements || [];
    out[nome] = els.reduce((s, el) => s + (Number(el.count) || 0), 0);
  }
  return out;
}
async function atualizarEngajamento(postId) {
  if (_engFazendo.has(postId)) return _engFazendo.get(postId);
  const pr = (async () => {
    const p = st.get.get(postId);
    if (!p || p.status !== 'publicado' || !p.urn) throw new Error('só posts publicados têm engajamento');
    const { token } = credencial();
    try {
      const reacoes = await lerReacoes(token, p.urn);
      let estatisticas = null, semPermissao = false;
      try { const e = await lerEstatisticas(token, p.urn); if (e.semPermissao) semPermissao = true; else estatisticas = e; }
      catch (e) { console.error('[linkedin] estatísticas', postId, e.message); }
      const dados = { reacoes, estatisticas, estatisticasSemPermissao: semPermissao };
      stEng.up.run(postId, JSON.stringify(dados), null, Date.now());
      return dados;
    } catch (e) {
      if (stEng.get.get(postId)) stEng.erro.run(String(e.message).slice(0, 300), Date.now(), postId);
      else stEng.up.run(postId, '{}', String(e.message).slice(0, 300), Date.now());
      throw e;
    }
  })();
  _engFazendo.set(postId, pr);
  try { return await pr; } finally { _engFazendo.delete(postId); }
}
async function engajamento(postId, forcar) {
  const g = stEng.get.get(postId);
  const idade = g ? Date.now() - g.atualizado_em : Infinity;
  if (!g || idade > ENG_CACHE || (forcar && idade > 60000)) {
    try { await atualizarEngajamento(postId); }
    catch (e) { if (!g) throw e; } // com cache: mostra o último dado e o erro
  }
  const r = stEng.get.get(postId);
  return Object.assign({ atualizadoEm: r.atualizado_em, erro: r.erro || null }, parse(r.dados, {}));
}

function iniciarAgendador() {
  if (_timer) return;
  st.travados.run(Date.now(), Date.now() - 10 * 60000);
  const tick = async () => {
    try {
      for (const { id } of st.vencidos.all(Date.now())) {
        try { await publicarPost(id); } catch (_) {}
      }
    } catch (e) { console.error('[linkedin] agendador', e.message); }
    try {
      if (status().conectado) for (const { id } of stEng.velhos.all(Date.now() - 30 * 86400000, Date.now() - 30 * 60000)) {
        try { await atualizarEngajamento(id); } catch (e) { console.error('[linkedin] engajamento', id, e.message); }
      }
    } catch (e) { console.error('[linkedin] engajamento', e.message); }
    try { require('./linkedin-estrategia').tickAuto(); } catch (e) { console.error('[linkedin] plano automático', e.message); }
  };
  _timer = setInterval(tick, 60000);
  _timer.unref();
  setTimeout(tick, 15000).unref();
}

// Artes recentes do Agente de Design (pra escolher no editor)
function artesRecentes(limite) {
  const rows = db.prepare(`SELECT c.id, c.formato, c.updated_at, c.versoes, m.nome AS marca FROM social_criacoes c
    LEFT JOIN social_marcas m ON m.id = c.marca_id WHERE c.status = 'pronto' ORDER BY c.updated_at DESC LIMIT ?`).all(limite || 24);
  const out = [];
  for (const r of rows) {
    const vs = parse(r.versoes, []); const v = vs[vs.length - 1];
    if (!v || !Array.isArray(v.imagens)) continue;
    out.push({ criacao: r.id, marca: r.marca || '', formato: r.formato, quando: r.updated_at,
      imagens: v.imagens.filter(n => /\.(png|jpe?g|webp)$/i.test(n)).map(n => `/api/design/arquivo/${r.id}/${n}`) });
  }
  return out;
}

// ─── Rotas (/api/social/linkedin) ─────────────────────────────────────────────
const router = express.Router();
const soAdmin = (req, res, next) => (req.user && req.user.admin) ? next() : res.status(403).json({ error: 'Só administradores da conta podem fazer isso.' });
const erro = (res, e, code) => res.status(code || 400).json({ error: e.message || String(e) });
const json = express.json({ limit: '40mb' });

router.get('/status', (_req, res) => { try { res.json(status()); } catch (e) { erro(res, e, 500); } });
router.get('/conectar', soAdmin, (req, res) => {
  try { res.redirect(urlAutorizacao(req.user && req.user.email)); }
  catch (e) { res.redirect('/linkedin?erro=' + encodeURIComponent(e.message)); }
});
router.get('/callback', soAdmin, async (req, res) => {
  const { code, state, error, error_description } = req.query;
  if (error) return res.redirect('/linkedin?erro=' + encodeURIComponent(error_description || error));
  if (!state || !estados.has(String(state))) return res.redirect('/linkedin?erro=' + encodeURIComponent('link de conexão expirado, tente de novo'));
  estados.delete(String(state));
  try { await trocarCodigo(String(code || '')); res.redirect('/linkedin?ok=1'); }
  catch (e) { console.error('[linkedin] callback', e.message); res.redirect('/linkedin?erro=' + encodeURIComponent(e.message)); }
});
router.post('/desconectar', soAdmin, (_req, res) => {
  try { gravarChaves({ linkedin_access_token: '', linkedin_token_expires_at: '0' }); res.json({ ok: true }); }
  catch (e) { erro(res, e, 500); }
});

router.get('/posts', (_req, res) => { try { res.json({ posts: st.list.all().map(postPublico) }); } catch (e) { erro(res, e, 500); } });
router.get('/posts/:id/engajamento', async (req, res) => {
  try { res.json(await engajamento(req.params.id, req.query.forcar === '1')); } catch (e) { erro(res, e); }
});
router.get('/posts/:id', (req, res) => { const p = postPublico(st.get.get(req.params.id)); p ? res.json(p) : res.status(404).json({ error: 'post não encontrado' }); });
router.post('/posts', soAdmin, json, (req, res) => {
  const b = req.body || {};
  try { res.json(criarPost({ texto: b.texto, imagens: b.imagens, origem: b.origem || 'manual', por: req.user.email, agendadoPara: b.agendadoPara || null })); }
  catch (e) { erro(res, e); }
});
// Resposta do chat vira rascunho: texto sem markdown + imagens da resposta como anexos
router.post('/posts/do-chat', soAdmin, json, (req, res) => {
  const b = req.body || {};
  try {
    const md = String(b.conteudo || '');
    const imagens = imagensDoMarkdown(md);
    const ok = [];
    for (const u of imagens) { try { lerImagem(u); ok.push(u); } catch (_) {} }
    res.json(criarPost({ texto: textoDoMarkdown(md), imagens: ok, origem: 'chat', por: req.user.email }));
  } catch (e) { erro(res, e); }
});
router.put('/posts/:id', soAdmin, json, (req, res) => {
  const b = req.body || {};
  try { res.json(editarPost(req.params.id, { texto: b.texto, imagens: b.imagens, agendadoPara: b.agendadoPara })); }
  catch (e) { erro(res, e); }
});
router.post('/posts/:id/publicar', soAdmin, async (req, res) => {
  try { res.json(await publicarPost(req.params.id)); }
  catch (e) { erro(res, e); }
});
router.delete('/posts/:id', soAdmin, (req, res) => { try { excluirPost(req.params.id); res.json({ ok: true }); } catch (e) { erro(res, e); } });
router.post('/gerar', soAdmin, json, async (req, res) => {
  const b = req.body || {};
  if (!String(b.tema || '').trim() && !String(b.base || '').trim()) return res.status(400).json({ error: 'diga o tema do post' });
  try { res.json({ texto: await gerarTexto({ tema: b.tema, base: b.base, tom: b.tom, objetivo: b.objetivo, tamanho: b.tamanho, pilar: b.pilar, autor: lerChave('linkedin_member_name') || req.user.name }) }); }
  catch (e) { erro(res, e, 500); }
});
router.get('/artes', (_req, res) => { try { res.json({ artes: artesRecentes(24) }); } catch (e) { erro(res, e, 500); } });
// Miniaturas em JPG (cache em <post>/_mini): a tela nunca baixa o PNG original (até 1,5 MB cada), só a publicação usa ele.
// ?mini=p → 240 px (lista) · ?mini=1 → 720 px (editor e prévia)
const _miniFazendo = new Map(), _miniFila = [];
let _miniAtivos = 0;
function _miniProxima() {
  while (_miniAtivos < 2 && _miniFila.length) {
    const { src, dst, larg, ok } = _miniFila.shift(); _miniAtivos++;
    const tmp = dst + '.tmp.jpg';
    require('child_process').execFile('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', `scale='min(${larg},iw)':-2`, '-q:v', '4', tmp], { timeout: 30000 }, err => {
      _miniAtivos--;
      if (!err) { try { fs.renameSync(tmp, dst); } catch (_) { err = true; } }
      if (err) { try { fs.rmSync(tmp, { force: true }); } catch (_) {} }
      ok(!err); _miniProxima();
    });
  }
}
function miniatura(src, larg) {
  const dir = path.join(path.dirname(src), '_mini'), dst = path.join(dir, path.basename(src).replace(/\.\w+$/, '') + '-' + larg + '.jpg');
  if (fs.existsSync(dst)) return Promise.resolve(dst);
  if (_miniFazendo.has(dst)) return _miniFazendo.get(dst);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  const pr = new Promise(ok => { _miniFila.push({ src, dst, larg, ok }); _miniProxima(); }).then(feito => { _miniFazendo.delete(dst); return feito ? dst : null; });
  _miniFazendo.set(dst, pr);
  return pr;
}
router.get('/img/:id/:arq', async (req, res) => {
  let p = path.join(IMG_DIR, path.basename(req.params.id), path.basename(req.params.arq));
  if (!fs.existsSync(p)) return res.status(404).end();
  if (req.query.mini) { const m = await miniatura(p, req.query.mini === 'p' ? 240 : 720); if (m) p = m; }
  res.set('Cache-Control', 'private, max-age=604800');
  res.sendFile(p);
});

module.exports = { router, status, engajamento, claudeTexto, criarPost, editarPost, publicarPost, publicarAgora, gerarTexto, textoDoMarkdown, imagensDoMarkdown, iniciarAgendador, postPublico, st };
