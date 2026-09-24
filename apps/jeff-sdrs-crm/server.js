const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const { detectTags } = require('./src/tag-detector');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3051;
const PASSWORD = process.env.CRM_PASSWORD || 'sdrs2026';
// Senha redefinida pelo "Esqueci minha senha" fica em data/auth-override.json e vale no lugar da CRM_PASSWORD.
const pwdReset = require('/opt/jeff-apps/jeff-shared/password-reset');
const pwdOverride = pwdReset.overrideStore(require('path').join(__dirname, 'data'));
function checkPassword(pwd) {
  const viaOverride = pwdOverride.check(pwd || '');
  return viaOverride !== null ? viaOverride : pwd === PASSWORD;
}
const DB_PATH = path.join(__dirname, 'kanban.db');
const WORKER_URL = process.env.WORKER_URL || 'http://127.0.0.1:3002';
const WORKER_TOKEN = process.env.WORKER_TOKEN || '';
const JEFF_PHONE = process.env.JEFF_PHONE || '5511910075450';

async function sendJeff(text) {
  if (!WORKER_TOKEN) { console.error('[jeff-sdrs-crm] WORKER_TOKEN nao configurado'); return false; }
  try {
    const r = await fetch(`${WORKER_URL}/messages/private`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${WORKER_TOKEN}` },
      body: JSON.stringify({ to: JEFF_PHONE, body: text }),
    });
    return r.ok;
  } catch (e) {
    console.error('[jeff-sdrs-crm] sendJeff falhou:', e.message);
    return false;
  }
}

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
  CREATE TABLE IF NOT EXISTS global_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    color TEXT DEFAULT '#3b82f6',
    category TEXT DEFAULT 'geral',
    usage_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS lead_tags (
    lead_id TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    added_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (lead_id, tag_id),
    FOREIGN KEY(tag_id) REFERENCES global_tags(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS lead_conversas_stream (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id TEXT NOT NULL,
    whatsapp_message_id TEXT UNIQUE,
    from_phone TEXT,
    body TEXT,
    tags_detected TEXT,
    ia_confidence REAL DEFAULT 0,
    ts INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS integration_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    system_a TEXT NOT NULL,
    system_b TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    secret TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_lead_conversas_lead_id ON lead_conversas_stream(lead_id, ts DESC);
  CREATE INDEX IF NOT EXISTS idx_lead_tags_tag_id ON lead_tags(tag_id);
  CREATE INDEX IF NOT EXISTS idx_global_tags_name ON global_tags(name);
  CREATE INDEX IF NOT EXISTS idx_integration_tokens_token ON integration_tokens(token);
`);

function ensureColumn(table, name, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
  }
}
ensureColumn('manual_leads', 'synced_from_sdrs', 'INTEGER DEFAULT 0');
ensureColumn('manual_leads', 'campaign_id', 'TEXT');
ensureColumn('manual_leads', 'synced_at', 'INTEGER');
ensureColumn('manual_leads', 'dispatch_slot', 'INTEGER');
ensureColumn('lead_stages', 'synced_from_sdrs', 'INTEGER DEFAULT 0');
ensureColumn('lead_stages', 'sent_at', 'INTEGER');
ensureColumn('lead_stages', 'delivered_at', 'INTEGER');
ensureColumn('lead_stages', 'replied_at', 'INTEGER');

// system tags — auto-inserted on stage moves
function ensureSystemTag(name, color) {
  const existing = db.prepare('SELECT id FROM global_tags WHERE name = ?').get(name);
  if (existing) {
    db.prepare('UPDATE global_tags SET is_system = 1 WHERE id = ?').run(existing.id);
    return existing.id;
  }
  return db.prepare(`INSERT INTO global_tags (name, color, category, instruction, is_system, created_at)
                     VALUES (?, ?, 'sistema', 'Tag do sistema — aplicada automaticamente pelo fluxo de disparo', 1, unixepoch())`)
           .run(name, color).lastInsertRowid;
}
ensureSystemTag('disparado', '#94a3b8');
ensureSystemTag('conversa_iniciada', '#3b82f6');
ensureSystemTag('novo_lead', '#8b5cf6');

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
  { key: 'disparado',              label: 'Disparado',                      color: '#94a3b8' },
  { key: 'conversa_iniciada',      label: 'Conversa Iniciada',             color: '#3b82f6' },
  { key: 'novo_lead',              label: 'Novo Lead',                     color: '#8b5cf6' },
  { key: 'em_negociacao',          label: 'Em Negociação',                 color: '#f59e0b' },
  { key: 'chamar_novamente',       label: 'Chamar Novamente',              color: '#f97316' },
  { key: 'iniciou_compra',         label: 'Iniciou Compra',                color: '#06b6d4' },
  { key: 'finalizou_compra',       label: 'Finalizou Compra',              color: '#22c55e' },
  { key: 'perdido',                label: 'Não Vai / Perdido',             color: '#ef4444' },
];

