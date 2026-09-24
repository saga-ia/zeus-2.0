const express = require('express');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3022;
const DB_PATH = path.join(__dirname, 'data/comercial.db');
const WORKER_DB = '/opt/jeff-worker/data/worker.db';

const ANTHROPIC_API_KEY = (() => {
  try {
    const env = fs.readFileSync('/opt/jeff-worker/.env', 'utf8');
    const m = env.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    return m ? m[1].trim() : null;
  } catch { return null; }
})();

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS clinicas_estados (
    uf TEXT PRIMARY KEY,
    estado TEXT NOT NULL,
    regiao TEXT NOT NULL,
    cidades TEXT,
    quantidade INTEGER,
    inscritos_2025 INTEGER DEFAULT 0,
    notas TEXT,
    fonte TEXT,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS pesquisas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT,
    finished_at TEXT,
    status TEXT,
    summary TEXT,
    raw TEXT
  );
`);
try { db.exec('ALTER TABLE clinicas_estados ADD COLUMN inscritos_2025 INTEGER DEFAULT 0'); } catch {}

const UF_NOMES = {
  AC:'Acre', AL:'Alagoas', AM:'Amazonas', AP:'Amapá', BA:'Bahia', CE:'Ceará',
  DF:'Distrito Federal', ES:'Espírito Santo', GO:'Goiás', MA:'Maranhão',
  MG:'Minas Gerais', MS:'Mato Grosso do Sul', MT:'Mato Grosso', PA:'Pará',
  PB:'Paraíba', PE:'Pernambuco', PI:'Piauí', PR:'Paraná', RJ:'Rio de Janeiro',
  RN:'Rio Grande do Norte', RO:'Rondônia', RR:'Roraima', RS:'Rio Grande do Sul',
  SC:'Santa Catarina', SE:'Sergipe', SP:'São Paulo', TO:'Tocantins'
};
const UF_REGIAO = {
  AC:'Norte', AM:'Norte', AP:'Norte', PA:'Norte', RO:'Norte', RR:'Norte', TO:'Norte',
  AL:'Nordeste', BA:'Nordeste', CE:'Nordeste', MA:'Nordeste', PB:'Nordeste', PE:'Nordeste', PI:'Nordeste', RN:'Nordeste', SE:'Nordeste',
  DF:'Centro-Oeste', GO:'Centro-Oeste', MS:'Centro-Oeste', MT:'Centro-Oeste',
  ES:'Sudeste', MG:'Sudeste', RJ:'Sudeste', SP:'Sudeste',
  PR:'Sul', RS:'Sul', SC:'Sul'
};

const SEED = [
  { uf:'SP', estado:'São Paulo', regiao:'Sudeste', cidades:'São Paulo (capital), Guarulhos, Campinas, São Bernardo do Campo, Santo André, Jundiaí, Sorocaba', quantidade:null, notas:'Maior malha de clínicas privadas e centros de referência. Centro TEA em Santana é o 1º da América Latina. Mercado saturado na capital — CPC alto.', fonte:'pesquisa-2026-05-06' },
  { uf:'MG', estado:'Minas Gerais', regiao:'Sudeste', cidades:'Belo Horizonte, Contagem, Uberlândia, Juiz de Fora', quantidade:null, notas:'Foco em BH e Triângulo Mineiro (Uberlândia, Uberaba). Uberlândia é "blue ocean" — alta população diagnosticada, densidade de clínicas menor.', fonte:'pesquisa-2026-05-06' },
  { uf:'RJ', estado:'Rio de Janeiro', regiao:'Sudeste', cidades:'Rio de Janeiro, Niterói, Duque de Caxias, São Gonçalo', quantidade:null, notas:'Concentração massiva na capital (Botafogo, Piedade, Sulacap), com expansão para Região Serrana e Lagos.', fonte:'pesquisa-2026-05-06' },
  { uf:'PR', estado:'Paraná', regiao:'Sul', cidades:'Curitiba, Maringá, Londrina, Ponta Grossa', quantidade:350, notas:'~350 pontos de atenção especializados. Um dos estados mais estruturados em rede pública+privada. Curitiba saturada.', fonte:'pesquisa-2026-05-06' },
  { uf:'RS', estado:'Rio Grande do Sul', regiao:'Sul', cidades:'Porto Alegre e região metropolitana', quantidade:null, notas:'Foco em Porto Alegre. Alta densidade na região metropolitana.', fonte:'pesquisa-2026-05-06' },
  { uf:'BA', estado:'Bahia', regiao:'Nordeste', cidades:'Salvador, Feira de Santana, Vitória da Conquista', quantidade:null, notas:'4ª maior população diagnosticada do Brasil (~145 mil pessoas). Demanda alta represada. Feira de Santana = blue ocean.', fonte:'pesquisa-2026-05-06' },
  { uf:'PE', estado:'Pernambuco', regiao:'Nordeste', cidades:'Recife, Petrolina', quantidade:null, notas:'Polo de crescimento. Recife concentra a maior parte da rede.', fonte:'pesquisa-2026-05-06' },
  { uf:'GO', estado:'Goiás', regiao:'Centro-Oeste', cidades:'Goiânia, Itumbiara', quantidade:null, notas:'Goiânia concentra a rede multidisciplinar.', fonte:'pesquisa-2026-05-06' },
  { uf:'DF', estado:'Distrito Federal', regiao:'Centro-Oeste', cidades:'Brasília (Asa Norte, Taguatinga)', quantidade:null, notas:'Asa Norte e Taguatinga são os polos.', fonte:'pesquisa-2026-05-06' }
];

const seedInsert = db.prepare(`
  INSERT OR IGNORE INTO clinicas_estados (uf, estado, regiao, cidades, quantidade, notas, fonte, updated_at)
  VALUES (@uf, @estado, @regiao, @cidades, @quantidade, @notas, @fonte, datetime('now'))
