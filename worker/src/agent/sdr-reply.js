'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const logger = require('../logger');
const { config } = require('../config');

const SDRS_DB_PATH = '/opt/jeff-apps/jeff-sdrs/data/sdrs.db';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_BETA_CACHING = 'prompt-caching-2024-07-31';
const REQUEST_TIMEOUT_MS = 45_000;
const DEBOUNCE_MS = 8_000;
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const HISTORY_LIMIT = 30;

const SUPPORT_PHONE = process.env.SDR_SUPPORT_PHONE || '5511910075450';
const NOTIFY_TAG_RE = /\[NOTIFICAR_SUPORTE:\s*([\s\S]*?)\]/i;
const NOTIFY_COOLDOWN_MS = 30 * 60 * 1000;
const lastNotifiedAt = new Map();

let sdrsDb = null;
function getSdrsDb() {
  if (sdrsDb) return sdrsDb;
  if (!fs.existsSync(SDRS_DB_PATH)) return null;
  try {
    sdrsDb = new Database(SDRS_DB_PATH, { readonly: false, fileMustExist: true });
    sdrsDb.pragma('journal_mode = WAL');
    return sdrsDb;
  } catch (err) {
    logger.warn({ err: String(err.message || err) }, 'sdrs.db open failed');
    return null;
  }
}

function resolveSlot(phone, chatId) {
  const db = getSdrsDb();
  if (!db) return null;
  const row = db.prepare(
    `SELECT slot FROM contact_slot_binding WHERE phone = ? ORDER BY created_at DESC LIMIT 1`
  ).get(phone);
  if (!row) return null;
  const sdr = db.prepare(
    `SELECT slot, name, role_label, phone, ai_active, zeus_mode, master_slot,
            sdr_mode, personality_level, reference_url,
            welcome_message, instructions, conversation_instructions
     FROM sdrs WHERE slot = ?`
  ).get(row.slot);
  return sdr || null;
}

function buildSystemPrompt(sdr, leadName) {
  const parts = [];
  const persona = sdr.name || 'SDR';
  const role = sdr.role_label || 'SDR de pré-atendimento';
  parts.push(`Você é ${persona} (${role}).`);
  parts.push(`Você atende leads via WhatsApp em nome do time. Suas respostas são curtas, humanas e diretas ao ponto — nada de blocos longos, nada de emojis em excesso, nada de assinar mensagem.`);
  parts.push(`Modo de atuação: ${sdr.sdr_mode === 'ativo' ? 'SDR ativo (você iniciou a conversa e conduz o lead pelo funil)' : 'SDR receptivo (o lead te procurou)'}.`);
  const p = Number.isFinite(sdr.personality_level) ? sdr.personality_level : 5;
  parts.push(`Nível de personalidade: ${p}/10 (0=formal e técnico, 10=extremamente caloroso e informal). Calibre o tom.`);
  if (leadName) parts.push(`Nome do lead com quem você está falando: ${leadName}. Use o primeiro nome com naturalidade, sem exagerar.`);
  if (sdr.reference_url) parts.push(`Link/página de referência do produto: ${sdr.reference_url}. Só mande esse link quando o lead pedir mais informação, quiser se inscrever, ou o momento da conversa exigir.`);
  parts.push('');
  parts.push('=== INSTRUÇÕES DE CONVERSA (o cérebro do agente, definido no painel do SDR) ===');
  parts.push(sdr.instructions || '(nenhuma instrução configurada — improvise educadamente e pergunte o que a pessoa precisa)');
  if (sdr.conversation_instructions && String(sdr.conversation_instructions).trim()) {
    parts.push('');
    parts.push('=== DIRETRIZES EXTRAS DE COMPORTAMENTO ===');
    parts.push(sdr.conversation_instructions);
  }
  parts.push('');
  parts.push('=== REGRAS FIXAS ===');
  parts.push('- Uma mensagem por turno, curta (2 a 5 linhas no máximo, salvo quando o lead pedir explicação detalhada).');
  parts.push('- Nunca invente informação que não esteja no briefing acima. Se não souber, ofereça verificar e voltar.');
  parts.push('- Nunca revele que é IA. Você é o SDR humano do time.');
  parts.push('- Não use travessão (— ou –). Pontuação normal em português.');
  parts.push('- Se o lead pedir para não receber mais mensagens ou for hostil, responda educado se despedindo e pare.');
  parts.push('');
  parts.push('=== ESCOPO DA SUA ATUAÇÃO ===');
  parts.push('Você conversa APENAS sobre o produto/evento/oferta descrito no briefing acima. Você NÃO tem informações sobre:');
  parts.push('- suporte a alunos de outros cursos/turmas em andamento');
  parts.push('- status de pagamento, boleto, fatura, cobrança, reembolso');
  parts.push('- setor administrativo, secretaria, departamento financeiro, RH');
  parts.push('- falar diretamente com pessoas específicas do time (ex: Farias, Secretaria, Financeiro, gestor)');
  parts.push('Se o lead pedir qualquer coisa DESSES temas ou pedir pra falar com alguém do time: primeiro pergunte de forma acolhedora QUAL é exatamente o assunto (para o time humano já receber contexto), aguarde a resposta dele, e SÓ ENTÃO na sua próxima mensagem escale via marcador NOTIFICAR_SUPORTE com o assunto detalhado. Não invente resposta, não passe link, não prometa prazo.');
  parts.push('');
  parts.push('=== ESCALONAMENTO PARA O SUPORTE HUMANO ===');
  parts.push('Escale (via marcador NOTIFICAR_SUPORTE) quando o lead:');
  parts.push('- pedir suporte de curso, turma, pagamento, boleto, financeiro, reembolso, secretaria, RH, admin');
  parts.push('- pedir pra falar com pessoa específica do time (Farias, Secretaria, Financeiro, gestor)');
  parts.push('- sinalizar algo fora do escopo da negociação (exceção de qualificação, não bate com perfil mínimo, desconto/condição especial, situação pessoal delicada, reclamação, insistência forte por algo que você não pode conceder, dúvida técnica que exige o time)');
  parts.push('Como fazer: responda de forma acolhedora ao lead dizendo que vai conversar com o time e retorna em breve (NÃO prometa prazo, NÃO envie link de pagamento, NÃO feche negociação). E ao final da sua resposta, inclua em uma linha separada o marcador exato:');
  parts.push('[NOTIFICAR_SUPORTE: <resumo curto do caso em 1 a 2 frases, deixando claro o que o lead pediu e por que precisa de atenção>]');
  parts.push('Esse marcador é REMOVIDO antes de enviar sua mensagem ao lead — o lead não vê. Ele apenas dispara um alerta interno pro time humano assumir o caso.');
  parts.push('Use o marcador só quando realmente for necessário escalar. Não use pra dúvida trivial que você já sabe responder pelo briefing.');
  return parts.join('\n');
}

