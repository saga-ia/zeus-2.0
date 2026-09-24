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
const PORT = process.env.PORT || 3028;
const PASSWORD = process.env.CRM_PASSWORD || 'farias2026';
// Senha redefinida pelo "Esqueci minha senha" fica em data/auth-override.json e vale no lugar da CRM_PASSWORD.
const pwdReset = require('/opt/jeff-apps/jeff-shared/password-reset');
const pwdOverride = pwdReset.overrideStore(require('path').join(__dirname, 'data'));
function checkPassword(pwd) {
  const viaOverride = pwdOverride.check(pwd || '');
  return viaOverride !== null ? viaOverride : pwd === PASSWORD;
}
const SHEET_ID = '13Fgr8BSzdNkuyZg6Ed2vFuQYTwAAFJlVu0eupV64S78';
const SHEET_RANGE = 'Aplicações!A:Z';
const COMPRADORES_RANGE = 'Compradores!A:J';
const LINKEDIN_RANGE = "'Leads LinkedIn Odilon'!A:H";
const REPORTS_SHEET_ID = '1WIfmYEwmtDQTfOAN3Ax6EUK_fFArZg0-N7OBNI4z5ME';
const REPORTS_RANGE = "'relatórios do social seller captação'!A:F";
const GOOGLE_USER = 'jefersonhenrike1@gmail.com';
const GOOGLE_SCRIPT = '/opt/jeff-worker/scripts/google.sh';
const DB_PATH = path.join(__dirname, 'kanban.db');

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS lead_stages (
    lead_key TEXT PRIMARY KEY,
    stage TEXT NOT NULL DEFAULT 'novo_lead',
    notes TEXT DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS manual_leads (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    empresa TEXT,
    telefone TEXT,
    email TEXT,
    posicao TEXT,
    cidade TEXT,
    estado TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
`);

db.prepare('DELETE FROM sessions WHERE expires < ?').run(Math.floor(Date.now() / 1000));

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
      const expires = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
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
  touch(sid, sessionData, cb) { this.set(sid, sessionData, cb); }
}

const STAGES = [
  { key: 'novo_lead',       label: 'Novo Lead',                color: '#3b82f6' },
  { key: 'em_negociacao',   label: 'Em Negociação',            color: '#f59e0b' },
  { key: 'vai_participar',  label: 'Vai Participar do Evento', color: '#22c55e' },
  { key: 'nao_vai',         label: 'Não Vai Participar',       color: '#ef4444' },
];

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new SQLiteStore(),
  secret: 'farias-crm-' + crypto.randomBytes(8).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 12 * 60 * 60 * 1000, secure: false, sameSite: 'lax' }
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.auth) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'unauthorized' });
  res.redirect('/login');
}

async function getGoogleToken() {
  const { stdout } = await execFileAsync(GOOGLE_SCRIPT, ['token', GOOGLE_USER], { timeout: 8000 });
  return stdout.trim();
}

function httpsGetJson(url, token) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Google API ${res.statusCode}: ${data}`));
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Failed to parse: ${e.message}`)); }
      });
    });
    req.setTimeout(10000);
    req.on('timeout', () => { req.destroy(); reject(new Error('Sheets API timeout')); });
    req.on('error', reject);
  });
}

async function fetchSheetData() {
  const token = await getGoogleToken();
  const ranges = [SHEET_RANGE, COMPRADORES_RANGE, LINKEDIN_RANGE]
    .map(r => `ranges=${encodeURIComponent(r)}`).join('&');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchGet?${ranges}`;
  return httpsGetJson(url, token);
}

// Mapeia cor de fundo da linha na aba Aplicações -> estágio do funil.
// Verde  -> vai_participar   (Jeff marca cliente confirmado no evento)
// Vermelho -> nao_vai        (Jeff marca lead descartado)
// Laranja/amarelo -> em_negociacao (todos os tons de laranja/amarelo)
function bgToStage(bg) {
  if (!bg) return null;
  const r = bg.red ?? 0, g = bg.green ?? 0, b = bg.blue ?? 0;
  if (Math.abs(r - 1) < 0.05 && Math.abs(g - 1) < 0.05 && Math.abs(b - 1) < 0.05) return null;
  if (g > r + 0.05 && g > b + 0.05 && g > 0.35) return 'vai_participar';
  if (r > 0.7 && g < 0.45 && b < 0.45) return 'nao_vai';
  if (r > 0.85 && g > 0.45 && b < 0.7 && r > b) return 'em_negociacao';
  return null;
}

async function fetchAplicacoesColors() {
  const token = await getGoogleToken();
  const fields = encodeURIComponent('sheets(data(rowData(values(effectiveFormat(backgroundColor)))))');
  const range = encodeURIComponent(SHEET_RANGE);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?includeGridData=true&ranges=${range}&fields=${fields}`;
  const data = await httpsGetJson(url, token);
  const rowData = data.sheets?.[0]?.data?.[0]?.rowData || [];
  // primeira linha = cabeçalho; retorna array 0-indexado alinhado a rowData.slice(1)
  return rowData.slice(1).map(r => {
    const cells = r.values || [];
    for (const c of cells) {
      const stage = bgToStage(c.effectiveFormat?.backgroundColor);
      if (stage) return stage;
    }
    return null;
  });
}

async function fetchReportsData() {
  const token = await getGoogleToken();
  const range = encodeURIComponent(REPORTS_RANGE);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${REPORTS_SHEET_ID}/values/${range}`;
  return httpsGetJson(url, token);
}

function normalizePhone(p) {
  return String(p || '').replace(/\D/g, '');
}

function parseTimestamp(str) {
  const m = String(str || '').match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, hour: parseInt(m[4], 10), minute: parseInt(m[5], 10), raw: str };
}

function hourBucket(hour) {
  if (hour == null) return null;
  if (hour < 6)  return '00-06';
  if (hour < 12) return '06-12';
  if (hour < 18) return '12-18';
  return '18-24';
}

// ---------- routes ----------
app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));


pwdReset.mount(app, {
  appName: 'CRM Farias Souza',
  setPassword: (newPass) => { pwdOverride.write(newPass); return true; }
});

app.get('/login', (req, res) => {
  const error = req.query.error ? '<p class="error">Senha incorreta</p>' : '';
  res.send(loginPage(error));
});

app.post('/login', (req, res) => {
  if (checkPassword(req.body.password)) {
    req.session.auth = true;
    return res.redirect('/');
  }
  res.redirect('/login?error=1');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

function parseSheetRows(rows, mapper) {
  if (!rows || rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1)
    .filter(r => r && r.length && r.some(v => v && String(v).trim()))
    .map((row, idx) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] || ''; });
      return mapper(obj, idx);
    })
    .filter(Boolean);
}

