// Aba WhatsApp da Central: tela nativa (public/whatsapp.js) por cima do motor de SDRs (jeff-sdrs, porta 3041).
// O motor (sessões do whatsapp-web.js, IA, disparos, maturação) continua no jeff-sdrs: duplicar aqui abriria duas
// conexões no mesmo número e derrubaria as sessões. A Central só faz a ponte:
//   /api/whatsapp/sso           -> link de login único no jeff-sdrs (abrir o sistema original em nova aba)
//   /api/whatsapp/p/<caminho>   -> repassa para http://127.0.0.1:3041/api/<caminho> já autenticado
// A autenticação no jeff-sdrs é um JWT HS256 no cookie disp_session, assinado com o JWT_SECRET dele (lido do .env
// do jeff-sdrs na hora, nunca copiado nem exposto). O payload segue o sign() de jeff-sdrs/src/auth.js.
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');

const SDRS_URL = (process.env.SDRS_URL || 'https://sdrs.jefersonhenrike.com').replace(/\/+$/, '');
const SDRS_HOST = process.env.SDRS_HOST || '127.0.0.1';
const SDRS_PORT = parseInt(process.env.SDRS_PORT || '3041', 10);
const SDRS_ENV = process.env.SDRS_ENV || '/opt/jeff-apps/jeff-sdrs/.env';
const SDRS_UID = parseInt(process.env.SDRS_SSO_UID || '1', 10); // usuário "jeff" (admin) do jeff-sdrs
const SDRS_USER = process.env.SDRS_SSO_USER || 'jeff';

