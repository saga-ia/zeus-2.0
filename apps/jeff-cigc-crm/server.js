const express = require('express');
const session = require('express-session');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const https = require('https');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3027;
const PASSWORD = process.env.CRM_PASSWORD || 'cigc2026';
const SHEET_ID = '1I2uandximvso0o4bZ2tpy1m-c-ogSds24PwBjYbb-R0';
const SHEET_RANGE = 'Respostas!A:P';
const GOOGLE_USER = 'jefersonhenrike1@gmail.com';
const GOOGLE_SCRIPT = '/opt/jeff-worker/scripts/google.sh';
const DB_PATH = '/opt/jeff-apps/jeff-cigc-crm/kanban.db';

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS lead_stages (
    phone TEXT PRIMARY KEY,
    stage TEXT NOT NULL DEFAULT 'novo_lead',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
`);

// Limpar sessões expiradas na inicialização
db.prepare('DELETE FROM sessions WHERE expires < ?').run(Math.floor(Date.now() / 1000));

// Store de sessão persistente usando SQLite
class SQLiteStore extends session.Store {
  get(sid, cb) {
    try {
      const row = db.prepare('SELECT data, expires FROM sessions WHERE sid = ?').get(sid);
      if (!row) return cb(null, null);
      if (row.expires < Math.floor(Date.now() / 1000)) {
        db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        return cb(null, null);
      }
      cb(null, JSON.parse(row.data));
    } catch (e) { cb(e); }
  }
  set(sid, sessionData, cb) {
    try {
      const expires = Math.floor(Date.now() / 1000) + 8 * 60 * 60;
      db.prepare(`
        INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET data=excluded.data, expires=excluded.expires
      `).run(sid, JSON.stringify(sessionData), expires);
      cb && cb(null);
    } catch (e) { cb && cb(e); }
  }
  destroy(sid, cb) {
    try {
      db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      cb && cb(null);
    } catch (e) { cb && cb(e); }
  }
  touch(sid, sessionData, cb) {
    this.set(sid, sessionData, cb);
  }
}

function generateSalt() { return crypto.randomBytes(16).toString('hex'); }
function hashPassword(password, salt) {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

const STAGES = [
  { key: 'novo_lead',           label: 'Novo Lead',             color: '#7c4dff' },
  { key: 'inicio_atendimento',  label: 'Inicio do Atendimento', color: '#3b82f6' },
  { key: 'em_negociacao',       label: 'Em Negociacao',         color: '#f59e0b' },
  { key: 'perdido',             label: 'Perdido',               color: '#ef4444' },
  { key: 'chamar_novamente',    label: 'Chamar Novamente',      color: '#22c55e' },
];

const STAGES_JSON = JSON.stringify(STAGES);
const STAGES_EXPORT_HTML = STAGES.map(s =>
  `<div class="export-opt" onclick="exportContacts('${s.key}')">${s.label}</div>`
).join('');
const STAGES_SELECT_HTML = STAGES.map(s =>
  `<option value="${s.key}">${s.label}</option>`
).join('');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use(session({
  store: new SQLiteStore(),
  secret: 'cigc-crm-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000, secure: false, sameSite: 'lax' }
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.auth) return next();
  res.redirect('/login');
}

async function getGoogleToken() {
  const { stdout } = await execFileAsync(GOOGLE_SCRIPT, ['token', GOOGLE_USER], { timeout: 8000 });
  return stdout.trim();
}

async function fetchSheetData() {
  const token = await getGoogleToken();
  const range = encodeURIComponent(SHEET_RANGE);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`;
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
      if (res.statusCode !== 200) {
        let errData = '';
        res.on('data', d => errData += d);
        res.on('end', () => reject(new Error(`Google API error ${res.statusCode}: ${errData}`)));
        return;
      }
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Failed to parse Google response: ${e.message}`)); }
      });
    });
    req.setTimeout(5000);
    req.on('timeout', () => { req.destroy(); reject(new Error('Google Sheets API timeout')); });
    req.on('error', reject);
  });
}

app.get('/login', (req, res) => {
  const error = req.query.error ? '<p class="error">Senha incorreta</p>' : '';
  res.send(loginPage(error));
});

app.post('/login', (req, res) => {
  const { name, password } = req.body;
  if (name && name.trim()) {
    const user = db.prepare('SELECT * FROM users WHERE name = ?').get(name.trim());
    if (user) {
      const hash = hashPassword(password, user.salt);
      if (hash === user.password_hash) {
        req.session.auth = true;
        req.session.userName = user.name;
        return res.redirect('/');
      }
      return res.redirect('/login?error=1');
    }
  }
  if (password === PASSWORD) {
    req.session.auth = true;
    req.session.userName = 'Admin';
    return res.redirect('/');
  }
  res.redirect('/login?error=1');
});

app.get('/register', (req, res) => {
  const error = req.query.error ? `<p class="error">${decodeURIComponent(req.query.error)}</p>` : '';
  res.send(registerPage(error));
});

app.post('/register', (req, res) => {
  const { name, password, confirm } = req.body;
  if (!name || !password)
    return res.redirect('/register?error=' + encodeURIComponent('Nome e senha sao obrigatorios'));
  if (password !== confirm)
    return res.redirect('/register?error=' + encodeURIComponent('As senhas nao conferem'));
  if (password.length < 4)
    return res.redirect('/register?error=' + encodeURIComponent('Senha muito curta (minimo 4 caracteres)'));
  const salt = generateSalt();
  const hash = hashPassword(password, salt);
  try {
    db.prepare('INSERT INTO users (name, password_hash, salt) VALUES (?, ?, ?)').run(name.trim(), hash, salt);
    req.session.auth = true;
    req.session.userName = name.trim();
    res.redirect('/');
  } catch (e) {
    const msg = e.message.includes('UNIQUE') ? 'Nome ja cadastrado' : 'Erro ao cadastrar';
    res.redirect('/register?error=' + encodeURIComponent(msg));
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/api/leads', requireAuth, async (req, res) => {
  try {
    const data = await fetchSheetData();
    const rows = data.values || [];
    const headers = rows[0] || [];
    const leads = rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] || ''; });
      return obj;
    });
    // Attach kanban stage
    const stagesMap = {};
    db.prepare('SELECT phone, stage FROM lead_stages').all().forEach(r => {
      stagesMap[r.phone] = r.stage;
    });
    leads.forEach(l => {
      const phone = (l['Telefone'] || '').replace(/\D/g, '');
      l._stage = stagesMap[phone] || 'novo_lead';
      l._phone_key = phone;
    });
    res.json({ ok: true, total: leads.length, leads });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/kanban/move', requireAuth, (req, res) => {
  const { phone, stage } = req.body;
  if (!phone || !STAGES.find(s => s.key === stage)) {
    return res.status(400).json({ ok: false, error: 'invalid' });
  }
  db.prepare(`
    INSERT INTO lead_stages (phone, stage, updated_at)
    VALUES (?, ?, unixepoch())
    ON CONFLICT(phone) DO UPDATE SET stage=excluded.stage, updated_at=excluded.updated_at
  `).run(phone, stage);
  res.json({ ok: true });
});

app.get('/', requireAuth, (req, res) => {
  res.send(dashboardPage());
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CRM CIGC rodando na porta ${PORT}`);
});

