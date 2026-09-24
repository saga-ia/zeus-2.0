// Ações: integração real com o ClickUp (workspace ZEUS).
// Token e workspace vêm do app_settings do worker (clickup_api_token / clickup_workspace_id),
// os mesmos usados pelo helper /opt/jeff-worker/scripts/clickup.sh.
const express = require('express');
const Database = require('better-sqlite3');

const WORKER_DB_PATH = process.env.WORKER_DB_PATH || '/opt/jeff-worker/data/worker.db';
const BASE = 'https://api.clickup.com/api/v2';
const CACHE_MS = 60 * 1000;
const MAX_PAGES = 10; // 100 tasks por página

let wdb = null;
try {
  wdb = new Database(WORKER_DB_PATH, { readonly: true, fileMustExist: true, timeout: 5000 });
} catch (e) {
  console.error('[clickup] aviso: nao abriu worker.db:', e.message);
}
const getSetting = (key) => {
  if (!wdb) return null;
  const row = wdb.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? row.value : null;
};

class CuError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function creds() {
  const token = getSetting('clickup_api_token');
  const workspace = getSetting('clickup_workspace_id');
  if (!token) throw new CuError(503, 'Chave clickup_api_token não encontrada no app_settings.');
  if (!workspace) throw new CuError(503, 'clickup_workspace_id não encontrado no app_settings.');
  return { token, workspace };
}