`);
const seedTx = db.transaction((rows) => { for (const r of rows) seedInsert.run(r); });
if (db.prepare('SELECT COUNT(*) AS n FROM clinicas_estados').get().n === 0) {
  seedTx(SEED);
}

(function carregarInscritos2025() {
  try {
    const file = '/opt/jeff-cigc/comercial/CIGC-2025/inscritos-2025.json';
    if (!fs.existsSync(file)) return;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const counts = {};
    for (const r of (data.records || [])) {
      const uf = (r.UF || '').toString().trim().toUpperCase();
      if (!uf || uf.length !== 2) continue;
      counts[uf] = (counts[uf] || 0) + 1;
    }
    const upsertSimples = db.prepare(`
      INSERT INTO clinicas_estados (uf, estado, regiao, cidades, quantidade, inscritos_2025, notas, fonte, updated_at)
      VALUES (@uf, @estado, @regiao, '', null, @inscritos, '', 'inscritos-2025', datetime('now'))
      ON CONFLICT(uf) DO UPDATE SET inscritos_2025 = excluded.inscritos_2025
    `);
    const tx = db.transaction((entries) => {
      for (const [uf, n] of entries) {
        upsertSimples.run({
          uf, inscritos: n,
          estado: UF_NOMES[uf] || uf,
          regiao: UF_REGIAO[uf] || ''
        });
      }
    });
    tx(Object.entries(counts));
    console.log(`[cigc-comercial] inscritos 2025: ${Object.values(counts).reduce((a,b)=>a+b,0)} total, ${Object.keys(counts).length} estados`);
  } catch (e) {
    console.error('[cigc-comercial] erro carregar inscritos 2025:', e.message);
  }
})();

const upsertEstado = db.prepare(`
  INSERT INTO clinicas_estados (uf, estado, regiao, cidades, quantidade, notas, fonte, updated_at)
  VALUES (@uf, @estado, @regiao, @cidades, @quantidade, @notas, @fonte, datetime('now'))
  ON CONFLICT(uf) DO UPDATE SET
    estado = excluded.estado,
    regiao = excluded.regiao,
    cidades = excluded.cidades,
    quantidade = excluded.quantidade,
    notas = excluded.notas,
    fonte = excluded.fonte,
    updated_at = excluded.updated_at
