const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

// Minimal .env loader (sem dependencia extra)
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
} catch {}

const PORT = process.env.PORT || 3033;
const DB_PATH = path.join(__dirname, 'data', 'mapadocloser.db');
const PUBLIC_DIR = path.join(__dirname, 'public');
const LEGACY_HTML = path.join(__dirname, 'public', 'legacy-dossie.html');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-7';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  event_date TEXT,
  theme TEXT,
  sheet_url TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'processando',
  csv_raw TEXT,
  lead_count INTEGER DEFAULT 0,
  result_html TEXT,
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_analyses_event ON analyses(event_id, created_at DESC);
`);

// Migrations idempotentes
function addColumnIfMissing(table, col, decl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
  }
}
addColumnIfMissing('events', 'linkedin_urls', 'TEXT');
addColumnIfMissing('analyses', 'progress_current', 'INTEGER DEFAULT 0');
addColumnIfMissing('analyses', 'progress_total', 'INTEGER DEFAULT 0');
addColumnIfMissing('analyses', 'progress_message', 'TEXT');
addColumnIfMissing('analyses', 'started_at', 'INTEGER');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.get('/health', (req, res) => res.json({ ok: true, service: 'jeff-mapadocloser', ts: Date.now() }));

// Root: se tem mapa pronto do evento ativo mais recente, serve ele. Senao, menu de eventos.
app.get('/', (req, res) => {
  const latest = db.prepare(`
    SELECT a.result_html FROM analyses a
    JOIN events e ON e.id = a.event_id
    WHERE a.status='pronto' AND e.status='ativo'
    ORDER BY a.updated_at DESC LIMIT 1
  `).get();
  if (latest?.result_html) return res.type('html').send(latest.result_html);
  // Se não tem mapa pronto, mostra o menu de eventos
  const events = db.prepare(`SELECT id, name, event_date, theme, status, sheet_url,
     datetime(created_at,'unixepoch','-3 hours') AS created_brt
     FROM events ORDER BY created_at DESC`).all();
  res.type('html').send(renderAdmin(events));
});

// ------- Admin (cadastro de eventos) -------

app.get('/admin', (req, res) => {
  const events = db.prepare(`SELECT id, name, event_date, theme, status, sheet_url,
     datetime(created_at,'unixepoch','-3 hours') AS created_brt
     FROM events ORDER BY created_at DESC`).all();
  res.type('html').send(renderAdmin(events));
});

app.post('/admin/events', (req, res) => {
  const { name, event_date, theme, sheet_url, linkedin_urls } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).send('nome obrigatorio');
  const info = db.prepare(
    `INSERT INTO events (name, event_date, theme, sheet_url, linkedin_urls, status) VALUES (?,?,?,?,?,?)`
  ).run(String(name).trim(), event_date || null, theme || null, sheet_url || null, linkedin_urls || null, 'ativo');
  res.redirect(`/admin/events/${info.lastInsertRowid}`);
});

app.get('/admin/events/:id', (req, res) => {
  const ev = db.prepare(`SELECT *, datetime(created_at,'unixepoch','-3 hours') AS created_brt FROM events WHERE id=?`).get(req.params.id);
  if (!ev) return res.status(404).send('evento nao encontrado');
  res.type('html').send(renderEvent(ev));
});

app.post('/admin/events/:id/status', (req, res) => {
  const status = String(req.body?.status || '').trim();
  if (!['ativo','finalizado'].includes(status)) return res.status(400).send('status invalido');
  db.prepare(`UPDATE events SET status=?, updated_at=strftime('%s','now') WHERE id=?`).run(status, req.params.id);
  res.redirect(`/admin/events/${req.params.id}`);
});

app.post('/admin/events/:id/sheet', (req, res) => {
  const sheet_url = String(req.body?.sheet_url || '').trim() || null;
  db.prepare(`UPDATE events SET sheet_url=?, updated_at=strftime('%s','now') WHERE id=?`).run(sheet_url, req.params.id);
  res.redirect(`/admin/events/${req.params.id}`);
});

app.post('/admin/events/:id/linkedins', (req, res) => {
  const raw = String(req.body?.linkedin_urls || '').trim();
  const cleaned = raw
    ? raw.split(/[\s,;]+/).map(u => u.trim()).filter(u => /linkedin\.com\/in\//i.test(u)).join('\n')
    : null;
  db.prepare(`UPDATE events SET linkedin_urls=?, updated_at=strftime('%s','now') WHERE id=?`).run(cleaned, req.params.id);
  res.redirect(`/admin/events/${req.params.id}`);
});

// ------- Analise -------

app.post('/admin/events/:id/analyze', (req, res) => {
  const ev = db.prepare(`SELECT * FROM events WHERE id=?`).get(req.params.id);
  if (!ev) return res.status(404).send('evento nao encontrado');
  if (!ev.sheet_url && !ev.linkedin_urls) return res.status(400).send('cadastre a URL da planilha OU pelo menos um LinkedIn antes de iniciar analise');
  const info = db.prepare(`INSERT INTO analyses (event_id, status, started_at, progress_message) VALUES (?, 'processando', strftime('%s','now'), 'iniciando')`).run(ev.id);
  const analysisId = info.lastInsertRowid;
  runAnalysis(ev, analysisId).catch(err => {
    console.error('[analyze] falha', err);
    db.prepare(`UPDATE analyses SET status='erro', error=?, updated_at=strftime('%s','now') WHERE id=?`)
      .run(String(err?.message || err).slice(0, 2000), analysisId);
  });
  res.redirect(`/admin/events/${ev.id}/mapa`);
});

app.get('/admin/events/:id/mapa/status.json', (req, res) => {
  const a = db.prepare(`SELECT id, status, progress_current, progress_total, progress_message, started_at, error, updated_at FROM analyses WHERE event_id=? ORDER BY created_at DESC LIMIT 1`).get(req.params.id);
  if (!a) return res.status(404).json({ ok:false });
  const now = Math.floor(Date.now()/1000);
  const elapsed = a.started_at ? Math.max(1, now - a.started_at) : 0;
  const cur = a.progress_current || 0;
  const tot = a.progress_total || 0;
  const eta = (cur > 0 && tot > cur) ? Math.round(elapsed / cur * (tot - cur)) : null;
  res.json({
    ok: true,
    status: a.status,
    current: cur,
    total: tot,
    message: a.progress_message || '',
    elapsed_s: elapsed,
    eta_s: eta,
    error: a.error || null
  });
});

app.get('/admin/events/:id/mapa', (req, res) => {
  const ev = db.prepare(`SELECT * FROM events WHERE id=?`).get(req.params.id);
  if (!ev) return res.status(404).send('evento nao encontrado');
  const a = db.prepare(`SELECT *, datetime(created_at,'unixepoch','-3 hours') AS created_brt,
    datetime(updated_at,'unixepoch','-3 hours') AS updated_brt
    FROM analyses WHERE event_id=? ORDER BY created_at DESC LIMIT 1`).get(ev.id);
  if (!a) return res.status(404).type('html').send(layout('Mapa · sem analise', `<div class="wrap"><header><div><div class="crumb"><a href="/admin/events/${ev.id}">&larr; evento</a></div><h1>Sem analise ainda</h1></div></header><div class="card">Volta pro evento e clica em "Iniciar Analise".</div></div>`));
  if (a.status === 'processando') {
    return res.type('html').send(renderProgress(ev, a));
  }
  if (a.status === 'erro') {
    return res.type('html').send(layout('Mapa · erro', `<div class="wrap"><header><div><div class="crumb"><a href="/admin/events/${ev.id}">&larr; evento</a></div><h1>Erro na analise</h1></div></header><div class="card"><pre style="white-space:pre-wrap;color:var(--danger)">${escapeHtml(a.error || 'erro sem detalhe')}</pre><form method="post" action="/admin/events/${ev.id}/analyze" style="margin-top:16px"><button type="submit">Tentar de novo</button></form></div></div>`));
  }
  return res.type('html').send(a.result_html || '<h1>mapa vazio</h1>');
});

function updateProgress(analysisId, current, total, message) {
  db.prepare(`UPDATE analyses SET progress_current=?, progress_total=?, progress_message=?, updated_at=strftime('%s','now') WHERE id=?`)
    .run(current, total, message, analysisId);
}

async function runAnalysis(ev, analysisId) {
  const linkedinList = (ev.linkedin_urls || '').split(/\s+/).map(s => s.trim()).filter(Boolean);
  const hasSheet = !!ev.sheet_url;
  const hasLinkedins = linkedinList.length > 0;

  // Etapas: 1 (planilha, se houver) + N (linkedins, se houver) + 1 (montar mapa)
  const totalSteps = (hasSheet ? 1 : 0) + linkedinList.length + 1;
  let step = 0;
  updateProgress(analysisId, step, totalSteps, hasSheet ? 'puxando planilha do Google Sheets' : 'preparando pesquisas');

  let sheetLeads = [];
  if (hasSheet) {
    const csv = await fetchSheetCsv(ev.sheet_url);
    const rows = parseCsv(csv);
    const headers = rows[0] || [];
    sheetLeads = rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [String(h).trim() || `col${i+1}`, String(r[i] ?? '').trim()])));
    db.prepare(`UPDATE analyses SET csv_raw=?, updated_at=strftime('%s','now') WHERE id=?`).run(csv.slice(0, 200000), analysisId);
    step++;
    updateProgress(analysisId, step, totalSteps, `planilha lida (${sheetLeads.length} leads)`);
  }

  const linkedinLeads = [];
  for (const url of linkedinList) {
    updateProgress(analysisId, step, totalSteps, `pesquisando LinkedIn: ${shortUrl(url)}`);
    const profile = await fetchLinkedinProfile(url).catch(err => ({ linkedin: url, erro: String(err.message || err).slice(0, 200) }));
    linkedinLeads.push(profile);
    step++;
    updateProgress(analysisId, step, totalSteps, `${step - (hasSheet ? 1 : 0)}/${linkedinList.length} LinkedIns processados`);
  }

  const allLeads = [...sheetLeads, ...linkedinLeads];
  const leadCount = allLeads.length;
  db.prepare(`UPDATE analyses SET lead_count=?, updated_at=strftime('%s','now') WHERE id=?`).run(leadCount, analysisId);
  if (!leadCount) throw new Error('nenhum lead pra analisar (planilha vazia e sem LinkedIns validos)');

  updateProgress(analysisId, step, totalSteps, 'gerando o mapa do closer com Claude');
  const html = await generateMapaHtml(ev, allLeads);
  step++;
  updateProgress(analysisId, step, totalSteps, 'pronto');

  db.prepare(`UPDATE analyses SET status='pronto', result_html=?, updated_at=strftime('%s','now') WHERE id=?`)
    .run(html, analysisId);
}

function shortUrl(u) {
  const m = String(u).match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? m[1] : String(u).slice(0, 60);
}

async function fetchLinkedinProfile(url) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY nao configurada');
  const prompt = `Pesquise no LinkedIn o perfil desta URL: ${url}

