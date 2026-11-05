const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { db, getConfig, setConfig } = require('./src/db');
const auth = require('./src/auth');
const ig = require('./src/ig-api');

const PORT = process.env.PORT || 3060;
const app = express();

// raw body para HMAC do webhook
app.use('/webhook', express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); }
}));
app.use(express.json());
app.use((req, _res, next) => {
  // parse cookies simples
  req.cookies = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) req.cookies[k] = decodeURIComponent(v.join('='));
  });
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// ---------- HEALTH ----------
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    version: '0.1.0',
    tenants: db.prepare('SELECT COUNT(*) n FROM tenants').get().n,
    contacts: db.prepare('SELECT COUNT(*) n FROM contacts').get().n,
    messages: db.prepare('SELECT COUNT(*) n FROM messages').get().n,
    webhook_events: db.prepare('SELECT COUNT(*) n FROM webhook_events').get().n,
  });
});

// ---------- AUTH ----------
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email/password required' });
  const user = db.prepare('SELECT * FROM admin_users WHERE email=?').get(email);
  if (!user || !auth.verify(password, user.password_hash)) return res.status(401).json({ error: 'invalid' });
  const s = auth.createSession(user.id);
  res.setHeader('Set-Cookie', `zc_session=${s.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30*86400}`);
  res.json({ ok: true, user: { email: user.email, role: user.role } });
});

