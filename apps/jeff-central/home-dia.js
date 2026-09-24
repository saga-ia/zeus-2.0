// "Seu dia" da home com dados reais: tarefas do ClickUp (cache local do worker, sincronizado a cada 5 min
// por clickup-sync.py) e tarefas do Agente de Ações (w_tasks). Só leitura.
const express = require('express');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const CENTRAL_DB = path.join(DATA_DIR, 'central.db');
const WORKER_DB = process.env.WORKER_DB_PATH || '/opt/jeff-worker/data/worker.db';
const SYNC_LOG = '/opt/jeff-worker/logs/clickup-sync.log';
const DIA_MS = 86400000;
const PRIO = { 1: ['urgente', '#C0341C'], 2: ['alta', '#673DE6'], 3: ['normal', '#66666F'], 4: ['baixa', '#66666F'] };
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

// Dia BRT (UTC-3) como AAAA-MM-DD; o servidor não está em BRT
function diaBRT(ms) { return new Date(ms - 3 * 3600000).toISOString().slice(0, 10); }
function diffDias(dueMs, agora) {
  const a = Date.UTC(...diaBRT(agora).split('-').map(Number).map((v, i) => i === 1 ? v - 1 : v));
  const b = Date.UTC(...diaBRT(dueMs).split('-').map(Number).map((v, i) => i === 1 ? v - 1 : v));
  return Math.round((b - a) / DIA_MS);
}
function rotuloPrazo(dueMs, agora) {
  if (!dueMs) return { text: 'sem prazo', color: '#66666F', d: null };
  const d = diffDias(dueMs, agora);
  if (d < 0) return { text: d === -1 ? 'venceu ontem' : `venceu há ${-d} dias`, color: '#C0341C', d };
  if (d === 0) return { text: 'hoje', color: '#673DE6', d };
  if (d === 1) return { text: 'amanhã', color: '#3C3C44', d };
  if (d < 7) return { text: 'vence ' + DIAS[new Date(dueMs - 3 * 3600000).getUTCDay()], color: '#3C3C44', d };
  const dt = new Date(dueMs - 3 * 3600000);
  return { text: `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}`, color: '#66666F', d };
}
function horaBRT(ms) {
  const d = new Date(ms - 3 * 3600000);
  return `${String(d.getUTCHours()).padStart(2, '0')}h${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
function quando(ms, agora) {
  const d = diffDias(ms, agora);
  if (d === 0) return horaBRT(ms);
  if (d === -1) return 'ontem ' + horaBRT(ms);
  const dt = new Date(ms - 3 * 3600000);
  return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}
function parse(v, d) { try { return JSON.parse(v); } catch (_) { return d; } }
function primeiroNome(u) { const n = String(u.username || u.email || 'sem dono').split(/[\s@]/)[0]; return n.charAt(0).toUpperCase() + n.slice(1); }

function tarefaOut(t, agora) {
  const prazo = rotuloPrazo(t.due_date, agora);
  const p = PRIO[t.priority] || ['sem prioridade', '#66666F'];
  const donos = parse(t.assignees_json, []).map(primeiroNome);
  return { id: t.task_id, title: t.name, list: t.list_name || '', status: t.status || '', prio: p[0], prioColor: p[1],
    due: prazo.text, dueColor: prazo.color, dueDays: prazo.d, url: t.url, owners: donos };
}

function lerClickup(agora) {
  if (!fs.existsSync(WORKER_DB)) return { ok: false, motivo: 'banco do worker não encontrado' };
  const db = new Database(WORKER_DB, { readonly: true, fileMustExist: true });
  try {
    const abertas = db.prepare(`SELECT * FROM clickup_tasks_cache WHERE status_type != 'closed' AND (parent_id IS NULL OR parent_id = '') ORDER BY due_date IS NULL, due_date, priority IS NULL, priority`).all();
    const recentes = db.prepare(`SELECT * FROM clickup_tasks_cache WHERE date_updated IS NOT NULL ORDER BY date_updated DESC LIMIT 8`).all();
    const sync = db.prepare(`SELECT MAX(cached_at) AS c FROM clickup_tasks_cache`).get();
    const tarefas = abertas.map(t => tarefaOut(t, agora));
    const ciclo = { atrasadas: [], hoje: [], caminho: [] };
    tarefas.forEach(t => {
      if (t.dueDays !== null && t.dueDays < 0) ciclo.atrasadas.push(t);
      else if (t.dueDays === 0) ciclo.hoje.push(t);
      else ciclo.caminho.push(t);
    });
    ciclo.caminho = ciclo.caminho.filter(t => t.dueDays === null || t.dueDays <= 14);
    // Carga por pessoa: tarefas abertas atribuídas; sem dono vira "Sem responsável"
    const carga = {};
    tarefas.forEach(t => (t.owners.length ? t.owners : ['Sem responsável']).forEach(n => {
      carga[n] = carga[n] || { name: n, count: 0, overdue: 0 };
      carga[n].count++; if (t.dueDays !== null && t.dueDays < 0) carga[n].overdue++;
    }));
    const time = Object.values(carga).sort((a, b) => b.count - a.count).slice(0, 8);
    const atualizacoes = recentes.map(t => {
      const fechada = t.status_type === 'closed' || t.date_closed;
      const criada = t.date_created && t.date_updated && (t.date_updated - t.date_created) < 60000;
      const quem = parse(t.assignees_json, []).map(primeiroNome)[0];
      return { kind: fechada ? 'Tarefa concluída' : criada ? 'Tarefa criada' : 'Tarefa atualizada',
        text: `${t.name}${quem ? ' · ' + quem : ''}${t.list_name ? ' · ' + t.list_name : ''}`, when: quando(t.date_updated, agora), url: t.url };
    });
    // Hora da última sincronização: o log do clickup-sync.py é tocado a cada rodada (*/5 min); fallback: cached_at (UTC) do item mais recente
    let syncMs = null;
    try { syncMs = fs.statSync(SYNC_LOG).mtimeMs; } catch (_) { syncMs = sync && sync.c ? Date.parse(sync.c.replace(' ', 'T') + 'Z') : null; }
    return { ok: true, sync_at: syncMs, sync_min: syncMs ? Math.round((agora - syncMs) / 60000) : null, abertas: tarefas.length, ciclo, time,
      overdue_total: ciclo.atrasadas.length, atualizacoes };
  } finally { db.close(); }
}

function lerAcoes(agora) {
  try {
    const db = new Database(CENTRAL_DB, { readonly: true, fileMustExist: true });
    try {
      return db.prepare(`SELECT id, title, prio, due FROM w_tasks WHERE done = 0 ORDER BY CASE prio WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, COALESCE(due, '9999') LIMIT 10`).all()
        .map(t => {
          const dueMs = t.due ? Date.parse(t.due + 'T12:00:00-03:00') : null;
          const prazo = rotuloPrazo(dueMs, agora);
          return { id: t.id, title: t.title, prio: t.prio, due: prazo.text, dueColor: prazo.color, dueDays: prazo.d, origem: 'acoes' };
        });
    } finally { db.close(); }
  } catch (_) { return []; }
}

function dia() {
  const agora = Date.now();
  let clickup;
  try { clickup = lerClickup(agora); } catch (e) { clickup = { ok: false, motivo: e.message }; }
  const acoes = lerAcoes(agora);
  // Prioridades: o que vence hoje ou já venceu (ClickUp + Agente de Ações), depois o resto por prazo
  const doClickup = clickup.ok ? clickup.ciclo.atrasadas.concat(clickup.ciclo.hoje).map(t => Object.assign({ origem: 'clickup' }, t)) : [];
  const prioridades = doClickup.concat(acoes.filter(a => a.dueDays !== null && a.dueDays <= 0))
    .concat(acoes.filter(a => a.dueDays === null || a.dueDays > 0))
    .concat(clickup.ok ? clickup.ciclo.caminho.map(t => Object.assign({ origem: 'clickup' }, t)) : [])
    .slice(0, 6);
  return { agora, clickup, acoes_pendentes: acoes.length, prioridades };
}

const router = express.Router();
router.get('/dia', (_req, res) => {
  try { res.json(dia()); } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = { router, dia };
