// Jarvis (tela /jarvis): voz do ZEUS. POST /api/jarvis/falar { texto } -> áudio MP3 com a voz grátis do jeff-voz
// (Kokoro, voz pm_alex, roda no próprio servidor em 127.0.0.1:3072; escolha do Jeff em 29/10/2026). O WhatsApp segue
// com a voz clonada da ElevenLabs. Frases repetidas ("Deixa comigo", "Pronto") saem do cache em data/jarvis-voz/.
// O resto do Jarvis usa o que a Central já tem: /api/chat/transcribe (Whisper) para ouvir e o chat do ZEUS
// (sessão com context 'jarvis', eventos status/acao/token/done) para pensar.
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const WORKER_DB = process.env.WORKER_DB_PATH || '/opt/jeff-worker/data/worker.db';
const DATA_DIR = process.env.CENTRAL_DATA_DIR || path.join(__dirname, 'data');
const CACHE_DIR = path.join(DATA_DIR, 'jarvis-voz');
const MAX_CHARS = 1500;          // uma resposta falada (o modo voz pede 3 ou 4 frases)
const CACHE_ATE = 120;           // só frases curtas vão para o cache
fs.mkdirSync(CACHE_DIR, { recursive: true });

function chave(nome) {
  const w = new Database(WORKER_DB, { readonly: true, fileMustExist: true });
  try { const r = w.prepare('SELECT value FROM app_settings WHERE key = ?').get(nome); return r && r.value ? String(r.value).trim() : null; }
  finally { w.close(); }
}

// Texto para falar: sem markdown, sem blocos de painel (já aparecem na tela), sem links
function paraFala(t) {
  return String(t || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#>`|]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/[—–]/g, ',')
    .replace(/\s+,/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CHARS);
}

// Um perfil de voz só para os dois caminhos (conversa em tempo real e respostas/avisos falados): antes cada um usava
// modelo, qualidade e ajustes diferentes e a voz parecia trocar no meio da conversa. O agente da ElevenLabs não aceita
// "style", então fica 0 nos dois; estabilidade um pouco mais alta deixa a voz igual de uma fala para a outra.
const VOZ_PERFIL = { model_id: 'eleven_multilingual_v2', stability: 0.6, similarity_boost: 0.85, speed: 1 }; // multilingual v2: a mais fiel à voz clonada (escolha do Jeff em 26/10/2026, amostra D)

// Respostas faladas: voz grátis do jeff-voz (Kokoro pm_alex). A conversa em tempo real continua no agente da
// ElevenLabs com VOZ_PERFIL acima.
const VOZ_LOCAL_URL = process.env.JARVIS_VOZ_URL || 'http://127.0.0.1:3072/falar';
const VOZ_LOCAL_ID = 'kokoro:pm_alex';

async function sintetizar(texto) {
  const r = await fetch(VOZ_LOCAL_URL, {
    method: 'POST', signal: AbortSignal.timeout(60000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ texto }),
  });
  if (!r.ok) { const e = await r.text().catch(() => ''); throw new Error('jeff-voz ' + r.status + ': ' + e.slice(0, 160)); }
  return Buffer.from(await r.arrayBuffer());
}

// ─── Conversa em tempo real (ElevenLabs Agents) ───────────────────────────────
// Um agente de voz da ElevenLabs conversa em tempo real (ouve enquanto você fala, responde em menos de 1 s, aceita
// interrupção) com a voz "Zeus". Para dados e tarefas ele chama a ferramenta de cliente pedir_ao_zeus: o navegador
// repassa ao chat do ZEUS (sessão 'jarvis', com o login da pessoa) e devolve o resultado para a voz falar.
// O agente é privado (enable_auth): a Central entrega só um token de sessão de curta duração.
const db = new Database(path.join(DATA_DIR, 'central.db'), { timeout: 5000 });
db.exec(`CREATE TABLE IF NOT EXISTS jarvis_config (chave TEXT PRIMARY KEY, valor TEXT, updated_at INTEGER)`);
const cfg = { get: k => (db.prepare('SELECT valor FROM jarvis_config WHERE chave = ?').get(k) || {}).valor || null,
  set: (k, v) => db.prepare('INSERT INTO jarvis_config (chave, valor, updated_at) VALUES (?, ?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at').run(k, v, Date.now()) };
