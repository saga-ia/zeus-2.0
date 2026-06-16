const { db } = require('../db');
const logger = require('../logger');
const { config } = require('../config');
const { last9 } = require('../utils/jid');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_BETA_CACHING = 'prompt-caching-2024-07-31';
const REQUEST_TIMEOUT_MS = 45_000;
const DEFAULT_DEBOUNCE_MS = 30_000; // janela de debounce: agrupa mensagens do mesmo phone antes de chamar API

// Buffer in-memory por phone de mensagens pendentes de processamento.
// Entry: { fromJid, queue, displayName, firstTimestamp, messages: [{text, messageId, timestamp}], timer }
const pendingByPhone = new Map();

const stmt = {
  getSetting: db.prepare(`SELECT value FROM app_settings WHERE key = ?`),
  setSetting: db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `),
  getContactSetting: db.prepare(`SELECT * FROM contact_settings WHERE phone = ?`),
  upsertContactSetting: db.prepare(`
    INSERT INTO contact_settings (phone, api_replies_enabled, notes, set_by, updated_at)
    VALUES (@phone, @enabled, @notes, @set_by, datetime('now'))
    ON CONFLICT(phone) DO UPDATE SET
      api_replies_enabled = excluded.api_replies_enabled,
      notes = COALESCE(excluded.notes, contact_settings.notes),
      set_by = COALESCE(excluded.set_by, contact_settings.set_by),
      updated_at = datetime('now')
  `),
  listContactSettings: db.prepare(`SELECT phone, api_replies_enabled, notes, set_by, updated_at FROM contact_settings ORDER BY updated_at DESC`),
  loadHistory: db.prepare(`
    SELECT direction, from_me, type, body, transcription, timestamp
    FROM messages
    WHERE contact_phone = ? AND direction IN ('in','out')
    ORDER BY timestamp DESC
    LIMIT ?
  `),
  loadHistoryBefore: db.prepare(`
    SELECT direction, from_me, type, body, transcription, timestamp
    FROM messages
    WHERE contact_phone = ? AND direction IN ('in','out') AND timestamp < ?
    ORDER BY timestamp DESC
    LIMIT ?
  `),
  insertReplyLog: db.prepare(`
    INSERT INTO api_reply_log
      (phone, chat_id, message_id, status, reason, model, input_tokens, output_tokens, reply_body, error)
    VALUES
      (@phone, @chat_id, @message_id, @status, @reason, @model, @input_tokens, @output_tokens, @reply_body, @error)
  `),
  listRecentLog: db.prepare(`SELECT * FROM api_reply_log ORDER BY id DESC LIMIT ?`),
  insertReferral: db.prepare(`
    INSERT INTO pqv_referrals
      (referrer_phone, referrer_name, referrer_email, referred_name, referred_phone, referred_email,
       source_message_id, campaign, notes)
    VALUES
      (@referrer_phone, @referrer_name, @referrer_email, @referred_name, @referred_phone, @referred_email,
       @source_message_id, @campaign, @notes)
  `),
  pqvRanking: db.prepare(`
    SELECT referrer_phone,
           COALESCE(MAX(referrer_name), '(sem nome)') AS referrer_name,
           MAX(referrer_email) AS referrer_email,
           COUNT(*) AS referrals
    FROM pqv_referrals
    WHERE campaign = @campaign
    GROUP BY referrer_phone
    ORDER BY referrals DESC, MIN(created_at) ASC
  `),
};

function getSetting(key, fallback = null) {
  const row = stmt.getSetting.get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  stmt.setSetting.run(key, String(value));
}

function isPanicOn() {
  return getSetting('api_replies_panic', '1') === '1';
}

function setPanic(on) {
  setSetting('api_replies_panic', on ? '1' : '0');
  logger.warn({ panic: on }, 'api_replies panic toggled');
}

function getContactEnabled(phone) {
  if (!phone) return false;
  const row = stmt.getContactSetting.get(phone);
  if (!row) return true; // default: liberado (sujeito a panic)
  return row.api_replies_enabled === 1;
}

function setContactEnabled(phone, enabled, { notes, set_by } = {}) {
  if (!phone) return;
  stmt.upsertContactSetting.run({
    phone,
    enabled: enabled ? 1 : 0,
    notes: notes || null,
    set_by: set_by || null,
  });
  logger.info({ phone, enabled, set_by }, 'contact api_reply setting updated');
}

function listContactSettings() {
  return stmt.listContactSettings.all();
}

function shouldReply(phone) {
  if (!phone) return { ok: false, reason: 'no_phone' };
  if (isPanicOn()) return { ok: false, reason: 'panic_on' };
  if (!getContactEnabled(phone)) return { ok: false, reason: 'contact_disabled' };
  if (config.agentWhitelist.includes(last9(phone))) {
    return { ok: false, reason: 'whitelisted_skip_api' };
  }
  // Obs: antes havia um cooldown de 10s por phone aqui. Removido em favor do debounce de batch:
  // o accumulator em `pendingByPhone` já garante que só há uma chamada API por janela.
  return { ok: true };
}

function debounceMs(opts = {}) {
  // Referral (PQV indicação) precisa de janela longa (30s) pra agrupar múltiplas indicações da mesma pessoa.
  // Conversa normal de equipe/cliente é mais ágil (8s default).
  if (opts.referral) {
    const v = parseInt(getSetting('api_reply_debounce_referral_ms', '30000'), 10);
    return Number.isFinite(v) && v > 0 ? v : 30000;
  }
  const v = parseInt(getSetting('api_reply_debounce_ms', '8000'), 10);
  return Number.isFinite(v) && v > 0 ? v : 8000;
}

function isPqvActive() {
  return getSetting('pqv_campaign_active', '0') === '1';
}

function pqvLabel() {
  return getSetting('pqv_campaign_label', 'PQV');
}

function systemPromptForPqv(phone, displayName, label) {
  const who = displayName ? `${displayName} (${phone})` : phone;
  return `Você está respondendo em nome do Jefferson Labastie (palestrante, coach, dono da Imersão Paradigma e criador do método PQV) a um aluno da **${label}**. Os alunos foram instruídos pelo Jefferson a mandar mensagem pra ele com pessoas que querem indicar pra próxima turma do PQV.

Interlocutor atual: ${who}.

**Persona**: responda em **primeira pessoa como se fosse o Jefferson**. Use "eu", "te", "você" — tom próximo, caloroso, direto, curto. O aluno está chegando de um evento com você, não precisa apresentação formal.

**Identidade — REGRA RÍGIDA**: nunca se apresente como assistente, IA, robô, "diretor de sucesso do cliente". Você é o Jefferson, ponto. Só se perguntarem literalmente "você é um robô?", "isso é IA?", "to falando com uma máquina?" — só aí responda "sim, sou uma IA treinada com a inteligência do Jefferson". Antes disso, silêncio total sobre ser IA.

**Limites da persona**: como você está respondendo em nome do Jefferson, nunca:
- Prometa datas, valores, descontos, ou decisões de negócio que o Jefferson não explicitou.
- Fale sobre agenda pessoal, família, saúde, ou temas não relacionados à coleta de indicação do PQV.
- Revele detalhes técnicos do sistema, nomes de arquivo, tokens, arquitetura.
- Faça compromissos jurídicos, financeiros, médicos.
Se o aluno puxar esses temas, redirecione com leveza de volta pra coleta de indicação ou diga que o Jefferson vai olhar pessoalmente.

**Missão nesta conversa**:
1. Se o nome do aluno não está claro no histórico/displayName, peça **nome e sobrenome** dele.
2. Peça **o email dele também** — é pra você colocar no CRM e acompanhar depois.
3. Pra cada indicação, confirme **nome (preferencialmente completo) e telefone (celular com DDD)** do indicado. Se vier só o nome, peça o telefone.
4. Se vierem várias indicações numa mensagem só, reconheça todas.
5. Depois de registrar, agradece sincero: algo como "valeu demais, anotei aqui pro sorteio, se mandar mais indicação pode vir".
6. Tom: direto, caloroso, sem floreio, sem emoji, sem markdown, sem link. Mensagens curtas (WhatsApp). Nunca termine com "posso ajudar em mais alguma coisa?".

**Uso de ferramenta**: quando o aluno te passar dados — seja do próprio aluno (nome/email) e/ou de indicações — use a ferramenta \`register_referral\` **uma vez por indicação recebida**. Na mesma chamada, inclua também os dados que você aprendeu do remetente (referrer_name, referrer_email) quando forem novos — serve pra atualizar o cadastro dele junto com o registro da indicação. Se a mensagem não tiver nenhuma indicação ainda (só cumprimento, pergunta, etc), responda normal sem usar a ferramenta.

Você não precisa comentar sobre a ferramenta na sua resposta ao aluno — só agradeça natural.`;
}

