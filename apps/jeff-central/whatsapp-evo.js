// Canais › WhatsApp quando o sistema de SDRs (jeff-sdrs) NÃO está instalado: a tela passa a mostrar os números
// comerciais conectados na Central (Evolution), com as conversas das views zv.* e resposta pelo próprio número.
// Responde no mesmo formato da API do jeff-sdrs que a tela (public/whatsapp.js) espera, em /api/whatsapp/p/*.
// Cada número da Evolution vira um "SDR" (slot 1, 2, ...) só de atendimento: sem IA, disparo ou maturação.
const express = require('express');
const path = require('path');
const { spawn } = require('child_process');

const router = express.Router();
const CONTAINER = process.env.ZV_PG_CONTAINER || 'jeff-evolution-postgres';
const EVO_URL = (process.env.EVOLUTION_URL || 'https://evolution.jefersonhenrike.com').replace(/\/+$/, '');
const EVO_KEY = process.env.EVOLUTION_API_KEY || '{{S:cdc1cedd1294:48:hex}}' // o instalador troca pelo valor do cliente (segredos.tsv);
const WORKER_DB = process.env.WORKER_DB_PATH || '/opt/jeff-worker/data/worker.db';

function psql(sql) {
  return new Promise((ok, falha) => {
    const p = spawn('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'evolution', '-d', 'evolution', '-X', '-q', '-t', '-A', '-F', '\x1f', '-R', '\x1e', '-v', 'ON_ERROR_STOP=1']);
    let out = '', err = '';
    const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch (_) {} falha(new Error('banco não respondeu')); }, 45000);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (c) => { clearTimeout(t); c === 0 ? ok(out.split('\x1e').map((l) => l.replace(/^\n/, '')).filter(Boolean).map((l) => l.split('\x1f'))) : falha(new Error(err.trim().slice(0, 300))); });
    p.stdin.end('BEGIN READ ONLY;\n' + sql + '\nCOMMIT;\n');
  });
}
const lit = (v) => "'" + String(v).replace(/'/g, "''") + "'";
const idOk = (v) => /^[\w@.:+\-]{1,120}$/.test(String(v || ''));
const unix = (s) => s ? Math.floor(new Date(String(s).replace(' ', 'T') + '-03:00').getTime() / 1000) : 0; // zv.* está em BRT

async function evo(method, rota, body) {
  const r = await fetch(EVO_URL + rota, { method, headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.response && JSON.stringify(j.response.message || j.response)) || j.error || 'HTTP ' + r.status);
  return j;
}
function apelidos() {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(WORKER_DB, { readonly: true, fileMustExist: true });
    const m = new Map(db.prepare('SELECT instance_name, friendly_name FROM wa_instance_meta').all().map((r) => [r.instance_name, r.friendly_name]));
    db.close();
    return m;
  } catch (_) { return new Map(); }
}

// slot ↔ instância (ordem estável por nome)
let numeros = [], numerosEm = 0;
let numerosBusca = null;
async function listaNumeros(forca) {
  if (numeros.length && !forca) { if (Date.now() - numerosEm > 60000 && !numerosBusca) numerosBusca = lerNumeros().catch(() => {}).finally(() => { numerosBusca = null; }); return numeros; }
  if (numerosBusca) { await numerosBusca; if (numeros.length) return numeros; }
  return lerNumeros();
}
async function lerNumeros() {
  const inst = await evo('GET', '/instance/fetchInstances');
  const ap = apelidos();
  const vend = new Map((await psql('SELECT nome, coalesce(vendedor, \'\') FROM zv.instancia;').catch(() => [])).map(([n, v]) => [n, v]));
  numeros = (Array.isArray(inst) ? inst : []).map((i) => i.name).sort().map((nome, k) => {
    const i = inst.find((x) => x.name === nome);
    const st = i.connectionStatus === 'open' ? 'ready' : i.connectionStatus === 'connecting' ? 'qr' : 'disconnected';
    return { slot: k + 1, instancia: nome, name: ap.get(nome) || vend.get(nome) || i.profileName || nome, phone: String(i.ownerJid || '').split('@')[0] || '', status: st,
      ai_active: 0, zeus_mode: 0, instructions: '', sdr_mode: 'atendimento', configured: 1, origem: 'evolution' };
  });
  numerosEm = Date.now();
  return numeros;
}
const porSlot = async (slot) => (await listaNumeros()).find((n) => n.slot === +slot);

router.get('/sdrs', async (_req, res) => {
  try { res.json({ sdrs: await listaNumeros(true) }); } catch (e) { res.status(502).json({ error: 'não consegui ler os números da Central: ' + e.message }); }
});