const PROMPT_VOZ = `Você é o ZEUS, o assistente de voz da Central da empresa {{empresa}}, falando com {{nome}} numa conversa em tempo real, como uma ligação.
Fale em português do Brasil, natural e direto, com frases curtas. Nada de listas, links, códigos ou JSON em voz alta.

Você não acessa dados sozinho, mas o ZEUS completo acessa tudo da empresa: o WhatsApp do Zeus (o número conectado na Central: conversas, mensagens recebidas e enviadas, quem mandou mensagem, notificações), a agenda do Google, o e-mail, o Instagram, o LinkedIn, os anúncios da Meta, o ClickUp, o financeiro (Asaas), o CRM, os arquivos e o time.
NUNCA diga que não consegue acessar algo, nem que não tem acesso ao celular ou ao WhatsApp: passe o pedido para o Zeus.
Sempre que a pessoa pedir algo que precise de informação real ou de ação, faça assim:
1. Chame a ferramenta pedir_ao_zeus com o pedido completo e claro, com nomes, períodos e o que a pessoa quer. Ela responde na hora só confirmando que o pedido foi para o Zeus.
2. Você é MULTITAREFA, como um assistente pessoal de verdade: assim que a ferramenta confirmar, diga em uma frase curta, chamando a pessoa pelo nome, o que está fazendo (ex.: "{{nome}}, já estou puxando os números da campanha.") e pergunte o que mais ela precisa enquanto isso. Continue a conversa normalmente enquanto o Zeus trabalha: não fique em silêncio esperando, não invente números nem resultados e não pergunte se a pessoa ainda está aí.
3. O resultado chega depois numa mensagem que começa com "RESULTADO DO ZEUS". Quando ela chegar, conte o essencial em até três frases, com naturalidade (sem dizer "resultado do Zeus"). Os detalhes e os números aparecem na tela.
4. Se a pessoa pedir outra coisa enquanto o Zeus trabalha, chame a ferramenta de novo na hora: o Zeus faz até 3 pedidos ao mesmo tempo (a tela mostra as tarefas em andamento). Se ela perguntar o que está em andamento, diga quais pedidos ainda não voltaram.

O time que trabalha com você: Nina (social media), Sobral (tráfego pago), Ícaro (copy), Gustavo (design), Maicom (estratégia), Otávio (comercial), Smith (engenharia e segurança), Tomé (qualidade), Talles (vídeo) e Eduardo (minisites). Pedidos para eles também vão pela ferramenta pedir_ao_zeus.
Quadro na tela: quando a pessoa estiver descrevendo algo para o time criar (campanha, post, carrossel, site, anúncio, e-mail, proposta), monte o briefing na tela com a ferramenta mostrar_quadro enquanto ela fala.
Chame mostrar_quadro a cada informação nova, sempre com TODOS os campos (os já preenchidos e os que faltam), sem anunciar que está anotando. Escolha 4 a 7 campos que importam para aquele tipo de pedido (ex.: campanha: Objetivo, Público, Oferta, Canal, Orçamento, Prazo).
Pergunte o que falta, um item por vez. Quando estiver completo e a pessoa confirmar, chame pedir_ao_zeus com o briefing inteiro e o agente certo.
A tela também mostra sozinha o que o Zeus entregar: site com prévia, artes, mensagem de WhatsApp enviada, e-mail, agenda, tarefa. Você pode dizer "olha na tela".
Se a pessoa aprovar ou pedir ajuste clicando na tela, chega uma mensagem que começa com "NA TELA:". Trate como fala dela.

Se a pessoa só estiver conversando ou pedir algo que você sabe responder sem dados, responda direto, sem a ferramenta.
Publicar, mandar mensagem, cobrar, mudar campanha ou qualquer ação que saia da empresa: só com o ok explícito da pessoa. Confirme antes.
Você é o Zeus. Nunca diga que é um modelo de outra empresa.`;
const FERRAMENTA = { type: 'client', name: 'pedir_ao_zeus', expects_response: true, response_timeout_secs: 20,
  description: 'Passa um pedido para o ZEUS completo, que acessa os dados reais da empresa (WhatsApp do Zeus e suas conversas, agenda, e-mail, anúncios, redes sociais, financeiro, tarefas, CRM), as ferramentas e o time de agentes. Use sempre que precisar de informação real ou de uma ação. Responde na hora confirmando o envio; o resultado chega depois numa mensagem RESULTADO DO ZEUS.',
  parameters: { type: 'object', properties: { tarefa: { type: 'string', description: 'O pedido completo e claro, em português, com nomes, períodos e o objetivo.' } }, required: ['tarefa'] } };

const QUADRO = { type: 'client', name: 'mostrar_quadro', expects_response: false,
  description: 'Mostra e atualiza na tela o briefing que a pessoa está ditando (campanha, post, site, anúncio...). Chame a cada informação nova, com a lista completa de campos. Não busca dados nem executa nada.',
  parameters: { type: 'object', properties: {
    titulo: { type: 'string', description: 'Nome curto do que está sendo montado, ex.: "Campanha Black Friday".' },
    agente: { type: 'string', description: 'Quem do time vai executar: nina, sobral, icaro, gustavo, maicom, otavio, talles ou eduardo.' },
    campos: { type: 'string', description: 'Todos os campos numa linha, separados por " | ", no formato Rótulo: valor. Campo que falta vai sem valor. Ex.: "Objetivo: vender a mentoria | Público: donos de clínica | Orçamento: | Prazo: sexta"' },
  }, required: ['titulo', 'campos'] } };