// Rank pra auto-move nunca voltar pra estágio anterior (ACK 2 chegando após resposta, etc)
const STAGE_RANK = {
  disparado: 0,
  conversa_iniciada: 1,
  novo_lead: 2,
  em_negociacao: 3,
  chamar_novamente: 3,
  iniciou_compra: 4,
  finalizou_compra: 5,
  perdido: 99,
};

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new SQLiteStore(),
  secret: 'sdrs-crm-' + crypto.randomBytes(8).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 12 * 60 * 60 * 1000, secure: false, sameSite: 'lax' }
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.auth) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'unauthorized' });
  res.redirect('/login');
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
  appName: 'CRM SDRs',
  setPassword: (newPass) => { pwdOverride.write(newPass); return true; }
});

app.get('/login', (req, res) => {
  let msg = '';
  if (req.query.error) msg = '<p class="error">Senha incorreta</p>';
  if (req.query.sent) msg = '<p class="sent">senha enviada no seu WhatsApp</p>';
  res.send(loginPage(msg));
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

app.get('/sso', (req, res) => {
  const secret = process.env.SDRS_JWT_SECRET;
  if (!secret) return res.status(500).send('SDRS_JWT_SECRET nao configurado');
  const token = req.query.token;
  if (!token) return res.status(400).send('missing_token');
  try {
    const payload = jwt.verify(String(token), secret);
    if (!payload || payload.purpose !== 'crm-sso') return res.status(401).send('invalid_token');
    req.session.auth = true;
    let target = String(req.query.target || '/');
    if (!target.startsWith('/') || target.startsWith('//')) target = '/';
    return res.redirect(target);
  } catch (e) {
    return res.status(401).send('invalid_or_expired_token');
  }
});

// Antes mandava a senha atual em texto puro no WhatsApp; agora vai pro fluxo de redefinição com código.
app.post('/forgot', (req, res) => res.redirect('/redefinir-senha'));

app.get('/voltar-sistema', requireAuth, (req, res) => {
  const secret = process.env.SDRS_JWT_SECRET;
  const uid = parseInt(process.env.SDRS_SSO_USER_ID || '1', 10);
  const sdrsUrl = process.env.SDRS_URL || 'https://sdrs.jefersonhenrike.com';
  if (!secret) return res.status(500).send('SDRS_JWT_SECRET nao configurado');
  const token = jwt.sign({ uid, purpose: 'sso' }, secret, { expiresIn: '2m' });
  res.redirect(`${sdrsUrl}/api/auth/sso?token=${encodeURIComponent(token)}`);
});

app.get('/api/leads', requireAuth, async (req, res) => {
  try {
    const leads = [];

    const manualLeads = db.prepare('SELECT * FROM manual_leads ORDER BY created_at DESC').all();
    manualLeads.forEach(m => {
      leads.push({
        'Nome Completo': m.nome,
        'Empresa': m.empresa,
        'Telefone': m.telefone,
        'E-mail Corporativo': m.email,
        'Posição': m.posicao,
        'Cidade': m.cidade,
        'Estado/Região': m.estado,
        '_phone': normalizePhone(m.telefone),
        '_key': m.id,
        '_ts': null,
        '_hour': null,
        '_hour_bucket': null,
        '_date': null,
        '_source': 'manual',
        '_dispatch_slot': m.dispatch_slot != null ? m.dispatch_slot : null,
      });
    });

    const stagesMap = {};
    const notesMap = {};
    const timelineMap = {};
    db.prepare('SELECT lead_key, stage, notes, sent_at, delivered_at, replied_at FROM lead_stages').all().forEach(r => {
      stagesMap[r.lead_key] = r.stage;
      notesMap[r.lead_key] = r.notes;
      timelineMap[r.lead_key] = { sent_at: r.sent_at, delivered_at: r.delivered_at, replied_at: r.replied_at };
    });
    leads.forEach(l => {
      l._stage = stagesMap[l._key] || 'novo_lead';
      l._notes = notesMap[l._key] || '';
      l._timeline = timelineMap[l._key] || {};
    });

    res.json({ ok: true, total: leads.length, leads, stages: STAGES });
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

// ---------- SYNC ENDPOINTS ----------
app.post('/api/leads/sync-from-sdrs', async (req, res) => {
  const { phone, name, campaign_id, timestamp } = req.body;

  if (!phone) return res.status(400).json({ error: 'phone_required' });

  const normalized = normalizePhone(phone);
  const existing = db.prepare('SELECT id FROM manual_leads WHERE telefone = ?').get(phone);

  if (existing) {
    db.prepare(`
      UPDATE manual_leads
      SET synced_from_sdrs=1, campaign_id=?, synced_at=?
      WHERE id=?
    `).run(campaign_id || null, Math.floor(Date.now() / 1000), existing.id);
    return res.json({ ok: true, id: existing.id, created: false });
  }

  const id = 'sync-' + crypto.randomUUID();
  db.prepare(`
    INSERT INTO manual_leads (id, nome, telefone, synced_from_sdrs, campaign_id, synced_at, created_at)
    VALUES (?, ?, ?, 1, ?, ?, ?)
  `).run(id, name || 'Lead', phone, campaign_id || null, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000));

  db.prepare(`
    INSERT INTO lead_stages (lead_key, stage, updated_at)
    VALUES (?, 'disparado', ?)
  `).run(id, Math.floor(Date.now() / 1000));

  res.json({ ok: true, id, created: true });
});

app.get('/api/tags/list', requireAuth, (req, res) => {
  const tags = db.prepare('SELECT id, name, color, category, usage_count, instruction, is_system FROM global_tags ORDER BY is_system DESC, usage_count DESC').all();
  res.json({ ok: true, tags });
});

function slugifyTagName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

app.post('/api/tags/create', requireAuth, async (req, res) => {
  const { name, color, category, instruction } = req.body;
  if (!name) return res.status(400).json({ error: 'name_required' });
  const slug = slugifyTagName(name);
  if (!slug) return res.status(400).json({ error: 'name_invalid' });

  try {
    const id = db.prepare(`
      INSERT INTO global_tags (name, color, category, instruction, is_system, created_at)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(slug, color || '#3b82f6', category || 'geral', String(instruction || '').slice(0, 1000), Math.floor(Date.now() / 1000)).lastInsertRowid;

    await sendJeff(`Nova tag criada: *${slug}* (categoria: ${category || 'geral'})`);
    res.json({ ok: true, id, name: slug });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'tag_already_exists' });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/tags/update/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'id_invalid' });
  const existing = db.prepare('SELECT id, is_system FROM global_tags WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'tag_not_found' });
  if (existing.is_system) return res.status(400).json({ error: 'tag_is_system' });

  const { color, category, instruction } = req.body;
  db.prepare(`
    UPDATE global_tags SET color = COALESCE(?, color), category = COALESCE(?, category), instruction = COALESCE(?, instruction)
    WHERE id = ?
  `).run(color || null, category || null, instruction != null ? String(instruction).slice(0, 1000) : null, id);
  res.json({ ok: true });
});

app.delete('/api/tags/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'id_invalid' });
  const existing = db.prepare('SELECT id, is_system, name FROM global_tags WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'tag_not_found' });
  if (existing.is_system) return res.status(400).json({ error: 'tag_is_system' });
  db.prepare('DELETE FROM global_tags WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.get('/tags', requireAuth, (req, res) => res.send(tagsPage()));

app.post('/api/leads/:id/detect-tags', async (req, res) => {
  const { message_text, whatsapp_message_id } = req.body;
  const { id } = req.params;

  if (!message_text) return res.status(400).json({ error: 'message_text_required' });

  const detection = await detectTags(message_text, db);

  db.prepare(`
    INSERT OR IGNORE INTO lead_conversas_stream (lead_id, whatsapp_message_id, body, tags_detected, ia_confidence, ts)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    whatsapp_message_id || null,
    message_text,
    JSON.stringify(detection.tags || []),
    detection.confidence || 0,
    Math.floor(Date.now() / 1000)
  );

  if (detection.tags && detection.tags.length > 0) {
    const globalTags = db.prepare('SELECT id FROM global_tags WHERE name = ?');
    for (const tagName of detection.tags) {
      const tag = globalTags.get(tagName);
      if (tag) {
        db.prepare(`
          INSERT OR IGNORE INTO lead_tags (lead_id, tag_id, added_at)
          VALUES (?, ?, ?)
        `).run(id, tag.id, Math.floor(Date.now() / 1000));

        db.prepare('UPDATE global_tags SET usage_count = usage_count + 1 WHERE id = ?').run(tag.id);
      }
      // Tag = key de stage → auto-move casinha
      if (STAGE_RANK[tagName] != null) {
        autoMoveStage(id, tagName, null);
      }
    }
  }

  res.json({ ok: true, tags_detected: detection.tags, confidence: detection.confidence });
});

app.get('/', requireAuth, (req, res) => res.send(dashboardPage()));

// ---------- INTERNAL AUTH (Bearer WORKER_TOKEN) ----------
function requireInternal(req, res, next) {
  const h = String(req.headers.authorization || '');
  if (!WORKER_TOKEN || h !== `Bearer ${WORKER_TOKEN}`) return res.status(401).json({ error: 'unauthorized' });
  next();
}

function findLeadByPhone(phoneRaw) {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return null;
  const rows = db.prepare('SELECT id, telefone, nome, dispatch_slot FROM manual_leads').all();
  return rows.find(r => normalizePhone(r.telefone) === phone) || null;
}

function upsertLeadFromPhone(phone, name, slot) {
  const clean = normalizePhone(phone);
  if (!clean) return null;
  const existing = findLeadByPhone(clean);
  if (existing) {
    if (slot != null) db.prepare('UPDATE manual_leads SET dispatch_slot = ? WHERE id = ?').run(slot, existing.id);
    return existing.id;
  }
  const id = 'sync-' + crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`INSERT INTO manual_leads (id, nome, telefone, synced_from_sdrs, dispatch_slot, synced_at, created_at)
              VALUES (?, ?, ?, 1, ?, ?, ?)`)
    .run(id, name || 'Lead', clean, slot != null ? slot : null, now, now);
  db.prepare(`INSERT OR IGNORE INTO lead_stages (lead_key, stage, updated_at) VALUES (?, 'disparado', ?)`).run(id, now);
  return id;
}

function currentStage(leadKey) {
  const row = db.prepare('SELECT stage FROM lead_stages WHERE lead_key = ?').get(leadKey);
  return row ? row.stage : 'novo_lead';
}

function autoMoveStage(leadKey, targetStage, timestampCol) {
  const cur = currentStage(leadKey);
  const curRank = STAGE_RANK[cur] ?? 0;
  const targetRank = STAGE_RANK[targetStage] ?? 0;
  const now = Math.floor(Date.now() / 1000);
  const timeSet = timestampCol ? `, ${timestampCol} = COALESCE(${timestampCol}, ?)` : '';
  if (targetRank > curRank) {
    db.prepare(`INSERT INTO lead_stages (lead_key, stage, updated_at${timestampCol ? `, ${timestampCol}` : ''})
                VALUES (?, ?, ?${timestampCol ? ', ?' : ''})
                ON CONFLICT(lead_key) DO UPDATE SET stage = excluded.stage, updated_at = excluded.updated_at${timeSet}`)
      .run(...(timestampCol ? [leadKey, targetStage, now, now, now] : [leadKey, targetStage, now]));
    return { moved: true, from: cur, to: targetStage };
  }
  if (timestampCol) {
    db.prepare(`UPDATE lead_stages SET ${timestampCol} = COALESCE(${timestampCol}, ?) WHERE lead_key = ?`).run(now, leadKey);
  }
  return { moved: false, from: cur, to: cur };
}

function addTagByName(leadKey, tagName) {
  const tag = db.prepare('SELECT id FROM global_tags WHERE name = ?').get(tagName);
  if (!tag) return false;
  const info = db.prepare(`INSERT OR IGNORE INTO lead_tags (lead_id, tag_id, added_at) VALUES (?, ?, unixepoch())`).run(leadKey, tag.id);
  if (info.changes) db.prepare('UPDATE global_tags SET usage_count = usage_count + 1 WHERE id = ?').run(tag.id);
  return true;
}

// POST /api/internal/leads/mark-sent  { phone, name?, slot? }
// Chamado pelo jeff-sdrs assim que cadastra o número na fila OU após disparo bem-sucedido.
app.post('/api/internal/leads/mark-sent', requireInternal, (req, res) => {
  const { phone, name, slot } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'phone_required' });
  const leadKey = upsertLeadFromPhone(phone, name, typeof slot === 'number' ? slot : null);
  if (!leadKey) return res.status(400).json({ error: 'phone_invalid' });
  autoMoveStage(leadKey, 'disparado', 'sent_at');
  addTagByName(leadKey, 'disparado');
  res.json({ ok: true, lead_key: leadKey });
});

// POST /api/internal/leads/mark-delivered  { phone }
app.post('/api/internal/leads/mark-delivered', requireInternal, (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'phone_required' });
  const lead = findLeadByPhone(phone);
  if (!lead) return res.json({ ok: true, skipped: 'lead_not_found' });
  const r = autoMoveStage(lead.id, 'conversa_iniciada', 'delivered_at');
  if (r.moved) addTagByName(lead.id, 'conversa_iniciada');
  res.json({ ok: true, ...r });
});