const cacheConv = new Map(); // chave: slot|limite → { em, dados, busca }
router.get('/conversations', async (req, res) => {
  const k = (req.query.slot || '') + '|' + (req.query.limit || ''), c = cacheConv.get(k);
  const ler = () => {
    const ent = cacheConv.get(k) || {};
    if (ent.busca) return ent.busca;
    ent.busca = lerConversas(req.query).then((d) => { cacheConv.set(k, { em: Date.now(), dados: d }); return d; }).finally(() => { const x = cacheConv.get(k); if (x) delete x.busca; });
    cacheConv.set(k, ent);
    return ent.busca;
  };
  try {
    if (c && c.dados) { if (Date.now() - c.em > 20000) ler().catch((e) => console.error('[whatsapp-evo] conversas:', e.message)); return res.json(c.dados); }
    res.json(await ler());
  } catch (e) { res.status(502).json({ error: 'não consegui ler as conversas: ' + e.message }); }
});
async function lerConversas(query) {
  const req = { query };
  {
    const nums = await listaNumeros();
    const filtro = req.query.slot ? nums.filter((n) => n.slot === +req.query.slot) : nums;
    if (!filtro.length) return { conversations: [] };
    const limite = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 300));
    const slotDe = new Map(filtro.map((n) => [n.instancia, n.slot]));
    const lista = filtro.map((n) => lit(n.instancia)).join(',');
    // última mensagem de cada conversa numa passada só (a subconsulta por linha levava ~45 s)
    const rows = await psql(`WITH ult AS (
        SELECT DISTINCT ON (instancia, jid) instancia, jid,
          CASE WHEN texto IS NOT NULL AND texto <> '' THEN left(texto, 160) WHEN is_audio THEN '[áudio]' WHEN is_midia THEN '[' || tipo || ']' ELSE '' END || '\x1d' || from_me::text AS ultima
        FROM zv.msg WHERE NOT is_sistema AND NOT is_group AND instancia IN (${lista}) ORDER BY instancia, jid, ts DESC)
      SELECT c.instancia, c.jid, coalesce(nullif(c.nome, ''), ''), coalesce(c.telefone, ''), to_char(c.ultima_msg, 'YYYY-MM-DD HH24:MI:SS'), c.aguardando_resposta, u.ultima
      FROM zv.conversa c LEFT JOIN ult u ON u.instancia = c.instancia AND u.jid = c.jid
      WHERE NOT c.is_group AND c.instancia IN (${lista})
      ORDER BY c.ultima_msg DESC LIMIT ${limite};`);
    return { conversations: rows.map(([inst, jid, nome, tel, ult, aguard, ultima]) => {
      const [txt, fm] = String(ultima || '').split('\x1d');
      return { slot: slotDe.get(inst), chat_id: jid, contact_name: nome || null, contact_phone: tel || null, last_message: txt || '', last_from_me: fm === 't' ? 1 : 0,
        last_ts: unix(ult), unread: aguard === 't' ? 1 : 0, status: aguard === 't' ? 'aguardando' : 'ok' };
    }) };
  }
}

router.get('/conversations/messages', async (req, res) => {
  const n = await porSlot(req.query.slot).catch(() => null), jid = req.query.chat_id;
  if (!n || !idOk(jid)) return res.status(400).json({ error: 'conversa inválida' });
  const limite = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 300));
  try {
    const rows = await psql(`SELECT * FROM (SELECT id, from_me, coalesce(texto, ''), coalesce(tipo, ''), to_char(ts, 'YYYY-MM-DD HH24:MI:SS'), is_audio, is_midia
      FROM zv.msg WHERE instancia = ${lit(n.instancia)} AND jid = ${lit(jid)} AND NOT is_sistema ORDER BY ts DESC LIMIT ${limite}) x ORDER BY 5;`);
    res.json({ messages: rows.map(([id, fm, texto, tipo, ts, aud, mid]) => ({ id, from_me: fm === 't' ? 1 : 0, body: texto || null,
      type: texto ? 'chat' : aud === 't' ? 'áudio' : mid === 't' ? (tipo || 'mídia') : tipo, ts: unix(ts), status: 'ok' })) });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Resposta enviada pelo próprio número comercial (Evolution)
router.post('/conversations/reply', express.json({ limit: '64kb' }), async (req, res) => {
  const b = req.body || {}, n = await porSlot(b.slot).catch(() => null), texto = String(b.body || '').trim();
  if (!n || !idOk(b.chat_id) || !texto) return res.status(400).json({ error: 'mensagem inválida' });
  if (n.status !== 'ready') return res.status(409).json({ error: 'este número não está conectado' });
  try {
    await evo('POST', '/message/sendText/' + encodeURIComponent(n.instancia), { number: b.chat_id, text: texto.slice(0, 4000) });
    cacheConv.clear();
    console.log('[whatsapp-evo] resposta enviada por', n.instancia, 'para', b.chat_id, 'por', (req.user && req.user.email) || '?');
    res.json({ ok: true });
  } catch (e) { res.status(502).json({ error: 'o WhatsApp não aceitou o envio: ' + e.message }); }
});
router.post('/conversations/mark-read', (_req, res) => res.json({ ok: true }));
router.post('/sdrs/sync-chats', (_req, res) => res.json({ ok: true }));

// Recursos que só existem no sistema de SDRs: respostas neutras para a tela não quebrar
router.get('/sdrs/:slot/ai-stats', (_req, res) => res.json({ used_today: 0, last: [] }));
router.get('/maturation/config', (_req, res) => res.json({ enabled: false, slots: [] }));
router.get('/maturation/log', (_req, res) => res.json({ log: [] }));
router.get('/system/keys', (_req, res) => res.json({ keys: [] }));
router.use((req, res) => res.status(501).json({ error: 'Este recurso é do sistema de SDRs com IA, que não está instalado aqui. Os números comerciais são gerenciados em Conectores › WhatsApp.' }));

module.exports = { router };

// Deixa a lista padrão da tela (todos os números, 300 conversas) pronta logo que a Central sobe
if (process.env.CENTRAL_SEM_AGENDADORES !== '1') {
  setTimeout(() => lerConversas({ limit: '300' }).then((d) => cacheConv.set('|300', { em: Date.now(), dados: d })).catch((e) => console.error('[whatsapp-evo] aquecer:', e.message)), 3000).unref();
}