async function api(method, path, body) {
  const { token } = creds();
  const r = await fetch(BASE + path, {
    method,
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j = {};
  try { j = text ? JSON.parse(text) : {}; } catch (e) { j = { raw: text }; }
  if (!r.ok) {
    const msg = j.err || j.error || j.ECODE || ('HTTP ' + r.status);
    throw new CuError(r.status === 429 ? 429 : 502, 'ClickUp: ' + msg);
  }
  return j;
}

// ─── normalização ────────────────────────────────────────────────────────────
const PRIO_LABEL = { 1: 'Urgente', 2: 'Alta', 3: 'Normal', 4: 'Baixa' };
const PRIO_COLOR = { 1: '#C0341C', 2: '#673DE6', 3: '#2459C9', 4: '#66666F' };
const num = (v) => (v == null || v === '' ? null : Number(v));

const normMember = (u) => u && ({
  id: u.id, username: u.username || u.email || String(u.id), initials: u.initials || (u.username || '?').slice(0, 2).toUpperCase(),
  color: u.color || '', avatar: u.profilePicture || null, email: u.email || null,
});

function normTask(t, spacesById) {
  const prio = t.priority ? num(t.priority.id) : null;
  const sp = t.space && spacesById[t.space.id];
  return {
    id: t.id,
    custom_id: t.custom_id || null,
    name: t.name,
    status: t.status ? t.status.status : null,
    status_type: t.status ? t.status.type : null,
    status_color: t.status ? t.status.color : '#87909e',
    priority: prio,
    priority_label: prio ? PRIO_LABEL[prio] : null,
    priority_color: prio ? PRIO_COLOR[prio] : '#B4B4BC',
    due_date: num(t.due_date),
    due_date_time: !!t.due_date_time,
    start_date: num(t.start_date),
    date_created: num(t.date_created),
    date_updated: num(t.date_updated),
    date_closed: num(t.date_closed),
    date_done: num(t.date_done),
    assignees: (t.assignees || []).map(normMember),
    tags: (t.tags || []).map((g) => ({ name: g.name, color: g.tag_bg || g.tag_fg || '#66666F' })),
    list: t.list ? { id: t.list.id, name: t.list.name } : null,
    folder: t.folder && !t.folder.hidden ? { id: t.folder.id, name: t.folder.name } : null,
    space: t.space ? { id: t.space.id, name: sp ? sp.name : null } : null,
    parent: t.parent || null,
    url: t.url,
    description: t.description || '',
  };
}

// ─── overview (estrutura + tasks), com cache de 60s ──────────────────────────
let _cache = null; // { at, data }
let _inflight = null;

async function fetchOverview() {
  const { workspace } = creds();
  const [teams, spacesRes] = await Promise.all([
    api('GET', '/team'),
    api('GET', `/team/${workspace}/space?archived=false`),
  ]);
  const team = (teams.teams || []).find((x) => String(x.id) === String(workspace)) || {};
  const members = (team.members || []).map((m) => normMember(m.user)).filter(Boolean);

  const spaces = [];
  const spacesById = {};
  for (const s of spacesRes.spaces || []) {
    const sp = {
      id: s.id, name: s.name, color: s.color || null,
      statuses: (s.statuses || []).map((st) => ({ status: st.status, type: st.type, color: st.color, order: st.orderindex })),
      folders: [], lists: [],
    };
    spaces.push(sp);
    spacesById[s.id] = sp;
  }

  const normList = (l, spaceId, folder) => ({
    id: l.id, name: l.name, space_id: spaceId, folder_id: folder ? folder.id : null, folder_name: folder ? folder.name : null,
    task_count: num(l.task_count) || 0, override_statuses: !!l.override_statuses, statuses: null,
  });

  await Promise.all(spaces.map(async (sp) => {
    const [fold, loose] = await Promise.all([
      api('GET', `/space/${sp.id}/folder?archived=false`),
      api('GET', `/space/${sp.id}/list?archived=false`),
    ]);
    sp.folders = (fold.folders || []).map((f) => ({
      id: f.id, name: f.name, lists: (f.lists || []).map((l) => normList(l, sp.id, f)),
    }));
    sp.lists = (loose.lists || []).map((l) => normList(l, sp.id, null));
  }));

  // Listas com status próprios: busca os status da lista
  const allLists = [];
  spaces.forEach((sp) => { sp.folders.forEach((f) => allLists.push(...f.lists)); allLists.push(...sp.lists); });
  await Promise.all(allLists.filter((l) => l.override_statuses).map(async (l) => {
    try {
      const d = await api('GET', `/list/${l.id}`);
      l.statuses = (d.statuses || []).map((st) => ({ status: st.status, type: st.type, color: st.color, order: st.orderindex }));
    } catch (e) { l.statuses = null; }
  }));

  // Tasks do workspace (abertas + fechadas), paginado
  const tasks = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await api('GET', `/team/${workspace}/task?archived=false&subtasks=true&include_closed=true&order_by=updated&reverse=true&page=${page}`);
    (r.tasks || []).forEach((t) => tasks.push(normTask(t, spacesById)));
    if (r.last_page !== false || !(r.tasks || []).length) break;
  }

  return { workspace: { id: workspace, name: team.name || 'ZEUS' }, members, spaces, tasks, fetched_at: Date.now() };
}

async function overview(force) {
  if (!force && _cache && Date.now() - _cache.at < CACHE_MS) return _cache.data;
  if (!_inflight) {
    _inflight = fetchOverview().then((data) => { _cache = { at: Date.now(), data }; return data; }).finally(() => { _inflight = null; });
  }
  // Cache vencido mas existente: devolve o que tem na hora e atualiza por trás.
  // A varredura do workspace leva ~1,2s e não pode travar a tela de Ações.
  if (!force && _cache) { _inflight.catch(() => {}); return _cache.data; }
  return _inflight;
}
const invalidate = () => { _cache = null; };

// Aquece o cache no boot: a primeira abertura da tela não paga a varredura inteira.
setTimeout(() => { overview(true).catch(() => {}); }, 4000).unref();

// ─── rotas ───────────────────────────────────────────────────────────────────
const router = express.Router();
const fail = (res, e) => {
  const status = e.status || 500;
  if (status >= 500) console.error('[clickup]', e.message);
  res.status(status).json({ error: e.message });
};
const isId = (v) => /^[A-Za-z0-9_-]{1,40}$/.test(String(v || ''));

router.get('/overview', async (req, res) => {
  try { res.json(await overview(req.query.force === '1')); } catch (e) { fail(res, e); }
});

router.get('/tasks/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'id inválido' });
  try {
    const [t, c] = await Promise.all([
      api('GET', `/task/${req.params.id}?include_subtasks=true`),
      api('GET', `/task/${req.params.id}/comment`),
    ]);
    const ov = _cache ? _cache.data : null;
    const spacesById = {};
    if (ov) ov.spaces.forEach((s) => { spacesById[s.id] = s; });
    const task = normTask(t, spacesById);
    task.subtasks = (t.subtasks || []).map((s) => normTask(s, spacesById));
    const comments = (c.comments || []).map((k) => ({
      id: k.id, text: k.comment_text || '', user: normMember(k.user), date: num(k.date),
    })).sort((a, b) => (a.date || 0) - (b.date || 0));
    res.json({ task, comments });
  } catch (e) { fail(res, e); }
});