async function el(metodo, caminho, corpo) {
  const r = await fetch('https://api.elevenlabs.io' + caminho, { method: metodo, signal: AbortSignal.timeout(30000),
    headers: Object.assign({ 'xi-api-key': chave('elevenlabs_api_key') }, corpo ? { 'content-type': 'application/json' } : {}), body: corpo ? JSON.stringify(corpo) : undefined });
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (_) {}
  if (!r.ok) throw new Error('ElevenLabs ' + r.status + ': ' + (typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail || t)).slice(0, 300));
  return j;
}
function configAgente() {
  const voz = chave('elevenlabs_voice_id') // sempre a "Jefferson ZEUS" (clonada), a mesma do WhatsApp; nada de voz reserva
  return { name: 'ZEUS Jarvis (Central)', platform_settings: { auth: { enable_auth: true } },
    conversation_config: {
      agent: { first_message: 'Fala, {{nome}}! O que você precisa?', language: 'pt', prompt: { prompt: PROMPT_VOZ, llm: 'gemini-2.5-flash', thinking_budget: 0, temperature: 0.4, tools: [FERRAMENTA, QUADRO] } },
      tts: { voice_id: voz, model_id: VOZ_PERFIL.model_id, stability: VOZ_PERFIL.stability, similarity_boost: VOZ_PERFIL.similarity_boost, speed: VOZ_PERFIL.speed, agent_output_audio_format: 'pcm_24000' },
      conversation: { max_duration_seconds: 900 },
      turn: { turn_timeout: 30 }, // silêncio longo enquanto o Zeus trabalha não é "você ainda está aí?"
    } };
}
// thinking_budget 0: o gemini-2.5-flash "pensava" antes de falar e algumas respostas levavam 4,5 s para começar (medido nas conversas de 15/10)
// Cria o agente uma vez; se o roteiro mudar (hash), atualiza
async function garantirAgente() {
  const conf = configAgente(), hash = crypto.createHash('sha1').update(JSON.stringify(conf)).digest('hex');
  let id = cfg.get('agent_id');
  if (!id) { id = (await el('POST', '/v1/convai/agents/create', conf)).agent_id; cfg.set('agent_id', id); cfg.set('agent_hash', hash); console.log('[jarvis] agente de voz criado', id); }
  else if (cfg.get('agent_hash') !== hash) { await el('PATCH', '/v1/convai/agents/' + encodeURIComponent(id), conf); cfg.set('agent_hash', hash); console.log('[jarvis] agente de voz atualizado', id); }
  return id;
}

const router = express.Router();
router.post('/voz/sessao', async (req, res) => {
  if (!req.user || !req.user.admin) return res.status(403).json({ error: 'A conversa em tempo real é só para administradores por enquanto (cada minuto consome a cota da ElevenLabs).' });
  try {
    const id = await garantirAgente();
    const ws = req.query.tipo === 'ws';
    const j = await el('GET', ws ? '/v1/convai/conversation/get-signed-url?agent_id=' + encodeURIComponent(id) : '/v1/convai/conversation/token?agent_id=' + encodeURIComponent(id));
    let empresa = 'ZEUS'; try { empresa = require('./config').empresaInfo().nome; } catch (_) {}
    res.json(Object.assign(ws ? { signedUrl: j.signed_url } : { conversationToken: j.token }, { nome: String(req.user.name || '').split(/\s+/)[0] || 'você', empresa }));
  } catch (e) { console.error('[jarvis] sessão de voz:', e.message); res.status(502).json({ error: e.message }); }
});

router.post('/falar', express.json({ limit: '64kb' }), async (req, res) => {
  const texto = paraFala(req.body && req.body.texto);
  if (!texto) return res.status(400).json({ error: 'nada para falar' });
  const h = crypto.createHash('sha1').update(VOZ_LOCAL_ID + texto).digest('hex'), arq = path.join(CACHE_DIR, h + '.mp3');
  try {
    let audio;
    if (texto.length <= CACHE_ATE && fs.existsSync(arq)) audio = fs.readFileSync(arq);
    else { audio = await sintetizar(texto); if (texto.length <= CACHE_ATE) fs.writeFileSync(arq, audio); }
    res.set({ 'content-type': 'audio/mpeg', 'cache-control': 'no-store', 'x-jarvis-texto': encodeURIComponent(texto).slice(0, 4000) }).send(audio);
  } catch (e) {
    console.error('[jarvis] voz:', e.message);
    res.status(502).json({ error: 'não consegui gerar a voz: ' + e.message });
  }
});

module.exports = { router, paraFala, garantirAgente, configAgente };
