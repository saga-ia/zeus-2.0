const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const AUTH_SALT = 'jeff-alpha-2026';
const AUTH_HASH = 'cc189194985c4bac11329888a521216a265a8772db99d347512ebc2d9192bedb7c6b576d2dd3168f2b028b1d4fb36b7d1ea30c32515918f4c814bb03eabcca62';
const sessions = new Map();
// Senha redefinida pelo "Esqueci minha senha" fica em data/auth-override.json e vale no lugar do AUTH_HASH.
const pwdReset = require('/opt/jeff-apps/jeff-shared/password-reset');
const pwdOverride = pwdReset.overrideStore(require('path').join(__dirname, 'data'));
function verifyPwd(pwd) {
  const viaOverride = pwdOverride.check(pwd);
  if (viaOverride !== null) return viaOverride;
  try {
    const test = crypto.scryptSync(pwd, AUTH_SALT, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(AUTH_HASH, 'hex'));
  } catch { return false; }
}
function newSession() {
  const tok = crypto.randomBytes(32).toString('hex');
  sessions.set(tok, Date.now() + 30 * 24 * 60 * 60 * 1000);
  return tok;
}
function parseCookies(req) {
  const list = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) list[k.trim()] = decodeURIComponent(v.join('='));
  });
  return list;
}
function getSession(req) {
  const exp = sessions.get(parseCookies(req).sid);
  return exp && exp > Date.now();
}
function requireAuth(req, res, next) {
  if (!getSession(req)) return res.redirect('/login');
  next();
}
function apiAuth(req, res, next) {
  if (!getSession(req)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

const DB_PATH = '/opt/jeff-worker/data/worker.db';
const PORT = process.env.PORT || 3013;
const ASAAS_BASE = 'https://api.asaas.com/v3';
const WAPI_BASE = 'http://127.0.0.1:3002';
const WAPI_TOKEN = (() => {
  try {
    const env = fs.readFileSync('/opt/jeff-worker/.env', 'utf8');
    const m = env.match(/^API_TOKEN=(.+)$/m);
    return m ? m[1].trim() : null;
  } catch { return null; }
})();

// db precisa ser writable pra inserir asaas_events
const db = new Database(DB_PATH, { fileMustExist: true });
db.pragma('journal_mode = WAL');

const insertAsaasEvent = db.prepare(`
  INSERT INTO asaas_events (event, payment_id, customer_id, customer_phone, value, due_date, status, raw_json, wpp_sent)
  VALUES (@event, @payment_id, @customer_id, @customer_phone, @value, @due_date, @status, @raw_json, @wpp_sent)
`);
const listAsaasEvents = db.prepare(`
  SELECT id, event, payment_id, customer_id, customer_phone, value, due_date, status, received_at, wpp_sent
  FROM asaas_events ORDER BY received_at DESC LIMIT ? OFFSET ?
`);
const countAsaasEvents = db.prepare(`SELECT COUNT(*) AS n FROM asaas_events`);

const setting = (k) => {
  const r = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(k);
  return r ? r.value : null;
};

const getKey = () => setting('asaas_api_key');

async function asaas(pathname, { method = 'GET', body = null, query = {} } = {}) {
  const key = getKey();
  if (!key) {
    const e = new Error('asaas_api_key missing in app_settings');
    e.status = 500;
    throw e;
  }
  const u = new URL(ASAAS_BASE + pathname);
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== '') u.searchParams.set(k, v);
  }
  const opts = {
    method,
    headers: { 'access_token': key, 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(u.toString(), opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data?.errors?.[0]?.description || `asaas_${res.status}`);
    e.status = res.status;
    e.payload = data;
    throw e;
  }
  return data;
}

async function paginated(pathname, query = {}, max = 1000) {
  const all = [];
  let offset = 0;
  while (all.length < max) {
    const d = await asaas(pathname, { query: { ...query, limit: 100, offset } });
    const items = d.data || [];
    all.push(...items);
    if (!d.hasMore || items.length === 0) break;
    offset += items.length;
  }
  return all;
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));


pwdReset.mount(app, {
  appName: 'Cobranças (Asaas)',
  setPassword: (newPass) => { pwdOverride.write(newPass); sessions.clear(); return true; }
});

app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.post('/api/login', (req, res) => {
  if (!verifyPwd(req.body.password || '')) return res.redirect('/login?error=1');
  const tok = newSession();
  res.set('Set-Cookie', `sid=${tok}; HttpOnly; Path=/; Max-Age=${30 * 24 * 3600}`);
  res.redirect('/');
});
app.get('/api/logout', (req, res) => {
  const c = parseCookies(req);
  if (c.sid) sessions.delete(c.sid);
  res.set('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
  res.redirect('/login');
});
app.get('/', requireAuth, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/index.html', requireAuth, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasKey: !!getKey(), webhookEvents: countAsaasEvents.get().n });
});

async function fetchCustomer(customerId) {
  try { return await asaas(`/customers/${customerId}`); } catch { return null; }
}

async function sendWhatsApp(phone, message) {
  if (!WAPI_TOKEN) return false;
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return false;
  const phoneFull = digits.startsWith('55') ? digits : '55' + digits;
  try {
    const r = await fetch(`${WAPI_BASE}/messages/private`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WAPI_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: phoneFull, body: message })
    });
    return r.ok;
  } catch { return false; }
}