// POST /api/internal/leads/mark-replied  { phone, message_text, wa_message_id }
app.post('/api/internal/leads/mark-replied', requireInternal, async (req, res) => {
  const { phone, message_text, wa_message_id } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'phone_required' });
  const lead = findLeadByPhone(phone);
  if (!lead) return res.json({ ok: true, skipped: 'lead_not_found' });
  const r = autoMoveStage(lead.id, 'novo_lead', 'replied_at');
  if (r.moved) addTagByName(lead.id, 'novo_lead');

  // Rodar detectTags em background pra classificar a msg. Se a tag detectada bater
  // com uma STAGE.key (ex: iniciou_compra), auto-move stage.
  let detectedTags = [];
  if (message_text) {
    try {
      const detection = await detectTags(message_text, db);
      db.prepare(`INSERT OR IGNORE INTO lead_conversas_stream
                  (lead_id, whatsapp_message_id, from_phone, body, tags_detected, ia_confidence, ts)
                  VALUES (?, ?, ?, ?, ?, ?, unixepoch())`)
        .run(lead.id, wa_message_id || null, normalizePhone(phone), message_text,
             JSON.stringify(detection.tags || []), detection.confidence || 0);
      detectedTags = detection.tags || [];
      for (const tagName of detectedTags) {
        addTagByName(lead.id, tagName);
        // se tag = key de stage, auto-move (respeita rank)
        if (STAGE_RANK[tagName] != null) {
          autoMoveStage(lead.id, tagName, null);
        }
      }
    } catch (e) {
      console.error('[mark-replied] detectTags falhou:', e.message);
    }
  }
  res.json({ ok: true, ...r, tags_detected: detectedTags });
});

