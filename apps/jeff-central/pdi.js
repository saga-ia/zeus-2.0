// PDI (Plano de Desenvolvimento Individual): planos por pessoa, metas, ações 70-20-10, check-ins e templates.
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const db = new Database(path.join(DATA_DIR, 'central.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS pdis (
  id TEXT PRIMARY KEY,
  person TEXT NOT NULL,
  role TEXT,
  manager TEXT,
  cycle_start TEXT,
  cycle_end TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  template_id TEXT,
  summary TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pdi_goals (
  id TEXT PRIMARY KEY,
  pdi_id TEXT NOT NULL,
  title TEXT NOT NULL,
  competency TEXT,
  type TEXT NOT NULL DEFAULT 'tecnica',
  description TEXT,
  success_criteria TEXT,
  due_date TEXT,
  progress INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pdi_goals ON pdi_goals(pdi_id, sort);
CREATE TABLE IF NOT EXISTS pdi_actions (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT '70',
  due_date TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  done_at INTEGER,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pdi_actions ON pdi_actions(goal_id, sort);
CREATE TABLE IF NOT EXISTS pdi_checkins (
  id TEXT PRIMARY KEY,
  pdi_id TEXT NOT NULL,
  date TEXT NOT NULL,
  author TEXT,
  mood INTEGER,
  note TEXT,
  progress INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pdi_checkins ON pdi_checkins(pdi_id, date);
CREATE TABLE IF NOT EXISTS pdi_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  role_hint TEXT,
  goals TEXT NOT NULL DEFAULT '[]',
  builtin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`);

const ME = process.env.PDI_ME || 'Vinícius Nunes';
const TYPES = ['tecnica', 'comportamental', 'lideranca', 'carreira'];
const KINDS = ['70', '20', '10']; // 70% prática, 20% troca/mentoria, 10% estudo formal
const newId = () => crypto.randomBytes(8).toString('base64url');
const parseJSON = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const hoje = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); // BRT
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const txt = (v, n) => (v === undefined || v === null) ? undefined : String(v).trim().slice(0, n);
const dataOk = v => (v === undefined) ? undefined : (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null);

const stmt = {
  pdis: db.prepare(`SELECT * FROM pdis ORDER BY person COLLATE NOCASE`),
  pdi: db.prepare(`SELECT * FROM pdis WHERE id = ?`),
  goals: db.prepare(`SELECT * FROM pdi_goals WHERE pdi_id = ? ORDER BY sort, created_at`),
  goal: db.prepare(`SELECT * FROM pdi_goals WHERE id = ?`),
  actions: db.prepare(`SELECT * FROM pdi_actions WHERE goal_id = ? ORDER BY sort, created_at`),
  action: db.prepare(`SELECT * FROM pdi_actions WHERE id = ?`),
  checkins: db.prepare(`SELECT * FROM pdi_checkins WHERE pdi_id = ? ORDER BY date DESC, created_at DESC`),
  templates: db.prepare(`SELECT * FROM pdi_templates ORDER BY builtin DESC, name COLLATE NOCASE`),
  template: db.prepare(`SELECT * FROM pdi_templates WHERE id = ?`),
};

// ─── Cálculos ────────────────────────────────────────────────────────────────
function goalOut(g) {
  const acts = stmt.actions.all(g.id).map(a => ({ id: a.id, title: a.title, kind: a.kind, dueDate: a.due_date, done: !!a.done, doneAt: a.done_at }));
  // Com ações, o progresso é o % concluído; sem ações, vale o progresso informado à mão
  const progress = acts.length ? Math.round(100 * acts.filter(a => a.done).length / acts.length) : g.progress;
  const d = hoje();
  const status = progress >= 100 ? 'concluida' : (g.due_date && g.due_date < d ? 'atrasada' : (progress > 0 ? 'em_andamento' : 'nao_iniciada'));
  return { id: g.id, title: g.title, competency: g.competency || '', type: g.type, description: g.description || '', successCriteria: g.success_criteria || '',
    dueDate: g.due_date, manualProgress: g.progress, progress, status, actions: acts };
}
function pdiOut(p, full) {
  const goals = stmt.goals.all(p.id).map(goalOut);
  const checkins = stmt.checkins.all(p.id);
  const progress = goals.length ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length) : 0;
  const acts = goals.flatMap(g => g.actions);
  const d = hoje();
  const overdueActions = acts.filter(a => !a.done && a.dueDate && a.dueDate < d).length;
  const overdueGoals = goals.filter(g => g.status === 'atrasada').length;
  const last = checkins[0] || null;
  // Saúde: atrasado (meta vencida ou ciclo acabou), atenção (sem check-in há 30+ dias ou abaixo do ritmo esperado), em dia
  let health = 'em_dia';
  let esperado = null;
  if (p.cycle_start && p.cycle_end && p.cycle_end > p.cycle_start) {
    const t0 = Date.parse(p.cycle_start), t1 = Date.parse(p.cycle_end), tn = Date.parse(d);
    esperado = Math.max(0, Math.min(100, Math.round(100 * (tn - t0) / (t1 - t0))));
  }
  const diasSemCheckin = last ? Math.round((Date.parse(d) - Date.parse(last.date)) / 86400000) : Math.round((Date.now() - p.created_at) / 86400000);
  if (p.status === 'concluido') health = 'concluido';
  else if (p.status === 'solicitado') health = 'solicitado';
  else if (p.status === 'rascunho') health = 'rascunho';
  else if (overdueGoals || (p.cycle_end && p.cycle_end < d && progress < 100)) health = 'atrasado';
  else if (diasSemCheckin > 30 || (esperado !== null && esperado - progress > 25)) health = 'atencao';
  const out = {
    id: p.id, person: p.person, role: p.role || '', manager: p.manager || '', cycleStart: p.cycle_start, cycleEnd: p.cycle_end,
    status: p.status, templateId: p.template_id, summary: p.summary || '', isMe: p.person === ME,
    progress, expected: esperado, health, goalsTotal: goals.length, goalsDone: goals.filter(g => g.status === 'concluida').length,
    actionsTotal: acts.length, actionsDone: acts.filter(a => a.done).length, overdueActions, overdueGoals,
    lastCheckin: last ? { date: last.date, mood: last.mood, author: last.author } : null, daysSinceCheckin: diasSemCheckin,
    mix: { '70': acts.filter(a => a.kind === '70').length, '20': acts.filter(a => a.kind === '20').length, '10': acts.filter(a => a.kind === '10').length },
    createdAt: p.created_at, updatedAt: p.updated_at,
  };
  if (full) {
    out.goals = goals;
    out.checkins = checkins.map(c => ({ id: c.id, date: c.date, author: c.author || '', mood: c.mood, note: c.note || '', progress: c.progress }));
  }
  return out;
}
function tplOut(t) {
  const goals = parseJSON(t.goals, []);
  return { id: t.id, name: t.name, description: t.description || '', roleHint: t.role_hint || '', builtin: !!t.builtin, goals,
    goalsCount: goals.length, actionsCount: goals.reduce((s, g) => s + (g.actions || []).length, 0), createdAt: t.created_at, updatedAt: t.updated_at };
}
function touch(pdiId) { db.prepare(`UPDATE pdis SET updated_at = ? WHERE id = ?`).run(Date.now(), pdiId); }
function cleanTplGoals(goals) {
  return (Array.isArray(goals) ? goals : []).slice(0, 12).map(g => ({
    title: String(g.title || '').trim().slice(0, 160), competency: String(g.competency || '').trim().slice(0, 80),
    type: TYPES.includes(g.type) ? g.type : 'tecnica', description: String(g.description || '').trim().slice(0, 1000),
    successCriteria: String(g.successCriteria || '').trim().slice(0, 500), weeks: Math.max(1, Math.min(52, parseInt(g.weeks, 10) || 12)),
    actions: (Array.isArray(g.actions) ? g.actions : []).slice(0, 12).map(a => ({ title: String(a.title || '').trim().slice(0, 200), kind: KINDS.includes(String(a.kind)) ? String(a.kind) : '70' })).filter(a => a.title),
  })).filter(g => g.title);
}
function addGoal(pdiId, g, sort, due) {
  const id = newId();
  db.prepare(`INSERT INTO pdi_goals (id, pdi_id, title, competency, type, description, success_criteria, due_date, progress, sort, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, pdiId, g.title, g.competency || '', TYPES.includes(g.type) ? g.type : 'tecnica',
    g.description || '', g.successCriteria || '', due || null, Math.max(0, Math.min(100, parseInt(g.progress, 10) || 0)), sort, Date.now());
  (g.actions || []).forEach((a, i) => {
    db.prepare(`INSERT INTO pdi_actions (id, goal_id, title, kind, due_date, done, done_at, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(newId(), id, a.title, KINDS.includes(String(a.kind)) ? String(a.kind) : '70', a.dueDate || null, a.done ? 1 : 0, a.done ? Date.now() : null, i, Date.now());
  });
  return id;
}
function aplicarTemplate(pdiId, tpl, inicio) {
  cleanTplGoals(parseJSON(tpl.goals, [])).forEach((g, i) => addGoal(pdiId, g, i, somaDias(inicio, g.weeks * 7)));
}

// ─── Seed: templates prontos e PDIs de exemplo ───────────────────────────────
const TEMPLATES = [
  ['tpl-sdr-closer', 'SDR para Closer', 'Transição de pré-vendas para fechamento: diagnóstico, negociação e gestão de pipeline.', 'SDR / BDR', [
    { title: 'Conduzir reuniões de diagnóstico sozinho', competency: 'Descoberta consultiva', type: 'tecnica', weeks: 8, successCriteria: '10 diagnósticos conduzidos com nota 4+ no auditor de calls',
      actions: [{ title: 'Acompanhar 6 reuniões de closers seniores', kind: '70' }, { title: 'Conduzir 10 diagnósticos com roteiro SPIN', kind: '70' }, { title: 'Revisar 3 gravações com o gestor', kind: '20' }, { title: 'Curso de vendas consultivas', kind: '10' }] },
    { title: 'Negociar e tratar objeções de preço', competency: 'Negociação', type: 'tecnica', weeks: 12, successCriteria: 'Taxa de desconto média abaixo de 8%',
      actions: [{ title: 'Role-play semanal de objeções com o time', kind: '20' }, { title: 'Montar playbook pessoal de objeções', kind: '70' }, { title: 'Ler "Negocie como se sua vida dependesse disso"', kind: '10' }] },
    { title: 'Gerir o próprio pipeline com previsibilidade', competency: 'Gestão de pipeline', type: 'carreira', weeks: 16, successCriteria: 'Forecast mensal com erro menor que 15%',
      actions: [{ title: 'Atualizar CRM diariamente com próximo passo e data', kind: '70' }, { title: 'Revisão quinzenal de pipeline com o gestor', kind: '20' }] }]],
  ['tpl-primeira-lideranca', 'Primeira liderança', 'Para quem assumiu time recentemente: feedback, rituais de gestão e delegação.', 'Coordenador / Líder novo', [
    { title: 'Dar feedback estruturado e frequente', competency: 'Feedback', type: 'lideranca', weeks: 8, successCriteria: '1:1 quinzenal com todo o time e feedback registrado',
      actions: [{ title: 'Implantar 1:1 quinzenal com cada liderado', kind: '70' }, { title: 'Aplicar modelo SCI em 10 feedbacks', kind: '70' }, { title: 'Mentoria mensal com um líder sênior', kind: '20' }, { title: 'Workshop de comunicação não violenta', kind: '10' }] },
    { title: 'Delegar com clareza e acompanhar sem microgerenciar', competency: 'Delegação', type: 'lideranca', weeks: 12, successCriteria: '3 responsabilidades recorrentes delegadas com dono e indicador',
      actions: [{ title: 'Mapear tarefas que só eu faço e escolher 3 para delegar', kind: '70' }, { title: 'Definir critério de pronto para cada entrega delegada', kind: '70' }, { title: 'Ler "O gerente minuto"', kind: '10' }] },
    { title: 'Conduzir rituais de gestão do time', competency: 'Gestão de rotina', type: 'comportamental', weeks: 10, successCriteria: 'Weekly e retrospectiva mensal acontecendo sem falhas',
      actions: [{ title: 'Estruturar a pauta da weekly', kind: '70' }, { title: 'Pedir feedback do time sobre os rituais', kind: '20' }] }]],
  ['tpl-marketing-pleno', 'Analista de Marketing Pleno', 'Evolução técnica em performance, dados e criativos.', 'Analista de Marketing', [
    { title: 'Dominar análise de funil de mídia paga', competency: 'Performance', type: 'tecnica', weeks: 10, successCriteria: 'Relatório semanal com diagnóstico e plano de otimização',
      actions: [{ title: 'Montar dashboard de CPL, CTR e conversão por campanha', kind: '70' }, { title: 'Apresentar diagnóstico mensal ao time', kind: '70' }, { title: 'Certificação Meta Blueprint', kind: '10' }] },
    { title: 'Testar criativos com método', competency: 'Criativos', type: 'tecnica', weeks: 12, successCriteria: '8 testes A/B documentados com aprendizado',
      actions: [{ title: 'Criar backlog de hipóteses de criativo', kind: '70' }, { title: 'Revisar resultados com o gestor de tráfego', kind: '20' }] },
    { title: 'Apresentar resultados com clareza', competency: 'Comunicação', type: 'comportamental', weeks: 8, successCriteria: 'Apresentações sem retrabalho e com decisão tomada',
      actions: [{ title: 'Usar estrutura contexto → dado → decisão', kind: '70' }, { title: 'Curso de storytelling com dados', kind: '10' }] }]],
  ['tpl-cs', 'Customer Success', 'Retenção, expansão e gestão de carteira.', 'CS / Account Manager', [
    { title: 'Reduzir churn da carteira', competency: 'Retenção', type: 'tecnica', weeks: 12, successCriteria: 'Churn da carteira abaixo de 2% ao mês',
      actions: [{ title: 'Mapear health score de todos os clientes', kind: '70' }, { title: 'Plano de ação para clientes em risco', kind: '70' }, { title: 'Troca de práticas com CS de outra empresa', kind: '20' }] },
    { title: 'Gerar expansão na base', competency: 'Expansão', type: 'carreira', weeks: 16, successCriteria: '3 upsells fechados no ciclo',
      actions: [{ title: 'Identificar oportunidades de upsell em QBRs', kind: '70' }, { title: 'Treinamento de vendas consultivas', kind: '10' }] }]],
  ['tpl-comunicacao', 'Comunicação e feedback', 'Desenvolvimento comportamental para qualquer função.', 'Qualquer cargo', [
    { title: 'Comunicar de forma clara e objetiva', competency: 'Comunicação', type: 'comportamental', weeks: 8, successCriteria: 'Feedback 360 com nota 4+ em clareza',
      actions: [{ title: 'Escrever resumos de reunião em até 5 linhas', kind: '70' }, { title: 'Pedir feedback de clareza a 3 colegas', kind: '20' }, { title: 'Ler "Comunicação não violenta"', kind: '10' }] },
    { title: 'Receber e aplicar feedback', competency: 'Abertura a feedback', type: 'comportamental', weeks: 10, successCriteria: 'Plano de ação para cada feedback recebido',
      actions: [{ title: 'Registrar feedbacks recebidos e o que mudou', kind: '70' }, { title: 'Conversa mensal com o gestor sobre evolução', kind: '20' }] }]],
];
(function seed() {
  const now = Date.now();
  const ins = db.prepare(`INSERT OR IGNORE INTO pdi_templates (id, name, description, role_hint, goals, builtin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`);
  TEMPLATES.forEach(([id, name, desc, role, goals]) => ins.run(id, name, desc, role, JSON.stringify(goals), now, now));
  if (db.prepare(`SELECT COUNT(*) AS n FROM pdis`).get().n) return;
  const d = hoje();
  const exemplos = [
    { person: 'Ana Beatriz Costa', role: 'SDR Sênior', manager: ME, tpl: 'tpl-sdr-closer', inicio: somaDias(d, -90), fim: somaDias(d, 90), feitos: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [2, 0]],
      checkins: [[-75, 4, 'Muito engajada com a transição.'], [-45, 5, 'Primeiros diagnósticos com ótima nota.'], [-14, 4, 'Precisa praticar mais negociação de desconto.']] },
    { person: 'Rafael Almeida', role: 'Analista de Marketing', manager: ME, tpl: 'tpl-marketing-pleno', inicio: somaDias(d, -120), fim: somaDias(d, 30), feitos: [[0, 0]],
      checkins: [[-100, 3, 'Dashboard em construção.'], [-60, 2, 'Pouco tempo para o PDI por causa das campanhas.']] },
    { person: 'Fernanda Lima', role: 'Customer Success', manager: ME, tpl: 'tpl-cs', inicio: somaDias(d, -40), fim: somaDias(d, 140), feitos: [[0, 0], [0, 1], [1, 0]],
      checkins: [[-30, 4, 'Health score mapeado para 80% da carteira.'], [-5, 5, 'Dois clientes em risco recuperados.']] },
    { person: 'Bruno Souza', role: 'SDR', manager: ME, tpl: 'tpl-comunicacao', inicio: d, fim: somaDias(d, 120), status: 'rascunho', feitos: [], checkins: [] },
  ];
  db.transaction(() => {
    exemplos.forEach(x => {
      const id = newId();
      db.prepare(`INSERT INTO pdis (id, person, role, manager, cycle_start, cycle_end, status, template_id, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, x.person, x.role, x.manager, x.inicio, x.fim, x.status || 'ativo', x.tpl, '', now, now);
      aplicarTemplate(id, stmt.template.get(x.tpl), x.inicio);
      const goals = stmt.goals.all(id);
      x.feitos.forEach(([gi, ai]) => { const g = goals[gi]; if (!g) return; const a = stmt.actions.all(g.id)[ai]; if (a) db.prepare(`UPDATE pdi_actions SET done = 1, done_at = ? WHERE id = ?`).run(now, a.id); });
      // Progresso registrado em cada check-in cresce até o valor atual, pra linha do tempo fazer sentido
      const atual = pdiOut(stmt.pdi.get(id)).progress;
      x.checkins.forEach(([dias, mood, note], i) => {
        const prog = Math.round(atual * (i + 1) / x.checkins.length);
        db.prepare(`INSERT INTO pdi_checkins (id, pdi_id, date, author, mood, note, progress, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(newId(), id, somaDias(d, dias), x.manager, mood, note, prog, now);
      });
    });
  })();
})();

// ─── Router ──────────────────────────────────────────────────────────────────
const router = express.Router();
const erro = (res, code, msg) => res.status(code).json({ error: msg });

router.get('/', (_req, res) => {
  res.json({ me: ME, pdis: stmt.pdis.all().map(p => pdiOut(p, false)), people: [...new Set(stmt.pdis.all().map(p => p.person).concat([ME]))] });
});

// Templates
router.get('/templates', (_req, res) => res.json({ templates: stmt.templates.all().map(tplOut) }));
router.post('/templates', (req, res) => {
  const b = req.body || {};
  const name = txt(b.name, 120);
  if (!name) return erro(res, 400, 'nome obrigatório');
  const id = 'tpl-' + newId().toLowerCase();
  db.prepare(`INSERT INTO pdi_templates (id, name, description, role_hint, goals, builtin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`)
    .run(id, name, txt(b.description, 500) || '', txt(b.roleHint, 120) || '', JSON.stringify(cleanTplGoals(b.goals)), Date.now(), Date.now());
  res.json({ template: tplOut(stmt.template.get(id)) });
});
router.post('/templates/from-pdi/:id', (req, res) => {
  const p = stmt.pdi.get(req.params.id);
  if (!p) return erro(res, 404, 'PDI não encontrado');
  const full = pdiOut(p, true);
  const goals = full.goals.map(g => ({ title: g.title, competency: g.competency, type: g.type, description: g.description, successCriteria: g.successCriteria,
    weeks: g.dueDate && p.cycle_start ? Math.max(1, Math.round((Date.parse(g.dueDate) - Date.parse(p.cycle_start)) / (7 * 86400000))) : 12,
    actions: g.actions.map(a => ({ title: a.title, kind: a.kind })) }));
  const id = 'tpl-' + newId().toLowerCase();
  const name = txt((req.body && req.body.name) || ('Modelo: ' + (p.role || p.person)), 120);
  db.prepare(`INSERT INTO pdi_templates (id, name, description, role_hint, goals, builtin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`)
    .run(id, name, 'Criado a partir do PDI de ' + p.person, p.role || '', JSON.stringify(cleanTplGoals(goals)), Date.now(), Date.now());
  res.json({ template: tplOut(stmt.template.get(id)) });
});
router.patch('/templates/:tid', (req, res) => {
  const t = stmt.template.get(req.params.tid);
  if (!t) return erro(res, 404, 'template não encontrado');
  if (t.builtin) return erro(res, 400, 'templates prontos não podem ser editados: duplique para personalizar');
  const b = req.body || {};
  const o = {};
  if (b.name !== undefined) { o.name = txt(b.name, 120); if (!o.name) return erro(res, 400, 'nome obrigatório'); }
  if (b.description !== undefined) o.description = txt(b.description, 500);
  if (b.roleHint !== undefined) o.role_hint = txt(b.roleHint, 120);
  if (b.goals !== undefined) o.goals = JSON.stringify(cleanTplGoals(b.goals));
  const k = Object.keys(o);
  if (k.length) db.prepare(`UPDATE pdi_templates SET ${k.map(x => x + ' = @' + x).join(', ')}, updated_at = @now WHERE id = @id`).run(Object.assign({ id: t.id, now: Date.now() }, o));
  res.json({ template: tplOut(stmt.template.get(t.id)) });
});
router.post('/templates/:tid/duplicate', (req, res) => {
  const t = stmt.template.get(req.params.tid);
  if (!t) return erro(res, 404, 'template não encontrado');
  const id = 'tpl-' + newId().toLowerCase();
  db.prepare(`INSERT INTO pdi_templates (id, name, description, role_hint, goals, builtin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`)
    .run(id, (t.name + ' (cópia)').slice(0, 120), t.description, t.role_hint, t.goals, Date.now(), Date.now());
  res.json({ template: tplOut(stmt.template.get(id)) });
});
router.delete('/templates/:tid', (req, res) => {
  const t = stmt.template.get(req.params.tid);
  if (!t) return erro(res, 404, 'template não encontrado');
  if (t.builtin) return erro(res, 400, 'templates prontos não podem ser excluídos');
  db.prepare(`DELETE FROM pdi_templates WHERE id = ?`).run(t.id);
  res.json({ ok: true });
});

// Evolução: agregados de todos os PDIs
router.get('/analytics', (_req, res) => {
  const pdis = stmt.pdis.all().map(p => pdiOut(p, true));
  const ativos = pdis.filter(p => p.status !== 'rascunho');
  const d = hoje();
  const tipos = {}; TYPES.forEach(t => { tipos[t] = { total: 0, done: 0, progressSum: 0 }; });
  const mix = { '70': 0, '20': 0, '10': 0 };
  const atrasadas = [];
  ativos.forEach(p => p.goals.forEach(g => {
    const t = tipos[g.type] || (tipos[g.type] = { total: 0, done: 0, progressSum: 0 });
    t.total++; t.progressSum += g.progress; if (g.status === 'concluida') t.done++;
    g.actions.forEach(a => {
      mix[a.kind] = (mix[a.kind] || 0) + 1;
      if (!a.done && a.dueDate && a.dueDate < d) atrasadas.push({ pdiId: p.id, person: p.person, goal: g.title, action: a.title, dueDate: a.dueDate });
    });
    if (g.status === 'atrasada') {
      const pend = g.actions.filter(a => !a.done).length;
      atrasadas.push({ pdiId: p.id, person: p.person, goal: g.title, action: g.actions.length ? `Meta vencida · ${pend} ${pend === 1 ? 'ação pendente' : 'ações pendentes'}` : 'Meta vencida sem ações', dueDate: g.dueDate, kind: 'meta' });
    }
  }));
  // Linha do tempo: progresso por check-in, por pessoa
  const timeline = ativos.map(p => ({ pdiId: p.id, person: p.person, points: p.checkins.slice().reverse().map(c => ({ date: c.date, progress: c.progress })).concat([{ date: d, progress: p.progress }]) }));
  const moods = ativos.flatMap(p => p.checkins.filter(c => c.mood).map(c => c.mood));
  res.json({
    today: d,
    totals: {
      pdis: pdis.length, ativos: ativos.filter(p => p.status === 'ativo').length, rascunhos: pdis.length - ativos.length,
      progressoMedio: ativos.length ? Math.round(ativos.reduce((s, p) => s + p.progress, 0) / ativos.length) : 0,
      emDia: ativos.filter(p => p.health === 'em_dia').length, atencao: ativos.filter(p => p.health === 'atencao').length,
      atrasados: ativos.filter(p => p.health === 'atrasado').length, concluidos: ativos.filter(p => p.health === 'concluido').length,
      humorMedio: moods.length ? Math.round(10 * moods.reduce((s, m) => s + m, 0) / moods.length) / 10 : null,
    },
    people: ativos.map(p => ({ pdiId: p.id, person: p.person, role: p.role, progress: p.progress, expected: p.expected, health: p.health,
      goalsDone: p.goalsDone, goalsTotal: p.goalsTotal, daysSinceCheckin: p.daysSinceCheckin })),
    types: Object.keys(tipos).map(k => ({ type: k, total: tipos[k].total, done: tipos[k].done, progress: tipos[k].total ? Math.round(tipos[k].progressSum / tipos[k].total) : 0 })),
    mix, overdue: atrasadas.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 30), timeline,
  });
});

// Metas e ações (antes de /:id)
router.patch('/goals/:gid', (req, res) => {
  const g = stmt.goal.get(req.params.gid);
  if (!g) return erro(res, 404, 'meta não encontrada');
  const b = req.body || {};
  const o = {};
  if (b.title !== undefined) { o.title = txt(b.title, 160); if (!o.title) return erro(res, 400, 'título obrigatório'); }
  if (b.competency !== undefined) o.competency = txt(b.competency, 80);
  if (b.type !== undefined) o.type = TYPES.includes(b.type) ? b.type : 'tecnica';
  if (b.description !== undefined) o.description = txt(b.description, 1000);
  if (b.successCriteria !== undefined) o.success_criteria = txt(b.successCriteria, 500);
  if (b.dueDate !== undefined) o.due_date = dataOk(b.dueDate);
  if (b.progress !== undefined) o.progress = Math.max(0, Math.min(100, parseInt(b.progress, 10) || 0));
  const k = Object.keys(o);
  if (k.length) db.prepare(`UPDATE pdi_goals SET ${k.map(x => x + ' = @' + x).join(', ')} WHERE id = @id`).run(Object.assign({ id: g.id }, o));
  touch(g.pdi_id);
  res.json({ pdi: pdiOut(stmt.pdi.get(g.pdi_id), true) });
});
router.delete('/goals/:gid', (req, res) => {
  const g = stmt.goal.get(req.params.gid);
  if (!g) return erro(res, 404, 'meta não encontrada');
  db.prepare(`DELETE FROM pdi_actions WHERE goal_id = ?`).run(g.id);
  db.prepare(`DELETE FROM pdi_goals WHERE id = ?`).run(g.id);
  touch(g.pdi_id);
  res.json({ pdi: pdiOut(stmt.pdi.get(g.pdi_id), true) });
});
router.post('/goals/:gid/actions', (req, res) => {
  const g = stmt.goal.get(req.params.gid);
  if (!g) return erro(res, 404, 'meta não encontrada');
  const b = req.body || {};
  const title = txt(b.title, 200);
  if (!title) return erro(res, 400, 'descreva a ação');
  const n = stmt.actions.all(g.id).length;
  db.prepare(`INSERT INTO pdi_actions (id, goal_id, title, kind, due_date, done, done_at, sort, created_at) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)`)
    .run(newId(), g.id, title, KINDS.includes(String(b.kind)) ? String(b.kind) : '70', dataOk(b.dueDate) || null, n, Date.now());
  touch(g.pdi_id);
  res.json({ pdi: pdiOut(stmt.pdi.get(g.pdi_id), true) });
});
router.patch('/actions/:aid', (req, res) => {
  const a = stmt.action.get(req.params.aid);
  if (!a) return erro(res, 404, 'ação não encontrada');
  const g = stmt.goal.get(a.goal_id);
  const b = req.body || {};
  const o = {};
  if (b.title !== undefined) { o.title = txt(b.title, 200); if (!o.title) return erro(res, 400, 'descreva a ação'); }
  if (b.kind !== undefined) o.kind = KINDS.includes(String(b.kind)) ? String(b.kind) : '70';
  if (b.dueDate !== undefined) o.due_date = dataOk(b.dueDate);
  if (b.done !== undefined) { o.done = b.done ? 1 : 0; o.done_at = b.done ? Date.now() : null; }
  const k = Object.keys(o);
  if (k.length) db.prepare(`UPDATE pdi_actions SET ${k.map(x => x + ' = @' + x).join(', ')} WHERE id = @id`).run(Object.assign({ id: a.id }, o));
  touch(g.pdi_id);
  res.json({ pdi: pdiOut(stmt.pdi.get(g.pdi_id), true) });
});
router.delete('/actions/:aid', (req, res) => {
  const a = stmt.action.get(req.params.aid);
  if (!a) return erro(res, 404, 'ação não encontrada');
  const g = stmt.goal.get(a.goal_id);
  db.prepare(`DELETE FROM pdi_actions WHERE id = ?`).run(a.id);
  touch(g.pdi_id);
  res.json({ pdi: pdiOut(stmt.pdi.get(g.pdi_id), true) });
});
router.delete('/checkins/:cid', (req, res) => {
  const c = db.prepare(`SELECT * FROM pdi_checkins WHERE id = ?`).get(req.params.cid);
  if (!c) return erro(res, 404, 'check-in não encontrado');
  db.prepare(`DELETE FROM pdi_checkins WHERE id = ?`).run(c.id);
  res.json({ pdi: pdiOut(stmt.pdi.get(c.pdi_id), true) });
});

// Criar PDI com IA: sugere metas e ações 70-20-10 a partir do contexto da pessoa
const CLAUDE_BIN = process.env.CLAUDE_BIN || '/root/.nvm/versions/node/v20.20.2/bin/claude';
const ASSIST_DIR = path.join(DATA_DIR, 'assist-workdir');
function claudeTexto(prompt) {
  return new Promise((resolve, reject) => {
    const fs = require('fs');
    if (!fs.existsSync(ASSIST_DIR)) fs.mkdirSync(ASSIST_DIR, { recursive: true });
    const { spawn } = require('child_process');
    const pr = spawn(CLAUDE_BIN, ['-p', '--output-format', 'text', '--model', 'sonnet', '--disallowedTools', 'Bash Edit Write NotebookEdit WebFetch WebSearch Task Agent Read Glob Grep'],
      { cwd: ASSIST_DIR, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const t = setTimeout(() => { try { pr.kill('SIGTERM'); } catch (_) {} }, 150000);
    pr.stdout.on('data', d => { out += d; });
    pr.stderr.on('data', d => { err += d; });
    pr.on('close', code => { clearTimeout(t); if (!out.trim()) return reject(new Error(err.slice(-300) || 'claude saiu com código ' + code)); resolve(out); });
    pr.on('error', e => { clearTimeout(t); reject(e); });
    pr.stdin.on('error', () => {});
    pr.stdin.end(prompt);
  });
}
router.post('/generate', async (req, res) => {
  const b = req.body || {};
  const meses = [3, 6, 12].includes(parseInt(b.months, 10)) ? parseInt(b.months, 10) : 6;
  const ctx = {
    pessoa: txt(b.person, 120) || ME, cargo: txt(b.role, 120) || '', objetivo: txt(b.objective, 1500) || '',
    desenvolver: txt(b.focus, 1500) || '', contexto: txt(b.context, 2000) || '', ajuste: txt(b.adjust, 1000) || '',
  };
  if (!ctx.objetivo && !ctx.desenvolver) return erro(res, 400, 'conte o objetivo de carreira ou o que quer desenvolver');
  const prompt = [
    'Você é especialista em desenvolvimento de pessoas e monta Planos de Desenvolvimento Individual (PDI) práticos. Responda em PT-BR.',
    `Pessoa: ${ctx.pessoa}${ctx.cargo ? ' | Cargo atual: ' + ctx.cargo : ''}`,
    ctx.objetivo ? 'Objetivo de carreira / próximo passo: ' + ctx.objetivo : '',
    ctx.desenvolver ? 'O que quer desenvolver: ' + ctx.desenvolver : '',
    ctx.contexto ? 'Contexto, desafios e pontos de atenção: ' + ctx.contexto : '',
    ctx.ajuste ? 'Ajuste pedido na versão anterior: ' + ctx.ajuste : '',
    `Duração do ciclo: ${meses} meses (${Math.round(meses * 4.3)} semanas).`, '',
    'Monte o PDI com 3 ou 4 metas. Regras:',
    '- Cada meta: específica e observável, com competência, tipo (tecnica, comportamental, lideranca ou carreira), prazo em semanas a partir do início (distribua dentro do ciclo) e critério de sucesso mensurável.',
    '- Cada meta com 3 a 5 ações seguindo 70-20-10: "70" = prática no trabalho real, "20" = troca (mentoria, feedback, acompanhar colegas), "10" = estudo formal (curso, livro). No total do plano, a maioria deve ser 70.',
    '- Ações começam com verbo e são concretas (quantidade, com quem, onde). Nada genérico como "melhorar comunicação".',
    '- resumo: 2 frases explicando a lógica do plano.',
    'Não use ferramentas. Responda APENAS com JSON válido:',
    '{"resumo":"...","metas":[{"title":"...","competency":"...","type":"tecnica","weeks":8,"successCriteria":"...","description":"...","actions":[{"title":"...","kind":"70"}]}]}',
  ].filter(Boolean).join('\n');
  try {
    const out = await claudeTexto(prompt);
    const a = out.indexOf('{'), z = out.lastIndexOf('}');
    const j = a >= 0 && z > a ? parseJSON(out.slice(a, z + 1), null) : null;
    if (!j || !Array.isArray(j.metas)) throw new Error('resposta da IA fora do formato');
    const goals = cleanTplGoals(j.metas).map(g => Object.assign(g, { weeks: Math.min(g.weeks, Math.round(meses * 4.3)) }));
    if (!goals.length) throw new Error('a IA não sugeriu metas');
    res.json({ summary: String(j.resumo || '').slice(0, 1000), months: meses, goals });
  } catch (e) {
    console.error('[pdi] generate', e.message);
    erro(res, 500, 'não consegui gerar agora: ' + e.message);
  }
});

// PDIs
router.get('/:id', (req, res) => {
  const p = stmt.pdi.get(req.params.id);
  if (!p) return erro(res, 404, 'PDI não encontrado');
  res.json({ pdi: pdiOut(p, true) });
});
router.post('/', (req, res) => {
  const b = req.body || {};
  const person = txt(b.person, 120);
  if (!person) return erro(res, 400, 'informe de quem é o PDI');
  const inicio = dataOk(b.cycleStart) || hoje();
  const fim = dataOk(b.cycleEnd) || somaDias(inicio, 180);
  if (fim <= inicio) return erro(res, 400, 'o fim do ciclo precisa ser depois do início');
  const tpl = b.templateId ? stmt.template.get(String(b.templateId)) : null;
  const id = newId();
  db.transaction(() => {
    db.prepare(`INSERT INTO pdis (id, person, role, manager, cycle_start, cycle_end, status, template_id, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, person, txt(b.role, 120) || '', txt(b.manager, 120) || '', inicio, fim, ['rascunho', 'ativo', 'solicitado'].includes(b.status) ? b.status : 'ativo', tpl ? tpl.id : null, txt(b.summary, 2000) || '', Date.now(), Date.now());
    if (tpl) aplicarTemplate(id, tpl, inicio);
    else if (Array.isArray(b.goals)) cleanTplGoals(b.goals).forEach((g, i) => addGoal(id, g, i, somaDias(inicio, g.weeks * 7))); // estrutura gerada pela IA
  })();
  res.json({ pdi: pdiOut(stmt.pdi.get(id), true) });
});
router.patch('/:id', (req, res) => {
  const p = stmt.pdi.get(req.params.id);
  if (!p) return erro(res, 404, 'PDI não encontrado');
  const b = req.body || {};
  const o = {};
  if (b.person !== undefined) { o.person = txt(b.person, 120); if (!o.person) return erro(res, 400, 'informe de quem é o PDI'); }
  if (b.role !== undefined) o.role = txt(b.role, 120);
  if (b.manager !== undefined) o.manager = txt(b.manager, 120);
  if (b.cycleStart !== undefined) o.cycle_start = dataOk(b.cycleStart);
  if (b.cycleEnd !== undefined) o.cycle_end = dataOk(b.cycleEnd);
  if (b.status !== undefined) o.status = ['rascunho', 'ativo', 'concluido', 'solicitado'].includes(b.status) ? b.status : p.status;
  if (b.summary !== undefined) o.summary = txt(b.summary, 2000);
  const ini = o.cycle_start !== undefined ? o.cycle_start : p.cycle_start, fim = o.cycle_end !== undefined ? o.cycle_end : p.cycle_end;
  if (ini && fim && fim <= ini) return erro(res, 400, 'o fim do ciclo precisa ser depois do início');
  const k = Object.keys(o);
  if (k.length) db.prepare(`UPDATE pdis SET ${k.map(x => x + ' = @' + x).join(', ')}, updated_at = @now WHERE id = @id`).run(Object.assign({ id: p.id, now: Date.now() }, o));
  res.json({ pdi: pdiOut(stmt.pdi.get(p.id), true) });
});
router.delete('/:id', (req, res) => {
  const p = stmt.pdi.get(req.params.id);
  if (!p) return erro(res, 404, 'PDI não encontrado');
  db.transaction(() => {
    stmt.goals.all(p.id).forEach(g => db.prepare(`DELETE FROM pdi_actions WHERE goal_id = ?`).run(g.id));
    db.prepare(`DELETE FROM pdi_goals WHERE pdi_id = ?`).run(p.id);
    db.prepare(`DELETE FROM pdi_checkins WHERE pdi_id = ?`).run(p.id);
    db.prepare(`DELETE FROM pdis WHERE id = ?`).run(p.id);
  })();
  res.json({ ok: true });
});
router.post('/:id/goals', (req, res) => {
  const p = stmt.pdi.get(req.params.id);
  if (!p) return erro(res, 404, 'PDI não encontrado');
  const b = req.body || {};
  const title = txt(b.title, 160);
  if (!title) return erro(res, 400, 'título da meta obrigatório');
  addGoal(p.id, { title, competency: txt(b.competency, 80), type: b.type, description: txt(b.description, 1000), successCriteria: txt(b.successCriteria, 500) },
    stmt.goals.all(p.id).length, dataOk(b.dueDate) || p.cycle_end);
  touch(p.id);
  res.json({ pdi: pdiOut(stmt.pdi.get(p.id), true) });
});
router.post('/:id/checkins', (req, res) => {
  const p = stmt.pdi.get(req.params.id);
  if (!p) return erro(res, 404, 'PDI não encontrado');
  const b = req.body || {};
  const note = txt(b.note, 3000);
  if (!note) return erro(res, 400, 'escreva como está a evolução');
  const mood = Math.max(1, Math.min(5, parseInt(b.mood, 10) || 3));
  db.prepare(`INSERT INTO pdi_checkins (id, pdi_id, date, author, mood, note, progress, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(newId(), p.id, dataOk(b.date) || hoje(), txt(b.author, 120) || ME, mood, note, pdiOut(p).progress, Date.now());
  touch(p.id);
  res.json({ pdi: pdiOut(stmt.pdi.get(p.id), true) });
});

module.exports = { router };