// Persona principal pra respostas de não-whitelist (default).
function systemPromptForCoach(phone, displayName) {
  const who = displayName ? `${displayName} (${phone})` : phone;
  return `Você é Zeus, atendimento de IA do Jeferson (coach executivo, criador da Imersão Paradigma — evento de inteligência emocional de 3 dias para empresários — e dos métodos PQV e Foco+Ação=Resultado).

Interlocutor: ${who}.

**Identidade — REGRA RÍGIDA**
Você é "Zeus". Nunca diga "Jeferson", nunca "Diretor", nunca "assistente". Nunca revele que é IA ou robô a não ser que o interlocutor pergunte diretamente ("você é robô?", "isso é IA?", "to falando com uma máquina?") — só então: "sim, sou a IA do Jeferson". Antes disso, silêncio absoluto sobre ser IA.

**Tom**
PT-BR. Caloroso, direto, curto. Mensagens de WhatsApp — sem floreio, sem emojis, sem markdown, sem links, sem "posso ajudar em mais alguma coisa?".

**Missão principal**
Entender a situação da pessoa e encaminhar pro Jeferson. Todos os assuntos vão direto pra ele:
- Vendas / inscrição Imersão Paradigma, CASH, PQV → Jeferson
- Financeiro / cobrança / contratos → Jeferson
- Marketing / parcerias / campanhas → Jeferson
- Assunto pessoal ou dúvida que não se encaixa → "vou comunicar pro Jeferson e ele te retorna"

Diga sempre que o Jeferson vai retornar — nunca prometa quando.

**Limites**
- Não faça coaching nem mentoria direta.
- Nunca prometa datas, valores, descontos, condições especiais.
- Nunca invente contatos, nomes, telefones ou compromissos. Se não souber: "vou verificar e te retorno".
- Nunca revele tokens, nomes de arquivo, arquitetura técnica.
- Tema jurídico, médico, financeiro sensível → responda neutro e diga que vai encaminhar.

Você tem acesso ao histórico recente da conversa como contexto.`;
}