// Campos aceitos na criação/edição
function pickTaskFields(b, creating) {
  const out = {};
  if (typeof b.name === 'string') {
    const n = b.name.trim();
    if (!n) throw new CuError(400, 'Título obrigatório.');
    out.name = n.slice(0, 500);
  } else if (creating) throw new CuError(400, 'Título obrigatório.');
  if (typeof b.description === 'string') out.description = b.description.slice(0, 20000);
  if (b.status !== undefined) { if (typeof b.status !== 'string' || !b.status) throw new CuError(400, 'status inválido'); out.status = b.status; }
  if (b.priority !== undefined) {
    if (b.priority === null || b.priority === '' || b.priority === 0) out.priority = null;
    else { const p = Number(b.priority); if (![1, 2, 3, 4].includes(p)) throw new CuError(400, 'priority inválida'); out.priority = p; }
  }
  if (b.due_date !== undefined) {
    if (b.due_date === null || b.due_date === '') { out.due_date = null; }
    else { const d = Number(b.due_date); if (!isFinite(d) || d < 0) throw new CuError(400, 'due_date inválido'); out.due_date = d; out.due_date_time = b.due_date_time !== false; }
  }
  if (b.start_date !== undefined) {
    if (b.start_date === null || b.start_date === '') out.start_date = null;
    else { const d = Number(b.start_date); if (!isFinite(d)) throw new CuError(400, 'start_date inválido'); out.start_date = d; out.start_date_time = true; }
  }
  const ids = (arr) => (Array.isArray(arr) ? arr.map(Number).filter((x) => isFinite(x) && x > 0) : []);
  if (creating) {
    if (b.assignees !== undefined) out.assignees = ids(b.assignees);
    if (Array.isArray(b.tags)) out.tags = b.tags.map(String).slice(0, 20);
  } else if (b.assignees && typeof b.assignees === 'object' && !Array.isArray(b.assignees)) {
    out.assignees = { add: ids(b.assignees.add), rem: ids(b.assignees.rem) };
  }
  return out;
}

router.post('/tasks', async (req, res) => {
  try {
    const b = req.body || {};
    if (!isId(b.list_id)) throw new CuError(400, 'Escolha uma lista.');
    const body = pickTaskFields(b, true);
    const t = await api('POST', `/list/${b.list_id}/task`, body);
    invalidate();
    res.json({ ok: true, task: normTask(t, {}) });
  } catch (e) { fail(res, e); }
});

router.put('/tasks/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'id inválido' });
  try {
    const body = pickTaskFields(req.body || {}, false);
    if (!Object.keys(body).length) throw new CuError(400, 'Nada para atualizar.');
    const t = await api('PUT', `/task/${req.params.id}`, body);
    invalidate();
    res.json({ ok: true, task: normTask(t, {}) });
  } catch (e) { fail(res, e); }
});

router.delete('/tasks/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'id inválido' });
  try {
    await api('DELETE', `/task/${req.params.id}`);
    invalidate();
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

router.post('/tasks/:id/comments', async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'id inválido' });
  try {
    const text = String((req.body || {}).text || '').trim();
    if (!text) throw new CuError(400, 'Comentário vazio.');
    const r = await api('POST', `/task/${req.params.id}/comment`, { comment_text: text.slice(0, 10000), notify_all: true });
    res.json({ ok: true, id: r.id || null });
  } catch (e) { fail(res, e); }
});

module.exports = { router };
