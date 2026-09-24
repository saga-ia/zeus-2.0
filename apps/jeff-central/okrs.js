// OKRs: ciclos, objetivos (com desdobramento pai → filho), resultados-chave com valores de/para/atual,
// check-ins com histórico e geração com IA. Progresso do objetivo = média dos KRs (ou dos filhos, quando não tem KR).
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const claudeSpawn = require('./claude-spawn');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const db = new Database(path.join(DATA_DIR, 'central.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS okr_cycles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE TABLE IF NOT EXISTS okr_objectives (
  id TEXT PRIMARY KEY,
  cycle_id TEXT,
  parent_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  area_id TEXT,
  team_id TEXT,
  owner TEXT,
  period TEXT NOT NULL DEFAULT 'trimestral',
  start_date TEXT,
  end_date TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_okr_obj_cycle ON okr_objectives(cycle_id, sort);
CREATE TABLE IF NOT EXISTS okr_krs (
  id TEXT PRIMARY KEY,
  objective_id TEXT NOT NULL,
  title TEXT NOT NULL,
  from_value REAL NOT NULL DEFAULT 0,
  to_value REAL NOT NULL DEFAULT 100,
  current_value REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '%',
  due_date TEXT,
  owner TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_okr_krs ON okr_krs(objective_id, sort);
CREATE TABLE IF NOT EXISTS okr_checkins (
  id TEXT PRIMARY KEY,
  kr_id TEXT NOT NULL,
  date TEXT NOT NULL,
  value REAL NOT NULL,
  note TEXT,
  author TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_okr_checkins ON okr_checkins(kr_id, date);
`);

const ME = process.env.PDI_ME || 'Vinícius Nunes';
const PERIODS = ['mensal', 'trimestral', 'semestral', 'anual'];
const UNITS = ['%', 'R$', 'número', 'pp', 'dias', 'pontos', 'un'];
const STALE_DAYS = 10;
const newId = () => crypto.randomBytes(8).toString('base64url');
const parseJSON = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const hoje = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); // BRT
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const txt = (v, n) => (v === undefined || v === null) ? undefined : String(v).trim().slice(0, n);
const dataOk = v => (v === undefined) ? undefined : (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null);
// Aceita "1.200.000,50", "3,5" e "3.5"; vírgula presente = formato BR (ponto vira separador de milhar)
const num = v => { if (v === undefined || v === null || v === '') return undefined; let s = String(v).trim().replace(/\s/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const n = parseFloat(s); return Number.isFinite(n) ? n : undefined; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const stmt = {
  cycles: db.prepare(`SELECT * FROM okr_cycles ORDER BY start_date DESC`),
  cycle: db.prepare(`SELECT * FROM okr_cycles WHERE id = ?`),
  cycleAtivo: db.prepare(`SELECT * FROM okr_cycles WHERE status = 'ativo' ORDER BY start_date DESC LIMIT 1`),
  objs: db.prepare(`SELECT * FROM okr_objectives WHERE cycle_id IS ? ORDER BY sort, created_at`),
  objsAll: db.prepare(`SELECT * FROM okr_objectives ORDER BY sort, created_at`),
  obj: db.prepare(`SELECT * FROM okr_objectives WHERE id = ?`),
  krs: db.prepare(`SELECT * FROM okr_krs WHERE objective_id = ? ORDER BY sort, created_at`),
  kr: db.prepare(`SELECT * FROM okr_krs WHERE id = ?`),
  checkins: db.prepare(`SELECT * FROM okr_checkins WHERE kr_id = ? ORDER BY date DESC, created_at DESC`),
  ultimoCheckin: db.prepare(`SELECT * FROM okr_checkins WHERE kr_id = ? ORDER BY date DESC, created_at DESC LIMIT 1`),
  members: db.prepare(`SELECT id, name, role, area_id, team_id, status FROM org_members ORDER BY name COLLATE NOCASE`),
  units: db.prepare(`SELECT id, kind, name, area_id FROM org_units ORDER BY kind, sort, name COLLATE NOCASE`),
};

// ─── Cálculos ────────────────────────────────────────────────────────────────
function krProgress(k) {
  const span = k.to_value - k.from_value;
  if (!span) return k.current_value >= k.to_value ? 100 : 0;
  return clamp(Math.round(100 * (k.current_value - k.from_value) / span), 0, 100);
}
function esperado(inicio, fim, d) {
  if (!inicio || !fim || fim <= inicio) return null;
  return clamp(Math.round(100 * (Date.parse(d) - Date.parse(inicio)) / (Date.parse(fim) - Date.parse(inicio))), 0, 100);
}
function krOut(k, d, ciclo) {
  const last = stmt.ultimoCheckin.get(k.id);
  const progress = krProgress(k);
  const lastDate = last ? last.date : null;
  const diasSem = lastDate ? dias(lastDate, d) : dias(new Date(k.created_at).toISOString().slice(0, 10), d);
  const fim = k.due_date || (ciclo && ciclo.end_date) || null;
  const ini = ciclo ? ciclo.start_date : new Date(k.created_at).toISOString().slice(0, 10);
  const exp = esperado(ini, fim, d);
  let status = 'em_andamento';
  if (progress >= 100) status = 'concluido';
  else if (fim && fim < d) status = 'atrasado';
  else if (exp !== null && exp - progress > 25) status = 'atrasado';
  else if (exp !== null && exp - progress > 10) status = 'em_risco';
  else if (progress === 0 && !last) status = 'nao_iniciado';
  return { id: k.id, objectiveId: k.objective_id, title: k.title, from: k.from_value, to: k.to_value, current: k.current_value, unit: k.unit,
    dueDate: k.due_date, owner: k.owner || '', progress, expected: exp, status, lastUpdate: lastDate, daysSinceUpdate: diasSem, stale: diasSem > STALE_DAYS && progress < 100,
    updatedAt: k.updated_at };
}
// Monta a lista de objetivos do ciclo com progresso, status e árvore (filhos)
function objetivosDoCiclo(ciclo, d) {
  const rows = ciclo ? stmt.objs.all(ciclo.id) : stmt.objs.all(null);
  const byId = {};
  rows.forEach(o => { byId[o.id] = { row: o, krs: stmt.krs.all(o.id).map(k => krOut(k, d, ciclo)), children: [] }; });
  rows.forEach(o => { if (o.parent_id && byId[o.parent_id]) byId[o.parent_id].children.push(o.id); });
  const memo = {};
  function progresso(id) {
    if (memo[id] !== undefined) return memo[id];
    const n = byId[id];
    let p = 0;
    if (n.krs.length) p = Math.round(n.krs.reduce((s, k) => s + k.progress, 0) / n.krs.length);
    else if (n.children.length) p = Math.round(n.children.reduce((s, c) => s + progresso(c), 0) / n.children.length);
    memo[id] = p; return p;
  }
  function ultimaAtualizacao(id) {
    const n = byId[id];
    const datas = n.krs.map(k => k.lastUpdate).filter(Boolean).concat(n.children.map(ultimaAtualizacao).filter(Boolean));
    return datas.length ? datas.sort().slice(-1)[0] : null;
  }
  const out = rows.map(o => {
    const n = byId[o.id];
    const progress = progresso(o.id);
    const ini = o.start_date || (ciclo && ciclo.start_date) || null;
    const fim = o.end_date || (ciclo && ciclo.end_date) || null;
    const exp = esperado(ini, fim, d);
    const last = ultimaAtualizacao(o.id);
    const temConteudo = n.krs.length || n.children.length;
    let status = 'em_andamento';
    if (!temConteudo) status = 'nao_iniciado';
    else if (progress >= 100) status = 'concluido';
    else if (fim && fim < d) status = 'atrasado';
    else if (exp !== null && exp - progress > 25) status = 'atrasado';
    else if (exp !== null && exp - progress > 10) status = 'em_risco';
    else if (progress === 0 && !last) status = 'nao_iniciado';
    const gap = exp === null ? null : progress - exp;
    return { id: o.id, cycleId: o.cycle_id, parentId: o.parent_id || null, title: o.title, description: o.description || '', areaId: o.area_id || null, teamId: o.team_id || null,
      owner: o.owner || '', period: o.period, startDate: o.start_date, endDate: o.end_date, progress, expected: exp, gap, status,
      krs: n.krs, krsTotal: n.krs.length, krsDone: n.krs.filter(k => k.status === 'concluido').length, krsStale: n.krs.filter(k => k.stale).length,
      children: n.children.slice(), lastUpdate: last, daysSinceUpdate: last ? dias(last, d) : null, createdAt: o.created_at, updatedAt: o.updated_at };
  });
  return out;
}
// Linha do tempo: progresso médio dos objetivos de topo em cada data de check-in (valor vigente na data)
function timeline(ciclo, objetivos, d) {
  if (!ciclo) return [];
  const krIds = objetivos.flatMap(o => o.krs.map(k => k.id));
  if (!krIds.length) return [];
  const hist = db.prepare(`SELECT kr_id, date, value FROM okr_checkins WHERE kr_id IN (${krIds.map(() => '?').join(',')}) ORDER BY date, created_at`).all(...krIds);
  const datas = [...new Set(hist.map(h => h.date))].filter(x => x >= ciclo.start_date && x <= d).sort();
  const krRow = {}; objetivos.forEach(o => o.krs.forEach(k => { krRow[k.id] = k; }));
  const pontos = [{ date: ciclo.start_date, real: 0 }];
  datas.forEach(dt => {
    const val = {}; krIds.forEach(id => { val[id] = krRow[id].from; });
    hist.filter(h => h.date <= dt).forEach(h => { val[h.kr_id] = h.value; });
    const progObj = {};
    const calc = o => {
      if (progObj[o.id] !== undefined) return progObj[o.id];
      let p = 0;
      if (o.krs.length) p = o.krs.reduce((s, k) => { const span = k.to - k.from; return s + (span ? clamp(100 * (val[k.id] - k.from) / span, 0, 100) : (val[k.id] >= k.to ? 100 : 0)); }, 0) / o.krs.length;
      else if (o.children.length) p = o.children.reduce((s, c) => s + calc(objetivos.find(x => x.id === c)), 0) / o.children.length;
      progObj[o.id] = p; return p;
    };
    const topo = objetivos.filter(o => !o.parentId);
    const media = topo.length ? topo.reduce((s, o) => s + calc(o), 0) / topo.length : 0;
    pontos.push({ date: dt, real: Math.round(media) });
  });
  return pontos;
}
function cycleOut(c, d) {
  const total = dias(c.start_date, c.end_date);
  return { id: c.id, name: c.name, startDate: c.start_date, endDate: c.end_date, status: c.status, expected: esperado(c.start_date, c.end_date, d),
    daysLeft: Math.max(0, dias(d, c.end_date)), daysTotal: total, closedAt: c.closed_at };
}
function touch(objId) { db.prepare(`UPDATE okr_objectives SET updated_at = ? WHERE id = ?`).run(Date.now(), objId); }

// ─── Seed: ciclo atual com objetivos de exemplo ───────────────────────────────
(function seed() {
  if (db.prepare(`SELECT COUNT(*) AS n FROM okr_cycles`).get().n) return;
  const now = Date.now(), d = hoje();
  const ano = d.slice(0, 4), mes = parseInt(d.slice(5, 7), 10);
  const tri = Math.floor((mes - 1) / 3); // 0..3
  const ini = `${ano}-${String(tri * 3 + 1).padStart(2, '0')}-01`;
  const fimMes = tri * 3 + 3;
  const fim = `${ano}-${String(fimMes).padStart(2, '0')}-${new Date(Date.UTC(+ano, fimMes, 0)).getUTCDate()}`;
  const nomesMes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const cid = newId();
  db.prepare(`INSERT INTO okr_cycles (id, name, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, 'ativo', ?)`)
    .run(cid, `${tri + 1}º Ciclo ${ano} (${nomesMes[tri * 3]}–${nomesMes[tri * 3 + 2]})`, ini, fim, now);
  const areas = {}; stmt.units.all().filter(u => u.kind === 'area').forEach(u => { areas[u.name] = u.id; });
  const insO = db.prepare(`INSERT INTO okr_objectives (id, cycle_id, parent_id, title, description, area_id, team_id, owner, period, start_date, end_date, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'trimestral', ?, ?, ?, ?, ?)`);
  const insK = db.prepare(`INSERT INTO okr_krs (id, objective_id, title, from_value, to_value, current_value, unit, due_date, owner, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insC = db.prepare(`INSERT INTO okr_checkins (id, kr_id, date, value, note, author, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  // [título, descrição, área, dono, pai, KRs: [título, de, para, atual, unidade, dias sem update]]
  const T = [
    ['Acelerar o crescimento comercial no trimestre', 'Objetivo da empresa: crescer receita nova com previsibilidade.', 'Gestão', ME, null, []],
    ['Construir uma base de clientes que fica e cresce', 'Objetivo da empresa: retenção e expansão da base.', 'Gestão', ME, null, []],
    ['Estruturar a operação comercial', 'Processo e ferramentas do time comercial no lugar.', 'Vendas', 'Ana Beatriz Costa', null, [
      ['Playbook comercial publicado e em uso', 0, 1, 1, 'un', 3], ['Funil padronizado no CRM (etapas com critério)', 0, 100, 100, '%', 3]]],
    ['Lançar a nova proposta de valor', 'Nova narrativa de produto no site e no pitch.', 'Marketing', 'Rafael Almeida', null, [
      ['Nova página publicada', 0, 1, 1, 'un', 5], ['Pitch atualizado com o time comercial', 0, 100, 100, '%', 5]]],
    ['Bater a meta de pipeline e conversão', '', 'Vendas', 'Ana Beatriz Costa', 0, [
      ['Ticket médio', 900, 1200, 1050, 'R$', 24], ['Pipeline gerado no trimestre', 1200000, 2000000, 1500000, 'R$', 24], ['Conversão SQL → ganho', 18, 28, 21, '%', 24]]],
    ['Escalar geração de leads qualificados', '', 'Marketing', 'Rafael Almeida', 0, [
      ['MQLs por mês', 800, 1500, 1100, 'un', 24], ['CPL', 45, 30, 39, 'R$', 24], ['Tráfego orgânico (índice)', 100, 140, 118, 'pontos', 24]]],
    ['Elevar retenção e expansão', '', 'Pós-vendas', 'Fernanda Lima', 1, [
      ['Churn mensal', 3.5, 2.0, 3.1, '%', 24], ['Net Revenue Retention', 104, 115, 107, '%', 24], ['NPS', 62, 75, 66, 'pontos', 24]]],
    ['Entregar o roadmap de ativação', '', 'Produto', 'Bruno Souza', 1, [
      ['Ativação D7', 42, 60, 52, '%', 24], ['Tempo de onboarding (dias)', 9, 4, 6, 'dias', 24], ['Bugs críticos abertos', 12, 3, 7, 'un', 24]]],
  ];
  const ids = [];
  db.transaction(() => {
    T.forEach((t, i) => {
      const id = newId(); ids.push(id);
      insO.run(id, cid, t[4] === null ? null : ids[t[4]], t[0], t[1], areas[t[2]] || null, t[3], ini, fim, i, now, now);
      t[5].forEach((k, j) => {
        const kid = newId();
        insK.run(kid, id, k[0], k[1], k[2], k[3], k[4], fim, t[3], j, now, now);
        // Histórico: 3 check-ins subindo até o valor atual, o último há "k[5]" dias
        const passos = 3;
        for (let s = 1; s <= passos; s++) {
          const v = k[1] + (k[3] - k[1]) * s / passos;
          const dt = somaDias(d, -k[5] - (passos - s) * 12);
          if (dt >= ini) insC.run(newId(), kid, dt, Math.round(v * 100) / 100, s === passos ? 'Atualização do check-in semanal.' : '', t[3], now);
        }
      });
    });
  })();
})();

// ─── IA (claude -p, só texto) ────────────────────────────────────────────────
const ASSIST_DIR = path.join(DATA_DIR, 'assist-workdir');
const ASSIST_NO_TOOLS = 'Bash Edit Write NotebookEdit WebFetch WebSearch Task Agent Read Glob Grep';
if (!fs.existsSync(ASSIST_DIR)) fs.mkdirSync(ASSIST_DIR, { recursive: true });
function claudeTexto(prompt, model) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const p = spawn(claudeSpawn.CLAUDE_BIN, ['-p', '--output-format', 'text', '--model', model || 'sonnet', '--disallowedTools', ASSIST_NO_TOOLS, ...claudeSpawn.commonArgs({ light: true })],
      { cwd: ASSIST_DIR, stdio: ['pipe', 'pipe', 'pipe'], env: claudeSpawn.claudeEnv() });
    let out = '', err = '';
    const t = setTimeout(() => { try { p.kill('SIGTERM'); } catch (_) {} }, 150000);
    p.stdout.on('data', x => { out += x; });
    p.stderr.on('data', x => { err += x; });
    p.on('close', code => { clearTimeout(t); if (!out.trim()) return reject(new Error(err.slice(-300) || 'claude saiu com código ' + code)); resolve(out); });
    p.on('error', e => { clearTimeout(t); reject(e); });
    p.stdin.on('error', () => {});
    p.stdin.end(prompt);
  });
}
function jsonDe(s) { const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b <= a) return null; return parseJSON(s.slice(a, b + 1), null); }
function cleanKrs(list) {
  return (Array.isArray(list) ? list : []).slice(0, 8).map(k => ({
    title: String(k.title || '').trim().slice(0, 200), from: num(k.from) ?? 0, to: num(k.to) ?? 100,
    unit: UNITS.includes(String(k.unit)) ? String(k.unit) : (String(k.unit || '').trim().slice(0, 12) || '%'), dueDate: dataOk(k.dueDate) || null,
  })).filter(k => k.title);
}
function empresaCtx() {
  const emp = parseJSON((db.prepare(`SELECT data FROM config_kv WHERE section = 'empresa'`).get() || {}).data, {});
  const areas = stmt.units.all().filter(u => u.kind === 'area').map(u => u.name);
  return { nome: emp.nome || 'a empresa', segmento: emp.segmento || '', areas };
}

// ─── Router ──────────────────────────────────────────────────────────────────
const router = express.Router();
const erro = (res, code, msg) => res.status(code).json({ error: msg });

function payload(cycleId) {
  const d = hoje();
  const ciclos = stmt.cycles.all();
  let ciclo = cycleId ? stmt.cycle.get(cycleId) : null;
  if (!ciclo) ciclo = stmt.cycleAtivo.get() || ciclos[0] || null;
  const objetivos = objetivosDoCiclo(ciclo, d);
  const ativos = objetivos.filter(o => o.status !== 'concluido');
  const krs = objetivos.flatMap(o => o.krs);
  const topo = objetivos.filter(o => !o.parentId);
  const mediaReal = topo.length ? Math.round(topo.reduce((s, o) => s + o.progress, 0) / topo.length) : 0;
  const atencao = objetivos.filter(o => o.status === 'atrasado' || o.status === 'em_risco').sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0))
    .map(o => ({ id: o.id, title: o.title, status: o.status, progress: o.progress, expected: o.expected, gap: o.gap, owner: o.owner }));
  const pendentes = krs.filter(k => k.stale).map(k => ({ id: k.id, objectiveId: k.objectiveId, objective: (objetivos.find(o => o.id === k.objectiveId) || {}).title, title: k.title, current: k.current, to: k.to, unit: k.unit, daysSinceUpdate: k.daysSinceUpdate, owner: k.owner }));
  const members = stmt.members.all().filter(m => m.status !== 'inativo');
  const units = stmt.units.all();
  return {
    today: d, me: ME, staleDays: STALE_DAYS, periods: PERIODS, units: UNITS,
    cycles: ciclos.map(c => cycleOut(c, d)), cycle: ciclo ? cycleOut(ciclo, d) : null,
    objectives: objetivos,
    summary: { ativos: ativos.length, total: objetivos.length, concluidos: objetivos.length - ativos.length, mediaReal, esperado: ciclo ? cycleOut(ciclo, d).expected : null,
      emRisco: objetivos.filter(o => o.status === 'em_risco').length, atrasados: objetivos.filter(o => o.status === 'atrasado').length,
      krsTotal: krs.length, krsStale: pendentes.length,
      porStatus: ['nao_iniciado', 'em_andamento', 'em_risco', 'atrasado', 'concluido'].map(s => ({ status: s, n: objetivos.filter(o => o.status === s).length })) },
    attention: atencao, pendingCheckins: pendentes, timeline: timeline(ciclo, objetivos, d),
    people: [...new Set(members.map(m => m.name).concat([ME]).concat(objetivos.map(o => o.owner).filter(Boolean)))].sort((a, b) => a.localeCompare(b)),
    areas: units.filter(u => u.kind === 'area').map(u => ({ id: u.id, name: u.name })),
    teams: units.filter(u => u.kind === 'equipe').map(u => ({ id: u.id, name: u.name, areaId: u.area_id })),
  };
}

router.get('/', (req, res) => res.json(payload(req.query.cycle ? String(req.query.cycle) : null)));

// Resumo curto pro card da home
router.get('/resumo', (_req, res) => {
  const p = payload(null);
  const topo = p.objectives.filter(o => !o.parentId).sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0));
  res.json({ cycle: p.cycle, summary: p.summary, destaque: topo.slice(0, 3).map(o => ({ id: o.id, title: o.title, progress: o.progress, status: o.status })), krsStale: p.summary.krsStale, attention: p.attention.length });
});

// Ciclos
router.post('/cycles', (req, res) => {
  const b = req.body || {};
  const name = txt(b.name, 120);
  const ini = dataOk(b.startDate), fim = dataOk(b.endDate);
  if (!name) return erro(res, 400, 'dê um nome ao ciclo');
  if (!ini || !fim || fim <= ini) return erro(res, 400, 'informe início e fim (fim depois do início)');
  const id = newId();
  db.transaction(() => {
    if (b.activate !== false) db.prepare(`UPDATE okr_cycles SET status = 'encerrado', closed_at = COALESCE(closed_at, ?) WHERE status = 'ativo'`).run(Date.now());
    db.prepare(`INSERT INTO okr_cycles (id, name, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(id, name, ini, fim, b.activate === false ? 'planejado' : 'ativo', Date.now());
    // Opcional: levar objetivos não concluídos do ciclo anterior
    if (b.carryFrom) {
      const d = hoje();
      const de = stmt.cycle.get(String(b.carryFrom));
      if (de) {
        const objs = objetivosDoCiclo(de, d).filter(o => o.status !== 'concluido');
        const mapa = {};
        objs.forEach((o, i) => {
          const nid = newId(); mapa[o.id] = nid;
          db.prepare(`INSERT INTO okr_objectives (id, cycle_id, parent_id, title, description, area_id, team_id, owner, period, start_date, end_date, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(nid, id, null, o.title, o.description, o.areaId, o.teamId, o.owner, o.period, ini, fim, i, Date.now(), Date.now());
          o.krs.forEach((k, j) => db.prepare(`INSERT INTO okr_krs (id, objective_id, title, from_value, to_value, current_value, unit, due_date, owner, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(newId(), nid, k.title, k.current, k.to, k.current, k.unit, fim, k.owner, j, Date.now(), Date.now()));
        });
        objs.forEach(o => { if (o.parentId && mapa[o.parentId]) db.prepare(`UPDATE okr_objectives SET parent_id = ? WHERE id = ?`).run(mapa[o.parentId], mapa[o.id]); });
      }
    }
  })();
  res.json(payload(id));
});
router.patch('/cycles/:id', (req, res) => {
  const c = stmt.cycle.get(req.params.id);
  if (!c) return erro(res, 404, 'ciclo não encontrado');
  const b = req.body || {};
  const o = {};
  if (b.name !== undefined) { o.name = txt(b.name, 120); if (!o.name) return erro(res, 400, 'dê um nome ao ciclo'); }
  if (b.startDate !== undefined) o.start_date = dataOk(b.startDate) || c.start_date;
  if (b.endDate !== undefined) o.end_date = dataOk(b.endDate) || c.end_date;
  if ((o.start_date || c.start_date) >= (o.end_date || c.end_date)) return erro(res, 400, 'o fim precisa ser depois do início');
  if (b.status !== undefined) {
    if (!['ativo', 'encerrado', 'planejado'].includes(b.status)) return erro(res, 400, 'status inválido');
    o.status = b.status; o.closed_at = b.status === 'encerrado' ? Date.now() : null;
    if (b.status === 'ativo') db.prepare(`UPDATE okr_cycles SET status = 'encerrado', closed_at = COALESCE(closed_at, ?) WHERE status = 'ativo' AND id != ?`).run(Date.now(), c.id);
  }
  const k = Object.keys(o);
  if (k.length) db.prepare(`UPDATE okr_cycles SET ${k.map(x => x + ' = @' + x).join(', ')} WHERE id = @id`).run(Object.assign({ id: c.id }, o));
  res.json(payload(c.id));
});
router.delete('/cycles/:id', (req, res) => {
  const c = stmt.cycle.get(req.params.id);
  if (!c) return erro(res, 404, 'ciclo não encontrado');
  const n = db.prepare(`SELECT COUNT(*) AS n FROM okr_objectives WHERE cycle_id = ?`).get(c.id).n;
  if (n) return erro(res, 400, `o ciclo tem ${n} objetivo(s): mova ou exclua antes`);
  db.prepare(`DELETE FROM okr_cycles WHERE id = ?`).run(c.id);
  res.json(payload(null));
});

// Objetivos
function salvarKrs(objId, krs, owner, due) {
  const base = stmt.krs.all(objId).length;
  cleanKrs(krs).forEach((k, i) => {
    db.prepare(`INSERT INTO okr_krs (id, objective_id, title, from_value, to_value, current_value, unit, due_date, owner, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(newId(), objId, k.title, k.from, k.to, k.from, k.unit, k.dueDate || due || null, owner || null, base + i, Date.now(), Date.now());
  });
}
router.post('/objectives', (req, res) => {
  const b = req.body || {};
  const title = txt(b.title, 200);
  if (!title) return erro(res, 400, 'dê um nome ao objetivo');
  const owner = txt(b.owner, 120);
  if (!owner) return erro(res, 400, 'escolha um responsável');
  let cycleId = b.cycleId ? String(b.cycleId) : null;
  if (cycleId && !stmt.cycle.get(cycleId)) cycleId = null;
  const ciclo = cycleId ? stmt.cycle.get(cycleId) : null;
  const parent = b.parentId ? stmt.obj.get(String(b.parentId)) : null;
  const id = newId();
  const n = (ciclo ? stmt.objs.all(ciclo.id) : stmt.objs.all(null)).length;
  db.transaction(() => {
    db.prepare(`INSERT INTO okr_objectives (id, cycle_id, parent_id, title, description, area_id, team_id, owner, period, start_date, end_date, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, cycleId, parent ? parent.id : null, title, txt(b.description, 2000) || '', txt(b.areaId, 40) || null, txt(b.teamId, 40) || null, owner,
        PERIODS.includes(b.period) ? b.period : 'trimestral', dataOk(b.startDate) || (ciclo ? ciclo.start_date : null), dataOk(b.endDate) || (ciclo ? ciclo.end_date : null), n, Date.now(), Date.now());
    salvarKrs(id, b.krs, owner, dataOk(b.endDate) || (ciclo ? ciclo.end_date : null));
  })();
  res.json(Object.assign(payload(cycleId), { createdId: id }));
});
// Vários de uma vez (Criar com IA)
router.post('/objectives/bulk', (req, res) => {
  const b = req.body || {};
  const lista = Array.isArray(b.objectives) ? b.objectives.slice(0, 20) : [];
  if (!lista.length) return erro(res, 400, 'nada para salvar');
  let cycleId = b.cycleId ? String(b.cycleId) : null;
  const ciclo = cycleId ? stmt.cycle.get(cycleId) : stmt.cycleAtivo.get();
  cycleId = ciclo ? ciclo.id : null;
  const ids = [];
  db.transaction(() => {
    let n = (ciclo ? stmt.objs.all(ciclo.id) : stmt.objs.all(null)).length;
    lista.forEach(o => {
      const title = txt(o.title, 200); if (!title) return;
      const id = newId(); ids.push(id);
      const owner = txt(o.owner, 120) || ME;
      db.prepare(`INSERT INTO okr_objectives (id, cycle_id, parent_id, title, description, area_id, team_id, owner, period, start_date, end_date, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, cycleId, o.parentId && stmt.obj.get(String(o.parentId)) ? String(o.parentId) : null, title, txt(o.description, 2000) || '', txt(o.areaId, 40) || null, txt(o.teamId, 40) || null, owner,
          PERIODS.includes(o.period) ? o.period : 'trimestral', ciclo ? ciclo.start_date : null, ciclo ? ciclo.end_date : null, n++, Date.now(), Date.now());
      salvarKrs(id, o.krs, owner, ciclo ? ciclo.end_date : null);
    });
  })();
  res.json(Object.assign(payload(cycleId), { createdIds: ids }));
});
router.patch('/objectives/:id', (req, res) => {
  const o0 = stmt.obj.get(req.params.id);
  if (!o0) return erro(res, 404, 'objetivo não encontrado');
  const b = req.body || {};
  const o = {};
  if (b.title !== undefined) { o.title = txt(b.title, 200); if (!o.title) return erro(res, 400, 'dê um nome ao objetivo'); }
  if (b.description !== undefined) o.description = txt(b.description, 2000);
  if (b.owner !== undefined) { o.owner = txt(b.owner, 120); if (!o.owner) return erro(res, 400, 'escolha um responsável'); }
  if (b.areaId !== undefined) o.area_id = txt(b.areaId, 40) || null;
  if (b.teamId !== undefined) o.team_id = txt(b.teamId, 40) || null;
  if (b.period !== undefined) o.period = PERIODS.includes(b.period) ? b.period : o0.period;
  if (b.startDate !== undefined) o.start_date = dataOk(b.startDate);
  if (b.endDate !== undefined) o.end_date = dataOk(b.endDate);
  if (b.cycleId !== undefined) o.cycle_id = b.cycleId && stmt.cycle.get(String(b.cycleId)) ? String(b.cycleId) : null;
  if (b.parentId !== undefined) {
    const pid = b.parentId ? String(b.parentId) : null;
    if (pid === o0.id) return erro(res, 400, 'um objetivo não pode ser pai de si mesmo');
    // evita ciclo na árvore
    let cur = pid; let guard = 0;
    while (cur && guard++ < 50) { const p = stmt.obj.get(cur); if (!p) { cur = null; break; } if (p.id === o0.id) return erro(res, 400, 'isso criaria um laço na árvore'); cur = p.parent_id; }
    o.parent_id = pid && stmt.obj.get(pid) ? pid : null;
  }
  if (b.sort !== undefined) o.sort = parseInt(b.sort, 10) || 0;
  const k = Object.keys(o);
  if (k.length) db.prepare(`UPDATE okr_objectives SET ${k.map(x => x + ' = @' + x).join(', ')}, updated_at = @now WHERE id = @id`).run(Object.assign({ id: o0.id, now: Date.now() }, o));
  if (Array.isArray(b.krs)) salvarKrs(o0.id, b.krs, o.owner || o0.owner, o.end_date || o0.end_date);
  res.json(payload(o.cycle_id !== undefined ? o.cycle_id : o0.cycle_id));
});
router.delete('/objectives/:id', (req, res) => {
  const o = stmt.obj.get(req.params.id);
  if (!o) return erro(res, 404, 'objetivo não encontrado');
  db.transaction(() => {
    stmt.krs.all(o.id).forEach(k => db.prepare(`DELETE FROM okr_checkins WHERE kr_id = ?`).run(k.id));
    db.prepare(`DELETE FROM okr_krs WHERE objective_id = ?`).run(o.id);
    db.prepare(`UPDATE okr_objectives SET parent_id = ? WHERE parent_id = ?`).run(o.parent_id || null, o.id); // filhos sobem um nível
    db.prepare(`DELETE FROM okr_objectives WHERE id = ?`).run(o.id);
  })();
  res.json(payload(o.cycle_id));
});

// Resultados-chave
router.post('/objectives/:id/krs', (req, res) => {
  const o = stmt.obj.get(req.params.id);
  if (!o) return erro(res, 404, 'objetivo não encontrado');
  const b = req.body || {};
  const lista = cleanKrs(Array.isArray(b.krs) ? b.krs : [b]);
  if (!lista.length) return erro(res, 400, 'descreva o resultado-chave');
  salvarKrs(o.id, lista, txt(b.owner, 120) || o.owner, o.end_date);
  touch(o.id);
  res.json(payload(o.cycle_id));
});
router.patch('/krs/:id', (req, res) => {
  const k0 = stmt.kr.get(req.params.id);
  if (!k0) return erro(res, 404, 'resultado-chave não encontrado');
  const b = req.body || {};
  const o = {};
  if (b.title !== undefined) { o.title = txt(b.title, 200); if (!o.title) return erro(res, 400, 'descreva o resultado-chave'); }
  if (b.from !== undefined) { const v = num(b.from); if (v === undefined) return erro(res, 400, 'valor inicial inválido'); o.from_value = v; }
  if (b.to !== undefined) { const v = num(b.to); if (v === undefined) return erro(res, 400, 'valor alvo inválido'); o.to_value = v; }
  if (b.unit !== undefined) o.unit = String(b.unit || '%').trim().slice(0, 12) || '%';
  if (b.dueDate !== undefined) o.due_date = dataOk(b.dueDate);
  if (b.owner !== undefined) o.owner = txt(b.owner, 120);
  if (b.current !== undefined) { const v = num(b.current); if (v === undefined) return erro(res, 400, 'valor atual inválido'); o.current_value = v; }
  const k = Object.keys(o);
  if (k.length) db.prepare(`UPDATE okr_krs SET ${k.map(x => x + ' = @' + x).join(', ')}, updated_at = @now WHERE id = @id`).run(Object.assign({ id: k0.id, now: Date.now() }, o));
  if (o.current_value !== undefined && o.current_value !== k0.current_value) {
    db.prepare(`INSERT INTO okr_checkins (id, kr_id, date, value, note, author, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(newId(), k0.id, hoje(), o.current_value, txt(b.note, 1000) || '', txt(b.author, 120) || ME, Date.now());
  }
  const obj = stmt.obj.get(k0.objective_id); touch(k0.objective_id);
  res.json(payload(obj ? obj.cycle_id : null));
});
router.delete('/krs/:id', (req, res) => {
  const k = stmt.kr.get(req.params.id);
  if (!k) return erro(res, 404, 'resultado-chave não encontrado');
  db.prepare(`DELETE FROM okr_checkins WHERE kr_id = ?`).run(k.id);
  db.prepare(`DELETE FROM okr_krs WHERE id = ?`).run(k.id);
  const obj = stmt.obj.get(k.objective_id); touch(k.objective_id);
  res.json(payload(obj ? obj.cycle_id : null));
});
router.get('/krs/:id/checkins', (req, res) => {
  const k = stmt.kr.get(req.params.id);
  if (!k) return erro(res, 404, 'resultado-chave não encontrado');
  res.json({ checkins: stmt.checkins.all(k.id).map(c => ({ id: c.id, date: c.date, value: c.value, note: c.note || '', author: c.author || '' })) });
});
// Check-in em lote: [{ krId, value, note }]
router.post('/checkins', (req, res) => {
  const b = req.body || {};
  const itens = Array.isArray(b.items) ? b.items.slice(0, 100) : [];
  if (!itens.length) return erro(res, 400, 'nada para registrar');
  let cycleId = null, n = 0;
  db.transaction(() => {
    itens.forEach(it => {
      const k = stmt.kr.get(String(it.krId || '')); if (!k) return;
      const v = num(it.value); if (v === undefined) return;
      db.prepare(`UPDATE okr_krs SET current_value = ?, updated_at = ? WHERE id = ?`).run(v, Date.now(), k.id);
      db.prepare(`INSERT INTO okr_checkins (id, kr_id, date, value, note, author, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(newId(), k.id, dataOk(it.date) || hoje(), v, txt(it.note, 1000) || '', txt(b.author, 120) || ME, Date.now());
      touch(k.objective_id); n++;
      const o = stmt.obj.get(k.objective_id); if (o && !cycleId) cycleId = o.cycle_id;
    });
  })();
  res.json(Object.assign(payload(cycleId), { registered: n }));
});
router.delete('/checkins/:id', (req, res) => {
  const c = db.prepare(`SELECT * FROM okr_checkins WHERE id = ?`).get(req.params.id);
  if (!c) return erro(res, 404, 'check-in não encontrado');
  db.prepare(`DELETE FROM okr_checkins WHERE id = ?`).run(c.id);
  // valor atual volta pro último check-in que sobrou (ou pro inicial)
  const k = stmt.kr.get(c.kr_id);
  if (k) { const ult = stmt.ultimoCheckin.get(k.id); db.prepare(`UPDATE okr_krs SET current_value = ?, updated_at = ? WHERE id = ?`).run(ult ? ult.value : k.from_value, Date.now(), k.id); }
  const obj = k ? stmt.obj.get(k.objective_id) : null;
  res.json(payload(obj ? obj.cycle_id : null));
});

// IA: sugere resultados-chave para um objetivo
router.post('/generate-krs', async (req, res) => {
  const b = req.body || {};
  const title = txt(b.title, 200);
  if (!title) return erro(res, 400, 'escreva o objetivo antes de gerar os resultados-chave');
  const emp = empresaCtx();
  const prompt = [
    'Você é especialista em OKRs e escreve resultados-chave mensuráveis. Responda em PT-BR.',
    `Empresa: ${emp.nome}${emp.segmento ? ' (' + emp.segmento + ')' : ''}.`,
    `Objetivo: ${title}`, b.description ? `Contexto: ${txt(b.description, 1500)}` : '', b.area ? `Área: ${txt(b.area, 80)}` : '', b.adjust ? `Ajuste pedido: ${txt(b.adjust, 500)}` : '',
    '', 'Sugira 3 ou 4 resultados-chave. Regras:',
    '- Cada KR mede um resultado (não uma tarefa), com valor inicial ("from"), valor alvo ("to") e unidade entre: %, R$, número, pp, dias, pontos, un.',
    '- Use números plausíveis para uma PME brasileira quando não houver dado; para "de/para" onde o menor é melhor (churn, CPL, dias), "to" é menor que "from".',
    '- Título curto, começando pelo indicador (ex.: "Ticket médio", "Conversão SQL → ganho", "Churn mensal").',
    'Não use ferramentas. Responda APENAS com JSON válido: {"krs":[{"title":"...","from":0,"to":100,"unit":"%"}]}',
  ].filter(Boolean).join('\n');
  try {
    const j = jsonDe(await claudeTexto(prompt));
    const krs = cleanKrs(j && j.krs);
    if (!krs.length) throw new Error('a IA não sugeriu resultados-chave');
    res.json({ krs });
  } catch (e) { console.error('[okrs] generate-krs', e.message); erro(res, 500, 'não consegui gerar agora: ' + e.message); }
});
// IA: monta um conjunto de objetivos com KRs a partir do contexto
router.post('/generate', async (req, res) => {
  const b = req.body || {};
  const contexto = txt(b.context, 3000);
  if (!contexto) return erro(res, 400, 'conte o que a empresa quer alcançar neste ciclo');
  const emp = empresaCtx();
  const qtd = clamp(parseInt(b.count, 10) || 3, 1, 6);
  const ciclo = stmt.cycleAtivo.get();
  const existentes = ciclo ? stmt.objs.all(ciclo.id).map(o => o.title) : [];
  const prompt = [
    'Você é especialista em OKRs para PMEs brasileiras. Responda em PT-BR.',
    `Empresa: ${emp.nome}${emp.segmento ? ' (' + emp.segmento + ')' : ''}. Áreas: ${emp.areas.join(', ') || 'não cadastradas'}.`,
    ciclo ? `Ciclo: ${ciclo.name}, de ${ciclo.start_date} a ${ciclo.end_date}.` : '',
    existentes.length ? `Objetivos que já existem (não repita): ${existentes.join('; ')}.` : '',
    `O que a empresa quer alcançar: ${contexto}`, b.focus ? `Foco/área prioritária: ${txt(b.focus, 200)}` : '', b.adjust ? `Ajuste pedido na versão anterior: ${txt(b.adjust, 800)}` : '',
    '', `Monte ${qtd} objetivo(s). Regras:`,
    '- Objetivo: frase inspiradora e qualitativa, sem número, no máximo 10 palavras (ex.: "Acelerar o crescimento comercial no trimestre").',
    '- "area": um nome da lista de áreas acima (ou vazio). "period": trimestral.',
    '- 3 ou 4 resultados-chave por objetivo, cada um com "from", "to" e "unit" (%, R$, número, pp, dias, pontos, un). KR mede resultado, não tarefa. Onde menor é melhor, "to" < "from".',
    '- "description": 1 frase com o porquê do objetivo.',
    'Não use ferramentas. Responda APENAS com JSON válido:',
    '{"objectives":[{"title":"...","description":"...","area":"...","period":"trimestral","krs":[{"title":"...","from":0,"to":100,"unit":"%"}]}]}',
  ].filter(Boolean).join('\n');
  try {
    const j = jsonDe(await claudeTexto(prompt));
    const areaId = nome => { const u = stmt.units.all().find(x => x.kind === 'area' && x.name.toLowerCase() === String(nome || '').toLowerCase()); return u ? u.id : null; };
    const objs = (j && Array.isArray(j.objectives) ? j.objectives : []).slice(0, 8).map(o => ({
      title: String(o.title || '').trim().slice(0, 200), description: String(o.description || '').trim().slice(0, 2000), area: String(o.area || '').trim().slice(0, 80), areaId: areaId(o.area),
      period: PERIODS.includes(o.period) ? o.period : 'trimestral', krs: cleanKrs(o.krs),
    })).filter(o => o.title);
    if (!objs.length) throw new Error('a IA não sugeriu objetivos');
    res.json({ objectives: objs });
  } catch (e) { console.error('[okrs] generate', e.message); erro(res, 500, 'não consegui gerar agora: ' + e.message); }
});

module.exports = { router, payload };