app.post('/api/auth/logout', auth.requireAuth, (req, res) => {
  auth.destroySession(req.cookies.zc_session);
  res.setHeader('Set-Cookie', 'zc_session=; Path=/; HttpOnly; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/auth/me', auth.requireAuth, (req, res) => res.json({ user: req.user }));

// ---------- TENANTS ----------
app.get('/api/tenants', auth.requireAuth, auth.requireAdmin, (_req, res) => {
  const rows = db.prepare(`SELECT id,name,email,status,ig_username,ig_account_type,ig_token_expires_at,created_at
                           FROM tenants ORDER BY id DESC`).all();
  res.json({ tenants: rows });
});

app.post('/api/tenants', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const { name, email } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const info = db.prepare('INSERT INTO tenants(name,email) VALUES(?,?)').run(name, email || null);
  const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(info.lastInsertRowid);
  // Gera state e link OAuth pra esse tenant
  const state = crypto.randomBytes(16).toString('hex');
  setConfig(`oauth_state_${state}`, JSON.stringify({ tenant_id: tenant.id, created: Date.now() }));
  res.json({ tenant, connect_url: ig.authorizeUrl(state) });
});

app.get('/api/tenants/:id', auth.requireAuth, (req, res) => {
  const t = db.prepare('SELECT * FROM tenants WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  const contacts = db.prepare('SELECT COUNT(*) n FROM contacts WHERE tenant_id=?').get(t.id).n;
  const msgs = db.prepare('SELECT COUNT(*) n FROM messages WHERE tenant_id=?').get(t.id).n;
  const flows = db.prepare('SELECT COUNT(*) n FROM flows WHERE tenant_id=?').get(t.id).n;
  // não retorna token
  const { ig_access_token, ...safe } = t;
  res.json({ tenant: safe, stats: { contacts, messages: msgs, flows } });
});

app.post('/api/tenants/:id/connect-url', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const t = db.prepare('SELECT id FROM tenants WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  const state = crypto.randomBytes(16).toString('hex');
  setConfig(`oauth_state_${state}`, JSON.stringify({ tenant_id: t.id, created: Date.now() }));
  res.json({ connect_url: ig.authorizeUrl(state) });
});

// ---------- OAUTH CALLBACK ----------
app.get('/oauth/callback', async (req, res) => {
  const { code, state, error, error_reason } = req.query;
  if (error) return res.status(400).send(`OAuth erro: ${error} (${error_reason})`);
  if (!code || !state) return res.status(400).send('missing code/state');
  const raw = getConfig(`oauth_state_${state}`);
  if (!raw) return res.status(400).send('invalid state (expired?)');
  const { tenant_id } = JSON.parse(raw);

  try {
    // 1) short-lived
    const shortR = await ig.exchangeCodeForToken(code);
    if (shortR.status !== 200 || !shortR.body.access_token) {
      return res.status(400).send(`erro token curto: ${JSON.stringify(shortR.body)}`);
    }
    // 2) long-lived
    const longR = await ig.exchangeShortForLong(shortR.body.access_token);
    if (longR.status !== 200 || !longR.body.access_token) {
      return res.status(400).send(`erro token longo: ${JSON.stringify(longR.body)}`);
    }
    const longToken = longR.body.access_token;
    const expiresIn = longR.body.expires_in || 60*86400;
    // 3) /me
    const meR = await ig.me(longToken);
    if (meR.status !== 200 || !meR.body.id) {
      return res.status(400).send(`erro /me: ${JSON.stringify(meR.body)}`);
    }
    const meBody = meR.body;
    const exp = new Date(Date.now() + expiresIn*1000).toISOString();
    db.prepare(`UPDATE tenants SET
                  ig_user_id=?, ig_username=?, ig_account_type=?,
                  ig_access_token=?, ig_token_expires_at=?, status='active',
                  updated_at=datetime('now')
                WHERE id=?`)
      .run(meBody.user_id || meBody.id, meBody.username, meBody.account_type,
           longToken, exp, tenant_id);
    // limpa state
    db.prepare("DELETE FROM app_config WHERE key=?").run(`oauth_state_${state}`);
    res.send(`<html><body style="font-family:sans-serif;max-width:600px;margin:40px auto">
      <h1>✅ Conectado!</h1>
      <p>Conta <b>@${meBody.username}</b> ligada ao ZeusChatIG.</p>
      <p>Já pode fechar essa aba.</p></body></html>`);
  } catch (e) {
    res.status(500).send(`erro: ${e.message}`);
  }
});

// ---------- WEBHOOK IG ----------
app.get('/webhook', (req, res) => {
  const expected = getConfig('ig_webhook_verify_token');
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === expected) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  return res.status(403).send('forbidden');
});

app.post('/webhook', (req, res) => {
  const secret = getConfig('ig_app_secret');
  if (!secret || !req.rawBody) return res.status(401).send('no secret configured');
  const got = req.header('x-hub-signature-256') || '';
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  let ok = false;
  try { ok = got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected)); } catch {}
  if (!ok) return res.status(401).send('invalid signature');

  const body = req.body || {};
  const ins = db.prepare(`INSERT INTO webhook_events(tenant_id, event_type, sender_id, ig_user_id, raw_json)
                          VALUES(?,?,?,?,?)`);
  for (const entry of body.entry || []) {
    const igUserId = entry.id;
    const t = db.prepare('SELECT id FROM tenants WHERE ig_user_id=?').get(igUserId);
    const tid = t?.id || null;
    for (const m of entry.messaging || []) {
      ins.run(tid, 'message', (m.sender||{}).id || null, igUserId, JSON.stringify(m));
    }
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      ins.run(tid, ch.field || 'change', (v.from||{}).id || null, igUserId, JSON.stringify(ch));
    }
  }
  res.status(200).send('OK');
});

