require('dotenv').config();
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const axios   = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3025;
const JWT_SECRET = process.env.JWT_SECRET || 'meta-dash-dev-secret-troque';

const DATA_DIR     = path.join(__dirname, 'data');
const CLIENTS_FILE = path.join(DATA_DIR, 'clients.json');
const USERS_FILE   = path.join(DATA_DIR, 'users.json');
const UPLOADS_DIR  = path.join(__dirname, 'uploads');

[DATA_DIR, UPLOADS_DIR, path.join(__dirname, 'public')]
  .forEach(d => !fs.existsSync(d) && fs.mkdirSync(d, { recursive: true }));

if (!fs.existsSync(CLIENTS_FILE)) fs.writeFileSync(CLIENTS_FILE, '[]');
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([{
    id:            uuidv4(),
    email:         process.env.ADMIN_EMAIL    || 'admin@metadash.com',
    password_hash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10),
    role:          'admin',
    name:          'Administrador',
    client_id:     null,
    created_at:    new Date().toISOString()
  }], null, 2));
}

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = file.mimetype === 'text/csv' || file.originalname.endsWith('.csv');
    cb(ok ? null : new Error('Apenas CSV'), ok);
  }
});

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const [k, ...v] = p.trim().split('=');
    if (k) out[k.trim()] = decodeURIComponent(v.join('='));
  });
  return out;
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Bloqueia acesso direto a páginas HTML protegidas sem cookie de sessão válido
app.use((req, res, next) => {
  if (!req.path.endsWith('.html') || req.path === '/login.html') return next();
  const token = parseCookies(req).meta_auth;
  if (!token) return res.redirect('/login.html');
  try { jwt.verify(token, JWT_SECRET); next(); }
  catch { res.clearCookie('meta_auth'); res.redirect('/login.html'); }
});

app.use(express.static(path.join(__dirname, 'public')));

const db = {
  clients:     ()  => JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf8')),
  users:       ()  => JSON.parse(fs.readFileSync(USERS_FILE,   'utf8')),
  saveClients: (d) => fs.writeFileSync(CLIENTS_FILE, JSON.stringify(d, null, 2)),
  saveUsers:   (d) => fs.writeFileSync(USERS_FILE,   JSON.stringify(d, null, 2)),
};

const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token necessario' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token invalido ou expirado' }); }
};

const adminOnly = (req, res, next) =>
  req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Acesso restrito ao administrador' });

const canAccessClient = (req, res, clientId) => {
  if (req.user.role === 'admin' || req.user.client_id === clientId) return true;
  res.status(403).json({ error: 'Acesso negado' });
  return false;
};

const metaGet = (endpoint, params) =>
  axios.get(`https://graph.facebook.com/v19.0/${endpoint}`, { params })
       .then(r => r.data);

const clientMeta = (clientId) => {
  const c = db.clients().find(x => x.id === clientId);
  if (!c) throw Object.assign(new Error('Cliente nao encontrado'), { status: 404 });
  return c;
};

const trParam = (since, until) =>
  since && until ? JSON.stringify({ since, until }) : undefined;

const filteringParam = (campaign_ids) => {
  if (!campaign_ids) return undefined;
  const ids = campaign_ids.split(',').map(s => s.trim()).filter(Boolean);
  if (!ids.length) return undefined;
  return JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: ids }]);
};

// slug helpers
function toSlug(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40);
}
function uniqueSlug(name, existingClients, excludeId) {
  let base = toSlug(name);
  let slug = base;
  let i = 2;
  while (existingClients.some(c => c.slug === slug && c.id !== excludeId)) {
    slug = base + '-' + i++;
  }
  return slug;
}