// GET /api/dispatch/progress  — proxy pra jeff-sdrs, contadores por slot
const SDRS_URL_INTERNAL = process.env.SDRS_URL_INTERNAL || 'http://127.0.0.1:3041';
app.get('/api/dispatch/progress', requireAuth, async (req, res) => {
  try {
    const r = await fetch(`${SDRS_URL_INTERNAL}/api/sdrs/status`);
    if (!r.ok) return res.json({ ok: true, slots: [] });
    const j = await r.json();
    const slots = (j.slots || []).map(s => {
      const jobs = s.dispatch_jobs || {};
      const sent = jobs.sent || 0;
      const pending = jobs.pending || 0;
      const error = jobs.error || 0;
      const total = sent + pending + error;
      return {
        slot: s.slot,
        name: s.name || null,
        running: !!s.dispatch_running && !s.dispatch_paused_now,
        sent, pending, error, total,
        pct: total ? Math.round((sent / total) * 100) : 0,
      };
    });
    res.json({ ok: true, slots });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[jeff-sdrs-crm] listening on 0.0.0.0:${PORT}`);
});

function tagsPage() {
  return `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tags — CRM SDR</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg-0:#0a0f1a;--bg-1:#111827;--bg-2:#1e293b;--gold:#c4a24a;--gold-light:#e2c274;--blue:#3b82f6;--amber:#f59e0b;--green:#22c55e;--red:#ef4444;--text:#f8fafc;--muted:#94a3b8;--dim:#64748b;--border:rgba(255,255,255,0.08);--border-strong:rgba(255,255,255,0.15);--card:rgba(255,255,255,0.03);--card-hover:rgba(255,255,255,0.06)}
body{font-family:'Inter',sans-serif;background:radial-gradient(ellipse at top,var(--bg-2) 0%,var(--bg-1) 40%,var(--bg-0) 90%);min-height:100vh;color:var(--text)}
nav{display:flex;align-items:center;justify-content:space-between;padding:16px 32px;border-bottom:1px solid var(--border);position:sticky;top:0;background:rgba(10,15,26,0.92);backdrop-filter:blur(14px);z-index:100}
.nav-brand{display:flex;align-items:center;gap:12px}
.brand-logo{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,var(--gold),#a18538);display:flex;align-items:center;justify-content:center;font-weight:900;color:#0a0f1a;font-size:15px}
.nav-title strong{font-size:14px;font-weight:700}
.nav-title small{display:block;font-size:11px;color:var(--muted);letter-spacing:1px;text-transform:uppercase}
.nav-actions{display:flex;gap:10px;align-items:center}
.btn{padding:10px 18px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-weight:600;font-size:13px;cursor:pointer;font-family:inherit;transition:.15s}
.btn:hover{background:var(--card-hover);border-color:var(--border-strong)}
.btn-primary{background:linear-gradient(135deg,var(--gold),#a18538);color:#0a0f1a;border:none;font-weight:700}
.btn-primary:hover{opacity:.9;transform:translateY(-1px)}
.btn-danger{background:rgba(239,68,68,0.12);border-color:rgba(239,68,68,0.3);color:#fca5a5}
.btn-danger:hover{background:rgba(239,68,68,0.2)}
.btn-sm{padding:6px 12px;font-size:12px}
main{max-width:1100px;margin:0 auto;padding:32px}
.page-head{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:24px;gap:16px;flex-wrap:wrap}
.page-head h1{font-size:26px;font-weight:800;margin-bottom:4px}
.page-head p{color:var(--muted);font-size:14px;max-width:640px;line-height:1.5}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
@media(max-width:820px){.grid{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:22px;backdrop-filter:blur(8px)}
.card h2{font-size:14px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--gold-light);margin-bottom:16px}
label{display:block;font-size:12px;font-weight:600;color:var(--muted);margin:14px 0 6px;letter-spacing:.3px;text-transform:uppercase}
input,textarea,select{width:100%;padding:12px 14px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:14px;font-family:inherit;outline:none;transition:.15s;resize:vertical}
input:focus,textarea:focus,select:focus{border-color:var(--gold);background:rgba(196,162,74,0.05)}
textarea{min-height:110px;line-height:1.5}
.hint{font-size:12px;color:var(--muted);margin-top:6px;line-height:1.5}
.msg{margin-top:12px;font-size:13px;padding:10px 12px;border-radius:8px}
.msg-ok{background:rgba(34,197,94,0.1);color:#86efac;border:1px solid rgba(34,197,94,0.25)}
.msg-err{background:rgba(239,68,68,0.1);color:#fca5a5;border:1px solid rgba(239,68,68,0.25)}
.tag-list{display:flex;flex-direction:column;gap:12px;max-height:calc(100vh - 260px);overflow-y:auto;padding-right:6px}
.tag-list::-webkit-scrollbar{width:8px}
.tag-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
.tag-item{background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:12px;padding:14px 16px;transition:.15s}
.tag-item:hover{border-color:var(--border-strong)}
.tag-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px}
.tag-name{display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px}
.tag-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0}
.tag-cat{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}
.tag-instr{font-size:13px;color:#cbd5e1;line-height:1.5;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.06);margin-top:8px}
.tag-instr.editable textarea{margin-top:6px}
.tag-actions{display:flex;gap:8px}
.tag-system-badge{font-size:10px;padding:3px 8px;background:rgba(196,162,74,0.15);color:var(--gold-light);border-radius:6px;font-weight:700;letter-spacing:.6px}
.empty{color:var(--muted);text-align:center;padding:30px;font-size:13px}
.color-row{display:flex;gap:10px;align-items:center}
.color-row input[type=color]{width:52px;padding:4px;cursor:pointer}
.color-row input[type=text]{flex:1}
</style></head><body>
<nav>
  <div class="nav-brand">
    <div class="brand-logo">🏷️</div>
    <div class="nav-title"><strong>Tags do CRM</strong><small>SDR · Detecção via IA</small></div>
  </div>
  <div class="nav-actions">
    <a href="/" class="btn">← Kanban</a>
    <a href="/voltar-sistema" class="btn">Voltar ao sistema</a>
  </div>
</nav>
<main>
  <div class="page-head">
    <div>
      <h1>Tags e regras de marcação</h1>
      <p>Cada tag registrada aqui é analisada pela IA a cada mensagem que o lead manda. A <strong>instrução</strong> é o critério exato pra IA decidir se marca ou não. Seja específico. A tag <em>conversa_iniciada</em> é do sistema — marcada sempre que o lead responder o primeiro disparo.</p>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <h2>+ Nova tag</h2>
      <label>Nome da tag</label>
      <input id="f-name" placeholder="ex: interesse_alto, objecao_tempo, quer_agendar" maxlength="40">
      <div class="hint">Vira snake_case automático. Máx. 40 caracteres.</div>

      <label>Categoria</label>
      <select id="f-cat">
        <option value="qualificação">qualificação</option>
        <option value="objeção">objeção</option>
        <option value="urgência">urgência</option>
        <option value="comportamento">comportamento</option>
        <option value="fechamento">fechamento</option>
        <option value="geral" selected>geral</option>
      </select>

      <label>Cor</label>
      <div class="color-row">
        <input type="color" id="f-color" value="#3b82f6">
        <input type="text" id="f-color-hex" value="#3b82f6" pattern="^#[0-9a-fA-F]{6}$">
      </div>

      <label>Instrução — quando marcar essa tag</label>
      <textarea id="f-instr" placeholder="Descreva pra IA em que situação exata da conversa essa tag deve ser marcada. Ex: quando o lead demonstrar urgência, pedir para agendar reunião, ou perguntar 'quando começa?'"></textarea>
      <div class="hint">Quanto mais claro e concreto o critério, melhor a IA acerta. Cite palavras-gatilho ou intenções.</div>

      <button class="btn btn-primary" style="margin-top:18px;width:100%" onclick="createTag()">Cadastrar tag</button>
      <div id="create-msg"></div>
    </div>

    <div class="card">
      <h2>Tags cadastradas <span id="count" style="color:var(--muted);font-weight:500"></span></h2>
      <div id="list" class="tag-list"><div class="empty">Carregando…</div></div>
    </div>
  </div>
</main>
<script>
const $ = s => document.querySelector(s);
$('#f-color').addEventListener('input', e => $('#f-color-hex').value = e.target.value);
$('#f-color-hex').addEventListener('input', e => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) $('#f-color').value = e.target.value; });

async function loadTags() {
  const r = await fetch('/api/tags/list').then(r => r.json());
  const list = $('#list');
  const tags = r.tags || [];
  $('#count').textContent = tags.length ? '· ' + tags.length : '';
  if (!tags.length) { list.innerHTML = '<div class="empty">Nenhuma tag ainda. Cadastre a primeira ao lado.</div>'; return; }
  list.innerHTML = tags.map(t => renderTag(t)).join('');
}

function esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function renderTag(t) {
  const sys = t.is_system ? '<span class="tag-system-badge">SISTEMA</span>' : '';
  const actions = t.is_system ? '' : \`
    <button class="btn btn-sm" onclick="toggleEdit(\${t.id})">Editar</button>
    <button class="btn btn-sm btn-danger" onclick="delTag(\${t.id}, '\${esc(t.name)}')">Excluir</button>
  \`;
  return \`
    <div class="tag-item" id="tag-\${t.id}">
      <div class="tag-head">
        <div class="tag-name"><span class="tag-dot" style="background:\${esc(t.color || '#3b82f6')}"></span>\${esc(t.name)} \${sys}</div>
        <div class="tag-actions">\${actions}</div>
      </div>
      <div class="tag-cat">categoria: \${esc(t.category || 'geral')} · usada \${t.usage_count || 0}x</div>
      <div class="tag-instr" id="instr-\${t.id}">\${esc(t.instruction || '(sem instrução — a IA vai marcar por nome/categoria)')}</div>
    </div>\`;
}

function toggleEdit(id) {
  const box = $('#instr-' + id);
  if (box.querySelector('textarea')) return;
  const current = box.textContent.startsWith('(') ? '' : box.textContent;
  box.classList.add('editable');
  box.innerHTML = \`
    <textarea id="edit-\${id}">\${esc(current)}</textarea>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn btn-primary btn-sm" onclick="saveEdit(\${id})">Salvar</button>
      <button class="btn btn-sm" onclick="loadTags()">Cancelar</button>
    </div>\`;
  box.querySelector('textarea').focus();
}

async function saveEdit(id) {
  const val = $('#edit-' + id).value.trim();
  const r = await fetch('/api/tags/update/' + id, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ instruction: val })
  }).then(r => r.json());
  if (!r.ok) { alert('Erro: ' + (r.error || 'desconhecido')); return; }
  await loadTags();
}

async function delTag(id, name) {
  if (!confirm('Excluir a tag "' + name + '"? Ela sai de todos os leads.')) return;
  const r = await fetch('/api/tags/' + id, { method: 'DELETE' }).then(r => r.json());
  if (!r.ok) { alert('Erro: ' + (r.error || 'desconhecido')); return; }
  await loadTags();
}

async function createTag() {
  const name = $('#f-name').value.trim();
  const category = $('#f-cat').value;
  const color = $('#f-color-hex').value.trim();
  const instruction = $('#f-instr').value.trim();
  const msg = $('#create-msg');
  msg.className = '';
  msg.textContent = '';
  if (!name) { msg.className = 'msg msg-err'; msg.textContent = 'Coloca o nome da tag.'; return; }
  if (!instruction) { msg.className = 'msg msg-err'; msg.textContent = 'Escreve a instrução — a IA precisa saber quando marcar.'; return; }
  const r = await fetch('/api/tags/create', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ name, category, color, instruction })
  }).then(r => r.json());
  if (!r.ok) {
    msg.className = 'msg msg-err';
    msg.textContent = r.error === 'tag_already_exists' ? 'Já existe uma tag com esse nome.' : 'Erro: ' + (r.error || 'desconhecido');
    return;
  }
  msg.className = 'msg msg-ok';
  msg.textContent = 'Tag *' + r.name + '* cadastrada.';
  $('#f-name').value = '';
  $('#f-instr').value = '';
  await loadTags();
  setTimeout(() => { msg.textContent = ''; msg.className = ''; }, 3000);
}

loadTags();
</script>
</body></html>`;
}

// ---------- HTML ----------
function loginPage(error) {
  return `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CRM SDR</title>
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
.sent{color:#22c55e;font-size:13px;margin-bottom:12px}
.forgot{margin-top:14px;text-align:center}
.forgot form{display:inline}
.forgot button{width:auto;background:none;color:var(--muted);font-size:13px;font-weight:500;padding:6px;text-decoration:underline}
.forgot button:hover{transform:none;color:var(--gold-light);opacity:1}
</style></head><body>
<div class="card">
  <div class="logo">SDR</div>
  <h1>CRM</h1>
  <p class="sub">Painel de leads dos SDRs — acesso restrito</p>
  ${error}
  <form method="POST" action="/login">
    <input type="password" name="password" placeholder="Senha de acesso" required autofocus>
    <button type="submit">Entrar</button>
  </form>
  <div class="forgot">
    <form method="POST" action="/forgot">
      <button type="submit">Esqueci a senha</button>
    </form>
  </div>
</div></body></html>`;
}

const STAGES_JSON = JSON.stringify(STAGES);

function dashboardPage() {
  return `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CRM SDR — Painel de Leads</title>
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

.k-card{position:relative;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:10px;padding:12px 14px;cursor:grab;transition:.2s;user-select:none;overflow:hidden}
.k-rail{position:absolute;top:0;left:0;bottom:0;width:5px;background:rgba(148,163,184,0.18)}
.k-rail-fill{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,#22c55e,#3b82f6);transition:height .4s ease;box-shadow:0 0 6px rgba(59,130,246,0.5)}
.k-rail-pulse{position:absolute;top:-3px;left:-2px;width:9px;height:9px;border-radius:50%;background:#3b82f6;box-shadow:0 0 8px #3b82f6;animation:railPulse 1.4s ease-in-out infinite}
@keyframes railPulse{0%,100%{opacity:.4;transform:scale(1)}50%{opacity:1;transform:scale(1.3)}}
.k-card.k-with-rail{padding-left:18px}
.k-card-status{position:absolute;top:8px;right:10px;font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:2px 7px;border-radius:20px}
.k-card-status.disparado{background:rgba(148,163,184,0.15);color:#cbd5e1}
.k-card-status.iniciada{background:rgba(59,130,246,0.15);color:#93c5fd}
.k-card-status.novo{background:rgba(139,92,246,0.15);color:#c4b5fd}
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
    <div class="brand-logo">SD</div>
    <div class="nav-title"><strong>SDR</strong><small>CRM de leads dos SDRs</small></div>
  </div>
  <div class="nav-actions">
    <div class="tabs">
      <button class="tab active" data-view="kanban" onclick="setView('kanban')">Kanban</button>
      <button class="tab" data-view="metrics" onclick="setView('metrics')">Métricas</button>
    </div>
    <button class="btn btn-gold" onclick="openCreateModal()">+ Novo Lead</button>
    <button class="btn" onclick="loadData(true)">Atualizar</button>
    <a href="/voltar-sistema"><button class="btn btn-ghost">Voltar ao sistema</button></a>
  </div>
</nav>

<main>
  <div class="page-header">
    <h1 id="page-title">Painel de Leads</h1>
    <p id="page-sub">Leads dos SDRs — arraste os cards para mover entre etapas</p>
  </div>

  <div id="view-kanban" class="view active">
    <div class="kanban" id="kanban-board">
      <div class="loading" style="grid-column:1/-1"><div class="spin"></div><br>Carregando aplicações...</div>
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
  document.getElementById('page-title').textContent = v === 'kanban' ? 'Painel de Leads' : 'Métricas e Dashboard';
  document.getElementById('page-sub').textContent = v === 'kanban'
    ? 'Leads dos SDRs — arraste os cards para mover entre etapas'
    : 'Análise dos leads captados — filtros interativos para descobrir os melhores horários';
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
    refreshDispatchProgress();
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
  c.dataset.slot = l._dispatch_slot != null ? l._dispatch_slot : '';
  const nome = l['Nome Completo'] || '(sem nome)';
  const empresa = l['Empresa'] || '';
  const telefone = l['Telefone'] || '';
  const cidade = l['Cidade'] ? (l['Cidade'] + (l['Estado/Região'] ? '/' + l['Estado/Região'] : '')) : '';
  const origem = l['Origem'] || '';
  const dh = l._ts ? \`\${l._ts.date} \${String(l._ts.hour).padStart(2,'0')}:\${String(l._ts.minute).padStart(2,'0')}\` : '';

  // Rail lateral de progresso: só em stages iniciais do fluxo de disparo
  const showRail = ['disparado','conversa_iniciada','novo_lead'].includes(l._stage);
  const railHtml = showRail
    ? \`<div class="k-rail"><div class="k-rail-fill" data-rail-fill style="height:0%"></div><div class="k-rail-pulse" data-rail-pulse style="display:none"></div></div>\`
    : '';

  let statusBadge = '';
  if (l._stage === 'disparado') statusBadge = '<span class="k-card-status disparado">enviando</span>';
  else if (l._stage === 'conversa_iniciada') statusBadge = '<span class="k-card-status iniciada">entregue</span>';
  else if (l._stage === 'novo_lead') statusBadge = '<span class="k-card-status novo">respondeu</span>';

  if (showRail) c.classList.add('k-with-rail');
  c.innerHTML = \`
    \${railHtml}
    \${statusBadge}
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

let DISPATCH_PROGRESS = {}; // slot -> {pct, sent, total, running}
async function refreshDispatchProgress() {
  try {
    const r = await fetch('/api/dispatch/progress');
    if (!r.ok) return;
    const j = await r.json();
    DISPATCH_PROGRESS = {};
    (j.slots || []).forEach(s => { DISPATCH_PROGRESS[s.slot] = s; });
    applyRails();
  } catch (e) { /* silencioso */ }
}

function applyRails() {
  document.querySelectorAll('.k-card[data-slot]').forEach(card => {
    const slot = card.dataset.slot;
    const fill = card.querySelector('[data-rail-fill]');
    const pulse = card.querySelector('[data-rail-pulse]');
    if (!fill) return;
    const p = slot ? DISPATCH_PROGRESS[slot] : null;
    if (!p) { fill.style.height = '20%'; if (pulse) pulse.style.display = 'none'; return; }
    fill.style.height = p.pct + '%';
    if (pulse) {
      pulse.style.display = p.running ? 'block' : 'none';
      pulse.style.top = (100 - p.pct) + '%';
    }
  });
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
  if (!CURRENT_KEY) return;
  if (!CURRENT_KEY.startsWith('manual-') && !CURRENT_KEY.startsWith('sync-')) return alert('Não pode deletar leads da planilha');
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
setInterval(refreshDispatchProgress, 8000);
</script>
</body></html>`;
}