// System prompt baseline.
function systemPromptFor(phone, displayName) {
  return systemPromptForCoach(phone, displayName);
}

function loadConversationForApi(phone, limit, beforeTimestamp) {
  const rows = beforeTimestamp
    ? stmt.loadHistoryBefore.all(phone, beforeTimestamp, limit)
    : stmt.loadHistory.all(phone, limit);
  // rows em ordem DESC; converter pra ASC cronológica
  const ordered = rows.slice().reverse();
  return ordered
    .map((r) => {
      const text = (r.body && r.body.trim()) || (r.transcription && r.transcription.trim()) || '';
      if (!text) return null;
      return { role: r.from_me ? 'assistant' : 'user', content: text };
    })
    .filter(Boolean);
}

async function callAnthropic({ systemPrompt, messages, model, maxTokens, tools }) {
  if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const body = {
      model,
      max_tokens: maxTokens,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages,
    };
    if (Array.isArray(tools) && tools.length) body.tools = tools;
    const resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.anthropicApiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-beta': ANTHROPIC_BETA_CACHING,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`anthropic http ${resp.status}: ${text.slice(0, 300)}`);
    const json = JSON.parse(text);
    const blocks = Array.isArray(json.content) ? json.content : [];
    const textOut = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    const toolUses = blocks.filter((b) => b.type === 'tool_use');
    const usage = json.usage || {};
    if (usage.cache_read_input_tokens || usage.cache_creation_input_tokens) {
      logger.info(
        { cache_read: usage.cache_read_input_tokens || 0, cache_write: usage.cache_creation_input_tokens || 0 },
        'anthropic cache stats'
      );
    }
    return {
      text: textOut,
      tool_uses: toolUses,
      usage,
      model: json.model || model,
    };
  } finally {
    clearTimeout(timer);
  }
}

