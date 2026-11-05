// Execução Comercial: fontes de dados de vendas (Fase 1 do Diagnóstico e da Auditoria de Vendas).
// - WhatsApp: os números conectados na Evolution entram na base de vendas (schema zv) ligados a um vendedor/setor.
// - Planilha/CRM: CSV ou Excel exportado do CRM vira linhas em zv.lead_import, com mapeamento de colunas.
// A base fica no Postgres da Evolution; a IA só lê pelo bin/consulta-sql (papel zeus_ro, schema zv).
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const multer = require('multer');

const CONTAINER = process.env.ZV_PG_CONTAINER || 'jeff-evolution-postgres';
const upload = multer({ dest: path.join(os.tmpdir(), 'zv-import'), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

// ─── Postgres (como dono do schema; a IA nunca passa por aqui) ────────────────
const lit = (v) => (v === null || v === undefined || v === '') ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'";
function pg(sql, input) {
  const r = spawnSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'evolution', '-d', 'evolution', '-X', '-q', '--csv', '-v', 'ON_ERROR_STOP=1', ...(input ? ['-c', sql] : [])],
    { input: input || sql, encoding: 'utf8', timeout: 60000, maxBuffer: 50 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error((r.stderr || 'falha no banco').replace(/^psql:[^:]*:\d+: /gm, '').trim().slice(0, 400));
  return parseCSV(r.stdout || '');
}
const rows = (sql) => { const t = pg(sql); const [h, ...d] = t; return h ? d.map((l) => Object.fromEntries(h.map((k, i) => [k, l[i]]))) : []; };
// Versões assíncronas (2026-10-04): o pg() com spawnSync congelava o servidor inteiro 300-450 ms a cada consulta
// (perfil de CPU: era a única causa das travadas, a cada rodada de transcrição de áudio). Use estas no lugar.
function pgAsync(sql, input) {
  return new Promise((ok, falha) => {
    const p = spawn('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'evolution', '-d', 'evolution', '-X', '-q', '--csv', '-v', 'ON_ERROR_STOP=1', ...(input ? ['-c', sql] : [])]);
    let out = '', err = '', tam = 0, fim = false;
    const timer = setTimeout(() => { if (!fim) { fim = true; try { p.kill('SIGKILL'); } catch (_) {} falha(new Error('banco não respondeu em 60 s')); } }, 60000);
    p.stdout.on('data', (d) => { tam += d.length; if (tam > 50 * 1024 * 1024) { try { p.kill('SIGKILL'); } catch (_) {} } else out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { if (!fim) { fim = true; clearTimeout(timer); falha(e); } });
    p.on('close', (code) => {
      if (fim) return; fim = true; clearTimeout(timer);
      if (code !== 0) return falha(new Error((err || 'falha no banco').replace(/^psql:[^:]*:\d+: /gm, '').trim().slice(0, 400)));
      try { ok(parseCSV(out)); } catch (e) { falha(e); }
    });
    p.stdin.on('error', () => {});
    p.stdin.end(input || sql);
  });
}
const rowsAsync = async (sql) => { const t = await pgAsync(sql); const [h, ...d] = t; return h ? d.map((l) => Object.fromEntries(h.map((k, i) => [k, l[i]]))) : []; };

// ─── CSV e Excel ─────────────────────────────────────────────────────────────
function parseCSV(txt, sep) {
  txt = String(txt || '').replace(/^﻿/, '');
  if (!sep) { const l = txt.split('\n')[0] || ''; sep = (l.match(/;/g) || []).length > (l.match(/,/g) || []).length ? ';' : (l.includes('\t') && !l.includes(',') ? '\t' : ','); }
  const out = []; let row = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"' && cur === '') q = true; // aspas só abrem campo no começo dele
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x !== '')) out.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some((x) => x !== '')) out.push(row);
  return out;
}
function lerArquivo(file) {
  const nome = (file.originalname || '').toLowerCase();
  if (/\.(xlsx|xlsm)$/.test(nome)) {
    const py = 'import csv,sys,openpyxl\nwb=openpyxl.load_workbook(sys.argv[1],read_only=True,data_only=True)\nws=wb.worksheets[0]\nw=csv.writer(sys.stdout)\nfor r in ws.iter_rows(values_only=True):\n  w.writerow(["" if v is None else (v.isoformat() if hasattr(v,"isoformat") else v) for v in r])';
    const r = spawnSync('python3', ['-c', py, file.path], { encoding: 'utf8', timeout: 60000, maxBuffer: 80 * 1024 * 1024 });
    if (r.status !== 0) throw new Error('não consegui ler a planilha Excel: ' + (r.stderr || '').trim().split('\n').pop());
    return parseCSV(r.stdout, ',');
  }
  if (/\.(csv|txt|tsv)$/.test(nome)) {
    let buf = fs.readFileSync(file.path), txt = buf.toString('utf8');
    if (txt.includes('�')) txt = buf.toString('latin1'); // exportações antigas em ISO-8859-1
    return parseCSV(txt);
  }
  throw new Error('envie CSV ou Excel (.xlsx)');
}

// ─── mapeamento de colunas ───────────────────────────────────────────────────
const CAMPOS = [
  ['data', 'Data de entrada do lead', /^(data|dt|criad|created|entrada|data.?(de.?)?(cria|entrada|cadastro)|date)/],
  ['nome', 'Nome do lead / cliente', /^(nome|name|cliente|lead|contato|razao)/],
  ['telefone', 'Telefone / WhatsApp', /(telefone|celular|whats|fone|phone|tel\b)/],
  ['origem', 'Origem / canal', /(origem|fonte|canal|source|utm|campanha|midia)/],
  ['etapa', 'Etapa do funil', /(etapa|fase|stage|pipeline|funil|est[aá]gio)/],
  ['status', 'Status (ganho, perdido, aberto)', /^(status|situa|resultado)/],
  ['valor', 'Valor do negócio', /(valor|value|amount|pre[cç]o|ticket|receita|montante)/],
  ['vendedor', 'Vendedor / responsável', /(vendedor|respons|owner|corretor|consultor|atendente|usu[aá]rio)/],
  ['produto', 'Produto / serviço', /(produto|servi[cç]o|plano|item|imovel|im[oó]vel|tipo)/],
  ['motivo_perda', 'Motivo de perda', /(motivo|perda|lost|raz[aã]o)/],
  ['data_fechamento', 'Data de fechamento', /(fechament|ganho.?em|closed|venda.?em|data.?(da.?)?venda)/],
];
function sugerir(cabecalho) {
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const usado = new Set(), map = {};
  // fechamento antes de data, para "data de fechamento" não virar a data de entrada
  ['data_fechamento', 'motivo_perda'].concat(CAMPOS.map((c) => c[0])).forEach((campo) => {
    if (map[campo] !== undefined) return;
    const re = CAMPOS.find((c) => c[0] === campo)[2];
    const i = cabecalho.findIndex((h, j) => !usado.has(j) && re.test(norm(h)));
    if (i >= 0) { map[campo] = i; usado.add(i); }
  });
  return map;
}
function numero(v) {
  let s = String(v || '').replace(/[^\d,.\-]/g, ''); if (!s) return null;
  if (s.includes(',') && (!s.includes('.') || s.lastIndexOf(',') > s.lastIndexOf('.'))) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
  const n = Number(s); return isFinite(n) ? n : null;
}
function data(v) {
  const s = String(v || '').trim(); if (!s) return null;
  let m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (m) { const a = m[3].length === 2 ? '20' + m[3] : m[3]; return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')} ${m[4] ? m[4].padStart(2, '0') + ':' + m[5] : '00:00'}:00-03`; }
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4] ? m[4] + ':' + m[5] : '00:00'}:00-03`;
  return null;
}

// Importações em preparo (arquivo lido, esperando o usuário confirmar o mapeamento)
const preparos = new Map();
setInterval(() => { const lim = Date.now() - 30 * 60000; for (const [k, v] of preparos) if (v.criado < lim) preparos.delete(k); }, 10 * 60000).unref();

// Todo número da Evolution entra nas análises automaticamente; o vendedor começa com o nome do perfil do WhatsApp.
// Quem quiser tira um número ou ajusta vendedor/setor na página do WhatsApp (o que a pessoa mudou não é sobrescrito).
function sincronizarInstancias() {
  return pgAsync(`INSERT INTO zv.instancia (nome, vendedor, ativo) SELECT i.name, NULLIF(COALESCE(i."profileName", ''), ''), true FROM public."Instance" i ON CONFLICT (nome) DO NOTHING;
      UPDATE zv.instancia z SET vendedor = i."profileName" FROM public."Instance" i WHERE i.name = z.nome AND COALESCE(z.vendedor, '') = '' AND COALESCE(i."profileName", '') <> ''`);
}

// ─── rotas ───────────────────────────────────────────────────────────────────
const router = express.Router();

router.get('/fontes', async (_req, res) => {
  try {
    try { await sincronizarInstancias(); } catch (e) { console.error('[vendas] sincronizar números:', e.message); }
    const inst = await rowsAsync(`SELECT i.name AS nome, i."connectionStatus"::text AS status, i.number AS numero, i."profileName" AS perfil,
        z.vendedor, z.setor, COALESCE(z.ativo, false) AS ativo,
        (SELECT count(*) FROM public."Message" m WHERE m."instanceId" = i.id) AS mensagens,
        (SELECT to_char(max(to_timestamp(m."messageTimestamp")) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') FROM public."Message" m WHERE m."instanceId" = i.id) AS ultima
      FROM public."Instance" i LEFT JOIN zv.instancia z ON z.nome = i.name ORDER BY i.name`);
    const lotes = await rowsAsync(`SELECT lote, fonte, count(*) AS linhas, to_char(min(importado_em) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS importado_em
      FROM zv.lead_import GROUP BY lote, fonte ORDER BY min(importado_em) DESC`);
    const tot = (await rowsAsync(`SELECT (SELECT count(*) FROM zv.msg WHERE NOT is_sistema) AS mensagens, (SELECT count(*) FROM zv.conversa WHERE NOT is_group) AS conversas, (SELECT count(*) FROM zv.lead_import) AS leads`))[0] || {};
    res.json({ instancias: inst.map((x) => Object.assign(x, { ativo: x.ativo === 't', mensagens: +x.mensagens || 0 })), lotes: lotes.map((l) => Object.assign(l, { linhas: +l.linhas })),
      totais: { mensagens: +tot.mensagens || 0, conversas: +tot.conversas || 0, leads: +tot.leads || 0 }, campos: CAMPOS.map(([id, rotulo]) => ({ id, rotulo })) });
  } catch (e) { res.status(502).json({ error: 'base de vendas indisponível: ' + e.message }); }
});

router.put('/instancias/:nome', async (req, res) => {
  const b = req.body || {}, nome = String(req.params.nome).slice(0, 120);
  try {
    if (!(await rowsAsync(`SELECT 1 AS ok FROM public."Instance" WHERE name = ${lit(nome)}`)).length) return res.status(404).json({ error: 'número não encontrado na Evolution' });
    await pgAsync(`INSERT INTO zv.instancia (nome, vendedor, setor, ativo, atualizado_em) VALUES (${lit(nome)}, ${lit(String(b.vendedor || '').trim().slice(0, 80))}, ${lit(String(b.setor || '').trim().slice(0, 80))}, ${b.ativo ? 'true' : 'false'}, now())
      ON CONFLICT (nome) DO UPDATE SET vendedor = excluded.vendedor, setor = excluded.setor, ativo = excluded.ativo, atualizado_em = now()`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/importar/preview', upload.single('arquivo'), (req, res) => {
  const f = req.file; if (!f) return res.status(400).json({ error: 'envie um arquivo' });
  try {
    const t = lerArquivo(f).filter((r) => r.some((c) => String(c).trim()));
    if (t.length < 2) return res.status(400).json({ error: 'a planilha precisa de cabeçalho e pelo menos uma linha' });
    const cab = t[0].map((h, i) => String(h).trim() || 'Coluna ' + (i + 1)), linhas = t.slice(1, 50001);
    const token = crypto.randomBytes(9).toString('hex');
    preparos.set(token, { cab, linhas, nome: f.originalname, criado: Date.now() });
    res.json({ token, arquivo: f.originalname, cabecalho: cab, amostra: linhas.slice(0, 5), total: linhas.length, sugestao: sugerir(cab), campos: CAMPOS.map(([id, rotulo]) => ({ id, rotulo })) });
  } catch (e) { res.status(400).json({ error: e.message }); }
  finally { fs.rm(f.path, { force: true }, () => {}); }
});

router.post('/importar/confirmar', async (req, res) => {
  const b = req.body || {}, p = preparos.get(String(b.token || ''));
  if (!p) return res.status(410).json({ error: 'a prévia expirou: envie o arquivo de novo' });
  const map = b.mapeamento || {};
  if (!Object.values(map).some((i) => Number.isInteger(i))) return res.status(400).json({ error: 'ligue pelo menos uma coluna a um campo' });
  const fonte = String(b.fonte || p.nome).trim().slice(0, 80) || 'Planilha';
  const lote = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 16) + ' · ' + fonte;
  const col = (r, campo) => Number.isInteger(map[campo]) ? String(r[map[campo]] ?? '').trim() : '';
  const usados = new Set(Object.values(map).filter(Number.isInteger));
  const csvCel = (v) => v === null || v === '' ? '' : '"' + String(v).replace(/"/g, '""') + '"';
  const corpo = p.linhas.map((r) => {
    const extra = {}; p.cab.forEach((h, i) => { if (!usados.has(i) && String(r[i] ?? '').trim()) extra[h] = String(r[i]).trim().slice(0, 500); });
    return [lote, fonte, data(col(r, 'data')), col(r, 'nome'), col(r, 'telefone').replace(/\D/g, '') || null, col(r, 'origem'), col(r, 'etapa'), col(r, 'status'),
      numero(col(r, 'valor')), col(r, 'vendedor'), col(r, 'produto'), col(r, 'motivo_perda'), data(col(r, 'data_fechamento')), Object.keys(extra).length ? JSON.stringify(extra) : null]
      .map((v) => csvCel(v === '' ? null : v)).join(',');
  }).join('\n') + '\n';
  try {
    await pgAsync(`\\copy zv.lead_import (lote, fonte, data, nome, telefone, origem, etapa, status, valor, vendedor, produto, motivo_perda, data_fechamento, extra) FROM pstdin WITH (FORMAT csv)`, corpo);
    preparos.delete(b.token);
    res.json({ ok: true, lote, linhas: p.linhas.length });
  } catch (e) { res.status(500).json({ error: 'não consegui gravar: ' + e.message }); }
});

router.delete('/lotes', async (req, res) => {
  const lote = String((req.query && req.query.lote) || '');
  if (!lote) return res.status(400).json({ error: 'informe o lote' });
  try { await pgAsync(`DELETE FROM zv.lead_import WHERE lote = ${lit(lote)}`); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = { router, pg, rows, lit, sincronizarInstancias, _parseCSV: parseCSV, _sugerir: sugerir, _numero: numero, _data: data, pgAsync, rowsAsync };