`);

const insertPesquisa = db.prepare(`
  INSERT INTO pesquisas (started_at, finished_at, status, summary, raw)
  VALUES (@started_at, @finished_at, @status, @summary, @raw)
`);

// ─── Auth ─────────────────────────────────────────────────────────────────────
const AUTH_SALT = 'jeff-alpha-2026';
const AUTH_HASH = 'c87024690d8e99d03de873f3bc3fd46d2e1736947b5bdd4e0a924a47e41e87721d257e2b72c1fb72400fbc31aab0f00f031b485582f6a8a11c855c4a2c35d57b';
const sessions = new Map();
// Senha redefinida pelo "Esqueci minha senha" fica em data/auth-override.json e vale no lugar do AUTH_HASH.
const pwdReset = require('/opt/jeff-apps/jeff-shared/password-reset');
const pwdOverride = pwdReset.overrideStore(path.join(__dirname, 'data'));
function verifyPwd(pwd) {
  const viaOverride = pwdOverride.check(pwd);
  if (viaOverride !== null) return viaOverride;
  try {
    const test = crypto.scryptSync(pwd, AUTH_SALT, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(AUTH_HASH, 'hex'));
  } catch { return false; }
}
function newSession() {
  const tok = crypto.randomBytes(32).toString('hex');
  sessions.set(tok, Date.now() + 30 * 24 * 60 * 60 * 1000);
  return tok;
}
function parseCookies(req) {
  const list = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) list[k.trim()] = decodeURIComponent(v.join('='));
  });
  return list;
}
function getSession(req) {
  const exp = sessions.get(parseCookies(req).sid);
  return exp && exp > Date.now();
}
function requireAuth(req, res, next) {
  if (!getSession(req)) return res.redirect('/login');
  next();
}
function apiAuth(req, res, next) {
  if (!getSession(req)) return res.status(401).json({ error: 'unauthorized' });
  next();
}
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));


pwdReset.mount(app, {
  appName: 'CIGC Comercial',
  setPassword: (newPass) => { pwdOverride.write(newPass); sessions.clear(); return true; }
});

app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.post('/api/login', express.urlencoded({ extended: false }), (req, res) => {
  if (!verifyPwd(req.body.password || '')) return res.redirect('/login?error=1');
  const tok = newSession();
  res.set('Set-Cookie', `sid=${tok}; HttpOnly; Path=/; Max-Age=${30 * 24 * 3600}`);
  res.redirect('/');
});
app.get('/api/logout', (req, res) => {
  const c = parseCookies(req);
  if (c.sid) sessions.delete(c.sid);
  res.set('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
  res.redirect('/login');
});
app.get('/', requireAuth, (_req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

app.get('/api/estados', apiAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT uf, estado, regiao, cidades, quantidade, inscritos_2025, notas, fonte, updated_at
    FROM clinicas_estados
    ORDER BY inscritos_2025 DESC, estado
  `).all();
  const totalInscritos = rows.reduce((a,r)=>a+(r.inscritos_2025||0), 0);
  const last = db.prepare(`SELECT started_at, finished_at, status, summary FROM pesquisas ORDER BY id DESC LIMIT 1`).get();
  res.json({ estados: rows, totalInscritos2025: totalInscritos, ultimaPesquisa: last || null });
});

app.get('/api/pesquisas', apiAuth, (req, res) => {
  const rows = db.prepare(`SELECT id, started_at, finished_at, status, summary FROM pesquisas ORDER BY id DESC LIMIT 30`).all();
  res.json({ pesquisas: rows });
});

