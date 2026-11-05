// Estratégia do LinkedIn (tela /linkedin > Estratégia): a pessoa escolhe objetivo, público, pilares com peso, tom,
// formatos, ritmo, newsletter, CTA e proibições. O ZEUS segue isso em tudo que escreve para o LinkedIn
// (linkedin.gerarTexto, o "Gerar com IA" e a CLI do chat) e monta a semana em rascunhos por pilar e dia.
// Cada cliente tem a própria Central, então a estratégia é da conta (uma linha em linkedin_estrategia).
// Rascunho do plano nasce com data SUGERIDA (sugerido_para), não agendado: só sai depois que alguém aprova.
// Newsletter: a API do LinkedIn não publica artigo nem edição de newsletter em perfil pessoal. O ZEUS entrega a
// edição pronta (tipo 'newsletter') para copiar e colar no LinkedIn; publicar/agendar é bloqueado no linkedin.js.
// IA demora mais que o tempo do proxy (60 s): sugerir e planejar rodam como tarefa e a tela acompanha.
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const db = new Database(path.join(DATA_DIR, 'central.db'), { timeout: 5000 });
db.exec(`CREATE TABLE IF NOT EXISTS linkedin_estrategia (id INTEGER PRIMARY KEY CHECK (id = 1), dados TEXT NOT NULL, ultimo_auto TEXT, por TEXT, updated_at INTEGER NOT NULL)`);

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const DIA_NOME = { dom: 'domingo', seg: 'segunda', ter: 'terça', qua: 'quarta', qui: 'quinta', sex: 'sexta', sab: 'sábado' };
const OBJETIVOS = { autoridade: 'construir autoridade e ser lembrado como referência no assunto', leads: 'gerar conversas e oportunidades comerciais (leads)', ambos: 'construir autoridade e, com ela, gerar conversas comerciais' };
const TONS = { direto: 'direto e sem rodeios', didatico: 'didático, explica passo a passo', provocativo: 'provocativo, questiona o senso comum', inspirador: 'inspirador, com história e lição', tecnico: 'técnico, com dados e método', humor: 'leve e bem-humorado' };
const FORMATOS = { texto: 'só texto', imagem: 'texto com uma imagem', varias: 'texto com várias imagens (carrossel de imagens)' };

const PADRAO = {
  objetivo: 'ambos', publico: '', posicionamento: '',
  pilares: [], tons: ['direto'], comoEscrever: '', formatos: ['texto', 'imagem'],
  postsSemana: 3, dias: ['seg', 'qua', 'sex'], horario: '09:00',
  newsletter: { ativa: false, nome: '', frequencia: 'quinzenal', dia: 'ter' },
  cta: '', proibicoes: '', autoPlanejar: false,
};
const json = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const txt = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

function limpar(b) {
  b = b || {};
  const o = {};
  o.objetivo = OBJETIVOS[b.objetivo] ? b.objetivo : PADRAO.objetivo;
  o.publico = txt(b.publico, 600); o.posicionamento = txt(b.posicionamento, 600);
  const ps = (Array.isArray(b.pilares) ? b.pilares : []).slice(0, 8).map(p => ({
    id: /^[\w-]{1,20}$/.test(p && p.id) ? p.id : crypto.randomBytes(4).toString('hex'),
    nome: txt(p && p.nome, 60), descricao: txt(p && p.descricao, 300), peso: Math.max(0, Math.min(100, Math.round(+(p && p.peso) || 0))),
  })).filter(p => p.nome);
  o.pilares = ps;
  o.tons = (Array.isArray(b.tons) ? b.tons : []).filter(t => TONS[t]).slice(0, 3);
  o.comoEscrever = txt(b.comoEscrever, 1500);
  o.formatos = (Array.isArray(b.formatos) ? b.formatos : []).filter(f => FORMATOS[f]);
  if (!o.formatos.length) o.formatos = ['texto'];
  o.postsSemana = Math.max(1, Math.min(7, parseInt(b.postsSemana, 10) || 3));
  o.dias = DIAS.filter(d => (Array.isArray(b.dias) ? b.dias : []).includes(d));
  if (!o.dias.length) o.dias = PADRAO.dias.slice();
  o.horario = /^([01]\d|2[0-3]):[0-5]\d$/.test(b.horario) ? b.horario : PADRAO.horario;
  const n = b.newsletter || {};
  o.newsletter = { ativa: !!n.ativa, nome: txt(n.nome, 80), frequencia: ['semanal', 'quinzenal', 'mensal'].includes(n.frequencia) ? n.frequencia : 'quinzenal', dia: DIAS.includes(n.dia) ? n.dia : 'ter' };
  o.cta = txt(b.cta, 300); o.proibicoes = txt(b.proibicoes, 1500);
  o.autoPlanejar = !!b.autoPlanejar;
  return o;
}
function ler() {
  const r = db.prepare('SELECT * FROM linkedin_estrategia WHERE id = 1').get();
  if (!r) return null;
  return Object.assign(limpar(json(r.dados, {})), { atualizadoEm: r.updated_at, por: r.por, ultimoAuto: r.ultimo_auto });
}
function gravar(dados, por) {
  const o = limpar(dados);
  db.prepare(`INSERT INTO linkedin_estrategia (id, dados, por, updated_at) VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET dados = excluded.dados, por = excluded.por, updated_at = excluded.updated_at`).run(JSON.stringify(o), por || null, Date.now());
  return ler();
}
const pesoTotal = est => est.pilares.reduce((a, p) => a + p.peso, 0) || 1;

