process.env.TZ = process.env.TZ || 'America/Sao_Paulo';

const express = require('express');
const path = require('path');
const fs = require('fs');
const nodeCrypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { getDb } = require('./db');
const { seal, open, redact } = require('./lib/crypto');
const settingsLib = require('./lib/settings');

const app = express();
const PORT = process.env.PORT || 3070;

// Segredo JWT: NUNCA um literal hardcoded. Usa JWT_SECRET do ambiente ou gera
// um aleatório persistido em data/.jwt-secret (sessões sobrevivem a restart).
function loadJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(__dirname, 'data', '.jwt-secret');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = nodeCrypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  console.log('[agenda-turbo-max] JWT secret gerado em data/.jwt-secret (defina JWT_SECRET no ambiente pra fixar um próprio)');
  return secret;
}
const JWT_SECRET = loadJwtSecret();

// ==== Cabeçalhos de segurança ====
// O sistema não enviava nenhum. Sem eles a página podia ser embutida em iframe
// de outro site (clickjacking), o navegador adivinhava tipo de conteúdo, e não
// havia limite de origem para scripts.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // As telas usam estilo e script inline; 'unsafe-inline' é necessário aqui,
  // mas a origem de scripts fica restrita ao próprio domínio.
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",      // avatares e thumbs vêm da Meta/Google
    "media-src 'self' https:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '));
  next();
});

app.use(express.json({ limit: '2mb' }));                       // teto de corpo JSON
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

const UPLOAD_DIR = path.join(__dirname, 'data', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Upload: extensão derivada do MIME validado (nunca do nome enviado pelo
// cliente) e filtro que só aceita mídia. Ver lib/upload-guard.js.
const uploadGuard = require('./lib/upload-guard');
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, uploadGuard.nomeSeguro(file))
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter: uploadGuard.fileFilter
});

function auth(req, res, next) {
  // Token via query string SÓ nos redirects de OAuth (o navegador não manda
  // header em redirect). Nas rotas de API, apenas o header Authorization —
  // token em URL vaza em logs de acesso e no Referer.
  const isOauthStart = req.method === 'GET' && req.path.startsWith('/oauth/');
  const token = req.headers.authorization?.replace('Bearer ', '') || (isOauthStart ? req.query?.token : null);
  if (!token) {
    if (isOauthStart) return res.redirect('/?error=nao_autenticado');
    return res.status(401).json({ error: 'Não autenticado' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    if (isOauthStart) return res.redirect('/?error=token_invalido');
    res.status(401).json({ error: 'Token inválido' });
  }
}

// ==== Proteção anti-CSRF do OAuth ====
// O `state` era enviado como texto fixo ("ig_connect") e nunca conferido na
// volta. Isso permite que um terceiro monte um callback com o código dele e
// faça a conta DELE ser vinculada aqui. Agora o state é aleatório, tem validade
// curta e é de uso único.
const oauthStates = new Map();
setInterval(() => {
  const agora = Date.now();
  for (const [k, v] of oauthStates) if (agora > v) oauthStates.delete(k);
}, 5 * 60 * 1000).unref();

function novoState(prefixo) {
  const s = prefixo + '_' + nodeCrypto.randomBytes(16).toString('hex');
  oauthStates.set(s, Date.now() + 10 * 60 * 1000); // vale 10 minutos
  return s;
}
function consumirState(s) {
  if (!s || !oauthStates.has(s)) return false;
  const expira = oauthStates.get(s);
  oauthStates.delete(s);                            // uso único
  return Date.now() <= expira;
}

function initAdmin() {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get('jeff');
  if (!user) {
    const hash = bcrypt.hashSync('Zeus@2026', 10);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('jeff', hash);
    console.log('[agenda-turbo-max] Admin criado: jeff / Zeus@2026 — TROQUE A SENHA em Configurações');
  } else if (bcrypt.compareSync('Zeus@2026', user.password_hash)) {
    console.warn('[agenda-turbo-max] ⚠️ SENHA PADRÃO AINDA EM USO — troque em Configurações > Alterar senha');
  }
}

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}

// Limitador genérico por IP, reaproveitado em rotas diferentes.
function criarLimitador({ max, janelaMs, mensagem }) {
  const registro = new Map();
  // limpeza periódica para o mapa não crescer sem parar (memória)
  setInterval(() => {
    const agora = Date.now();
    for (const [k, v] of registro) if (agora > v.resetAt) registro.delete(k);
  }, 10 * 60 * 1000).unref();

  return function (req, res, next) {
    const ip = clientIp(req);
    const agora = Date.now();
    let r = registro.get(ip);
    if (!r || agora > r.resetAt) r = { count: 0, resetAt: agora + janelaMs };
    if (r.count >= max) {
      res.setHeader('Retry-After', Math.ceil((r.resetAt - agora) / 1000));
      return res.status(429).json({ error: mensagem });
    }
    r.count++;
    registro.set(ip, r);
    req._ip = ip;
    req._limpaLimite = () => registro.delete(ip);
    next();
  };
}

// Login: anti força-bruta
const loginLimiter = criarLimitador({
  max: 10, janelaMs: 15 * 60 * 1000,
  mensagem: 'Muitas tentativas de login. Aguarde 15 minutos.'
});

// API em geral: evita varredura e abuso de endpoints caros (diagnóstico,
// importação de contas, coleta de métricas — todos batem na API da Meta).
const apiLimiter = criarLimitador({
  max: 300, janelaMs: 60 * 1000,
  mensagem: 'Muitas requisições em pouco tempo. Aguarde um instante.'
});

// Operações pesadas ou que disparam ações externas
const acaoPesadaLimiter = criarLimitador({
  max: 12, janelaMs: 60 * 1000,
  mensagem: 'Esta operação tem limite de uso. Aguarde um minuto e tente de novo.'
});

app.use('/api', apiLimiter);

// Esqueci minha senha (código via WhatsApp do dono) — módulo compartilhado jeff-shared
require('/opt/jeff-apps/jeff-shared/password-reset').mount(app, {
  appName: 'Agenda Turbo Max',
  loginPath: '/',
  needsIdentifier: true,
  identifierLabel: 'Usuário',
  userExists: (username) => !!getDb().prepare('SELECT 1 FROM users WHERE lower(username) = ?').get(username),
  setPassword: (newPass, username) => {
    const db = getDb();
    const r = db.prepare('UPDATE users SET password_hash = ? WHERE lower(username) = ?').run(bcrypt.hashSync(newPass, 10), username);
    return r.changes > 0;
  }
});

// Auth
app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }
  req._limpaLimite?.();
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username: user.username });
});

