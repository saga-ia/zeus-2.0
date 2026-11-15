// Jarvis (tela /jarvis): conversa por voz com o ZEUS, 100% grátis desde 15/11/2026 (antes: agente pago da ElevenLabs).
// Ouvir: Whisper da Groq (/api/chat/transcribe). Pensar: POST /api/jarvis/pensar -> GPT-OSS 120B na Groq (~0,6 s), com as
// ferramentas pedir_ao_zeus (dados e tarefas vão para o chat do ZEUS completo) e mostrar_quadro. Falar: POST /api/jarvis/falar
// -> voz grátis do jeff-voz (Piper, voz cadu, ~1 s, roda no próprio servidor em 127.0.0.1:3072). Frases curtas repetidas
// ("Deixa comigo", "Pronto") saem do cache em data/jarvis-voz/.
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

// Voz grátis do jeff-voz. VOZ_LOCAL_ID entra na chave do cache: trocar a voz não reaproveita áudio da voz antiga.
const VOZ_LOCAL_URL = process.env.JARVIS_VOZ_URL || 'http://127.0.0.1:3072/falar';
const VOZ_LOCAL_ID = 'edge:antonio+20';

// Pede a voz ao jeff-voz e devolve a resposta em fluxo (o áudio começa a tocar antes de ficar pronto)
async function pedirVoz(texto) {
  const r = await fetch(VOZ_LOCAL_URL, {
    method: 'POST', signal: AbortSignal.timeout(60000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ texto }),
  });
  if (!r.ok) { const e = await r.text().catch(() => ''); throw new Error('jeff-voz ' + r.status + ': ' + e.slice(0, 160)); }
  return r;
}

// ─── Conversa em tempo real (grátis): o navegador ouve e detecta o fim da fala, a Groq pensa aqui ──────────
// Pedidos com dados ou ação viram a ferramenta pedir_ao_zeus: a resposta volta com as ações para o navegador abrir a
// tarefa no chat do ZEUS (até 3 ao mesmo tempo). O resultado volta depois como "RESULTADO DO ZEUS" e a voz conta.
const PROMPT_VOZ = `Você é o ZEUS, o assistente de voz da Central da empresa {{empresa}}, falando com {{nome}} numa conversa em tempo real, como uma ligação.
Fale como gente, em português do Brasil do dia a dia, como num áudio de WhatsApp entre colegas: leve, direto, sem formalidade e sem enrolação. Responda em UMA ou DUAS frases curtas; só fale mais se a pessoa pedir detalhe. Pode usar expressões naturais como "beleza", "show", "fechado", "deixa comigo". Não repita a pergunta da pessoa e não termine toda resposta perguntando se ela precisa de mais alguma coisa. Nada de listas, numeração, links, emojis, markdown, códigos ou JSON: tudo o que você escreve vira voz.

Você não acessa dados sozinho, mas o ZEUS completo acessa tudo da empresa: o WhatsApp do Zeus (conversas, mensagens recebidas e enviadas, quem mandou mensagem), a agenda do Google, o e-mail, o Instagram, o LinkedIn, os anúncios da Meta, o ClickUp, o financeiro (Asaas), o CRM, os arquivos e o time.
NUNCA diga que não consegue acessar algo: passe o pedido para o Zeus.
Sempre que a pessoa pedir algo que precise de informação real ou de ação:
1. Chame a ferramenta pedir_ao_zeus com o pedido completo e claro, com nomes, períodos e o que a pessoa quer.
2. Depois diga em UMA frase curta, chamando a pessoa pelo nome, o que está fazendo (ex.: "{{nome}}, já estou puxando os números da campanha.") e pergunte o que mais ela precisa. Não invente números nem resultados.
3. O resultado chega depois numa mensagem que começa com "RESULTADO DO ZEUS". Conte o essencial em até três frases, com naturalidade (sem dizer "resultado do Zeus"). Os detalhes e os números aparecem na tela.
4. Se a pessoa pedir outra coisa enquanto o Zeus trabalha, chame a ferramenta de novo: o Zeus faz até 3 pedidos ao mesmo tempo.

O time que trabalha com você: Nina (social media), Sobral (tráfego pago), Ícaro (copy), Gustavo (design), Maicom (estratégia), Otávio (comercial), Smith (engenharia e segurança), Tomé (qualidade), Talles (vídeo) e Eduardo (minisites). Pedidos para eles também vão pela ferramenta pedir_ao_zeus.
Quadro na tela: quando a pessoa estiver descrevendo algo para o time criar (campanha, post, carrossel, site, anúncio, e-mail, proposta), monte o briefing na tela com a ferramenta mostrar_quadro JÁ NA PRIMEIRA informação e de novo a cada informação nova, sempre com TODOS os campos (preenchidos e os que faltam), sem anunciar que está anotando. Escolha 4 a 7 campos que importam (ex.: campanha: Objetivo, Público, Oferta, Canal, Orçamento, Prazo). Pergunte o que falta, um item por vez. Quando estiver completo e a pessoa confirmar, chame pedir_ao_zeus com o briefing inteiro e o agente certo.
A tela mostra sozinha o que o Zeus entregar (site, artes, mensagem enviada, e-mail, agenda, tarefa). Você pode dizer "olha na tela".
Mensagem que começa com "NA TELA:" é algo que a pessoa fez clicando na tela. Trate como fala dela.

Se a pessoa só estiver conversando ou pedir algo que você sabe responder sem dados, responda direto, sem ferramenta.
Publicar, mandar mensagem, cobrar, mudar campanha ou qualquer ação que saia da empresa: só com o ok explícito da pessoa. Confirme antes.
Você é o Zeus. Nunca diga que é um modelo de outra empresa.`;
const FERRAMENTAS = [
  { type: 'function', function: { name: 'pedir_ao_zeus',
    description: 'Passa um pedido para o ZEUS completo, que acessa os dados reais da empresa (WhatsApp, agenda, e-mail, anúncios, redes sociais, financeiro, tarefas, CRM), as ferramentas e o time de agentes. Use sempre que precisar de informação real ou de uma ação. O resultado chega depois numa mensagem RESULTADO DO ZEUS.',
    parameters: { type: 'object', properties: { tarefa: { type: 'string', description: 'O pedido completo e claro, em português, com nomes, períodos e o objetivo.' } }, required: ['tarefa'] } } },
  { type: 'function', function: { name: 'mostrar_quadro',
    description: 'Mostra e atualiza na tela o briefing que a pessoa está ditando (campanha, post, site, anúncio...). Chame a cada informação nova, com a lista completa de campos. Não busca dados nem executa nada.',
    parameters: { type: 'object', properties: {
      titulo: { type: 'string', description: 'Nome curto do que está sendo montado, ex.: "Campanha Black Friday".' },
      agente: { type: 'string', description: 'Quem do time vai executar: nina, sobral, icaro, gustavo, maicom, otavio, talles ou eduardo.' },
      campos: { type: 'string', description: 'Todos os campos numa linha, separados por " | ", no formato Rótulo: valor. Campo que falta vai sem valor.' },
    }, required: ['titulo', 'campos'] } } },
];
// GPT-OSS 120B: melhor português e ferramentas; Qwen entra se o primeiro falhar (limite do plano grátis, por exemplo)
const MODELOS = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b'];