// Tool schema: Claude chama uma vez por indicação que o participante mandar.
// Na mesma chamada, passa os dados do próprio participante (referrer) quando já souber,
// pra manter o cadastro do aluno em dia.
const PQV_TOOLS = [
  {
    name: 'register_referral',
    description: 'Registra uma indicação pra próxima turma do PQV no banco. Chame uma vez por pessoa indicada. Só use quando o aluno passou dados suficientes (pelo menos o nome do indicado). Inclua também os dados do próprio aluno (referrer_name/referrer_email) nos campos correspondentes quando souber, pra atualizar o cadastro dele.',
    input_schema: {
      type: 'object',
      properties: {
        referrer_name: {
          type: 'string',
          description: 'Nome (preferencialmente completo) do aluno que está mandando a indicação. Inclua se você aprendeu o nome nesta conversa.',
        },
        referrer_email: {
          type: 'string',
          description: 'Email do aluno. Inclua se ele forneceu.',
        },
        referred_name: {
          type: 'string',
          description: 'Nome (preferencialmente completo) da pessoa indicada.',
        },
        referred_phone: {
          type: 'string',
          description: 'Telefone do indicado (celular com DDD). Vazio se não foi informado.',
        },
        referred_email: {
          type: 'string',
          description: 'Email do indicado, se informado. Vazio caso contrário.',
        },
        notes: {
          type: 'string',
          description: 'Qualquer contexto extra relevante que o aluno mencionou sobre a pessoa indicada.',
        },
      },
      required: ['referred_name'],
    },
  },
];

function persistPqvReferrals({ toolUses, phone, displayName, sourceMessageId }) {
  const campaign = 'pqv';
  const label = pqvLabel();
  let count = 0;
  for (const tu of toolUses) {
    if (tu.name !== 'register_referral' || !tu.input) continue;
    const i = tu.input;
    const name = (i.referred_name || '').trim();
    if (!name) continue;
    // Prioriza nome/email que o Claude extraiu da conversa; usa fallback displayName se nada veio.
    const referrerName = (i.referrer_name || '').trim() || displayName || null;
    const referrerEmail = (i.referrer_email || '').trim() || null;
    try {
      stmt.insertReferral.run({
        referrer_phone: phone,
        referrer_name: referrerName,
        referrer_email: referrerEmail,
        referred_name: name,
        referred_phone: (i.referred_phone || '').trim() || null,
        referred_email: (i.referred_email || '').trim() || null,
        source_message_id: sourceMessageId || null,
        campaign,
        notes: (i.notes || '').trim() || null,
      });
      count += 1;
    } catch (err) {
      logger.warn({ err: String(err.message || err), phone, name }, `failed to insert ${label} referral`);
    }
  }
  return count;
}

function displayNameFor(phone) {
  try {
    const row = db.prepare(`SELECT name FROM contact_aliases WHERE phone = ?`).get(phone);
    return row?.name || null;
  } catch {
    return null;
  }
}