// ── AUTH ─────────────────────────────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.users().find(u => u.email?.toLowerCase() === email?.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, client_id: user.client_id, name: user.name },
      JWT_SECRET, { expiresIn: '30d' }
    );
    res.cookie('meta_auth', token, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    res.json({ token, role: user.role, client_id: user.client_id, name: user.name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/change-password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!new_password || new_password.length < 6)
      return res.status(400).json({ error: 'Nova senha precisa ter ao menos 6 caracteres' });
    const users = db.users();
    const idx = users.findIndex(u => u.id === req.user.id);
    if (!bcrypt.compareSync(current_password, users[idx].password_hash))
      return res.status(400).json({ error: 'Senha atual incorreta' });
    users[idx].password_hash = bcrypt.hashSync(new_password, 10);
    db.saveUsers(users);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CLIENTS ──────────────────────────────────────────────────────────────────

// rota publica: info basica pelo slug (sem auth)
app.get('/api/clients/public/:slug', (req, res) => {
  const c = db.clients().find(x => x.slug === req.params.slug);
  if (!c) return res.status(404).json({ error: 'Cliente nao encontrado' });
  res.json({ name: c.name, logo_url: c.logo_url, slug: c.slug });
});

app.get('/api/clients', auth, adminOnly, (req, res) => {
  res.json(db.clients().map(c => ({ ...c, meta_access_token: c.meta_access_token ? '••••••' : null })));
});

app.get('/api/clients/:id', auth, (req, res) => {
  if (!canAccessClient(req, res, req.params.id)) return;
  const c = db.clients().find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Cliente nao encontrado' });
  const { meta_access_token, ...safe } = c;
  res.json(safe);
});

app.post('/api/clients', auth, adminOnly, (req, res) => {
  try {
    const { name, logo_url, meta_account_id, meta_access_token,
            google_sheets_url, goals, user_email, user_password, user_name } = req.body;

    if (!name || !meta_account_id || !meta_access_token)
      return res.status(400).json({ error: 'Nome, Ad Account ID e Access Token sao obrigatorios' });

    const clients = db.clients();
    const slug = uniqueSlug(name, clients, null);

    const client = {
      id: uuidv4(), slug, name,
      logo_url:           logo_url          || null,
      meta_account_id,    meta_access_token,
      google_sheets_url:  google_sheets_url || null,
      sheets_data:        null,
      sheets_updated_at:  null,
      goals: goals || { cpl: null, cpc: null, lead_rate: null, ctr: null },
      created_at: new Date().toISOString()
    };

    clients.push(client);
    db.saveClients(clients);

    if (user_email && user_password) {
      const users = db.users();
      if (users.find(u => u.email?.toLowerCase() === user_email.toLowerCase()))
        return res.status(400).json({ error: 'Email de acesso ja cadastrado' });
      users.push({
        id: uuidv4(), email: user_email,
        name: user_name || name,
        password_hash: bcrypt.hashSync(user_password, 10),
        role: 'client', client_id: client.id,
        created_at: new Date().toISOString()
      });
      db.saveUsers(users);
    }

    const { meta_access_token: _, ...safe } = client;
    res.status(201).json(safe);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/clients/:id', auth, adminOnly, (req, res) => {
  try {
    const clients = db.clients();
    const idx = clients.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Cliente nao encontrado' });
    const { id, created_at, slug: _, ...updates } = req.body;
    if (updates.meta_access_token === '••••••') delete updates.meta_access_token;
    // regenera slug se o nome mudou
    if (updates.name && updates.name !== clients[idx].name) {
      clients[idx].slug = uniqueSlug(updates.name, clients, req.params.id);
    }
    clients[idx] = { ...clients[idx], ...updates };
    db.saveClients(clients);
    res.json({ success: true, slug: clients[idx].slug });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/clients/:id', auth, adminOnly, (req, res) => {
  try {
    db.saveClients(db.clients().filter(c => c.id !== req.params.id));
    db.saveUsers(db.users().filter(u => u.client_id !== req.params.id));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/clients/:clientId/users', auth, adminOnly, (req, res) => {
  res.json(db.users()
    .filter(u => u.client_id === req.params.clientId)
    .map(({ password_hash, ...s }) => s));
});

app.post('/api/clients/:clientId/users', auth, adminOnly, (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatorios' });
    const users = db.users();
    if (users.find(u => u.email?.toLowerCase() === email.toLowerCase()))
      return res.status(400).json({ error: 'Email ja cadastrado' });
    const nu = { id: uuidv4(), email, name: name || email, role: 'client',
      password_hash: bcrypt.hashSync(password, 10),
      client_id: req.params.clientId, created_at: new Date().toISOString() };
    users.push(nu);
    db.saveUsers(users);
    const { password_hash, ...s } = nu;
    res.status(201).json(s);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/clients/:clientId/users/:userId', auth, adminOnly, (req, res) => {
  try {
    db.saveUsers(db.users().filter(u => !(u.id === req.params.userId && u.client_id === req.params.clientId)));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── META API PROXY ────────────────────────────────────────────────────────────

app.get('/api/meta/:clientId/overview', auth, async (req, res) => {
  if (!canAccessClient(req, res, req.params.clientId)) return;
  try {
    const c = clientMeta(req.params.clientId);
    const tr = trParam(req.query.since, req.query.until);
    const fi = filteringParam(req.query.campaign_ids);
    const level = fi ? 'campaign' : 'account';
    const params = {
      fields: 'spend,impressions,reach,clicks,actions,cost_per_action_type,' +
              'video_p25_watched_actions,video_p75_watched_actions,frequency,cpm,cpc,ctr',
      level, limit: fi ? 200 : 1, access_token: c.meta_access_token,
    };
    if (tr) params.time_range = tr;
    if (fi) params.filtering = fi;
    const data = await metaGet(`${c.meta_account_id}/insights`, params);
    if (fi) {
      // agregar múltiplas campanhas em um único objeto
      const rows = data.data || [];
      const agg = rows.reduce((acc, r) => {
        acc.spend        = (parseFloat(acc.spend || 0)        + parseFloat(r.spend || 0)).toFixed(2);
        acc.impressions  = String(parseInt(acc.impressions||0) + parseInt(r.impressions||0));
        acc.reach        = String(parseInt(acc.reach||0)       + parseInt(r.reach||0));
        acc.clicks       = String(parseInt(acc.clicks||0)      + parseInt(r.clicks||0));
        // actions: somar por action_type
        (r.actions||[]).forEach(a => {
          const ex = (acc.actions = acc.actions||[]).find(x => x.action_type === a.action_type);
          if (ex) ex.value = String(parseFloat(ex.value||0) + parseFloat(a.value||0));
          else acc.actions.push({...a});
        });
        (r.cost_per_action_type||[]).forEach(a => {
          const ex = (acc.cost_per_action_type = acc.cost_per_action_type||[]).find(x => x.action_type === a.action_type);
          if (!ex) acc.cost_per_action_type.push({...a});
        });
        return acc;
      }, {});
      return res.json(agg);
    }
    res.json(data.data?.[0] || {});
  } catch (e) { res.status(e.status || 500).json({ error: e.response?.data?.error?.message || e.message }); }
});

app.get('/api/meta/:clientId/timeseries', auth, async (req, res) => {
  if (!canAccessClient(req, res, req.params.clientId)) return;
  try {
    const c = clientMeta(req.params.clientId);
    const tr = trParam(req.query.since, req.query.until);
    const fi = filteringParam(req.query.campaign_ids);
    const params = {
      fields: 'spend,impressions,reach,clicks,actions,cost_per_action_type,date_start',
      time_increment: 1, level: fi ? 'campaign' : 'account', limit: 500,
      access_token: c.meta_access_token,
    };
    if (tr) params.time_range = tr;
    if (fi) params.filtering = fi;
    const data = await metaGet(`${c.meta_account_id}/insights`, params);
    if (fi) {
      // agregar por data
      const byDate = {};
      (data.data || []).forEach(r => {
        const d = r.date_start;
        if (!byDate[d]) byDate[d] = { date_start: d, spend: 0, impressions: 0, reach: 0, clicks: 0, actions: [], cost_per_action_type: [] };
        byDate[d].spend       += parseFloat(r.spend || 0);
        byDate[d].impressions += parseInt(r.impressions || 0);
        byDate[d].reach       += parseInt(r.reach || 0);
        byDate[d].clicks      += parseInt(r.clicks || 0);
        (r.actions||[]).forEach(a => {
          const ex = byDate[d].actions.find(x => x.action_type === a.action_type);
          if (ex) ex.value = String(parseFloat(ex.value||0) + parseFloat(a.value||0));
          else byDate[d].actions.push({...a});
        });
        (r.cost_per_action_type||[]).forEach(a => {
          if (!byDate[d].cost_per_action_type.find(x => x.action_type === a.action_type))
            byDate[d].cost_per_action_type.push({...a});
        });
      });
      return res.json(Object.values(byDate).sort((a,b) => a.date_start.localeCompare(b.date_start)));
    }
    res.json(data.data || []);
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

app.get('/api/meta/:clientId/comparison', auth, async (req, res) => {
  if (!canAccessClient(req, res, req.params.clientId)) return;
  try {
    const c   = clientMeta(req.params.clientId);
    const { since, until } = req.query;
    if (!since || !until) return res.status(400).json({ error: 'Datas obrigatorias' });

    const s = new Date(since), e = new Date(until);
    const days = Math.round((e - s) / 86400000) + 1;
    const prevEnd   = new Date(s); prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - days + 1);
    const fmt = d => d.toISOString().split('T')[0];

    const base = {
      fields: 'spend,impressions,reach,clicks,actions,cost_per_action_type',
      level: 'account', limit: 1, access_token: c.meta_access_token,
    };
    const [curr, prev] = await Promise.all([
      metaGet(`${c.meta_account_id}/insights`, { ...base, time_range: JSON.stringify({ since, until }) }),
      metaGet(`${c.meta_account_id}/insights`, { ...base, time_range: JSON.stringify({ since: fmt(prevStart), until: fmt(prevEnd) }) }),
    ]);
    res.json({ current: curr.data?.[0] || null, previous: prev.data?.[0] || null });
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

app.get('/api/meta/:clientId/campaigns', auth, async (req, res) => {
  if (!canAccessClient(req, res, req.params.clientId)) return;
  try {
    const c  = clientMeta(req.params.clientId);
    const tr = trParam(req.query.since, req.query.until);
    const fi = filteringParam(req.query.campaign_ids);
    const params = {
      fields: 'campaign_id,campaign_name,adset_name,ad_name,spend,impressions,reach,clicks,actions,cost_per_action_type',
      level: 'ad', limit: 200, access_token: c.meta_access_token,
    };
    if (tr) params.time_range = tr;
    if (fi) params.filtering = fi;
    const data = await metaGet(`${c.meta_account_id}/insights`, params);
    res.json(data.data || []);
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

app.get('/api/meta/:clientId/campaign-list', auth, async (req, res) => {
  if (!canAccessClient(req, res, req.params.clientId)) return;
  try {
    const c  = clientMeta(req.params.clientId);
    const tr = trParam(req.query.since, req.query.until);
    const params = {
      fields: 'campaign_id,campaign_name,spend',
      level: 'campaign', limit: 200, access_token: c.meta_access_token,
    };
    if (tr) params.time_range = tr;
    const data = await metaGet(`${c.meta_account_id}/insights`, params);
    res.json((data.data || []).map(d => ({ id: d.campaign_id, name: d.campaign_name, spend: d.spend })));
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

app.get('/api/meta/:clientId/demographics', auth, async (req, res) => {
  if (!canAccessClient(req, res, req.params.clientId)) return;
  try {
    const c  = clientMeta(req.params.clientId);
    const tr = trParam(req.query.since, req.query.until);
    const fi = filteringParam(req.query.campaign_ids);
    const params = {
      fields: 'reach,impressions,actions',
      breakdowns: 'age,gender', level: fi ? 'campaign' : 'account', limit: 200,
      access_token: c.meta_access_token,
    };
    if (tr) params.time_range = tr;
    if (fi) params.filtering = fi;
    const data = await metaGet(`${c.meta_account_id}/insights`, params);
    res.json(data.data || []);
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

app.get('/api/meta/:clientId/regions', auth, async (req, res) => {
  if (!canAccessClient(req, res, req.params.clientId)) return;
  try {
    const c  = clientMeta(req.params.clientId);
    const tr = trParam(req.query.since, req.query.until);
    const fi = filteringParam(req.query.campaign_ids);
    const params = {
      fields: 'reach,impressions,spend,clicks',
      breakdowns: 'region', level: fi ? 'campaign' : 'account', limit: 100,
      access_token: c.meta_access_token,
    };
    if (tr) params.time_range = tr;
    if (fi) params.filtering = fi;
    const data = await metaGet(`${c.meta_account_id}/insights`, params);
    if (fi) {
      const byRegion = {};
      (data.data || []).forEach(r => {
        const key = r.region;
        if (!byRegion[key]) byRegion[key] = { region: key, reach: 0, impressions: 0, spend: 0, clicks: 0 };
        byRegion[key].reach       += parseInt(r.reach || 0);
        byRegion[key].impressions += parseInt(r.impressions || 0);
        byRegion[key].spend       += parseFloat(r.spend || 0);
        byRegion[key].clicks      += parseInt(r.clicks || 0);
      });
      return res.json(Object.values(byRegion));
    }
    res.json(data.data || []);
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

app.get('/api/meta/:clientId/ads', auth, async (req, res) => {
  if (!canAccessClient(req, res, req.params.clientId)) return;
  try {
    const c  = clientMeta(req.params.clientId);
    const tr = trParam(req.query.since, req.query.until);
    const params = {
      fields: 'ad_name,ad_id,spend,impressions,clicks,actions,cost_per_action_type',
      level: 'ad', limit: 50, access_token: c.meta_access_token,
    };
    if (tr) params.time_range = tr;
    const insData = await metaGet(`${c.meta_account_id}/insights`, params);
    const ads = insData.data || [];
    const thumbs = await Promise.all(
      ads.slice(0, 20).map(async ad => {
        try {
          const t = await metaGet(ad.ad_id, { fields: 'creative{thumbnail_url}', access_token: c.meta_access_token });
          return [ad.ad_id, t.creative?.thumbnail_url || null];
        } catch { return [ad.ad_id, null]; }
      })
    );
    const thumbMap = Object.fromEntries(thumbs);
    res.json(ads.map(ad => ({ ...ad, thumbnail_url: thumbMap[ad.ad_id] || null })));
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

app.get('/api/meta/:clientId/campaigns-by-objective', auth, async (req, res) => {
  if (!canAccessClient(req, res, req.params.clientId)) return;
  try {
    const c  = clientMeta(req.params.clientId);
    const tr = trParam(req.query.since, req.query.until);
    const statusFilter = req.query.status || 'all';

    const campParams = {
      fields: 'id,name,objective,status,effective_status',
      limit: 200, access_token: c.meta_access_token,
    };
    if (statusFilter === 'active')   campParams.effective_status = JSON.stringify(['ACTIVE']);
    if (statusFilter === 'inactive') campParams.effective_status = JSON.stringify(['PAUSED','ARCHIVED','DELETED','CAMPAIGN_PAUSED']);

    const insParams = {
      fields: 'campaign_id,campaign_name,spend,impressions,reach,clicks,actions,cost_per_action_type',
      level: 'campaign', limit: 200, access_token: c.meta_access_token,
    };
    if (tr) insParams.time_range = tr;

    const [campData, insData] = await Promise.all([
      metaGet(`${c.meta_account_id}/campaigns`, campParams),
      metaGet(`${c.meta_account_id}/insights`, insParams),
    ]);

    const insMap = {};
    (insData.data || []).forEach(d => { insMap[d.campaign_id] = d; });

    const OBJ_LABEL = {
      OUTCOME_TRAFFIC: 'Tráfego',
      OUTCOME_AWARENESS: 'Alcance',
      REACH: 'Alcance',
      OUTCOME_ENGAGEMENT: 'Engajamento',
      POST_ENGAGEMENT: 'Engajamento',
      PAGE_LIKES: 'Engajamento',
      OUTCOME_LEADS: 'Lead',
      LEAD_GENERATION: 'Lead',
      OUTCOME_SALES: 'Venda Direta',
      CONVERSIONS: 'Venda Direta',
      PRODUCT_CATALOG_SALES: 'Venda Direta',
      VIDEO_VIEWS: 'Visualização de Vídeo',
      MESSAGES: 'Mensagens',
      APP_INSTALLS: 'Instalação de App',
    };

    const getLeadsFromIns = (d) => {
      if (!d?.actions) return 0;
      const LEAD_TYPES = ['leadgen_grouped','onsite_conversion.lead_grouped','lead','onsite_conversion.flow_complete','onsite_conversion.messaging_conversation_started_7d','messaging_conversation_started_7d','contact','complete_registration'];
      for (const t of LEAD_TYPES) {
        const a = d.actions.find(x => x.action_type === t);
        if (a && Number(a.value) > 0) return Number(a.value);
      }
      const fb = d.actions.find(x => x.action_type.includes('lead') && Number(x.value) > 0);
      return fb ? Number(fb.value) : 0;
    };

    const getCPLFromIns = (d) => {
      if (!d?.cost_per_action_type) return 0;
      const LEAD_TYPES = ['leadgen_grouped','onsite_conversion.lead_grouped','lead','onsite_conversion.flow_complete'];
      for (const t of LEAD_TYPES) {
        const a = d.cost_per_action_type.find(x => x.action_type === t);
        if (a && Number(a.value) > 0) return Number(a.value);
      }
      return 0;
    };

    const byObj = {};
    (campData.data || []).forEach(camp => {
      const obj   = camp.objective || 'OTHER';
      const label = OBJ_LABEL[obj] || obj;
      if (!byObj[obj]) byObj[obj] = { objective: obj, label, campaigns: [] };
      const ins = insMap[camp.id] || {};
      byObj[obj].campaigns.push({
        id:          camp.id,
        name:        camp.name,
        status:      camp.effective_status || camp.status,
        spend:       Number(ins.spend || 0),
        impressions: Number(ins.impressions || 0),
        reach:       Number(ins.reach || 0),
        clicks:      Number(ins.clicks || 0),
        leads:       getLeadsFromIns(ins),
        cpl:         getCPLFromIns(ins),
      });
    });

    const result = Object.values(byObj).map(g => ({
      ...g,
      total_spend:       g.campaigns.reduce((s,c) => s + c.spend, 0),
      total_leads:       g.campaigns.reduce((s,c) => s + c.leads, 0),
      total_clicks:      g.campaigns.reduce((s,c) => s + c.clicks, 0),
      total_impressions: g.campaigns.reduce((s,c) => s + c.impressions, 0),
      total_reach:       g.campaigns.reduce((s,c) => s + c.reach, 0),
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.response?.data?.error?.message || e.message }); }
});

// ── SHEETS ────────────────────────────────────────────────────────────────────

app.get('/api/clients/:clientId/sheets', auth, async (req, res) => {
  if (!canAccessClient(req, res, req.params.clientId)) return;
  try {
    const c = db.clients().find(x => x.id === req.params.clientId);
    if (!c) return res.status(404).json({ error: 'Cliente nao encontrado' });
    if (c.google_sheets_url) {
      const m = c.google_sheets_url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (!m) return res.status(400).json({ error: 'URL do Google Sheets invalida' });
      const csvUrl = `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv`;
      const { data } = await axios.get(csvUrl);
      return res.json({ source: 'google_sheets', url: c.google_sheets_url,
                        data: parseCSV(data), fetched_at: new Date().toISOString() });
    }
    if (c.sheets_data)
      return res.json({ source: 'upload', data: c.sheets_data, updated_at: c.sheets_updated_at });
    res.json({ source: null, data: null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/clients/:clientId/sheets/url', auth, adminOnly, (req, res) => {
  try {
    const clients = db.clients();
    const idx = clients.findIndex(c => c.id === req.params.clientId);
    if (idx === -1) return res.status(404).json({ error: 'Cliente nao encontrado' });
    clients[idx].google_sheets_url = req.body.url || null;
    clients[idx].sheets_data = null;
    db.saveClients(clients);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/clients/:clientId/sheets/upload', auth, upload.single('file'), (req, res) => {
  if (!canAccessClient(req, res, req.params.clientId)) return;
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo CSV necessario' });
    const csv = fs.readFileSync(req.file.path, 'utf8');
    fs.unlinkSync(req.file.path);
    const parsed = parseCSV(csv);
    const clients = db.clients();
    const idx = clients.findIndex(c => c.id === req.params.clientId);
    if (idx === -1) return res.status(404).json({ error: 'Cliente nao encontrado' });
    clients[idx].sheets_data       = parsed;
    clients[idx].sheets_updated_at = new Date().toISOString();
    db.saveClients(clients);
    res.json({ success: true, rows: parsed.length, data: parsed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── UTILS ─────────────────────────────────────────────────────────────────────

function parseCSVRow(row) {
  const result = []; let cur = '', inQ = false;
  for (const ch of row) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVRow(lines[0]);
  return lines.slice(1).map(l => {
    const vals = parseCSVRow(l);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
}

// URL personalizada por slug: /c/pnde → /login.html?client=pnde
app.get('/c/:slug', (req, res) => res.redirect(`/login.html?client=${req.params.slug}`));

// Magic link: /m/:token → auto-login direto no dashboard do cliente
app.get('/m/:token', (req, res) => {
  try {
    const clients = db.clients();
    const client = clients.find(c => c.magic_token === req.params.token);
    if (!client) return res.status(404).send('<h2>Link inválido ou expirado.</h2>');

    const users = db.users();
    const user = users.find(u => u.client_id === client.id && u.role === 'client');
    if (!user) return res.status(404).send('<h2>Usuário não encontrado para este cliente.</h2>');

    const jwt_token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, client_id: user.client_id, name: user.name },
      JWT_SECRET, { expiresIn: '30d' }
    );

    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Carregando...</title></head><body>
<script>
  localStorage.setItem('meta_token', ${JSON.stringify(jwt_token)});
  localStorage.setItem('meta_role', 'client');
  localStorage.setItem('meta_client_id', ${JSON.stringify(user.client_id)});
  localStorage.setItem('meta_name', ${JSON.stringify(user.name)});
  window.location.replace('/dashboard.html');
</script>
<p>Redirecionando...</p></body></html>`);
  } catch (e) { res.status(500).send('<h2>Erro interno.</h2>'); }
});

// Admin: gerar / rotacionar magic token de um cliente
app.post('/api/clients/:id/magic-token', auth, adminOnly, (req, res) => {
  try {
    const clients = db.clients();
    const idx = clients.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Cliente nao encontrado' });
    clients[idx].magic_token = uuidv4();
    db.saveClients(clients);
    const base = req.protocol + '://' + req.get('host');
    res.json({ magic_link: `${base}/m/${clients[idx].magic_token}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin: ver magic link de um cliente
app.get('/api/clients/:id/magic-link', auth, adminOnly, (req, res) => {
  try {
    const client = db.clients().find(c => c.id === req.params.id);
    if (!client) return res.status(404).json({ error: 'Cliente nao encontrado' });
    if (!client.magic_token) return res.json({ magic_link: null });
    const base = req.protocol + '://' + req.get('host');
    res.json({ magic_link: `${base}/m/${client.magic_token}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/', (req, res) => {
  const token = parseCookies(req).meta_auth;
  if (token) {
    try { jwt.verify(token, JWT_SECRET); return res.redirect('/dashboard.html'); }
    catch { res.clearCookie('meta_auth'); }
  }
  res.redirect('/login.html');
});

app.get('/logout', (req, res) => {
  res.clearCookie('meta_auth');
  res.redirect('/login.html');
});

app.listen(PORT, () => {
  console.log(`Meta Dashboard iniciado na porta ${PORT}`);
  console.log(`Admin: ${process.env.ADMIN_EMAIL || 'admin@metadash.com'}`);
});