Use web_search pra buscar informacoes publicas. Devolva SOMENTE um objeto JSON valido (sem markdown, sem comentario), com as chaves:
{
  "linkedin": "${url}",
  "nome": "",
  "cargo_atual": "",
  "empresa": "",
  "localizacao": "",
  "resumo": "",
  "experiencias_chave": "",
  "possiveis_dores": ""
}

Se nao conseguir achar, preencha com "" e coloque "erro":"perfil nao encontrado" no JSON.`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Claude HTTP ${r.status}: ${txt.slice(0, 300)}`);
  }
  const data = await r.json();
  const text = (data?.content || []).map(c => c.text || '').join('').trim();
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < 0) return { linkedin: url, erro: 'resposta sem JSON' };
  try {
    return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch {
    return { linkedin: url, erro: 'JSON invalido', raw: text.slice(0, 500) };
  }
}

function getGoogleToken() {
  try {
    return execFileSync('/opt/jeff-worker/scripts/google.sh',
      ['token', 'jefersonhenrike1@gmail.com'],
      { encoding: 'utf8', timeout: 15000 }).trim();
  } catch (e) {
    throw new Error('nao consegui obter token Google via google.sh: ' + (e.message || e));
  }
}

function rowsToCsv(rows) {
  return rows.map(row => (row || []).map(c => {
    const s = String(c ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

async function fetchSheetCsv(sheetUrl) {
  const m = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) throw new Error('URL da planilha invalida (esperado docs.google.com/spreadsheets/d/...)');
  const id = m[1];
  const gidMatch = sheetUrl.match(/[?#&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : null;

  const token = getGoogleToken();
  const auth = { Authorization: `Bearer ${token}` };

  const metaR = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(sheetId,title)`, { headers: auth });
  if (!metaR.ok) {
    const body = await metaR.text().catch(() => '');
    throw new Error(`nao consegui abrir a planilha via Google API (HTTP ${metaR.status}). ${body.slice(0,200)}`);
  }
  const meta = await metaR.json();
  const sheets = meta.sheets || [];
  if (!sheets.length) throw new Error('planilha sem abas');
  let sheet = null;
  if (gid) sheet = sheets.find(s => String(s.properties?.sheetId) === String(gid));
  if (!sheet) sheet = sheets[0];
  const title = sheet.properties.title;

  const range = encodeURIComponent(title);
  const valR = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}`, { headers: auth });
  if (!valR.ok) {
    const body = await valR.text().catch(() => '');
    throw new Error(`nao consegui ler os dados da aba "${title}" (HTTP ${valR.status}). ${body.slice(0,200)}`);
  }
  const val = await valR.json();
  const rows = val.values || [];
  return rowsToCsv(rows);
}

function parseCsv(text) {
  const rows = [];
  let cur = [''], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i+1] === '"') { cur[cur.length-1] += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur[cur.length-1] += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') cur.push('');
      else if (c === '\n') { rows.push(cur); cur = ['']; }
      else if (c === '\r') { /* skip */ }
      else cur[cur.length-1] += c;
    }
  }
  if (cur.length > 1 || cur[0] !== '') rows.push(cur);
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}

async function generateMapaHtml(ev, leads) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY nao configurada no ambiente do app');
  const compactLeads = JSON.stringify(leads).slice(0, 120000);
  const prompt = `Voce e um estrategista de vendas premium. Recebe leads inscritos no evento "${ev.name}" (tema: ${ev.theme || 'nao informado'}, data: ${ev.event_date || 'nao informada'}).

Gera um MAPA DO CLOSER: um dossie estrategico em HTML unico que ajuda o closer a fechar cada lead na sala.

Estrutura minima:
1) Cockpit no topo: nome do evento, quantidade de leads, tema, data.
2) Bloco "Radar da Sala": 3-5 padroes que voce identifica no conjunto (perfil dominante, dores comuns, oportunidades transversais).
3) Bloco "Fichas de Fechamento": para cada lead, ficha compacta com:
   - nome + cargo/empresa (se houver)
   - hipotese de dor
   - gancho de abertura (frase pronta)
   - argumento central de fechamento
   - CTA sugerido
4) Bloco "Plano de Batalha": prioridades (quem abordar primeiro, quem deixar por ultimo, avisos).

Regras de saida:
- Devolva APENAS HTML completo (<!doctype html> ... </html>), sem markdown, sem comentario extra.
- Estetica: fundo escuro (#0A0A0B), tipografia Oswald + Instrument Sans (importa do Google Fonts), destaque dourado #C9A227, texto claro #F2EDE2. Layout de dossie premium, cards com borda dourada sutil, sem emoji.
- Portugues do Brasil, tom direto e afiado, sem enrolar.
- Se algum campo do lead estiver vazio, inferir com prudencia e marcar entre parenteses "(hipotese)".

DADOS DOS LEADS (JSON):
${compactLeads}`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Claude API HTTP ${r.status}: ${txt.slice(0, 500)}`);
  }
  const data = await r.json();
  const text = (data?.content || []).map(c => c.text || '').join('').trim();
  if (!text) throw new Error('Claude devolveu vazio');
  const htmlStart = text.indexOf('<!doctype');
  const htmlStart2 = text.indexOf('<!DOCTYPE');
  const start = Math.max(htmlStart, htmlStart2);
  return start >= 0 ? text.slice(start) : text;
}

// ------- Render helpers -------

const CSS = `
:root{color-scheme:dark;--bg:#0a0a0f;--card:#12121a;--border:#22222e;--text:#e8e8f0;--muted:#8a8aa0;--accent:#d4af37;--danger:#c85252;--ok:#4ea373}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;background:var(--bg);color:var(--text);line-height:1.5}
.wrap{max-width:1080px;margin:0 auto;padding:48px 24px}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:40px;border-bottom:1px solid var(--border);padding-bottom:24px}
h1{margin:0;font-size:28px;font-weight:600;letter-spacing:-.02em}
h1 span{color:var(--accent)}
.crumb{color:var(--muted);font-size:13px;text-transform:uppercase;letter-spacing:.15em}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:28px;margin-bottom:24px}
.card h2{margin:0 0 20px;font-size:18px;font-weight:600;letter-spacing:.02em}
label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin-bottom:8px}
input,select,textarea{width:100%;background:#1a1a24;border:1px solid var(--border);border-radius:8px;padding:12px 14px;color:var(--text);font-size:15px;font-family:inherit;margin-bottom:16px}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent)}
.row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
button,.btn{background:var(--accent);color:#0a0a0f;border:none;border-radius:8px;padding:12px 22px;font-size:14px;font-weight:600;letter-spacing:.03em;cursor:pointer;text-transform:uppercase}
.btn-ghost{background:transparent;color:var(--muted);border:1px solid var(--border)}
button:hover{opacity:.9}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:14px 12px;border-bottom:1px solid var(--border);font-size:14px}
th{color:var(--muted);font-weight:500;text-transform:uppercase;letter-spacing:.1em;font-size:11px}
.pill{display:inline-block;padding:4px 10px;border-radius:20px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:600}
.pill.ativo{background:rgba(78,163,115,.15);color:var(--ok)}
.pill.finalizado{background:rgba(138,138,160,.15);color:var(--muted)}
.empty{text-align:center;color:var(--muted);padding:40px 20px;font-style:italic}
.tabs{display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:24px}
.tabs a{padding:12px 20px;color:var(--muted);font-size:14px;font-weight:500;border-bottom:2px solid transparent}
.tabs a.on{color:var(--accent);border-color:var(--accent)}
form.inline{display:flex;gap:12px;align-items:flex-end}
form.inline input{margin-bottom:0}
.hint{font-size:12px;color:var(--muted);margin:-8px 0 16px}
`;

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function layout(title, body) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}

function renderProgress(ev, a) {
  const eventId = ev.id;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mapa · processando</title><style>${CSS}
.bar-wrap{background:#1a1a24;border:1px solid var(--border);border-radius:999px;height:18px;overflow:hidden;margin:20px 0 12px}
.bar{height:100%;background:linear-gradient(90deg,var(--accent),#e8c65a);width:0%;transition:width .6s ease}
.stat{display:flex;justify-content:space-between;color:var(--muted);font-size:13px;margin-bottom:8px}
.msg{color:var(--text);font-size:15px;margin-top:16px;min-height:22px}
.spin{display:inline-block;width:12px;height:12px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:sp 1s linear infinite;margin-right:8px;vertical-align:middle}
@keyframes sp{to{transform:rotate(360deg)}}
.done-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:20px}
.done-actions .btn{display:inline-block}
</style></head><body><div class="wrap">
<header><div><div class="crumb"><a href="/admin/events/${eventId}">&larr; evento</a></div><h1>Atualizando <span>informações</span></h1></div></header>
<div class="card" id="card">
  <div class="stat"><span id="msg"><span class="spin"></span>iniciando</span><span id="pct">0%</span></div>
  <div class="bar-wrap"><div class="bar" id="bar"></div></div>
  <div class="stat"><span id="counter">0 de 0 etapas</span><span id="eta">estimando tempo restante</span></div>
</div>
<script>
const evId = ${eventId};
function fmtSec(s){
  if (s == null) return 'estimando tempo restante';
  if (s < 60) return 'faltam ~' + s + 's';
  const m = Math.round(s/60);
  return 'faltam ~' + m + ' min';
}
async function tick(){
  try {
    const r = await fetch('/admin/events/' + evId + '/mapa/status.json', {cache:'no-store'});
    const j = await r.json();
    if (!j.ok) return;
    const pct = j.total > 0 ? Math.round(j.current/j.total*100) : 0;
    document.getElementById('bar').style.width = pct + '%';
    document.getElementById('pct').textContent = pct + '%';
    document.getElementById('counter').textContent = (j.current||0) + ' de ' + (j.total||0) + ' etapas';
    document.getElementById('eta').textContent = fmtSec(j.eta_s);
    document.getElementById('msg').innerHTML = '<span class="spin"></span>' + (j.message || 'processando');
    if (j.status === 'pronto') {
      document.getElementById('card').innerHTML = '<h2 style="margin:0 0 8px;color:var(--ok)">Atualização concluída</h2><p style="color:var(--muted);margin:0 0 12px">Os dados estão prontos na página principal.</p><div class="done-actions"><a class="btn" href="/">ir para a página principal</a><a class="btn btn-ghost" href="/admin/events/' + evId + '/mapa">ver este mapa</a></div>';
      return;
    }
    if (j.status === 'erro') {
      document.getElementById('card').innerHTML = '<h2 style="margin:0 0 8px;color:var(--danger)">Erro na análise</h2><pre style="white-space:pre-wrap;color:var(--danger);font-size:13px">' + (j.error || 'erro sem detalhe') + '</pre><div class="done-actions"><a class="btn" href="/admin/events/' + evId + '">voltar</a></div>';
      return;
    }
    setTimeout(tick, 2500);
  } catch (e) {
    setTimeout(tick, 4000);
  }
}
tick();
</script>
</div></body></html>`;
}

