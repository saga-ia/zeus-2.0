// Execução Comercial › Qualidade: conversas REAIS do WhatsApp comercial com nota da IA (Auditoria de Vendas por conversa).
// GET /api/vendas/qualidade            → conversas dos últimos 90 dias + auditoria (nota, critérios, acertos, erros) quando houver
// GET /api/vendas/qualidade/conversa   → trecho real da conversa (?instancia=&jid=)
// GET /api/vendas/qualidade/status     → fila do avaliador automático
// Avaliador automático: audita, uma por vez, as conversas com movimento nos últimos 30 dias que ainda não têm nota
// (ou que tiveram mensagem nova depois da nota e estão paradas há 6 h). Roda de hora em hora.
const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

const router = express.Router();
const CONTAINER = process.env.ZV_PG_CONTAINER || 'jeff-evolution-postgres';
const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const db = new Database(path.join(DATA_DIR, 'central.db'));
const HORA = 3600000, DIA = 24 * HORA;

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
const idOk = (v) => /^[\w@.:+\-§]{1,120}$/.test(String(v || ''));
const brt = (s) => s ? new Date(s.replace(' ', 'T') + '-03:00').getTime() : 0;

function auditorias() {
  const m = new Map();
  for (const r of db.prepare("SELECT alvo, resultado, gerado_em FROM vendas_aud WHERE modo = 'conversa'").all()) {
    try { m.set(r.alvo, Object.assign(JSON.parse(r.resultado), { gerado_em: r.gerado_em })); } catch (_) {}
  }
  return m;
}

// ─── Lista para a tela ───────────────────────────────────────────────────────
router.get('/qualidade', async (_req, res) => {
  try {
    const rows = await psql(`SELECT c.instancia, coalesce(c.vendedor, c.instancia), c.jid, coalesce(nullif(c.nome, ''), c.telefone, ''), coalesce(c.telefone, ''),
        to_char(c.primeira_msg, 'YYYY-MM-DD HH24:MI:SS'), to_char(c.ultima_msg, 'YYYY-MM-DD HH24:MI:SS'), c.total_msgs, c.msgs_cliente, c.msgs_nossas, c.aguardando_resposta,
        (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY r.minutos))::numeric, 1) FROM zv.resposta r WHERE r.instancia = c.instancia AND r.jid = c.jid AND r.minutos IS NOT NULL)
      FROM zv.conversa c WHERE NOT c.is_group AND c.msgs_nossas >= 1 AND c.ultima_msg >= now()::timestamp - interval '90 days' ORDER BY c.ultima_msg DESC LIMIT 1500;`);
    const aud = auditorias();
    let id = 0;
    const conversas = rows.map(([instancia, vendedor, jid, nome, telefone, pri, ult, total, cli, nossas, aguard, resp]) => {
      const a = aud.get(instancia + '|' + jid) || null;
      return { id: ++id, instancia, jid, vendedor, nome: nome || 'Sem nome', telefone, criado: brt(pri), ultima: brt(ult),
        total: +total || 0, msgsCliente: +cli || 0, msgsNossas: +nossas || 0, aguardando: aguard === 't', respMin: resp === '' || resp == null ? null : +resp,
        auditoria: a ? { nota: a.nota, criterios: a.criterios || [], acertos: a.acertos || [], erros: a.erros || [], resumo: a.resumo || '', etapa: a.etapa || '',
          proximo_passo: a.proximo_passo || '', mensagem_sugerida: a.mensagem_sugerida || '', objecoes: a.objecoes || [], em: a.gerado_em } : null };
    });
    res.json({ conversas, status: statusFila() });
  } catch (e) { res.status(502).json({ error: 'não consegui ler as conversas: ' + e.message }); }
});