// ─── HTML ────────────────────────────────────────────────────────────────────

function loginPage(error) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CRM — CIGC 2026</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg-0:#0b0617;--bg-1:#15082a;--bg-2:#1f0d3e;
  --violet:#7c4dff;--violet-light:#9874f9;
  --gold:#d6b56a;--gold-light:#f0d08a;
  --text-100:#f8f6ff;--text-300:#cfc6e8;--text-500:#8e85ad;
  --border:rgba(255,255,255,0.08);--card:rgba(255,255,255,0.04);
}
body{font-family:'Inter',sans-serif;background:radial-gradient(ellipse at top,var(--bg-2) 0%,var(--bg-1) 40%,var(--bg-0) 80%);min-height:100vh;display:flex;align-items:center;justify-content:center;color:var(--text-100)}
.card{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:48px 40px;width:100%;max-width:400px;text-align:center}
.logo{font-size:13px;font-weight:800;letter-spacing:3px;color:var(--gold);text-transform:uppercase;margin-bottom:8px}
h1{font-size:22px;font-weight:700;margin-bottom:6px}
p.sub{color:var(--text-500);font-size:14px;margin-bottom:32px}
input{width:100%;padding:14px 16px;background:rgba(255,255,255,0.06);border:1px solid var(--border);border-radius:10px;color:var(--text-100);font-size:15px;font-family:inherit;outline:none;margin-bottom:16px;transition:.2s}
input:focus{border-color:var(--violet);background:rgba(124,77,255,0.08)}
button{width:100%;padding:14px;background:linear-gradient(135deg,var(--violet),#5b21b6);border:none;border-radius:10px;color:#fff;font-size:15px;font-weight:700;font-family:inherit;cursor:pointer;transition:.2s}
button:hover{opacity:.9;transform:translateY(-1px)}
.btn-outline{background:transparent;border:1px solid var(--border);color:var(--text-300);margin-top:8px}
.btn-outline:hover{background:rgba(255,255,255,0.06);opacity:1;transform:none}
.error{color:#f87171;font-size:13px;margin-top:-8px;margin-bottom:12px}
.footer-link{margin-top:20px;font-size:13px;color:var(--text-500)}
.footer-link a{color:var(--violet-light);text-decoration:none}
.footer-link a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="card">
  <div class="logo">CIGC 2026</div>
  <h1>CRM de Leads</h1>
  <p class="sub">Acesso restrito — equipe autorizada</p>
  ${error}
  <form method="POST" action="/login">
    <input type="text" name="name" placeholder="Seu nome (usuarios cadastrados)" autocomplete="username">
    <input type="password" name="password" placeholder="Senha de acesso" required autocomplete="current-password">
    <button type="submit">Entrar</button>
  </form>
  <div class="footer-link">Nao tem acesso? <a href="/register">Cadastrar</a></div>
</div>
</body>
</html>`;
}

function registerPage(error) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cadastrar — CRM CIGC 2026</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg-0:#0b0617;--bg-1:#15082a;--bg-2:#1f0d3e;
  --violet:#7c4dff;--violet-light:#9874f9;
  --gold:#d6b56a;--gold-light:#f0d08a;
  --text-100:#f8f6ff;--text-300:#cfc6e8;--text-500:#8e85ad;
  --border:rgba(255,255,255,0.08);--card:rgba(255,255,255,0.04);
}
body{font-family:'Inter',sans-serif;background:radial-gradient(ellipse at top,var(--bg-2) 0%,var(--bg-1) 40%,var(--bg-0) 80%);min-height:100vh;display:flex;align-items:center;justify-content:center;color:var(--text-100)}
.card{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:48px 40px;width:100%;max-width:400px;text-align:center}
.logo{font-size:13px;font-weight:800;letter-spacing:3px;color:var(--gold);text-transform:uppercase;margin-bottom:8px}
h1{font-size:22px;font-weight:700;margin-bottom:6px}
p.sub{color:var(--text-500);font-size:14px;margin-bottom:32px}
input{width:100%;padding:14px 16px;background:rgba(255,255,255,0.06);border:1px solid var(--border);border-radius:10px;color:var(--text-100);font-size:15px;font-family:inherit;outline:none;margin-bottom:16px;transition:.2s}
input:focus{border-color:var(--violet);background:rgba(124,77,255,0.08)}
button{width:100%;padding:14px;background:linear-gradient(135deg,var(--violet),#5b21b6);border:none;border-radius:10px;color:#fff;font-size:15px;font-weight:700;font-family:inherit;cursor:pointer;transition:.2s}
button:hover{opacity:.9;transform:translateY(-1px)}
.btn-outline{background:transparent;border:1px solid var(--border);color:var(--text-300);margin-top:8px}
.btn-outline:hover{background:rgba(255,255,255,0.06);opacity:1;transform:none}
.error{color:#f87171;font-size:13px;margin-top:-8px;margin-bottom:12px}
.footer-link{margin-top:20px;font-size:13px;color:var(--text-500)}
.footer-link a{color:var(--violet-light);text-decoration:none}
.footer-link a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="card">
  <div class="logo">CIGC 2026</div>
  <h1>Criar Acesso</h1>
  <p class="sub">Preencha os dados para se cadastrar</p>
  ${error}
  <form method="POST" action="/register">
    <input type="text" name="name" placeholder="Seu nome" autofocus required autocomplete="name">
    <input type="password" name="password" placeholder="Crie uma senha" required autocomplete="new-password">
    <input type="password" name="confirm" placeholder="Confirme a senha" required autocomplete="new-password">
    <button type="submit">Cadastrar</button>
  </form>
  <div class="footer-link">Ja tem acesso? <a href="/login">Entrar</a></div>
</div>
</body>
</html>`;
}

const DASHBOARD_VERSION = (() => {
  try { return require('fs').statSync(__dirname + '/dashboard.js').mtimeMs.toString(36); }
  catch { return Date.now().toString(36); }
})();

function dashboardPage() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CRM — CIGC 2026</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg-0:#0b0617;--bg-1:#15082a;--bg-2:#1f0d3e;
  --violet:#7c4dff;--violet-light:#9874f9;
  --gold:#d6b56a;--gold-light:#f0d08a;
  --text-100:#f8f6ff;--text-300:#cfc6e8;--text-500:#8e85ad;
  --border:rgba(255,255,255,0.08);--border-strong:rgba(255,255,255,0.15);
  --card:rgba(255,255,255,0.04);
}
body{font-family:'Inter',sans-serif;background:radial-gradient(ellipse at top,var(--bg-2) 0%,var(--bg-1) 40%,var(--bg-0) 80%);min-height:100vh;color:var(--text-100)}

nav{display:flex;align-items:center;justify-content:space-between;padding:18px 32px;border-bottom:1px solid var(--border);position:sticky;top:0;background:rgba(11,6,23,0.85);backdrop-filter:blur(12px);z-index:100}
.nav-brand{display:flex;align-items:center;gap:12px}
.badge{background:linear-gradient(135deg,var(--violet),#5b21b6);border-radius:8px;padding:6px 12px;font-size:12px;font-weight:800;letter-spacing:1px;color:#fff}
.nav-title{font-size:15px;font-weight:600;color:var(--text-300)}
.nav-actions{display:flex;align-items:center;gap:8px}
.btn-sm{padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid var(--border);background:var(--card);color:var(--text-300);font-family:inherit;transition:.2s;display:flex;align-items:center;gap:6px}
.btn-sm:hover{background:rgba(255,255,255,0.08)}
.btn-metrics{background:linear-gradient(135deg,#1a0f3d,#2d1060);border-color:rgba(124,77,255,0.4);color:var(--violet-light)}
.btn-metrics:hover{background:linear-gradient(135deg,#221350,#3d1a80);border-color:var(--violet)}
.btn-refresh{background:linear-gradient(135deg,var(--violet),#5b21b6);border:none;color:#fff}
.view-toggle{display:flex;background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden}
.view-btn{padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;border:none;background:transparent;color:var(--text-500);font-family:inherit;transition:.15s}
.view-btn.active{background:rgba(124,77,255,0.2);color:var(--violet-light)}
.view-btn:hover:not(.active){color:var(--text-300)}

main{max-width:1600px;margin:0 auto;padding:28px 24px}
.page-header{margin-bottom:24px}
.page-header h1{font-size:26px;font-weight:800;margin-bottom:4px}
.page-header p{color:var(--text-500);font-size:14px}

/* STATS */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px}
.stat-card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 18px}
.stat-label{font-size:11px;font-weight:600;color:var(--text-500);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
.stat-value{font-size:28px;font-weight:800;color:var(--text-100)}
.stat-value.gold{color:var(--gold)}
.stat-value.violet{color:var(--violet-light)}
.stat-value.blue{color:#93c5fd}
.stat-value.green{color:#86efac}
.stat-value.orange{color:#fdba74}

/* TABLE VIEW */
#view-table{display:none}
#view-kanban{display:block}

.filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;align-items:center}
.search-wrap{flex:1;min-width:200px;position:relative}
.search-wrap input{width:100%;padding:10px 14px 10px 36px;background:var(--card);border:1px solid var(--border);border-radius:10px;color:var(--text-100);font-size:14px;font-family:inherit;outline:none;transition:.2s}
.search-wrap input:focus{border-color:var(--violet)}
.search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-500)}
select{padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:10px;color:var(--text-300);font-size:14px;font-family:inherit;outline:none;cursor:pointer;transition:.2s}
select:focus{border-color:var(--violet)}

.table-wrap{background:var(--card);border:1px solid var(--border);border-radius:16px;overflow:hidden}
.table-header{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid var(--border)}
.table-header h2{font-size:15px;font-weight:700}
.count{font-size:13px;color:var(--text-500)}
.table-scroll{overflow-x:auto}
table{width:100%;border-collapse:collapse;min-width:1000px}
thead th{padding:11px 14px;text-align:left;font-size:11px;font-weight:700;color:var(--text-500);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);white-space:nowrap;background:rgba(255,255,255,0.02)}
tbody tr{transition:.15s;border-bottom:1px solid var(--border)}
tbody tr:hover{background:rgba(124,77,255,0.06)}
tbody tr:last-child{border-bottom:none}
tbody td{padding:11px 14px;font-size:13px;color:var(--text-300);white-space:nowrap}
tbody td:first-child{color:var(--text-100);font-weight:500}
.tag{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
.tag-fb{background:rgba(59,130,246,0.15);color:#93c5fd}
.tag-ig{background:rgba(217,70,239,0.15);color:#e879f9}
.tag-wifi{background:rgba(34,197,94,0.15);color:#86efac}
.tag-5g{background:rgba(251,146,60,0.15);color:#fdba74}
.tag-sim{background:rgba(124,77,255,0.2);color:#c4b5fd}
.tag-nao{background:rgba(255,255,255,0.05);color:var(--text-500)}
.empty{padding:60px;text-align:center;color:var(--text-500);font-size:14px}
.loading{padding:60px;text-align:center;color:var(--text-500)}
.spin{display:inline-block;width:24px;height:24px;border:2px solid var(--border);border-top-color:var(--violet);border-radius:50%;animation:spin .7s linear infinite;margin-bottom:8px}
@keyframes spin{to{transform:rotate(360deg)}}

/* KANBAN */
.kanban-board{display:flex;gap:16px;overflow-x:auto;padding-bottom:16px;align-items:flex-start}
.kanban-board::-webkit-scrollbar{height:6px}
.kanban-board::-webkit-scrollbar-track{background:rgba(255,255,255,0.03);border-radius:3px}
.kanban-board::-webkit-scrollbar-thumb{background:rgba(124,77,255,0.4);border-radius:3px}
.k-col{min-width:270px;max-width:270px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:14px;display:flex;flex-direction:column;max-height:calc(100vh - 260px)}
.k-col-header{padding:14px 16px;border-bottom:1px solid var(--border);flex-shrink:0;display:flex;align-items:center;gap:8px}
.k-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.k-col-title{font-size:13px;font-weight:700;flex:1}
.k-badge{font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:rgba(255,255,255,0.06);color:var(--text-500)}
.k-cards{padding:10px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:8px}
.k-cards::-webkit-scrollbar{width:4px}
.k-cards::-webkit-scrollbar-thumb{background:rgba(124,77,255,0.3);border-radius:2px}

.k-card{background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:10px;padding:12px 14px;cursor:pointer;transition:.2s;user-select:none}
.k-card:hover{background:rgba(124,77,255,0.1);border-color:rgba(124,77,255,0.4);transform:translateY(-1px)}
.k-card-name{font-size:13px;font-weight:700;color:var(--text-100);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.k-card-phone{font-size:12px;color:var(--text-500);margin-bottom:2px}
.k-card-email{font-size:11px;color:var(--text-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.k-card-date{display:flex;align-items:center;gap:5px;margin-top:6px;font-size:11px;color:var(--gold);font-weight:600;opacity:.85}
.k-card-date svg{opacity:.7}
.k-card-actions{display:flex;gap:6px;margin-top:8px}
.k-btn{padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--text-300);font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:.2s;display:flex;align-items:center;gap:4px;line-height:1}
.k-btn:hover{background:rgba(255,255,255,0.1)}
.k-btn-wa{border-color:rgba(37,211,102,0.3);color:#25d366}
.k-btn-wa:hover{background:rgba(37,211,102,0.12);border-color:#25d366}
.k-btn-copy{border-color:rgba(148,116,249,0.3);color:var(--violet-light)}
.k-btn-copy:hover{background:rgba(148,116,249,0.12)}
.k-filter-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px}
.k-filter-tabs{display:flex;gap:6px;flex-wrap:wrap}
.k-filter-tab{padding:7px 16px;border-radius:20px;border:1px solid var(--border);background:var(--card);color:var(--text-500);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:.2s}
.k-filter-tab:hover{color:var(--text-300);background:rgba(255,255,255,0.07)}
.k-filter-tab.active{background:rgba(124,77,255,0.2);color:var(--violet-light);border-color:rgba(124,77,255,0.4)}
.export-wrap{position:relative}
.btn-export{background:linear-gradient(135deg,#0d2218,#123024);border-color:rgba(37,211,102,0.3);color:#4ade80}
.btn-export:hover{background:linear-gradient(135deg,#122e22,#1a4232);border-color:#25d366}
.export-menu{position:absolute;right:0;top:calc(100% + 6px);background:#15082a;border:1px solid rgba(124,77,255,0.3);border-radius:10px;padding:6px;min-width:220px;z-index:300;display:none;box-shadow:0 8px 32px rgba(0,0,0,0.5)}
.export-menu.open{display:block}
.export-opt{padding:9px 12px;font-size:13px;color:var(--text-300);cursor:pointer;border-radius:6px;transition:.2s;white-space:nowrap}
.export-opt:hover{background:rgba(124,77,255,0.15);color:var(--text-100)}
.export-sep{border:none;border-top:1px solid var(--border);margin:4px 0}

/* MOVE MODAL */
#move-modal{position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);z-index:600;display:none;align-items:center;justify-content:center}
#move-modal.open{display:flex}
.move-card{background:#15082a;border:1px solid rgba(124,77,255,0.3);border-radius:16px;padding:28px;min-width:300px;max-width:360px}
.move-card h3{font-size:16px;font-weight:700;margin-bottom:4px}
.move-card .sub{font-size:13px;color:var(--text-500);margin-bottom:20px}
.stage-list{display:flex;flex-direction:column;gap:8px}
.stage-opt{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;border:1px solid var(--border);cursor:pointer;transition:.2s;background:var(--card)}
.stage-opt:hover{background:rgba(124,77,255,0.12);border-color:rgba(124,77,255,0.4)}
.stage-opt.current{border-color:rgba(124,77,255,0.6);background:rgba(124,77,255,0.15)}
.stage-opt-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.stage-opt-label{font-size:13px;font-weight:600}
.move-footer{margin-top:18px;text-align:right}
.btn-cancel{padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text-500);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:.2s}
.btn-cancel:hover{color:var(--text-300)}

/* METRICS FILTER TABS */
.m-filter-tabs{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:24px}
.m-filter-tab{padding:8px 20px;border-radius:20px;border:1px solid var(--border);background:var(--card);color:var(--text-500);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:.2s}
.m-filter-tab:hover{color:var(--text-300);background:rgba(255,255,255,0.07)}
.m-filter-tab.active{background:rgba(124,77,255,0.2);color:var(--violet-light);border-color:rgba(124,77,255,0.4)}
/* KANBAN DRAG */
.k-card[draggable="true"]{cursor:grab}
.k-card[draggable="true"]:active{cursor:grabbing}
.k-cards.drag-over{background:rgba(124,77,255,0.08);outline:2px dashed rgba(124,77,255,0.5);border-radius:8px}

/* METRICS OVERLAY */
#metrics-overlay{position:fixed;inset:0;background:rgba(11,6,23,0.96);backdrop-filter:blur(20px);z-index:500;display:none;flex-direction:column;overflow-y:auto}
#metrics-overlay.open{display:flex}
.metrics-header{display:flex;align-items:center;justify-content:space-between;padding:22px 36px;border-bottom:1px solid var(--border);flex-shrink:0}
.metrics-header h2{font-size:20px;font-weight:800}
.metrics-header p{font-size:13px;color:var(--text-500);margin-top:2px}
.btn-close{width:36px;height:36px;border-radius:50%;border:1px solid var(--border);background:var(--card);color:var(--text-300);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;transition:.2s}
.btn-close:hover{background:rgba(255,255,255,0.1);color:#fff}
.metrics-body{padding:32px 36px;flex:1}
.metrics-total{text-align:center;margin-bottom:40px}
.metrics-total .big{font-size:72px;font-weight:900;background:linear-gradient(135deg,var(--gold-light),var(--gold));-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1}
.metrics-total .big-label{font-size:14px;color:var(--text-500);margin-top:6px;text-transform:uppercase;letter-spacing:2px}
.gauges-title{font-size:13px;font-weight:700;color:var(--text-500);text-transform:uppercase;letter-spacing:1px;margin-bottom:24px;text-align:center}
.gauges-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:28px;max-width:1200px;margin:0 auto}
.gauge-item{display:flex;flex-direction:column;align-items:center;gap:6px}
.gauge-item svg{overflow:visible}
.gauge-label{font-size:13px;font-weight:600;color:var(--text-300);text-align:center}
.gauge-sub{font-size:11px;color:var(--text-500);text-align:center}
.divider{border:none;border-top:1px solid var(--border);margin:36px 0}
.top-lists{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;max-width:1200px;margin:0 auto}
.top-card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:20px}
.top-card h3{font-size:13px;font-weight:700;color:var(--text-500);text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px}
.top-row{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.top-rank{font-size:11px;font-weight:700;color:var(--text-500);width:18px}
.top-bar-wrap{flex:1;background:rgba(255,255,255,0.04);border-radius:4px;height:6px;overflow:hidden}
.top-bar{height:100%;border-radius:4px;transition:width 1s ease}
.top-name{font-size:13px;color:var(--text-300);min-width:80px}
.top-val{font-size:12px;font-weight:700;color:var(--text-100);margin-left:auto}

@media (max-width:768px) {
  nav{padding:12px 14px;flex-wrap:wrap;gap:8px}
  .nav-brand{flex:1;min-width:0}
  .nav-title{display:none}
  .nav-actions{width:100%;overflow-x:auto;padding-bottom:2px;-webkit-overflow-scrolling:touch;flex-wrap:nowrap}
  .nav-actions::-webkit-scrollbar{height:3px}
  .nav-actions::-webkit-scrollbar-thumb{background:rgba(124,77,255,0.4);border-radius:2px}
  main{padding:20px 12px}
  .stats{grid-template-columns:repeat(2,1fr)}
  .page-header h1{font-size:20px}
  .btn-sm{white-space:nowrap}
  .view-btn{white-space:nowrap}
}
</style>
</head>
<body>

<!-- METRICS OVERLAY -->
<div id="metrics-overlay">
  <div class="metrics-header">
    <div>
      <h2>Painel de Metricas</h2>
      <p>Congresso Internacional para Gestores de Clinica — 2026</p>
    </div>
    <button class="btn-close" onclick="closeMetrics()">&#x2715;</button>
  </div>
  <div class="metrics-body">
    <div class="metrics-total">
      <div class="big" id="m-total">--</div>
      <div class="big-label">Leads Captados</div>
    </div>
    <div class="m-filter-tabs" id="metrics-filter-tabs"></div>
    <div class="gauges-title">Distribuicao por Categoria</div>
    <div class="gauges-grid" id="gauges-grid"></div>
    <hr class="divider">
    <div class="top-lists" id="top-lists"></div>
  </div>
</div>

<!-- MOVE MODAL -->
<div id="move-modal">
  <div class="move-card">
    <h3 id="modal-name">Mover lead</h3>
    <div class="sub" id="modal-sub">Selecione a etapa</div>
    <div class="stage-list" id="stage-list"></div>
    <div class="move-footer"><button class="btn-cancel" onclick="closeModal()">Cancelar</button></div>
  </div>
</div>

<nav>
  <div class="nav-brand">
    <img src="/logo.png" alt="CIGC 2026" style="height:32px;width:auto;margin-right:6px">
    <span class="nav-title">CRM de Leads</span>
  </div>
  <div class="nav-actions">
    <div class="view-toggle">
      <button class="view-btn active" id="btn-view-kanban" onclick="setView('kanban')">Kanban</button>
      <button class="view-btn" id="btn-view-list" onclick="setView('list')">Lista</button>
    </div>
    <button class="btn-sm btn-metrics" onclick="openMetrics()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
      Metricas
    </button>
    <button class="btn-sm btn-refresh" onclick="loadLeads()">Atualizar</button>
    <div class="export-wrap" id="export-wrap">
      <button class="btn-sm btn-export" onclick="toggleExport()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Exportar
      </button>
      <div class="export-menu" id="export-menu">
        <div class="export-opt" onclick="exportContacts('all')">Todos os contatos</div>
        <hr class="export-sep">
        ${STAGES_EXPORT_HTML}
      </div>
    </div>
    <a href="/logout"><button class="btn-sm">Sair</button></a>
  </div>
</nav>

<main>
  <div class="page-header">
    <h1>Painel de Leads</h1>
    <p>Congresso Internacional para Gestores de Clinica</p>
  </div>

  <div class="stats" id="stats">
    <div class="stat-card"><div class="stat-label">Total de Leads</div><div class="stat-value gold" id="stat-total">--</div></div>
    <div class="stat-card"><div class="stat-label">Facebook</div><div class="stat-value blue" id="stat-fb">--</div></div>
    <div class="stat-card"><div class="stat-label">Instagram</div><div class="stat-value violet" id="stat-ig">--</div></div>
    <div class="stat-card"><div class="stat-label">Donos de Clinica</div><div class="stat-value green" id="stat-donos">--</div></div>
    <div class="stat-card"><div class="stat-label">Estados</div><div class="stat-value orange" id="stat-estados">--</div></div>
    <div class="stat-card"><div class="stat-label">Cidades</div><div class="stat-value" id="stat-cidades">--</div></div>
  </div>

  <!-- TABLE VIEW -->
  <div id="view-table">
    <div class="filters">
      <div class="search-wrap">
        <span class="search-icon">&#9906;</span>
        <input type="text" id="search" placeholder="Buscar por nome, email, telefone, clinica, cidade..." oninput="applyFilters()">
      </div>
      <select id="filter-plataforma" onchange="applyFilters()">
        <option value="">Todas as plataformas</option>
        <option value="FB">Facebook</option>
        <option value="IG">Instagram</option>
      </select>
      <select id="filter-regiao" onchange="applyFilters()">
        <option value="">Todas as regioes</option>
      </select>
      <select id="filter-estado" onchange="applyFilters()">
        <option value="">Todos os estados</option>
      </select>
      <select id="filter-segmento" onchange="applyFilters()">
        <option value="">Todos os segmentos</option>
      </select>
      <select id="filter-dono" onchange="applyFilters()">
        <option value="">Donos e nao-donos</option>
        <option value="Sim">Donos de clinica</option>
        <option value="Nao">Nao donos</option>
      </select>
      <select id="filter-stage" onchange="applyFilters()">
        <option value="">Todas as etapas</option>
        ${STAGES_SELECT_HTML}
      </select>
    </div>

    <div class="table-wrap">
      <div class="table-header">
        <h2>Registros</h2>
        <span class="count" id="table-count">carregando...</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Clinica</th>
              <th>Dono</th>
              <th>Segmento</th>
              <th>Cidade</th>
              <th>Estado</th>
              <th>Regiao</th>
              <th>Plataforma</th>
              <th>Conexao</th>
              <th>Posicionamento</th>
              <th>Etapa</th>
              <th>Data/Hora</th>
            </tr>
          </thead>
          <tbody id="leads-body">
            <tr><td colspan="13" class="loading"><div class="spin"></div><br>Carregando leads...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- KANBAN VIEW -->
  <div id="view-kanban">
    <div class="k-filter-row">
      <div class="k-filter-tabs" id="k-filter-tabs"></div>
    </div>
    <div class="kanban-board" id="kanban-board">
      <div style="padding:60px;text-align:center;color:var(--text-500)">Carregando...</div>
    </div>
  </div>
</main>

<script>window.STAGES = ${STAGES_JSON};</script>
<script src="/dashboard.js?v=${DASHBOARD_VERSION}"></script>
<!--__DASHBOARD_JS_REMOVED_BELOW__
let allLeads = [];
let currentView = 'kanban';
let modalLead = null;
let kanbanFilter = 'all';
const CIRC = 2 * Math.PI * 70;

// ── VIEW TOGGLE ──────────────────────────────────────────────────────────────
function setView(v) {
  currentView = v;
  document.getElementById('view-table').style.display = v === 'list' ? 'block' : 'none';
  document.getElementById('view-kanban').style.display = v === 'kanban' ? 'block' : 'none';
  document.getElementById('btn-view-list').classList.toggle('active', v === 'list');
  document.getElementById('btn-view-kanban').classList.toggle('active', v === 'kanban');
  if (v === 'kanban' && allLeads.length) { initFilterTabs(); renderKanban(allLeads); }
}

// ── DATA ─────────────────────────────────────────────────────────────────────
async function loadLeads() {
  document.getElementById('leads-body').innerHTML = '<tr><td colspan="13" class="loading"><div class="spin"></div><br>Carregando...</td></tr>';
  document.getElementById('kanban-board').innerHTML = '<div style="padding:60px;text-align:center;color:var(--text-500)"><div class="spin"></div><br>Carregando leads...</div>';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const r = await fetch('/api/leads', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!r.ok) {
      throw new Error('Sessao expirada. Faca login novamente.');
    }
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'Erro ao carregar leads');
    allLeads = data.leads || [];
    buildFilters();
    updateStats(allLeads);
    applyFilters();
    initFilterTabs();
    if (currentView === 'kanban') renderKanban(allLeads);
  } catch(e) {
    const msg = e.name === 'AbortError' ? 'Tempo esgotado. Clique em Atualizar para tentar de novo.' : e.message;
    console.error('loadLeads error:', msg);
    document.getElementById('leads-body').innerHTML = '<tr><td colspan="13" class="empty">' + msg + '</td></tr>';
    document.getElementById('kanban-board').innerHTML = '<div style="padding:60px;text-align:center;color:#f87171;font-size:14px">' + msg + '<br><br><button onclick="loadLeads()" style="padding:8px 20px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(124,77,255,0.2);color:#c4b5fd;cursor:pointer;font-family:inherit">Tentar novamente</button></div>';
  }
}

// ── KANBAN ───────────────────────────────────────────────────────────────────
function initFilterTabs() {
  const el = document.getElementById('k-filter-tabs');
  if (!el) return;
  const all = [{key:'all', label:'Todas', color:'#8e85ad'}].concat(STAGES);
  el.innerHTML = all.map(s => \`
    <button class="k-filter-tab\${kanbanFilter===s.key?' active':''}"
      data-stage="\${s.key}" onclick="setKanbanFilter('\${s.key}')">\${s.label}</button>
  \`).join('');
}

function setKanbanFilter(key) {
  kanbanFilter = key;
  document.querySelectorAll('.k-filter-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.stage === key);
  });
  renderKanban(allLeads);
}

function renderKanban(leads) {
  const board = document.getElementById('kanban-board');
  const visibleLeads = kanbanFilter === 'all' ? leads : leads.filter(l => (l._stage || 'novo_lead') === kanbanFilter);
  const byStage = {};
  STAGES.forEach(s => { byStage[s.key] = []; });
  visibleLeads.forEach(l => {
    const st = l._stage || 'novo_lead';
    if (byStage[st]) byStage[st].push(l); else byStage['novo_lead'].push(l);
  });

  board.innerHTML = STAGES.map(s => {
    const cards = byStage[s.key];
    const cardHtml = cards.length
      ? cards.map(l => {
          const ph = l._phone_key || '';
          return \`
          <div class="k-card" onclick="openModal(\${JSON.stringify(l).replace(/"/g,'&quot;')})">
            <div class="k-card-name">\${esc(l['Nome'])}</div>
            <div class="k-card-phone">\${esc(l['Telefone'])}</div>
            <div class="k-card-email">\${esc(l['Email'])}</div>
            <div class="k-card-actions" onclick="event.stopPropagation()">
              <button class="k-btn k-btn-wa" onclick="openWhatsApp('\${ph}')">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                WhatsApp
              </button>
              <button class="k-btn k-btn-copy" onclick="copyPhone('\${ph}', event)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                Copiar
              </button>
            </div>
          </div>\`;
        }).join('')
      : \`<div style="padding:20px;text-align:center;color:var(--text-500);font-size:12px">Sem leads</div>\`;

    return \`<div class="k-col">
      <div class="k-col-header">
        <div class="k-dot" style="background:\${s.color}"></div>
        <div class="k-col-title">\${s.label}</div>
        <div class="k-badge">\${cards.length}</div>
      </div>
      <div class="k-cards">\${cardHtml}</div>
    </div>\`;
  }).join('');
}

function openWhatsApp(phone) {
  const ph = phone.replace(/\D/g, '');
  const waNum = (ph.startsWith('55') && ph.length >= 12) ? ph : '55' + ph;
  const lead = allLeads.find(l => l._phone_key === phone);
  if (lead && lead._stage === 'novo_lead') {
    fetch('/api/kanban/move', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({phone, stage:'inicio_atendimento'})
    }).then(() => {
      lead._stage = 'inicio_atendimento';
      renderKanban(allLeads);
    });
  }
  window.open('https://wa.me/' + waNum, '_blank');
}

function copyPhone(phone, event) {
  event.stopPropagation();
  const btn = event.currentTarget;
  navigator.clipboard.writeText(phone).then(() => {
    const orig = btn.innerHTML;
    btn.textContent = 'Copiado!';
    setTimeout(() => { btn.innerHTML = orig; }, 1500);
  });
}

function toggleExport() {
  const menu = document.getElementById('export-menu');
  menu.classList.toggle('open');
}

function exportContacts(stage) {
  document.getElementById('export-menu').classList.remove('open');
  const leads = stage === 'all' ? allLeads : allLeads.filter(l => (l._stage||'novo_lead') === stage);
  const cols = ['Nome','Telefone','Email','Nome da Clinica','Dono de Clinica','Segmento','Cidade','Estado','Regiao','Plataforma (FB/IG)','Etapa'];
  const rows = [cols.join(';')];
  leads.forEach(l => {
    const st = STAGE_MAP[l._stage] || STAGE_MAP['novo_lead'];
    const vals = cols.slice(0,-1).map(h => '"' + (l[h]||'').replace(/"/g,'""') + '"');
    vals.push('"' + st.label + '"');
    rows.push(vals.join(';'));
  });
  const blob = new Blob(['﻿' + rows.join('\\n')], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'leads-cigc-' + (stage==='all'?'todos':stage) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── MOVE MODAL ───────────────────────────────────────────────────────────────
function openModal(lead) {
  modalLead = lead;
  document.getElementById('modal-name').textContent = lead['Nome'] || 'Lead';
  document.getElementById('modal-sub').textContent = lead['Telefone'] || '';

  const list = document.getElementById('stage-list');
  list.innerHTML = STAGES.map(s => \`
    <div class="stage-opt\${lead._stage === s.key ? ' current' : ''}" onclick="moveLead('\${s.key}')">
      <div class="stage-opt-dot" style="background:\${s.color}"></div>
      <span class="stage-opt-label">\${s.label}</span>
    </div>\`).join('');

  document.getElementById('move-modal').classList.add('open');
}

function closeModal() {
  document.getElementById('move-modal').classList.remove('open');
  modalLead = null;
}

async function moveLead(stage) {
  if (!modalLead) return;
  const phone = modalLead._phone_key;
  closeModal();
  try {
    await fetch('/api/kanban/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, stage })
    });
    // Update local state
    allLeads.forEach(l => { if (l._phone_key === phone) l._stage = stage; });
    applyFilters();
    if (currentView === 'kanban') renderKanban(allLeads);
  } catch(e) { console.error(e); }
}

document.getElementById('move-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('move-modal')) closeModal();
});

// ── TABLE ────────────────────────────────────────────────────────────────────
function buildFilters() {
  const regioes = [...new Set(allLeads.map(l => l['Regiao']).filter(Boolean))].sort();
  const estados = [...new Set(allLeads.map(l => l['Estado']).filter(Boolean))].sort();
  const segmentos = [...new Set(allLeads.map(l => l['Segmento']).filter(Boolean))].sort();

  const populate = (id, list) => {
    const sel = document.getElementById(id);
    const first = sel.options[0];
    sel.innerHTML = '';
    sel.appendChild(first);
    list.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
  };
  populate('filter-regiao', regioes);
  populate('filter-estado', estados);
  populate('filter-segmento', segmentos);
}

function updateStats(leads) {
  document.getElementById('stat-total').textContent = leads.length;
  document.getElementById('stat-fb').textContent = leads.filter(l => (l['Plataforma (FB/IG)']||'').includes('FB')).length;
  document.getElementById('stat-ig').textContent = leads.filter(l => (l['Plataforma (FB/IG)']||'').includes('IG')).length;
  document.getElementById('stat-donos').textContent = leads.filter(l => (l['Dono de Clinica']||'').toLowerCase().startsWith('sim')).length;
  document.getElementById('stat-estados').textContent = new Set(leads.map(l => l['Estado']).filter(Boolean)).size;
  document.getElementById('stat-cidades').textContent = new Set(leads.map(l => l['Cidade']).filter(Boolean)).size;
}

function applyFilters() {
  const q = document.getElementById('search').value.toLowerCase();
  const plat = document.getElementById('filter-plataforma').value;
  const regiao = document.getElementById('filter-regiao').value;
  const estado = document.getElementById('filter-estado').value;
  const seg = document.getElementById('filter-segmento').value;
  const dono = document.getElementById('filter-dono').value;
  const stageF = document.getElementById('filter-stage').value;

  const filtered = allLeads.filter(l => {
    const searchable = [l['Nome'],l['Email'],l['Telefone'],l['Nome da Clinica'],l['Cidade']].join(' ').toLowerCase();
    if (q && !searchable.includes(q)) return false;
    if (plat && !(l['Plataforma (FB/IG)']||'').includes(plat)) return false;
    if (regiao && l['Regiao'] !== regiao) return false;
    if (estado && l['Estado'] !== estado) return false;
    if (seg && l['Segmento'] !== seg) return false;
    if (dono) {
      const d = (l['Dono de Clinica']||'').toLowerCase();
      if (dono === 'Sim' && !d.startsWith('sim')) return false;
      if (dono === 'Nao' && d.startsWith('sim')) return false;
    }
    if (stageF && (l._stage||'novo_lead') !== stageF) return false;
    return true;
  });

  renderTable(filtered);
  document.getElementById('table-count').textContent = filtered.length + ' de ' + allLeads.length + ' leads';
}

const STAGE_MAP = {};
STAGES.forEach(s => { STAGE_MAP[s.key] = s; });

function renderTable(leads) {
  if (!leads.length) {
    document.getElementById('leads-body').innerHTML = '<tr><td colspan="13" class="empty">Nenhum lead encontrado</td></tr>';
    return;
  }
  const rows = leads.map(l => {
    const plat = l['Plataforma (FB/IG)'] || '';
    const conn = l['Conexao (WiFi/5G)'] || '';
    const dono = l['Dono de Clinica'] || '';
    const platTag = plat.includes('FB') ? '<span class="tag tag-fb">FB</span>' : plat.includes('IG') ? '<span class="tag tag-ig">IG</span>' : esc(plat);
    const connTag = conn.includes('WiFi') ? '<span class="tag tag-wifi">WiFi</span>' : conn.includes('5G') ? '<span class="tag tag-5g">5G</span>' : esc(conn);
    const donoTag = dono.toLowerCase().startsWith('sim') ? '<span class="tag tag-sim">Sim</span>' : dono ? '<span class="tag tag-nao">Nao</span>' : '';
    const st = STAGE_MAP[l._stage] || STAGE_MAP['novo_lead'];
    const stageTag = \`<span class="tag" style="background:\${st.color}22;color:\${st.color}">\${st.label}</span>\`;
    return \`<tr>
      <td>\${esc(l['Nome'])}</td>
      <td>\${esc(l['Telefone'])}</td>
      <td>\${esc(l['Nome da Clinica'])}</td>
      <td>\${donoTag}</td>
      <td>\${esc(l['Segmento'])}</td>
      <td>\${esc(l['Cidade'])}</td>
      <td>\${esc(l['Estado'])}</td>
      <td>\${esc(l['Regiao'])}</td>
      <td>\${platTag}</td>
      <td>\${connTag}</td>
      <td>\${esc(l['Posicionamento'])}</td>
      <td>\${stageTag}</td>
      <td>\${esc(l['Data/Hora (BRT)'])}</td>
    </tr>\`;
  }).join('');
  document.getElementById('leads-body').innerHTML = rows;
}

// ── METRICS ──────────────────────────────────────────────────────────────────
function buildGauge(label, display, pct, colorStart, colorEnd, sub) {
  const dash = Math.max(0, Math.min(pct / 100, 1)) * CIRC;
  const id = 'g' + Math.random().toString(36).slice(2);
  return \`<div class="gauge-item">
    <svg width="180" height="180" viewBox="0 0 180 180">
      <defs>
        <linearGradient id="\${id}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="\${colorStart}"/>
          <stop offset="100%" stop-color="\${colorEnd}"/>
        </linearGradient>
      </defs>
      <circle cx="90" cy="90" r="70" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="14"/>
      <circle cx="90" cy="90" r="70" fill="none" stroke="url(#\${id})" stroke-width="14"
        stroke-dasharray="\${dash.toFixed(2)} \${CIRC.toFixed(2)}"
        transform="rotate(-90,90,90)"
        stroke-linecap="round"/>
      <text x="90" y="84" text-anchor="middle" fill="#f8f6ff" font-size="24" font-weight="800" font-family="Inter,sans-serif">\${display}</text>
      <text x="90" y="108" text-anchor="middle" fill="#8e85ad" font-size="13" font-family="Inter,sans-serif">\${pct.toFixed(1)}%</text>
    </svg>
    <div class="gauge-label">\${label}</div>
    \${sub ? \`<div class="gauge-sub">\${sub}</div>\` : ''}
  </div>\`;
}

function buildTopList(title, items, color) {
  if (!items.length) return '';
  const max = items[0].count;
  const rows = items.slice(0, 6).map((it, i) => {
    const w = max > 0 ? (it.count / max * 100).toFixed(1) : 0;
    return \`<div class="top-row">
      <span class="top-rank">\${i+1}</span>
      <span class="top-name">\${esc(it.name)}</span>
      <div class="top-bar-wrap"><div class="top-bar" style="width:\${w}%;background:\${color}"></div></div>
      <span class="top-val">\${it.count}</span>
    </div>\`;
  }).join('');
  return \`<div class="top-card"><h3>\${title}</h3>\${rows}</div>\`;
}

function topN(arr, key) {
  const map = {};
  arr.forEach(l => { const v = l[key] || 'N/A'; map[v] = (map[v] || 0) + 1; });
  return Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}));
}

function openMetrics() {
  if (!allLeads.length) { alert('Carregue os leads primeiro.'); return; }
  renderMetrics(allLeads);
  document.getElementById('metrics-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeMetrics() {
  document.getElementById('metrics-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMetrics(); closeModal(); document.getElementById('export-menu').classList.remove('open'); } });
document.addEventListener('click', e => {
  const wrap = document.getElementById('export-wrap');
  if (wrap && !wrap.contains(e.target)) document.getElementById('export-menu').classList.remove('open');
});

function renderMetrics(leads) {
  const n = leads.length;
  document.getElementById('m-total').textContent = n;

  const pctFB = n ? leads.filter(l=>(l['Plataforma (FB/IG)']||'').includes('FB')).length / n * 100 : 0;
  const pctIG = n ? leads.filter(l=>(l['Plataforma (FB/IG)']||'').includes('IG')).length / n * 100 : 0;
  const pctDono = n ? leads.filter(l=>(l['Dono de Clinica']||'').toLowerCase().startsWith('sim')).length / n * 100 : 0;
  const pctWifi = n ? leads.filter(l=>(l['Conexao (WiFi/5G)']||'').toLowerCase().includes('wifi')).length / n * 100 : 0;
  const pct5G = n ? leads.filter(l=>(l['Conexao (WiFi/5G)']||'').toLowerCase().includes('5g')).length / n * 100 : 0;
  const pctEmail = n ? leads.filter(l=>l['Email'] && l['Email'].includes('@')).length / n * 100 : 0;
  const topEstado = topN(leads, 'Estado')[0];
  const pctTopEstado = (topEstado && n) ? topEstado.count / n * 100 : 0;
  const topRegiao = topN(leads, 'Regiao')[0];
  const pctTopRegiao = (topRegiao && n) ? topRegiao.count / n * 100 : 0;

  const gauges = [
    buildGauge('Donos de Clinica', pctDono.toFixed(0)+'%', pctDono, '#7c4dff', '#d6b56a', null),
    buildGauge('Facebook', pctFB.toFixed(0)+'%', pctFB, '#3b82f6', '#60a5fa', null),
    buildGauge('Instagram', pctIG.toFixed(0)+'%', pctIG, '#d946ef', '#e879f9', null),
    buildGauge('WiFi', pctWifi.toFixed(0)+'%', pctWifi, '#22c55e', '#86efac', null),
    buildGauge('5G', pct5G.toFixed(0)+'%', pct5G, '#f97316', '#fdba74', null),
    buildGauge('Email Preenchido', pctEmail.toFixed(0)+'%', pctEmail, '#06b6d4', '#67e8f9', null),
    buildGauge('Top Estado', pctTopEstado.toFixed(0)+'%', pctTopEstado, '#d6b56a', '#f0d08a', topEstado ? topEstado.name : ''),
    buildGauge('Top Regiao', pctTopRegiao.toFixed(0)+'%', pctTopRegiao, '#8b5cf6', '#c4b5fd', topRegiao ? topRegiao.name : ''),
  ];
  document.getElementById('gauges-grid').innerHTML = gauges.join('');

  const tops = [
    buildTopList('Por Estado', topN(leads,'Estado'), '#7c4dff'),
    buildTopList('Por Cidade', topN(leads,'Cidade'), '#d6b56a'),
    buildTopList('Por Regiao', topN(leads,'Regiao'), '#22c55e'),
    buildTopList('Por Segmento', topN(leads,'Segmento'), '#f97316'),
    buildTopList('Por Posicionamento', topN(leads,'Posicionamento'), '#e879f9'),
    buildTopList('Por Dia da Semana', topN(leads,'Dia da Semana'), '#60a5fa'),
  ];
  document.getElementById('top-lists').innerHTML = tops.join('');
}

function esc(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

loadLeads();
__DASHBOARD_JS_REMOVED_ABOVE__-->
</body>
</html>`;
}
