// Agente de Design: cria posts de imagem com IA usando o Brand Kit da marca (social.js).
// Fluxo: Formato → Modo (objetivo, abordagem, como criar) → Prompt adaptado à marca (Claude) → Imagem (Nano Banana / GPT Image) → ajustes por versão.
// Motores: Google Gemini (Nano Banana) e OpenAI (GPT Image). Chaves em app_settings do worker.db (gemini_api_key, openai_api_key)
// ou nas variáveis GEMINI_API_KEY / OPENAI_API_KEY. Nunca saem daqui.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const Database = require('better-sqlite3');
const social = require('./social');
const gastos = require('./ia-gastos');

const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const WORKER_DB_PATH = process.env.WORKER_DB_PATH || '/opt/jeff-worker/data/worker.db';
const GEMINI_MODEL = process.env.DESIGN_GEMINI_MODEL || 'gemini-3-pro-image';
// Nano Banana Pro cobra o mesmo por 1K e 2K (US$ 0,134): pede 2K (~1856x2304 no 4:5) e o ffmpeg reduz pro tamanho do formato, fica mais nítido
const GEMINI_SIZE = process.env.DESIGN_GEMINI_SIZE || '2K';
// Faixas da tela → modelo e qualidade da OpenAI. GPT Image 2.5 (set/2026): Flare é rápido e já supera o 2; Sunburst é o 1º do ranking, ~2x mais lento.
// O 2.5 no "high" gasta o mesmo que o 2 no "medium" (~US$ 0,04 por post 4:5). Se o 2.5 falhar por modelo, cai pro gpt-image-2.
const OPENAI_MODEL = process.env.DESIGN_OPENAI_MODEL || 'gpt-image-2';
const FAIXAS = {
  medium: { modelo: process.env.DESIGN_OPENAI_MODEL_RAPIDA || 'gpt-image-2.5-flare', qualidade: 'high' },
  high: { modelo: process.env.DESIGN_OPENAI_MODEL_MAXIMA || 'gpt-image-2.5-sunburst', qualidade: 'high' },
};
const NOME_MODELO = { 'gpt-image-2.5-flare': 'GPT Image 2.5 Flare', 'gpt-image-2.5-sunburst': 'GPT Image 2.5 Sunburst', 'gpt-image-2': 'GPT Image 2', 'claude-html': 'Claude (HTML)' };
// Motor "claude": a arte é um HTML escrito pelo Claude (entra na assinatura, sem custo de API de imagem), fotografado
// pelo Chromium do servidor no tamanho exato do formato. Serve para arte de texto, layout e formas; não cria foto.
const CHROMIUM = process.env.DESIGN_CHROMIUM || '/usr/bin/chromium';
// Qualidade padrão do GPT Image: medium ~45s por arte; high ~2min (escolhida na tela em "Qualidade")
const OPENAI_QUALITY = process.env.DESIGN_OPENAI_QUALITY || 'medium';
const QUALIDADES = { medium: 'Rápida', high: 'Máxima' };
const CRIA_DIR = path.join(social.FILES_DIR, '_criacoes');
if (!fs.existsSync(CRIA_DIR)) fs.mkdirSync(CRIA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'central.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS social_criacoes (
  id TEXT PRIMARY KEY,
  marca_id TEXT NOT NULL,
  formato TEXT NOT NULL,
  dados TEXT NOT NULL DEFAULT '{}',
  versoes TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'rascunho',
  etapa TEXT,
  erro TEXT,
  por TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_social_criacoes_marca ON social_criacoes(marca_id, updated_at);
`);
// Servidor reiniciou no meio de uma geração: não fica "gerando" pra sempre
// (o CLI tools/design também carrega este arquivo: lá não mexe nas gerações do servidor)
if (!process.env.DESIGN_CLI) db.prepare(`UPDATE social_criacoes SET status = 'erro', erro = 'A geração foi interrompida (servidor reiniciado). Tente de novo.' WHERE status = 'gerando'`).run();

const newId = () => crypto.randomBytes(8).toString('base64url');
const parseJSON = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const txt = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const quem = (u) => (u && (u.name || u.email)) || 'ZEUS';

// ─── Catálogo (a tela lê daqui) ──────────────────────────────────────────────
// ratio: proporção pro Gemini; oa: tamanho pro GPT Image
const FORMATOS = [
  { id: 'ig-post', plat: 'instagram', nome: 'Post Portrait', w: 1080, h: 1350, ratio: '4:5', oa: '1024x1536', top: true },
  { id: 'ig-carrossel', plat: 'instagram', nome: 'Carrossel Portrait', w: 1080, h: 1350, ratio: '4:5', oa: '1024x1536', top: true, carrossel: true },
  { id: 'ig-quadrado', plat: 'instagram', nome: 'Post Quadrado', w: 1080, h: 1080, ratio: '1:1', oa: '1024x1024' },
  { id: 'ig-story', plat: 'instagram', nome: 'Stories Único', w: 1080, h: 1920, ratio: '9:16', oa: '1024x1536', top: true },
  { id: 'ig-story-carrossel', plat: 'instagram', nome: 'Stories Carrossel', w: 1080, h: 1920, ratio: '9:16', oa: '1024x1536', top: true, carrossel: true },
  { id: 'fb-post', plat: 'facebook', nome: 'Post Portrait', w: 1080, h: 1350, ratio: '4:5', oa: '1024x1536', top: true },
  { id: 'fb-quadrado', plat: 'facebook', nome: 'Post Quadrado', w: 1080, h: 1080, ratio: '1:1', oa: '1024x1024' },
  { id: 'fb-capa', plat: 'facebook', nome: 'Capa / Link', w: 1200, h: 630, ratio: '16:9', oa: '1536x1024' },
  { id: 'li-post', plat: 'linkedin', nome: 'Post Portrait', w: 1080, h: 1350, ratio: '4:5', oa: '1024x1536' },
  { id: 'li-carrossel', plat: 'linkedin', nome: 'Carrossel (documento)', w: 1080, h: 1350, ratio: '4:5', oa: '1024x1536', carrossel: true },
  { id: 'li-paisagem', plat: 'linkedin', nome: 'Post Paisagem', w: 1200, h: 627, ratio: '16:9', oa: '1536x1024' },
  { id: 'wa-banner', plat: 'whatsapp', nome: 'Banner WhatsApp', w: 1125, h: 600, ratio: '16:9', oa: '1536x1024' },
  { id: 'wa-quadrado', plat: 'whatsapp', nome: 'Post Quadrado', w: 1080, h: 1080, ratio: '1:1', oa: '1024x1024' },
  { id: 'wa-status', plat: 'whatsapp', nome: 'Status Único', w: 1080, h: 1920, ratio: '9:16', oa: '1024x1536', top: true },
  { id: 'wa-status-carrossel', plat: 'whatsapp', nome: 'Status Carrossel', w: 1080, h: 1920, ratio: '9:16', oa: '1024x1536', carrossel: true },
];
const PLATAFORMAS = { instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', whatsapp: 'WhatsApp' };
const OBJ_POST = { engajar: 'Engajar: aumentar interação e comunidade', vender: 'Vender: converter seguidores em clientes' };
const ABORDAGENS = [
  ['viral', 'Viral', '🔥', ['Hook polêmico, contrário ou surpreendente que quebre o padrão do feed, nunca comece com algo previsível', 'Estrutura de curiosidade: prometer um resultado ou revelação que só se descobre consumindo o conteúdo até o final', 'Linguagem direta, provocativa e sem formalidade corporativa: fale como uma pessoa real, não como uma marca', 'Visual com contraste extremo e elemento disruptivo que pare o scroll (cor vibrante, tipografia gigante, imagem inesperada)', 'CTA que incentive compartilhamento ativo: "marca quem precisa ver isso", "manda pra alguém que ainda acredita nisso"', 'Evitar clichês genéricos ("dica valiosa", "você sabia?"): ser específico e ousado no tema']],
  ['educativo', 'Educativo', '📚', ['Começar com a dor ou frustração mais específica do público, não usar perguntas genéricas', 'Conteúdo estruturado em passos numerados ou lista com hierarquia visual clara (negrito, ícones, separadores)', 'Cada ponto deve ser acionável e prático, algo que a pessoa possa aplicar imediatamente', 'Linguagem acessível e sem jargão técnico, como se explicasse para um amigo', 'Incluir um "aha moment": algo que surpreenda ou mude a perspectiva do leitor', 'CTA para salvar o post ("salva pra consultar depois") ou compartilhar com quem precisa']],
  ['comunidade', 'Comunidade', '💬', ['Pergunta aberta e opinativa em destaque que gere conversa real nos comentários, evitar perguntas de sim/não', 'Tom pessoal e vulnerável: compartilhar bastidores, erros, opiniões ou experiências reais', 'Criar senso de pertencimento: "quem mais passa por isso?", "só eu acho que..."', 'Design que convide à interação visual: enquete, "isso ou aquilo", escala de concordância', 'Elementos visuais acolhedores e humanos: fotos reais, cores quentes, tipografia informal', 'Evitar tom professoral: o objetivo é conversar, não ensinar']],
  ['autoridade', 'Autoridade', '🏆', ['Abrir com um dado, resultado ou afirmação forte que só um especialista faria', 'Mostrar método, bastidor técnico ou raciocínio por trás do resultado', 'Provas concretas: números, antes e depois, cases, certificações', 'Visual sóbrio e premium: muito respiro, tipografia elegante, poucos elementos', 'Posicionar a marca como referência sem arrogância', 'CTA para seguir o perfil ou acompanhar a série']],
  ['oferta', 'Oferta', '🏷️', ['Oferta clara no primeiro olhar: produto, benefício principal e condição (preço, desconto, bônus)', 'Urgência ou escassez real: prazo, estoque, vagas', 'Hierarquia: oferta > benefício > prova > CTA', 'Produto em destaque, bem iluminado, grande no layout', 'Selo ou etiqueta com a condição especial', 'CTA direto: "chama no direct", "link na bio", "garanta o seu"']],
  ['prova-social', 'Prova social', '⭐', ['Depoimento real ou resultado de cliente em destaque, com nome ou contexto', 'Transformação visível: antes e depois, números, conquista', 'Elementos de confiança: estrelas, aspas grandes, foto do cliente ou print estilizado', 'Texto curto: a prova fala por si', 'Conectar o resultado com a dor do público', 'CTA para quem quer o mesmo resultado']],
  ['bastidores', 'Bastidores', '🎬', ['Mostrar o processo, a equipe ou o dia a dia real da marca', 'Tom leve, humano e espontâneo', 'Visual com cara de registro real, pouca produção, luz natural', 'Revelar algo que o público não vê normalmente', 'Aproximar a marca das pessoas', 'CTA de conversa: "querem ver mais disso?"']],
  ['data', 'Data comemorativa', '📅', ['Conectar a data com o universo da marca de forma criativa, não genérica', 'Mensagem curta e emocional, sem clichê de "feliz dia de"', 'Visual temático sutil, mantendo a identidade da marca em primeiro plano', 'Se fizer sentido, amarrar com produto ou oferta', 'Evitar datas polêmicas ou fora do tom da marca', 'CTA de celebração ou compartilhamento']],
];
const MODOS = { zero: 'Criar do zero a partir da ideia', link: 'Adaptar o conteúdo de um link', inspiracao: 'Tema escolhido na biblioteca de inspirações' };
const PROVIDERS = { auto: 'Automático', gemini: 'Nano Banana', openai: 'GPT Image' };
const REGRAS_FORMATO = (f) => [`Aproveitar a ${f.h > f.w ? 'altura extra' : f.h === f.w ? 'área quadrada' : 'largura'} para criar hierarquia visual`, 'Título ou hook no terço superior do design', 'Conteúdo principal centralizado com respiro visual', 'CTA posicionado no terço inferior'];

// ─── Chaves ──────────────────────────────────────────────────────────────────
function chave(nome, env) {
  if (process.env[env]) return process.env[env];
  try {
    const w = new Database(WORKER_DB_PATH, { readonly: true, fileMustExist: true });
    try { const r = w.prepare('SELECT value FROM app_settings WHERE key = ?').get(nome); return r && r.value ? String(r.value).trim() : null; }
    finally { w.close(); }
  } catch (_) { return null; }
}
const chaves = () => ({ gemini: chave('gemini_api_key', 'GEMINI_API_KEY'), openai: chave('openai_api_key', 'OPENAI_API_KEY') });

// ─── Motores de imagem ───────────────────────────────────────────────────────
// imagens: [{ buf, mime, papel }] (papel só vai no texto do prompt)
async function viaGemini(key, prompt, imagens, f) {
  const parts = [{ text: prompt }].concat(imagens.map(i => ({ inlineData: { mimeType: i.mime, data: i.buf.toString('base64') } })));
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: f.ratio, imageSize: GEMINI_SIZE } } }),
    signal: AbortSignal.timeout(240000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error('Nano Banana: ' + ((j.error && j.error.message) || 'HTTP ' + r.status).split('\n')[0].slice(0, 220));
  const p = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  const img = p.find(x => x.inlineData && x.inlineData.data);
  if (!img) throw new Error('Nano Banana não devolveu imagem' + ((j.candidates || [])[0] && j.candidates[0].finishReason ? ' (' + j.candidates[0].finishReason + ')' : ''));
  return { buf: Buffer.from(img.inlineData.data, 'base64'), mime: img.inlineData.mimeType || 'image/png', modelo: GEMINI_MODEL, usage: j.usageMetadata || null };
}
async function viaOpenAI(key, prompt, imagens, f) {
  const fx = FAIXAS[f.q] || FAIXAS.medium;
  try { return await chamarOpenAI(key, prompt, imagens, f, fx.modelo, fx.qualidade); }
  catch (e) {
    if (fx.modelo === OPENAI_MODEL || !/model|does not exist|not found|not supported/i.test(e.message)) throw e;
    console.warn('[design] ' + fx.modelo + ' indisponível, usando ' + OPENAI_MODEL + ': ' + e.message);
    return chamarOpenAI(key, prompt, imagens, f, OPENAI_MODEL, f.q === 'high' ? 'high' : 'medium');
  }
}
async function chamarOpenAI(key, prompt, imagens, f, MODEL, QUAL) {
  let r;
  // gpt-image-2 gera em qualquer tamanho múltiplo de 16: pede o do formato (arredondado) e o ffmpeg só apara.
  // Modelos antigos só fazem 1:1, 2:3 e 3:2: aí a arte é recortada depois, com margem de corte avisada no prompt.
  const livre = /^gpt-image-2/.test(MODEL);
  const size = livre ? `${Math.ceil(f.w / 16) * 16}x${Math.ceil(f.h / 16) * 16}` : f.oa;
  const [ow, oh] = size.split('x').map(Number), alvo = f.w / f.h, gerado = ow / oh;
  if (Math.abs(alvo - gerado) > 0.02) {
    const corte = alvo > gerado ? Math.round(50 * (1 - gerado / alvo)) : Math.round(50 * (1 - alvo / gerado));
    prompt += `\n- IMPORTANTE: a imagem será recortada no centro para ${f.ratio}. Deixe ${corte + 2}% de margem ${alvo > gerado ? 'em cima e embaixo' : 'nas laterais'} só com fundo, sem texto, logo nem elemento importante.`;
  }
  if (imagens.length) {
    const fd = new FormData();
    fd.append('model', MODEL); fd.append('prompt', prompt.slice(0, 30000)); fd.append('size', size); fd.append('quality', QUAL); fd.append('n', '1');
    imagens.slice(0, 16).forEach((i, k) => fd.append('image[]', new Blob([i.buf], { type: i.mime }), `img${k}.${i.mime.split('/')[1] || 'png'}`));
    r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { authorization: 'Bearer ' + key }, body: fd, signal: AbortSignal.timeout(300000) });
  } else {
    r = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt: prompt.slice(0, 30000), size, quality: QUAL, n: 1 }), signal: AbortSignal.timeout(300000) });
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error('GPT Image: ' + ((j.error && j.error.message) || 'HTTP ' + r.status).slice(0, 220));
  const d = (j.data || [])[0];
  if (!d || !d.b64_json) throw new Error('GPT Image não devolveu imagem');
  return { buf: Buffer.from(d.b64_json, 'base64'), mime: 'image/png', modelo: MODEL, usage: j.usage || null, qualidade: QUAL };
}
// Recorta no centro e redimensiona pro tamanho exato do formato (ffmpeg). Se falhar, fica a original.
const { execFile } = require('child_process');
function ajustarTamanho(arquivo, f) {
  return new Promise(ok => {
    const tmp = arquivo + '.tmp.png';
    execFile('ffmpeg', ['-y', '-loglevel', 'error', '-i', arquivo, '-vf', `scale=${f.w}:${f.h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${f.w}:${f.h}`, tmp], { timeout: 60000 }, err => {
      if (err) { try { fs.unlinkSync(tmp); } catch (_) {} return ok(false); }
      try { fs.renameSync(tmp, arquivo); ok(true); } catch (_) { ok(false); }
    });
  });
}
// Mensagem curta pro chat quando um motor falha e o outro assume
function motivoCurto(msg) {
  const m = String(msg || '');
  if (/quota|billing|rate.?limit|RESOURCE_EXHAUSTED/i.test(m)) return m.split(':')[0] + ' sem cota (faturamento não ativado ou limite atingido)';
  if (/chave não configurada/.test(m)) return m;
  if (/api key|unauthori|401|403|permission/i.test(m)) return m.split(':')[0] + ' com chave inválida ou sem permissão';
  return m.slice(0, 140);
}
// Motor "claude": grava o HTML na pasta da criação (fica como fonte para ajustes) e tira o retrato em PNG
function viaHtml(html, f, arquivoHtml) {
  return new Promise((resolve, reject) => {
    const png = arquivoHtml.replace(/\.html$/, '') + '-render.png';
    fs.writeFileSync(arquivoHtml, String(html));
    require('child_process').execFile(CHROMIUM, ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--allow-file-access-from-files',
      `--window-size=${f.w},${f.h}`, '--virtual-time-budget=8000', `--screenshot=${png}`, 'file://' + arquivoHtml], { timeout: 90000 }, err => {
      if (!fs.existsSync(png)) return reject(new Error('não consegui renderizar o HTML' + (err ? ': ' + String(err.message).slice(0, 200) : '')));
      const buf = fs.readFileSync(png); fs.rm(png, { force: true }, () => {});
      resolve({ buf, mime: 'image/png', modelo: 'claude-html', provider: 'claude', aviso: null });
    });
  });
}

// auto: Nano Banana primeiro, GPT Image se falhar (ou se só houver uma chave)
async function gerarImagem(provider, prompt, imagens, f) {
  const k = chaves();
  const ordem = provider === 'gemini' ? ['gemini', 'openai'] : provider === 'openai' ? ['openai', 'gemini'] : ['gemini', 'openai'];
  const erros = [];
  for (const p of ordem) {
    if (!k[p]) { erros.push(`${PROVIDERS[p]}: chave não configurada`); continue; }
    try { const out = p === 'gemini' ? await viaGemini(k.gemini, prompt, imagens, f) : await viaOpenAI(k.openai, prompt, imagens, f); return Object.assign(out, { provider: p, aviso: erros.length ? erros.map(motivoCurto).join(' · ') : null }); }
    catch (e) { erros.push(e.message); }
  }
  throw new Error(erros.join(' · ') || 'nenhum motor de imagem configurado');
}

// ─── Montagem dos prompts ────────────────────────────────────────────────────
function lerImg(p) { try { const b = fs.readFileSync(p); const ext = path.extname(p).slice(1).toLowerCase(); return { buf: b, mime: ext === 'jpg' ? 'image/jpeg' : 'image/' + ext }; } catch (_) { return null; } }
function marcaDe(id) { const r = social.stmt.get.get(id); return r ? Object.assign(r, { d: parseJSON(r.dados, {}), refsL: parseJSON(r.refs, []) }) : null; }
function kitTexto(m) {
  const d = m.d, c = d.cores || {};
  const L = [`Marca: ${m.nome}${d.instagram ? ' (@' + d.instagram + ')' : ''}`];
  if (d.oQueFaz) L.push(`O que faz: ${d.oQueFaz}`);
  if (d.produtos) L.push(`Produtos/serviços: ${d.produtos}`);
  if (d.clienteIdeal) L.push(`Público: ${d.clienteIdeal}`);
  if (d.dores) L.push(`Dores do público: ${d.dores}`);
  if (d.desejos) L.push(`Desejos do público: ${d.desejos}`);
  if ((d.tons || []).length) L.push(`Tom de voz: ${d.tons.join(', ')}${d.persona ? '. ' + d.persona : ''}`);
  if (d.palavrasUsa) L.push(`Expressões que a marca usa: ${d.palavrasUsa}`);
  if (d.palavrasEvita) L.push(`Nunca usar: ${d.palavrasEvita}`);
  const cores = [c.primaria && 'primária ' + c.primaria, c.secundaria && 'secundária ' + c.secundaria, c.destaque && 'destaque ' + c.destaque].filter(Boolean);
  if (cores.length) L.push(`Cores da marca: ${cores.join(', ')}`);
  if (d.descricaoEstilo) L.push(`Estilo visual: ${d.descricaoEstilo}`);
  return L.join('\n');
}
function abordagem(id) { return ABORDAGENS.find(a => a[0] === id) || null; }
function formato(id) { return FORMATOS.find(f => f.id === id) || null; }
// Separa o prompt em slides ("## Slide N"); sem marcação é 1 slide só
function slidesDe(prompt) {
  const partes = String(prompt || '').split(/^#{1,3}\s*slide\s*\d+[^\n]*$/im).map(s => s.trim());
  const cab = partes.shift();
  const slides = partes.filter(Boolean);
  return slides.length ? slides.map(s => (cab ? cab + '\n\n' : '') + s) : [String(prompt || '').trim()];
}

// Prompt final que vai pro motor de imagem
function promptImagem(m, f, c, slideTxt, idx, total, anexos) {
  const d = m.d;
  const L = [];
  L.push(`Crie uma arte finalizada de ${PLATAFORMAS[f.plat]} no formato ${f.nome} (${f.w}x${f.h}px, proporção ${f.ratio})${total > 1 ? `, slide ${idx + 1} de ${total} de um carrossel` : ''}, pronta para publicar.`);
  L.push('', 'IDENTIDADE DA MARCA (siga à risca):', kitTexto(m));
  L.push('', 'CONTEÚDO DESTA ARTE:', slideTxt);
  L.push('', 'REGRAS:');
  L.push('- Todo texto na arte em português do Brasil, com ortografia e acentuação corretas. Reproduza headline e textos exatamente como escritos acima, sem inventar frases, sem lorem ipsum.');
  L.push('- Tipografia grande e legível no celular, hierarquia clara, contraste alto entre texto e fundo.');
  REGRAS_FORMATO(f).forEach(x => L.push('- ' + x));
  if (d.cores && d.cores.primaria) L.push('- Use a paleta da marca como dominante. Não introduza cores fora dela além de neutros.');
  L.push('- Não coloque moldura de celular, mockup, marca d\'água nem interface do Instagram. A arte ocupa o quadro todo.');
  if (total > 1 && idx > 0) L.push('- Mantenha exatamente o mesmo estilo, tipografia, paleta e grid do slide 1 (imagem anexada marcada como "slide 1").');
  if (anexos.length) {
    L.push('', 'IMAGENS ANEXADAS (na ordem):');
    anexos.forEach((a, i) => L.push(`${i + 1}. ${a.papel}`));
  }
  if (anexos.some(a => a.tipo === 'logo')) L.push('- A logo anexada deve aparecer fiel ao original (não redesenhe, não altere cores nem letras), pequena, como assinatura da marca.');
  if (anexos.some(a => a.tipo === 'ref')) L.push(`- Referências visuais da marca: ${social.FIDELIDADE[d.fidelidade] || social.FIDELIDADE.forte}. Não copie textos das referências.`);
  if (anexos.some(a => a.tipo === 'usuario')) L.push('- Imagens enviadas pelo usuário: use como indicado no conteúdo (produto, foto ou referência). Produto deve aparecer fiel ao original.');
  return L.join('\n');
}

// ─── Persistência ────────────────────────────────────────────────────────────
const st = {
  get: db.prepare(`SELECT * FROM social_criacoes WHERE id = ?`),
  list: db.prepare(`SELECT * FROM social_criacoes ORDER BY updated_at DESC LIMIT 200`),
  listM: db.prepare(`SELECT * FROM social_criacoes WHERE marca_id = ? ORDER BY updated_at DESC LIMIT 200`),
  ins: db.prepare(`INSERT INTO social_criacoes (id, marca_id, formato, dados, status, por, created_at, updated_at) VALUES (?, ?, ?, ?, 'gerando', ?, ?, ?)`),
  set: db.prepare(`UPDATE social_criacoes SET status = ?, etapa = ?, erro = ?, updated_at = ? WHERE id = ?`),
  ver: db.prepare(`UPDATE social_criacoes SET versoes = ?, status = 'pronto', etapa = NULL, erro = NULL, updated_at = ? WHERE id = ?`),
  dados: db.prepare(`UPDATE social_criacoes SET dados = ?, updated_at = ? WHERE id = ?`),
  del: db.prepare(`DELETE FROM social_criacoes WHERE id = ?`),
};
function pub(r) {
  if (!r) return null;
  const m = social.stmt.get.get(r.marca_id);
  return { id: r.id, marcaId: r.marca_id, marca: m ? m.nome : '(marca excluída)', formato: formato(r.formato) || { id: r.formato, nome: r.formato },
    dados: parseJSON(r.dados, {}), status: r.status, etapa: r.etapa, erro: r.erro, por: r.por, created_at: r.created_at, updated_at: r.updated_at,
    versoes: parseJSON(r.versoes, []).map(v => Object.assign({}, v, { urls: v.imagens.map(n => `/api/design/arquivo/${r.id}/${n}`) })) };
}
const dirCria = (id) => path.join(CRIA_DIR, id);
function gravarAnexo(cid, dataUrl, k) {
  const mm = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!mm) throw new Error('anexo precisa ser PNG, JPG ou WebP');
  const buf = Buffer.from(mm[3], 'base64');
  if (buf.length > 6 * 1024 * 1024) throw new Error('anexo acima de 6MB');
  const nome = `anexo-${k}.${mm[2] === 'jpeg' ? 'jpg' : mm[2]}`;
  fs.writeFileSync(path.join(dirCria(cid), nome), buf);
  return nome;
}

// Gera (ou ajusta) todos os slides de uma criação e grava como nova versão
// ─── Edição por área (seleção no editor) ─────────────────────────────────────
// marcarArea: cópia da arte com o retângulo contornado em magenta, só para a IA ver onde mexer.
// colarArea: recorta o retângulo da imagem nova (com borda suavizada) e cola sobre a arte anterior.
function pxArea(area, f, folga) {
  const W = f.w, H = f.h, m = Math.round((folga || 0) * Math.min(W, H));
  const x = Math.max(0, Math.round(area.x * W) - m), y = Math.max(0, Math.round(area.y * H) - m);
  const w = Math.min(W - x, Math.round(area.w * W) + 2 * m), h = Math.min(H - y, Math.round(area.h * H) + 2 * m);
  return { W, H, x, y, w: Math.max(2, w - (w % 2)), h: Math.max(2, h - (h % 2)) };
}
function marcarArea(arquivo, area, f) {
  return new Promise(ok => {
    const a = pxArea(area, f, 0), t = Math.max(4, Math.round(Math.min(a.W, a.H) / 160)), tmp = arquivo + '.marcada.png';
    execFile('ffmpeg', ['-y', '-loglevel', 'error', '-i', arquivo, '-vf', `scale=${a.W}:${a.H},drawbox=x=${a.x}:y=${a.y}:w=${a.w}:h=${a.h}:color=magenta@0.95:t=${t}`, tmp], { timeout: 30000 }, err => {
      if (err) return ok(null);
      try { const b = fs.readFileSync(tmp); fs.rmSync(tmp, { force: true }); ok(b); } catch (_) { ok(null); }
    });
  });
}
function colarArea(original, novo, area, f) {
  return new Promise(ok => {
    const a = pxArea(area, f, 0.012), F = Math.max(6, Math.round(Math.min(a.w, a.h) * 0.08)), tmp = novo + '.colada.png';
    const filtro = `[0:v]scale=${a.W}:${a.H}[base];[1:v]scale=${a.W}:${a.H},crop=${a.w}:${a.h}:${a.x}:${a.y},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*clip(min(min(X,W-1-X),min(Y,H-1-Y))/${F},0,1)'[c];[base][c]overlay=${a.x}:${a.y}:format=auto`;
    execFile('ffmpeg', ['-y', '-loglevel', 'error', '-i', original, '-i', novo, '-filter_complex', filtro, '-frames:v', '1', tmp], { timeout: 60000 }, err => {
      if (err) { try { fs.rmSync(tmp, { force: true }); } catch (_) {} return ok(false); }
      try { fs.renameSync(tmp, novo); ok(true); } catch (_) { ok(false); }
    });
  });
}