app.post('/api/auth/change-password', auth, (req, res) => {
  const { current, newPass } = req.body || {};
  if (!current || !newPass) return res.status(400).json({ error: 'Envie senha atual e nova.' });
  if (String(newPass).length < 8) return res.status(400).json({ error: 'Nova senha precisa ter no mínimo 8 caracteres.' });
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(400).json({ error: 'Usuário não encontrado.' });
  if (!bcrypt.compareSync(String(current), user.password_hash)) {
    console.log(`[agenda-turbo-max] [change-password] senha atual incorreta para user=${user.username}`);
    return res.status(400).json({ error: 'Senha atual incorreta.' });
  }
  const hash = bcrypt.hashSync(String(newPass), 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  console.log(`[agenda-turbo-max] [change-password] senha alterada com sucesso para user=${user.username}`);
  res.json({ ok: true });
});

// Social accounts — tokens NUNCA saem pela API
app.get('/api/accounts', auth, (req, res) => {
  const db = getDb();
  const accounts = db.prepare(`SELECT id, platform, platform_user_id, platform_username, platform_name,
    page_id, ig_business_id, profile_picture, followers, status, token_expires_at, connected_at, updated_at
    FROM social_accounts ORDER BY platform, platform_username`).all();
  res.json(accounts);
});

app.delete('/api/accounts/:id', auth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM social_accounts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Import direto via BM usando token de usuário Meta (bypass OAuth quando app não tem review)
app.post('/api/accounts/import-bm', auth, acaoPesadaLimiter, async (req, res) => {
  try {
    const axios = require('axios');
    const db = getDb();
    let token = req.body?.access_token;
    if (!token) {
      try {
        const workerDb = require('better-sqlite3')('/opt/jeff-worker/data/worker.db', { readonly: true });
        token = workerDb.prepare("SELECT value FROM app_settings WHERE key = 'jeff_meta_user_token'").get()?.value;
        workerDb.close();
      } catch {}
    }
    if (!token) return res.status(400).json({ error: 'Access token não fornecido e não achado no worker.db' });

    // O token do Explorador da Graph API dura ~1h. Sem trocar por um de longa
    // duração, os page tokens derivados dele também expiram em 1h e todo
    // agendamento posterior falha — mesmo o sistema achando que tem 60 dias.
    let tokenTrocado = false;
    const appIdImp = settingsLib.getSetting('meta_app_id');
    const appSecretImp = settingsLib.getSetting('meta_app_secret');
    if (appIdImp && appSecretImp) {
      try {
        const ex = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
          params: { grant_type: 'fb_exchange_token', client_id: appIdImp, client_secret: appSecretImp, fb_exchange_token: token }
        });
        if (ex.data?.access_token) { token = ex.data.access_token; tokenTrocado = true; }
      } catch (e) {
        console.warn('[import-bm] não consegui trocar por token de longa duração:', redact(e.response?.data?.error?.message || e.message));
      }
    }

    // token vai em params (não concatenado na URL) — URL com token vaza em
    // log de erro do axios, em proxy reverso e no histórico de rede
    const pages = [];
    let url = 'https://graph.facebook.com/v19.0/me/accounts';
    let params = {
      access_token: token,
      fields: 'id,name,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count}',
      limit: 100
    };
    while (url) {
      const r = await axios.get(url, { params });
      pages.push(...(r.data.data || []));
      url = r.data.paging?.next || null;
      params = undefined; // o link `next` já vem com todos os parâmetros
    }
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 60 * 24 * 3600;
    let added = 0, updated = 0;
    for (const p of pages) {
      const ig = p.instagram_business_account;
      if (!ig) continue;
      const exists = db.prepare('SELECT id FROM social_accounts WHERE platform = ? AND ig_business_id = ?').get('instagram', ig.id);
      if (exists) {
        db.prepare(`UPDATE social_accounts SET access_token=?, page_id=?, platform_username=?, platform_name=?,
          profile_picture=?, followers=?, token_expires_at=?, status='active', updated_at=? WHERE id=?`)
          .run(seal(p.access_token), p.id, ig.username, ig.name || ig.username,
               ig.profile_picture_url, ig.followers_count || 0, expiresAt, now, exists.id);
        updated++;
      } else {
        db.prepare(`INSERT INTO social_accounts (platform, platform_user_id, platform_username, platform_name,
          access_token, page_id, ig_business_id, profile_picture, followers, token_expires_at, status, connected_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run('instagram', ig.id, ig.username, ig.name || ig.username,
               seal(p.access_token), p.id, ig.id, ig.profile_picture_url,
               ig.followers_count || 0, expiresAt, 'active', now, now);
        added++;
      }
    }
    res.json({
      ok: true, added, updated, total_pages: pages.length,
      long_lived: tokenTrocado,
      aviso: tokenTrocado ? null
        : 'O token NÃO pôde ser convertido para longa duração — ele vence em cerca de 1 hora e os agendamentos vão falhar depois disso. Confira se App ID e App Secret estão salvos em Configurações e importe de novo.'
    });
  } catch (err) {
    console.error('[import-bm]', redact(err.response?.data || err.message));
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

// OAuth - Instagram
// IMPORTANTE: o valor RAW abaixo (sem encode) precisa estar cadastrado LITERAL em
// Painel Meta → Login do Facebook → Configurações → "URIs de redirecionamento OAuth válidas"
// Qualquer divergência (barra final, http/https, subdomínio) faz o Meta rejeitar sem retornar `code`.
const META_REDIRECT_URI = 'https://agendaturbomax.jefersonhenrike.com/oauth/instagram/callback';
app.get('/oauth/instagram/start', auth, (req, res) => {
  const appId = settingsLib.getSetting('meta_app_id');
  if (!appId) return res.redirect('/connect.html?error=no_meta_app');
  const redirectUri = encodeURIComponent(META_REDIRECT_URI);
  // rerequest=1 força o Facebook a mostrar de novo a tela de escolha de IGs, mesmo se já autorizado
  const authType = req.query.rerequest ? '&auth_type=rerequest' : '';

  // Dois fluxos possíveis, conforme o app foi configurado no painel da Meta:
  //   - Login do Facebook para EMPRESAS → as permissões vêm de uma "configuração"
  //     criada no painel e são passadas por config_id. Mandar `scope` aqui faz o
  //     Facebook autorizar e devolver o callback SEM `code` (erro callback_sem_code).
  //   - Login do Facebook clássico → permissões via `scope`.
  const configId = settingsLib.getSetting('meta_login_config_id');
  if (configId) {
    console.log(`[instagram oauth] iniciando via Login para Empresas (config_id=${configId})`);
    return res.redirect(`https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&config_id=${configId}&response_type=code&state=${novoState('ig')}${authType}`);
  }

  const scopes = 'instagram_basic,instagram_content_publish,instagram_manage_insights,instagram_manage_comments,pages_show_list,pages_read_engagement,business_management';
  console.log('[instagram oauth] iniciando via Login clássico (scope)');
  res.redirect(`https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code&state=${novoState('ig')}${authType}`);
});

app.get('/oauth/instagram/callback', async (req, res) => {
  const { code, error, error_reason, error_description, state } = req.query;
  // anti-CSRF: o state precisa ser um que ESTE servidor emitiu, ainda válido e
  // não usado antes. Sem isso, um callback forjado vincularia a conta de outro.
  if (!consumirState(req.query.state)) {
    console.warn('[instagram oauth] state inválido/expirado — callback recusado');
    return res.redirect('/connect.html?error=instagram_state_invalido');
  }

  if (error || !code) {
    // Callback SEM `code` E SEM `error` normalmente indica:
    //   (a) app em Modo de Desenvolvimento e usuário logado NÃO está em Roles > Testadores;
    //   (b) redirect_uri divergindo do cadastrado no painel Meta;
    //   (c) usuário fechou o popup antes de autorizar.
    console.error('[instagram oauth] callback rejeitado:', {
      error, error_reason, error_description, state,
      hint: !error ? 'sem code E sem error → conferir Modo Dev/Prod e URI cadastrada no painel Meta' : null,
      redirect_uri_esperada: META_REDIRECT_URI
    });
    const desc = encodeURIComponent(error_description || error_reason || error || 'callback_sem_code');
    return res.redirect(`/connect.html?error=instagram_denied&reason=${desc}`);
  }

  try {
    const db = getDb();
    const appId = settingsLib.getSetting('meta_app_id');
    const appSecret = settingsLib.getSetting('meta_app_secret');
    const redirectUri = META_REDIRECT_URI;
    const axios = require('axios');

    // Exchange code for token
    const tokenRes = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code }
    });
    const shortToken = tokenRes.data.access_token;

    // Long-lived token
    const longRes = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: { grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: shortToken }
    });
    const longToken = longRes.data.access_token;
    const expiresIn = longRes.data.expires_in;

    // Get pages
    const pagesRes = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
      params: { access_token: longToken, fields: 'id,name,instagram_business_account' }
    });

    const pages = pagesRes.data.data;
    let igAccountsAdded = 0;

    for (const page of pages) {
      if (!page.instagram_business_account) continue;
      const igId = page.instagram_business_account.id;

      // Get page token
      const pageTokenRes = await axios.get(`https://graph.facebook.com/v19.0/${page.id}`, {
        params: { fields: 'access_token', access_token: longToken }
      });
      const pageToken = pageTokenRes.data.access_token;

      // Get IG info
      const igRes = await axios.get(`https://graph.facebook.com/v19.0/${igId}`, {
        params: { fields: 'username,name,profile_picture_url,followers_count', access_token: pageToken }
      });
      const ig = igRes.data;

      const existing = db.prepare('SELECT id FROM social_accounts WHERE platform = ? AND ig_business_id = ?').get('instagram', igId);
      if (existing) {
        db.prepare(`UPDATE social_accounts SET access_token=?, page_id=?, platform_username=?, platform_name=?,
          profile_picture=?, followers=?, token_expires_at=?, status='active', updated_at=unixepoch()
          WHERE id=?`).run(seal(pageToken), page.id, ig.username, ig.name, ig.profile_picture_url, ig.followers_count || 0,
          Math.floor(Date.now() / 1000) + expiresIn, existing.id);
      } else {
        db.prepare(`INSERT INTO social_accounts (platform, platform_user_id, platform_username, platform_name,
          access_token, page_id, ig_business_id, profile_picture, followers, token_expires_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`).run('instagram', igId, ig.username, ig.name, seal(pageToken), page.id, igId,
          ig.profile_picture_url, ig.followers_count || 0, Math.floor(Date.now() / 1000) + expiresIn);
      }
      igAccountsAdded++;
    }

    res.redirect(`/connect.html?success=instagram&count=${igAccountsAdded}`);
  } catch (err) {
    console.error('[instagram oauth]', redact(err.response?.data || err.message));
    res.redirect('/connect.html?error=instagram_failed');
  }
});

