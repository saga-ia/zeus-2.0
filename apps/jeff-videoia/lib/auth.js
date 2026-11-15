// Login do editor: mesmas pessoas e senhas da Central. Só Proprietário e Admin ativos (o editor roda IA e render
// neste servidor). A senha fica em central_users (worker.db, scrypt) e o papel/status em org_members (central.db).
// Sessão própria (cookie vsid), guardada em data/sessoes.json.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const WORKER_DB = process.env.WORKER_DB_PATH || '/opt/jeff-worker/data/worker.db';
const CENTRAL_DB = process.env.CENTRAL_DB_PATH || '/opt/jeff-apps/jeff-central/data/central.db';
const ARQ = path.join(__dirname, '..', 'data', 'sessoes.json');
const DIAS = 30;

const sessoes = new Map();
try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(ARQ, 'utf8')))) if (v.exp > Date.now()) sessoes.set(k, v); } catch (_) {}
const salvar = () => { try { fs.writeFileSync(ARQ, JSON.stringify(Object.fromEntries(sessoes)), { mode: 0o600 }); } catch (_) {} };

function abrir(p) { return new Database(p, { readonly: true, fileMustExist: true, timeout: 5000 }); }
const norm = (s) => String(s || '').trim().toLowerCase();

// pessoa ativa com papel que pode usar o editor; null se não pode
function membro(email) {
  const db = abrir(CENTRAL_DB);
  try {
    const m = db.prepare(`SELECT name, email, role, status FROM org_members WHERE lower(email) = ? AND email != ''`).get(norm(email));
    return m && m.status === 'ativo' && (m.role === 'owner' || m.role === 'admin') ? m : null;
  } finally { db.close(); }
}

function confere(email, senha) {
  const db = abrir(WORKER_DB);
  let u;
  try { u = db.prepare('SELECT email, password_hash, salt FROM central_users WHERE email = ?').get(norm(email)); } finally { db.close(); }
  if (!u) return null;
  const teste = crypto.scryptSync(String(senha), u.salt, 64);
  try { if (!crypto.timingSafeEqual(teste, Buffer.from(u.password_hash, 'hex'))) return null; } catch (_) { return null; }
  return membro(email);
}

const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));

function usuario(req) {
  const s = sessoes.get(cookies(req).vsid);
  if (!s || s.exp < Date.now()) return null;
  // revalida no máximo a cada 5 min: quem foi removido ou desativado na Central perde o acesso
  if (Date.now() - (s.conferido || 0) > 5 * 60 * 1000) {
    let m = null; try { m = membro(s.email); } catch (_) { return s; }
    if (!m) { sessoes.delete(cookies(req).vsid); salvar(); return null; }
    s.conferido = Date.now(); s.nome = m.name;
  }
  return s;
}

const tentativas = new Map();
function login(req, res) {
  const ip = req.headers['x-real-ip'] || req.socket.remoteAddress;
  const t = (tentativas.get(ip) || []).filter(x => x > Date.now() - 10 * 60 * 1000);
  if (t.length >= 8) return res.status(429).json({ erro: 'Muitas tentativas. Espere 10 minutos.' });
  const { email, senha } = req.body || {};
  let m = null;
  try { m = email && senha ? confere(email, senha) : null; } catch (e) { console.error('[videoia] login:', e.message); }
  if (!m) { t.push(Date.now()); tentativas.set(ip, t); return res.status(401).json({ erro: 'E-mail ou senha incorretos, ou sem acesso ao editor (só Proprietário e Admin).' }); }
  const tok = crypto.randomBytes(32).toString('hex');
  sessoes.set(tok, { email: norm(email), nome: m.name, exp: Date.now() + DIAS * 864e5, conferido: Date.now() });
  salvar();
  const seguro = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.set('Set-Cookie', `vsid=${tok}; HttpOnly; ${seguro ? 'Secure; ' : ''}Path=/; Max-Age=${DIAS * 86400}; SameSite=Lax`);
  res.json({ ok: true, nome: m.name });
}

function sair(req, res) {
  sessoes.delete(cookies(req).vsid); salvar();
  res.set('Set-Cookie', 'vsid=; Path=/; Max-Age=0');
  res.json({ ok: true });
}

module.exports = { usuario, login, sair };