router.get('/qualidade/conversa', async (req, res) => {
  const { instancia, jid } = req.query || {};
  if (!idOk(instancia) || !idOk(jid)) return res.status(400).json({ error: 'conversa inválida' });
  try {
    const rows = await psql(`SELECT * FROM (SELECT to_char(ts, 'YYYY-MM-DD HH24:MI:SS'), from_me, coalesce(push_name, ''),
        CASE WHEN texto IS NOT NULL AND texto <> '' THEN left(texto, 600) WHEN is_audio THEN '[áudio]' WHEN is_midia THEN '[' || tipo || ']' ELSE '' END
      FROM zv.msg WHERE instancia = ${lit(instancia)} AND jid = ${lit(jid)} AND NOT is_sistema ORDER BY ts DESC LIMIT 40) x ORDER BY 1;`);
    res.json({ mensagens: rows.map(([ts, fromMe, nome, texto]) => ({ ts: brt(ts), nossa: fromMe === 't', nome, texto })).filter((m) => m.texto) });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// ─── Avaliador automático ────────────────────────────────────────────────────
const fila = { pendentes: [], rodando: null, feitasNaRodada: 0, erros: 0, ultimoErro: '', pausadoAte: 0, ultimaVarredura: 0 };
function statusFila() {
  return { pendentes: fila.pendentes.length + (fila.rodando ? 1 : 0), avaliando: fila.rodando ? fila.rodando.nome : '', feitas_na_rodada: fila.feitasNaRodada,
    ultimo_erro: fila.ultimoErro, pausado_ate: fila.pausadoAte > Date.now() ? fila.pausadoAte : 0, ultima_varredura: fila.ultimaVarredura };
}
router.get('/qualidade/status', (_req, res) => res.json(statusFila()));

async function varrer() {
  if (fila.rodando || fila.pendentes.length) return;
  fila.ultimaVarredura = Date.now();
  try {
    const rows = await psql(`SELECT instancia, jid, coalesce(nullif(nome, ''), telefone, ''), to_char(ultima_msg, 'YYYY-MM-DD HH24:MI:SS')
      FROM zv.conversa WHERE NOT is_group AND msgs_nossas >= 1 AND msgs_cliente >= 1 AND total_msgs >= 4
        AND ultima_msg >= now()::timestamp - interval '30 days' ORDER BY ultima_msg DESC;`);
    const aud = auditorias(), agora = Date.now();
    fila.pendentes = rows.filter(([inst, jid, , ult]) => {
      if (!idOk(inst) || !idOk(jid)) return false;
      const a = aud.get(inst + '|' + jid), u = brt(ult);
      if (!a) return true;
      return u > a.gerado_em && agora - u > 6 * HORA; // conversa andou depois da nota e já esfriou
    }).map(([instancia, jid, nome]) => ({ instancia, jid, nome }));
    fila.feitasNaRodada = 0;
    if (fila.pendentes.length) console.log('[qualidade] fila de avaliação:', fila.pendentes.length, 'conversas');
  } catch (e) { fila.ultimoErro = e.message; console.error('[qualidade] varrer:', e.message); }
  proxima();
}

// A IA lê o banco pelo papel zeus_ro (bin/consulta-sql). Sem permissão, não adianta gastar cota: espera e tenta de novo.
function iaLeBanco() {
  return new Promise((ok) => {
    const p = spawn(path.join(__dirname, 'bin', 'consulta-sql'), ['SELECT 1 AS ok FROM zv.instancia LIMIT 1']);
    let out = '';
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    p.on('close', (c) => ok(c === 0 && !/ERRO/.test(out)));
    p.on('error', () => ok(false));
  });
}
async function proxima() {
  if (fila.rodando || !fila.pendentes.length || Date.now() < fila.pausadoAte) return;
  if (!(await iaLeBanco())) {
    fila.ultimoErro = 'a IA ainda não tem permissão de ler as conversas (papel zeus_ro). Tentando de novo em 10 min.';
    setTimeout(proxima, 10 * 60000).unref();
    return;
  }
  const ia = require('./vendas-ia');
  const c = fila.pendentes.shift();
  fila.rodando = c;
  try {
    const job = await ia.iniciarAuditoria({ modo: 'conversa', instancia: c.instancia, jid: c.jid, nome: c.nome.slice(0, 80), user: { email: 'zeus-qualidade-auto' } });
    const t0 = Date.now();
    while (['preparando', 'contexto', 'analisando'].includes(job.status) && Date.now() - t0 < 20 * 60000) await new Promise((r) => setTimeout(r, 5000));
    if (job.status === 'pronto') { fila.feitasNaRodada++; fila.erros = 0; fila.ultimoErro = ''; }
    else throw new Error(job.erro || 'auditoria não terminou (' + job.status + ')');
  } catch (e) {
    fila.erros++; fila.ultimoErro = e.message;
    console.error('[qualidade] auditoria', c.nome, e.message);
    if (fila.erros >= 3) { fila.pausadoAte = Date.now() + HORA; fila.pendentes.unshift(c); fila.erros = 0; console.error('[qualidade] 3 erros seguidos: pausa de 1 h'); }
  }
  fila.rodando = null;
  setTimeout(proxima, 20000).unref();
}

if (process.env.CENTRAL_SEM_AGENDADORES !== '1' && process.env.CENTRAL_QUALIDADE_AUTO !== '0') {
  setTimeout(varrer, 90000).unref();
  setInterval(() => { if (Date.now() >= fila.pausadoAte) { if (fila.pendentes.length) proxima(); else varrer(); } }, HORA).unref();
}

module.exports = { router, varrer, statusFila };