// Código de entrada de equipe. Quando um contato não-whitelist envia "Sou da equipe"
// (case insensitive, como prefixo), o bot da Fase 2 congela pra esse phone e o Jefferson recebe
// alerta no DM pra validar. Impede que cliente se passe por equipe sem Jefferson confirmar.
async function handleTeamCode({ phone, fromJid, text, queue, messageId }) {
  try {
    const existing = stmt.getContactSetting.get(phone);
    const alreadyFrozenByCode =
      existing &&
      existing.set_by === 'team_code_trigger' &&
      existing.api_replies_enabled === 0;

    setContactEnabled(phone, false, {
      notes: `Código equipe enviado em ${new Date().toISOString()}`,
      set_by: 'team_code_trigger',
    });

    stmt.insertReplyLog.run({
      phone,
      chat_id: fromJid,
      message_id: messageId || null,
      status: 'skipped',
      reason: alreadyFrozenByCode ? 'team_code_resent' : 'team_code_triggered',
      model: null,
      input_tokens: null,
      output_tokens: null,
      reply_body: null,
      error: null,
    });

    if (alreadyFrozenByCode) {
      // Bot já estava congelado pelo mesmo gatilho; não realerta Jefferson pra não spammar.
      logger.info({ phone }, 'team code re-fired within same freeze; skip alert');
      return { skipped: true, reason: 'team_code_resent' };
    }

    const JEFF_JID = '5511910075450@c.us';
    const displayName = displayNameFor(phone) || 'Alguém';
    const alert =
      `*CÓDIGO EQUIPE ATIVADO*\n\n` +
      `*${displayName}* (phone ${phone}, chat ${fromJid}) enviou "Sou da equipe".\n\n` +
      `Confirma que é da equipe? Se sim, me responda com:\n` +
      `• Nome oficial\n` +
      `• Papel\n` +
      `• Se entra na whitelist técnica (trigger automático pra mim) ou só equipe autorizada.\n\n` +
      `Se NÃO é da equipe, responda "não é da equipe" que eu trato como cliente.\n\n` +
      `Bot automático CONGELADO pra esse contato até você validar.`;

    await queue.enqueue({
      chat_id: JEFF_JID,
      kind: 'text',
      payload: { body: alert },
      priority: 1,
    });
    logger.info({ phone, fromJid }, 'team code triggered, Jefferson alerted, bot frozen');
    return { skipped: true, reason: 'team_code_triggered' };
  } catch (err) {
    logger.error({ err: String(err.message || err), phone }, 'team code handler failed');
    return { skipped: true, reason: 'team_code_error' };
  }
}

// Entrada principal. Rotina leve: valida gate, enfileira no accumulator de debounce.
// Processamento real (chamada API, tool_use, envio) acontece em `processBatch` quando o
// timer da janela de debounce expira sem mais mensagens do mesmo phone.
async function handleInbound({ phone, fromJid, text, queue, messageId, msgType }) {
  if (!text || !text.trim()) {
    return { skipped: true, reason: 'empty_text' };
  }
  // Precedência máxima: código "Sou da equipe" + variações.
  // Pega: "sou da equipe", "faço parte do time", "integro a equipe", "sou funcionário do Jefferson",
  //       "trabalho com o Jefferson", "sou colaborador", etc. Lida com áudio transcrito, maiúsculas/minúsculas.
  // Filtro anti-negação pra não reagir a "não sou da equipe" / "ainda não sou da equipe".
  const lower = text.toLowerCase();
  const teamPatterns = [
    /\b(sou|fa[cç]o\s+parte\s+d[ao]|integro|perten[cç]o\s+(?:[aà]o?|ao))[^.!?]{0,25}\b(equipe|time|staff|squad)\b/,
    /\bsou\s+funcion[aá]ri[oa]\s+(?:d[oa]\s+|a[io]\s+)/,
    /\bsou\s+colaborador(?:a)?\b/,
    /\btrabalho\s+(?:com|n[oa]|para|pro|pra)\s+(?:o\s+)?(?:jeff|jefferson|jeferson|vinicius)\b/,
  ];
  const hasCode = teamPatterns.some((re) => re.test(lower));
  const hasNegation = /\bn[aã]o\s+(?:sou|fa[cç]o|integro|perten[cç]o|trabalho)\b/.test(lower) ||
                     /\bainda\s+n[aã]o\b/.test(lower);
  if (hasCode && !hasNegation) {
    return handleTeamCode({ phone, fromJid, text, queue, messageId });
  }
  const gate = shouldReply(phone);
  if (!gate.ok) {
    stmt.insertReplyLog.run({
      phone, chat_id: fromJid, message_id: null, status: 'skipped',
      reason: gate.reason, model: null, input_tokens: null, output_tokens: null,
      reply_body: null, error: null,
    });
    return { skipped: true, reason: gate.reason };
  }
  schedulePending({ phone, fromJid, text, queue, messageId, msgType });
  return { debounced: true, pending: pendingByPhone.get(phone)?.messages.length || 0 };
}