// Bloco de instruções que vai em todo prompt de LinkedIn. pilarId opcional: foca no pilar.
function blocoPrompt(est, pilarId) {
  est = est || ler();
  if (!est) return '';
  const L = ['=== Estratégia de LinkedIn da conta (siga sempre) ==='];
  L.push(`Objetivo: ${OBJETIVOS[est.objetivo]}.`);
  if (est.publico) L.push(`Público: ${est.publico}`);
  if (est.posicionamento) L.push(`Como o autor quer ser visto: ${est.posicionamento}`);
  if (est.pilares.length) {
    const tot = pesoTotal(est);
    L.push('Pilares de conteúdo (peso no calendário):');
    est.pilares.forEach(p => L.push(`- ${p.nome} (${Math.round(p.peso * 100 / tot)}%)${p.descricao ? ': ' + p.descricao : ''}`));
  }
  const pil = pilarId && est.pilares.find(p => p.id === pilarId || p.nome === pilarId);
  if (pil) L.push(`ESTE post é do pilar "${pil.nome}"${pil.descricao ? ' (' + pil.descricao + ')' : ''}.`);
  if (est.tons.length) L.push(`Tom: ${est.tons.map(t => TONS[t]).join('; ')}.`);
  if (est.comoEscrever) L.push(`Como escrever: ${est.comoEscrever}`);
  if (est.cta) L.push(`Chamada para ação padrão (use quando fizer sentido, sem repetir em todo post): ${est.cta}`);
  if (est.proibicoes) L.push(`Nunca: ${est.proibicoes}`);
  L.push('=== Fim da estratégia ===');
  return L.join('\n');
}

