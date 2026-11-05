// Gasto com IA de imagem (Nano Banana / GPT Image): cada imagem gerada ou editada vira uma linha em ia_imagem_gastos.
// Quem grava: design.js (Agente de Design da Central e o CLI tools/design) e os scripts do worker
// (ilustra.sh e editar-imagem.sh, via /opt/jeff-worker/scripts/gasto-ia-imagem.py). Preços em ia-precos.json (fonte única).
// Google: custo calculado pelos tokens que a API devolve (exato). OpenAI: preço por imagem da tabela (estimado).
// Histórico anterior ao registro (criações do Agente de Design) entra uma vez, estimado pela tabela, com origem 'historico'.
const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const db = new Database(path.join(DATA_DIR, 'central.db'));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS ia_imagem_gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  em INTEGER NOT NULL,              -- ms
  origem TEXT NOT NULL,             -- design (Central), ilustra, editar-imagem, historico
  motor TEXT NOT NULL,              -- gemini | openai
  modelo TEXT,
  operacao TEXT,                    -- gerar | editar
  custo_usd REAL NOT NULL,
  estimado INTEGER NOT NULL DEFAULT 1,
  tokens_in INTEGER, tokens_out INTEGER,
  criacao_id TEXT, usuario TEXT, detalhe TEXT
);
CREATE INDEX IF NOT EXISTS idx_ia_gastos_em ON ia_imagem_gastos(em);`);

const PRECOS_ARQ = path.join(__dirname, 'ia-precos.json');
const precos = () => { try { return JSON.parse(fs.readFileSync(PRECOS_ARQ, 'utf8')); } catch (_) { return {}; } };

// usage: Gemini usageMetadata ou OpenAI usage. Devolve { custo, estimado, tin, tout }
function custo(motor, modelo, usage, qualidade) {
  const P = precos(), p = P[modelo] || P[motor === 'gemini' ? 'gemini-3-pro-image' : 'gpt-image-2.5-flare'] || {};
  if (motor === 'gemini' && usage && usage.candidatesTokenCount) {
    const img = (usage.candidatesTokensDetails || []).filter(x => x.modality === 'IMAGE').reduce((a, x) => a + (x.tokenCount || 0), 0) || usage.candidatesTokenCount;
    const txt = Math.max(0, usage.candidatesTokenCount - img) + (usage.thoughtsTokenCount || 0);
    const c = (usage.promptTokenCount || 0) * p.usd_milhao_in / 1e6 + img * p.usd_milhao_out_imagem / 1e6 + txt * p.usd_milhao_out_texto / 1e6;
    return { custo: +c.toFixed(5), estimado: 0, tin: usage.promptTokenCount || null, tout: usage.candidatesTokenCount + (usage.thoughtsTokenCount || 0) };
  }
  const base = qualidade === 'high' && p.usd_imagem_high ? p.usd_imagem_high : p.usd_imagem;
  return { custo: base || 0, estimado: 1, tin: usage && (usage.input_tokens || usage.promptTokenCount) || null, tout: usage && (usage.output_tokens || usage.candidatesTokenCount) || null };
}
const stIns = db.prepare(`INSERT INTO ia_imagem_gastos (em, origem, motor, modelo, operacao, custo_usd, estimado, tokens_in, tokens_out, criacao_id, usuario, detalhe)
  VALUES (@em, @origem, @motor, @modelo, @operacao, @custo_usd, @estimado, @tokens_in, @tokens_out, @criacao_id, @usuario, @detalhe)`);
function registrar(o) {
  try {
    const c = custo(o.motor, o.modelo, o.usage, o.qualidade);
    stIns.run({ em: o.em || Date.now(), origem: o.origem || 'design', motor: o.motor, modelo: o.modelo || null, operacao: o.operacao || 'gerar',
      custo_usd: c.custo, estimado: c.estimado, tokens_in: c.tin, tokens_out: c.tout, criacao_id: o.criacao_id || null, usuario: o.usuario || null, detalhe: o.detalhe ? String(o.detalhe).slice(0, 300) : null });
  } catch (e) { console.error('[ia-gastos] registrar', e.message); }
}

// Histórico: criações do Agente de Design feitas antes deste registro existir (uma vez só)
function importarHistorico() {
  if (db.prepare(`SELECT 1 FROM ia_imagem_gastos WHERE origem = 'historico' LIMIT 1`).get()) return 0;
  const primeiro = (db.prepare(`SELECT min(em) m FROM ia_imagem_gastos WHERE origem = 'design'`).get() || {}).m || Infinity;
  let n = 0;
  const tx = db.transaction(() => {
    for (const r of db.prepare(`SELECT id, versoes, por FROM social_criacoes`).all()) {
      let vs = []; try { vs = JSON.parse(r.versoes || '[]'); } catch (_) {}
      for (const v of vs) {
        if (!['gemini', 'openai'].includes(v.provider) || (v.em || 0) >= primeiro) continue;
        const novas = (v.imagens || []).filter(x => x.startsWith(`v${v.v}-`)).length;
        const modelo = v.provider === 'gemini' ? 'gemini-3-pro-image' : /Sunburst/i.test(v.modelo || '') ? 'gpt-image-2.5-sunburst' : /2\.5/.test(v.modelo || '') ? 'gpt-image-2.5-flare' : 'gpt-image-2';
        for (let k = 0; k < novas; k++) {
          const c = custo(v.provider, modelo, null);
          stIns.run({ em: v.em || Date.now(), origem: 'historico', motor: v.provider, modelo, operacao: v.pedido ? 'editar' : 'gerar', custo_usd: c.custo, estimado: 1,
            tokens_in: null, tokens_out: null, criacao_id: r.id, usuario: r.por || null, detalhe: 'estimado pela tabela (antes do registro)' }); n++;
        }
      }
    }
  });
  tx(); return n;
}

// Cotação do dólar (open.er-api.com, sem chave, atualiza 1x por dia), cache de 6 h; sem internet usa a última conhecida ou 5,50
let cot = { v: 5.5, em: 0, fonte: 'padrão' };
function cotacao() {
  if (Date.now() - cot.em < 6 * 3600e3) return Promise.resolve(cot);
  return new Promise(ok => {
    const req = https.get('https://open.er-api.com/v6/latest/USD', { timeout: 5000 }, r => {
      let b = ''; r.on('data', d => b += d); r.on('end', () => { try { const v = +JSON.parse(b).rates.BRL; if (v > 1) cot = { v, em: Date.now(), fonte: 'open.er-api.com' }; } catch (_) {} ok(cot); });
    });
    req.on('error', () => ok(cot)); req.on('timeout', () => { req.destroy(); ok(cot); });
  });
}

// Foto editada/ilustrada por script (editar-imagem.sh, ilustra.sh) entra depois numa arte HTML (design html):
// o gasto nasce sem criacao_id. Aqui ele ganha o dono: a 1ª criação HTML que usa aquele arquivo, feita até 6 h depois.
// Imagem reaproveitada em outra criação não é cobrada de novo (o gasto fica na primeira).
function vincularHtml() {
  const soltos = db.prepare(`SELECT id, em, detalhe FROM ia_imagem_gastos WHERE criacao_id IS NULL AND origem IN ('editar-imagem', 'ilustra') AND detalhe LIKE '%.%'`).all();
  if (!soltos.length) return 0;
  const crs = db.prepare(`SELECT id, dados, versoes FROM social_criacoes WHERE dados LIKE '%file://%' ORDER BY rowid`).all().map(r => {
    let d = {}, vs = []; try { d = JSON.parse(r.dados || '{}'); vs = JSON.parse(r.versoes || '[]'); } catch (_) {}
    const em = vs.length ? Math.min(...vs.map(v => v.em || Infinity)) : Infinity;
    return { id: r.id, em, srcs: [...(d.htmls || []).join('\n').matchAll(/file:\/\/([^"')\s]+)/g)].map(m => decodeURIComponent(m[1])) };
  }).filter(c => c.srcs.length && c.em < Infinity).sort((a, b) => a.em - b.em);
  const up = db.prepare(`UPDATE ia_imagem_gastos SET criacao_id = ? WHERE id = ? AND criacao_id IS NULL`);
  let n = 0;
  for (const g of soltos) {
    const det = String(g.detalhe).trim(), base = '/' + det.split('/').pop();
    const c = crs.find(c => c.em >= g.em && c.em - g.em <= 6 * 3600e3 && c.srcs.some(s => det.startsWith('/') ? s === det : s.endsWith(base)));
    if (c) { up.run(c.id, g.id); n++; }
  }
  return n;
}

function resumo(dias) {
  try { vincularHtml(); } catch (e) { console.error('[ia-gastos] vincular', e.message); }
  const agora = new Date(), BRT = 3 * 3600e3;
  const brt = new Date(agora.getTime() - BRT);
  const inicioMes = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), 1) + BRT;
  const inicioDia = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate()) + BRT;
  const soma = (where, ...a) => db.prepare(`SELECT count(*) n, coalesce(sum(custo_usd),0) usd FROM ia_imagem_gastos ${where}`).get(...a);
  const desde = Date.now() - (dias || 30) * 86400e3;
  return {
    total: soma(''), mes: soma('WHERE em >= ?', inicioMes), hoje: soma('WHERE em >= ?', inicioDia),
    estimadoUsd: db.prepare(`SELECT coalesce(sum(custo_usd),0) v FROM ia_imagem_gastos WHERE estimado = 1`).get().v,
    porModelo: db.prepare(`SELECT motor, modelo, count(*) n, sum(custo_usd) usd FROM ia_imagem_gastos GROUP BY motor, modelo ORDER BY usd DESC`).all(),
    porOrigem: db.prepare(`SELECT origem, count(*) n, sum(custo_usd) usd FROM ia_imagem_gastos GROUP BY origem ORDER BY usd DESC`).all(),
    porMes: db.prepare(`SELECT strftime('%Y-%m', (em - ${BRT}) / 1000, 'unixepoch') mes, count(*) n, sum(custo_usd) usd FROM ia_imagem_gastos GROUP BY mes ORDER BY mes DESC LIMIT 12`).all(),
    porDia: db.prepare(`SELECT strftime('%Y-%m-%d', (em - ${BRT}) / 1000, 'unixepoch') dia, count(*) n, sum(custo_usd) usd FROM ia_imagem_gastos WHERE em >= ? GROUP BY dia ORDER BY dia DESC`).all(desde),
    ultimos: db.prepare(`SELECT em, origem, motor, modelo, operacao, custo_usd, estimado, criacao_id, usuario, detalhe FROM ia_imagem_gastos ORDER BY em DESC LIMIT 60`).all(),
    // custo de cada criação do Estúdio (soma das imagens dela), pro selo no card
    // itens: [em, usd, estimado] de cada imagem, pra tela separar o custo por versão (a linha nasce segundos antes da versão)
    porCriacao: db.prepare(`SELECT criacao_id, em, custo_usd, estimado FROM ia_imagem_gastos WHERE criacao_id IS NOT NULL ORDER BY em`).all()
      .reduce((m, r) => { const x = m[r.criacao_id] || (m[r.criacao_id] = { n: 0, usd: 0, itens: [] }); x.n++; x.usd += r.custo_usd; x.itens.push([r.em, r.custo_usd, r.estimado]); return m; }, {}),
    desde: (db.prepare(`SELECT min(em) m FROM ia_imagem_gastos`).get() || {}).m,
  };
}

const router = express.Router();
router.get('/', async (req, res) => {
  try { importarHistorico(); } catch (e) { console.error('[ia-gastos] histórico', e.message); }
  const c = await cotacao();
  res.json(Object.assign(resumo(+req.query.dias || 30), { cotacao: c.v, cotacaoFonte: c.fonte }));
});

module.exports = { router, registrar, custo, importarHistorico, resumo, vincularHtml };