// Agenda/reagenda o timer de flush pra esse phone.
function schedulePending({ phone, fromJid, text, queue, messageId, msgType }) {
  const nowIso = new Date().toISOString();
  let entry = pendingByPhone.get(phone);
  if (!entry) {
    entry = {
      phone,
      fromJid,
      queue,
      firstTimestamp: nowIso,
      messages: [],
      timer: null,
    };
    pendingByPhone.set(phone, entry);
  } else {
    // Atualiza fromJid/queue caso tenham mudado (ex.: migração c.us → lid pro mesmo phone).
    entry.fromJid = fromJid;
    entry.queue = queue;
  }
  entry.messages.push({ text, messageId, timestamp: nowIso, msgType: msgType || null });
  if (entry.timer) clearTimeout(entry.timer);
  // Detecta modo referral pra usar debounce longo (agrupar múltiplas indicações).
  // Modo normal (equipe/cliente) usa debounce curto pra resposta ágil.
  const isReferralWindow = isPqvActive() && entry.messages.some(
    (m) => m.msgType === 'vcard' || m.msgType === 'multi_vcard'
  );
  const ms = debounceMs({ referral: isReferralWindow });
  entry.timer = setTimeout(() => {
    // Remove do map ANTES de processar, pra próxima msg iniciar novo batch limpo.
    pendingByPhone.delete(phone);
    processBatch(entry).catch((err) =>
      logger.error({ err: String(err.message || err), phone }, 'processBatch failed')
    );
  }, ms);
  entry.timer.unref?.();
  logger.info(
    { phone, pending: entry.messages.length, debounceMs: ms },
    'api reply pending batch updated'
  );
}

// Roteamento: Haiku pra msgs simples (≤15 palavras, sem intenção complexa), Sonnet pro resto.
// Só entra em ação se o banco não tiver um modelo explícito configurado.
const COMPLEX_KEYWORDS = /\b(comprar?|contratar?|valor|preco|preço|problema|resolver?|cancelar?|reclamar?|reclamação|urgente|ajuda|preciso|quero|quanto|quando|como|porque|pagar?|boleto|contrato|proposta|reuniao|reunião|entender?|explicar?)\b/i;

function selectModel(pendingMsgs) {
  const configured = getSetting('api_reply_model', null);
  // Se tem modelo explicitamente configurado (diferente do default antigo), usa ele.
  if (configured && configured !== 'claude-opus-4-7') return configured;

  const allText = pendingMsgs.map((m) => m.text).join(' ');
  const wordCount = allText.trim().split(/\s+/).length;
  const hasComplex = COMPLEX_KEYWORDS.test(allText);
  const hasPqvTypes = pendingMsgs.some((m) => m.msgType === 'vcard' || m.msgType === 'multi_vcard');

  if (!hasComplex && !hasPqvTypes && wordCount <= 15) {
    return 'claude-haiku-4-5-20251001';
  }
  return 'claude-sonnet-4-6';
}

// Junta as msgs pending em um único user turn com timestamps e dispara a API.
function buildBatchedUserTurn(pendingMsgs) {
  if (pendingMsgs.length === 1) return pendingMsgs[0].text;
  const lines = pendingMsgs.map((m, i) => {
    const t = m.timestamp ? new Date(m.timestamp).toISOString().slice(11, 19) : '';
    const prefix = t ? `[${t}] ` : '';
    return `${prefix}${m.text}`;
  });
  return lines.join('\n\n');
}