let _segredo = null, _segredoEm = 0;
function segredo() {
  if (_segredo && Date.now() - _segredoEm < 60000) return _segredo;
  const linha = fs.readFileSync(SDRS_ENV, 'utf8').split('\n').find(l => /^\s*JWT_SECRET\s*=/.test(l));
  const v = linha ? linha.replace(/^\s*JWT_SECRET\s*=\s*/, '').trim().replace(/^["']|["']$/g, '') : '';
  if (!v || v === 'dev-secret-change-me') throw new Error('JWT_SECRET do jeff-sdrs não configurado');
  _segredo = v; _segredoEm = Date.now();
  return v;
}
const b64url = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function jwtHS256(payload, chave) {
  const corpo = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' + b64url(JSON.stringify(payload));
  return corpo + '.' + b64url(crypto.createHmac('sha256', chave).update(corpo).digest());
}
// Cookie de sessão do jeff-sdrs, válido por 10 min (renovado a cada chamada; cada pedido leva um novo)
function cookieSessao() {
  const agora = Math.floor(Date.now() / 1000);
  return 'disp_session=' + jwtHS256({ uid: SDRS_UID, u: SDRS_USER, r: 'admin', via: 'central', iat: agora, exp: agora + 600 }, segredo());
}

const router = express.Router();
// Só administradores da Central: a aba controla números, disparos e a IA dos SDRs
router.use((req, res, next) => {
  if (!req.user || !req.user.admin) return res.status(403).json({ error: 'Só administradores da conta acessam o WhatsApp.' });
  next();
});

router.get('/sso', (req, res) => {
  try {
    const agora = Math.floor(Date.now() / 1000);
    const token = jwtHS256({ uid: SDRS_UID, purpose: 'sso', via: 'central', por: req.user.email || null, iat: agora, exp: agora + 120 }, segredo());
    res.json({ url: `${SDRS_URL}/api/auth/sso?token=${encodeURIComponent(token)}`, base: SDRS_URL });
  } catch (e) {
    console.error('[whatsapp] sso:', e.message);
    res.status(500).json({ error: 'Não consegui abrir o WhatsApp agora: ' + e.message });
  }
});

// Repasse cru (corpo em stream: serve para JSON grande de contatos e para upload multipart de mídia/planilha)
router.use('/p', (req, res) => {
  let cookie;
  try { cookie = cookieSessao(); } catch (e) { return res.status(500).json({ error: e.message }); }
  const caminho = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  // Login/senha do jeff-sdrs não passam por aqui (a Central tem o próprio); o crm-sso é só um redirecionamento para o CRM
  if (/\/auth\//.test(caminho) && !/\/auth\/crm-sso(\?|$)/.test(caminho)) return res.status(403).json({ error: 'Esse recurso não é exposto pela Central.' });
  const headers = { 'content-type': req.headers['content-type'] || 'application/json', cookie, accept: req.headers.accept || 'application/json', 'x-forwarded-for': req.ip, 'x-central-user': req.user.email || '' };
  if (req.headers['content-length']) headers['content-length'] = req.headers['content-length'];
  const up = http.request({ host: SDRS_HOST, port: SDRS_PORT, path: caminho, method: req.method, headers, timeout: 120000 }, r => {
    const h = { 'content-type': r.headers['content-type'] || 'application/json' };
    if (r.headers['content-length']) h['content-length'] = r.headers['content-length'];
    if (r.headers['content-disposition']) h['content-disposition'] = r.headers['content-disposition'];
    if (r.headers.location) h.location = r.headers.location; // crm-sso: 302 para o CRM com o token
    res.writeHead(r.statusCode || 502, h);
    r.pipe(res);
  });
  up.on('timeout', () => { up.destroy(new Error('tempo esgotado')); });
  up.on('error', e => {
    console.error('[whatsapp] proxy', req.method, caminho, e.message);
    if (!res.headersSent) res.status(502).json({ error: 'O sistema de SDRs não respondeu (' + e.message + '). Veja se o jeff-sdrs está no ar.' });
    else res.end();
  });
  if (req.method === 'GET' || req.method === 'HEAD') up.end(); else req.pipe(up);
});

// ─── CRM de leads (jeff-sdrs-crm, porta 3051) ───────────────────────────────────────────────────────────────
// O CRM autentica por sessão de cookie (connect.sid) e aceita login único em GET /sso?token=<JWT purpose crm-sso>,
// assinado com o mesmo segredo do jeff-sdrs. A Central faz esse login uma vez, guarda o cookie e repassa
// /api/whatsapp/crm/<caminho> -> http://127.0.0.1:3051/api/<caminho>. Se a sessão cair (restart do CRM), loga de novo.
const CRM_HOST = process.env.SDRS_CRM_HOST || '127.0.0.1';
const CRM_PORT = parseInt(process.env.SDRS_CRM_PORT || '3051', 10);
let _crmCookie = null, _crmLogin = null;
function crmPedido(opts, corpo) {
  return new Promise((resolve, reject) => {
    const req = http.request(Object.assign({ host: CRM_HOST, port: CRM_PORT, timeout: 20000 }, opts), r => {
      const partes = []; r.on('data', c => partes.push(c)); r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, corpo: Buffer.concat(partes) }));
    });
    req.on('timeout', () => req.destroy(new Error('tempo esgotado')));
    req.on('error', reject);
    if (corpo && corpo.length) req.write(corpo);
    req.end();
  });
}
async function crmEntrar() {
  if (_crmLogin) return _crmLogin;
  _crmLogin = (async () => {
    const agora = Math.floor(Date.now() / 1000);
    const token = jwtHS256({ uid: SDRS_UID, u: SDRS_USER, purpose: 'crm-sso', via: 'central', iat: agora, exp: agora + 120 }, segredo());
    const r = await crmPedido({ method: 'GET', path: '/sso?token='<REDACTED>'&target=/' });
    const sc = [].concat(r.headers['set-cookie'] || []).map(c => c.split(';')[0]).find(c => /^connect\.sid=/.test(c));
    if (r.status !== 302 || !sc) throw new Error('o CRM recusou o login único (' + r.status + ')');
    _crmCookie = sc;
    return sc;
  })();
  try { return await _crmLogin; } finally { _crmLogin = null; }
}
router.use('/crm', (req, res) => {
  const caminho = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  if (/\/(password-reset|internal)\//.test(caminho)) return res.status(403).json({ error: 'Esse recurso não é exposto pela Central.' });
  const partes = [];
  req.on('data', c => { partes.push(c); if (partes.reduce((a, b) => a + b.length, 0) > 512 * 1024) req.destroy(); });
  req.on('end', async () => {
    const corpo = Buffer.concat(partes);
    const enviar = cookie => crmPedido({ method: req.method, path: caminho, headers: { 'content-type': req.headers['content-type'] || 'application/json', 'content-length': corpo.length, cookie, accept: 'application/json', 'x-central-user': req.user.email || '' } }, corpo);
    try {
      let r = await enviar(_crmCookie || await crmEntrar());
      if (r.status === 401 || (r.status === 302 && /\/login/.test(r.headers.location || ''))) { _crmCookie = null; r = await enviar(await crmEntrar()); }
      res.status(r.status).set('content-type', r.headers['content-type'] || 'application/json').send(r.corpo);
    } catch (e) {
      console.error('[whatsapp] crm', req.method, caminho, e.message);
      res.status(502).json({ error: 'O CRM de leads não respondeu (' + e.message + '). Veja se o jeff-sdrs-crm está no ar.' });
    }
  });
});

module.exports = { router, jwtHS256, segredo, cookieSessao, SDRS_URL, SDRS_HOST, SDRS_PORT };