app.get('/api/leads', requireAuth, async (req, res) => {
  try {
    const [data, aplicColorStages] = await Promise.all([
      fetchSheetData(),
      fetchAplicacoesColors().catch(e => { console.warn('[farias] cor aplic falhou:', e.message); return []; }),
    ]);
    const [aplicRange, compRange, linkedinRange] = data.valueRanges || [];

    // Aplicações (formulário) — default: novo_lead; cor da linha (verde/laranja/vermelho) sobrescreve.
    const aplicLeads = [];
    const aplicRows = (aplicRange && aplicRange.values) || [];
    const aplicHeaders = aplicRows[0] || [];
    for (let i = 1; i < aplicRows.length; i++) {
      const row = aplicRows[i];
      if (!row || !row.length || !row.some(v => v && String(v).trim())) continue;
      const obj = {};
      aplicHeaders.forEach((h, j) => { obj[h] = row[j] || ''; });
      if (!obj['Nome Completo'] && !obj['Telefone']) continue;
      const phone = normalizePhone(obj['Telefone']);
      const ts = parseTimestamp(obj['Data/Hora (BRT)']);
      const colorStage = aplicColorStages[i - 1] || null;
      aplicLeads.push({
        ...obj,
        _phone: phone,
        _key: phone || `aplic-${i}`,
        _ts: ts,
        _hour: ts ? ts.hour : null,
        _hour_bucket: ts ? hourBucket(ts.hour) : null,
        _date: ts ? ts.date : null,
        _source: 'aplicacao',
        _default_stage: colorStage || 'novo_lead',
        _color_stage: colorStage,
      });
    }

    // Compradores — default: vai_participar
    const compradoresLeads = parseSheetRows(compRange && compRange.values, (obj, idx) => {
      if (!obj['Nome']) return null;
      const phone = normalizePhone(obj['Telefone']);
      return {
        'Nome Completo': obj['Nome'],
        'Empresa': obj['Empresa'],
        'Telefone': obj['Telefone'],
        'E-mail Corporativo': obj['E-mail'],
        'Posição': obj['Posição'],
        'Faturamento Anual': obj['Faturamento'],
        'Cidade': obj['Cidade'],
        'Estado/Região': obj['Estado'],
        'Origem': obj['Origem'] || 'Comprador',
        'Data/Hora (BRT)': obj['Data Aplicação (BRT)'],
        _phone: phone,
        _key: phone || `comp-${idx}`,
        _ts: null,
        _hour: null,
        _hour_bucket: null,
        _date: null,
        _source: 'comprador',
        _default_stage: 'vai_participar'
      };
    });

    // Leads LinkedIn Odilon — default: novo_lead
    const linkedinLeads = parseSheetRows(linkedinRange && linkedinRange.values, (obj, idx) => {
      if (!obj['Nome']) return null;
      const phone = normalizePhone(obj['Telefone']);
      return {
        'Nome Completo': obj['Nome'],
        'Telefone': obj['Telefone'],
        'E-mail Corporativo': obj['E-mail'],
        'Empresa': obj['Endereço/Site'],
        'Origem': obj['Origem'] || 'LinkedIn Odilon',
        'LinkedIn': obj['LinkedIn'],
        'Observação': obj['Observação'],
        'Data/Hora (BRT)': obj['Data Origem'],
        _phone: phone,
        _key: phone || `linkedin-${idx}`,
        _ts: null,
        _hour: null,
        _hour_bucket: null,
        _date: null,
        _source: 'linkedin_odilon',
        _default_stage: 'novo_lead'
      };
    });

    // Dedupe por telefone: prioridade comprador > linkedin > aplicação
    const byKey = new Map();
    const priority = { comprador: 3, linkedin_odilon: 2, aplicacao: 1, manual: 0 };
    const addOrReplace = (l) => {
      const existing = byKey.get(l._key);
      if (!existing || priority[l._source] > priority[existing._source]) {
        byKey.set(l._key, l);
      }
    };
    aplicLeads.forEach(addOrReplace);
    linkedinLeads.forEach(addOrReplace);
    compradoresLeads.forEach(addOrReplace);

    const manualLeads = db.prepare('SELECT * FROM manual_leads ORDER BY created_at DESC').all();
    manualLeads.forEach(m => {
      byKey.set(m.id, {
        'Nome Completo': m.nome,
        'Empresa': m.empresa,
        'Telefone': m.telefone,
        'E-mail Corporativo': m.email,
        'Posição': m.posicao,
        'Cidade': m.cidade,
        'Estado/Região': m.estado,
        _phone: normalizePhone(m.telefone),
        _key: m.id,
        _ts: null,
        _hour: null,
        _hour_bucket: null,
        _date: null,
        _source: 'manual',
        _default_stage: 'novo_lead'
      });
    });

    const leads = [...byKey.values()];

    const stagesMap = {};
    const notesMap = {};
    db.prepare('SELECT lead_key, stage, notes FROM lead_stages').all().forEach(r => {
      stagesMap[r.lead_key] = r.stage;
      notesMap[r.lead_key] = r.notes;
    });
    leads.forEach(l => {
      // Cor na planilha (verde/laranja/vermelho) é ground truth quando presente.
      l._stage = l._color_stage || stagesMap[l._key] || l._default_stage || 'novo_lead';
      l._notes = notesMap[l._key] || '';
    });

    res.json({ ok: true, total: leads.length, leads, stages: STAGES });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/reports', requireAuth, async (req, res) => {
  try {
    const data = await fetchReportsData();
    const rows = data.values || [];
    if (rows.length < 2) return res.json({ ok: true, headers: rows[0] || [], rows: [], totals: {} });
    const headers = rows[0];
    const items = rows.slice(1)
      .filter(r => r && r.length && r[0])
      .map(r => {
        const o = {};
        headers.forEach((h, i) => { o[h] = r[i] || ''; });
        return o;
      });
    const num = (v) => {
      const n = parseInt(String(v || '').replace(/\D/g, ''), 10);
      return Number.isFinite(n) ? n : 0;
    };
    const totals = items.reduce((acc, r) => {
      acc.prospeccao += num(r['Prospecção']);
      acc.resposta += num(r['Resposta']);
      acc.venda += num(r['Venda']);
      return acc;
    }, { prospeccao: 0, resposta: 0, venda: 0 });
    res.json({ ok: true, headers, rows: items, totals });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/stage', requireAuth, (req, res) => {
  const { key, stage } = req.body;
  if (!key || !STAGES.find(s => s.key === stage)) return res.status(400).json({ error: 'invalid' });
  db.prepare(`
    INSERT INTO lead_stages (lead_key, stage, updated_at) VALUES (?, ?, unixepoch())
    ON CONFLICT(lead_key) DO UPDATE SET stage=excluded.stage, updated_at=excluded.updated_at
  `).run(key, stage);
  res.json({ ok: true });
});

app.post('/api/notes', requireAuth, (req, res) => {
  const { key, notes } = req.body;
  if (!key) return res.status(400).json({ error: 'invalid' });
  db.prepare(`
    INSERT INTO lead_stages (lead_key, stage, notes, updated_at) VALUES (?, 'novo_lead', ?, unixepoch())
    ON CONFLICT(lead_key) DO UPDATE SET notes=excluded.notes, updated_at=excluded.updated_at
  `).run(key, notes || '');
  res.json({ ok: true });
});

app.post('/api/manual-lead', requireAuth, (req, res) => {
  const { nome, empresa, telefone, email, posicao, cidade, estado } = req.body;
  if (!nome) return res.status(400).json({ error: 'nome required' });
  const id = 'manual-' + crypto.randomUUID();
  db.prepare(`
    INSERT INTO manual_leads (id, nome, empresa, telefone, email, posicao, cidade, estado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, nome || '', empresa || '', telefone || '', email || '', posicao || '', cidade || '', estado || '');
  res.json({ ok: true, id });
});

app.delete('/api/manual-lead/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM manual_leads WHERE id = ?').run(id);
  db.prepare('DELETE FROM lead_stages WHERE lead_key = ?').run(id);
  res.json({ ok: true });
});

app.get('/', requireAuth, (req, res) => res.send(dashboardPage()));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[jeff-farias-crm] listening on 0.0.0.0:${PORT}`);
});

// ---------- HTML ----------
function loginPage(error) {
  return `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CRM Farias Souza</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg-0:#0a0f1a;--bg-1:#111827;--gold:#c4a24a;--gold-light:#e2c274;--text:#f8fafc;--muted:#94a3b8;--border:rgba(255,255,255,0.08);--card:rgba(255,255,255,0.03)}
body{font-family:'Inter',sans-serif;background:radial-gradient(ellipse at top,#1e293b 0%,#111827 40%,#0a0f1a 90%);min-height:100vh;display:flex;align-items:center;justify-content:center;color:var(--text);padding:20px}
.card{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:48px 40px;width:100%;max-width:400px;text-align:center;backdrop-filter:blur(20px)}
.logo{font-size:11px;font-weight:800;letter-spacing:3px;color:var(--gold);text-transform:uppercase;margin-bottom:12px}
h1{font-size:22px;font-weight:700;margin-bottom:6px}
p.sub{color:var(--muted);font-size:14px;margin-bottom:32px}
input{width:100%;padding:14px 16px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:15px;font-family:inherit;outline:none;margin-bottom:16px;transition:.2s}
input:focus{border-color:var(--gold);background:rgba(196,162,74,0.05)}
button{width:100%;padding:14px;background:linear-gradient(135deg,var(--gold),#a18538);border:none;border-radius:10px;color:#0a0f1a;font-size:15px;font-weight:700;font-family:inherit;cursor:pointer;transition:.2s}
button:hover{opacity:.9;transform:translateY(-1px)}
.error{color:#f87171;font-size:13px;margin-bottom:12px}
</style></head><body>
<div class="card">
  <div class="logo">Farias Souza</div>
  <h1>CRM</h1>
  <p class="sub">Programa de Aceleração O Conselho do Dono — acesso restrito</p>
  ${error}
  <form method="POST" action="/login">
    <input type="password" name="password" placeholder="Senha de acesso" required autofocus>
    <button type="submit">Entrar</button>
  </form>
  <a href="/redefinir-senha" style="display:block;text-align:center;margin-top:16px;font-size:13px;opacity:.75;color:inherit">Esqueci minha senha</a>
</div></body></html>`;
}

const STAGES_JSON = JSON.stringify(STAGES);

function dashboardPage() {
  return `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CRM Farias Souza — Programa de Aceleração O Conselho do Dono</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg-0:#0a0f1a;--bg-1:#111827;--bg-2:#1e293b;
  --gold:#c4a24a;--gold-light:#e2c274;
  --blue:#3b82f6;--amber:#f59e0b;--green:#22c55e;--red:#ef4444;
  --text:#f8fafc;--muted:#94a3b8;--dim:#64748b;
  --border:rgba(255,255,255,0.08);--border-strong:rgba(255,255,255,0.15);
  --card:rgba(255,255,255,0.03);--card-hover:rgba(255,255,255,0.06)
}
body{font-family:'Inter',sans-serif;background:radial-gradient(ellipse at top,var(--bg-2) 0%,var(--bg-1) 40%,var(--bg-0) 90%);min-height:100vh;color:var(--text)}

nav{display:flex;align-items:center;justify-content:space-between;padding:16px 32px;border-bottom:1px solid var(--border);position:sticky;top:0;background:rgba(10,15,26,0.92);backdrop-filter:blur(14px);z-index:100}
.nav-brand{display:flex;align-items:center;gap:12px}
.brand-logo{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,var(--gold),#a18538);display:flex;align-items:center;justify-content:center;font-weight:900;color:#0a0f1a;font-size:15px}
.nav-title{display:flex;flex-direction:column}
.nav-title strong{font-size:14px;font-weight:700}
.nav-title small{font-size:11px;color:var(--muted)}
.nav-actions{display:flex;align-items:center;gap:8px}
.tabs{display:flex;background:var(--card);border:1px solid var(--border);border-radius:10px;overflow:hidden}
.tab{padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:transparent;color:var(--muted);font-family:inherit;transition:.15s}
.tab.active{background:linear-gradient(135deg,var(--gold),#a18538);color:#0a0f1a}
.tab:hover:not(.active){color:var(--text)}
.btn{padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid var(--border);background:var(--card);color:var(--text);font-family:inherit;transition:.2s;display:flex;align-items:center;gap:6px}
.btn:hover{background:var(--card-hover)}
.btn-gold{background:linear-gradient(135deg,var(--gold),#a18538);border:none;color:#0a0f1a}
.btn-ghost{background:transparent}

main{max-width:1600px;margin:0 auto;padding:24px 20px}
.page-header{margin-bottom:20px}
.page-header h1{font-size:24px;font-weight:800}
.page-header p{color:var(--muted);font-size:13px;margin-top:2px}

.view{display:none}
.view.active{display:block}

/* KANBAN */
.kanban{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:8px}
@media(max-width:1100px){.kanban{grid-template-columns:repeat(2,1fr)}}
@media(max-width:600px){.kanban{grid-template-columns:1fr}}
.k-col{background:var(--card);border:1px solid var(--border);border-radius:14px;display:flex;flex-direction:column;min-height:400px;max-height:calc(100vh - 220px)}
.k-col-header{padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-shrink:0}
.k-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.k-col-title{font-size:13px;font-weight:700;flex:1;letter-spacing:.3px}
.k-badge{font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px;background:rgba(255,255,255,0.06);color:var(--muted)}
.k-cards{padding:10px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:8px}
.k-cards.drag-over{background:rgba(196,162,74,0.05);outline:2px dashed rgba(196,162,74,0.4);border-radius:8px}
.k-cards::-webkit-scrollbar{width:5px}
.k-cards::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px}

.k-card{background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:10px;padding:12px 14px;cursor:grab;transition:.2s;user-select:none}
.k-card:hover{background:var(--card-hover);border-color:var(--border-strong);transform:translateY(-1px)}
.k-card:active{cursor:grabbing}
.k-card.dragging{opacity:.4}
.k-card-name{font-size:13px;font-weight:700;color:var(--text);margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.k-card-company{font-size:12px;color:var(--gold-light);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.k-card-row{font-size:11px;color:var(--muted);display:flex;align-items:center;gap:5px;margin-top:2px}
.k-card-row svg{width:11px;height:11px;flex-shrink:0;opacity:.7}
.k-card-tag{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600;background:rgba(59,130,246,0.15);color:#93c5fd;margin-top:6px}

/* DETAIL MODAL */
#modal,#create-modal{position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);z-index:500;display:none;align-items:center;justify-content:center;padding:20px}
#modal.open,#create-modal.open{display:flex}
.modal-card{background:#111827;border:1px solid var(--border-strong);border-radius:16px;max-width:640px;width:100%;max-height:90vh;overflow-y:auto}
.modal-header{padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.modal-header h2{font-size:18px;font-weight:700}
.modal-header p{font-size:13px;color:var(--muted)}
.modal-close{width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.15s}
.modal-close:hover{background:var(--card-hover);color:var(--text)}
.modal-body{padding:24px}
.info-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:20px}
@media(max-width:520px){.info-grid{grid-template-columns:1fr}}
.info-item{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px 14px}
.info-item .label{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px}
.info-item .val{font-size:13px;color:var(--text);word-break:break-word}
.stage-select{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:18px}
.stage-opt{padding:10px 14px;border-radius:10px;border:1px solid var(--border);cursor:pointer;transition:.2s;background:var(--card);font-size:12px;font-weight:600;text-align:center;color:var(--text);display:flex;align-items:center;gap:6px;justify-content:center}
.stage-opt:hover{background:var(--card-hover)}
.stage-opt.active{border-color:var(--gold);background:rgba(196,162,74,0.1)}
.stage-opt-dot{width:9px;height:9px;border-radius:50%}
textarea.notes{width:100%;min-height:80px;padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:inherit;font-size:13px;resize:vertical;outline:none}
textarea.notes:focus{border-color:var(--gold)}
.modal-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:16px}

/* METRICS */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px}
.stat-card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:18px}
.stat-label{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
.stat-value{font-size:32px;font-weight:800}
.stat-value.gold{color:var(--gold-light)}
.stat-value.blue{color:#93c5fd}
.stat-value.amber{color:#fbbf24}
.stat-value.green{color:#86efac}
.stat-value.red{color:#fca5a5}

.m-filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px;align-items:center}
.m-filters select{padding:9px 14px;background:var(--card);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:13px;font-family:inherit;outline:none;cursor:pointer}
.m-filters select:focus{border-color:var(--gold)}
.m-filters label{font-size:12px;color:var(--muted);font-weight:600}

.charts-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin-bottom:24px}
.chart-card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:20px}
.chart-title{font-size:14px;font-weight:700;margin-bottom:4px}
.chart-sub{font-size:11px;color:var(--muted);margin-bottom:16px}

.bar-list{display:flex;flex-direction:column;gap:8px}
.bar-row{display:grid;grid-template-columns:100px 1fr 50px;align-items:center;gap:10px;font-size:12px}
.bar-label{color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar-wrap{background:rgba(255,255,255,0.04);border-radius:4px;height:10px;overflow:hidden;position:relative}
.bar-fill{height:100%;background:linear-gradient(90deg,var(--gold),#e2c274);border-radius:4px;transition:width .6s ease}
.bar-fill.blue{background:linear-gradient(90deg,#3b82f6,#93c5fd)}
.bar-fill.green{background:linear-gradient(90deg,#22c55e,#86efac)}
.bar-value{font-weight:700;text-align:right;color:var(--text)}

.hour-heatmap{display:grid;grid-template-columns:repeat(24,1fr);gap:2px;margin-top:12px}
.hour-cell{aspect-ratio:1;border-radius:3px;background:rgba(255,255,255,0.04);position:relative;display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--muted);font-weight:600}
.hour-cell.h1{background:rgba(196,162,74,0.2)}
.hour-cell.h2{background:rgba(196,162,74,0.4)}
.hour-cell.h3{background:rgba(196,162,74,0.6);color:#0a0f1a}
.hour-cell.h4{background:rgba(196,162,74,0.85);color:#0a0f1a}
.hour-cell.h5{background:rgba(226,194,116,1);color:#0a0f1a}
.hour-legend{display:flex;justify-content:center;gap:10px;margin-top:10px;font-size:10px;color:var(--muted)}
.hour-legend span{display:flex;align-items:center;gap:4px}
.hour-legend b{width:12px;height:12px;border-radius:2px;display:inline-block}

.loading{padding:80px;text-align:center;color:var(--muted)}
.spin{display:inline-block;width:28px;height:28px;border:2px solid var(--border);border-top-color:var(--gold);border-radius:50%;animation:spin .7s linear infinite;margin-bottom:12px}
@keyframes spin{to{transform:rotate(360deg)}}
.empty{padding:40px 20px;text-align:center;color:var(--dim);font-size:12px}

#refresh-overlay{position:fixed;inset:0;background:rgba(10,15,26,0.72);backdrop-filter:blur(6px);z-index:900;display:none;align-items:center;justify-content:center}
#refresh-overlay.open{display:flex}
.refresh-box{background:rgba(17,24,39,0.95);border:1px solid var(--border-strong);border-radius:16px;padding:32px 44px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px;box-shadow:0 10px 40px rgba(0,0,0,0.5)}
.refresh-spin{width:44px;height:44px;border:3px solid var(--border);border-top-color:var(--gold);border-radius:50%;animation:spin .7s linear infinite}
.refresh-text{font-size:14px;font-weight:600;color:var(--gold-light);letter-spacing:.5px}

@media(max-width:768px){
  nav{padding:12px 14px;flex-wrap:wrap;gap:10px}
  .nav-actions{width:100%;overflow-x:auto}
  main{padding:18px 12px}
  .tab{padding:7px 14px;font-size:12px}
  .brand-logo{width:32px;height:32px;font-size:13px}
  .page-header h1{font-size:20px}
}
</style></head><body>

<nav>
  <div class="nav-brand">
    <div class="brand-logo">FS</div>
    <div class="nav-title"><strong>Farias Souza</strong><small>CRM Programa de Aceleração O Conselho do Dono</small></div>
  </div>
  <div class="nav-actions">
    <div class="tabs">
      <button class="tab active" data-view="kanban" onclick="setView('kanban')">Kanban</button>
      <button class="tab" data-view="metrics" onclick="setView('metrics')">Métricas</button>
      <button class="tab" data-view="reports" onclick="setView('reports')">Relatórios</button>
    </div>
    <button class="btn btn-gold" onclick="openCreateModal()">+ Novo Lead</button>
    <button class="btn" onclick="loadData(true)">Atualizar</button>
    <a href="/logout"><button class="btn btn-ghost">Sair</button></a>
  </div>
</nav>

<main>
  <div class="page-header">
    <h1 id="page-title">Painel de Leads</h1>
    <p id="page-sub">Aplicações vindas do formulário — arraste os cards para mover entre etapas</p>
  </div>

  <div id="view-kanban" class="view active">
    <div class="kanban" id="kanban-board">
      <div class="loading" style="grid-column:1/-1"><div class="spin"></div><br>Carregando aplicações...</div>
    </div>
  </div>

  <div id="view-reports" class="view">
    <div class="stats" id="reports-stats"></div>
    <div class="chart-card">
      <div class="chart-title">Relatórios do Social Seller — Captação</div>
      <div class="chart-sub">Prospecção, respostas e vendas por dia (Leonora — atualizado automático pelo grupo)</div>
      <div style="overflow-x:auto;margin-top:14px">
        <table id="reports-table" style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="border-bottom:1px solid var(--border);color:var(--muted);text-align:left">
              <th style="padding:10px 12px;font-weight:700;font-size:11px;letter-spacing:.5px;text-transform:uppercase">Data</th>
              <th style="padding:10px 12px;font-weight:700;font-size:11px;letter-spacing:.5px;text-transform:uppercase">Social Seller</th>
              <th style="padding:10px 12px;font-weight:700;font-size:11px;letter-spacing:.5px;text-transform:uppercase">Prospecção</th>
              <th style="padding:10px 12px;font-weight:700;font-size:11px;letter-spacing:.5px;text-transform:uppercase">Resposta</th>
              <th style="padding:10px 12px;font-weight:700;font-size:11px;letter-spacing:.5px;text-transform:uppercase">Venda</th>
              <th style="padding:10px 12px;font-weight:700;font-size:11px;letter-spacing:.5px;text-transform:uppercase">Observações</th>
            </tr>
          </thead>
          <tbody id="reports-tbody"></tbody>
        </table>
      </div>
    </div>
    <div style="margin-top:14px;color:var(--muted);font-size:12px">
      Fonte: <a href="https://docs.google.com/spreadsheets/d/1WIfmYEwmtDQTfOAN3Ax6EUK_fFArZg0-N7OBNI4z5ME" target="_blank" style="color:var(--gold-light)">planilha do Farias</a> — aba "relatórios do social seller captação"
    </div>
  </div>

  <div id="view-metrics" class="view">
    <div class="m-filters">
      <label>Filtrar por horário do vídeo:</label>
      <select id="filter-utm">
        <option value="">Todos os vídeos</option>
      </select>
      <select id="filter-melhor-horario">
        <option value="">Todos os horários preferidos</option>
      </select>
      <select id="filter-origem">
        <option value="">Todas as origens</option>
      </select>
    </div>

    <div class="stats" id="stats-grid"></div>

    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-title">Distribuição por Hora da Aplicação</div>
        <div class="chart-sub">Horário BRT em que cada aplicação chegou</div>
        <div class="hour-heatmap" id="hour-heatmap"></div>
        <div class="hour-legend">
          <span><b style="background:rgba(255,255,255,0.04)"></b>0</span>
          <span><b style="background:rgba(196,162,74,0.2)"></b>1</span>
          <span><b style="background:rgba(196,162,74,0.4)"></b>2</span>
          <span><b style="background:rgba(196,162,74,0.6)"></b>3</span>
          <span><b style="background:rgba(196,162,74,0.85)"></b>4+</span>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-title">Melhor Horário Preferido pelo Lead</div>
        <div class="chart-sub">Faixa horária que o lead pediu para ser contatado</div>
        <div class="bar-list" id="chart-horario"></div>
      </div>

      <div class="chart-card">
        <div class="chart-title">Faturamento Anual</div>
        <div class="chart-sub">Porte de faturamento dos leads</div>
        <div class="bar-list" id="chart-faturamento"></div>
      </div>

      <div class="chart-card">
        <div class="chart-title">Cargo / Posição</div>
        <div class="chart-sub">Papel do decisor</div>
        <div class="bar-list" id="chart-posicao"></div>
      </div>

      <div class="chart-card">
        <div class="chart-title">Vídeos da Campanha</div>
        <div class="chart-sub">Origem por criativo (UTM Content)</div>
        <div class="bar-list" id="chart-video"></div>
      </div>

      <div class="chart-card">
        <div class="chart-title">Estados</div>
        <div class="chart-sub">Onde os leads estão</div>
        <div class="bar-list" id="chart-estado"></div>
      </div>

      <div class="chart-card">
        <div class="chart-title">Colaboradores</div>
        <div class="chart-sub">Tamanho da empresa</div>
        <div class="bar-list" id="chart-colab"></div>
      </div>

      <div class="chart-card">
        <div class="chart-title">Dispositivos</div>
        <div class="chart-sub">iPhone, Android, Windows...</div>
        <div class="bar-list" id="chart-device"></div>
      </div>
    </div>
  </div>
</main>

<div id="refresh-overlay">
  <div class="refresh-box">
    <div class="refresh-spin"></div>
    <div class="refresh-text">Atualizando...</div>
  </div>
</div>

<div id="modal" onclick="if(event.target===this)closeModal()">
  <div class="modal-card">
    <div class="modal-header">
      <div><h2 id="m-name">Lead</h2><p id="m-sub"></p></div>
      <button class="modal-close" onclick="closeModal()">&#x2715;</button>
    </div>
    <div class="modal-body">
      <div class="info-grid" id="m-info"></div>
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Etapa no funil</div>
      <div class="stage-select" id="m-stages"></div>
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Anotações internas</div>
      <textarea class="notes" id="m-notes" placeholder="Notas sobre este lead..."></textarea>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">Fechar</button>
        <a id="m-wa-btn" href="#" target="_blank"><button class="btn btn-gold">Abrir WhatsApp</button></a>
        <button class="btn" onclick="deleteCurrentLead()" style="color:#f87171" id="m-delete-btn">Deletar</button>
      </div>
    </div>
  </div>
</div>

<div id="create-modal" onclick="if(event.target===this)closeCreateModal()">
  <div class="modal-card">
    <div class="modal-header">
      <div><h2>Novo Lead Manual</h2><p>Preencha os dados abaixo</p></div>
      <button class="modal-close" onclick="closeCreateModal()">&#x2715;</button>
    </div>
    <div class="modal-body">
      <div class="info-grid">
        <input type="text" id="new-nome" placeholder="Nome completo" style="padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:inherit;font-size:13px;outline:none;grid-column:1/2">
        <input type="text" id="new-empresa" placeholder="Empresa" style="padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:inherit;font-size:13px;outline:none;grid-column:2/3">
        <input type="tel" id="new-telefone" placeholder="Telefone" style="padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:inherit;font-size:13px;outline:none;grid-column:1/2">
        <input type="email" id="new-email" placeholder="E-mail" style="padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:inherit;font-size:13px;outline:none;grid-column:2/3">
        <input type="text" id="new-posicao" placeholder="Posição" style="padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:inherit;font-size:13px;outline:none;grid-column:1/2">
        <input type="text" id="new-cidade" placeholder="Cidade" style="padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:inherit;font-size:13px;outline:none;grid-column:2/3">
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeCreateModal()">Cancelar</button>
        <button class="btn btn-gold" onclick="saveNewLead()">Criar Lead</button>
      </div>
    </div>
  </div>
</div>

<script>
const STAGES = ${STAGES_JSON};
const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));
let LEADS = [];
let CURRENT_KEY = null;

function setView(v){
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
  document.getElementById('view-' + v).classList.add('active');
  if (v === 'metrics') renderMetrics();
  if (v === 'reports') loadReports();
  const titles = {
    kanban: ['Painel de Leads', 'Aplicações + Compradores + LinkedIn Odilon — arraste os cards para mover entre etapas'],
    metrics: ['Métricas e Dashboard', 'Análise dos leads captados — filtros interativos para descobrir os melhores horários'],
    reports: ['Relatórios do Social Seller', 'Captação diária da Leonora — atualizado automático quando ela posta no grupo']
  };
  document.getElementById('page-title').textContent = titles[v][0];
  document.getElementById('page-sub').textContent = titles[v][1];
}

async function loadReports(){
  try {
    const r = await fetch('/api/reports');
    const j = await r.json();
    const tbody = document.getElementById('reports-tbody');
    const stats = document.getElementById('reports-stats');
    if (!j.rows || !j.rows.length){
      tbody.innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--dim)">Sem relatórios ainda. Assim que a Leonora postar no grupo, aparece aqui.</td></tr>';
      stats.innerHTML = '';
      return;
    }
    const t = j.totals || {};
    const conv = t.prospeccao ? ((t.venda / t.prospeccao) * 100).toFixed(1) + '%' : '—';
    stats.innerHTML = \`
      <div class="stat-card"><div class="stat-label">Prospecção Total</div><div class="stat-value blue">\${t.prospeccao || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Respostas Total</div><div class="stat-value amber">\${t.resposta || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Vendas Total</div><div class="stat-value green">\${t.venda || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Taxa Conversão</div><div class="stat-value gold">\${conv}</div></div>\`;
    tbody.innerHTML = j.rows.slice().reverse().map(r => \`
      <tr style="border-bottom:1px solid var(--border)">
        <td style="padding:12px">\${escapeHtml(r['Data'] || '')}</td>
        <td style="padding:12px">\${escapeHtml(r['Social Seller'] || '')}</td>
        <td style="padding:12px;color:#93c5fd;font-weight:600">\${escapeHtml(r['Prospecção'] || '0')}</td>
        <td style="padding:12px;color:#fbbf24;font-weight:600">\${escapeHtml(r['Resposta'] || '0')}</td>
        <td style="padding:12px;color:#86efac;font-weight:600">\${escapeHtml(r['Venda'] || '0')}</td>
        <td style="padding:12px;color:var(--muted);font-size:12px">\${escapeHtml(r['Observações'] || '')}</td>
      </tr>\`).join('');
  } catch (e) {
    document.getElementById('reports-tbody').innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:#f87171">Erro: ' + e.message + '</td></tr>';
  }
}

async function loadData(showOverlay){
  const overlay = document.getElementById('refresh-overlay');
  const board = document.getElementById('kanban-board');
  if (showOverlay) overlay.classList.add('open');
  if (!LEADS.length) board.innerHTML = '<div class="loading" style="grid-column:1/-1"><div class="spin"></div><br>Carregando aplicações...</div>';
  const started = Date.now();
  try {
    const r = await fetch('/api/leads');
    if (!r.ok) throw new Error('erro ao carregar');
    const j = await r.json();
    LEADS = j.leads || [];
    renderKanban();
    renderMetrics();
  } catch (e) {
    board.innerHTML = '<div class="loading" style="grid-column:1/-1;color:#f87171">Erro: ' + e.message + '</div>';
  } finally {
    if (showOverlay) {
      const elapsed = Date.now() - started;
      const wait = Math.max(0, 500 - elapsed);
      setTimeout(() => overlay.classList.remove('open'), wait);
    }
  }
}

function renderKanban(){
  const board = document.getElementById('kanban-board');
  board.innerHTML = '';
  STAGES.forEach(s => {
    const col = document.createElement('div');
    col.className = 'k-col';
    const leads = LEADS.filter(l => l._stage === s.key);
    col.innerHTML = \`
      <div class="k-col-header">
        <span class="k-dot" style="background:\${s.color}"></span>
        <span class="k-col-title">\${s.label}</span>
        <span class="k-badge">\${leads.length}</span>
      </div>
      <div class="k-cards" data-stage="\${s.key}"></div>\`;
    const cardsEl = col.querySelector('.k-cards');
    cardsEl.addEventListener('dragover', ev => { ev.preventDefault(); cardsEl.classList.add('drag-over'); });
    cardsEl.addEventListener('dragleave', () => cardsEl.classList.remove('drag-over'));
    cardsEl.addEventListener('drop', ev => {
      ev.preventDefault();
      cardsEl.classList.remove('drag-over');
      const key = ev.dataTransfer.getData('text/key');
      if (key) moveLead(key, s.key);
    });
    if (leads.length === 0) cardsEl.innerHTML = '<div class="empty">Sem leads</div>';
    else leads.forEach(l => cardsEl.appendChild(makeCard(l)));
    board.appendChild(col);
  });
}

function makeCard(l){
  const c = document.createElement('div');
  c.className = 'k-card';
  c.draggable = true;
  c.dataset.key = l._key;
  const nome = l['Nome Completo'] || '(sem nome)';
  const empresa = l['Empresa'] || '';
  const telefone = l['Telefone'] || '';
  const cidade = l['Cidade'] ? (l['Cidade'] + (l['Estado/Região'] ? '/' + l['Estado/Região'] : '')) : '';
  const origem = l['Origem'] || '';
  const dh = l._ts ? \`\${l._ts.date} \${String(l._ts.hour).padStart(2,'0')}:\${String(l._ts.minute).padStart(2,'0')}\` : '';
  c.innerHTML = \`
    <div class="k-card-name">\${escapeHtml(nome)}</div>
    \${empresa ? \`<div class="k-card-company">\${escapeHtml(empresa)}</div>\` : ''}
    <div class="k-card-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>\${escapeHtml(telefone)}</div>
    \${cidade ? \`<div class="k-card-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>\${escapeHtml(cidade)}</div>\` : ''}
    \${dh ? \`<div class="k-card-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>\${dh}</div>\` : ''}
    \${origem ? \`<span class="k-card-tag">\${escapeHtml(origem)}</span>\` : ''}\`;
  c.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/key', l._key); c.classList.add('dragging'); });
  c.addEventListener('dragend', () => c.classList.remove('dragging'));
  c.addEventListener('click', () => openModal(l._key));
  return c;
}

async function moveLead(key, stage){
  const l = LEADS.find(x => x._key === key);
  if (!l || l._stage === stage) return;
  l._stage = stage;
  renderKanban();
  renderMetrics();
  await fetch('/api/stage', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key, stage }) });
}

function openModal(key){
  const l = LEADS.find(x => x._key === key);
  if (!l) return;
  CURRENT_KEY = key;
  document.getElementById('m-name').textContent = l['Nome Completo'] || '(sem nome)';
  document.getElementById('m-sub').textContent = (l['Empresa'] || '') + (l['Posição'] ? ' • ' + l['Posição'] : '');
  const fields = [
    ['Telefone', l['Telefone']],
    ['E-mail', l['E-mail Corporativo']],
    ['CNPJ', l['CNPJ']],
    ['Colaboradores', l['Colaboradores']],
    ['Faturamento', l['Faturamento Anual']],
    ['Preferência contato', l['Preferência de Contato']],
    ['Melhor horário', l['Melhor Horário']],
    ['Cidade/UF', (l['Cidade'] || '') + (l['Estado/Região'] ? '/' + l['Estado/Região'] : '')],
    ['Dispositivo', l['Dispositivo'] + (l['Sistema Operacional'] ? ' (' + l['Sistema Operacional'] + ')' : '')],
    ['Conexão', l['Conexão (WiFi/4G)']],
    ['Origem', l['Origem']],
    ['Vídeo (UTM)', l['UTM Content']],
    ['Data/Hora', l['Data/Hora (BRT)']],
    ['IP', l['IP']],
  ];
  document.getElementById('m-info').innerHTML = fields.filter(([_,v]) => v && String(v).trim())
    .map(([k,v]) => \`<div class="info-item"><div class="label">\${escapeHtml(k)}</div><div class="val">\${escapeHtml(String(v))}</div></div>\`).join('');
  document.getElementById('m-stages').innerHTML = STAGES.map(s => \`
    <div class="stage-opt \${s.key === l._stage ? 'active' : ''}" onclick="setStage('\${s.key}')">
      <span class="stage-opt-dot" style="background:\${s.color}"></span>\${s.label}
    </div>\`).join('');
  document.getElementById('m-notes').value = l._notes || '';
  document.getElementById('m-notes').oninput = debounce(saveNotes, 600);
  const phone = (l['Telefone'] || '').replace(/\\D/g, '');
  document.getElementById('m-wa-btn').href = phone ? 'https://wa.me/' + (phone.startsWith('55') ? phone : '55' + phone) : '#';
  document.getElementById('modal').classList.add('open');
}

function closeModal(){ document.getElementById('modal').classList.remove('open'); CURRENT_KEY = null; }

async function setStage(stage){
  if (!CURRENT_KEY) return;
  const l = LEADS.find(x => x._key === CURRENT_KEY);
  if (!l) return;
  l._stage = stage;
  document.querySelectorAll('#m-stages .stage-opt').forEach(o => o.classList.remove('active'));
  event.currentTarget.classList.add('active');
  await fetch('/api/stage', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: CURRENT_KEY, stage }) });
  renderKanban();
  renderMetrics();
}

async function saveNotes(){
  if (!CURRENT_KEY) return;
  const notes = document.getElementById('m-notes').value;
  const l = LEADS.find(x => x._key === CURRENT_KEY);
  if (l) l._notes = notes;
  await fetch('/api/notes', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: CURRENT_KEY, notes }) });
}

function debounce(fn, ms){ let t; return function(...a){ clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; }

function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ---------- METRICS ----------
function populateFilters(){
  const utms = new Set(), horarios = new Set(), origens = new Set();
  LEADS.forEach(l => {
    if (l['UTM Content']) utms.add(l['UTM Content']);
    if (l['Melhor Horário']) horarios.add(l['Melhor Horário']);
    if (l['Origem']) origens.add(l['Origem']);
  });
  fillSelect('filter-utm', utms);
  fillSelect('filter-melhor-horario', horarios);
  fillSelect('filter-origem', origens);
}

function fillSelect(id, set){
  const el = document.getElementById(id);
  const cur = el.value;
  const opts = [...set].sort();
  el.innerHTML = el.querySelector('option').outerHTML + opts.map(v => \`<option value="\${escapeHtml(v)}">\${escapeHtml(v)}</option>\`).join('');
  el.value = cur;
}

function getFiltered(){
  const utm = document.getElementById('filter-utm').value;
  const hor = document.getElementById('filter-melhor-horario').value;
  const ori = document.getElementById('filter-origem').value;
  return LEADS.filter(l =>
    (!utm || l['UTM Content'] === utm) &&
    (!hor || l['Melhor Horário'] === hor) &&
    (!ori || l['Origem'] === ori)
  );
}

function renderMetrics(){
  if (!LEADS.length) return;
  populateFilters();
  const data = getFiltered();
  const total = data.length;
  const donos = data.filter(l => (l['Posição'] || '').toLowerCase().includes('dono') || (l['Posição'] || '').toLowerCase().includes('ceo')).length;
  const fb = data.filter(l => (l['Origem'] || '').toLowerCase().includes('facebook')).length;
  const ig = data.filter(l => (l['Origem'] || '').toLowerCase().includes('instagram')).length;
  const novos = data.filter(l => l._stage === 'novo_lead').length;
  const negocios = data.filter(l => l._stage === 'em_negociacao').length;
  const vai = data.filter(l => l._stage === 'vai_participar').length;
  const naoVai = data.filter(l => l._stage === 'nao_vai').length;

  document.getElementById('stats-grid').innerHTML = \`
    <div class="stat-card"><div class="stat-label">Total (filtro)</div><div class="stat-value gold">\${total}</div></div>
    <div class="stat-card"><div class="stat-label">Facebook</div><div class="stat-value blue">\${fb}</div></div>
    <div class="stat-card"><div class="stat-label">Instagram</div><div class="stat-value blue">\${ig}</div></div>
    <div class="stat-card"><div class="stat-label">Donos/CEOs</div><div class="stat-value green">\${donos}</div></div>
    <div class="stat-card"><div class="stat-label">Novos Leads</div><div class="stat-value blue">\${novos}</div></div>
    <div class="stat-card"><div class="stat-label">Em Negociação</div><div class="stat-value amber">\${negocios}</div></div>
    <div class="stat-card"><div class="stat-label">Vai ao evento</div><div class="stat-value green">\${vai}</div></div>
    <div class="stat-card"><div class="stat-label">Não vai ao evento</div><div class="stat-value red">\${naoVai}</div></div>\`;

  renderHourHeatmap(data);
  renderBar('chart-horario', groupBy(data, 'Melhor Horário'));
  renderBar('chart-faturamento', groupBy(data, 'Faturamento Anual'));
  renderBar('chart-posicao', groupBy(data, 'Posição'));
  renderBar('chart-video', groupBy(data, 'UTM Content'));
  renderBar('chart-estado', groupBy(data, 'Estado/Região'));
  renderBar('chart-colab', groupBy(data, 'Colaboradores'));
  renderBar('chart-device', groupBy(data, 'Dispositivo'));
}

function groupBy(data, key){
  const m = {};
  data.forEach(l => { const v = (l[key] || '').trim(); if (v) m[v] = (m[v] || 0) + 1; });
  return Object.entries(m).sort((a,b) => b[1] - a[1]).slice(0, 8);
}

function renderBar(id, rows){
  const el = document.getElementById(id);
  if (!rows.length) { el.innerHTML = '<div class="empty">Sem dados</div>'; return; }
  const max = Math.max(...rows.map(r => r[1]));
  el.innerHTML = rows.map(([label, val]) => {
    const pct = (val / max) * 100;
    return \`<div class="bar-row">
      <div class="bar-label" title="\${escapeHtml(label)}">\${escapeHtml(truncate(label, 20))}</div>
      <div class="bar-wrap"><div class="bar-fill" style="width:\${pct}%"></div></div>
      <div class="bar-value">\${val}</div>
    </div>\`;
  }).join('');
}

function truncate(s, n){ s = String(s); return s.length > n ? s.slice(0, n-1) + '…' : s; }

function renderHourHeatmap(data){
  const counts = new Array(24).fill(0);
  data.forEach(l => { if (l._hour != null) counts[l._hour]++; });
  const max = Math.max(...counts);
  const el = document.getElementById('hour-heatmap');
  el.innerHTML = counts.map((c, h) => {
    let cls = '';
    if (c > 0) {
      const ratio = c / Math.max(max, 1);
      if (ratio > 0.8) cls = 'h5';
      else if (ratio > 0.6) cls = 'h4';
      else if (ratio > 0.4) cls = 'h3';
      else if (ratio > 0.2) cls = 'h2';
      else cls = 'h1';
    }
    return \`<div class="hour-cell \${cls}" title="\${h}h — \${c} lead\${c === 1 ? '' : 's'}">\${h}</div>\`;
  }).join('');
}

document.getElementById('filter-utm').addEventListener('change', renderMetrics);
document.getElementById('filter-melhor-horario').addEventListener('change', renderMetrics);
document.getElementById('filter-origem').addEventListener('change', renderMetrics);

function openCreateModal(){
  document.getElementById('new-nome').value = '';
  document.getElementById('new-empresa').value = '';
  document.getElementById('new-telefone').value = '';
  document.getElementById('new-email').value = '';
  document.getElementById('new-posicao').value = '';
  document.getElementById('new-cidade').value = '';
  document.getElementById('create-modal').classList.add('open');
}

function closeCreateModal(){
  document.getElementById('create-modal').classList.remove('open');
}

async function saveNewLead(){
  const nome = document.getElementById('new-nome').value.trim();
  if (!nome) { alert('Nome obrigatório'); return; }
  const empresa = document.getElementById('new-empresa').value.trim();
  const telefone = document.getElementById('new-telefone').value.trim();
  const email = document.getElementById('new-email').value.trim();
  const posicao = document.getElementById('new-posicao').value.trim();
  const cidade = document.getElementById('new-cidade').value.trim();
  const estado = ''; // pode adicionar estado depois se quiser

  try {
    const r = await fetch('/api/manual-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, empresa, telefone, email, posicao, cidade, estado })
    });
    if (!r.ok) throw new Error('erro ao criar');
    closeCreateModal();
    await loadData(true);
  } catch (e) {
    alert('Erro ao criar lead: ' + e.message);
  }
}

async function deleteCurrentLead(){
  if (!CURRENT_KEY || !CURRENT_KEY.startsWith('manual-')) return alert('Não pode deletar leads da planilha');
  if (!confirm('Deletar este lead?')) return;
  try {
    const r = await fetch('/api/manual-lead/' + CURRENT_KEY, { method: 'DELETE' });
    if (!r.ok) throw new Error('erro ao deletar');
    closeModal();
    await loadData(true);
  } catch (e) {
    alert('Erro ao deletar: ' + e.message);
  }
}

loadData();
setInterval(() => loadData(false), 60000);
</script>
</body></html>`;
}