async function processBatch(entry) {
  const { phone, fromJid, queue, firstTimestamp, messages: pendingMsgs } = entry;
  if (!pendingMsgs.length) return;

  const model = selectModel(pendingMsgs);
  const maxTokens = parseInt(getSetting('api_reply_max_tokens', '512'), 10);
  const historyLimit = parseInt(getSetting('api_reply_history_limit', '20'), 10);

  const displayName = displayNameFor(phone);

  // Decisão de modo:
  // - Modo COLETA (programa de indicação) dispara SOMENTE se (a) a campanha está ativa E
  //   (b) alguma mensagem do batch é vcard/multi_vcard (o usuário anexou contatos).
  // - Caso contrário, o default é modo Master Coach (persona do Jefferson respondendo).
  const hasAttachedContact = pendingMsgs.some(
    (m) => m.msgType === 'vcard' || m.msgType === 'multi_vcard'
  );
  const referralMode = isPqvActive() && hasAttachedContact;
  const systemPrompt = referralMode
    ? systemPromptForPqv(phone, displayName, pqvLabel())
    : systemPromptForCoach(phone, displayName);

  // Carrega histórico ANTERIOR à primeira pending (as pending já estão em `messages` pelo handler
  // de inbound; se não filtrar, elas apareceriam duplicadas — uma no histórico e outra no user turn).
  const history = loadConversationForApi(phone, historyLimit, firstTimestamp);
  const batchedText = buildBatchedUserTurn(pendingMsgs);
  const messages = [...history, { role: 'user', content: batchedText }];

  let result;
  try {
    result = await callAnthropic({
      systemPrompt,
      messages,
      model,
      maxTokens,
      tools: referralMode ? PQV_TOOLS : undefined,
    });
  } catch (err) {
    logger.error({ err: String(err.message || err), phone }, 'anthropic call failed');
    stmt.insertReplyLog.run({
      phone, chat_id: fromJid, message_id: null, status: 'error',
      reason: null, model, input_tokens: null, output_tokens: null,
      reply_body: null, error: String(err.message || err).slice(0, 1000),
    });
    return { skipped: true, reason: 'api_error' };
  }

  // Modo coleta: persistir indicações que o modelo registrou via tool_use.
  // source_message_id aponta pra primeira msg do batch (representativa).
  const primaryMessageId = pendingMsgs[0]?.messageId || null;
  let pqvCount = 0;
  if (referralMode && Array.isArray(result.tool_uses) && result.tool_uses.length) {
    pqvCount = persistPqvReferrals({
      toolUses: result.tool_uses,
      phone,
      displayName,
      sourceMessageId: primaryMessageId,
    });
    if (pqvCount) {
      logger.info(
        { phone, count: pqvCount, batchSize: pendingMsgs.length },
        'pqv referrals registered'
      );
    }
  }

  let reply = (result.text || '').trim();
  if (!reply && pqvCount > 0) {
    reply = pqvCount === 1
      ? 'Registrei aqui a indicação. Obrigado, qualquer coisa é só mandar.'
      : `Registrei aqui as ${pqvCount} indicações. Obrigado, qualquer coisa é só mandar.`;
  }
  if (!reply) {
    stmt.insertReplyLog.run({
      phone, chat_id: fromJid, message_id: null, status: 'error',
      reason: 'empty_reply', model: result.model,
      input_tokens: result.usage?.input_tokens ?? null,
      output_tokens: result.usage?.output_tokens ?? null,
      reply_body: null, error: null,
    });
    return { skipped: true, reason: 'empty_reply' };
  }

  // Audio-in → audio-out: if last user msg was a voice note, reply via TTS as PTT
  const lastMsgType = entry.messages.length ? entry.messages[entry.messages.length - 1].msgType : null;
  const respondAsAudio = lastMsgType === 'ptt' || lastMsgType === 'audio';

  try {
    let enq;
    if (respondAsAudio) {
      try {
        const tts = require('../audio/tts');
        const synth = await tts.synthesize(reply);
        enq = await queue.enqueue({
          chat_id: fromJid,
          kind: 'audio',
          payload: {
            base64: synth.base64,
            mimetype: synth.mimetype,
            filename: 'reply.ogg',
            asPtt: true,
          },
          priority: 5,
        });
        logger.info({ phone, chars: reply.length, kind: 'audio' }, 'api reply enqueued as audio');
      } catch (audioErr) {
        // Fallback to text if TTS fails
        logger.warn({ err: String(audioErr), phone }, 'TTS failed, falling back to text');
        enq = await queue.enqueue({
          chat_id: fromJid,
          kind: 'text',
          payload: { body: reply },
          priority: 5,
        });
      }
    } else {
      enq = await queue.enqueue({
        chat_id: fromJid,
        kind: 'text',
        payload: { body: reply },
        priority: 5,
      });
    }
    stmt.insertReplyLog.run({
      phone, chat_id: fromJid, message_id: enq?.id ? String(enq.id) : null,
      status: 'queued', reason: null, model: result.model,
      input_tokens: result.usage?.input_tokens ?? null,
      output_tokens: result.usage?.output_tokens ?? null,
      reply_body: reply.slice(0, 4000), error: null,
    });
    logger.info(
      { phone, model: result.model, chars: reply.length, queued_id: enq?.id, batchSize: pendingMsgs.length },
      'api reply queued'
    );
    return { ok: true, queued_id: enq?.id, chars: reply.length, batchSize: pendingMsgs.length };
  } catch (err) {
    logger.error({ err, phone }, 'failed to enqueue api reply');
    stmt.insertReplyLog.run({
      phone, chat_id: fromJid, message_id: null, status: 'error',
      reason: 'enqueue_failed', model: result.model,
      input_tokens: result.usage?.input_tokens ?? null,
      output_tokens: result.usage?.output_tokens ?? null,
      reply_body: reply.slice(0, 4000), error: String(err.message || err).slice(0, 1000),
    });
    return { skipped: true, reason: 'enqueue_failed' };
  }
}

