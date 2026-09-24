// Rotinas: pedidos agendados que o ZEUS executa sozinho (igual às "tarefas" do ChatGPT).
// Cada rotina tem instrução, agente opcional, habilidade opcional, frequência e canal de entrega.
// A execução roda como uma conversa normal (chat.runRoutine), então fica salva em Conversas como "Rotina: <nome>".
// Entrega: 'chat' (só a conversa), 'whatsapp' (wapi.sh do worker) ou 'email' (google.sh gmail-send).
// Horários sempre em BRT (UTC-3, sem horário de verão), independente do fuso do servidor.
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const WORKER_DIR = process.env.WORKER_DIR || '/opt/jeff-worker';
const WAPI = path.join(WORKER_DIR, 'scripts', 'wapi.sh');
const GOOGLE = path.join(WORKER_DIR, 'scripts', 'google.sh');
const TICK_MS = 30 * 1000;
const BRT_OFFSET_MS = 3 * 3600 * 1000;
const WA_MAX = 3800; // WhatsApp corta mensagens muito longas: quebra em partes

const db = new Database(path.join(DATA_DIR, 'central.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS rotinas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  agent_id TEXT,
  skill_id TEXT,
  freq TEXT NOT NULL DEFAULT 'diaria',
  hora TEXT NOT NULL DEFAULT '08:00',
  dias TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
  dia_mes INTEGER NOT NULL DEFAULT 1,
  cada_horas INTEGER NOT NULL DEFAULT 6,
  quando TEXT,
  entrega TEXT NOT NULL DEFAULT 'chat',
  destino TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  next_run_at INTEGER,
  last_run_at INTEGER,
  last_status TEXT,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rotina_runs (
  id TEXT PRIMARY KEY,
  rotina_id TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'agenda',
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL DEFAULT 'rodando',
  output TEXT,
  error TEXT,
  session_id TEXT,
  entrega TEXT,
  destino TEXT
);
CREATE INDEX IF NOT EXISTS idx_rotina_runs ON rotina_runs(rotina_id, started_at DESC);
`);
try { db.exec('ALTER TABLE rotinas ADD COLUMN tools TEXT'); } catch (_) {} // coluna nova: ferramentas liberadas pra rotina

// Ferramentas conectadas que uma rotina pode usar. O id vai no banco; o "hint" entra no prompt da execução.
const FERRAMENTAS = [
  { id: 'atividades', label: 'Atividades (tarefas)', hint: 'Atividades/tarefas do time: /opt/jeff-worker/scripts/clickup.sh (rode "clickup.sh ajuda"; Jeff 302403853, Vinicius 55079266).' },
  { id: 'financeiro', label: 'Financeiro', hint: 'Financeiro (cobranças, clientes, recebimentos): /opt/jeff-worker/scripts/asaas.sh (customers, payments, dashboard).' },
  { id: 'google_agenda', label: 'Google Agenda', hint: 'Agenda Google: google.sh calendar-list <user_key> e calendar-create; conta em "google.sh accounts". Horários em BRT.' },
  { id: 'gmail', label: 'Gmail', hint: 'Gmail: google.sh gmail-list <user_key> [busca], gmail-send <user_key> <para> <assunto> <corpo>, gmail-draft. Só envie e-mail se o pedido da rotina mandar.' },
  { id: 'drive', label: 'Drive e Planilhas', hint: 'Google Drive e Sheets: google.sh drive-list, drive-upload, sheets-get <user_key> <sheet_id> <range>, sheets-append.' },
  { id: 'meta_ads', label: 'Meta Ads', hint: 'Mídia paga da Meta Ads (só leitura): /opt/jeff-apps/jeff-central/tools/growth (resumo, campanhas, anuncios, serie, publico; --periodo 7d|30d...). Detalhes brutos: /opt/jeff-worker/scripts/meta-ads.sh.' },
  { id: 'instagram', label: 'Instagram', hint: 'Instagram: /opt/jeff-worker/scripts/instagram.sh (perfil, mídia, comentários, DMs) e /opt/jeff-apps/jeff-central/tools/zeuspost (agenda de posts).' },
  { id: 'whatsapp', label: 'WhatsApp (conversas)', hint: 'Histórico do WhatsApp (só leitura): sqlite3 -readonly /opt/jeff-worker/data/worker.db, tabelas messages (contact_phone, body, transcription, timestamp epoch) e contact_aliases. Envio só se o pedido mandar: wapi.sh POST /messages/private {"to","body"}.' },
  { id: 'internet', label: 'Internet', hint: 'Pesquisa na internet: ferramentas WebSearch e WebFetch (várias buscas, PT-BR e inglês) e /opt/jeff-worker/scripts/apify.sh pra raspagem. Cite as fontes com link.' },
  { id: 'contratos', label: 'Contratos', hint: 'Contratos e assinaturas: /opt/jeff-worker/scripts/zapsign.sh.' },
  { id: 'central', label: 'Dados da Central', hint: 'Dados da própria Central (OKRs, PDIs, pessoas, base de conhecimento, conversas): banco /opt/jeff-apps/jeff-central/data/central.db só leitura, conforme o CLAUDE.md da plataforma.' },
];
const FERR_IDS = FERRAMENTAS.map(f => f.id);
function ferramentasTexto(ids) {
  const sel = FERRAMENTAS.filter(f => (ids || []).includes(f.id));
  if (!sel.length) return '';
  return '=== Ferramentas liberadas pra esta rotina ===\n' + sel.map(f => `- ${f.label}: ${f.hint}`).join('\n')
    + '\nUse essas ferramentas pra buscar dados reais antes de responder. Não invente número; se uma ferramenta falhar, diga qual e siga com o resto.';
}

const stmt = {
  all: db.prepare('SELECT * FROM rotinas ORDER BY enabled DESC, COALESCE(next_run_at, 9e15), name'),
  get: db.prepare('SELECT * FROM rotinas WHERE id = ?'),
  due: db.prepare('SELECT * FROM rotinas WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at'),
  ins: db.prepare(`INSERT INTO rotinas (id, name, prompt, agent_id, skill_id, freq, hora, dias, dia_mes, cada_horas, quando, entrega, destino, tools, enabled, next_run_at, created_at, updated_at)
    VALUES (@id, @name, @prompt, @agent_id, @skill_id, @freq, @hora, @dias, @dia_mes, @cada_horas, @quando, @entrega, @destino, @tools, @enabled, @next_run_at, @now, @now)`),
  upd: db.prepare(`UPDATE rotinas SET name = @name, prompt = @prompt, agent_id = @agent_id, skill_id = @skill_id, freq = @freq, hora = @hora, dias = @dias, dia_mes = @dia_mes,
    cada_horas = @cada_horas, quando = @quando, entrega = @entrega, destino = @destino, tools = @tools, enabled = @enabled, next_run_at = @next_run_at, updated_at = @now WHERE id = @id`),
  setEnabled: db.prepare('UPDATE rotinas SET enabled = ?, next_run_at = ?, updated_at = ? WHERE id = ?'),
  afterRun: db.prepare('UPDATE rotinas SET last_run_at = ?, last_status = ?, last_error = ?, next_run_at = ?, enabled = ?, updated_at = ? WHERE id = ?'),
  del: db.prepare('DELETE FROM rotinas WHERE id = ?'),
  delRuns: db.prepare('DELETE FROM rotina_runs WHERE rotina_id = ?'),
  runIns: db.prepare('INSERT INTO rotina_runs (id, rotina_id, trigger, started_at, status, entrega, destino) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  runFim: db.prepare('UPDATE rotina_runs SET finished_at = ?, status = ?, output = ?, error = ?, session_id = ? WHERE id = ?'),
  runs: db.prepare('SELECT id, rotina_id, trigger, started_at, finished_at, status, substr(output, 1, 400) AS preview, length(output) AS output_len, error, session_id, entrega, destino FROM rotina_runs WHERE rotina_id = ? ORDER BY started_at DESC LIMIT ?'),
  runGet: db.prepare('SELECT * FROM rotina_runs WHERE id = ? AND rotina_id = ?'),
  runsResumo: db.prepare('SELECT rotina_id, COUNT(*) AS n, SUM(status = \'erro\') AS erros FROM rotina_runs GROUP BY rotina_id'),
  runsAbertos: db.prepare(`UPDATE rotina_runs SET status = 'erro', error = 'servidor reiniciou durante a execução', finished_at = ? WHERE status = 'rodando'`),
};

const newId = () => crypto.randomBytes(8).toString('hex');
const FREQS = ['diaria', 'semanal', 'mensal', 'horas', 'unica'];
const ENTREGAS = ['chat', 'whatsapp', 'email'];

// ─── Horários em BRT ───────────────────────────────────────────────────────────
// brt(ms) devolve um Date cujos campos getUTC* são a hora de Brasília; fromBrt faz o caminho de volta.
const brt = (ms) => new Date(ms - BRT_OFFSET_MS);
const fromBrt = (y, m, d, h, mi) => Date.UTC(y, m, d, h, mi, 0, 0) + BRT_OFFSET_MS;
const parseHora = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); return m ? [Math.min(23, +m[1]), Math.min(59, +m[2])] : [8, 0]; };
const diaSemana = (d) => { const w = d.getUTCDay(); return w === 0 ? 7 : w; }; // 1 = segunda ... 7 = domingo

// Próxima execução estritamente depois de `from` (epoch ms). null = não roda mais.
function nextRunAt(r, from) {
  const [h, mi] = parseHora(r.hora);
  const b = brt(from);
  const y = b.getUTCFullYear(), mo = b.getUTCMonth(), d = b.getUTCDate();
  if (r.freq === 'diaria') {
    let t = fromBrt(y, mo, d, h, mi);
    if (t <= from) t = fromBrt(y, mo, d + 1, h, mi);
    return t;
  }
  if (r.freq === 'semanal') {
    let dias = [];
    try { dias = JSON.parse(r.dias || '[]').map(Number).filter(x => x >= 1 && x <= 7); } catch (_) {}
    if (!dias.length) dias = [1, 2, 3, 4, 5];
    for (let i = 0; i <= 7; i++) {
      const t = fromBrt(y, mo, d + i, h, mi);
      if (t > from && dias.includes(diaSemana(brt(t)))) return t;
    }
    return null;
  }
  if (r.freq === 'mensal') {
    const dm = Math.max(1, Math.min(28, +r.dia_mes || 1));
    let t = fromBrt(y, mo, dm, h, mi);
    if (t <= from) t = fromBrt(y, mo + 1, dm, h, mi);
    return t;
  }
  if (r.freq === 'horas') {
    const n = Math.max(1, Math.min(168, +r.cada_horas || 6));
    return from + n * 3600 * 1000;
  }
  if (r.freq === 'unica') {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(r.quando || ''));
    if (!m) return null;
    const t = fromBrt(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    return t > from ? t : null;
  }
  return null;
}

// ─── Validação do formulário ───────────────────────────────────────────────────
class RotinaError extends Error { constructor(msg) { super(msg); this.status = 400; } }
function normalizar(body, atual) {
  const b = body || {};
  const name = String(b.name || '').trim().slice(0, 80);
  const prompt = String(b.prompt || '').trim().slice(0, 6000);
  if (!name) throw new RotinaError('dê um nome pra rotina');
  if (!prompt) throw new RotinaError('escreva o que o ZEUS deve fazer');
  const freq = FREQS.includes(b.freq) ? b.freq : 'diaria';
  const entrega = ENTREGAS.includes(b.entrega) ? b.entrega : 'chat';
  let destino = String(b.destino || '').trim();
  if (entrega === 'whatsapp') {
    destino = destino.replace(/\D/g, '').replace(/^0+/, '');
    if (destino.length === 10 || destino.length === 11) destino = '55' + destino;
    if (destino.length < 12 || destino.length > 13) throw new RotinaError('número de WhatsApp inválido: use DDD + número (ex.: 81999998888)');
  } else if (entrega === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) throw new RotinaError('e-mail de destino inválido');
  } else destino = null;
  let dias = Array.isArray(b.dias) ? b.dias.map(Number).filter(x => x >= 1 && x <= 7) : null;
  if (freq === 'semanal' && (!dias || !dias.length)) throw new RotinaError('escolha pelo menos um dia da semana');
  const quando = freq === 'unica' ? String(b.quando || '').slice(0, 16) : null;
  if (freq === 'unica' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(quando || '')) throw new RotinaError('informe data e hora da execução única');
  const agentId = b.agent_id ? String(b.agent_id) : null;
  if (agentId && !require('./agents').getAgent(agentId)) throw new RotinaError('agente não encontrado');
  const skillId = b.skill_id ? String(b.skill_id) : null;
  if (skillId && !require('./skills').find(skillId)) throw new RotinaError('habilidade não encontrada');
  const r = {
    id: atual ? atual.id : newId(),
    name, prompt, agent_id: agentId, skill_id: skillId, freq,
    hora: parseHora(b.hora).map(x => String(x).padStart(2, '0')).join(':'),
    dias: JSON.stringify(dias && dias.length ? dias : [1, 2, 3, 4, 5]),
    dia_mes: Math.max(1, Math.min(28, parseInt(b.dia_mes, 10) || 1)),
    cada_horas: Math.max(1, Math.min(168, parseInt(b.cada_horas, 10) || 6)),
    quando, entrega, destino,
    tools: JSON.stringify((Array.isArray(b.tools) ? b.tools : []).map(String).filter(t => FERR_IDS.includes(t))),
    enabled: b.enabled === false || b.enabled === 0 || b.enabled === '0' ? 0 : 1,
    now: Date.now(),
  };
  r.next_run_at = r.enabled ? nextRunAt(r, r.now) : null;
  if (r.enabled && r.next_run_at === null && freq === 'unica') throw new RotinaError('a data da execução única já passou');
  return r;
}

// ─── Entrega ───────────────────────────────────────────────────────────────────
function sh(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile('bash', [cmd].concat(args), { timeout: timeoutMs || 60000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || stdout || err.message).toString().trim().slice(-500)));
      resolve((stdout || '').toString());
    });
  });
}
// Markdown do chat → texto que o WhatsApp entende (negrito com um asterisco, sem cercas de código nem títulos)
function paraWhatsApp(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#{1,6}\s+(.*)$/gm, '*$1*')
    .replace(/\*\*([^*\n]+)\*\*/g, '*$1*')
    .replace(/^\s*[-•]\s+/gm, '• ')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1: $2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function partes(txt, max) {
  const out = [];
  let resto = txt;
  while (resto.length > max) {
    let corte = resto.lastIndexOf('\n\n', max);
    if (corte < max * 0.5) corte = resto.lastIndexOf('\n', max);
    if (corte < max * 0.5) corte = max;
    out.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) out.push(resto);
  return out;
}
let _googleUser = null;
async function googleUserKey() {
  if (process.env.GOOGLE_USER_KEY) return process.env.GOOGLE_USER_KEY;
  if (_googleUser) return _googleUser;
  const out = await sh(GOOGLE, ['accounts'], 30000);
  const linha = out.split('\n').map(l => l.trim()).find(l => /^[^\s@]+@[^\s@]+\.[^\s@]+\s/.test(l) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l));
  if (!linha) throw new Error('nenhuma conta Google conectada (google.sh accounts)');
  _googleUser = linha.split(/\s+/)[0];
  return _googleUser;
}
async function entregar(r, texto) {
  if (r.entrega === 'whatsapp') {
    const corpo = `*Rotina: ${r.name}*\n\n` + paraWhatsApp(texto);
    for (const p of partes(corpo, WA_MAX)) {
      await sh(WAPI, ['POST', '/messages/private', JSON.stringify({ to: r.destino, body: p })], 60000);
    }
    return;
  }
  if (r.entrega === 'email') {
    const uk = await googleUserKey();
    const b = brt(Date.now());
    const assunto = `Rotina: ${r.name} (${String(b.getUTCDate()).padStart(2, '0')}/${String(b.getUTCMonth() + 1).padStart(2, '0')})`;
    await sh(GOOGLE, ['gmail-send', uk, r.destino, assunto, paraWhatsApp(texto).replace(/\*([^*\n]+)\*/g, '$1')], 90000);
  }
}

// ─── Execução (uma por vez, fila em memória) ───────────────────────────────────
const fila = [];
const naFila = new Set();
let rodando = false;
function enfileirar(id, trigger) {
  if (naFila.has(id)) return false;
  naFila.add(id); fila.push({ id, trigger });
  processar();
  return true;
}
async function processar() {
  if (rodando) return;
  rodando = true;
  try {
    while (fila.length) {
      const { id, trigger } = fila.shift();
      try { await executar(id, trigger); }
      catch (e) { console.error('[rotinas] falha inesperada', id, e.message); }
      finally { naFila.delete(id); }
    }
  } finally { rodando = false; }
}
async function executar(id, trigger) {
  const r = stmt.get.get(id);
  if (!r) return;
  const runId = newId();
  const inicio = Date.now();
  stmt.runIns.run(runId, r.id, trigger, inicio, 'rodando', r.entrega, r.destino);
  console.log(`[rotinas] "${r.name}" começou (${trigger})`);
  let status = 'ok', erro = null, texto = '', sid = null;
  try {
    const res = await require('./chat').runRoutine({ title: r.name, text: r.prompt, agentId: r.agent_id, skillId: r.skill_id, entrega: r.entrega, ferramentas: ferramentasTexto(publica(r).tools) });
    sid = res.sid; texto = res.text || '';
    if (res.error) { status = 'erro'; erro = res.error; }
    else if (r.entrega !== 'chat') {
      try { await entregar(r, texto); }
      catch (e) { status = 'erro'; erro = 'resposta pronta, mas a entrega por ' + r.entrega + ' falhou: ' + e.message; }
    }
  } catch (e) { status = 'erro'; erro = e.message; }
  const fim = Date.now();
  stmt.runFim.run(fim, status, texto, erro, sid, runId);
  // Próxima execução: sempre a partir de agora (rotina de horas conta do fim da última; unica desliga)
  const atual = stmt.get.get(id);
  if (atual) {
    let prox = atual.next_run_at, enabled = atual.enabled;
    if (trigger === 'agenda' || prox === null || prox <= fim) {
      prox = atual.freq === 'unica' ? null : nextRunAt(atual, fim);
      if (atual.freq === 'unica') enabled = 0;
    }
    stmt.afterRun.run(fim, status, erro, prox, enabled, fim, id);
  }
  console.log(`[rotinas] "${r.name}" terminou em ${((fim - inicio) / 1000).toFixed(0)}s: ${status}${erro ? ' (' + erro.slice(0, 120) + ')' : ''}`);
}

let _timer = null;
function tick() {
  try {
    const agora = Date.now();
    stmt.due.all(agora).forEach(r => {
      // Se o servidor ficou fora por mais de 12 h, não dispara rotinas velhas: só recalcula a próxima
      if (agora - r.next_run_at > 12 * 3600 * 1000) {
        stmt.setEnabled.run(1, nextRunAt(r, agora), agora, r.id);
        return;
      }
      enfileirar(r.id, 'agenda');
    });
  } catch (e) { console.error('[rotinas] tick', e.message); }
}
function startScheduler() {
  if (_timer) return;
  try { stmt.runsAbertos.run(Date.now()); } catch (_) {}
  _timer = setInterval(tick, TICK_MS);
  setTimeout(tick, 5000);
  console.log('[rotinas] agendador ligado');
}

// ─── API ───────────────────────────────────────────────────────────────────────
function publica(r, resumo) {
  const s = (resumo && resumo[r.id]) || { n: 0, erros: 0 };
  return {
    id: r.id, name: r.name, prompt: r.prompt, agent_id: r.agent_id, skill_id: r.skill_id, freq: r.freq, hora: r.hora,
    dias: (() => { try { return JSON.parse(r.dias || '[]'); } catch (_) { return []; } })(),
    dia_mes: r.dia_mes, cada_horas: r.cada_horas, quando: r.quando, entrega: r.entrega, destino: r.destino,
    tools: (() => { try { return JSON.parse(r.tools || '[]'); } catch (_) { return []; } })(),
    enabled: !!r.enabled, next_run_at: r.next_run_at, last_run_at: r.last_run_at, last_status: r.last_status, last_error: r.last_error,
    rodando: naFila.has(r.id), runs: s.n, erros: s.erros, created_at: r.created_at, updated_at: r.updated_at,
  };
}
const router = express.Router();
router.use(express.json({ limit: '1mb' }));

router.get('/', (_req, res) => {
  const resumo = {};
  stmt.runsResumo.all().forEach(x => { resumo[x.rotina_id] = x; });
  res.json({ rotinas: stmt.all.all().map(r => publica(r, resumo)), ferramentas: FERRAMENTAS.map(f => ({ id: f.id, label: f.label })), agora: Date.now() });
});
router.post('/', (req, res) => {
  try {
    const r = normalizar(req.body, null);
    stmt.ins.run(r);
    res.json({ rotina: publica(stmt.get.get(r.id)) });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
router.put('/:id', (req, res) => {
  const atual = stmt.get.get(req.params.id);
  if (!atual) return res.status(404).json({ error: 'rotina não encontrada' });
  try {
    const r = normalizar(req.body, atual);
    stmt.upd.run(r);
    res.json({ rotina: publica(stmt.get.get(r.id)) });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
router.post('/:id/ativar', (req, res) => {
  const r = stmt.get.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'rotina não encontrada' });
  const on = !!(req.body && req.body.enabled);
  const agora = Date.now();
  const prox = on ? nextRunAt(r, agora) : null;
  if (on && prox === null) return res.status(400).json({ error: r.freq === 'unica' ? 'a data desta rotina já passou: edite a data antes de ativar' : 'não foi possível calcular a próxima execução' });
  stmt.setEnabled.run(on ? 1 : 0, prox, agora, r.id);
  res.json({ rotina: publica(stmt.get.get(r.id)) });
});
router.post('/:id/rodar', (req, res) => {
  const r = stmt.get.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'rotina não encontrada' });
  const ok = enfileirar(r.id, 'manual');
  res.json({ ok, rodando: true, jaEstava: !ok });
});
router.get('/:id/runs', (req, res) => {
  if (!stmt.get.get(req.params.id)) return res.status(404).json({ error: 'rotina não encontrada' });
  res.json({ runs: stmt.runs.all(req.params.id, Math.min(50, parseInt(req.query.limit, 10) || 20)) });
});
router.get('/:id/runs/:rid', (req, res) => {
  const run = stmt.runGet.get(req.params.rid, req.params.id);
  if (!run) return res.status(404).json({ error: 'execução não encontrada' });
  res.json({ run });
});
router.delete('/:id', (req, res) => {
  if (!stmt.get.get(req.params.id)) return res.status(404).json({ error: 'rotina não encontrada' });
  stmt.delRuns.run(req.params.id);
  stmt.del.run(req.params.id);
  res.json({ ok: true });
});

// ─── Uso por outros processos (tools/rotina, chamado pelo ZEUS no chat) ────────
// O agendador vive no servidor e lê o banco a cada 30 s, então criar/editar por aqui já vale.
function listar(){ const resumo = {}; stmt.runsResumo.all().forEach(x => { resumo[x.rotina_id] = x; }); return stmt.all.all().map(r => publica(r, resumo)); }
function criar(body){ const r = normalizar(body, null); stmt.ins.run(r); return publica(stmt.get.get(r.id)); }
function atualizar(id, patch){
  const atual = stmt.get.get(id); if (!atual) throw new RotinaError('rotina não encontrada');
  const base = publica(atual); const r = normalizar(Object.assign({}, base, patch || {}), atual); stmt.upd.run(r); return publica(stmt.get.get(id));
}
function ativar(id, on){
  const r = stmt.get.get(id); if (!r) throw new RotinaError('rotina não encontrada');
  const agora = Date.now(); const prox = on ? nextRunAt(r, agora) : null;
  if (on && prox === null) throw new RotinaError('a data desta rotina já passou');
  stmt.setEnabled.run(on ? 1 : 0, prox, agora, id); return publica(stmt.get.get(id));
}
function excluir(id){ if (!stmt.get.get(id)) throw new RotinaError('rotina não encontrada'); stmt.delRuns.run(id); stmt.del.run(id); return true; }
function execucoes(id, n){ return stmt.runs.all(id, n || 10); }

module.exports = { router, startScheduler, nextRunAt, listar, criar, atualizar, ativar, excluir, execucoes, _paraWhatsApp: paraWhatsApp };
