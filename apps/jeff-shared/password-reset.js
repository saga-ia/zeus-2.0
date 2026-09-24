// jeff-shared/password-reset.js
// "Esqueci minha senha" via WhatsApp, compartilhado entre os apps de /opt/jeff-apps.
// Sem dependências externas. O código de 6 dígitos vai sempre pro número do dono,
// enviado pelo whatsapp-worker através do scripts/wapi.sh (o token fica só lá).
//
// Uso no server.js do app (ANTES de qualquer middleware de auth global):
//   require('/opt/jeff-apps/jeff-shared/password-reset').mount(app, {
//     appName: 'Agenda Turbo Max',
//     needsIdentifier: false,                       // true em apps multiusuário
//     userExists: (identifier) => true,             // opcional, evita mandar código pra usuário inexistente
//     setPassword: (newPass, identifier) => true,   // grava; retorna false se usuário não existe
//   });

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const WAPI = '/opt/jeff-worker/scripts/wapi.sh';
const OWNER_CHAT = '5511910075450@c.us';
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_REQUESTS = 3;            // pedidos de código por janela
const REQUEST_WINDOW_MS = 15 * 60 * 1000;
const MIN_PASSWORD = 8;

const PAGE = fs.readFileSync(path.join(__dirname, 'password-reset.html'), 'utf8');

function readJson(req, cb) {
  if (req.body && typeof req.body === 'object') return cb(null, req.body);
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 10000) req.destroy(); });
  req.on('end', () => { try { cb(null, raw ? JSON.parse(raw) : {}); } catch (e) { cb(e); } });
  req.on('error', cb);
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

function sendWhatsApp(message) {
  return new Promise((resolve) => {
    execFile(WAPI, ['POST', '/send-message', JSON.stringify({ chatId: OWNER_CHAT, message })],
      { timeout: 15000 }, (err) => resolve(!err));
  });
}

function hashCode(code, salt) {
  return crypto.createHash('sha256').update(salt + ':' + code).digest('hex');
}

function mount(app, opts) {
  const appName = opts.appName;
  const needsIdentifier = !!opts.needsIdentifier;
  const identifierLabel = opts.identifierLabel || 'E-mail ou usuário';
  const loginPath = opts.loginPath || '/login';
  const setPassword = opts.setPassword;
  if (!appName || typeof setPassword !== 'function') throw new Error('password-reset: appName e setPassword são obrigatórios');

  let pending = null;          // { hash, salt, identifier, expires, attempts }
  let requests = [];           // timestamps dos pedidos recentes

  const page = PAGE
    .replace(/__APP_NAME__/g, appName)
    .replace(/__LOGIN_PATH__/g, loginPath)
    .replace(/__IDENT_LABEL__/g, identifierLabel)
    .replace(/__NEEDS_IDENT__/g, needsIdentifier ? '1' : '0')
    .replace(/__MIN_PASSWORD__/g, String(MIN_PASSWORD));

  app.get('/redefinir-senha', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(page);
  });

  app.post('/api/password-reset/request', (req, res) => {
    readJson(req, async (err, body) => {
      if (err) return send(res, 400, { error: 'Requisição inválida' });
      const identifier = String(body.identifier || '').trim().toLowerCase();
      if (needsIdentifier && !identifier) return send(res, 400, { error: 'Informe o ' + identifierLabel.toLowerCase() });

      const now = Date.now();
      requests = requests.filter((t) => now - t < REQUEST_WINDOW_MS);
      if (requests.length >= MAX_REQUESTS) {
        return send(res, 429, { error: 'Muitos pedidos. Aguarde 15 minutos e tente de novo.' });
      }
      requests.push(now);

      // Usuário inexistente: responde igual (não revela quem existe) mas não incomoda o dono.
      if (needsIdentifier && typeof opts.userExists === 'function' && !opts.userExists(identifier)) {
        console.log(`[password-reset] [${appName}] pedido para usuário inexistente: ${identifier}`);
        return send(res, 200, { ok: true });
      }

      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      const salt = crypto.randomBytes(8).toString('hex');
      pending = { hash: hashCode(code, salt), salt, identifier, expires: now + CODE_TTL_MS, attempts: 0 };

      const quem = needsIdentifier ? `\nUsuário: ${identifier}` : '';
      const ok = await sendWhatsApp(
        `🔐 *Redefinição de senha*\nSistema: ${appName}${quem}\n\nCódigo: *${code}*\n\nVale por 10 minutos. Se não foi você que pediu, ignore esta mensagem.`
      );
      console.log(`[password-reset] [${appName}] código solicitado${needsIdentifier ? ' para ' + identifier : ''} · whatsapp=${ok ? 'ok' : 'FALHOU'}`);
      if (!ok) {
        pending = null;
        return send(res, 502, { error: 'Não consegui enviar o código pelo WhatsApp. Tente de novo em instantes.' });
      }
      send(res, 200, { ok: true });
    });
  });

  app.post('/api/password-reset/confirm', (req, res) => {
    readJson(req, async (err, body) => {
      if (err) return send(res, 400, { error: 'Requisição inválida' });
      const code = String(body.code || '').replace(/\D/g, '');
      const newPassword = String(body.newPassword || '');

      if (!pending || Date.now() > pending.expires) {
        pending = null;
        return send(res, 400, { error: 'Código expirado. Peça um novo.' });
      }
      if (newPassword.length < MIN_PASSWORD) {
        return send(res, 400, { error: `A senha nova precisa ter pelo menos ${MIN_PASSWORD} caracteres.` });
      }
      pending.attempts++;
      if (pending.attempts > MAX_ATTEMPTS) {
        pending = null;
        return send(res, 429, { error: 'Muitas tentativas. Peça um código novo.' });
      }
      const given = Buffer.from(hashCode(code, pending.salt));
      const expected = Buffer.from(pending.hash);
      if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
        return send(res, 400, { error: 'Código incorreto.' });
      }

      const identifier = pending.identifier;
      pending = null;
      try {
        const changed = await setPassword(newPassword, identifier);
        if (changed === false) return send(res, 404, { error: 'Usuário não encontrado neste sistema.' });
      } catch (e) {
        console.error(`[password-reset] [${appName}] erro ao gravar senha:`, e.message);
        return send(res, 500, { error: 'Erro ao gravar a senha nova.' });
      }
      console.log(`[password-reset] [${appName}] senha redefinida${needsIdentifier ? ' para ' + identifier : ''}`);
      send(res, 200, { ok: true });
    });
  });
}

// Helpers pros apps que tinham senha fixa no código ou em .env:
// a senha redefinida fica em <dataDir>/auth-override.json e passa a valer no lugar da original.
function overrideStore(dataDir) {
  const file = path.join(dataDir, 'auth-override.json');
  return {
    file,
    read() {
      try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
    },
    // grava hash scrypt da senha nova
    write(newPassword) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ salt, hash, updatedAt: new Date().toISOString() }), { mode: 0o600 });
    },
    // null = não há override (app deve usar a checagem original); true/false = resultado
    check(password) {
      const o = this.read();
      if (!o) return null;
      const test = crypto.scryptSync(String(password), o.salt, 64);
      const expected = Buffer.from(o.hash, 'hex');
      return test.length === expected.length && crypto.timingSafeEqual(test, expected);
    },
  };
}

module.exports = { mount, overrideStore };