// ---------- CONTATOS ----------
app.get('/api/tenants/:id/contacts', auth.requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT id,ig_sender_id,ig_username,ig_name,tags,last_seen_at
                           FROM contacts WHERE tenant_id=? ORDER BY last_seen_at DESC LIMIT 100`).all(req.params.id);
  res.json({ contacts: rows });
});

// ---------- FLOWS ----------
app.get('/api/tenants/:id/flows', auth.requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id,name,description,active,updated_at FROM flows WHERE tenant_id=?').all(req.params.id);
  res.json({ flows: rows });
});

app.post('/api/tenants/:id/flows', auth.requireAuth, (req, res) => {
  const { name, description } = req.body || {};
  const info = db.prepare('INSERT INTO flows(tenant_id, name, description) VALUES(?,?,?)').run(req.params.id, name || 'Novo fluxo', description || null);
  res.json({ flow: db.prepare('SELECT * FROM flows WHERE id=?').get(info.lastInsertRowid) });
});

// ============================================================
// MYIG — AGENTES DE IA
// ============================================================

function pickTenant(req) {
  // pra MVP single-tenant Jeff: pega primeiro tenant ativo se não vier param
  if (req.params.tenantId) return db.prepare('SELECT * FROM tenants WHERE id=?').get(req.params.tenantId);
  const t = db.prepare("SELECT * FROM tenants WHERE status='active' ORDER BY id LIMIT 1").get();
  if (t) return t;
  return db.prepare('SELECT * FROM tenants ORDER BY id LIMIT 1').get();
}

// ---------- AGENTS ----------
app.get('/api/agents', auth.requireAuth, (req, res) => {
  const t = pickTenant(req);
  if (!t) return res.json({ agents: [] });
  const rows = db.prepare(`SELECT * FROM agents WHERE tenant_id=? ORDER BY id DESC`).all(t.id);
  res.json({ agents: rows, tenant: { id: t.id, name: t.name, ig_username: t.ig_username } });
});

app.get('/api/agents/:id', auth.requireAuth, (req, res) => {
  const a = db.prepare('SELECT * FROM agents WHERE id=?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  const rules = db.prepare('SELECT * FROM agent_routing_rules WHERE agent_id=? ORDER BY priority DESC, id').all(a.id);
  res.json({ agent: a, rules });
});

app.post('/api/agents', auth.requireAuth, (req, res) => {
  const t = pickTenant(req);
  if (!t) return res.status(400).json({ error: 'no tenant available' });
  const { name, system_prompt, model, avatar_emoji, color, max_turns, timeout_seconds, active } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const info = db.prepare(`INSERT INTO agents(tenant_id, name, system_prompt, model, avatar_emoji, color, max_turns, timeout_seconds, active)
                           VALUES(?,?,?,?,?,?,?,?,?)`).run(
    t.id, name, system_prompt || '', model || 'claude-opus-4-7',
    avatar_emoji || 'robot', color || '#7c3aed',
    max_turns || 1, timeout_seconds || 120,
    active === false ? 0 : 1
  );
  const agent = db.prepare('SELECT * FROM agents WHERE id=?').get(info.lastInsertRowid);
  res.json({ agent });
});

app.put('/api/agents/:id', auth.requireAuth, (req, res) => {
  const a = db.prepare('SELECT * FROM agents WHERE id=?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  db.prepare(`UPDATE agents SET
    name=COALESCE(?,name),
    system_prompt=COALESCE(?,system_prompt),
    model=COALESCE(?,model),
    avatar_emoji=COALESCE(?,avatar_emoji),
    color=COALESCE(?,color),
    max_turns=COALESCE(?,max_turns),
    timeout_seconds=COALESCE(?,timeout_seconds),
    active=COALESCE(?,active),
    updated_at=datetime('now')
    WHERE id=?`).run(
    b.name ?? null, b.system_prompt ?? null, b.model ?? null,
    b.avatar_emoji ?? null, b.color ?? null,
    b.max_turns ?? null, b.timeout_seconds ?? null,
    typeof b.active === 'boolean' ? (b.active ? 1 : 0) : null,
    a.id
  );
  res.json({ agent: db.prepare('SELECT * FROM agents WHERE id=?').get(a.id) });
});

app.delete('/api/agents/:id', auth.requireAuth, (req, res) => {
  db.prepare('DELETE FROM agents WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- ROUTING RULES ----------
app.get('/api/agents/:id/rules', auth.requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM agent_routing_rules WHERE agent_id=? ORDER BY priority DESC, id').all(req.params.id);
  res.json({ rules: rows });
});

app.post('/api/agents/:id/rules', auth.requireAuth, (req, res) => {
  const a = db.prepare('SELECT * FROM agents WHERE id=?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'agent not found' });
  const { rule_type, rule_value, priority } = req.body || {};
  if (!rule_type) return res.status(400).json({ error: 'rule_type required' });
  const info = db.prepare(`INSERT INTO agent_routing_rules(tenant_id, agent_id, rule_type, rule_value, priority)
                           VALUES(?,?,?,?,?)`).run(a.tenant_id, a.id, rule_type, rule_value || null, priority || 0);
  res.json({ rule: db.prepare('SELECT * FROM agent_routing_rules WHERE id=?').get(info.lastInsertRowid) });
});

app.delete('/api/rules/:id', auth.requireAuth, (req, res) => {
  db.prepare('DELETE FROM agent_routing_rules WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- CHATS / THREADS ----------
app.get('/api/threads', auth.requireAuth, (req, res) => {
  const t = pickTenant(req);
  if (!t) return res.json({ threads: [] });
  const rows = db.prepare(`
    SELECT th.id, th.paused, th.last_message_at, th.last_direction, th.unread_count,
           th.current_agent_id,
           c.id AS contact_id, c.ig_sender_id, c.ig_username, c.ig_name,
           a.name AS agent_name, a.color AS agent_color,
           (SELECT text FROM messages WHERE contact_id=c.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_text,
           (SELECT sent_by FROM messages WHERE contact_id=c.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_sent_by
    FROM ig_threads th
    JOIN contacts c ON c.id=th.contact_id
    LEFT JOIN agents a ON a.id=th.current_agent_id
    WHERE th.tenant_id=?
    ORDER BY th.last_message_at DESC NULLS LAST
    LIMIT 200
  `).all(t.id);
  res.json({ threads: rows });
});

app.get('/api/threads/:id', auth.requireAuth, (req, res) => {
  const th = db.prepare(`SELECT th.*, c.ig_username, c.ig_name, c.ig_sender_id
                         FROM ig_threads th JOIN contacts c ON c.id=th.contact_id
                         WHERE th.id=?`).get(req.params.id);
  if (!th) return res.status(404).json({ error: 'not found' });
  // as 500 mais recentes, em ordem de horário (ecos e mídias gravados depois entram na posição certa)
  const messages = db.prepare(`SELECT * FROM (SELECT id, direction, text, media_url, created_at, sent_by, ig_message_id
                               FROM messages WHERE contact_id=? ORDER BY created_at DESC, id DESC LIMIT 500) ORDER BY created_at ASC, id ASC`).all(th.contact_id);
  const runs = db.prepare(`SELECT id, agent_id, status, input_text, output_text, model, duration_ms, started_at, finished_at
                           FROM agent_runs WHERE thread_id=? ORDER BY id DESC LIMIT 20`).all(th.id);
  db.prepare('UPDATE ig_threads SET unread_count=0 WHERE id=?').run(th.id);
  res.json({ thread: th, messages, runs });
});

app.post('/api/threads/:id/pause', auth.requireAuth, (req, res) => {
  db.prepare('UPDATE ig_threads SET paused=1 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/threads/:id/resume', auth.requireAuth, (req, res) => {
  db.prepare('UPDATE ig_threads SET paused=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/threads/:id/send', auth.requireAuth, async (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  const th = db.prepare(`SELECT th.*, c.ig_sender_id, t.ig_access_token
                         FROM ig_threads th
                         JOIN contacts c ON c.id=th.contact_id
                         JOIN tenants t ON t.id=th.tenant_id
                         WHERE th.id=?`).get(req.params.id);
  if (!th) return res.status(404).json({ error: 'not found' });
  if (!th.ig_access_token) return res.status(400).json({ error: 'tenant not connected' });
  const send = await ig.sendDM(th.ig_access_token, th.ig_sender_id, text);
  if (send.status !== 200) return res.status(400).json({ error: 'ig api error', body: send.body });
  db.prepare(`INSERT INTO messages(tenant_id, contact_id, direction, text, ig_message_id, sent_by)
              VALUES(?,?,?,?,?,?)`).run(th.tenant_id, th.contact_id, 'out', text, send.body?.message_id || null, 'operator:' + req.user.id);
  db.prepare(`UPDATE ig_threads SET last_message_at=datetime('now'), last_direction='out' WHERE id=?`).run(th.id);
  res.json({ ok: true });
});

// ---------- RUNS / LIVE VIEW (SSE) ----------
app.get('/api/runs/:id', auth.requireAuth, (req, res) => {
  const r = db.prepare('SELECT * FROM agent_runs WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  res.json({ run: r });
});

app.get('/api/stream', auth.requireAuth, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const t = pickTenant(req);
  if (!t) { res.write('event: end\ndata: no-tenant\n\n'); return res.end(); }
  let lastRunId = db.prepare('SELECT COALESCE(MAX(id),0) AS n FROM agent_runs WHERE tenant_id=?').get(t.id).n;
  let lastMsgId = db.prepare('SELECT COALESCE(MAX(id),0) AS n FROM messages WHERE tenant_id=?').get(t.id).n;
  const iv = setInterval(() => {
    const newRuns = db.prepare('SELECT * FROM agent_runs WHERE tenant_id=? AND id>? ORDER BY id').all(t.id, lastRunId);
    for (const r of newRuns) { res.write(`event: run\ndata: ${JSON.stringify(r)}\n\n`); lastRunId = r.id; }
    const updatedRuns = db.prepare(`SELECT * FROM agent_runs WHERE tenant_id=? AND finished_at IS NOT NULL AND id>? AND started_at>datetime('now','-1 hour')`).all(t.id, 0);
    const newMsgs = db.prepare('SELECT * FROM messages WHERE tenant_id=? AND id>? ORDER BY id').all(t.id, lastMsgId);
    for (const m of newMsgs) { res.write(`event: message\ndata: ${JSON.stringify(m)}\n\n`); lastMsgId = m.id; }
    res.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 1500);
  req.on('close', () => clearInterval(iv));
});

// ---------- DASHBOARD ----------
app.get('/api/dashboard', auth.requireAuth, (req, res) => {
  const t = pickTenant(req);
  if (!t) return res.json({ tenant: null });
  const agents = db.prepare('SELECT COUNT(*) n FROM agents WHERE tenant_id=? AND active=1').get(t.id).n;
  const threads = db.prepare('SELECT COUNT(*) n FROM ig_threads WHERE tenant_id=?').get(t.id).n;
  const messagesIn = db.prepare("SELECT COUNT(*) n FROM messages WHERE tenant_id=? AND direction='in' AND created_at>datetime('now','-24 hour')").get(t.id).n;
  const messagesOut = db.prepare("SELECT COUNT(*) n FROM messages WHERE tenant_id=? AND direction='out' AND created_at>datetime('now','-24 hour')").get(t.id).n;
  const runsToday = db.prepare("SELECT COUNT(*) n FROM agent_runs WHERE tenant_id=? AND started_at>datetime('now','-24 hour')").get(t.id).n;
  const runsErrors = db.prepare("SELECT COUNT(*) n FROM agent_runs WHERE tenant_id=? AND status IN ('error','timeout') AND started_at>datetime('now','-24 hour')").get(t.id).n;
  const recentRuns = db.prepare(`SELECT r.id, r.status, r.model, r.duration_ms, r.started_at, a.name AS agent_name, c.ig_username
                                 FROM agent_runs r
                                 LEFT JOIN agents a ON a.id=r.agent_id
                                 LEFT JOIN contacts c ON c.id=r.contact_id
                                 WHERE r.tenant_id=? ORDER BY r.id DESC LIMIT 10`).all(t.id);
  res.json({
    tenant: { id: t.id, name: t.name, ig_username: t.ig_username, ig_account_type: t.ig_account_type, status: t.status },
    stats: { agents, threads, messagesIn, messagesOut, runsToday, runsErrors },
    recentRuns,
  });
});

// ---------- FLUXOS DE CONVERSA (construtor da Central > Instagram > Fluxos; motor em src/flows.js) ----------
const flowsEngine = require('./src/flows');
const { execFile } = require('child_process');
const FLOW_MEDIA = path.join(__dirname, 'data', 'flow-media');
const PUBLIC_BASE = (process.env.MYIG_PUBLIC_URL || 'https://myig.jefersonhenrike.com').replace(/\/+$/, '');
fs.mkdirSync(FLOW_MEDIA, { recursive: true });
// Mídia dos fluxos precisa de link público: a Meta baixa a imagem/áudio pela URL. Nomes aleatórios, só leitura.
app.use('/m', express.static(FLOW_MEDIA, { index: false, maxAge: '30d', fallthrough: false }));

function flowNovaDefinicao() {
  return { nodes: [
    { id: 'g1', type: 'gatilho', x: 80, y: 120, data: { tipo: 'palavra', palavras: [], modo: 'contem' } },
    { id: 'm1', type: 'mensagem', x: 460, y: 100, data: { texto: 'Oi {{nome}}! Que bom te ver por aqui.', estilo: 'botoes', botoes: [] } },
  ], edges: [{ de: 'g1', porta: 'proximo', para: 'm1' }] };
}
function flowStats(id) {
  const r = db.prepare(`SELECT COUNT(*) total, SUM(status='done') concluidos, SUM(status IN ('waiting_reply','pending','running')) andamento,
    SUM(status='error') erros, MAX(started_at) ultimo FROM flow_runs WHERE flow_id=?`).get(id);
  return { total: r.total || 0, concluidos: r.concluidos || 0, andamento: r.andamento || 0, erros: r.erros || 0, ultimo: r.ultimo || null };
}
function flowShape(f, completo) {
  let d = {}; try { d = JSON.parse(f.definition || '{}'); } catch (_) {}
  const g = (d.nodes || []).find(n => n.type === 'gatilho');
  const o = { id: f.id, name: f.name, description: f.description, active: !!f.active, updated_at: f.updated_at,
    gatilho: g ? g.data : null, blocos: (d.nodes || []).length, stats: flowStats(f.id) };
  if (completo) o.definition = { nodes: d.nodes || [], edges: d.edges || [] };
  return o;
}
function cleanDef(d) {
  if (!d || !Array.isArray(d.nodes) || !Array.isArray(d.edges)) throw new Error('definição inválida');
  if (d.nodes.length > 200) throw new Error('fluxo grande demais (máx. 200 blocos)');
  const TIPOS = ['gatilho', 'mensagem', 'imagem', 'audio', 'espera', 'pergunta', 'agente'];
  const nodes = d.nodes.filter(n => n && TIPOS.includes(n.type) && /^[\w-]{1,40}$/.test(String(n.id)))
    .map(n => ({ id: String(n.id), type: n.type, x: Math.round(+n.x || 0), y: Math.round(+n.y || 0), data: n.data && typeof n.data === 'object' ? n.data : {} }));
  const ids = new Set(nodes.map(n => n.id));
  const edges = d.edges.filter(e => e && ids.has(e.de) && ids.has(e.para) && e.de !== e.para)
    .map(e => ({ de: e.de, porta: String(e.porta || 'proximo').slice(0, 60), para: e.para }));
  // uma seta por porta
  const visto = new Set();
  return { nodes, edges: edges.filter(e => { const k = e.de + '|' + e.porta; if (visto.has(k)) return false; visto.add(k); return true; }) };
}

app.get('/api/flows', auth.requireAuth, (req, res) => {
  const t = pickTenant(req); if (!t) return res.json({ flows: [] });
  res.json({ flows: db.prepare('SELECT * FROM flows WHERE tenant_id=? ORDER BY updated_at DESC').all(t.id).map(f => flowShape(f)) });
});
app.post('/api/flows', auth.requireAuth, (req, res) => {
  const t = pickTenant(req); if (!t) return res.status(400).json({ error: 'no tenant available' });
  const name = String((req.body || {}).name || 'Novo fluxo').trim().slice(0, 80) || 'Novo fluxo';
  const info = db.prepare('INSERT INTO flows(tenant_id, name, definition, active) VALUES(?,?,?,0)').run(t.id, name, JSON.stringify(flowNovaDefinicao()));
  res.json({ flow: flowShape(db.prepare('SELECT * FROM flows WHERE id=?').get(info.lastInsertRowid), true) });
});
app.get('/api/flows/:id', auth.requireAuth, (req, res) => {
  const f = db.prepare('SELECT * FROM flows WHERE id=?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'not found' });
  const agentes = db.prepare('SELECT id, name, active FROM agents WHERE tenant_id=? ORDER BY name').all(f.tenant_id);
  res.json({ flow: flowShape(f, true), agentes });
});
app.put('/api/flows/:id', auth.requireAuth, (req, res) => {
  const f = db.prepare('SELECT * FROM flows WHERE id=?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  let defin = null;
  try { if (b.definition !== undefined) defin = cleanDef(b.definition); } catch (e) { return res.status(400).json({ error: e.message }); }
  const ativo = b.active === undefined ? !!f.active : !!b.active;
  if (ativo) {
    const problemas = flowsEngine.validar(defin || JSON.parse(f.definition || '{}'), true);
    if (problemas.length) return res.status(400).json({ error: (f.active ? 'Fluxo ativo: corrija antes de salvar (ou desative). ' : 'Corrija antes de ativar. ') + problemas.join(' '), problemas });
  }
  db.prepare(`UPDATE flows SET name=COALESCE(?,name), definition=COALESCE(?,definition), active=?, updated_at=datetime('now') WHERE id=?`)
    .run(b.name != null ? String(b.name).trim().slice(0, 80) || null : null, defin ? JSON.stringify(defin) : null, ativo ? 1 : 0, f.id);
  if (b.active !== undefined && !!b.active !== !!f.active) console.log(`[flows] fluxo ${f.id} ${ativo ? 'ATIVADO' : 'desativado'} por ${req.headers['x-central-user'] || 'myig'}`);
  // desativar encerra as execuções em andamento
  if (!ativo) db.prepare(`UPDATE flow_runs SET status='canceled', updated_at=datetime('now') WHERE flow_id=? AND status IN ('pending','waiting_reply','running')`).run(f.id);
  res.json({ flow: flowShape(db.prepare('SELECT * FROM flows WHERE id=?').get(f.id), true), avisos: flowsEngine.validar(defin || JSON.parse(f.definition || '{}'), false) });
});
app.post('/api/flows/:id/duplicar', auth.requireAuth, (req, res) => {
  const f = db.prepare('SELECT * FROM flows WHERE id=?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'not found' });
  const info = db.prepare('INSERT INTO flows(tenant_id, name, description, definition, active) VALUES(?,?,?,?,0)').run(f.tenant_id, (f.name + ' (cópia)').slice(0, 80), f.description, f.definition);
  res.json({ flow: flowShape(db.prepare('SELECT * FROM flows WHERE id=?').get(info.lastInsertRowid), true) });
});
app.delete('/api/flows/:id', auth.requireAuth, (req, res) => {
  db.prepare('DELETE FROM flows WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
// Upload: corpo bruto (até 15 MB). Áudio vira M4A (AAC) e imagem WebP vira JPG: formatos que o Instagram aceita.
app.post('/api/flows/media', auth.requireAuth, express.raw({ type: () => true, limit: '15mb' }), (req, res) => {
  const tipo = req.query.tipo === 'audio' ? 'audio' : 'imagem';
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'arquivo vazio' });
  const base = crypto.randomBytes(12).toString('hex');
  const ENTRA = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp',
    'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'video/webm': '.webm' };
  const ext = ENTRA[ct.split(';')[0].trim()];
  if (!ext || (tipo === 'imagem') !== ct.startsWith('image/')) return res.status(400).json({ error: tipo === 'audio' ? 'formato de áudio não aceito' : 'use PNG, JPG, GIF ou WebP' });
  const bruto = path.join(FLOW_MEDIA, base + '.orig' + ext);
  fs.writeFileSync(bruto, buf);
  const pronto = (nome, dur) => res.json({ url: PUBLIC_BASE + '/m/' + nome, duracao: dur || null });
  const falhou = (e) => { try { fs.rmSync(bruto, { force: true }); } catch (_) {} res.status(400).json({ error: 'não consegui converter o arquivo: ' + e }); };
  if (tipo === 'imagem' && ext !== '.webp') { const nome = base + ext; fs.renameSync(bruto, path.join(FLOW_MEDIA, nome)); return pronto(nome); }
  const nome = base + (tipo === 'audio' ? '.m4a' : '.jpg');
  const args = tipo === 'audio' ? ['-y', '-loglevel', 'error', '-i', bruto, '-vn', '-ac', '1', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', path.join(FLOW_MEDIA, nome)]
    : ['-y', '-loglevel', 'error', '-i', bruto, '-q:v', '3', path.join(FLOW_MEDIA, nome)];
  execFile('ffmpeg', args, { timeout: 60000 }, (err, _o, stderr) => {
    try { fs.rmSync(bruto, { force: true }); } catch (_) {}
    if (err) return falhou(String(stderr || err.message).slice(0, 200));
    if (tipo !== 'audio') return pronto(nome);
    execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(FLOW_MEDIA, nome)], { timeout: 15000 }, (_e, out) => pronto(nome, Math.round(parseFloat(out) || 0)));
  });
});

// ---------- START ----------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[zeuschatig] listening on 0.0.0.0:${PORT}`);
  // valores default se DB novo
  if (!getConfig('ig_webhook_verify_token')) {
    setConfig('ig_webhook_verify_token', crypto.randomBytes(16).toString('hex'));
    console.log('[zeuschatig] verify_token gerado — consulte via API');
  }
});
