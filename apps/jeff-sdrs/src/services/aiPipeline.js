'use strict';
// Pipeline receptivo com IA. Chamado pelo debouncer.
// processConversation(slot, chatId, messages) — decide se responde, monta prompt, chama LLM, envia.

const { db } = require('../db');
const { decrypt } = require('./crypto');
const { generateReply } = require('./llmClient');
const promptBuilder = require('./systemPromptBuilder');

const HISTORY_LIMIT = 30;
const CIRCUIT_FAIL_THRESHOLD = 5;
const CIRCUIT_PAUSE_MS = 10 * 60 * 1000;
const NON_TEXT_HINT = 'Consigo te ajudar por texto por aqui, pode escrever?';

// contador de falhas consecutivas por (provider, slot)
const failStreak = new Map(); // key `${slot}:${provider}` -> n

function streakKey(slot, provider) { return `${slot}:${provider}`; }

// Marca se ja mandamos o aviso de "por texto" naquela conversa hoje (evita spam)
const nonTextNoticed = new Map(); // key `${slot}:${chatId}` -> ts

function todayBrt() {
  // BRT UTC-3
  const d = new Date(Date.now() - 3 * 3600_000);
  return d.toISOString().slice(0, 10);
}

function countTodayInteractions(slot) {
  // Conta interacoes ok DE HOJE (BRT) desse slot
  const today = todayBrt();
  const r = db.prepare(`
    SELECT COUNT(*) as n FROM ai_interactions
    WHERE slot = ? AND status = 'ok'
      AND datetime(created_at, '-3 hours') >= datetime(?, 'start of day')
      AND datetime(created_at, '-3 hours') <  datetime(?, 'start of day', '+1 day')
  `).get(slot, today, today);
  return r ? r.n : 0;
}

function loadHistory(slot, chatId) {
  const rows = db.prepare(`
    SELECT from_me, body, ts, type FROM messages
    WHERE slot = ? AND chat_id = ?
    ORDER BY ts DESC, id DESC
    LIMIT ?
  `).all(slot, chatId, HISTORY_LIMIT);
  const history = rows.reverse().map(r => ({
    role: r.from_me ? 'assistant' : 'user',
    content: r.body && r.body.trim() ? r.body : (r.type && r.type !== 'chat' ? `[${r.type}]` : ''),
  })).filter(m => m.content);
  // Anthropic/OpenAI exigem que a ultima msg do array seja role=user (senao HTTP 400).
  // Se o historico termina em assistant (ex: SDR ja mandou msg proativa e cliente nao respondeu ainda),
  // dropa da cauda ate sobrar user. Se ficar vazio, retorna vazio (pipeline vai skipar).
  while (history.length && history[history.length - 1].role === 'assistant') history.pop();
  return history;
}

function anyMessageIsNonText(msgs) {
  for (const m of msgs) {
    if (m && (m.hasMedia || (m.type && m.type !== 'chat'))) return true;
  }
  return false;
}

function anyMessageHasText(msgs) {
  for (const m of msgs) {
    const t = m && m.body && String(m.body).trim();
    if (t) return true;
  }
  return false;
}