const fmtBRL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : null;

app.post('/webhooks/asaas', async (req, res) => {
  try {
    // valida auth token (Asaas envia no header asaas-access-token quando configurado)
    const expected = setting('asaas_webhook_auth_token');
    if (expected) {
      const got = req.header('asaas-access-token') || req.header('Asaas-Access-Token') || '';
      if (got !== expected) {
        console.warn(`[asaas-webhook] AUTH FAIL: header="${got.slice(0,8)}..." expected="${expected.slice(0,8)}..."`);
        return res.status(401).json({ error: 'invalid asaas-access-token' });
      }
    }
    const body = req.body || {};
    const event = body.event || 'unknown';
    const payment = body.payment || {};
    const payment_id = payment.id || null;
    const customer_id = payment.customer || null;
    const value = Number(payment.value) || null;
    const due_date = payment.dueDate || null;
    const status = payment.status || null;

    let customer_phone = null;
    let wpp_sent = 0;

    // PAYMENT_CREATED → manda link/Pix pro cliente
    if (event === 'PAYMENT_CREATED' && customer_id) {
      const cust = await fetchCustomer(customer_id);
      if (cust) {
        customer_phone = cust.mobilePhone || cust.phone;
        const billingType = payment.billingType || 'BOLETO';
        const link = payment.invoiceUrl || payment.bankSlipUrl || null;
        const desc = payment.description ? `\n\n${payment.description}` : '';
        const msg = `Olá ${(cust.name || '').split(' ')[0] || ''}! Sua cobrança de *${fmtBRL(value)}* foi gerada.\n\n` +
                    `Vencimento: *${fmtDate(due_date)}*\n` +
                    `Forma: ${billingType}` +
                    (link ? `\n\nLink: ${link}` : '') +
                    desc;
        wpp_sent = (await sendWhatsApp(customer_phone, msg)) ? 1 : 0;
      }
    }

    // PAYMENT_RECEIVED → confirmação
    if ((event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') && customer_id) {
      const cust = await fetchCustomer(customer_id);
      if (cust) {
        customer_phone = cust.mobilePhone || cust.phone;
        const msg = `Recebemos seu pagamento de *${fmtBRL(value)}*${(cust.name ? `, ${cust.name.split(' ')[0]}` : '')}. Obrigado! 💪`;
        wpp_sent = (await sendWhatsApp(customer_phone, msg)) ? 1 : 0;
      }
    }

    insertAsaasEvent.run({
      event, payment_id, customer_id, customer_phone, value, due_date, status,
      raw_json: JSON.stringify(body), wpp_sent
    });

    console.log(`[asaas-webhook] ${event} payment=${payment_id} value=${value} status=${status} wpp=${wpp_sent}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('[asaas-webhook] ERROR', e.stack);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/webhook-events', apiAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = parseInt(req.query.offset || '0', 10);
  res.json({
    ok: true,
    total: countAsaasEvents.get().n,
    items: listAsaasEvents.all(limit, offset)
  });
});

app.get('/api/snapshot', apiAuth, async (_req, res) => {
  try {
    const [pending, overdue, received, confirmed, customers] = await Promise.all([
      paginated('/payments', { status: 'PENDING' }, 1000),
      paginated('/payments', { status: 'OVERDUE' }, 1000),
      asaas('/payments', { query: { status: 'RECEIVED', limit: 1 } }),
      asaas('/payments', { query: { status: 'CONFIRMED', limit: 1 } }),
      asaas('/customers', { query: { limit: 1 } })
    ]);

    const sumValue = (arr) => arr.reduce((a, p) => a + (Number(p.value) || 0), 0);
    const sumNet = (arr) => arr.reduce((a, p) => a + (Number(p.netValue ?? p.value) || 0), 0);

    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const dueIn30 = pending.filter(p => p.dueDate >= today && p.dueDate <= in30);

    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      pending: {
        count: pending.length,
        sumValue: sumValue(pending),
        sumNet: sumNet(pending),
        dueIn30: { count: dueIn30.length, sumValue: sumValue(dueIn30) }
      },
      overdue: {
        count: overdue.length,
        sumValue: sumValue(overdue),
        sumNet: sumNet(overdue)
      },
      receivedTotalCount: received.totalCount || 0,
      confirmedTotalCount: confirmed.totalCount || 0,
      customersTotalCount: customers.totalCount || 0
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, payload: e.payload || null });
  }
});

app.get('/api/payments', apiAuth, async (req, res) => {
  try {
    const status = (req.query.status || 'PENDING').toUpperCase();
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 100);
    const offset = parseInt(req.query.offset || '0', 10);
    const data = await asaas('/payments', { query: { status, limit, offset } });
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, payload: e.payload || null });
  }
});

app.get('/api/customers', apiAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 100);
    const offset = parseInt(req.query.offset || '0', 10);
    const data = await asaas('/customers', { query: { limit, offset } });
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, payload: e.payload || null });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[asaas-dashboard] listening on 0.0.0.0:${PORT}`);
});
