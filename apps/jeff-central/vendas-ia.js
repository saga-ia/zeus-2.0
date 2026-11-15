// Execução Comercial › Diagnóstico: o analista de vendas com IA (Fases 2 e 3).
// Mesmo desenho do painel da imobiliária: um prompt de sistema com o conhecimento do negócio (gerado a partir do
// Perfil do Negócio do Radar ZEUS) + uma "encomenda" por tipo de leitura e período. A IA roda isolada: nenhuma
// ferramenta nativa (--tools ""), sem as configurações/CLAUDE.md do root e com UMA ferramenta MCP, `consultar`,
// que só lê o schema zv pelo papel zeus_ro. O resultado (cartões) fica guardado por tipo + período + pedido.
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const claudeSpawn = require('./claude-spawn');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const WORKDIR = path.join(DATA_DIR, 'vendas-ia-workdir');
const CONSULTA = path.join(__dirname, 'bin', 'consulta-sql');
const MCP = JSON.stringify({ mcpServers: { zv: { type: 'stdio', command: path.join(__dirname, 'bin', 'mcp-vendas.js'), args: [] } } });
const MODELO = process.env.CENTRAL_VENDAS_MODEL || 'opus';
const TIMEOUT_MS = 15 * 60 * 1000;

const db = new Database(path.join(DATA_DIR, 'central.db'));
db.exec(`CREATE TABLE IF NOT EXISTS vendas_diag (chave TEXT PRIMARY KEY, tipo TEXT NOT NULL, de TEXT NOT NULL, ate TEXT NOT NULL, pedido TEXT,
  resumo TEXT, blocos TEXT, texto TEXT, consultas TEXT, gerado_em INTEGER NOT NULL, gerado_por TEXT)`);
const kvGet = (s) => { const r = db.prepare('SELECT data FROM config_kv WHERE section = ?').get(s); try { return r ? JSON.parse(r.data) : null; } catch (_) { return null; } };
const kvSet = (s, d) => db.prepare(`INSERT INTO config_kv (section, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(section) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`).run(s, JSON.stringify(d), Date.now());
const br = (s) => String(s || '').split('-').reverse().join('/');
const md5 = (s) => crypto.createHash('md5').update(String(s || '')).digest('hex');

function consulta(sql) {
  const r = spawnSync(CONSULTA, [sql], { encoding: 'utf8', timeout: 45000 });
  if (r.status !== 0) throw new Error((r.stderr || 'falha').trim());
  const [h, ...l] = r.stdout.trim().split('\n'); const k = (h || '').split(',');
  return l.filter((x) => !x.startsWith('[')).map((x) => Object.fromEntries(x.split(',').map((v, i) => [k[i], v])));
}

// ─── Camada 1: conhecimento do negócio ───────────────────────────────────────
function empresaNome() { return (kvGet('empresa') || {}).nome || 'a empresa'; }
function perfil() { return (kvGet('negocio') || {}).campos || {}; }
const ROT_PERFIL = { empresa: 'Empresa, segmento e modelo', time: 'Time e áreas', operacao: 'Como a operação roda', setores: 'Setores e rotinas', processo: 'Processo mais crítico',
  volume: 'Volume', ferramentas: 'Ferramentas', dados: 'Onde estão os dados', dores: 'Dores e gargalos', objetivo: 'Objetivo em 90 dias' };

