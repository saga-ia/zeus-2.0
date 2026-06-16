const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3021;
const DB_PATH = path.join(__dirname, 'data', 'cigc.db');
const SECRET_FILE = path.join(__dirname, 'data', '.session-secret');
const WORKER_DB_PATH = '/opt/jeff-worker/data/worker.db';

if (!fs.existsSync(SECRET_FILE)) {
  fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
}
const SESSION_SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS speakers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    instagram TEXT,
    talk_topic TEXT,
    photo_url TEXT,
    confirmed INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    area TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    phone TEXT,
    instagram TEXT,
    photo_url TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ig_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    handle TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    fetched_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ig_search_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    query_text TEXT,
    status TEXT DEFAULT 'pending',
    result_json TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    used_at TEXT,
    used_by_user_id INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS clinic_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payload_json TEXT NOT NULL,
    source TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS venue_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_url TEXT NOT NULL,
    caption TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS venue_measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_url TEXT,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    notes TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

try {
  const cols = db.prepare("PRAGMA table_info(users)").all();
  if (!cols.some(c => c.name === 'phone')) {
    db.exec("ALTER TABLE users ADD COLUMN phone TEXT");
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL");
} catch (e) { console.warn('[migrate phone]', e.message); }

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}
function verifyPassword(password, stored) {
  try {
    const [saltHex, hashHex] = stored.split(':');
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(actual, expected);
  } catch (_) {
    return false;
  }
}

function seedAdminIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count === 0) {
    const tempPassword = crypto.randomBytes(6).toString('hex');
    db.prepare('INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)')
      .run('jefersonhenrike1@gmail.com', 'Jeferson Henrike', 'admin', hashPassword(tempPassword));
    fs.writeFileSync(path.join(__dirname, 'data', 'INITIAL_ADMIN_PASSWORD.txt'), `email: jefersonhenrike1@gmail.com\nsenha: ${tempPassword}\n`);
    console.log(`[seed] admin criado | senha em data/INITIAL_ADMIN_PASSWORD.txt`);
  }
  const seedTeam = (area, name, role, phone, instagram) => {
    const exists = db.prepare('SELECT id FROM team_members WHERE area=? AND name=?').get(area, name);
    if (!exists) db.prepare('INSERT INTO team_members (area, name, role, phone, instagram) VALUES (?, ?, ?, ?, ?)').run(area, name, role, phone, instagram);
  };
  seedTeam('organizador', 'Glauco', 'Organizador / Decisor estratégico', '5562982363940', null);
  seedTeam('marketing', 'Vitor', 'Responsável Marketing', null, null);
  seedTeam('comercial', 'Gustavo', 'Gerente Comercial', null, null);
}
seedAdminIfEmpty();

function seedInvites() {
  const seedOne = (name, role) => {
    const exists = db.prepare('SELECT id FROM invites WHERE name=? AND role=?').get(name, role);
    if (!exists) {
      const token = crypto.randomBytes(24).toString('hex');
      db.prepare('INSERT INTO invites (token, name, role) VALUES (?, ?, ?)').run(token, name, role);
    }
  };
  seedOne('Glauco', 'admin');
  seedOne('Vitor', 'marketing');
  seedOne('Gustavo', 'comercial');
}
seedInvites();