function loadHistory(phone, limit, beforeIso) {
  const workerDb = require('../db').db;
  const stmt = beforeIso
    ? workerDb.prepare(
        `SELECT from_me, body, transcription, timestamp
         FROM messages
         WHERE contact_phone = ? AND direction IN ('in','out') AND timestamp < ?
         ORDER BY timestamp DESC LIMIT ?`
      )
    : workerDb.prepare(
        `SELECT from_me, body, transcription, timestamp
         FROM messages
         WHERE contact_phone = ? AND direction IN ('in','out')
         ORDER BY timestamp DESC LIMIT ?`
      );
  const rows = beforeIso ? stmt.all(phone, beforeIso, limit) : stmt.all(phone, limit);
  return rows
    .slice()
    .reverse()
    .map((r) => {
      const text = (r.body && r.body.trim()) || (r.transcription && r.transcription.trim()) || '';
      if (!text) return null;
      return { role: r.from_me ? 'assistant' : 'user', content: text };
    })
    .filter(Boolean);
}

async function callAnthropic({ systemPrompt, messages, model, maxTokens }) {
  if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.anthropicApiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-beta': ANTHROPIC_BETA_CACHING,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages,
      }),
      signal: controller.signal,
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`anthropic http ${resp.status}: ${text.slice(0, 300)}`);
    const json = JSON.parse(text);
    const blocks = Array.isArray(json.content) ? json.content : [];
    const out = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return { text: out, model: json.model || model, usage: json.usage || {} };
  } finally {
    clearTimeout(timer);
  }
}

function displayNameFromSdrs(sdr, phone) {
  const db = getSdrsDb();
  if (!db) return null;
  const row = db.prepare(
    `SELECT target_name FROM slot_upload_job WHERE target_phone = ? AND slot = ? AND target_name IS NOT NULL ORDER BY id DESC LIMIT 1`
  ).get(phone, sdr.slot);
  if (row && row.target_name) return row.target_name;
  const conv = db.prepare(
    `SELECT contact_name FROM conversations WHERE slot = ? AND contact_phone = ? AND contact_name IS NOT NULL LIMIT 1`
  ).get(sdr.slot, phone);
  return (conv && conv.contact_name) || null;
}