function rodarSemFerramentas(texto, modelo) {
  return new Promise((resolve) => {
    fs.mkdirSync(WORKDIR, { recursive: true });
    const args = ['-p', '--output-format', 'text', '--model', modelo || 'sonnet', '--effort', 'medium', '--tools', '', '--setting-sources', 'project', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'];
    const p = spawn(claudeSpawn.CLAUDE_BIN, args, { cwd: WORKDIR, env: claudeSpawn.claudeEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = ''; const t = setTimeout(() => { try { p.kill('SIGTERM'); } catch (_) {} }, 5 * 60 * 1000);
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
    p.on('close', (c) => { clearTimeout(t); const ruim = claudeSpawn.checaSaida(out, err, c); resolve(ruim ? { error: ruim } : { text: out.trim() }); });
    p.stdin.on('error', () => {}); p.stdin.end(texto);
  });
}
async function gerarContexto(por) {
  const pf = perfil(), itens = Object.keys(ROT_PERFIL).filter((k) => pf[k]);
  if (!itens.length) throw new Error('preencha o Radar ZEUS (Perfil do Negócio) antes: é dele que sai o contexto do seu mercado');
  const r = await rodarSemFerramentas([
    `Você vai escrever o trecho "o negócio" do prompt de sistema de um analista de dados comercial da empresa "${empresaNome()}".`,
    'Esse analista lê as conversas de WhatsApp do time comercial e os leads do CRM e escreve diagnósticos para a direção. Ele precisa conhecer o ramo para não usar a linguagem errada.',
    '', 'O que a empresa contou sobre si no Radar ZEUS:', ...itens.map((k) => `- ${ROT_PERFIL[k]}: ${pf[k]}`), '',
    'Escreva em Markdown, em português do Brasil, falando diretamente com o analista ("você"), estas seções e nada mais:',
    '# Como o negócio funciona (setores, quem atende, por onde o lead chega, como a venda acontece; se houver setores com ticket e ciclo diferentes, diga para nunca somá-los)',
    '# Etapas do funil deste negócio (lista em ordem, do primeiro contato ao fechamento, com o nome que o ramo usa, e as saídas típicas: onde o cliente some)',
    '# O que conta como avanço e como fechamento (sinais concretos nas conversas: ex. pediu proposta, agendou visita, mandou comprovante)',
    '# Vocabulário do ramo (termos certos e termos que NÃO se usam neste negócio; ex.: "proposta, não orçamento")',
    '# Objeções típicas deste mercado (as mais comuns, com a forma como o cliente costuma dizer)',
    '# Regras de leitura dos números (o que distorce a análise neste ramo: sazonalidade, ticket muito diferente entre produtos, ciclo longo, recorrência etc.)',
    'Seja específico para este ramo e esta empresa. Quando o Radar não informar algo, deduza o padrão do setor e marque com "(presumido)". Máximo de 900 palavras. Sem introdução nem conclusão.',
  ].join('\n'), 'sonnet');
  if (r.error) throw new Error('a IA não conseguiu gerar o contexto: ' + r.error);
  const dado = { texto: r.text.slice(0, 12000), gerado_em: Date.now(), perfil_hash: md5(JSON.stringify(pf)), editado: false, por: por || null };
  kvSet('vendas_contexto', dado);
  return dado;
}
function contextoAtual() { return kvGet('vendas_contexto'); }

const PARTE_FIXA = (empresa, negocio) => `Você é o analista de dados comercial da empresa **${empresa}**. Você escreve leituras para a direção sobre o atendimento e as vendas, consultando a base de vendas.

# Sua única ferramenta
\`consultar\` recebe \`sql\` (UMA instrução SELECT ou WITH sobre as views \`zv.*\`) e \`descricao\`. Devolve CSV e corta em 300 linhas. Nenhuma outra ferramenta existe: não tente ler arquivos nem navegar.
**A \`descricao\` de cada chamada aparece na tela para a direção.** Escreva-a sempre em português e em linguagem de negócio ("quantos clientes ficaram sem resposta"), nunca de banco de dados.

# Como responder
- Português do Brasil, direto e prático, como um analista falando com o dono da empresa.
- SEMPRE apure os números com a ferramenta antes de afirmar qualquer coisa. Nunca estime nem invente.
- Traga o número E o que ele significa para o negócio.
- Se os dados não permitirem responder, diga isso claramente.
- Não fale de SQL, tabelas, views ou colunas na resposta.

# O negócio
${negocio || '(A empresa ainda não preencheu o Radar ZEUS. Use linguagem comercial genérica e deixe claro, no resumo, que a leitura ficaria mais precisa com o Perfil do Negócio preenchido.)'}

# A base de vendas (PostgreSQL, schema zv)
**zv.instancia** — números de WhatsApp da empresa que entram na análise: nome, vendedor, setor, ativo.
**zv.msg** — uma linha por mensagem: id, instancia, vendedor, setor, ts (horário de Brasília), from_me (true = a empresa enviou), jid (identificador da conversa), is_group, jid_sem_telefone, telefone, tipo, push_name, texto (NULL quando é só mídia; áudio aparece com texto só se foi transcrito), is_midia, is_audio, is_sistema (ruído de protocolo, reação etc.).
**zv.conversa** — uma linha por conversa (instância + contato): instancia, vendedor, setor, jid, is_group, jid_sem_telefone, telefone, nome, primeira_msg, ultima_msg, ultima_msg_cliente, ultima_msg_nossa, total_msgs, msgs_cliente, msgs_nossas, msgs_midia, msgs_audio, dias_ativos, aguardando_resposta (a última mensagem é do cliente).
**zv.resposta** — um turno de atendimento por linha: instancia, vendedor, setor, jid, ts_pergunta (quando o cliente escreveu), ts_resposta, minutos (NULL = nunca respondido), dia_semana (1 = segunda), hora.
**zv.lead** — leads e negócios importados de planilha/CRM: lote, fonte, importado_em, data (entrada), nome, telefone (só dígitos), origem, etapa, status, valor, vendedor, produto, motivo_perda, data_fechamento, extra (jsonb com as colunas que não foram mapeadas).

# Regras que mudam a leitura
- Filtre SEMPRE \`NOT is_sistema\`. Para medir atendimento 1 a 1, use também \`NOT is_group\`.
- Se houver mais de um setor, separe-os em qualquer comparação. Sempre diga de qual setor e vendedor está falando.
- **Contatos sem telefone (@lid):** o WhatsApp esconde o telefone de parte das conversas (jid_sem_telefone = true). Por isso o cruzamento entre conversa e lead importado (pelo telefone) só vale para parte da base. Nunca trate lead não localizado nas conversas como abandono; ao cruzar, diga sobre quantos foi possível medir.
- **Áudio:** só tem texto quando foi transcrito. Antes de afirmar que algo "não foi dito", confira quantos áudios existem no recorte.
- **Histórico:** as conversas começam quando cada número foi conectado (veja o menor ts por instância). Comparações que cruzem essa data merecem ressalva.
- **Leads importados:** dependem do que foi importado (veja fonte e lote). Não misture lotes que se repetem; se houver duplicidade aparente, avise.
- Valores: nunca some produtos ou setores com tickets muito diferentes num total só.
- Perguntas sem período: use os últimos 90 dias e diga isso.

# Método
Comece agregando (contagens, medianas, percentuais por período, setor e vendedor). Só desça ao texto das conversas quando o achado for qualitativo (objeções, dúvidas, por que a conversa parou) — aí leia as mensagens daquele contato ordenadas por ts.`;

// ─── Camada 2: encomendas por tipo de leitura ────────────────────────────────
const TIPOS = [
  { id: 'geral', nome: 'Geral', roteiro: 'Visão geral do período: volume de conversas e de leads, velocidade de atendimento, até onde os clientes chegam no funil deste negócio, onde mais se perde, e as 2 ou 3 oportunidades mais valiosas agora. Compare com o período anterior.' },
  { id: 'atendimento', nome: 'Atendimento', roteiro: 'Tempo da primeira resposta e dos turnos (mediana e percentual respondido em até 15 minutos), horários e dias com fila, mensagens fora do expediente, conversas nunca respondidas e quem está esperando resposta agora. Compare vendedores e setores e cite nomes.' },
  { id: 'leads', nome: 'Leads e origem', roteiro: 'Quantos leads entraram, por origem/canal, por vendedor e por setor; dias sem lead; concentração em um vendedor; quais origens trazem lead que avança no funil e quais não. Cruze leads importados com conversas quando houver telefone e avise a limitação dos contatos sem telefone.' },
  { id: 'demanda', nome: 'Demanda do mercado', roteiro: 'O que os clientes estão pedindo: produtos/serviços, características, faixas de valor declaradas, urgência, perguntas mais frequentes e pedidos que a empresa atende mal ou não atende. Traga frases reais dos clientes.' },
  { id: 'funil', nome: 'Funil e propostas', roteiro: 'Funil real nas etapas deste negócio: quantos chegam em cada etapa e em quanto tempo, onde vaza, conversas que morreram depois do preço/proposta e depois de cada avanço. Use os leads importados (etapa, status, valor, fechamento) e confirme nas conversas.' },
  { id: 'objecoes', nome: 'Objeções e perdas', roteiro: 'Objeções e motivos de perda quantificados (preço, condição de pagamento, prazo, concorrência, "vou pensar" e as típicas deste mercado), com frases reais dos clientes e, no fim, respostas prontas que o time pode usar para cada objeção principal.' },
  { id: 'oportunidades', nome: 'Oportunidades', roteiro: 'Lista acionável de quem vale a pena reabrir agora: quem avançou e sumiu, quem pediu proposta ou próximo passo e ficou sem sequência, quem está esperando resposta, leads importados sem conversa. Ordene pelo valor de reabrir e cite nomes e vendedor responsável.' },
  { id: 'sob_medida', nome: 'Sob medida', roteiro: null },
];

function encomenda(tipo, de, ate, pedido, stats) {
  const t = TIPOS.find((x) => x.id === tipo) || TIPOS[0];
  const dias = Math.round((new Date(ate) - new Date(de)) / 86400000) + 1;
  const ad = new Date(new Date(de) - dias * 86400000).toISOString().slice(0, 10), aa = new Date(new Date(de) - 86400000).toISOString().slice(0, 10);
  const mais1 = new Date(new Date(ate).getTime() + 86400000).toISOString().slice(0, 10);
  const roteiro = t.id === 'sob_medida' ? `Responda exatamente a isto, que a direção escreveu:\n"${pedido}"\nSe a base não permitir responder alguma parte, dedique um bloco do tipo "diagnostico" a dizer o que falta.` : t.roteiro;
  return [
    `Escreva o diagnóstico **${t.nome}** da empresa para o período de ${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')} (${dias} dias).`, '',
    '# O recorte',
    'Todas as suas consultas de conversas devem ficar dentro deste período:', `    ts >= '${de}' AND ts < '${mais1}'`,
    `(para leads importados, use a coluna data no mesmo intervalo). O período tem ${stats.mensagens} mensagens úteis em ${stats.conversas} conversas e ${stats.leads} leads importados com data no período.`,
    `Para ler tendência, compare com o período anterior de mesmo tamanho (${ad.split('-').reverse().join('/')} a ${aa.split('-').reverse().join('/')}) e deixe claro quando estiver comparando.`, '',
    '# O que esta leitura precisa cobrir', roteiro, '',
    '# Como trabalhar',
    '- Comece pelas consultas agregadas; só desça ao texto de conversas individuais quando o achado for qualitativo.',
    '- Prefira poucas consultas largas a muitas pequenas.',
    '- Se o período tiver pouco volume, diga isso no resumo em vez de forçar conclusão sobre número pequeno. Se não houver dados, diga isso e não invente.',
    '- Se algum achado não se sustentar nos números, corte o bloco. Menos e certo é melhor que muito e duvidoso.', '',
    '# Formato obrigatório da resposta',
    'Escreva primeiro, em texto normal, um parágrafo curto de abertura. No FIM da resposta, devolva um único bloco ```json com exatamente esta forma:',
    '{"resumo":"2 a 3 frases com a conclusão principal","blocos":[{"tipo":"alerta","titulo":"frase que já entrega a conclusão, não um rótulo","texto":"um parágrafo com os números","itens":["evidência com número","outra evidência","Ação: o que fazer na segunda-feira de manhã"]}]}',
    'Regras do JSON: `tipo` é um de "alerta", "atencao", "oportunidade", "diagnostico". Entre 4 e 7 blocos, do mais importante para o menos. 2 a 4 itens por bloco; o último começa com "Ação:". Todo número citado saiu de uma consulta sua. Linguagem do ramo desta empresa (veja "O negócio"). Sem SQL, tabelas ou colunas. JSON válido.',
  ].join('\n');
}

function extrairJSON(texto) {
  const blocos = [...String(texto || '').matchAll(/```json\s*([\s\S]*?)```/g)];
  const bruto = blocos.length ? blocos[blocos.length - 1][1] : (() => { const t = String(texto || ''), a = t.lastIndexOf('{"resumo"'); return a >= 0 ? t.slice(a) : ''; })();
  try {
    const j = JSON.parse(bruto.trim());
    const TIP = ['alerta', 'atencao', 'oportunidade', 'diagnostico'];
    const blocosOk = (Array.isArray(j.blocos) ? j.blocos : []).slice(0, 8).map((b) => ({
      tipo: TIP.includes(b.tipo) ? b.tipo : 'diagnostico', titulo: String(b.titulo || '').slice(0, 300), texto: String(b.texto || '').slice(0, 2000),
      itens: (Array.isArray(b.itens) ? b.itens : []).slice(0, 6).map((x) => String(x).slice(0, 600)),
    })).filter((b) => b.titulo);
    return blocosOk.length ? { resumo: String(j.resumo || '').slice(0, 1500), blocos: blocosOk } : null;
  } catch (_) { return null; }
}

// ─── jobs ────────────────────────────────────────────────────────────────────
const jobs = new Map();
const chaveDe = (tipo, de, ate, pedido) => [tipo, de, ate, md5(tipo === 'sob_medida' ? pedido : '')].join('|');
function statsPeriodo(de, ate) {
  const mais1 = new Date(new Date(ate).getTime() + 86400000).toISOString().slice(0, 10);
  try {
    const r = consulta(`SELECT (SELECT count(*) FROM zv.msg WHERE NOT is_sistema AND ts >= '${de}' AND ts < '${mais1}') AS mensagens,
      (SELECT count(DISTINCT instancia || jid) FROM zv.msg WHERE NOT is_sistema AND NOT is_group AND ts >= '${de}' AND ts < '${mais1}') AS conversas,
      (SELECT count(*) FROM zv.lead WHERE data >= '${de}' AND data < '${mais1}') AS leads`)[0] || {};
    return { mensagens: +r.mensagens || 0, conversas: +r.conversas || 0, leads: +r.leads || 0 };
  } catch (e) { return { mensagens: 0, conversas: 0, leads: 0, erro: e.message }; }
}
// Garante o contexto do negócio atualizado (gera do Radar ZEUS se faltar ou se o perfil mudou)
async function garantirContexto(job, user) {
  let ctx = contextoAtual();
  const pf = perfil();
  if ((!ctx || (!ctx.editado && ctx.perfil_hash !== md5(JSON.stringify(pf)))) && Object.keys(pf).length) { job.status = 'contexto'; ctx = await gerarContexto(user && user.email); }
  return ctx;
}
// Roda o analista isolado (só a ferramenta `consultar`) e devolve o texto final; o progresso vai para o job
async function analista(job, textoEncomenda, ctx) {
  job.status = 'analisando';
  fs.mkdirSync(WORKDIR, { recursive: true });
  const spFile = path.join(WORKDIR, `.sistema-${job.id}.md`);
  fs.writeFileSync(spFile, PARTE_FIXA(empresaNome(), ctx && ctx.texto));
  const args = ['-p', textoEncomenda, '--output-format', 'stream-json', '--include-partial-messages', '--verbose', '--model', MODELO, '--effort', 'high',
    '--max-turns', '40', '--append-system-prompt-file', spFile, '--tools', '', '--setting-sources', 'project',
    '--strict-mcp-config', '--mcp-config', MCP, '--allowedTools', 'mcp__zv__consultar'];
  const p = spawn(claudeSpawn.CLAUDE_BIN, args, { cwd: WORKDIR, env: claudeSpawn.claudeEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  const timer = setTimeout(() => { try { p.kill('SIGTERM'); } catch (_) {} }, TIMEOUT_MS);
  let buf = '', final = '', err = '';
  p.stdout.on('data', (c) => {
    buf += c; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!l) continue;
      try {
        const j = JSON.parse(l);
        if (j.type === 'stream_event' && j.event && j.event.type === 'content_block_delta' && j.event.delta && j.event.delta.text) job.texto += j.event.delta.text;
        if (j.type === 'assistant') (j.message.content || []).forEach((b) => { if (b.type === 'tool_use' && b.input && b.input.descricao) job.consultas.push(String(b.input.descricao).slice(0, 200)); });
        if (j.type === 'result') final = typeof j.result === 'string' ? j.result : '';
      } catch (_) {}
    }
  });
  p.stderr.on('data', (d) => { err += d; });
  await new Promise((ok) => p.on('close', ok));
  clearTimeout(timer); fs.rm(spFile, { force: true }, () => {});
  const texto = final || job.texto;
  const ruim = claudeSpawn.falhaClaude(texto || err.slice(-400), false);
  if (ruim) { console.error('[vendas-ia] falha do claude:', String(texto || err).trim().slice(-300)); throw new Error(ruim); }
  return texto;
}
function novoJob(extra) {
  const job = Object.assign({ id: crypto.randomBytes(8).toString('hex'), status: 'preparando', consultas: [], texto: '', criado: Date.now() }, extra);
  jobs.set(job.id, job);
  for (const [k, v] of jobs) if (Date.now() - v.criado > 3 * 3600 * 1000) jobs.delete(k);
  return job;
}
async function iniciar({ tipo, de, ate, pedido, user }) {
  const job = novoJob({ tipo, de, ate });
  (async () => {
    try {
      const ctx = await garantirContexto(job, user);
      const stats = statsPeriodo(de, ate);
      const texto = await analista(job, encomenda(tipo, de, ate, pedido, stats), ctx);
      const res = extrairJSON(texto);
      if (!res) throw new Error('a IA não devolveu os cartões no formato esperado. Clique em Refazer.');
      const abertura = texto.split('```json')[0].trim().slice(0, 3000);
      const chave = chaveDe(tipo, de, ate, pedido);
      db.prepare(`INSERT INTO vendas_diag (chave, tipo, de, ate, pedido, resumo, blocos, texto, consultas, gerado_em, gerado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(chave) DO UPDATE SET resumo = excluded.resumo, blocos = excluded.blocos, texto = excluded.texto, consultas = excluded.consultas, gerado_em = excluded.gerado_em, gerado_por = excluded.gerado_por`)
        .run(chave, tipo, de, ate, tipo === 'sob_medida' ? pedido : null, res.resumo, JSON.stringify(res.blocos), abertura, JSON.stringify(job.consultas), Date.now(), (user && user.email) || null);
      Object.assign(job, { status: 'pronto', chave });
    } catch (e) { Object.assign(job, { status: 'erro', erro: e.message }); console.error('[vendas-ia]', e.message); }
  })();
  return job;
}
const saida = (r) => r && ({ chave: r.chave, tipo: r.tipo, nome: (TIPOS.find((t) => t.id === r.tipo) || {}).nome || r.tipo, de: r.de, ate: r.ate, pedido: r.pedido, resumo: r.resumo,
  blocos: JSON.parse(r.blocos || '[]'), abertura: r.texto, consultas: JSON.parse(r.consultas || '[]'), gerado_em: r.gerado_em });


// ─── Auditoria de Vendas (Fase 4): time por período e conversa a conversa ─────
db.exec(`CREATE TABLE IF NOT EXISTS vendas_aud (chave TEXT PRIMARY KEY, modo TEXT NOT NULL, alvo TEXT, rotulo TEXT, de TEXT, ate TEXT,
  resultado TEXT NOT NULL, consultas TEXT, gerado_em INTEGER NOT NULL, gerado_por TEXT)`);
const CRITERIOS = 'velocidade de resposta; qualificação (entender a necessidade, o prazo e quem decide); apresentação de valor (mostrar o produto/serviço certo para a necessidade, na linguagem do ramo); tratamento de objeções; condução para o próximo passo do funil deste negócio; retomada/follow-up quando o cliente some';
const idOk = (v) => /^[\w@.:+\-§]{1,120}$/.test(String(v || ''));
function encomendaTime(de, ate, vendedor) {
  const mais1 = new Date(new Date(ate).getTime() + 86400000).toISOString().slice(0, 10);
  return [
    `Faça a **auditoria de vendas do time** ${vendedor ? `(só o vendedor "${vendedor}")` : '(todos os vendedores)'} no período de ${br(de)} a ${br(ate)}.`, '',
    '# O recorte', `Conversas: ts >= '${de}' AND ts < '${mais1}'${vendedor ? ` AND vendedor = '${vendedor.replace(/'/g, "''")}'` : ''}. Leads importados: a coluna data no mesmo intervalo.`, '',
    '# O que avaliar',
    `Para cada vendedor, dê nota de 0 a 10 em cada critério: ${CRITERIOS}. Adapte o nome dos critérios à linguagem deste ramo (veja "O negócio").`,
    '- Apure os números de atendimento (mediana da 1ª resposta, % respondido em até 15 min, conversas sem resposta) e de funil (quantos avançaram por etapa) por vendedor.',
    '- Leia uma amostra de conversas de cada vendedor (as maiores e as que morreram) para avaliar qualificação, valor, objeções e condução. Cite frases reais como evidência.',
    '- Se houver pouco volume para um vendedor, diga isso em vez de dar nota forte.', '',
    '# Formato obrigatório',
    'Escreva um parágrafo curto de abertura e, no FIM, um único bloco ```json:',
    '{"resumo":"2 a 3 frases","vendedores":[{"nome":"...","nota":7.5,"conversas":42,"criterios":[{"nome":"...","nota":8,"evidencia":"número ou frase real"}],"pontos_fortes":["..."],"melhorar":["..."],"treino":"o que treinar nesta semana, concreto"}],"padroes":["padrão do time todo, com número"]}',
    'Regras: nota de 0 a 10 com uma casa decimal; 6 critérios por vendedor; 2 a 3 pontos fortes e 2 a 3 pontos a melhorar; todo número saiu de consulta sua; sem SQL nem nomes de tabela; JSON válido.',
  ].join('\n');
}
function encomendaConversa(instancia, jid, nome) {
  return [
    `Audite a conversa de vendas com **${nome || 'este contato'}** (número da empresa "${instancia}").`, '',
    '# A conversa', `Leia todas as mensagens: WHERE instancia = '${instancia}' AND jid = '${jid}' AND NOT is_sistema, ordenadas por ts (from_me = true é a empresa).`,
    'Se precisar, veja também os turnos de resposta dela e se o telefone aparece nos leads importados.', '',
    '# O que avaliar',
    `Nota de 0 a 10 em cada critério: ${CRITERIOS}, com o nome adaptado ao ramo (veja "O negócio"). Diga em que etapa do funil deste negócio a conversa está ou onde parou, e por quê.`, '',
    '# Formato obrigatório',
    'Escreva um parágrafo curto de abertura e, no FIM, um único bloco ```json:',
    '{"resumo":"2 a 3 frases","etapa":"etapa atual ou onde parou","nota":6.5,"criterios":[{"nome":"...","nota":7,"evidencia":"frase real ou fato da conversa"}],"acertos":["..."],"erros":["..."],"objecoes":[{"objecao":"como o cliente disse","como_tratou":"o que o vendedor fez","melhor_resposta":"resposta pronta, no tom do ramo"}],"proximo_passo":"o que fazer agora","mensagem_sugerida":"mensagem pronta para mandar ao cliente pelo WhatsApp"}',
    'Regras: 6 critérios; cite frases reais entre aspas; se a conversa for curta demais para avaliar algum critério, dê a nota e diga "pouca evidência"; sem SQL; JSON válido.',
  ].join('\n');
}
function jsonFinal(texto) {
  const b = [...String(texto || '').matchAll(/```json\s*([\s\S]*?)```/g)];
  if (!b.length) return null;
  try { return JSON.parse(b[b.length - 1][1].trim()); } catch (_) { return null; }
}
const nota = (v) => { const n = Number(v); return isFinite(n) ? Math.max(0, Math.min(10, Math.round(n * 10) / 10)) : null; };
const strs = (a, n, t) => (Array.isArray(a) ? a : []).slice(0, n).map((x) => String(x).slice(0, t || 500));
const crit = (a) => (Array.isArray(a) ? a : []).slice(0, 8).map((c) => ({ nome: String(c.nome || '').slice(0, 80), nota: nota(c.nota), evidencia: String(c.evidencia || '').slice(0, 500) })).filter((c) => c.nome);
function limparTime(j) {
  if (!j || !Array.isArray(j.vendedores)) return null;
  const v = j.vendedores.slice(0, 30).map((x) => ({ nome: String(x.nome || '').slice(0, 80), nota: nota(x.nota), conversas: Number(x.conversas) || null, criterios: crit(x.criterios),
    pontos_fortes: strs(x.pontos_fortes, 4), melhorar: strs(x.melhorar, 4), treino: String(x.treino || '').slice(0, 600) })).filter((x) => x.nome);
  return v.length ? { resumo: String(j.resumo || '').slice(0, 1500), vendedores: v, padroes: strs(j.padroes, 6) } : null;
}
function limparConversa(j) {
  if (!j || !Array.isArray(j.criterios)) return null;
  return { resumo: String(j.resumo || '').slice(0, 1500), etapa: String(j.etapa || '').slice(0, 120), nota: nota(j.nota), criterios: crit(j.criterios),
    acertos: strs(j.acertos, 5), erros: strs(j.erros, 5),
    objecoes: (Array.isArray(j.objecoes) ? j.objecoes : []).slice(0, 6).map((o) => ({ objecao: String(o.objecao || '').slice(0, 300), como_tratou: String(o.como_tratou || '').slice(0, 400), melhor_resposta: String(o.melhor_resposta || '').slice(0, 800) })),
    proximo_passo: String(j.proximo_passo || '').slice(0, 600), mensagem_sugerida: String(j.mensagem_sugerida || '').slice(0, 1500) };
}
async function iniciarAuditoria({ modo, de, ate, vendedor, instancia, jid, nome, user }) {
  const alvo = modo === 'conversa' ? instancia + '|' + jid : (vendedor || '');
  const chave = [modo, alvo, modo === 'conversa' ? '' : de, modo === 'conversa' ? '' : ate].join('|');
  const job = novoJob({ modo, chave, tipo: 'aud_' + modo, de, ate });
  (async () => {
    try {
      const ctx = await garantirContexto(job, user);
      const texto = await analista(job, modo === 'conversa' ? encomendaConversa(instancia, jid, nome) : encomendaTime(de, ate, vendedor), ctx);
      const r = modo === 'conversa' ? limparConversa(jsonFinal(texto)) : limparTime(jsonFinal(texto));
      if (!r) throw new Error('a IA não devolveu a auditoria no formato esperado. Clique em Refazer.');
      const rotulo = modo === 'conversa' ? (nome || jid) : (vendedor || 'Todo o time');
      db.prepare(`INSERT INTO vendas_aud (chave, modo, alvo, rotulo, de, ate, resultado, consultas, gerado_em, gerado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(chave) DO UPDATE SET resultado = excluded.resultado, rotulo = excluded.rotulo, consultas = excluded.consultas, gerado_em = excluded.gerado_em, gerado_por = excluded.gerado_por`)
        .run(chave, modo, alvo, rotulo, modo === 'conversa' ? null : de, modo === 'conversa' ? null : ate, JSON.stringify(r), JSON.stringify(job.consultas), Date.now(), (user && user.email) || null);
      Object.assign(job, { status: 'pronto' });
    } catch (e) { Object.assign(job, { status: 'erro', erro: e.message }); console.error('[vendas-aud]', e.message); }
  })();
  return job;
}
const audSaida = (r) => r && ({ chave: r.chave, modo: r.modo, alvo: r.alvo, rotulo: r.rotulo, de: r.de, ate: r.ate, resultado: JSON.parse(r.resultado), consultas: JSON.parse(r.consultas || '[]'), gerado_em: r.gerado_em });


// ─── Auditoria de Vendas: chat de análise (pergunta em português, a IA consulta a base e responde) ──
db.exec(`CREATE TABLE IF NOT EXISTS vendas_chat (id TEXT PRIMARY KEY, conversa TEXT NOT NULL, pergunta TEXT NOT NULL, resposta TEXT, consultas TEXT,
  status TEXT NOT NULL, criado_em INTEGER NOT NULL, por TEXT)`);
db.exec(`CREATE INDEX IF NOT EXISTS vendas_chat_conversa ON vendas_chat (conversa, criado_em)`);
function encomendaPergunta(pergunta, historico) {
  const h = (historico || []).slice(-4);
  return [
    h.length ? '# Conversa até aqui (para entender a pergunta de agora)\n' + h.map((x) => `Direção: ${x.pergunta}\nVocê: ${String(x.resposta || '').slice(0, 1500)}`).join('\n\n') + '\n' : '',
    '# Pergunta da direção', pergunta, '',
    '# Como responder',
    '- Apure os números com a ferramenta antes de responder. Se a pergunta não disser o período, use os últimos 90 dias e diga isso.',
    '- Responda em Markdown simples: comece pela conclusão em 1 ou 2 frases, depois o que sustenta (números, listas, nomes, frases reais dos clientes entre aspas quando ajudar) e feche com o que fazer.',
    '- Se pedirem para auditar uma conversa ou um vendedor, avalie velocidade, qualificação, apresentação de valor, objeções, condução ao próximo passo e retomada, com evidências, e sugira a mensagem ou a resposta pronta.',
    '- Tabelas curtas quando comparar vendedores, origens ou períodos. Sem SQL, tabelas do banco ou nomes de colunas. Seja conciso.',
  ].join('\n');
}
function iniciarAnalise({ pergunta, conversa, user }) {
  const conv = /^[\w-]{6,40}$/.test(String(conversa || '')) ? conversa : crypto.randomBytes(8).toString('hex');
  const historico = db.prepare("SELECT pergunta, resposta FROM vendas_chat WHERE conversa = ? AND status = 'pronto' ORDER BY criado_em").all(conv);
  const job = novoJob({ modo: 'analise', conversa: conv });
  db.prepare('INSERT INTO vendas_chat (id, conversa, pergunta, status, criado_em, por) VALUES (?, ?, ?, ?, ?, ?)').run(job.id, conv, pergunta, 'rodando', Date.now(), (user && user.email) || null);
  (async () => {
    try {
      const ctx = await garantirContexto(job, user);
      const texto = (await analista(job, encomendaPergunta(pergunta, historico), ctx)).trim();
      if (!texto) throw new Error('a IA não respondeu; tente de novo');
      db.prepare("UPDATE vendas_chat SET resposta = ?, consultas = ?, status = 'pronto' WHERE id = ?").run(texto, JSON.stringify(job.consultas), job.id);
      Object.assign(job, { status: 'pronto', resposta: texto });
    } catch (e) {
      db.prepare("UPDATE vendas_chat SET resposta = ?, status = 'erro' WHERE id = ?").run(e.message, job.id);
      Object.assign(job, { status: 'erro', erro: e.message }); console.error('[vendas-analise]', e.message);
    }
  })();
  return job;
}

// ─── rotas ───────────────────────────────────────────────────────────────────
const router = express.Router();
const dataOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : null;

router.get('/contexto', (_req, res) => {
  const c = contextoAtual(), pf = perfil();
  res.json({ contexto: c, perfil_preenchido: Object.keys(pf).length > 0, desatualizado: !!(c && !c.editado && c.perfil_hash !== md5(JSON.stringify(pf))) });
});
router.post('/contexto/gerar', async (req, res) => {
  try { res.json({ contexto: await gerarContexto(req.user && req.user.email) }); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.put('/contexto', (req, res) => {
  const texto = String((req.body || {}).texto || '').trim().slice(0, 12000);
  if (!texto) return res.status(400).json({ error: 'o contexto não pode ficar vazio' });
  const dado = Object.assign({}, contextoAtual() || {}, { texto, editado: true, editado_em: Date.now(), por: req.user && req.user.email });
  kvSet('vendas_contexto', dado); res.json({ contexto: dado });
});

router.get('/diagnostico/tipos', (_req, res) => res.json({ tipos: TIPOS.map((t) => ({ id: t.id, nome: t.nome })) }));
router.get('/diagnostico/lista', (_req, res) => {
  res.json({ diagnosticos: db.prepare('SELECT chave, tipo, de, ate, pedido, gerado_em FROM vendas_diag ORDER BY gerado_em DESC LIMIT 60').all()
    .map((r) => ({ chave: r.chave, tipo: r.tipo, nome: (TIPOS.find((t) => t.id === r.tipo) || {}).nome || r.tipo, de: r.de, ate: r.ate, pedido: r.pedido, gerado_em: r.gerado_em })) });
});
router.get('/diagnostico', (req, res) => {
  const q = req.query || {};
  if (q.chave) return res.json({ diagnostico: saida(db.prepare('SELECT * FROM vendas_diag WHERE chave = ?').get(String(q.chave))) || null });
  const tipo = TIPOS.some((t) => t.id === q.tipo) ? q.tipo : 'geral', de = dataOk(q.de), ate = dataOk(q.ate);
  if (!de || !ate) return res.status(400).json({ error: 'período inválido' });
  res.json({ diagnostico: saida(db.prepare('SELECT * FROM vendas_diag WHERE chave = ?').get(chaveDe(tipo, de, ate, String(q.pedido || '')))) || null, stats: statsPeriodo(de, ate) });
});
router.post('/diagnostico', async (req, res) => {
  const b = req.body || {};
  const tipo = TIPOS.some((t) => t.id === b.tipo) ? b.tipo : 'geral', de = dataOk(b.de), ate = dataOk(b.ate);
  const pedido = String(b.pedido || '').trim().slice(0, 2000);
  if (!de || !ate || de > ate) return res.status(400).json({ error: 'período inválido' });
  if (tipo === 'sob_medida' && !pedido) return res.status(400).json({ error: 'escreva o que você quer saber' });
  const rodando = [...jobs.values()].find((j) => ['preparando', 'contexto', 'analisando'].includes(j.status) && j.tipo === tipo && j.de === de && j.ate === ate);
  if (rodando) return res.json({ job: rodando.id });
  const job = await iniciar({ tipo, de, ate, pedido, user: req.user });
  res.json({ job: job.id });
});
router.get('/diagnostico/job/:id', (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j) return res.status(404).json({ error: 'geração não encontrada (o servidor pode ter reiniciado): gere de novo' });
  res.json({ status: j.status, erro: j.erro || null, consultas: j.consultas, texto: j.texto.split('```json')[0].slice(-4000), chave: j.chave || null });
});


// Auditoria
router.get('/auditoria/vendedores', (_req, res) => {
  try { res.json({ vendedores: consulta(`SELECT DISTINCT vendedor FROM zv.instancia WHERE ativo AND vendedor IS NOT NULL AND vendedor <> '' ORDER BY 1`).map((r) => r.vendedor) }); }
  catch (e) { res.json({ vendedores: [], erro: e.message }); }
});
router.get('/auditoria/conversas', (req, res) => {
  const q = req.query || {}, de = dataOk(q.de), ate = dataOk(q.ate);
  if (!de || !ate) return res.status(400).json({ error: 'período inválido' });
  const mais1 = new Date(new Date(ate).getTime() + 86400000).toISOString().slice(0, 10);
  const vend = q.vendedor ? String(q.vendedor).replace(/'/g, "''").slice(0, 80) : null;
  const filtro = q.filtro === 'aguardando' ? 'AND aguardando_resposta' : q.filtro === 'sem_resposta' ? 'AND msgs_nossas = 0' : '';
  try {
    const rows = consulta(`SELECT instancia, vendedor, jid, replace(coalesce(nome, ''), ',', ' ') AS nome, to_char(ultima_msg, 'YYYY-MM-DD HH24:MI') AS ultima, total_msgs, msgs_cliente, msgs_nossas, aguardando_resposta
      FROM zv.conversa WHERE NOT is_group AND ultima_msg >= '${de}' AND primeira_msg < '${mais1}' ${vend ? `AND vendedor = '${vend}'` : ''} ${filtro} ORDER BY ultima_msg DESC LIMIT 120`);
    const feitas = new Set(db.prepare("SELECT alvo FROM vendas_aud WHERE modo = 'conversa'").all().map((r) => r.alvo));
    res.json({ conversas: rows.map((r) => ({ instancia: r.instancia, vendedor: r.vendedor, jid: r.jid, nome: r.nome, ultima: r.ultima, total: +r.total_msgs, cliente: +r.msgs_cliente, nossas: +r.msgs_nossas,
      aguardando: r.aguardando_resposta === 't', auditada: feitas.has(r.instancia + '|' + r.jid) })) });
  } catch (e) { res.status(502).json({ error: e.message }); }
});
router.get('/auditoria/lista', (_req, res) => {
  res.json({ auditorias: db.prepare('SELECT chave, modo, rotulo, de, ate, gerado_em FROM vendas_aud ORDER BY gerado_em DESC LIMIT 60').all() });
});
router.get('/auditoria', (req, res) => {
  const q = req.query || {};
  let chave = q.chave ? String(q.chave) : null;
  if (!chave && q.modo === 'conversa' && idOk(q.instancia) && idOk(q.jid)) chave = ['conversa', q.instancia + '|' + q.jid, '', ''].join('|');
  if (!chave && q.modo === 'time' && dataOk(q.de) && dataOk(q.ate)) chave = ['time', String(q.vendedor || ''), q.de, q.ate].join('|');
  res.json({ auditoria: chave ? audSaida(db.prepare('SELECT * FROM vendas_aud WHERE chave = ?').get(chave)) || null : null });
});
router.post('/auditoria', async (req, res) => {
  const b = req.body || {};
  if (b.modo === 'conversa') {
    if (!idOk(b.instancia) || !idOk(b.jid)) return res.status(400).json({ error: 'conversa inválida' });
    const job = await iniciarAuditoria({ modo: 'conversa', instancia: b.instancia, jid: b.jid, nome: String(b.nome || '').slice(0, 80), user: req.user });
    return res.json({ job: job.id, chave: job.chave });
  }
  const de = dataOk(b.de), ate = dataOk(b.ate);
  if (!de || !ate || de > ate) return res.status(400).json({ error: 'período inválido' });
  const vendedor = b.vendedor ? String(b.vendedor).slice(0, 80) : '';
  const rodando = [...jobs.values()].find((j) => j.modo === 'time' && ['preparando', 'contexto', 'analisando'].includes(j.status) && j.chave === ['time', vendedor, de, ate].join('|'));
  if (rodando) return res.json({ job: rodando.id, chave: rodando.chave });
  const job = await iniciarAuditoria({ modo: 'time', de, ate, vendedor, user: req.user });
  res.json({ job: job.id, chave: job.chave });
});
router.get('/auditoria/job/:id', (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j) return res.status(404).json({ error: 'geração não encontrada (o servidor pode ter reiniciado): gere de novo' });
  res.json({ status: j.status, erro: j.erro || null, consultas: j.consultas, texto: j.texto.split('```json')[0].slice(-4000), chave: j.chave });
});


// Chat de análise
router.post('/analise', (req, res) => {
  const b = req.body || {}, pergunta = String(b.pergunta || '').trim().slice(0, 2000);
  if (!pergunta) return res.status(400).json({ error: 'escreva a pergunta' });
  const job = iniciarAnalise({ pergunta, conversa: b.conversa, user: req.user });
  res.json({ job: job.id, conversa: job.conversa });
});
router.get('/analise/job/:id', (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j) { const r = db.prepare('SELECT * FROM vendas_chat WHERE id = ?').get(req.params.id);
    return r ? res.json({ status: r.status === 'rodando' ? 'erro' : r.status, erro: r.status === 'rodando' ? 'o servidor reiniciou durante a resposta: pergunte de novo' : (r.status === 'erro' ? r.resposta : null), consultas: JSON.parse(r.consultas || '[]'), texto: r.resposta || '' })
      : res.status(404).json({ error: 'resposta não encontrada' }); }
  res.json({ status: j.status, erro: j.erro || null, consultas: j.consultas, texto: j.resposta || j.texto });
});
router.get('/analise/conversas', (_req, res) => {
  res.json({ conversas: db.prepare(`SELECT conversa, max(criado_em) AS ultima, count(*) AS n FROM vendas_chat GROUP BY conversa ORDER BY ultima DESC LIMIT 30`).all()
    .map((r) => ({ conversa: r.conversa, titulo: (db.prepare('SELECT pergunta FROM vendas_chat WHERE conversa = ? ORDER BY criado_em LIMIT 1').get(r.conversa) || {}).pergunta || '', ultima: r.ultima, n: r.n })) });
});
router.get('/analise/conversa/:id', (req, res) => {
  res.json({ mensagens: db.prepare('SELECT id, pergunta, resposta, consultas, status, criado_em FROM vendas_chat WHERE conversa = ? ORDER BY criado_em').all(String(req.params.id))
    .map((r) => ({ id: r.id, pergunta: r.pergunta, resposta: r.resposta, consultas: JSON.parse(r.consultas || '[]'), status: r.status, criado_em: r.criado_em })) });
});
router.delete('/analise/conversa/:id', (req, res) => {
  const id = String(req.params.id), u = req.user || {};
  const donos = db.prepare('SELECT DISTINCT por FROM vendas_chat WHERE conversa = ?').all(id).map((r) => r.por);
  if (!u.admin && donos.some((p) => p !== (u.email || null))) return res.status(403).json({ error: 'só quem fez a conversa ou um administrador pode apagar' });
  db.prepare('DELETE FROM vendas_chat WHERE conversa = ?').run(id); res.json({ ok: true });
});

module.exports = { router, TIPOS, _encomenda: encomenda, _extrairJSON: extrairJSON, _parteFixa: PARTE_FIXA };