// ─── semana: datas, pilares e newsletter ──────────────────────────────────────
// Horário de Brasília (UTC-3, sem horário de verão)
const brt = ms => new Date(ms - 3 * 3600000);
function segundaDaSemana(ms) { const d = brt(ms); const dw = d.getUTCDay(); const seg = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((dw + 6) % 7) * 86400000; return seg; } // meia-noite BRT da segunda, em "relógio BRT"
function semanaIso(segBrt) { const d = new Date(segBrt + 3 * 86400000); const ano = d.getUTCFullYear(); const jan4 = Date.UTC(ano, 0, 4); const n = 1 + Math.round((segBrt - (jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * 86400000)) / (7 * 86400000)); return { ano, n }; }
function quandoDia(segBrt, dia, horario) {
  const off = (DIAS.indexOf(dia) + 6) % 7; // seg=0 ... dom=6
  const [h, m] = horario.split(':').map(Number);
  return segBrt + off * 86400000 + (h + 3) * 3600000 + m * 60000; // volta para UTC real
}
function distribuir(est, n) {
  const ps = est.pilares.filter(p => p.peso > 0);
  if (!ps.length) return Array(n).fill(null);
  const tot = ps.reduce((a, p) => a + p.peso, 0);
  const q = ps.map(p => ({ p, cota: p.peso * n / tot }));
  q.forEach(x => { x.qtd = Math.floor(x.cota); x.resto = x.cota - x.qtd; });
  let falta = n - q.reduce((a, x) => a + x.qtd, 0);
  q.slice().sort((a, b) => b.resto - a.resto || b.p.peso - a.p.peso).forEach(x => { if (falta > 0) { x.qtd++; falta--; } });
  // intercala para não repetir pilar em dias seguidos
  const out = [];
  while (out.length < n) {
    const ult = out[out.length - 1];
    const cand = q.filter(x => x.qtd > 0).sort((a, b) => b.qtd - a.qtd);
    const x = cand.find(c => c.p !== ult) || cand[0];
    out.push(x.p); x.qtd--;
  }
  return out;
}
function vagasDaSemana(est, segBrt) {
  const dias = est.dias.slice().sort((a, b) => ((DIAS.indexOf(a) + 6) % 7) - ((DIAS.indexOf(b) + 6) % 7));
  const n = Math.min(est.postsSemana, dias.length);
  const escolhidos = Array.from({ length: n }, (_, i) => dias[n === 1 ? 0 : Math.round(i * (dias.length - 1) / (n - 1))]); // espaçados na semana
  const pil = distribuir(est, n);
  const formatos = est.formatos;
  return escolhidos.map((dia, i) => ({ n: i + 1, dia, quando: quandoDia(segBrt, dia, est.horario), pilar: pil[i], formato: formatos[i % formatos.length] }));
}
function temNewsletter(est, segBrt) {
  const nl = est.newsletter; if (!nl.ativa) return null;
  const quando = quandoDia(segBrt, nl.dia, est.horario);
  if (nl.frequencia === 'quinzenal' && semanaIso(segBrt).n % 2 !== 0) return null;
  if (nl.frequencia === 'mensal' && brt(quando).getUTCDate() > 7) return null;
  return quando;
}
const dataCurta = ms => { const d = brt(ms); return `${DIA_NOME[DIAS[d.getUTCDay()]]} ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };

// ─── IA ───────────────────────────────────────────────────────────────────────
// Texto longo vai em blocos marcados (não em JSON: aspas e quebras de linha sem escape quebravam o JSON, e resposta
// cortada perdia tudo). campo(bloco, 'TITULO') lê "TITULO: ..."; TEXTO: é o resto do bloco.
function campo(bloco, nome) { const m = new RegExp('^' + nome + ':[ \\t]*(.*)$', 'mi').exec(bloco); return m ? m[1].trim() : ''; }
function textoDe(bloco) { const i = bloco.search(/^TEXTO:[ \t]*$/mi); return i < 0 ? '' : bloco.slice(i).replace(/^TEXTO:[ \t]*\n?/i, '').replace(/^###\s*FIM\s*$/mi, '').trim(); }
const TEMPO_IA = 280000; // tarefas de fundo: não passam pelo limite de 60 s do proxy
function jsonDe(t) { const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a < 0 || b <= a) return null; try { return JSON.parse(t.slice(a, b + 1)); } catch (_) { return null; } }
function li() { return require('./linkedin'); }
function autor() { try { return li().status().nome || require('./config').empresaInfo().nome; } catch (_) { return 'o dono da empresa'; } }
function recentes(n) {
  return db.prepare(`SELECT texto FROM linkedin_posts WHERE texto != '' ORDER BY COALESCE(publicado_em, updated_at) DESC LIMIT ?`).all(n)
    .map(r => '- ' + r.texto.replace(/\s+/g, ' ').slice(0, 140));
}
const REGRAS_POST = [
  'Regras de cada post:',
  '- As 2 primeiras linhas são o gancho (aparecem antes do "ver mais"). Precisam dar vontade de abrir.',
  '- Parágrafos de 1 a 3 linhas com linha em branco entre eles. Lista com "•" quando ajudar.',
  '- Sem markdown. Sem travessão (— ou –): use vírgula, ponto ou dois-pontos.',
  '- Sem clichês de IA ("no mundo de hoje", "não é sobre X, é sobre Y", "jornada", "vamos juntos").',
  '- Não invente dados, clientes ou números. Onde precisaria de um dado real, escreva [dado: ...] para a pessoa preencher.',
  '- Entre 900 e 1.600 caracteres. No máximo 3 hashtags na última linha.',
].join('\n');

async function sugerir(briefing) {
  const prompt = [
    `Você é estrategista de conteúdo para LinkedIn. Monte a estratégia do perfil pessoal de ${autor()}, da empresa ${require('./config').empresaInfo().nome}. PT-BR.`,
    briefing ? `O que a pessoa contou sobre o negócio e o que quer com o LinkedIn:\n${String(briefing).slice(0, 3000)}` : 'A pessoa não deu briefing: use os posts recentes abaixo para inferir o assunto.',
    recentes(8).length ? 'Posts recentes do perfil:\n' + recentes(8).join('\n') : '',
    'Responda APENAS com JSON válido, neste formato:',
    JSON.stringify({ objetivo: 'autoridade | leads | ambos', publico: '1 a 2 frases', posicionamento: '1 frase: como quer ser lembrado', pilares: [{ nome: 'curto', descricao: '1 frase do que entra nesse pilar', peso: 30 }],
      tons: ['2 de: ' + Object.keys(TONS).join(', ')], comoEscrever: '2 a 4 orientações práticas de escrita para esse autor', formatos: ['de: texto, imagem, varias'],
      postsSemana: 3, dias: ['de: seg, ter, qua, qui, sex, sab, dom'], horario: 'HH:MM', newsletter: { ativa: true, nome: 'nome curto', frequencia: 'semanal | quinzenal | mensal', dia: 'ter' },
      cta: 'chamada padrão curta', proibicoes: 'o que nunca fazer' }),
    'De 3 a 5 pilares, com pesos somando 100. Seja específico para esse negócio, nada genérico. Não use ferramentas.',
  ].filter(Boolean).join('\n\n');
  const j = jsonDe(await li().claudeTexto(prompt, TEMPO_IA));
  if (!j) throw new Error('a IA respondeu fora do formato, tente de novo');
  return limpar(Object.assign({}, PADRAO, j, { autoPlanejar: false }));
}

// Monta a semana: newsletter (se for semana dela) + posts por pilar, como rascunhos com data sugerida
async function planejar({ semana, por, auto }) {
  const est = ler();
  if (!est) throw new Error('salve a estratégia antes de planejar');
  if (!est.pilares.length) throw new Error('cadastre pelo menos um pilar na estratégia');
  const agora = Date.now();
  let seg = segundaDaSemana(agora);
  if (semana === 'proxima') seg += 7 * 86400000;
  // automático agenda de verdade: só vagas com 3 h de antecedência, para dar tempo de vetar
  const folga = auto ? 3 * 3600000 : 3600000;
  const vagas = vagasDaSemana(est, seg).filter(v => v.quando > agora + folga);
  const nlQuando = temNewsletter(est, seg);
  const nl = nlQuando && nlQuando > agora + folga ? nlQuando : null;
  if (!vagas.length && !nl) throw new Error(semana === 'proxima' ? 'nenhum dia de post configurado' : 'os dias de post desta semana já passaram: planeje a próxima');
  const base = blocoPrompt(est);
  const ja = recentes(12);
  let edicao = null;
  if (nl) {
    const p = [
      `Você escreve a newsletter de LinkedIn "${est.newsletter.nome || 'Newsletter'}" de ${autor()}. PT-BR.`, base,
      ja.length ? 'Assuntos já tratados recentemente (não repita):\n' + ja.join('\n') : '',
      'Escreva UMA edição que aprofunda um dos pilares (o de maior peso que não apareceu nos assuntos recentes).',
      'Estrutura: título forte, subtítulo de 1 linha, abertura com uma situação concreta, 3 a 5 seções com intertítulos curtos, fechamento com uma pergunta para os leitores responderem.',
      'Entre 4.000 e 7.000 caracteres. Intertítulos em linhas próprias, sem markdown (nada de # ou **). Sem travessão. Não invente dados: use [dado: ...] onde precisar.',
      'Responda SÓ neste formato, sem nada antes ou depois:\nPILAR: nome do pilar\nTITULO: título\nSUBTITULO: subtítulo\nTEXTO:\n(a edição inteira)',
    ].filter(Boolean).join('\n\n');
    const bruto = await li().claudeTexto(p, TEMPO_IA);
    edicao = { pilar: campo(bruto, 'PILAR'), titulo: campo(bruto, 'TITULO'), subtitulo: campo(bruto, 'SUBTITULO'), texto: textoDe(bruto) };
    if (!edicao.texto || edicao.texto.length < 800) throw new Error('a IA não devolveu a edição da newsletter, tente de novo');
  }
  let posts = [];
  if (vagas.length) {
    const p = [
      `Você escreve os posts da semana do LinkedIn de ${autor()}, no perfil pessoal. PT-BR.`, base,
      ja.length ? 'Posts recentes (não repita assunto nem gancho):\n' + ja.join('\n') : '',
      edicao ? `Nesta semana sai a edição "${edicao.titulo}" da newsletter${est.newsletter.nome ? ' ' + est.newsletter.nome : ''} (${dataCurta(nl)}). Um dos posts depois dessa data deve puxar para ela: um insight da edição e o convite para ler a newsletter no perfil (sem link).` : '',
      'Vagas da semana (um post por vaga, no pilar e formato indicados):',
      ...vagas.map(v => `${v.n}. ${dataCurta(v.quando)} · pilar: ${v.pilar ? v.pilar.nome + (v.pilar.descricao ? ' (' + v.pilar.descricao + ')' : '') : 'livre'} · formato: ${FORMATOS[v.formato]}`),
      auto ? REGRAS_POST.replace(/- Não invente dados[^\n]*/, '- Estes posts saem publicados sozinhos: não invente dados, clientes ou números e NÃO use marcadores como [dado: ...]. Escreva só o que dá para afirmar sem dado externo (opinião, método, experiência).') : REGRAS_POST,
      'Ângulos diferentes entre os posts (um dado, uma história, uma opinião, um passo a passo...). Para formato com imagem, descreva em "imagem" o que a arte deve mostrar.',
      'Responda SÓ neste formato, um bloco por vaga, sem nada antes ou depois:\n### POST 1\nTEMA: assunto em poucas palavras\nIMAGEM: o que a arte mostra (ou vazio)\nTEXTO:\n(o post pronto)\n### POST 2\n...',
    ].filter(Boolean).join('\n\n');
    const bruto = await li().claudeTexto(p, TEMPO_IA);
    posts = bruto.split(/^###\s*POST\s+/mi).slice(1).map(b => ({ n: parseInt(b, 10), tema: campo(b, 'TEMA'), imagem: campo(b, 'IMAGEM'), texto: textoDe(b) })).filter(x => x.n && x.texto.length > 200);
    if (!posts.length) throw new Error('a IA não devolveu os posts da semana, tente de novo');
  }
  const criados = [];
  const origem = auto ? 'plano-auto' : 'plano';
  if (edicao) {
    const corpo = [String(edicao.titulo || '').trim(), String(edicao.subtitulo || '').trim(), '', String(edicao.texto || '').trim()].join('\n').trim();
    const pil = est.pilares.find(x => x.nome === edicao.pilar);
    criados.push(li().criarPost({ texto: corpo, origem, por: por || 'ZEUS', tipo: 'newsletter', pilar: pil ? pil.nome : (edicao.pilar || null), sugeridoPara: nl }));
  }
  for (const v of vagas) {
    const pst = posts.find(x => +x.n === v.n) || posts[v.n - 1];
    if (!pst || !String(pst.texto || '').trim()) continue;
    // manual: rascunho com data sugerida e a descrição da arte; automático: agendado (sai sozinho se ninguém vetar), só texto
    const nota = !auto && v.formato !== 'texto' && pst.imagem ? `\n\n[arte sugerida: ${String(pst.imagem).slice(0, 300)}]` : '';
    criados.push(li().criarPost(Object.assign({ texto: String(pst.texto).trim() + nota, origem, por: por || 'ZEUS', tipo: 'post', pilar: v.pilar ? v.pilar.nome : null, formato: auto ? 'texto' : v.formato },
      auto ? { agendadoPara: v.quando } : { sugeridoPara: v.quando })));
  }
  return { semana: dataCurta(seg + 3 * 3600000).split(' ').slice(1, 2)[0], posts: criados.filter(p => p.tipo !== 'newsletter').length, newsletter: !!edicao, ids: criados.map(p => p.id) };
}

// Conversa guiada: a IA pergunta uma coisa por vez e, com o suficiente, devolve a estratégia completa
const MODELO_EST = { objetivo: 'autoridade | leads | ambos', publico: '1 a 2 frases', posicionamento: '1 frase: como quer ser lembrado', pilares: [{ nome: 'curto', descricao: '1 frase do que entra nesse pilar', peso: 30 }],
  tons: ['2 de: ' + Object.keys(TONS).join(', ')], comoEscrever: '2 a 4 orientações práticas de escrita para esse autor', formatos: ['de: texto, imagem, varias'],
  postsSemana: 3, dias: ['de: seg, ter, qua, qui, sex, sab, dom'], horario: 'HH:MM', newsletter: { ativa: true, nome: 'nome curto', frequencia: 'semanal | quinzenal | mensal', dia: 'ter' },
  cta: 'chamada padrão curta', proibicoes: 'o que nunca fazer' };
async function conversar(mensagens) {
  const msgs = (Array.isArray(mensagens) ? mensagens : []).slice(-30).map(m => ({ eu: !!m.eu, texto: String(m.texto || '').slice(0, 1500) })).filter(m => m.texto.trim());
  const respostas = msgs.filter(m => m.eu).length;
  if (!respostas) throw new Error('responda a primeira pergunta');
  const fechar = respostas >= 7;
  const prompt = [
    `Você é o ZEUS, estrategista de LinkedIn, numa conversa curta para montar a estratégia do perfil de ${autor()} (empresa ${require('./config').empresaInfo().nome}). PT-BR, amigável e direto.`,
    'Você precisa entender: o que vende e para quem; quem decide a compra; a oferta principal e o ticket; o diferencial ou a opinião contrária ao mercado; o que a pessoa quer que o LinkedIn gere (autoridade, leads); quanto consegue postar e se quer newsletter; o que evitar.',
    '=== Conversa até agora ===', ...msgs.map(m => (m.eu ? 'PESSOA: ' : 'ZEUS: ') + m.texto), '=== Fim ===',
    fechar ? 'Já há respostas suficientes: FINALIZE agora.' : `A pessoa respondeu ${respostas} vez(es). Faça a próxima pergunta (uma só, até 2 frases; pode comentar a resposta anterior em meia frase). Não pergunte o que já foi respondido. Se já tiver o suficiente e a pessoa respondeu pelo menos 4 vezes, finalize.`,
    'Para perguntar, responda APENAS com JSON: {"pergunta":"...","sugestoes":["2 a 4 respostas curtas que a pessoa pode tocar, ou vazio"]}',
    'Para finalizar, responda APENAS com JSON: {"pronto":true,"resumo":"2 frases do que você entendeu","estrategia":' + JSON.stringify(MODELO_EST) + '}',
    'Na estratégia: 3 a 5 pilares com pesos somando 100, específicos para esse negócio. Não use ferramentas.',
  ].join('\n\n');
  const j = jsonDe(await li().claudeTexto(prompt, TEMPO_IA));
  if (!j) throw new Error('a IA respondeu fora do formato, tente de novo');
  if (j.pronto && j.estrategia) return { pronto: true, resumo: txt(j.resumo, 600), estrategia: limpar(Object.assign({}, PADRAO, j.estrategia, { autoPlanejar: false })) };
  if (!j.pergunta) throw new Error('a IA não fez a próxima pergunta, tente de novo');
  return { pergunta: txt(j.pergunta, 500), sugestoes: (Array.isArray(j.sugestoes) ? j.sugestoes : []).map(s => txt(s, 80)).filter(Boolean).slice(0, 4) };
}

// ─── tarefas em segundo plano ─────────────────────────────────────────────────
const tarefas = new Map();
function nova(tipo, fn) {
  for (const t of tarefas.values()) if (t.tipo === tipo && t.status === 'rodando') return t;
  const t = { id: crypto.randomBytes(6).toString('hex'), tipo, status: 'rodando', inicio: Date.now(), resultado: null, erro: null };
  tarefas.set(t.id, t);
  fn().then(r => { t.status = 'ok'; t.resultado = r; }, e => { t.status = 'erro'; t.erro = e.message; console.error('[linkedin-estrategia]', tipo, e.message); })
    .finally(() => { t.fim = Date.now(); setTimeout(() => tarefas.delete(t.id), 30 * 60000).unref(); });
  return t;
}

// Planejamento automático: segunda a partir das 8h (Brasília), uma vez por semana
let _autoRodando = false;
function tickAuto() {
  const est = ler();
  if (!est || !est.autoPlanejar || !est.pilares.length || _autoRodando) return;
  const d = brt(Date.now());
  if (d.getUTCDay() !== 1 || d.getUTCHours() < 8) return;
  const s = semanaIso(segundaDaSemana(Date.now())), chave = s.ano + '-' + s.n;
  if (est.ultimoAuto === chave) return;
  db.prepare('UPDATE linkedin_estrategia SET ultimo_auto = ? WHERE id = 1').run(chave);
  _autoRodando = true;
  planejar({ semana: 'atual', por: 'ZEUS (automático)', auto: true })
    .then(r => { console.log('[linkedin-estrategia] plano automático:', JSON.stringify(r));
      require('./notificacoes').notificar({ para: 'admins', tipo: 'linkedin-plano', titulo: 'Semana do LinkedIn agendada', texto: `${r.posts} posts agendados pela estratégia${r.newsletter ? ' e 1 edição da newsletter para copiar' : ''}. Cada um sai sozinho no horário: edite ou cancele antes, se quiser.`, link: '/linkedin' }); })
    .catch(e => console.error('[linkedin-estrategia] plano automático falhou:', e.message))
    .finally(() => { _autoRodando = false; });
}

// ─── rotas (/api/social/linkedin/estrategia) ──────────────────────────────────
const router = express.Router();
const soAdmin = (req, res, next) => (req.user && req.user.admin) ? next() : res.status(403).json({ error: 'Só administradores da conta podem mudar a estratégia.' });
router.use(express.json({ limit: '256kb' }));
router.get('/', (_req, res) => {
  const est = ler();
  res.json({ estrategia: est, padrao: PADRAO, opcoes: { objetivos: OBJETIVOS, tons: TONS, formatos: FORMATOS, dias: DIAS },
    previa: est ? (() => { const seg = segundaDaSemana(Date.now()) + 7 * 86400000; return { vagas: vagasDaSemana(est, seg).map(v => ({ quando: v.quando, pilar: v.pilar && v.pilar.nome, formato: v.formato })), newsletter: temNewsletter(est, seg) }; })() : null });
});
router.put('/', soAdmin, (req, res) => {
  try { res.json({ estrategia: gravar(req.body || {}, req.user.email) }); } catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/sugerir', soAdmin, (req, res) => res.json({ tarefa: nova('sugerir', () => sugerir((req.body || {}).briefing)) }));
router.post('/conversa', soAdmin, (req, res) => res.json({ tarefa: nova('conversa', () => conversar((req.body || {}).mensagens)) }));
router.post('/planejar', soAdmin, (req, res) => {
  if (!ler()) return res.status(400).json({ error: 'salve a estratégia antes de planejar' });
  res.json({ tarefa: nova('planejar', () => planejar({ semana: (req.body || {}).semana === 'atual' ? 'atual' : 'proxima', por: req.user.email })) });
});
router.get('/tarefa/:id', (req, res) => { const t = tarefas.get(req.params.id); t ? res.json({ tarefa: t }) : res.status(404).json({ error: 'tarefa não encontrada (o servidor pode ter reiniciado)' }); });

module.exports = { router, ler, gravar, sugerir, conversar, blocoPrompt, planejar, tickAuto, vagasDaSemana, temNewsletter, segundaDaSemana, distribuir, limpar };