let runningResearch = false;
app.post('/api/atualizar', apiAuth, async (req, res) => {
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ ok:false, error:'ANTHROPIC_API_KEY ausente' });
  if (runningResearch) return res.status(409).json({ ok:false, error:'pesquisa já em andamento' });
  runningResearch = true;
  const startedAt = new Date().toISOString();
  try {
    const prompt = `Você é um pesquisador de mercado. Pesquise NA WEB AGORA (use a ferramenta web_search) a distribuição atualizada de clínicas multidisciplinares e centros de tratamento para autismo (TEA) no Brasil, por estado. Quero saber:
1. Estados com maior concentração de clínicas TEA (públicas + privadas).
2. Cidades-hotspot dentro de cada estado (top 4-7 por estado).
3. Quantidade aproximada quando der pra estimar (CNES, AMA, APAE, diretórios estaduais).
4. Diferenças vs. pesquisa anterior, se conseguir comparar.

Foque em fontes oficiais: CNES, Ministério da Saúde, secretarias estaduais, AMA Brasil, APAE.

Retorne **EXCLUSIVAMENTE** JSON válido neste formato (sem markdown, sem texto extra antes/depois):
{
  "summary": "resumo curto, 2-4 linhas, falando o que mudou ou confirmou",
  "estados": [
    {"uf":"SP","estado":"São Paulo","regiao":"Sudeste","cidades":"São Paulo, Guarulhos, ...","quantidade":null,"notas":"texto curto"}
  ]
}

Use UF padrão (SP, MG, RJ, PR, RS, BA, PE, GO, DF, etc). Inclua TODOS os estados que tiverem dado relevante. quantidade pode ser null se não tiver número confiável.`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      const finishedAt = new Date().toISOString();
      insertPesquisa.run({ started_at: startedAt, finished_at: finishedAt, status: 'error', summary: data?.error?.message || 'erro API', raw: JSON.stringify(data).slice(0, 50000) });
      runningResearch = false;
      return res.status(502).json({ ok:false, error: data?.error?.message || 'erro API', detail: data });
    }

    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    let parsed;
    const m = text.match(/\{[\s\S]*\}/);
    try { parsed = JSON.parse(m ? m[0] : text); } catch (e) { parsed = null; }

    const finishedAt = new Date().toISOString();

    if (!parsed || !Array.isArray(parsed.estados)) {
      insertPesquisa.run({ started_at: startedAt, finished_at: finishedAt, status: 'parse_error', summary: 'JSON inválido', raw: text.slice(0, 50000) });
      runningResearch = false;
      return res.status(502).json({ ok:false, error:'resposta da pesquisa não veio em JSON válido', text: text.slice(0, 2000) });
    }

    const upTx = db.transaction((rows) => {
      for (const r of rows) {
        if (!r || !r.uf) continue;
        upsertEstado.run({
          uf: String(r.uf).toUpperCase(),
          estado: r.estado || r.uf,
          regiao: r.regiao || '',
          cidades: r.cidades || '',
          quantidade: typeof r.quantidade === 'number' ? r.quantidade : null,
          notas: r.notas || '',
          fonte: 'web-search-' + new Date().toISOString().slice(0,10)
        });
      }
    });
    upTx(parsed.estados);

    insertPesquisa.run({
      started_at: startedAt,
      finished_at: finishedAt,
      status: 'ok',
      summary: parsed.summary || `Atualizou ${parsed.estados.length} estados.`,
      raw: text.slice(0, 50000)
    });

    runningResearch = false;
    res.json({ ok:true, summary: parsed.summary, total: parsed.estados.length, finishedAt });
  } catch (err) {
    const finishedAt = new Date().toISOString();
    try { insertPesquisa.run({ started_at: startedAt, finished_at: finishedAt, status:'exception', summary: String(err.message || err), raw: String(err.stack || err) }); } catch {}
    runningResearch = false;
    res.status(500).json({ ok:false, error: String(err.message || err) });
  }
});

app.get('/healthz', (_req, res) => res.json({ ok:true, port: PORT }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[cigc-comercial] up on ${PORT}`);
});