function renderAdmin(events) {
  const ativos = events.filter(e => e.status === 'ativo');
  const finalizados = events.filter(e => e.status === 'finalizado');
  const list = (arr) => arr.length ? `<table><thead><tr><th>Evento</th><th>Data</th><th>Tema</th><th>Status</th><th>Planilha</th><th></th></tr></thead><tbody>${arr.map(e => `<tr>
    <td><strong>${escapeHtml(e.name)}</strong><br><span style="color:var(--muted);font-size:12px">criado ${escapeHtml(e.created_brt)}</span></td>
    <td>${escapeHtml(e.event_date || '-')}</td>
    <td>${escapeHtml(e.theme || '-')}</td>
    <td><span class="pill ${e.status}">${e.status}</span></td>
    <td>${e.sheet_url ? '<span style="color:var(--ok)">conectada</span>' : '<span style="color:var(--muted)">pendente</span>'}</td>
    <td><a href="/admin/events/${e.id}">abrir &rarr;</a></td>
  </tr>`).join('')}</tbody></table>` : `<div class="empty">nenhum evento aqui ainda</div>`;

  return layout('Mapa do Closer · Admin', `<div class="wrap">
    <header>
      <div>
        <div class="crumb">Mapa do <span style="color:var(--accent)">Closer</span></div>
        <h1>Painel de Eventos</h1>
      </div>
      <a class="btn btn-ghost" href="/">ver dossie modelo</a>
    </header>

    <div class="card">
      <h2>Novo evento</h2>
      <form method="post" action="/admin/events">
        <div class="row">
          <div><label>Nome do evento</label><input name="name" required placeholder="Board Summit 2026"></div>
          <div><label>Data</label><input name="event_date" type="date"></div>
        </div>
        <label>Tema</label>
        <input name="theme" placeholder="Ex: Escala e sucessao para donos de negocio">
        <label>URL da planilha Google Sheets (opcional)</label>
        <input name="sheet_url" type="url" placeholder="https://docs.google.com/spreadsheets/...">
        <div class="hint">Compartilha como "qualquer pessoa com o link pode ver". Pode deixar em branco e usar so LinkedIn.</div>
        <label>LinkedIns dos participantes (opcional)</label>
        <textarea name="linkedin_urls" rows="4" placeholder="https://linkedin.com/in/fulano&#10;https://linkedin.com/in/ciclana&#10;..."></textarea>
        <div class="hint">Um link por linha. Funciona sozinho ou junto com a planilha. Vou pesquisar cada perfil pra montar o mapa.</div>
        <button type="submit">Criar evento</button>
      </form>
    </div>

    <div class="card">
      <h2>Ativos (${ativos.length})</h2>
      ${list(ativos)}
    </div>

    <div class="card">
      <h2>Finalizados (${finalizados.length})</h2>
      ${list(finalizados)}
    </div>
  </div>`);
}

