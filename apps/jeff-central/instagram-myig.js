// Aba Instagram da Central: tela nativa (public/instagram.js) por cima do myIG (zeuschatig, porta 3060), o gerenciador
// de agentes de IA que respondem DMs do @jeffhenrike. O motor (myig-dispatcher, que lê os eventos do webhook, roda o
// claude e envia a DM) continua rodando lá: a Central só faz o CRUD pela API dele, já autenticada.
//   /api/instagram/p/<caminho>  -> http://127.0.0.1:3060/api/<caminho> (inclui o SSE /stream, repassado em fluxo)
// Autenticação: o myIG aceita o header x-session-token com um token da tabela admin_sessions. A Central cria esse
// token direto no banco do myIG (mesmo servidor), para o usuário admin configurado, com validade de 30 dias.
const express = require('express');
const crypto = require('crypto');
const http = require('http');
const path = require('path');
const Database = require('better-sqlite3');

const MYIG_HOST = process.env.MYIG_HOST || '127.0.0.1';
const MYIG_PORT = parseInt(process.env.MYIG_PORT || '3060', 10);
const MYIG_DB = process.env.MYIG_DB || '/opt/jeff-apps/zeuschatig/data/zeuschatig.db';
const MYIG_UID = parseInt(process.env.MYIG_ADMIN_UID || '1', 10);
const MYIG_URL = (process.env.MYIG_URL || 'https://myig.jefersonhenrike.com').replace(/\/+$/, '');

let _token = null, _tokenExp = 0;
function sessao(forcar) {
  if (_token && !forcar && Date.now() < _tokenExp - 3600000) return _token;
  const db = new Database(MYIG_DB, { timeout: 5000 });
  try {
    const u = db.prepare('SELECT id FROM admin_users WHERE id = ?').get(MYIG_UID);
    if (!u) throw new Error('usuário admin ' + MYIG_UID + ' não existe no myIG');
    // limpa sessões vencidas (o myIG não faz isso) e a sessão anterior da Central
    db.prepare("DELETE FROM admin_sessions WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')").run();
    if (_token) db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(_token);
    const token = crypto.randomBytes(32).toString('hex');
    const exp = new Date(Date.now() + 30 * 86400000);
    db.prepare('INSERT INTO admin_sessions (token, admin_user_id, expires_at) VALUES (?, ?, ?)').run(token, MYIG_UID, exp.toISOString());
    _token = token; _tokenExp = exp.getTime();
    return token;
  } finally { db.close(); }
}

const router = express.Router();
router.use((req, res, next) => {
  if (!req.user || !req.user.admin) return res.status(403).json({ error: 'Só administradores da conta acessam o Instagram.' });
  next();
});
router.get('/info', (req, res) => res.json({ url: MYIG_URL }));