// OAuth - Google Drive (reaproveita mesmas credenciais Google)
const drive = require('./lib/drive');
app.get('/oauth/drive/start', auth, (req, res) => {
  try {
    const redirectUri = `https://agendaturbomax.jefersonhenrike.com/oauth/drive/callback`;
    res.redirect(drive.buildAuthUrl(redirectUri, novoState('drive')));
  } catch (err) {
    res.redirect('/bulk.html?error=no_google_app');
  }
});

app.get('/oauth/drive/callback', async (req, res) => {
  const { code, error } = req.query;
  if (!consumirState(req.query.state)) {
    console.warn('[drive oauth] state inválido/expirado — callback recusado');
    return res.redirect('/bulk.html?error=drive_state_invalido');
  }
  if (error || !code) return res.redirect('/bulk.html?error=drive_denied');
  try {
    const redirectUri = `https://agendaturbomax.jefersonhenrike.com/oauth/drive/callback`;
    await drive.exchangeCode(code, redirectUri);
    res.redirect('/bulk.html?success=drive');
  } catch (err) {
    console.error('[drive oauth]', redact(err.response?.data || err.message));
    res.redirect('/bulk.html?error=drive_failed');
  }
});

// OAuth - YouTube (Google)
app.get('/oauth/youtube/start', auth, (req, res) => {
  const clientId = settingsLib.getSetting('google_client_id');
  if (!clientId) return res.redirect('/connect.html?error=no_google_app');
  const redirectUri = encodeURIComponent(`https://agendaturbomax.jefersonhenrike.com/oauth/youtube/callback`);
  const scopes = encodeURIComponent('https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly');
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scopes}&access_type=offline&prompt=consent`);
});

app.get('/oauth/youtube/callback', async (req, res) => {
  const { code, error } = req.query;
  // anti-CSRF: o state precisa ser um que ESTE servidor emitiu, ainda válido e
  // não usado antes. Sem isso, um callback forjado vincularia a conta de outro.
  if (!consumirState(req.query.state)) {
    console.warn('[youtube oauth] state inválido/expirado — callback recusado');
    return res.redirect('/connect.html?error=youtube_state_invalido');
  }

  if (error || !code) return res.redirect('/connect.html?error=youtube_denied');

  try {
    const db = getDb();
    const clientId = settingsLib.getSetting('google_client_id');
    const clientSecret = settingsLib.getSetting('google_client_secret');
    const redirectUri = `https://agendaturbomax.jefersonhenrike.com/oauth/youtube/callback`;
    const axios = require('axios');

    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code'
    });
    const { access_token, refresh_token, expires_in } = tokenRes.data;

    // Get channel info
    const channelRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
      params: { part: 'snippet,statistics', mine: true },
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const channel = channelRes.data.items?.[0];
    if (!channel) return res.redirect('/connect.html?error=no_youtube_channel');

    const existing = db.prepare('SELECT id FROM social_accounts WHERE platform = ? AND platform_user_id = ?').get('youtube', channel.id);
    const expiresAt = Math.floor(Date.now() / 1000) + expires_in;

    if (existing) {
      db.prepare(`UPDATE social_accounts SET access_token=?, refresh_token=?, platform_username=?, platform_name=?,
        profile_picture=?, followers=?, token_expires_at=?, status='active', updated_at=unixepoch() WHERE id=?`).run(
        seal(access_token), seal(refresh_token), channel.snippet.title, channel.snippet.title,
        channel.snippet.thumbnails?.default?.url, channel.statistics?.subscriberCount || 0, expiresAt, existing.id);
    } else {
      db.prepare(`INSERT INTO social_accounts (platform, platform_user_id, platform_username, platform_name,
        access_token, refresh_token, profile_picture, followers, token_expires_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run('youtube', channel.id, channel.snippet.title, channel.snippet.title,
        seal(access_token), seal(refresh_token), channel.snippet.thumbnails?.default?.url,
        channel.statistics?.subscriberCount || 0, expiresAt);
    }

    res.redirect('/connect.html?success=youtube');
  } catch (err) {
    console.error('[youtube oauth]', redact(err.response?.data || err.message));
    res.redirect('/connect.html?error=youtube_failed');
  }
});

// TikTok OAuth
app.get('/oauth/tiktok/start', auth, (req, res) => {
  const clientKey = settingsLib.getSetting('tiktok_client_key');
  if (!clientKey) return res.redirect('/connect.html?error=no_tiktok_app');
  const redirectUri = encodeURIComponent(`https://agendaturbomax.jefersonhenrike.com/oauth/tiktok/callback`);
  const scopes = 'user.info.basic,video.upload,video.publish';
  const state = novoState('tt');
  res.redirect(`https://www.tiktok.com/v2/auth/authorize?client_key=${clientKey}&redirect_uri=${redirectUri}&response_type=code&scope=${scopes}&state=${state}`);
});