async function rodar(cid, opts) {
  const r = st.get.get(cid); if (!r) return;
  const m = marcaDe(r.marca_id), f = formato(r.formato), dd = parseJSON(r.dados, {});
  const versoes = parseJSON(r.versoes, []);
  const anterior = versoes[versoes.length - 1];
  const dir = dirCria(cid);
  try {
    if (!m) throw new Error('marca não encontrada');
    const slides = slidesDe(dd.prompt);
    // motor "claude": um HTML por lâmina (opts.htmls numa versão nova; senão os da criação)
    const htmls = dd.provider === 'claude' ? [].concat(opts.htmls || dd.htmls || []).filter(Boolean) : null;
    if (htmls && opts.htmls) { dd.htmls = htmls; st.dados.run(JSON.stringify(dd), Date.now(), cid); }
    const total = f.carrossel ? (htmls && htmls.length ? htmls.length : slides.length) : 1;
    const imagens = [];
    // Anexos fixos: logo, referências da marca e imagens do usuário
    const base = [];
    if (dd.logo && m.logo) { const i = lerImg(path.join(social.dirDe(m.id), m.logo)); if (i) base.push(Object.assign(i, { tipo: 'logo', papel: 'Logo oficial da marca' })); }
    if (dd.usarRefs !== false) m.refsL.slice(0, 4).forEach((x, k) => { const i = lerImg(path.join(social.dirDe(m.id), x.arquivo)); if (i) base.push(Object.assign(i, { tipo: 'ref', papel: `Referência visual ${k + 1} da marca` })); });
    (dd.anexos || []).forEach((n, k) => { const i = lerImg(path.join(dir, n)); if (i) base.push(Object.assign(i, { tipo: 'usuario', papel: `Imagem enviada pelo usuário ${k + 1}${(dd.anexosNotas || [])[k] ? ': ' + dd.anexosNotas[k] : ''}` })); });
    let aviso = null, prov = null, modelo = null;
    for (let k = 0; k < total; k++) {
      const alvo = opts.slide === undefined || opts.slide === null || opts.slide === k;
      if ((opts.ajuste || (opts.slide !== undefined && opts.slide !== null)) && !alvo && anterior && anterior.imagens[k]) { imagens.push(anterior.imagens[k]); continue; }
      st.set.run('gerando', total > 1 ? `Criando slide ${k + 1} de ${total}` : (opts.ajuste ? 'Aplicando ajuste' : 'Criando a arte'), null, Date.now(), cid);
      let prompt, anexos, out = null;
      if (htmls && !opts.ajuste) {
        // Arte em HTML do Claude: renderiza o HTML desta lâmina (ajuste por IA de imagem continua valendo, logo abaixo)
        if (!htmls[k]) throw new Error('falta o HTML da lâmina ' + (k + 1));
        out = await viaHtml(htmls[k], f, path.join(dir, `v${versoes.length + 1}-s${k + 1}.html`));
      } else if (opts.ajuste && anterior && anterior.imagens[k]) {
        // Ajuste: edita a imagem atual mantendo o resto
        const atual = lerImg(path.join(dir, anterior.imagens[k]));
        anexos = [Object.assign(atual, { tipo: 'atual', papel: 'Arte atual (edite esta)' })].concat(base.filter(b => b.tipo === 'logo' || b.tipo === 'usuario'));
        if (opts.area) {
          const marcada = await marcarArea(path.join(dir, anterior.imagens[k]), opts.area, f);
          if (marcada) anexos.splice(1, 0, { buf: marcada, mime: 'image/png', tipo: 'marcada', papel: 'A mesma arte com a ÁREA A EDITAR contornada em magenta (só referência de onde mexer)' });
          const pc = (v) => Math.round(v * 100);
          prompt = [`Edite a arte anexada (imagem 1), um ${f.nome} de ${PLATAFORMAS[f.plat]} da marca ${m.nome}.`, '',
            `EDITE SOMENTE A ÁREA MARCADA: o retângulo contornado em magenta na imagem 2 (de ${pc(opts.area.x)}% a ${pc(opts.area.x + opts.area.w)}% da largura e de ${pc(opts.area.y)}% a ${pc(opts.area.y + opts.area.h)}% da altura, a partir do canto superior esquerdo).`,
            `PEDIDO PARA ESSA ÁREA: ${opts.ajuste}`, '',
            'Fora dessa área, a imagem tem que continuar idêntica à imagem 1: mesmo enquadramento, mesmas posições, textos, cores e proporção. Não desenhe o contorno magenta no resultado. Devolva a arte inteira, no mesmo tamanho.',
            'O que entrar na área deve combinar com o entorno (luz, perspectiva, estilo e cores), sem emenda visível. Texto em português do Brasil, com acentos corretos.',
            anexos.length > 2 ? '\nOutras imagens anexadas:\n' + anexos.slice(2).map((a, i) => `${i + 3}. ${a.papel}`).join('\n') : ''].join('\n');
        } else prompt = [`Edite a arte anexada (imagem 1), um ${f.nome} de ${PLATAFORMAS[f.plat]} da marca ${m.nome}.`, '', `AJUSTE PEDIDO: ${opts.ajuste}`, '',
          'Mude só o que o ajuste pede. Mantenha layout, textos, paleta, tipografia e proporção de todo o resto exatamente como estão. Texto em português do Brasil, com acentos corretos.',
          '', 'ROTEIRO ORIGINAL DESTA ARTE (todos os textos que não forem alvo do ajuste devem continuar escritos exatamente assim, letra por letra, sem cortar nem embaralhar palavras):', slides[k] || slides[0],
          anexos.length > 1 ? '\nOutras imagens anexadas:\n' + anexos.slice(1).map((a, i) => `${i + 2}. ${a.papel}`).join('\n') : ''].join('\n');
      } else {
        anexos = base.slice();
        if (k > 0 && imagens[0]) { const s1 = lerImg(path.join(dir, imagens[0])); if (s1) anexos.unshift(Object.assign(s1, { tipo: 'slide1', papel: 'Slide 1 do carrossel (siga o mesmo estilo)' })); }
        prompt = promptImagem(m, f, dd, slides[k] || slides[0], k, total, anexos);
      }
      if (!out) out = await gerarImagem(opts.provider || dd.provider || 'auto', prompt, anexos, Object.assign({}, f, { q: QUALIDADES[opts.qualidade] ? opts.qualidade : QUALIDADES[dd.qualidade] ? dd.qualidade : OPENAI_QUALITY }));
      if (out.aviso) aviso = out.aviso;
      // Gasto com IA de imagem (HTML do Claude não entra: é assinatura)
      if (out.provider === 'gemini' || out.provider === 'openai') gastos.registrar({ origem: 'design', motor: out.provider, modelo: out.modelo, usage: out.usage, qualidade: out.qualidade, operacao: opts.ajuste ? 'editar' : 'gerar', criacao_id: cid, usuario: r.por, detalhe: m.nome });
      prov = out.provider; modelo = out.modelo || (out.provider === 'gemini' ? GEMINI_MODEL : null);
      let nome = `v${versoes.length + 1}-s${k + 1}-${Date.now().toString(36)}.${out.mime.includes('jpeg') ? 'jpg' : out.mime.split('/')[1] || 'png'}`;
      fs.writeFileSync(path.join(dir, nome), out.buf);
      // Tamanho exato do formato, sempre em PNG
      const png = nome.replace(/\.(jpg|jpeg|webp)$/, '.png');
      if (png !== nome) { fs.renameSync(path.join(dir, nome), path.join(dir, png)); nome = png; }
      await ajustarTamanho(path.join(dir, nome), f);
      // Edição por área: só o retângulo selecionado vem da imagem nova; o resto continua pixel a pixel igual à arte anterior
      if (opts.area && opts.ajuste && anterior && anterior.imagens[k] && alvo) {
        const ok = await colarArea(path.join(dir, anterior.imagens[k]), path.join(dir, nome), opts.area, f);
        if (!ok) console.warn('[design] não consegui colar só a área; ficou a imagem inteira da IA', cid);
      }
      imagens.push(nome);
    }
    const versaoNova = { v: versoes.length + 1, imagens, provider: prov, modelo: NOME_MODELO[modelo] || (prov === 'gemini' ? 'Nano Banana' : modelo), pedido: opts.ajuste || null, slide: opts.slide ?? null, area: opts.area || null, aviso, em: Date.now() };
    versoes.push(versaoNova);
    st.ver.run(JSON.stringify(versoes), Date.now(), cid);
    // Toda arte pronta vai para a Biblioteca: pasta "Agente de Design / <marca> / <data> <título>", com as imagens e a legenda
    try { await salvarNaBiblioteca(cid, versaoNova, m, f, dd); } catch (e) { console.error('[design] biblioteca', cid, e.message); }
  } catch (e) {
    console.error('[design] falha', cid, e.message);
    st.set.run(versoes.length ? 'pronto' : 'erro', null, e.message.slice(0, 600), Date.now(), cid);
  }
}