router.use('/p', (req, res) => {
  const caminho = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  if (/^\/api\/auth\//.test(caminho)) return res.status(403).json({ error: 'Esse recurso não é exposto pela Central.' });
  const stream = /^\/api\/stream(\?|$)/.test(caminho);
  const partes = [];
  req.on('data', c => partes.push(c));
  req.on('end', () => {
    const corpo = Buffer.concat(partes);
    let tentativa = 0;
    const enviar = () => {
      let token;
      try { token = sessao(tentativa > 0); } catch (e) { return res.status(500).json({ error: 'Não consegui autenticar no myIG: ' + e.message }); }
      const headers = { 'content-type': req.headers['content-type'] || 'application/json', 'content-length': corpo.length, 'x-session-token': token, accept: stream ? 'text/event-stream' : 'application/json', 'x-central-user': req.user.email || '' };
      const up = http.request({ host: MYIG_HOST, port: MYIG_PORT, path: caminho, method: req.method, headers, timeout: stream ? 0 : 60000 }, r => {
        if (r.statusCode === 401 && tentativa === 0) { tentativa++; r.resume(); return enviar(); }
        const h = { 'content-type': r.headers['content-type'] || 'application/json' };
        if (stream) { h['cache-control'] = 'no-cache'; h.connection = 'keep-alive'; h['x-accel-buffering'] = 'no'; }
        else if (r.headers['content-length']) h['content-length'] = r.headers['content-length'];
        res.writeHead(r.statusCode || 502, h);
        if (stream && res.flushHeaders) res.flushHeaders();
        r.pipe(res);
        if (stream) req.on('close', () => { try { up.destroy(); } catch (_) {} });
      });
      up.on('timeout', () => up.destroy(new Error('tempo esgotado')));
      up.on('error', e => {
        if (res.headersSent) return res.end();
        console.error('[instagram] proxy', req.method, caminho, e.message);
        res.status(502).json({ error: 'O myIG não respondeu (' + e.message + '). Veja se o zeuschatig está no ar.' });
      });
      up.end(corpo);
    };
    enviar();
  });
});

// ─── Perfil de quem mandou a DM (nome, @ e foto) ───────────────────────────────────────────────────────────────
// O myIG grava só o id interno do remetente. A API do Instagram Login devolve o perfil a partir desse id, com o token
// da conta (worker.db, só leitura). O resultado fica gravado em contacts do myIG, então cada pessoa é consultada uma vez.
const https = require('https');
const WORKER_DB = process.env.WORKER_DB || '/opt/jeff-worker/data/worker.db';
function tokenIG() {
  const db = new Database(WORKER_DB, { readonly: true, timeout: 5000 });
  try { const r = db.prepare("SELECT value FROM app_settings WHERE key = 'jeff_instagram_login_token'").get(); if (!r || !r.value) throw new Error('token do Instagram não configurado'); return r.value; } finally { db.close(); }
}
function graphGet(caminho) {
  return new Promise((resolve, reject) => {
    https.get('https://graph.instagram.com/v21.0' + caminho, { timeout: 15000 }, r => { let t = ''; r.on('data', c => { t += c; }); r.on('end', () => { try { resolve(JSON.parse(t)); } catch (_) { reject(new Error('resposta inválida do Instagram')); } }); })
      .on('error', reject).on('timeout', function () { this.destroy(new Error('tempo esgotado')); });
  });
}
const _perfilCache = new Map(); // igsid -> { em, perfil|null }
async function perfilDe(igsid) {
  igsid = String(igsid || '').replace(/\D/g, ''); if (!igsid) return null;
  const c = _perfilCache.get(igsid); if (c && Date.now() - c.em < 6 * 3600000) return c.perfil;
  const j = await graphGet('/' + igsid + '?fields=name,username,profile_pic,follower_count,is_user_follow_business,is_business_follow_user&access_token=' + encodeURIComponent(tokenIG()));
  if (j.error) { const perm = /#100|#200|#10\b/.test(j.error.message || ''); _perfilCache.set(igsid, { em: Date.now(), perfil: null, erro: j.error.message }); if (!perm) throw new Error(j.error.message); return null; }
  const perfil = { igsid, username: j.username || null, name: j.name || null, pic: j.profile_pic || null, seguidores: j.follower_count == null ? null : j.follower_count, segueVoce: !!j.is_user_follow_business, voceSegue: !!j.is_business_follow_user };
  _perfilCache.set(igsid, { em: Date.now(), perfil });
  return perfil;
}
// Grava no myIG (contacts.ig_username / ig_name; foto e seguidores em attributes) para o dispatcher e o próprio myIG usarem
function gravarPerfil(perfil) {
  const db = new Database(MYIG_DB, { timeout: 5000 });
  try {
    const c = db.prepare('SELECT id, attributes FROM contacts WHERE ig_sender_id = ?').get(perfil.igsid); if (!c) return false;
    let attrs = {}; try { attrs = JSON.parse(c.attributes || '{}') || {}; } catch (_) {}
    attrs.profile_pic = perfil.pic; attrs.follower_count = perfil.seguidores; attrs.perfil_em = new Date().toISOString();
    db.prepare('UPDATE contacts SET ig_username = COALESCE(?, ig_username), ig_name = COALESCE(?, ig_name), attributes = ? WHERE id = ?').run(perfil.username, perfil.name, JSON.stringify(attrs), c.id);
    return true;
  }
  finally { db.close(); }
}
// POST /api/instagram/perfis { ids: [igsid...] } -> { perfis: { igsid: {username,name,pic,...} } } (até 40 por chamada; grava o que achar)
router.post('/perfis', express.json({ limit: '64kb' }), async (req, res) => {
  const ids = [...new Set(((req.body && req.body.ids) || []).map(x => String(x || '').replace(/\D/g, '')).filter(Boolean))].slice(0, 40);
  const perfis = {}; let erro = null;
  for (const id of ids) {
    try { const p = await perfilDe(id); if (p) { perfis[id] = p; try { gravarPerfil(p); } catch (e) { console.error('[instagram] gravar perfil', e.message); } } }
    catch (e) { erro = e.message; if (/token|OAuth|expired|Session has expired/i.test(e.message)) break; }
  }
  res.json({ perfis, erro });
});

module.exports = { router, sessao, perfilDe, gravarPerfil };

// ─── Base de conhecimento dos agentes do Instagram (RAG) ──────────────────────────────────────────────────────────
// Cada agente do myIG pode usar a Biblioteca da Central: nenhuma, toda, ou só algumas pastas (com as subpastas).
// Na hora de responder uma DM, o myig-dispatcher pede aqui os trechos mais relevantes para a mensagem e põe no prompt.
// Configuração na tabela ig_agent_kb do central.db. A busca usa o mesmo índice da Biblioteca (knowledge.js).
const fs = require('fs');
const CENTRAL_DATA = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
let _cdb = null;
function cdb() {
  if (_cdb) return _cdb;
  _cdb = new Database(path.join(CENTRAL_DATA, 'central.db'), { timeout: 5000 });
  _cdb.exec(`CREATE TABLE IF NOT EXISTS ig_agent_kb (agent_id INTEGER PRIMARY KEY, modo TEXT NOT NULL DEFAULT 'nenhuma', pastas TEXT NOT NULL DEFAULT '[]', updated_at INTEGER)`);
  return _cdb;
}
function kbCfg(agentId) {
  const r = cdb().prepare('SELECT modo, pastas FROM ig_agent_kb WHERE agent_id = ?').get(parseInt(agentId, 10));
  let pastas = []; try { pastas = JSON.parse((r && r.pastas) || '[]'); } catch (_) {}
  return { modo: r ? r.modo : 'nenhuma', pastas: Array.isArray(pastas) ? pastas.map(String) : [] };
}
// pastas escolhidas + todas as subpastas delas
function comSubpastas(ids) {
  const filhos = {}; cdb().prepare('SELECT id, parent_id FROM kb_folders').all().forEach(f => { (filhos[f.parent_id || ''] = filhos[f.parent_id || ''] || []).push(f.id); });
  const out = new Set(), pilha = [...ids];
  while (pilha.length) { const id = pilha.pop(); if (out.has(id)) continue; out.add(id); (filhos[id] || []).forEach(x => pilha.push(x)); }
  return out;
}
function docsDaBase(cfg) {
  if (cfg.modo === 'nenhuma') return 0;
  if (cfg.modo === 'tudo') return cdb().prepare(`SELECT COUNT(*) AS n FROM kb_docs WHERE status = 'indexed' AND enabled = 1`).get().n;
  const ps = [...comSubpastas(cfg.pastas)]; if (!ps.length) return 0;
  return cdb().prepare(`SELECT COUNT(*) AS n FROM kb_docs WHERE status = 'indexed' AND enabled = 1 AND folder_id IN (${ps.map(() => '?').join(',')})`).get(...ps).n;
}
function ragPara(agentId, texto) {
  const cfg = kbCfg(agentId);
  if (cfg.modo === 'nenhuma' || !String(texto || '').trim()) return { texto: '', trechos: 0 };
  let hits = require('./knowledge').search(String(texto).slice(0, 2000), 40);
  if (cfg.modo === 'pastas') { const ok = comSubpastas(cfg.pastas); hits = hits.filter(h => h.folderId && ok.has(h.folderId)); }
  hits = hits.slice(0, 6);
  if (!hits.length) return { texto: '', trechos: 0 };
  const L = ['=== Base de conhecimento (trechos relevantes para esta mensagem) ==='];
  let usado = 0;
  for (const h of hits) { const corpo = h.text.length > 1500 ? h.text.slice(0, 1500) + '…' : h.text; if (usado + corpo.length > 7000) break; usado += corpo.length; L.push(`--- [${h.title}] ---`, corpo); }
  L.push('=== Fim da base de conhecimento ===');
  return { texto: L.join('\n'), trechos: L.length };
}
router.get('/kb/:agentId', (req, res) => {
  try { const cfg = kbCfg(req.params.agentId); res.json(Object.assign({ ok: true, docs: docsDaBase(cfg) }, cfg)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/kb/:agentId', express.json({ limit: '64kb' }), (req, res) => {
  const id = parseInt(req.params.agentId, 10); if (!id) return res.status(400).json({ error: 'agente inválido' });
  const b = req.body || {}, modo = ['nenhuma', 'tudo', 'pastas'].includes(b.modo) ? b.modo : 'nenhuma';
  const existe = new Set(cdb().prepare('SELECT id FROM kb_folders').all().map(f => f.id));
  const pastas = [...new Set((Array.isArray(b.pastas) ? b.pastas : []).map(String))].filter(p => existe.has(p)).slice(0, 100);
  cdb().prepare(`INSERT INTO ig_agent_kb (agent_id, modo, pastas, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(agent_id) DO UPDATE SET modo = excluded.modo, pastas = excluded.pastas, updated_at = excluded.updated_at`)
    .run(id, modo === 'pastas' && !pastas.length ? 'nenhuma' : modo, JSON.stringify(pastas), Date.now());
  const cfg = kbCfg(id); res.json(Object.assign({ ok: true, docs: docsDaBase(cfg) }, cfg));
});
// Pasta própria do agente na Biblioteca ("Agentes do Instagram / <nome>"), já marcada como base dele
router.post('/kb/:agentId/pasta', express.json({ limit: '16kb' }), (req, res) => {
  const id = parseInt(req.params.agentId, 10); if (!id) return res.status(400).json({ error: 'agente inválido' });
  try {
    const k = require('./knowledge');
    const raiz = k.garantirPasta('Agentes do Instagram', null, req.user.email || 'Instagram');
    const pasta = k.garantirPasta(String((req.body && req.body.nome) || 'Agente ' + id).slice(0, 80), raiz, req.user.email || 'Instagram');
    const cfg = kbCfg(id); const pastas = cfg.modo === 'pastas' ? [...new Set(cfg.pastas.concat(pasta))] : cfg.modo === 'tudo' ? cfg.pastas : [pasta];
    const modo = cfg.modo === 'tudo' ? 'tudo' : 'pastas';
    cdb().prepare(`INSERT INTO ig_agent_kb (agent_id, modo, pastas, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(agent_id) DO UPDATE SET modo = excluded.modo, pastas = excluded.pastas, updated_at = excluded.updated_at`).run(id, modo, JSON.stringify(pastas), Date.now());
    res.json({ ok: true, pasta, modo, pastas });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Chamada interna do myig-dispatcher (mesmo servidor): só aceita conexão local e o token do arquivo abaixo.
const RAG_TOKEN_FILE = path.join(CENTRAL_DATA, '.ig-rag-token');
function ragToken() {
  try { const t = fs.readFileSync(RAG_TOKEN_FILE, 'utf8').trim(); if (t.length >= 32) return t; } catch (_) {}
  const t = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(RAG_TOKEN_FILE, t, { mode: 0o600 }); return t;
}
ragToken();
function ragInterno(req, res) {
  const ip = String(req.socket.remoteAddress || '');
  if (!/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(ip) || req.headers['x-forwarded-for']) return res.status(403).json({ error: 'só local' });
  const tok = String(req.headers['x-rag-token'] || '');
  const certo = ragToken();
  if (tok.length !== certo.length || !crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(certo))) return res.status(403).json({ error: 'token inválido' });
  try { const b = req.body || {}; res.json(Object.assign({ ok: true }, ragPara(b.agent_id, b.texto))); }
  catch (e) { console.error('[instagram] rag', e.message); res.status(500).json({ error: e.message }); }
}
module.exports.ragInterno = ragInterno;
module.exports.ragPara = ragPara;