function normalizePhone(s) {
  return String(s || '').replace(/\D+/g, '');
}

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch (_) { return null; }
}

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  const cookies = (req.headers.cookie || '').split(';').map(s => s.trim()).filter(Boolean);
  const sessionCookie = cookies.find(c => c.startsWith('cigc_session='));
  if (sessionCookie) {
    const token = decodeURIComponent(sessionCookie.split('=').slice(1).join('='));
    const session = verifySession(token);
    if (session) {
      const user = db.prepare('SELECT id, email, name, role FROM users WHERE id=?').get(session.uid);
      if (user) req.user = user;
    }
  }
  next();
});

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'auth_required' });
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'auth_required' });
    if (req.user.role !== 'admin' && !roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

app.post('/api/login', (req, res) => {
  const { email, identifier, password } = req.body || {};
  const ident = String(identifier || email || '').trim();
  if (!ident || !password) return res.status(400).json({ error: 'missing_credentials' });
  let user;
  if (ident.includes('@')) {
    user = db.prepare('SELECT * FROM users WHERE email=?').get(ident.toLowerCase());
  } else {
    user = db.prepare('SELECT * FROM users WHERE phone=?').get(normalizePhone(ident));
  }
  if (!user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'invalid_credentials' });
  const token = signSession({ uid: user.id, role: user.role, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
  res.setHeader('Set-Cookie', `cigc_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${60*60*24*30}; SameSite=Lax`);
  res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

app.get('/api/cadastro/:token', (req, res) => {
  const inv = db.prepare('SELECT name, role, used_at FROM invites WHERE token=?').get(req.params.token);
  if (!inv) return res.status(404).json({ error: 'invite_not_found' });
  if (inv.used_at) return res.status(410).json({ error: 'invite_used' });
  res.json({ name: inv.name, role: inv.role });
});

app.post('/api/cadastro', (req, res) => {
  const { token, name, identifier_type, identifier, password } = req.body || {};
  if (!token || !name || !identifier_type || !identifier || !password) return res.status(400).json({ error: 'missing_fields' });
  if (String(password).length < 6) return res.status(400).json({ error: 'password_too_short' });
  const inv = db.prepare('SELECT * FROM invites WHERE token=?').get(token);
  if (!inv) return res.status(404).json({ error: 'invite_not_found' });
  if (inv.used_at) return res.status(410).json({ error: 'invite_used' });

  let email = null, phone = null;
  if (identifier_type === 'email') {
    email = String(identifier).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'invalid_email' });
  } else if (identifier_type === 'phone') {
    phone = normalizePhone(identifier);
    if (phone.length < 10) return res.status(400).json({ error: 'invalid_phone' });
  } else {
    return res.status(400).json({ error: 'invalid_identifier_type' });
  }

  const storedEmail = email || `phone-${phone}@cigc.local`;
  if (email && db.prepare('SELECT id FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'email_taken' });
  if (phone && db.prepare('SELECT id FROM users WHERE phone=?').get(phone)) return res.status(409).json({ error: 'phone_taken' });
  if (!email && db.prepare('SELECT id FROM users WHERE email=?').get(storedEmail)) return res.status(409).json({ error: 'phone_taken' });

  const result = db.prepare('INSERT INTO users (email, phone, name, role, password_hash) VALUES (?, ?, ?, ?, ?)')
    .run(storedEmail, phone, String(name).trim(), inv.role, hashPassword(password));
  db.prepare('UPDATE invites SET used_at=datetime(\'now\'), used_by_user_id=? WHERE id=?').run(result.lastInsertRowid, inv.id);

  const sessionToken = signSession({ uid: result.lastInsertRowid, role: inv.role, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
  res.setHeader('Set-Cookie', `cigc_session=${encodeURIComponent(sessionToken)}; HttpOnly; Path=/; Max-Age=${60*60*24*30}; SameSite=Lax`);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', `cigc_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => res.json({ user: req.user }));

app.get('/api/team/:area', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id, area, name, role, phone, instagram, photo_url, notes FROM team_members WHERE area=? ORDER BY id ASC').all(req.params.area);
  res.json({ members: rows });
});
app.post('/api/team', requireAuth, (req, res) => {
  const { area, name, role, phone, instagram, photo_url, notes } = req.body || {};
  if (!area || !name) return res.status(400).json({ error: 'area_and_name_required' });
  if (req.user.role !== 'admin') {
    const allowed = (area === 'marketing' && req.user.role === 'marketing') || (area === 'comercial' && req.user.role === 'comercial');
    if (!allowed) return res.status(403).json({ error: 'forbidden' });
  }
  const result = db.prepare('INSERT INTO team_members (area, name, role, phone, instagram, photo_url, notes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(area, name, role || null, phone || null, instagram || null, photo_url || null, notes || null);
  res.json({ ok: true, id: result.lastInsertRowid });
});
app.delete('/api/team/:id', requireAuth, (req, res) => {
  const member = db.prepare('SELECT * FROM team_members WHERE id=?').get(req.params.id);
  if (!member) return res.status(404).json({ error: 'not_found' });
  if (req.user.role !== 'admin') {
    const allowed = (member.area === 'marketing' && req.user.role === 'marketing') || (member.area === 'comercial' && req.user.role === 'comercial');
    if (!allowed) return res.status(403).json({ error: 'forbidden' });
  }
  db.prepare('DELETE FROM team_members WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/speakers', requireAuth, (_req, res) => {
  const rows = db.prepare('SELECT id, name, instagram, talk_topic, photo_url, confirmed FROM speakers ORDER BY name ASC').all();
  res.json({ speakers: rows });
});
app.post('/api/speakers', requireAuth, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'marketing') return res.status(403).json({ error: 'forbidden' });
  const { name, instagram, talk_topic, photo_url, confirmed } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name_required' });
  const result = db.prepare('INSERT INTO speakers (name, instagram, talk_topic, photo_url, confirmed) VALUES (?, ?, ?, ?, ?)').run(name, instagram || null, talk_topic || null, photo_url || null, confirmed === false ? 0 : 1);
  res.json({ ok: true, id: result.lastInsertRowid });
});
app.delete('/api/speakers/:id', requireAuth, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'marketing') return res.status(403).json({ error: 'forbidden' });
  db.prepare('DELETE FROM speakers WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

function getApifyToken() {
  try {
    const w = new Database(WORKER_DB_PATH, { readonly: true });
    const row = w.prepare("SELECT value FROM app_settings WHERE key='apify_api_token' OR key='apify_api_key' LIMIT 1").get();
    w.close();
    return row && row.value;
  } catch (e) { return null; }
}
function getCigcHandle() {
  try {
    const w = new Database(WORKER_DB_PATH, { readonly: true });
    const row = w.prepare("SELECT value FROM app_settings WHERE key='cigc_instagram_handle' LIMIT 1").get();
    w.close();
    return (row && row.value) || 'congressoclinicas';
  } catch (e) { return 'congressoclinicas'; }
}

app.get('/api/instagram/snapshot', requireAuth, (_req, res) => {
  const handle = getCigcHandle();
  const row = db.prepare('SELECT id, handle, payload_json, fetched_at FROM ig_snapshots WHERE handle=? ORDER BY id DESC LIMIT 1').get(handle);
  if (!row) return res.json({ snapshot: null, handle });
  let payload = null;
  try { payload = JSON.parse(row.payload_json); } catch (_) {}
  res.json({ snapshot: { id: row.id, handle: row.handle, fetched_at: row.fetched_at, data: payload }, handle });
});

async function runApify(actorId, input, token) {
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`apify_${resp.status}: ${text.slice(0, 300)}`);
  }
  return resp.json();
}

app.post('/api/instagram/refresh', requireAuth, async (_req, res) => {
  const token = getApifyToken();
  if (!token) return res.status(500).json({ error: 'apify_token_missing' });
  const handle = getCigcHandle();
  try {
    const data = await runApify('apify~instagram-profile-scraper', {
      usernames: [handle]
    }, token);
    const profile = Array.isArray(data) ? data[0] : data;
    const summary = profile ? {
      username: profile.username || handle,
      fullName: profile.fullName,
      biography: profile.biography,
      followersCount: profile.followersCount,
      followsCount: profile.followsCount,
      postsCount: profile.postsCount,
      profilePicUrl: profile.profilePicUrlHD || profile.profilePicUrl,
      externalUrl: profile.externalUrl,
      verified: profile.verified,
      isBusinessAccount: profile.isBusinessAccount,
      latestPosts: (profile.latestPosts || []).slice(0, 12).map(p => ({
        id: p.id, shortCode: p.shortCode, type: p.type, caption: p.caption, url: p.url,
        displayUrl: p.displayUrl, likesCount: p.likesCount, commentsCount: p.commentsCount, timestamp: p.timestamp
      }))
    } : null;
    db.prepare('INSERT INTO ig_snapshots (handle, payload_json) VALUES (?, ?)').run(handle, JSON.stringify(summary || {}));
    res.json({ ok: true, snapshot: summary, handle });
  } catch (e) {
    res.status(500).json({ error: 'apify_failed', detail: String(e.message || e) });
  }
});

// ---------- Clinic distribution (TEA) ----------
function getAnthropicKey() {
  try {
    const w = new Database(WORKER_DB_PATH, { readonly: true });
    const row = w.prepare("SELECT value FROM app_settings WHERE key='anthropic_api_key' LIMIT 1").get();
    w.close();
    if (row && row.value) return row.value;
  } catch (_) {}
  try {
    const env = fs.readFileSync('/opt/jeff-worker/.env', 'utf8');
    const m = env.match(/^ANTHROPIC_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch (_) {}
  return null;
}

const CLINIC_SEED = {
  summary: 'Centralização forte no Sudeste (SP/MG/RJ no topo). Sul (PR/RS) com alta densidade. NE (BA/PE) em crescimento.',
  regions: [
    { region: 'Sudeste', label: 'Maior Concentração', states: [
      { uf: 'SP', name: 'São Paulo', highlight: 'Maior malha de clínicas privadas e centros de referência (Centro TEA em Santana, 1º da América Latina).' },
      { uf: 'MG', name: 'Minas Gerais', highlight: 'Foco em Belo Horizonte e Triângulo Mineiro (Uberlândia, Uberaba).' },
      { uf: 'RJ', name: 'Rio de Janeiro', highlight: 'Concentração massiva na capital (Botafogo, Piedade, Sulacap) + Região Serrana e Lagos.' }
    ]},
    { region: 'Sul', label: 'Alta Densidade', states: [
      { uf: 'PR', name: 'Paraná', highlight: '~350 pontos de atenção especializados. Estado mais estruturado em rede multidisciplinar pública e privada.' },
      { uf: 'RS', name: 'Rio Grande do Sul', highlight: 'Foco em Porto Alegre e região metropolitana.' }
    ]},
    { region: 'Nordeste', label: 'Polos de Crescimento', states: [
      { uf: 'BA', name: 'Bahia', highlight: '4ª maior população diagnosticada do Brasil (~145 mil pessoas). Demanda alta e represada.' },
      { uf: 'PE', name: 'Pernambuco', highlight: 'Concentração em Recife e Petrolina.' }
    ]}
  ],
  cities_table: [
    { uf: 'SP', cities: 'São Paulo (Capital), Guarulhos, Campinas, São Bernardo do Campo, Santo André, Jundiaí, Sorocaba' },
    { uf: 'MG', cities: 'Belo Horizonte, Contagem, Uberlândia, Juiz de Fora' },
    { uf: 'RJ', cities: 'Rio de Janeiro, Niterói, Duque de Caxias, São Gonçalo' },
    { uf: 'PR', cities: 'Curitiba, Maringá, Londrina, Ponta Grossa' },
    { uf: 'BA', cities: 'Salvador, Feira de Santana, Vitória da Conquista' },
    { uf: 'GO', cities: 'Goiânia, Itumbiara' },
    { uf: 'DF', cities: 'Brasília (Asa Norte, Taguatinga)' }
  ],
  diagnostics: {
    saturation: 'São Paulo capital e Curitiba são extremamente saturados. CPC tende a ser mais alto.',
    blue_ocean: 'Cidades de médio porte como Feira de Santana (BA), Uberlândia (MG) e Baixada Santista (SP) têm alta população diagnosticada e densidade de clínicas menor por habitante.',
    targeting: 'Maiores gargalos no atendimento multidisciplinar: Psicologia ABA, Fonoaudiologia, Terapia Ocupacional. AMA e APAE são hubs de indicação.'
  },
  lead_sources: [
    { name: 'CNES (Cadastro Nacional de Estabelecimentos de Saúde)', note: "Filtre pelo serviço 'Atenção em Reabilitação'." },
    { name: 'Guia AMA (Associação de Amigos do Autista)', note: 'Lista associações por estado, hub de indicação de clínicas privadas.' },
    { name: 'Diretório SES-SP', note: 'Centros conveniados que atendem TEA no estado de maior demanda.' }
  ]
};

function seedClinicSnapshotIfEmpty() {
  const c = db.prepare('SELECT COUNT(*) AS n FROM clinic_snapshots').get().n;
  if (c === 0) {
    db.prepare('INSERT INTO clinic_snapshots (payload_json, source) VALUES (?, ?)').run(JSON.stringify(CLINIC_SEED), 'jeff_initial_brief');
  }
}
seedClinicSnapshotIfEmpty();

app.get('/api/clinics/distribution', requireAuth, (_req, res) => {
  const row = db.prepare('SELECT id, payload_json, source, created_at FROM clinic_snapshots ORDER BY id DESC LIMIT 1').get();
  if (!row) return res.json({ snapshot: null });
  let data = null;
  try { data = JSON.parse(row.payload_json); } catch (_) {}
  res.json({ snapshot: { id: row.id, source: row.source, created_at: row.created_at, data } });
});

const REFRESH_PROMPT = `Você é um analista de mercado especializado em clínicas de autismo (TEA) no Brasil. Faça uma pesquisa atualizada na web (use o tool web_search) sobre a distribuição geográfica de clínicas privadas e centros multidisciplinares para autismo no Brasil. Foque em:
- ranking de regiões e estados com maior número de clínicas
- cidades com maior volume (hotspots para anúncios)
- saturação vs. blue ocean (oportunidades menos exploradas)
- canais de pesquisa de leads (diretórios, associações, fontes oficiais)

Após pesquisar, RESPONDA APENAS COM JSON VÁLIDO no exato formato abaixo, sem texto antes ou depois:

{
  "summary": "uma frase de diagnóstico geral",
  "regions": [
    { "region": "Sudeste|Sul|Nordeste|Centro-Oeste|Norte", "label": "rótulo curto", "states": [
      { "uf": "SP", "name": "São Paulo", "highlight": "uma linha sobre o estado" }
    ]}
  ],
  "cities_table": [
    { "uf": "SP", "cities": "lista de cidades-chave separadas por vírgula" }
  ],
  "diagnostics": {
    "saturation": "frase sobre praças saturadas",
    "blue_ocean": "frase sobre oportunidades menos exploradas",
    "targeting": "frase sobre tipo de profissional/abordagem que mais converte"
  },
  "lead_sources": [
    { "name": "Nome do diretório", "note": "como usar/filtrar" }
  ]
}

Inclua no mínimo 4 regiões, 8 estados e 6 cidades-chave. Responda apenas com o JSON, sem markdown, sem comentários.`;

app.post('/api/clinics/refresh', requireAuth, async (_req, res) => {
  const key = getAnthropicKey();
  if (!key) return res.status(500).json({ error: 'anthropic_key_missing' });
  try {
    const body = {
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: [{ role: 'user', content: REFRESH_PROMPT }]
    };
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(500).json({ error: 'anthropic_failed', detail: text.slice(0, 400) });
    }
    const data = await resp.json();
    const blocks = Array.isArray(data.content) ? data.content : [];
    let textOut = '';
    for (const b of blocks) {
      if (b.type === 'text' && typeof b.text === 'string') textOut += b.text;
    }
    const jsonMatch = textOut.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'no_json_in_response', raw: textOut.slice(0, 400) });
    let parsed;
    try { parsed = JSON.parse(jsonMatch[0]); }
    catch (e) { return res.status(500).json({ error: 'invalid_json', detail: e.message, raw: jsonMatch[0].slice(0, 400) }); }
    db.prepare('INSERT INTO clinic_snapshots (payload_json, source) VALUES (?, ?)').run(JSON.stringify(parsed), 'anthropic_web_search');
    res.json({ ok: true, snapshot: { data: parsed, created_at: new Date().toISOString(), source: 'anthropic_web_search' } });
  } catch (e) {
    res.status(500).json({ error: 'refresh_failed', detail: String(e.message || e) });
  }
});

app.post('/api/instagram/search', requireAuth, async (req, res) => {
  const token = getApifyToken();
  if (!token) return res.status(500).json({ error: 'apify_token_missing' });
  const handle = getCigcHandle();
  const queryText = (req.body && req.body.query) ? String(req.body.query).slice(0, 500) : '';
  if (!queryText) return res.status(400).json({ error: 'query_required' });
  const insert = db.prepare('INSERT INTO ig_search_queries (user_id, query_text, status) VALUES (?, ?, ?)').run(req.user.id, queryText, 'running');
  try {
    const data = await runApify('apify~instagram-scraper', {
      directUrls: [`https://www.instagram.com/${handle}/`],
      resultsType: 'posts',
      resultsLimit: 30,
      searchType: 'hashtag',
      searchLimit: 1
    }, token);
    const lower = queryText.toLowerCase();
    const matches = (Array.isArray(data) ? data : []).filter(p => {
      const blob = `${p.caption || ''} ${p.alt || ''}`.toLowerCase();
      return blob.includes(lower);
    }).slice(0, 20);
    const result = { query: queryText, total_scanned: Array.isArray(data) ? data.length : 0, matches };
    db.prepare('UPDATE ig_search_queries SET status=?, result_json=?, completed_at=datetime(\'now\') WHERE id=?').run('done', JSON.stringify(result), insert.lastInsertRowid);
    res.json({ ok: true, ...result });
  } catch (e) {
    db.prepare('UPDATE ig_search_queries SET status=?, result_json=?, completed_at=datetime(\'now\') WHERE id=?').run('error', JSON.stringify({ error: String(e.message || e) }), insert.lastInsertRowid);
    res.status(500).json({ error: 'apify_failed', detail: String(e.message || e) });
  }
});

// ---------- Venue (Teatro APCD) ----------
const VENUE_INFO = {
  name: 'Teatro APCD',
  address: 'Rua Voluntários da Pátria, 547 · Santana, São Paulo · 02011-000 · 04, 05 e 06 set 2026',
  capacity: '770 lugares (726 plateia + 44 mezanino) + 160 VIP',
  lat: -23.515257,
  lng: -46.627223,
  maps_url: 'https://share.google/2IRvX1m7O1SnaDJI6',
  notes: 'Local oficial do CIGC 2026. Visita técnica realizada pela equipe de estrutura.'
};

function canEditVenue(req) {
  return req.user && (req.user.role === 'admin' || req.user.role === 'estrutura');
}

app.get('/api/venue', requireAuth, (_req, res) => {
  const photos = db.prepare('SELECT id, photo_url, caption, sort_order FROM venue_photos ORDER BY sort_order ASC, id ASC').all();
  const measurements = db.prepare('SELECT id, photo_url, label, value, notes, sort_order FROM venue_measurements ORDER BY sort_order ASC, id ASC').all();
  res.json({ info: VENUE_INFO, photos, measurements });
});

app.post('/api/venue/photos', requireAuth, (req, res) => {
  if (!canEditVenue(req)) return res.status(403).json({ error: 'forbidden' });
  const { photo_url, caption, sort_order } = req.body || {};
  if (!photo_url) return res.status(400).json({ error: 'photo_url_required' });
  const r = db.prepare('INSERT INTO venue_photos (photo_url, caption, sort_order) VALUES (?, ?, ?)').run(photo_url, caption || null, Number(sort_order) || 0);
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.delete('/api/venue/photos/:id', requireAuth, (req, res) => {
  if (!canEditVenue(req)) return res.status(403).json({ error: 'forbidden' });
  db.prepare('DELETE FROM venue_photos WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/venue/measurements', requireAuth, (req, res) => {
  if (!canEditVenue(req)) return res.status(403).json({ error: 'forbidden' });
  const { photo_url, label, value, notes, sort_order } = req.body || {};
  if (!label || !value) return res.status(400).json({ error: 'label_and_value_required' });
  const r = db.prepare('INSERT INTO venue_measurements (photo_url, label, value, notes, sort_order) VALUES (?, ?, ?, ?, ?)').run(photo_url || null, label, value, notes || null, Number(sort_order) || 0);
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.delete('/api/venue/measurements/:id', requireAuth, (req, res) => {
  if (!canEditVenue(req)) return res.status(403).json({ error: 'forbidden' });
  db.prepare('DELETE FROM venue_measurements WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/cadastro', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cadastro.html'));
});

app.get('/cadastro/:token', (req, res) => {
  res.redirect(302, '/cadastro?t=' + encodeURIComponent(req.params.token));
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[cigc-clientarea] listening on ${PORT}`);
});