function renderEvent(ev) {
  return layout(`${ev.name} · Mapa do Closer`, `<div class="wrap">
    <header>
      <div>
        <div class="crumb"><a href="/admin">&larr; painel</a></div>
        <h1>${escapeHtml(ev.name)}</h1>
      </div>
      <span class="pill ${ev.status}">${ev.status}</span>
    </header>

    <div class="card">
      <h2>Dados do evento</h2>
      <div class="row">
        <div><label>Data</label><div>${escapeHtml(ev.event_date || '-')}</div></div>
        <div><label>Criado em</label><div>${escapeHtml(ev.created_brt)}</div></div>
      </div>
      <label>Tema</label>
      <div>${escapeHtml(ev.theme || '-')}</div>
    </div>

    <div class="card">
      <h2>Planilha de leads</h2>
      <form method="post" action="/admin/events/${ev.id}/sheet">
        <label>URL Google Sheets</label>
        <input name="sheet_url" type="url" value="${escapeHtml(ev.sheet_url || '')}" placeholder="https://docs.google.com/spreadsheets/...">
        <div class="hint">Compartilha como "qualquer pessoa com o link pode ver".</div>
        <button type="submit">Salvar planilha</button>
      </form>
    </div>

    <div class="card">
      <h2>LinkedIns dos participantes</h2>
      <form method="post" action="/admin/events/${ev.id}/linkedins">
        <label>Um link por linha</label>
        <textarea name="linkedin_urls" rows="6" placeholder="https://linkedin.com/in/fulano&#10;https://linkedin.com/in/ciclana">${escapeHtml(ev.linkedin_urls || '')}</textarea>
        <div class="hint">Cola quantos quiser. Filtro automatico so aceita URLs linkedin.com/in/... Pra cada perfil eu pesquiso na web e trago os dados atualizados.</div>
        <button type="submit">Salvar LinkedIns</button>
      </form>
    </div>

    <div class="card">
      <h2>Analise</h2>
      <p style="color:var(--muted);margin-bottom:16px">Puxo a planilha, pesquiso cada LinkedIn e monto o mapa do closer com Claude. Funciona com planilha, com LinkedIns, ou com os dois juntos.</p>
      <form method="post" action="/admin/events/${ev.id}/analyze" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <button type="submit" ${(ev.sheet_url || ev.linkedin_urls) ? '' : 'disabled title="cadastre planilha OU pelo menos um LinkedIn primeiro"'}>Atualizar dados</button>
        <a class="btn btn-ghost" href="/admin/events/${ev.id}/mapa">Ver ultimo mapa</a>
        <a class="btn btn-ghost" href="/">Pagina principal</a>
      </form>
    </div>

    <div class="card">
      <h2>Status</h2>
      <form class="inline" method="post" action="/admin/events/${ev.id}/status">
        <select name="status">
          <option value="ativo" ${ev.status==='ativo'?'selected':''}>ativo</option>
          <option value="finalizado" ${ev.status==='finalizado'?'selected':''}>finalizado</option>
        </select>
        <button type="submit">Atualizar</button>
      </form>
    </div>
  </div>`);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`jeff-mapadocloser em http://0.0.0.0:${PORT}`);
});