function saveOutboundToSdrs(sdr, chatId, phone, body) {
  const db = getSdrsDb();
  if (!db) return;
  try {
    const ts = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO messages (slot, chat_id, wa_message_id, from_me, body, ts, type)
       VALUES (?, ?, ?, 1, ?, ?, 'chat')`
    ).run(sdr.slot, chatId, `zeus-sdr-${ts}-${Math.random().toString(36).slice(2, 8)}`, body, ts);
    const exists = db.prepare('SELECT id FROM conversations WHERE slot=? AND chat_id=?').get(sdr.slot, chatId);
    if (exists) {
      db.prepare(
        `UPDATE conversations SET last_message=?, last_from_me=1, last_ts=?, updated_at=? WHERE id=?`
      ).run(body, ts, new Date().toISOString(), exists.id);
    } else {
      db.prepare(
        `INSERT INTO conversations (slot, chat_id, contact_phone, last_message, last_from_me, last_ts, unread, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, 0, ?)`
      ).run(sdr.slot, chatId, phone, body, ts, new Date().toISOString());
    }
  } catch (err) {
    logger.warn({ err: String(err.message || err) }, 'sdr: saveOutboundToSdrs failed');
  }
}

const pending = new Map();

function schedule({ phone, fromJid, text, queue, messageId, sdr }) {
  const now = new Date().toISOString();
  let entry = pending.get(phone);
  if (!entry) {
    entry = { phone, fromJid, queue, sdr, firstTimestamp: now, messages: [], timer: null };
    pending.set(phone, entry);
  } else {
    entry.fromJid = fromJid;
    entry.queue = queue;
    entry.sdr = sdr;
  }
  entry.messages.push({ text, timestamp: now, messageId });
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    pending.delete(phone);
    processBatch(entry).catch((err) =>
      logger.error({ err: String(err.message || err), phone }, 'sdr processBatch failed')
    );
  }, DEBOUNCE_MS);
  entry.timer.unref?.();
}

async function processBatch(entry) {
  const { phone, fromJid, queue, sdr, firstTimestamp, messages: pendingMsgs } = entry;
  if (!pendingMsgs.length) return;
  const leadName = displayNameFromSdrs(sdr, phone);
  const systemPrompt = buildSystemPrompt(sdr, leadName);
  const history = loadHistory(phone, HISTORY_LIMIT, firstTimestamp);
  const userTurn = pendingMsgs.length === 1
    ? pendingMsgs[0].text
    : pendingMsgs.map((m) => m.text).join('\n\n');
  const messages = [...history, { role: 'user', content: userTurn }];
  let result;
  try {
    result = await callAnthropic({
      systemPrompt,
      messages,
      model: DEFAULT_MODEL,
      maxTokens: 800,
    });
  } catch (err) {
    logger.error({ err: String(err.message || err), phone, slot: sdr.slot }, 'sdr anthropic call failed');
    return;
  }
  const rawReply = (result.text || '').replace(/[—–]/g, ',').trim();
  const notifyMatch = rawReply.match(NOTIFY_TAG_RE);
  const notifySummary = notifyMatch ? notifyMatch[1].trim() : null;
  const reply = rawReply.replace(NOTIFY_TAG_RE, '').trim();
  if (!reply) {
    logger.warn({ phone, slot: sdr.slot }, 'sdr empty reply');
    return;
  }
  try {
    const enq = await queue.enqueue({
      chat_id: fromJid,
      kind: 'text',
      payload: { body: reply },
      priority: 5,
    });
    saveOutboundToSdrs(sdr, fromJid, phone, reply);
    logger.info(
      { phone, slot: sdr.slot, chars: reply.length, queued_id: enq?.id, batchSize: pendingMsgs.length },
      'sdr reply queued'
    );
    if (notifySummary) await notifySupport({ phone, sdr, leadName, summary: notifySummary, queue });
  } catch (err) {
    logger.error({ err: String(err.message || err), phone, slot: sdr.slot }, 'sdr enqueue failed');
  }
}

async function notifySupport({ phone, sdr, leadName, summary, queue }) {
  const now = Date.now();
  const last = lastNotifiedAt.get(phone) || 0;
  if (now - last < NOTIFY_COOLDOWN_MS) {
    logger.info({ phone, slot: sdr.slot }, 'sdr notify skipped (cooldown)');
    return;
  }
  lastNotifiedAt.set(phone, now);
  const persona = sdr.name || `slot ${sdr.slot}`;
  const nameLine = leadName ? `Lead: ${leadName} (${phone})` : `Lead: ${phone}`;
  const body = [
    `atencao chefe — o SDR *${persona}* pediu suporte humano nesse caso.`,
    '',
    nameLine,
    `Resumo: ${summary}`,
    '',
    'Conversa completa no painel: https://sdrs.jefersonhenrike.com',
  ].join('\n');
  try {
    await queue.enqueue({
      chat_id: `${SUPPORT_PHONE}@c.us`,
      kind: 'text',
      payload: { body },
      priority: 3,
    });
    logger.info({ phone, slot: sdr.slot, support: SUPPORT_PHONE }, 'sdr support notified');
  } catch (err) {
    logger.error({ err: String(err.message || err), phone, slot: sdr.slot }, 'sdr support notify failed');
  }
}

// Retorna true se essa msg foi absorvida pelo pipeline SDR (não deve seguir pra Fase 2).
function tryHandle({ phone, fromJid, text, queue, messageId }) {
  if (!phone || !text || !text.trim()) return false;
  const sdr = resolveSlot(phone, fromJid);
  if (!sdr) return false;
  if (!sdr.ai_active) return false;
  schedule({ phone, fromJid, text, queue, messageId, sdr });
  return true;
}

module.exports = { tryHandle, resolveSlot, buildSystemPrompt };