async function processConversation(slot, chatId, messages, deps) {
  // deps.sendMessage(chatId, text): Promise<void>
  // deps.getSdr(slot): row
  // deps.getKey(keyId): row {provider, model, key_cipher}
  const send = deps.sendMessage;
  const getSdr = deps.getSdr || ((s) => db.prepare(`SELECT slot, name, role_label, ai_active, sdr_mode, ai_provider, ai_model, ai_key_id,
      ai_daily_limit, ai_paused_until, personality_level, reference_url, instructions, conversation_instructions,
      send_link_enabled, send_link_url, send_link_trigger,
      send_file_enabled, send_file_path, send_file_trigger,
      send_image_enabled, send_image_path, send_image_trigger
      FROM sdrs WHERE slot = ?`).get(s));

  const sdr = getSdr(slot);
  if (!sdr) return { skipped: 'sdr_not_found' };
  if (!sdr.ai_active) return { skipped: 'ai_inactive' };
  if (!sdr.ai_key_id) return { skipped: 'no_key_configured' }; // deixa fluxo Zeus externo

  // Modo ativo: so responde a leads que ja receberam disparo (evita queimar token
  // com numero aleatorio que chegou fora do funil de disparo).
  // Fix Smith 2026-07-21 (gate LID): o WhatsApp entrega o incoming com chatId no formato
  // <lid>@lid, mas slot_upload_job.target_phone guarda o telefone real (ex 5512996361910).
  // A comparacao direta nunca batia, e o gate matava toda continuacao de conversa apos disparo.
  // Fonte da verdade agora eh contact_slot_binding: quando o dispatcher envia, ele grava
  // (phone=<real>, chat_id=<lid>@lid, slot=<X>, matched_keyword='__upload__'). Consultamos
  // por (slot, chat_id) com matched='__upload__' pra confirmar que este chat foi disparado.
  // Backward-compat: se nao achar no binding, cai no criterio antigo (target_phone) pra nao
  // regredir cenarios em que o LID ainda nao foi conhecido no ato do disparo.
  if (sdr.sdr_mode === 'ativo') {
    const chatPhone = String(chatId || '').split('@')[0];
    const boundToDispatch = db.prepare(
      `SELECT 1 FROM contact_slot_binding WHERE slot = ? AND chat_id = ? AND matched_keyword = '__upload__' LIMIT 1`
    ).get(slot, chatId);
    let wasDispatched = !!boundToDispatch;
    if (!wasDispatched) {
      // fallback historico: numero real (nao-LID) que bate direto com target_phone
      const legacy = db.prepare(
        `SELECT 1 FROM slot_upload_job WHERE slot = ? AND target_phone = ? AND status = 'sent' LIMIT 1`
      ).get(slot, chatPhone);
      wasDispatched = !!legacy;
    }
    if (!wasDispatched) return { skipped: 'ativo_sem_dispatch_previo' };
  }
  if (sdr.ai_paused_until && new Date(sdr.ai_paused_until).getTime() > Date.now()) {
    return { skipped: 'paused', until: sdr.ai_paused_until };
  }

  // Sem trava de daily_limit na resposta ao cliente (Jeff 2026-07-21).
  // Regra: cliente que iniciou a conversa TEM que ser respondido ate a conversa
  // ser encerrada. Rate limit e protecao do chip vive no dispatcher de disparo
  // (dispatch_pause_every, dispatch_min_delay, dispatch_pause_seconds) — la sim
  // faz sentido porque somos NOS abordando frios; aqui e follow-up de lead ativo.

  // se todas as msgs sao midia/audio/sticker -> silencia (Jeff 2026-07-21:
  // SDR nao pode mandar saudacao generica; deixa o atendente humano ouvir/responder)
  if (anyMessageIsNonText(messages) && !anyMessageHasText(messages)) {
    return { skipped: 'non_text_only' };
  }

  // Carrega chave
  const keyRow = db.prepare('SELECT id, provider, key_cipher FROM api_keys WHERE id = ?').get(sdr.ai_key_id);
  if (!keyRow) return { skipped: 'key_missing' };
  let apiKey;
  try {
    apiKey = decrypt(keyRow.key_cipher);
  } catch (e) {
    console.error('[aiPipeline] decrypt fail:', e.message);
    return { skipped: 'decrypt_fail' };
  }

  const provider = sdr.ai_provider || keyRow.provider;
  const model = sdr.ai_model || defaultModelFor(provider);

  // Monta system prompt
  const systemPrompt = promptBuilder.build({
    instructions: sdr.instructions,
    conversation_instructions: sdr.conversation_instructions,
    personality_level: sdr.personality_level,
    reference_url: sdr.reference_url,
    name: sdr.name,
    role_label: sdr.role_label,
    send_link_enabled: sdr.send_link_enabled,
    send_link_url: sdr.send_link_url,
    send_link_trigger: sdr.send_link_trigger,
    send_file_enabled: sdr.send_file_enabled,
    send_file_path: sdr.send_file_path,
    send_file_trigger: sdr.send_file_trigger,
    send_image_enabled: sdr.send_image_enabled,
    send_image_path: sdr.send_image_path,
    send_image_trigger: sdr.send_image_trigger,
  });

  // Historico (ja inclui as msgs novas que foram gravadas por saveMessage)
  const history = loadHistory(slot, chatId);
  if (!history.length) return { skipped: 'empty_history' };

  // Chama LLM
  let reply;
  try {
    reply = await generateReply({
      provider, model, apiKey,
      systemPrompt,
      messages: history,
      maxTokens: 800,
      temperature: 0.3,
      slot, chatId, keyId: keyRow.id,
    });
    failStreak.set(streakKey(slot, provider), 0);
  } catch (e) {
    console.error(`[aiPipeline] LLM err slot=${slot}:`, e.message);
    // circuit breaker
    const k = streakKey(slot, provider);
    const n = (failStreak.get(k) || 0) + 1;
    failStreak.set(k, n);
    if (n >= CIRCUIT_FAIL_THRESHOLD) {
      const until = new Date(Date.now() + CIRCUIT_PAUSE_MS).toISOString();
      db.prepare('UPDATE sdrs SET ai_paused_until = ? WHERE slot = ?').run(until, slot);
      console.warn(`[aiPipeline] circuit breaker slot=${slot} provider=${provider} pausado ate ${until}`);
      failStreak.set(k, 0);
    }
    return { error: e.message, failStreak: n };
  }

  const text = (reply.text || '').trim();
  if (!text) return { skipped: 'empty_reply' };

  try {
    await send(chatId, text);
  } catch (e) {
    const msg = String(e && e.message || '');
    // Erros fatais do puppeteer/whatsapp-web.js: Chrome quebrou/perdeu contexto.
    // Sinaliza pro caller (waManager) forcar reconnect. O auto-replay-scheduler
    // reprocessa esse chat na proxima varredura (nao perdemos a msg).
    const fatal = /detached Frame|Execution context was destroyed|Session closed|Target closed|Protocol error/i.test(msg);
    console.error(`[aiPipeline] send fail slot=${slot} chat=${chatId}${fatal ? ' [FATAL]' : ''}:`, msg);
    return { error: 'send_fail:' + msg, fatal };
  }

  return { ok: true, tokensIn: reply.tokensIn, tokensOut: reply.tokensOut, latencyMs: reply.latencyMs, model, provider };
}

function defaultModelFor(provider) {
  const p = String(provider || '').toLowerCase();
  if (p === 'anthropic') return 'claude-sonnet-4-6';
  if (p === 'openai') return 'gpt-4o-mini';
  if (p === 'gemini') return 'gemini-2.0-flash-exp';
  return 'claude-sonnet-4-6';
}

module.exports = { processConversation, NON_TEXT_HINT };
