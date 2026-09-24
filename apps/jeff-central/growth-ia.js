// Motor de Growth: "Análise dos Anúncios IA". Lê a conta Meta no período, pede diagnóstico ao Claude
// e devolve ações que podem ser aplicadas direto na conta (pausar, ativar, mudar orçamento diário).
// A análise roda em segundo plano (a tela consulta o job), porque passa do tempo do proxy.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');
const claudeSpawn = require('./claude-spawn');
const data = require('./growth-data');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const WORKDIR = path.join(DATA_DIR, 'growth-ia-workdir');
const TIMEOUT_MS = 4 * 60 * 1000;
const NO_TOOLS = ['Bash', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task', 'Agent', 'Read', 'Glob', 'Grep'];

const db = new Database(path.join(DATA_DIR, 'central.db'));
db.exec(`CREATE TABLE IF NOT EXISTS growth_actions (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, tipo TEXT NOT NULL, nivel TEXT NOT NULL, obj_id TEXT NOT NULL,
  obj_nome TEXT, antes TEXT, depois TEXT, motivo TEXT, user_email TEXT, ok INTEGER NOT NULL, erro TEXT, created_at INTEGER NOT NULL)`);
const logIns = db.prepare(`INSERT INTO growth_actions (id, account_id, tipo, nivel, obj_id, obj_nome, antes, depois, motivo, user_email, ok, erro, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const num = (v) => Number(v) || 0;
const r2 = (v) => Math.round(num(v) * 100) / 100;
const resultado = (m) => m.leads + m.conversas + m.compras;

// ─── coleta ──────────────────────────────────────────────────────────────────
async function coletar(accountId, preset, incluirInativas) {
  const id = data.actId(accountId), acc = 'act_' + id, token = await data.tokenFor(id);
  const range = data.resolveRange({ preset });
  const tr = { since: range.since, until: range.until }, F = 'spend,impressions,clicks,reach,frequency,actions,action_values';
  const [camps, sets, ads, insC, insS, insA] = await Promise.all([
    data.graphAll(acc + '/campaigns', { fields: 'id,name,objective,effective_status,daily_budget,lifetime_budget', limit: 200 }, token, 3),
    data.graphAll(acc + '/adsets', { fields: 'id,name,campaign_id,effective_status,daily_budget,lifetime_budget,optimization_goal', limit: 200 }, token, 3),
    data.graphAll(acc + '/ads', { fields: 'id,name,adset_id,campaign_id,effective_status,creative{title,body,call_to_action_type}', limit: 200 }, token, 3),
    data.graphAll(acc + '/insights', { fields: 'campaign_id,' + F, time_range: tr, level: 'campaign', limit: 200 }, token, 3).catch(() => []),
    data.graphAll(acc + '/insights', { fields: 'adset_id,' + F, time_range: tr, level: 'adset', limit: 200 }, token, 3).catch(() => []),
    data.graphAll(acc + '/insights', { fields: 'ad_id,' + F, time_range: tr, level: 'ad', sort: ['spend_descending'], limit: 200 }, token, 2).catch(() => []),
  ]);
  const ins = (rows, k) => Object.fromEntries(rows.map((r) => [r[k], data.metrics(r)]));
  const mC = ins(insC, 'campaign_id'), mS = ins(insS, 'adset_id'), mA = ins(insA, 'ad_id');
  const ativo = (st) => incluirInativas || st === 'ACTIVE';
  const resumo = (m) => m ? { gasto: r2(m.spend), impressoes: m.impressions, cliques: m.clicks, ctr: r2(m.ctr), cpc: r2(m.cpc), cpm: r2(m.cpm), frequencia: r2(m.frequency),
    leads: m.leads, conversas: m.conversas, compras: m.compras, receita: r2(m.receita), custo_por_resultado: resultado(m) ? r2(m.spend / resultado(m)) : null } : null;
  const campanhas = camps.filter((c) => ativo(c.effective_status) || mC[c.id]).map((c) => ({ id: c.id, nome: c.name, objetivo: c.objective, status: c.effective_status,
    orcamento_diario: c.daily_budget ? num(c.daily_budget) / 100 : null, orcamento_total: c.lifetime_budget ? num(c.lifetime_budget) / 100 : null, metricas: resumo(mC[c.id]) }));
  const conjuntos = sets.filter((s) => ativo(s.effective_status) || mS[s.id]).map((s) => ({ id: s.id, nome: s.name, campanha_id: s.campaign_id, status: s.effective_status,
    otimizacao: s.optimization_goal, orcamento_diario: s.daily_budget ? num(s.daily_budget) / 100 : null, metricas: resumo(mS[s.id]) }));
  const anuncios = ads.filter((a) => ativo(a.effective_status) || mA[a.id]).map((a) => ({ id: a.id, nome: a.name, conjunto_id: a.adset_id, campanha_id: a.campaign_id, status: a.effective_status,
    titulo: a.creative && a.creative.title ? String(a.creative.title).slice(0, 120) : undefined, texto: a.creative && a.creative.body ? String(a.creative.body).slice(0, 220) : undefined,
    metricas: resumo(mA[a.id]) })).sort((x, y) => ((y.metricas && y.metricas.gasto) || 0) - ((x.metricas && x.metricas.gasto) || 0)).slice(0, 80);
  const conta = (await data.listAccounts()).accounts.find((a) => a.id === id) || { id, name: id, currency: 'BRL' };
  return { conta, periodo: range, campanhas, conjuntos, anuncios };
}

// ─── IA ──────────────────────────────────────────────────────────────────────
function prompt(d, pergunta) {
  return [
    'Você é um gestor de tráfego sênior analisando uma conta de Meta Ads para decidir o que fazer HOJE.',
    'Pedido do usuário: "' + (pergunta || 'Faça o diagnóstico geral da conta e diga o que ajustar.') + '"',
    'Conta: ' + d.conta.name + ' (moeda ' + (d.conta.currency || 'BRL') + '). Período: ' + d.periodo.label + ' (' + d.periodo.since + ' a ' + d.periodo.until + ').',
    '', 'CAMPANHAS:', JSON.stringify(d.campanhas), '', 'CONJUNTOS DE ANÚNCIOS:', JSON.stringify(d.conjuntos), '', 'ANÚNCIOS (top por gasto):', JSON.stringify(d.anuncios), '',
    'Responda SOMENTE com um JSON válido, sem markdown nem texto fora dele, neste formato:',
    '{"headline":"frase curta com o insight principal","resumo":"3 a 5 frases diretas do que está funcionando, o que não está e por quê",' +
    '"kpis":[{"label":"Gasto","value":"R$ 1.234","trend":"up|down|flat"}],' +
    '"vencedores":[{"nome":"...","por_que":"...","metrica":"..."}],"perdedores":[{"nome":"...","por_que":"...","metrica":"..."}],' +
    '"acoes":[{"tipo":"pausar|ativar|orcamento|manual","nivel":"campaign|adset|ad","id":"id exato do objeto","nome":"nome do objeto","novo_orcamento_diario":150,"motivo":"por que, com números","impacto":"o que se espera","prioridade":"alta|media|baixa"}]}',
    'Regras das ações:',
    '- 3 a 8 ações, da mais importante para a menos.',
    '- "pausar" e "ativar" valem para campaign, adset ou ad. "orcamento" só para campaign ou adset que JÁ TENHAM orcamento_diario, com novo_orcamento_diario em reais entre 50% e 200% do atual.',
    '- Use SEMPRE o id exato que aparece nos dados. Nunca invente id.',
    '- O que não dá para aplicar por API (criar criativo, mudar público, mexer na página) vai como "manual", sem id.',
    '- Não sugira pausar o que já está pausado nem ativar o que já está ativo.',
    '- kpis: 4 a 6. vencedores e perdedores: até 4 cada.',
  ].join('\n');
}
function rodarClaude(texto) {
  return new Promise((resolve) => {
    if (!fs.existsSync(WORKDIR)) fs.mkdirSync(WORKDIR, { recursive: true });
    const args = ['-p', '--output-format', 'json', '--model', 'sonnet', ...claudeSpawn.commonArgs(), '--disallowedTools', NO_TOOLS.join(' ')];
    const proc = spawn(claudeSpawn.CLAUDE_BIN, args, { cwd: WORKDIR, stdio: ['pipe', 'pipe', 'pipe'], env: claudeSpawn.claudeEnv() });
    let out = '', err = '';
    const timer = setTimeout(() => { try { proc.kill('SIGTERM'); } catch (_) {} }, TIMEOUT_MS);
    proc.stdout.on('data', (c) => { out += c; });
    proc.stderr.on('data', (c) => { err += c; });
    proc.on('close', (code) => {
      clearTimeout(timer);
      let txt = '';
      try { const j = JSON.parse(out); txt = j.result || ''; if (j.is_error) return resolve({ error: txt || 'falha do Claude' }); } catch (_) { txt = out; }
      if (!txt) return resolve({ error: (err.slice(-300) || 'exit ' + code) });
      resolve({ text: txt });
    });
    proc.on('error', (e) => { clearTimeout(timer); resolve({ error: e.message }); });
    proc.stdin.on('error', () => {});
    proc.stdin.end(texto);
  });
}
// Só passa ação que aponta para objeto real da conta e respeita os limites
function validarAcoes(acoes, d) {
  const obj = { campaign: new Map(d.campanhas.map((c) => [c.id, c])), adset: new Map(d.conjuntos.map((s) => [s.id, s])), ad: new Map(d.anuncios.map((a) => [a.id, a])) };
  return (Array.isArray(acoes) ? acoes : []).slice(0, 10).map((a, i) => {
    const base = { key: 'a' + i, tipo: String(a.tipo || 'manual'), nivel: a.nivel, id: a.id ? String(a.id) : null, nome: String(a.nome || '').slice(0, 200),
      motivo: String(a.motivo || '').slice(0, 600), impacto: String(a.impacto || '').slice(0, 300), prioridade: ['alta', 'media', 'baixa'].includes(a.prioridade) ? a.prioridade : 'media' };
    const o = base.id && obj[base.nivel] && obj[base.nivel].get(base.id);
    const manual = () => Object.assign(base, { tipo: 'manual', id: null, nivel: null });
    if (base.tipo === 'manual' || !o) return manual();
    base.nome = o.nome; base.status_atual = o.status;
    if (base.tipo === 'pausar') return o.status === 'PAUSED' ? null : base;
    if (base.tipo === 'ativar') return o.status === 'ACTIVE' ? null : base;
    if (base.tipo === 'orcamento') {
      const atual = o.orcamento_diario, novo = r2(a.novo_orcamento_diario);
      if (base.nivel === 'ad' || !atual || !novo || novo < atual * 0.5 || novo > atual * 2 || novo === atual) return manual();
      return Object.assign(base, { orcamento_atual: atual, novo_orcamento_diario: novo });
    }
    return manual();
  }).filter(Boolean);
}
function parse(text, d) {
  const t = String(text || ''), a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    const j = JSON.parse(t.slice(a, b + 1));
    const lista = (x) => (Array.isArray(x) ? x : []).slice(0, 4).map((v) => ({ nome: String(v.nome || ''), por_que: String(v.por_que || ''), metrica: String(v.metrica || '') }));
    return { headline: String(j.headline || ''), resumo: String(j.resumo || ''),
      kpis: (Array.isArray(j.kpis) ? j.kpis : []).slice(0, 6).map((k) => ({ label: String(k.label || ''), value: String(k.value || ''), trend: ['up', 'down', 'flat'].includes(k.trend) ? k.trend : 'flat' })),
      vencedores: lista(j.vencedores), perdedores: lista(j.perdedores), acoes: validarAcoes(j.acoes, d) };
  } catch (_) { return null; }
}

// ─── jobs ────────────────────────────────────────────────────────────────────
const jobs = new Map();
function iniciar(accountId, preset, incluirInativas, pergunta) {
  const id = crypto.randomBytes(8).toString('hex');
  const job = { id, status: 'coletando', criado: Date.now() };
  jobs.set(id, job);
  for (const [k, v] of jobs) if (Date.now() - v.criado > 60 * 60 * 1000) jobs.delete(k);
  (async () => {
    try {
      const d = await coletar(accountId, preset, incluirInativas);
      if (!d.campanhas.length && !d.anuncios.length) throw new Error('Nenhuma campanha ' + (incluirInativas ? '' : 'ativa ') + 'com dados neste período.');
      job.status = 'analisando';
      const r = await rodarClaude(prompt(d, pergunta));
      if (r.error) throw new Error(/limit/i.test(r.error) ? 'Limite de uso da conta Claude atingido: ' + r.error : 'A IA não respondeu: ' + r.error);
      const analise = parse(r.text, d);
      if (!analise) throw new Error('A IA respondeu fora do formato esperado. Tente de novo.');
      Object.assign(job, { status: 'pronto', resultado: Object.assign(analise, { conta: { id: d.conta.id, name: d.conta.name, currency: d.conta.currency }, periodo: d.periodo, pergunta: pergunta || '' }) });
    } catch (e) { Object.assign(job, { status: 'erro', erro: e.message }); console.error('[growth-ia]', e.message); }
  })();
  return id;
}

// ─── aplicar ação na conta ───────────────────────────────────────────────────
async function aplicar(accountId, a, user) {
  const id = data.actId(accountId);
  if (!['pausar', 'ativar', 'orcamento'].includes(a.tipo)) throw new Error('ação não aplicável');
  if (!['campaign', 'adset', 'ad'].includes(a.nivel) || !/^\d{5,25}$/.test(String(a.id || ''))) throw new Error('objeto inválido');
  if (a.tipo === 'orcamento' && a.nivel === 'ad') throw new Error('anúncio não tem orçamento');
  const token = await data.tokenFor(id);
  // Confere na Meta que o objeto é desta conta e lê o estado atual antes de mexer
  const o = await data.graph(String(a.id), { fields: 'account_id,name,effective_status,' + (a.nivel === 'ad' ? 'status' : 'daily_budget') }, token);
  if (data.actId(o.account_id) !== id) throw new Error('este objeto não pertence à conta selecionada');
  const corpo = {}; let antes, depois;
  if (a.tipo === 'pausar') { corpo.status = 'PAUSED'; antes = o.effective_status; depois = 'PAUSED'; }
  if (a.tipo === 'ativar') { corpo.status = 'ACTIVE'; antes = o.effective_status; depois = 'ACTIVE'; }
  if (a.tipo === 'orcamento') {
    const atual = num(o.daily_budget) / 100, novo = r2(a.novo_orcamento_diario);
    if (!atual) throw new Error('este objeto não usa orçamento diário');
    if (!novo || novo < atual * 0.5 || novo > atual * 2) throw new Error('o novo orçamento precisa ficar entre 50% e 200% do atual (' + atual.toFixed(2) + ')');
    corpo.daily_budget = String(Math.round(novo * 100)); antes = atual.toFixed(2); depois = novo.toFixed(2);
  }
  const logar = (ok, erro) => logIns.run(crypto.randomBytes(6).toString('hex'), id, a.tipo, a.nivel, String(a.id), o.name || a.nome || '', String(antes), String(depois),
    String(a.motivo || '').slice(0, 600), (user && user.email) || null, ok ? 1 : 0, erro || null, Date.now());
  try {
    const r = await fetch(data.GRAPH + '/' + a.id, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(Object.assign({}, corpo, { access_token: token })), signal: AbortSignal.timeout(30000) });
    const j = await r.json();
    if (j.error) throw new Error(j.error.error_user_msg || j.error.message || 'erro da Meta');
    logar(true); console.log('[growth-ia] aplicado', a.tipo, a.nivel, a.id, antes, '->', depois, (user && user.email) || '');
    return { ok: true, nome: o.name, antes, depois };
  } catch (e) { logar(false, e.message); throw e; }
}

module.exports = { iniciar, jobs, aplicar, coletar, prompt, validarAcoes };