app.get('/oauth/tiktok/callback', async (req, res) => {
  const { code, error } = req.query;
  // anti-CSRF: o state precisa ser um que ESTE servidor emitiu, ainda válido e
  // não usado antes. Sem isso, um callback forjado vincularia a conta de outro.
  if (!consumirState(req.query.state)) {
    console.warn('[tiktok oauth] state inválido/expirado — callback recusado');
    return res.redirect('/connect.html?error=tiktok_state_invalido');
  }

  if (error || !code) return res.redirect('/connect.html?error=tiktok_denied');

  try {
    const db = getDb();
    const clientKey = settingsLib.getSetting('tiktok_client_key');
    const clientSecret = settingsLib.getSetting('tiktok_client_secret');
    const redirectUri = `https://agendaturbomax.jefersonhenrike.com/oauth/tiktok/callback`;
    const axios = require('axios');

    const tokenRes = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', {
      client_key: clientKey, client_secret: clientSecret,
      code, grant_type: 'authorization_code', redirect_uri: redirectUri
    }, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const { access_token, refresh_token, expires_in, open_id } = tokenRes.data.data;

    const userRes = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
      params: { fields: 'open_id,union_id,avatar_url,display_name,follower_count' },
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const user = userRes.data.data?.user;

    const existing = db.prepare('SELECT id FROM social_accounts WHERE platform = ? AND platform_user_id = ?').get('tiktok', open_id);
    const expiresAt = Math.floor(Date.now() / 1000) + expires_in;

    if (existing) {
      db.prepare(`UPDATE social_accounts SET access_token=?, refresh_token=?, platform_username=?, platform_name=?,
        profile_picture=?, followers=?, token_expires_at=?, status='active', updated_at=unixepoch() WHERE id=?`).run(
        seal(access_token), seal(refresh_token), user?.display_name, user?.display_name,
        user?.avatar_url, user?.follower_count || 0, expiresAt, existing.id);
    } else {
      db.prepare(`INSERT INTO social_accounts (platform, platform_user_id, platform_username, platform_name,
        access_token, refresh_token, profile_picture, followers, token_expires_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run('tiktok', open_id, user?.display_name, user?.display_name,
        seal(access_token), seal(refresh_token), user?.avatar_url, user?.follower_count || 0, expiresAt);
    }

    res.redirect('/connect.html?success=tiktok');
  } catch (err) {
    console.error('[tiktok oauth]', redact(err.response?.data || err.message));
    res.redirect('/connect.html?error=tiktok_failed');
  }
});

// Posts CRUD
app.get('/api/posts', auth, (req, res) => {
  const db = getDb();
  const { status, month, year } = req.query;
  let query = 'SELECT * FROM posts WHERE 1=1';
  const params = [];

  if (status) { query += ' AND status = ?'; params.push(status); }
  if (month && year) {
    const start = Math.floor(new Date(year, month - 1, 1).getTime() / 1000);
    const end = Math.floor(new Date(year, month, 0, 23, 59, 59).getTime() / 1000);
    query += ' AND scheduled_at BETWEEN ? AND ?';
    params.push(start, end);
  }
  query += ' ORDER BY coalesce(scheduled_at, created_at) DESC LIMIT 200';
  const posts = db.prepare(query).all(...params);
  // colunas explícitas: SELECT * traria access_token_used pra resposta da API
  const results = db.prepare(`SELECT id, post_id, account_id, platform, platform_post_id, status, error_message, published_at
    FROM post_results WHERE post_id IN (` + (posts.map(() => '?').join(',') || '0') + ')').all(...posts.map(p => p.id));
  const resultsByPost = {};
  results.forEach(r => { (resultsByPost[r.post_id] = resultsByPost[r.post_id] || []).push(r); });
  posts.forEach(p => { p.platforms = JSON.parse(p.platforms || '[]'); p.account_ids = JSON.parse(p.account_ids || '[]'); p.results = resultsByPost[p.id] || []; });
  res.json(posts);
});

app.post('/api/posts', auth, (req, res) => {
  const { title, caption, media_path, media_type, post_type, platforms, account_ids, scheduled_at } = req.body;
  // Stories não aceitam legenda na Graph API — exigem mídia, não texto
  if (post_type === 'story') {
    if (!media_path) return res.status(400).json({ error: 'Story exige mídia (imagem ou vídeo)' });
  } else if (!caption) {
    return res.status(400).json({ error: 'Caption obrigatório' });
  }
  const db = getDb();
  const result = db.prepare(`INSERT INTO posts (title, caption, media_path, media_type, post_type, platforms, account_ids, scheduled_at, status)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(title || null, caption || '', media_path || null, media_type || null, post_type || 'image',
    JSON.stringify(platforms || []), JSON.stringify(account_ids || []),
    scheduled_at ? Math.floor(new Date(scheduled_at).getTime() / 1000) : null,
    scheduled_at ? 'scheduled' : 'draft');
  res.json({ id: result.lastInsertRowid, ok: true });
});

app.put('/api/posts/:id', auth, (req, res) => {
  const { title, caption, media_path, media_type, post_type, platforms, account_ids, scheduled_at, status } = req.body;
  const db = getDb();
  db.prepare(`UPDATE posts SET title=?, caption=?, media_path=?, media_type=?, post_type=?, platforms=?, account_ids=?,
    scheduled_at=?, status=?, updated_at=unixepoch() WHERE id=?`).run(
    title || null, caption || '', media_path || null, media_type || null, post_type || 'image',
    JSON.stringify(platforms || []), JSON.stringify(account_ids || []),
    scheduled_at ? Math.floor(new Date(scheduled_at).getTime() / 1000) : null,
    status || 'scheduled', req.params.id);
  res.json({ ok: true });
});

app.delete('/api/posts/:id', auth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Media upload
app.post('/api/upload', auth, (req, res, next) => {
  upload.single('file')(req, res, (err) => err ? uploadGuard.tratarErroUpload(err, req, res, next) : next());
}, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  const db = getDb();
  const result = db.prepare('INSERT INTO upload_sessions (filename, original_name, mimetype, size, path) VALUES (?,?,?,?,?)').run(
    req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.file.path);
  res.json({ id: result.lastInsertRowid, filename: req.file.filename, path: `/uploads/${req.file.filename}`, mimetype: req.file.mimetype });
});

// /uploads precisa ser público (a Meta baixa a mídia daqui para publicar), mas
// só entrega extensões de mídia e com headers que impedem o navegador de
// executar o conteúdo como página.
app.use('/uploads', uploadGuard.servirMidiaComSeguranca, express.static(UPLOAD_DIR, {
  dotfiles: 'deny',
  index: false,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
  }
}));

// Analytics
const analytics = require('./lib/analytics');

app.get('/api/analytics', auth, (req, res) => {
  const db = getDb();
  const summary = analytics.getAnalyticsSummary(db);
  const heatmap = analytics.getBestHoursHeatmap(db);
  const recentPosts = analytics.getRecentPostsWithMetrics(db, 20);
  // sem SELECT * — traria access_token/refresh_token pra resposta da API
  const accounts = db.prepare(`SELECT id, platform, platform_username, platform_name,
    profile_picture, followers, status FROM social_accounts`).all();
  res.json({ ...summary, heatmap, recentPosts, accounts });
});

// Verifica permissões reais do token de cada conta contra a Graph API
app.get('/api/accounts/permissions', auth, acaoPesadaLimiter, async (req, res) => {
  try {
    const axios = require('axios');
    const db = getDb();
    const appId = settingsLib.getSetting('meta_app_id');
    const appSecret = settingsLib.getSetting('meta_app_secret');
    if (!appId || !appSecret) return res.json({ error: 'Meta app não configurado', accounts: [] });
    const accounts = db.prepare("SELECT id, platform, platform_username, ig_business_id, access_token FROM social_accounts WHERE platform='instagram'").all();
    const results = [];
    for (const a of accounts) {
      try {
        // token ilegível = chave de criptografia trocada/perdida. Sem isso o
        // debug_token recebe null e devolve 400 sem explicar nada.
        const accToken = open(a.access_token);
        if (!accToken) {
          results.push({ id: a.id, username: a.platform_username,
            error: 'Token guardado não pôde ser descriptografado (a chave em data/.encryption-key mudou ou se perdeu). Importe as contas de novo.' });
          continue;
        }
        const dbg = await axios.get('https://graph.facebook.com/v19.0/debug_token', {
          params: { input_token: accToken, access_token: `${appId}|${appSecret}` }
        });
        const gs = dbg.data.data?.granular_scopes || [];
        const pub = gs.find(s => s.scope === 'instagram_content_publish');
        const insights = gs.find(s => s.scope === 'instagram_manage_insights');
        const canPublish = pub ? (pub.target_ids ? pub.target_ids.includes(a.ig_business_id) : true) : false;
        const canReadInsights = insights ? (insights.target_ids ? insights.target_ids.includes(a.ig_business_id) : true) : false;
        results.push({ id: a.id, username: a.platform_username, ig_business_id: a.ig_business_id,
          can_publish: canPublish, can_read_insights: canReadInsights });
      } catch (err) {
        // err.message do axios é só "Request failed with status code 400" —
        // a explicação real vem no corpo da resposta da Meta.
        const metaErr = err.response?.data?.error;
        const detalhe = metaErr?.message || err.message;
        const dica = /client secret|application/i.test(detalhe)
          ? ' → O App Secret salvo em Configurações não confere com o App ID.'
          : /session|expired|OAuthException/i.test(detalhe)
          ? ' → Token expirado. Gere um token novo no Explorador e importe de novo.'
          : '';
        console.error(`[permissions] conta ${a.platform_username}:`, redact(metaErr || err.message));
        results.push({ id: a.id, username: a.platform_username, error: detalhe + dica });
      }
    }
    res.json({ accounts: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/post/:id', auth, (req, res) => {
  const details = analytics.getPostDetails(getDb(), req.params.id);
  if (!details) return res.status(404).json({ error: 'Post não encontrado' });
  res.json(details);
});

app.post('/api/analytics/collect', auth, acaoPesadaLimiter, async (req, res) => {
  try {
    const result = await analytics.collectPostAnalytics({});
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Settings — valores sensíveis NUNCA saem pela API; só o flag `<key>_set`.
// (a versão anterior filtrava por LIKE '%secret%' e vazava ai_*_key e os
// tokens do Google Drive em texto plano)
app.get('/api/settings', auth, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) {
    if (settingsLib.isSensitive(r.key)) out[r.key + '_set'] = !!r.value;
    else if (r.key !== 'worker_heartbeat') out[r.key] = r.value;
  }
  res.json(out);
});

app.post('/api/settings', auth, (req, res) => {
  const allowed = ['meta_app_id', 'meta_app_secret', 'meta_login_config_id', 'google_client_id', 'google_client_secret', 'tiktok_client_key', 'tiktok_client_secret'];
  for (const [key, value] of Object.entries(req.body)) {
    if (!allowed.includes(key)) continue;
    // campo sensível vazio = "manter o atual" (o frontend não recebe o valor de volta)
    if (settingsLib.isSensitive(key) && (value === '' || value === null || value === undefined)) continue;
    settingsLib.setSetting(key, value);
  }
  res.json({ ok: true });
});

// Limites oficiais por plataforma (frontend usa pra validar antes de enviar)
const { PLATFORM_LIMITS } = require('./lib/limits');
app.get('/api/limits', auth, (req, res) => res.json(PLATFORM_LIMITS));

// ==== Agenda unificada (posts + itens de campanha ainda não publicados) ====
// Filtros: account_id, from, to (epoch seg), status, type
const scheduleLib = require('./lib/schedule');

app.get('/api/schedule', auth, (req, res) => {
  try {
    res.json({ eventos: scheduleLib.getSchedule(req.query), atualizado_em: Math.floor(Date.now() / 1000) });
  } catch (err) {
    console.error('[schedule]', redact(err?.stack || err));
    res.status(500).json({ error: redact(err.message) });
  }
});

// Números do dashboard, com os mesmos filtros
app.get('/api/summary', auth, (req, res) => {
  try {
    res.json(scheduleLib.getSummary(req.query));
  } catch (err) {
    console.error('[summary]', redact(err?.stack || err));
    res.status(500).json({ error: redact(err.message) });
  }
});

// Diagnóstico da conexão com a Meta: aponta qual elo está quebrado
app.get('/api/diagnostics/meta', auth, acaoPesadaLimiter, async (req, res) => {
  try {
    const { diagnoseMeta } = require('./lib/diagnostics');
    res.json(await diagnoseMeta());
  } catch (err) {
    console.error('[diagnostics]', redact(err?.stack || err));
    res.status(500).json({ error: redact(err.message) });
  }
});

// Status do scheduler (a UI avisa se nada está processando os agendamentos)
app.get('/api/worker/status', auth, (req, res) => {
  const scheduler = require('./scheduler');
  const age = scheduler.heartbeatAgeSec();
  res.json({
    dedicated_worker_alive: scheduler.dedicatedWorkerAlive(),
    heartbeat_age_seconds: age === Infinity ? null : age,
    embedded_fallback: 'ativo (assume automaticamente se o worker dedicado cair)'
  });
});

// Publish now
app.post('/api/posts/:id/publish', auth, acaoPesadaLimiter, async (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });
  post.platforms = JSON.parse(post.platforms || '[]');
  post.account_ids = JSON.parse(post.account_ids || '[]');

  const { publishPost } = require('./publisher');
  const results = await publishPost(post, db);
  res.json({ ok: true, results });
});

// Bulk routes
const bulkRoutes = require('./routes/bulk');
app.use('/api', bulkRoutes(auth));

// Handler global de erros: exceção em rota async não derruba o processo nem
// vaza stack trace pro cliente.
app.use((err, req, res, next) => {
  console.error(`[agenda-turbo-max] erro não tratado em ${req.method} ${req.path}:`, redact(err?.stack || err));
  if (res.headersSent) return next(err);
  res.status(500).json({ error: redact(err?.response?.data?.error?.message || err?.message || 'Erro interno') });
});

process.on('unhandledRejection', (err) => {
  console.error('[agenda-turbo-max] unhandledRejection:', redact(err?.stack || err));
});
process.on('uncaughtException', (err) => {
  console.error('[agenda-turbo-max] uncaughtException:', redact(err?.stack || err));
});

app.listen(PORT, '0.0.0.0', () => {
  initAdmin();
  console.log(`[agenda-turbo-max] Rodando na porta ${PORT}`);
  // Scheduler embutido: garante que agendamentos disparam mesmo se o processo
  // worker dedicado não estiver rodando (guarda de heartbeat evita duplicação).
  require('./scheduler').start('server');
});

module.exports = app;