// Flush síncrono (na verdade fire-and-forget async) de todos os batches pendentes.
// Útil em graceful shutdown pra minimizar perda.
function flushAllPending(reason = 'shutdown') {
  const entries = Array.from(pendingByPhone.values());
  pendingByPhone.clear();
  for (const entry of entries) {
    if (entry.timer) clearTimeout(entry.timer);
    logger.warn({ phone: entry.phone, count: entry.messages.length, reason }, 'flushing pending batch early');
    processBatch(entry).catch((err) =>
      logger.error({ err: String(err.message || err), phone: entry.phone, reason }, 'early flush failed')
    );
  }
  return entries.length;
}

function recentLog(limit = 50) {
  return stmt.listRecentLog.all(Math.min(limit, 500));
}

function statusSnapshot() {
  return {
    panic: isPanicOn(),
    model: getSetting('api_reply_model', 'claude-opus-4-7'),
    max_tokens: parseInt(getSetting('api_reply_max_tokens', '512'), 10),
    history_limit: parseInt(getSetting('api_reply_history_limit', '20'), 10),
    contacts: listContactSettings(),
    pqv_campaign_active: isPqvActive(),
    pqv_campaign_label: pqvLabel(),
    debounce_ms: debounceMs(),
    pending_batches: Array.from(pendingByPhone.values()).map((e) => ({
      phone: e.phone,
      count: e.messages.length,
      first_timestamp: e.firstTimestamp,
    })),
  };
}

function pqvRanking(campaign = 'pqv') {
  return stmt.pqvRanking.all({ campaign });
}

function setPqvActive(on) {
  setSetting('pqv_campaign_active', on ? '1' : '0');
  logger.warn({ pqv_campaign_active: on }, 'pqv campaign toggled');
}

module.exports = {
  handleInbound,
  isPanicOn,
  setPanic,
  getContactEnabled,
  setContactEnabled,
  listContactSettings,
  getSetting,
  setSetting,
  statusSnapshot,
  recentLog,
  isPqvActive,
  setPqvActive,
  pqvLabel,
  pqvRanking,
  flushAllPending,
  debounceMs,
};