function chaveGroq() {
  const k = chave('groq_api_key'); if (k) return k;
  try { const m = fs.readFileSync(process.env.WORKER_ENV_PATH || '/opt/jeff-worker/.env', 'utf8').match(/^\s*GROQ_API_KEY\s*=\s*(.+?)\s*$/m); if (m) return m[1].replace(/^['"]|['"]$/g, ''); } catch (_) {}
  return null;
}
async function groq(modelo, messages) {
  const corpo = { model: modelo, messages, tools: FERRAMENTAS, tool_choice: 'auto', temperature: 0.5, max_completion_tokens: 900 };
  if (modelo.includes('gpt-oss')) corpo.reasoning_effort = 'low';
  if (modelo.includes('qwen')) corpo.reasoning_effort = 'none';
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { authorization: 'Bearer ' + chaveGroq(), 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('groq ' + r.status + ': ' + String((j.error && j.error.message) || '').slice(0, 200));
  return j.choices[0].message;
}
// Uma rodada de conversa: devolve o que falar e as ações para a tela (abrir tarefas no Zeus, atualizar o quadro)
async function pensar({ texto, historico, nome, empresa, tarefas }) {
  let sistema = PROMPT_VOZ.replace(/\{\{nome\}\}/g, nome || 'você').replace(/\{\{empresa\}\}/g, empresa || 'ZEUS');
  if (tarefas && tarefas.length) sistema += '\n\nPedidos que o Zeus está fazendo agora (ainda não voltaram): ' + tarefas.slice(0, 6).map(t => '"' + String(t).slice(0, 160) + '"').join('; ') + '.';
  const msgs = [{ role: 'system', content: sistema }];
  (historico || []).slice(-14).forEach(m => { const c = String(m.texto || '').slice(0, 1500).trim(); if (c) msgs.push({ role: m.eu ? 'user' : 'assistant', content: c }); });
  msgs.push({ role: 'user', content: String(texto).slice(0, 6000) });
  const acoes = [];
  let erro;
  for (const modelo of MODELOS) {
    try {
      const conversa = msgs.slice();
      for (let volta = 0; volta < 3; volta++) {
        const m = await groq(modelo, conversa);
        const chamadas = m.tool_calls || [];
        if (!chamadas.length) return { fala: paraFala(m.content), acoes, modelo };
        conversa.push({ role: 'assistant', content: m.content || '', tool_calls: chamadas });
        for (const c of chamadas) {
          let args = {}; try { args = JSON.parse(c.function.arguments || '{}'); } catch (_) {}
          acoes.push({ ferramenta: c.function.name, args });
          const resultado = c.function.name === 'pedir_ao_zeus'
            ? 'Pedido enviado e o Zeus já começou a fazer. Diga em uma frase curta que já está fazendo isso e pergunte o que mais a pessoa precisa. O resultado chega depois numa mensagem RESULTADO DO ZEUS.'
            : 'Quadro atualizado na tela.';
          conversa.push({ role: 'tool', tool_call_id: c.id, content: resultado });
        }
      }
      return { fala: '', acoes, modelo };
    } catch (e) { erro = e; if (acoes.length) return { fala: '', acoes, modelo }; console.error('[jarvis] pensar (' + modelo + '):', e.message); }
  }
  throw erro;
}

const router = express.Router();
router.post('/pensar', express.json({ limit: '256kb' }), async (req, res) => {
  const b = req.body || {}, texto = String(b.texto || '').trim();
  if (!texto) return res.status(400).json({ error: 'nada para responder' });
  let empresa = 'ZEUS'; try { empresa = require('./config').empresaInfo().nome; } catch (_) {}
  const nome = String((req.user && req.user.name) || '').split(/\s+/)[0] || 'você';
  const ini = Date.now();
  try {
    const r = await pensar({ texto, historico: Array.isArray(b.historico) ? b.historico : [], nome, empresa, tarefas: Array.isArray(b.tarefas) ? b.tarefas : [] });
    res.json(Object.assign(r, { ms: Date.now() - ini }));
    console.log('[jarvis] pensar ' + (Date.now() - ini) + ' ms (' + r.modelo + ', ' + r.acoes.length + ' ação/ões)');
  } catch (e) { console.error('[jarvis] pensar:', e.message); res.status(502).json({ error: 'não consegui pensar agora: ' + e.message }); }
});

// Tempos medidos no navegador em cada resposta (espera do silêncio, transcrição, pensar, voz)
router.post('/tempo', express.json({ limit: '4kb' }), (req, res) => {
  const d = req.body || {}, n = k => Math.max(0, Math.round(+d[k] || 0));
  console.log(`[jarvis] tempos: total ${n('total')} ms = silêncio ${n('espera')} + ouvir ${n('ouvir')} + pensar ${n('pensar')} + voz ${n('voz')}`);
  res.json({ ok: true });
});

// Fala: GET /falar?t=... (o <audio> toca enquanto baixa) ou POST /falar { texto }. Frases curtas ficam em cache.
async function falar(req, res) {
  const texto = paraFala((req.body && req.body.texto) || req.query.t);
  if (!texto) return res.status(400).json({ error: 'nada para falar' });
  const h = crypto.createHash('sha1').update(VOZ_LOCAL_ID + texto).digest('hex'), arq = path.join(CACHE_DIR, h + '.mp3');
  res.set({ 'content-type': 'audio/mpeg', 'cache-control': 'no-store', 'x-jarvis-texto': encodeURIComponent(texto).slice(0, 4000) });
  if (texto.length <= CACHE_ATE && fs.existsSync(arq)) return res.send(fs.readFileSync(arq));
  const t0 = Date.now();
  let primeiro = 0;
  try {
    const r = await pedirVoz(texto), partes = [];
    const leitor = r.body.getReader();
    req.on('close', () => { if (!res.writableEnded) leitor.cancel().catch(() => {}); }); // interrompeu: para de gerar
    res.flushHeaders();
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      if (!primeiro) primeiro = Date.now() - t0;
      partes.push(Buffer.from(value));
      res.write(Buffer.from(value));
    }
    res.end();
    const audio = Buffer.concat(partes);
    console.log('[jarvis] voz ' + (r.headers.get('x-voz') || '?') + ': primeiro áudio ' + primeiro + ' ms, total ' + (Date.now() - t0) + ' ms, ' + texto.length + ' caracteres');
    if (texto.length <= CACHE_ATE && audio.length > 1000) fs.writeFile(arq, audio, () => {});
  } catch (e) {
    if (res.headersSent) return res.end();
    console.error('[jarvis] voz:', e.message);
    res.removeHeader('x-jarvis-texto');
    res.status(502).json({ error: 'não consegui gerar a voz: ' + e.message });
  }
}
router.get('/falar', falar);
router.post('/falar', express.json({ limit: '64kb' }), falar);

module.exports = { router, paraFala, pensar };