// ─── IA de texto (Claude) ────────────────────────────────────────────────────
function jsonDe(t) { const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a < 0 || b <= a) return null; try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; } }
function tiraTravessao(s) { return String(s || '').replace(/\s*[—–]\s*/g, ', '); }

// Link: baixa a página (só endereço público) e devolve o texto
async function publico(host) {
  const addrs = await dns.lookup(host, { all: true });
  return addrs.length && addrs.every(({ address: a }) => {
    if (net.isIPv4(a)) { const [x, y] = a.split('.').map(Number); return !(x === 10 || x === 127 || x === 0 || (x === 169 && y === 254) || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 100 && y >= 64 && y <= 127) || x >= 224); }
    const l = a.toLowerCase(); return !(l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:'));
  });
}
async function lerLink(url) {
  let u; try { u = new URL(url); } catch { throw new Error('link inválido'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('use um link http ou https');
  if (!(await publico(u.hostname))) throw new Error('esse endereço não é público');
  const r = await fetch(u, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (ZEUS Design)' }, signal: AbortSignal.timeout(15000) });
  if (r.status >= 300 && r.status < 400) { const loc = r.headers.get('location'); if (!loc) throw new Error('redirecionamento sem destino'); return lerLinkUmaVez(new URL(loc, u).toString()); }
  return extrair(r);
}
async function lerLinkUmaVez(url) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol) || !(await publico(u.hostname))) throw new Error('esse endereço não é público');
  return extrair(await fetch(u, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (ZEUS Design)' }, signal: AbortSignal.timeout(15000) }));
}
async function extrair(r) {
  if (!r.ok) throw new Error('a página respondeu ' + r.status);
  const html = (await r.text()).slice(0, 800000);
  const titulo = ((/<title[^>]*>([^<]*)<\/title>/i.exec(html) || [])[1] || '').trim();
  const desc = ((/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]+content=["']([^"']*)/i.exec(html) || [])[1] || '').trim();
  const corpo = html.replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
  return { titulo, texto: [desc, corpo].filter(Boolean).join('\n').slice(0, 9000) };
}

const router = express.Router();

router.get('/catalogo', (_req, res) => {
  const k = chaves();
  res.json({ formatos: FORMATOS, plataformas: PLATAFORMAS, objetivos: OBJ_POST, modos: MODOS, providers: PROVIDERS, qualidades: QUALIDADES, qualidadePadrao: OPENAI_QUALITY,
    abordagens: ABORDAGENS.map(a => ({ id: a[0], nome: a[1], emoji: a[2], regras: a[3] })),
    motores: { gemini: !!k.gemini, openai: !!k.openai, geminiModelo: GEMINI_MODEL, openaiModelo: FAIXAS.medium.modelo, openaiMaxima: FAIXAS.high.modelo } });
});

router.post('/link', async (req, res) => {
  try { res.json(await lerLink(txt((req.body || {}).url, 1000))); }
  catch (e) { res.status(400).json({ error: 'Não consegui ler o link: ' + e.message }); }
});

// Biblioteca de inspirações: temas prontos para a marca (datas do país, oportunidades, tendências do nicho)
router.post('/inspiracoes', async (req, res) => {
  const b = req.body || {};
  const m = marcaDe(b.marcaId); if (!m) return res.status(404).json({ error: 'marca não encontrada' });
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric' });
  const prompt = [`Hoje é ${hoje}. Você é estrategista de social media. Sugira 12 temas de post para a marca abaixo (país: ${m.d.pais || 'Brasil'}).`,
    '', kitTexto(m), b.objetivo ? `\nObjetivo dos posts: ${OBJ_POST[b.objetivo] || b.objetivo}` : '',
    '', 'Misture: 4 do tipo "Datas" (datas comemorativas dos próximos 45 dias no país da marca que façam sentido pro nicho), 4 "Oportunidades" (ângulos de conteúdo com potencial para esse público e produto) e 4 "Trends" (formatos e assuntos em alta em redes sociais adaptados ao nicho).',
    'Responda SÓ com JSON: {"ideias":[{"tipo":"Datas|Oportunidades|Trends","titulo":"até 60 caracteres","resumo":"1 frase explicando o tema","sugestao":"1 frase de como fazer o post","objetivo":"engajar|vender","abordagem":"viral|educativo|comunidade|autoridade|oferta|prova-social|bastidores|data"}]}',
    'Sem travessão. Português do Brasil.'].join('\n');
  try {
    const j = jsonDe(await social.claudeComImagens(prompt, social.dirDe(m.id)));
    if (!j || !Array.isArray(j.ideias)) throw new Error('resposta fora do formato');
    res.json({ ideias: j.ideias.slice(0, 15).map(x => ({ tipo: txt(x.tipo, 20), titulo: tiraTravessao(txt(x.titulo, 90)), resumo: tiraTravessao(txt(x.resumo, 300)), sugestao: tiraTravessao(txt(x.sugestao, 300)), objetivo: OBJ_POST[x.objetivo] ? x.objetivo : null, abordagem: abordagem(x.abordagem) ? x.abordagem : null })) });
  } catch (e) { res.status(502).json({ error: 'Não consegui gerar inspirações agora: ' + e.message }); }
});

// Prompt adaptado para a marca: transforma a ideia (ou o link) no roteiro da arte, editável pelo usuário
router.post('/prompt', async (req, res) => {
  const b = req.body || {};
  const m = marcaDe(b.marcaId); if (!m) return res.status(404).json({ error: 'marca não encontrada' });
  const f = formato(b.formato); if (!f) return res.status(400).json({ error: 'formato inválido' });
  const ab = abordagem(b.abordagem);
  const n = f.carrossel ? Math.min(10, Math.max(2, parseInt(b.slides, 10) || 5)) : 1;
  const ideia = txt(b.ideia, 3000), fonte = txt(b.fonte, 9000), atual = txt(b.atual, 8000), pedido = txt(b.pedido, 800);
  if (!ideia && !fonte && !atual) return res.status(400).json({ error: 'descreva a ideia do post' });
  const imgs = [];
  if (m.logo) imgs.push(`- Logo: ${path.join(social.dirDe(m.id), m.logo)}`);
  m.refsL.slice(0, 4).forEach((x, i) => imgs.push(`- Referência ${i + 1}: ${path.join(social.dirDe(m.id), x.arquivo)}`));
  const prompt = [
    `Você é o diretor de criação da marca ${m.nome}. Transforme o pedido abaixo no roteiro de uma arte de ${PLATAFORMAS[f.plat]} (${f.nome}, ${f.w}x${f.h}px)${n > 1 ? ` em carrossel de ${n} slides` : ''} que será gerada por IA de imagem.`,
    '', 'IDENTIDADE DA MARCA:', kitTexto(m),
    imgs.length ? '\nAbra com Read as imagens da marca antes de escrever os elementos visuais:\n' + imgs.join('\n') : '',
    '', `Objetivo do post: ${OBJ_POST[b.objetivo] || 'não informado'}`,
    ab ? `Abordagem: ${ab[1]}. Regras:\n${ab[3].map(x => '- ' + x).join('\n')}` : '',
    `Modo: ${MODOS[b.modo] || MODOS.zero}`,
    ideia ? `\nIdeia do usuário: ${ideia}` : '',
    fonte ? `\nConteúdo do link para adaptar (resuma e traduza para a marca, não copie):\n${fonte}` : '',
    atual ? `\nRoteiro atual (mantenha o que estiver bom):\n${atual}` : '',
    pedido ? `\nAjuste pedido: ${pedido}` : '',
    '', 'FORMATO DA RESPOSTA: exatamente duas partes, sem nada antes ou depois:', '===PROMPT===', '(o roteiro em markdown)', '===LEGENDA===', '(a legenda)',
    '- O roteiro em markdown com estas seções em negrito: **Objetivo do Conteúdo:**, **Headline:**, **Corpo do Texto:** (bullets curtos, só o texto que vai escrito na arte), **Elementos Visuais:** (bullets: foto/ilustração, composição, cores em hex da marca, tipografia, grafismos), **CTA:**.',
    n > 1 ? `- Carrossel: depois da seção **Objetivo do Conteúdo:** e **Elementos Visuais:** gerais, escreva ${n} blocos começando com a linha "## Slide 1", "## Slide 2"... cada um com **Headline:**, **Corpo do Texto:** e **Visual:** do slide. Slide 1 é a capa com o hook; o último tem o CTA.` : '',
    '- Textos da arte curtos (headline até 8 palavras, bullets até 12 palavras). Português do Brasil, no tom da marca. Sem travessão.',
    '- A legenda: pronta para o post, no tom da marca, com CTA e 3 a 6 hashtags no final.',
  ].filter(x => x !== '').join('\n');
  try {
    const out = await social.claudeComImagens(prompt, social.dirDe(m.id));
    const mm = /===\s*PROMPT\s*===([\s\S]*?)(?:===\s*LEGENDA\s*===([\s\S]*))?$/i.exec(out);
    let pr = mm ? mm[1].trim() : '', leg = mm && mm[2] ? mm[2].trim() : '';
    if (!pr) { const j = jsonDe(out); if (j && j.prompt) { pr = j.prompt; leg = j.legenda || ''; } }
    if (!pr) throw new Error('resposta fora do formato');
    res.json({ prompt: tiraTravessao(txt(pr.replace(/^```\w*\n?|```$/g, '').trim(), 12000)), legenda: tiraTravessao(txt(leg, 3000)), slides: n });
  } catch (e) { res.status(502).json({ error: 'Não consegui montar o prompt agora: ' + e.message }); }
});

// Criações
router.get('/criacoes', (req, res) => {
  const rows = req.query.marca ? st.listM.all(String(req.query.marca)) : st.list.all();
  res.json({ criacoes: rows.map(pub) });
});
router.get('/criacoes/:id', (req, res) => { const r = st.get.get(req.params.id); if (!r) return res.status(404).json({ error: 'criação não encontrada' }); res.json(pub(r)); });

router.post('/criacoes', (req, res) => {
  const b = req.body || {};
  const m = marcaDe(b.marcaId); if (!m) return res.status(404).json({ error: 'marca não encontrada' });
  const f = formato(b.formato); if (!f) return res.status(400).json({ error: 'formato inválido' });
  const prompt = txt(b.prompt, 12000); if (!prompt) return res.status(400).json({ error: 'o prompt está vazio' });
  const k = chaves(); if (!k.gemini && !k.openai) return res.status(400).json({ error: 'Nenhum motor de imagem configurado. Grave gemini_api_key ou openai_api_key em app_settings.' });
  const id = newId(), agora = Date.now();
  fs.mkdirSync(dirCria(id), { recursive: true });
  const anexos = [];
  try { (Array.isArray(b.anexos) ? b.anexos : []).slice(0, 4).forEach((a, i) => anexos.push(gravarAnexo(id, a, i + 1))); }
  catch (e) { fs.rmSync(dirCria(id), { recursive: true, force: true }); return res.status(400).json({ error: e.message }); }
  const dados = { objetivo: OBJ_POST[b.objetivo] ? b.objetivo : null, abordagem: abordagem(b.abordagem) ? b.abordagem : null, modo: MODOS[b.modo] ? b.modo : 'zero',
    ideia: txt(b.ideia, 3000), link: txt(b.link, 1000), prompt, legenda: txt(b.legenda, 3000), provider: PROVIDERS[b.provider] ? b.provider : 'auto', qualidade: QUALIDADES[b.qualidade] ? b.qualidade : OPENAI_QUALITY,
    logo: b.logo !== false, usarRefs: b.usarRefs !== false, anexos, anexosNotas: (Array.isArray(b.anexosNotas) ? b.anexosNotas : []).slice(0, 4).map(x => txt(x, 200)) };
  st.ins.run(id, m.id, f.id, JSON.stringify(dados), quem(req.user), agora, agora);
  try { require('./config').registrar('Agente de Design', `Post criado: ${m.nome} · ${PLATAFORMAS[f.plat]} ${f.nome}`, quem(req.user)); } catch (_) {}
  setImmediate(() => rodar(id, {}));
  res.json(pub(st.get.get(id)));
});

// Ajuste pelo chat do editor (edita a imagem atual) ou "Refazer" (gera do zero com o mesmo prompt)
router.post('/criacoes/:id/ajustar', (req, res) => {
  const r = st.get.get(req.params.id); if (!r) return res.status(404).json({ error: 'criação não encontrada' });
  if (r.status === 'gerando') return res.status(409).json({ error: 'ainda gerando, aguarde' });
  const b = req.body || {};
  const refazer = !!b.refazer, ajuste = txt(b.pedido, 1500);
  if (!refazer && !ajuste) return res.status(400).json({ error: 'diga o que ajustar' });
  if (b.prompt !== undefined || b.legenda !== undefined) {
    const dd = parseJSON(r.dados, {});
    if (b.prompt !== undefined && txt(b.prompt, 12000)) dd.prompt = txt(b.prompt, 12000);
    if (b.legenda !== undefined) dd.legenda = txt(b.legenda, 3000);
    st.dados.run(JSON.stringify(dd), Date.now(), r.id);
  }
  let slide = b.slide === undefined || b.slide === null || b.slide === '' ? null : parseInt(b.slide, 10);
  // Seleção de área no editor: { x, y, w, h } em frações da arte (0 a 1). Edita só aquele retângulo de uma lâmina.
  let area = null;
  if (!refazer && b.area && typeof b.area === 'object') {
    const n = (v) => Math.min(1, Math.max(0, Number(v) || 0));
    const x = n(b.area.x), y = n(b.area.y), w = Math.min(n(b.area.w), 1 - x), h = Math.min(n(b.area.h), 1 - y);
    if (w >= 0.02 && h >= 0.02) { area = { x, y, w, h }; if (slide === null) slide = 0; }
  }
  st.set.run('gerando', refazer ? 'Refazendo a arte' : area ? 'Editando a área selecionada' : 'Aplicando ajuste', null, Date.now(), r.id);
  setImmediate(() => rodar(r.id, refazer ? { provider: PROVIDERS[b.provider] ? b.provider : undefined, qualidade: b.qualidade, slide: refazer && slide !== null ? slide : undefined } : { ajuste, slide, area, qualidade: b.qualidade, provider: PROVIDERS[b.provider] ? b.provider : undefined }));
  res.json(pub(st.get.get(r.id)));
});
router.put('/criacoes/:id', (req, res) => {
  const r = st.get.get(req.params.id); if (!r) return res.status(404).json({ error: 'criação não encontrada' });
  const dd = parseJSON(r.dados, {}), b = req.body || {};
  if (b.legenda !== undefined) dd.legenda = txt(b.legenda, 3000);
  st.dados.run(JSON.stringify(dd), Date.now(), r.id);
  res.json(pub(st.get.get(r.id)));
});
router.delete('/criacoes/:id', (req, res) => {
  const r = st.get.get(req.params.id); if (!r) return res.status(404).json({ error: 'criação não encontrada' });
  st.del.run(r.id);
  // Os PNGs ficam no disco de propósito: conversas do agente e a Biblioteca continuam apontando pra eles
  res.json({ ok: true });
});
// Pasta automática na Biblioteca do ZEUS: a pessoa acha os PNGs (feed, story, carrossel) e a legenda sem abrir o estúdio
async function salvarNaBiblioteca(cid, versao, m, f, dd) {
  const kb = require('./knowledge');
  const r = st.get.get(cid); if (!r) return;
  const dados = parseJSON(r.dados, {});
  const bib = dados.biblioteca || {};
  if (bib.docs && bib.docs[String(versao.v)]) return; // já registrada
  const titulo = String(dd.ideia || (String(dd.prompt || '').split('\n').map(x => x.replace(/^#+\s*|\*\*/g, '').trim()).find(x => x && !/^slide/i.test(x)) || '') || f.nome).replace(/\s+/g, ' ').slice(0, 70);
  const dia = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const raiz = kb.garantirPasta('Agente de Design', null);
  const pastaMarca = kb.garantirPasta(m.nome, raiz);
  const pasta = bib.folderId && require('./knowledge') ? bib.folderId : kb.garantirPasta(`${dia} ${titulo}`, pastaMarca);
  const docs = [];
  versao.imagens.forEach((nome, k) => {
    docs.push(kb.registrarArquivo({ caminho: path.join(dirCria(cid), nome), nome, titulo: `${versao.imagens.length > 1 ? 'Slide ' + (k + 1) : f.nome} · v${versao.v} (${f.w}x${f.h})`, mime: 'image/png', folderId: pasta, tags: ['agente-de-design', f.id, m.nome], notas: `Criação ${cid} · editor: /ferramentas/agente-design?c=${cid}` }));
  });
  if (!bib.textoDoc && (dd.legenda || dd.prompt)) {
    bib.textoDoc = kb.registrarArquivo({ texto: [`Marca: ${m.nome}`, `Formato: ${f.nome} (${f.w}x${f.h})`, `Criação: ${cid} · editor /ferramentas/agente-design?c=${cid}`, '', dd.legenda ? 'LEGENDA:\n' + dd.legenda : '', dd.prompt ? '\nROTEIRO DA ARTE:\n' + dd.prompt : ''].filter(x => x !== '').join('\n'), titulo: `Legenda e roteiro · ${titulo}`, folderId: pasta, tags: ['agente-de-design', 'legenda', m.nome] });
  }
  bib.folderId = pasta; bib.docs = Object.assign({}, bib.docs, { [String(versao.v)]: docs });
  dados.biblioteca = bib;
  st.dados.run(JSON.stringify(dados), Date.now(), cid);
}

// Todas as artes de uma versão num .zip (com a legenda em legenda.txt)
router.get('/zip/:cid', (req, res) => {
  const r = st.get.get(path.basename(req.params.cid)); if (!r) return res.status(404).end();
  const versoes = parseJSON(r.versoes, []); if (!versoes.length) return res.status(404).json({ error: 'essa criação ainda não tem arte' });
  const v = versoes.find(x => String(x.v) === String(req.query.v)) || versoes[versoes.length - 1];
  const dir = dirCria(r.id), m = marcaDe(r.marca_id), f = formato(r.formato), dd = parseJSON(r.dados, {});
  const arquivos = (v.imagens || []).filter(n => /^(v\d+-s\d+-\w+|anexo-\d+)\.(png|jpe?g|webp)$/.test(n) && fs.existsSync(path.join(dir, n)));
  if (!arquivos.length) return res.status(404).json({ error: 'arquivos não encontrados' });
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'design-zip-')), tmp = path.join(tmpDir, 'legenda.txt');
  try { fs.writeFileSync(tmp, (dd.legenda ? dd.legenda + '\n' : '') + (dd.prompt ? '\n---\nRoteiro da arte:\n' + dd.prompt : '')); } catch (_) {}
  const nomeZip = `${(m ? m.nome : 'arte').replace(/[^\w-]+/g, '_')}-${f.id}-v${v.v}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${nomeZip}"`);
  const { spawn } = require('child_process');
  const z = spawn('zip', ['-j', '-q', '-'].concat(arquivos.map(n => path.join(dir, n))).concat(fs.existsSync(tmp) ? [tmp] : []));
  z.stdout.pipe(res);
  z.on('error', e => { if (!res.headersSent) res.status(500).json({ error: e.message }); else res.end(); });
  z.on('close', () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });
});

// Cópia da arte guardada na Biblioteca (salvarNaBiblioteca): o chat continua mostrando a imagem mesmo se a criação for excluída
const stKbArte = db.prepare(`SELECT id, filename FROM kb_docs WHERE originalname LIKE ? ESCAPE '\\' AND notes LIKE ? AND filename IS NOT NULL ORDER BY originalname = ? DESC, created_at DESC LIMIT 1`);
// Cada versão+lâmina tem um arquivo só (v3-s1-<carimbo>.png). O agente às vezes erra o carimbo ao copiar a URL;
// então, se o nome exato não existir, vale o arquivo com o mesmo prefixo v3-s1-
const prefixoArte = (nome) => { const m = /^(v\d+-s\d+-)/.exec(nome); return m ? m[1] : null; };
function arteNaPasta(cid, nome) {
  const dir = dirCria(cid), exato = path.join(dir, nome);
  if (fs.existsSync(exato)) return exato;
  const pre = prefixoArte(nome), ext = path.extname(nome).toLowerCase(); if (!pre) return null;
  try { const n = fs.readdirSync(dir).find(x => x.startsWith(pre) && path.extname(x).toLowerCase() === ext); return n ? path.join(dir, n) : null; } catch (_) { return null; }
}
function arteNaBiblioteca(cid, nome) {
  try {
    const pre = prefixoArte(nome), like = pre ? pre + '%' + path.extname(nome) : nome;
    const r = stKbArte.get(like.replace(/_/g, '\\_'), `Criação ${cid} ·%`, nome); if (!r) return null;
    const p = path.join(DATA_DIR, 'knowledge', path.basename(r.id), path.basename(r.filename));
    return fs.existsSync(p) ? p : null;
  } catch (_) { return null; }
}
// Confere os links de arte numa resposta do agente antes de gravar: corrige carimbo, versão ou criação errados
// e troca por aviso o que não existe. Assim nenhum link quebrado chega a ser salvo no chat.
function acharNomeEmOutraCriacao(nome) {
  try { for (const c of fs.readdirSync(CRIA_DIR)) if (fs.existsSync(path.join(CRIA_DIR, c, nome))) return c; } catch (_) {}
  return null;
}
function ultimaVersaoDaLamina(cid, nome) {
  const m = /^v\d+-s(\d+)-/.exec(nome); if (!m) return null;
  const r = st.get.get(cid); if (!r) return null;
  const vs = parseJSON(r.versoes, []);
  for (let i = vs.length - 1; i >= 0; i--) {
    const n = (vs[i].imagens || []).find(x => new RegExp(`^v\\d+-s${m[1]}-`).test(x));
    if (n && fs.existsSync(path.join(dirCria(cid), n))) return n;
  }
  return null;
}
function resolverArte(cid, nome) {
  const naPasta = arteNaPasta(cid, nome);
  if (naPasta) return { cid, nome: path.basename(naPasta) };
  if (arteNaBiblioteca(cid, nome)) return { cid, nome };
  const outra = acharNomeEmOutraCriacao(nome);
  if (outra) return { cid: outra, nome };
  const ult = ultimaVersaoDaLamina(cid, nome);
  if (ult) return { cid, nome: ult };
  return null;
}
function corrigirLinksArte(texto) {
  if (!texto || texto.indexOf('/api/design/arquivo/') === -1) return { texto, corrigidos: 0, removidos: 0 };
  let corrigidos = 0, removidos = 0;
  const RE = /(!?)\[([^\]\n]*)\]\(\/api\/design\/arquivo\/([\w-]+)\/([\w.-]+?)(\?[^)\s]*)?\)/g;
  const out = texto.replace(RE, (tudo, img, alt, cid, nome, qs) => {
    const r = resolverArte(cid, nome);
    if (r) {
      if (r.cid !== cid || r.nome !== nome) corrigidos++;
      return `${img}[${alt}](/api/design/arquivo/${r.cid}/${r.nome}${qs || ''})`;
    }
    removidos++;
    const editor = st.get.get(cid) ? ` · [abrir no editor](/ferramentas/agente-design?c=${cid})` : '';
    return `*(${alt || "arte"} indisponível${editor})*`;
  });
  return { texto: out, corrigidos, removidos };
}
// Miniatura (?mini=1): o chat e as listas mostram a arte a ~340 px, mas o PNG original tem 1 a 1,4 MB.
// Uma conversa do designer com 200+ artes baixava 200+ MB. A miniatura (720 px, JPEG) é gerada uma vez com o ffmpeg,
// fica em _mini/ na pasta da criação, e no máximo 2 são feitas ao mesmo tempo para não pesar o servidor.
const _miniFazendo = new Map(), _miniFila = [];
let _miniAtivos = 0;
function _miniProxima() {
  while (_miniAtivos < 2 && _miniFila.length) {
    const { src, dst, ok } = _miniFila.shift(); _miniAtivos++;
    const tmp = dst + '.tmp.jpg';
    execFile('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', "scale='min(720,iw)':-2", '-q:v', '4', tmp], { timeout: 30000 }, err => {
      _miniAtivos--;
      if (!err) { try { fs.renameSync(tmp, dst); } catch (_) { err = true; } }
      if (err) { try { fs.rmSync(tmp, { force: true }); } catch (_) {} }
      ok(!err); _miniProxima();
    });
  }
}
function miniatura(cid, src, nome) {
  const dir = path.join(dirCria(cid), '_mini'), dst = path.join(dir, nome.replace(/\.\w+$/, '') + '.jpg');
  if (fs.existsSync(dst)) return Promise.resolve(dst);
  if (_miniFazendo.has(dst)) return _miniFazendo.get(dst);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  const pr = new Promise(ok => { _miniFila.push({ src, dst, ok }); _miniProxima(); }).then(feito => { _miniFazendo.delete(dst); return feito ? dst : null; });
  _miniFazendo.set(dst, pr);
  return pr;
}
router.get('/arquivo/:cid/:nome', async (req, res) => {
  const cid = path.basename(req.params.cid), nome = path.basename(req.params.nome);
  if (!/^(v\d+-s\d+-[\w]+|anexo-\d+)\.(png|jpg|jpeg|webp)$/.test(nome)) return res.status(404).end();
  let p = arteNaPasta(cid, nome) || arteNaBiblioteca(cid, nome);
  if (!p) return res.status(404).end();
  if (req.query.mini && !req.query.baixar) { const m = await miniatura(cid, p, path.basename(p)); if (m) p = m; }
  res.set('Cache-Control', 'private, max-age=604800');
  if (req.query.baixar) res.set('Content-Disposition', `attachment; filename="${nome}"`);
  res.sendFile(p);
});

module.exports = { router, FORMATOS, PLATAFORMAS, ABORDAGENS, OBJ_POST, gerarImagem, viaHtml, chaves, rodar, st, pub, formato, marcaDe, dirCria, newId, salvarNaBiblioteca, corrigirLinksArte, arteNaPasta, arteNaBiblioteca };
