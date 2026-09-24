'use strict';
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const QRCode = require('qrcode');
const { db, TOTAL_SLOTS } = require('../db');
const crmSync = require('./crmSync');
const debouncer = require('./inboundDebouncer');
const aiPipeline = require('./aiPipeline');

const SESSIONS_DIR = path.join(__dirname, '..', '..', 'sessions');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Splitter humanizado (Fix Smith 2026-07-21):
// - Se o LLM colocou tag [[BREAK]], quebra ali.
// - Senao: se o texto tem paragrafos (\n\n), cada paragrafo vira 1 bloco.
// - Senao: se o texto eh curto (<= 260 chars), envia inteiro em 1 bloco.
// - Senao: quebra por frases (. ! ?) agrupando ate ~240 chars por bloco.
// Retorna array de strings (>=1 elemento). Cada elemento eh trim() e nao-vazio.
function splitIntoChunks(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  // 1) tag explicita do LLM
  if (raw.includes('[[BREAK]]')) {
    return raw.split(/\[\[BREAK\]\]/g).map(s => s.trim()).filter(Boolean);
  }
  const SHORT_LIMIT = 260;
  const CHUNK_TARGET = 240;
  const CHUNK_MAX = 380;
  // 2) paragrafos
  if (/\n\n/.test(raw)) {
    const paras = raw.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
    // se algum paragrafo passar do MAX, quebra ele em frases
    const out = [];
    for (const p of paras) {
      if (p.length <= CHUNK_MAX) { out.push(p); continue; }
      out.push(...splitBySentence(p, CHUNK_TARGET, CHUNK_MAX));
    }
    return out.length ? out : [raw];
  }
  // 3) curto: 1 bloco so
  if (raw.length <= SHORT_LIMIT) return [raw];
  // 4) longo sem paragrafo: por frase
  return splitBySentence(raw, CHUNK_TARGET, CHUNK_MAX);
}

function splitBySentence(text, target, hardMax) {
  // Divide por . ! ? mantendo o pontuador. Agrupa frases ate ~target chars.
  const sentences = String(text).match(/[^.!?\n]+[.!?]+["')\]]*|\S[^.!?\n]*$/g) || [text];
  const chunks = [];
  let cur = '';
  for (const s of sentences) {
    const piece = s.trim();
    if (!piece) continue;
    if (!cur) { cur = piece; continue; }
    if ((cur.length + 1 + piece.length) <= target) {
      cur += ' ' + piece;
    } else if (piece.length > hardMax && !cur) {
      // frase gigante isolada: manda mesmo que passe do target
      chunks.push(piece);
      cur = '';
    } else {
      chunks.push(cur);
      cur = piece;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

function slotSessionDir(slot) {
  return path.join(SESSIONS_DIR, `session-slot-${slot}`);
}

async function killChromeForSlot(slot) {
  const dir = slotSessionDir(slot);
  try {
    execSync(`pkill -f "user-data-dir=${dir}"`, { stdio: 'ignore' });
  } catch {}
  await sleep(600);
  for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    try { fs.unlinkSync(path.join(dir, f)); } catch {}
  }
}

const clients = new Map();
const runtimeStatus = new Map();

// Mapeia chatId -> hostSlot pra o pipeline conseguir enviar via cliente correto.
const chatHostSlot = new Map();

// -----------------------------------------------------------------------------
// Dedupe de saida (Fix Smith 2026-07-21):
// Bloqueia envio da MESMA resposta pro MESMO chat em janela curta (5 min).
// Cobre: pipeline chamado 2x por handler duplicado, script manual + pipeline
// natural rodando junto, retry acidental. Vale pra qualquer origem que passe
// por sendHumanized() ou sendText() publico.
//
// Hash: SHA1(lowercase + normalizado) dos primeiros 200 chars do texto FINAL
// (ja sem tags de midia, ja sem [[BREAK]]). Cache em memoria por
// chatId+hash com TTL de 5 min.
// -----------------------------------------------------------------------------
const crypto = require('crypto');
const DEDUPE_TTL_MS = 5 * 60 * 1000; // 5 min
const recentSends = new Map(); // key: `${chatId}:${hash}` -> expiresAt

function normalizeForHash(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\[\[[^\]]+\]\]/g, '') // remove tags [[BREAK]] [[SEND_*]]
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function replyHash(text) {
  return crypto.createHash('sha1').update(normalizeForHash(text)).digest('hex');
}

function isDuplicateSend(chatId, text) {
  const now = Date.now();
  // GC oportunista
  if (recentSends.size > 500) {
    for (const [k, exp] of recentSends) if (exp <= now) recentSends.delete(k);
  }
  const key = `${chatId}:${replyHash(text)}`;
  const exp = recentSends.get(key);
  if (exp && exp > now) return true;
  return false;
}

function markSent(chatId, text) {
  recentSends.set(`${chatId}:${replyHash(text)}`, Date.now() + DEDUPE_TTL_MS);
}

// Registra processor do debouncer 1x
let _processorRegistered = false;
function ensureAIProcessorRegistered() {
  if (_processorRegistered) return;
  _processorRegistered = true;
  debouncer.setProcessor(async (slot, chatId, msgs) => {
    const hostSlot = chatHostSlot.get(chatId) || resolveHostSlotFor(slot);
    const client = clients.get(hostSlot);
    if (!client || runtimeStatus.get(hostSlot) !== 'ready') {
      console.warn(`[ai] host slot ${hostSlot} nao pronto, drop`);
      return;
    }
    // Lock por chat — impede que 2 caminhos (natural + replay/scheduler) rodem
    // pipeline em paralelo pro mesmo chat e gerem resposta duplicada.
    if (!tryLockChat(slot, chatId)) {
      console.warn(`[ai] slot=${slot} chat=${chatId} ja em processamento, skip`);
      return;
    }
    try {
    const send = async (cid, text) => {
      // Detecta tags de midia no texto do LLM: [[SEND_LINK]], [[SEND_FILE]], [[SEND_IMAGE]].
      // Remove tags do texto principal, envia o texto limpo e depois dispara o anexo.
      const tags = {
        link: /\[\[SEND_LINK\]\]/i.test(text),
        file: /\[\[SEND_FILE\]\]/i.test(text),
        image: /\[\[SEND_IMAGE\]\]/i.test(text),
      };
      // Fix Smith 2026-07-21 (mensagens humanizadas em pedacos):
      // O antigo replace(/\s{2,}/g, ' ') colapsava paragrafos em uma unica linha (destruia
      // as quebras naturais que o LLM colocou). Agora: preservamos \n\n, normalizamos so
      // espacos em branco na horizontal, e usamos as quebras (ou a tag [[BREAK]]) pra dividir
      // a resposta em blocos e enviar cada bloco como uma mensagem separada, com pausa curta
      // entre elas (simula digitacao humana).
      let cleanText = text
        .replace(/\[\[SEND_LINK\]\]/gi, '')
        .replace(/\[\[SEND_FILE\]\]/gi, '')
        .replace(/\[\[SEND_IMAGE\]\]/gi, '')
        // colapsa apenas espacos/tabs horizontais, PRESERVA \n
        .replace(/[ \t]{2,}/g, ' ')
        // limpa espacos no final de cada linha
        .replace(/[ \t]+\n/g, '\n')
        // no maximo 2 quebras seguidas (parágrafo)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      // Carrega config de midia do slot (o slot logico esta em outer scope: `slot`)
      const media = db.prepare(`SELECT send_link_enabled, send_link_url,
                                       send_file_enabled, send_file_path,
                                       send_image_enabled, send_image_path
                                FROM sdrs WHERE slot = ?`).get(slot) || {};
      // Se ativou link e o LLM pediu, concatena link no MESMO bloco final (evita bloco extra)
      if (tags.link && media.send_link_enabled && media.send_link_url) {
        cleanText = (cleanText ? cleanText + '\n' : '') + String(media.send_link_url).trim();
      }
      if (cleanText) {
        // Fix Smith 2026-07-21 (dedupe janela 5 min):
        // Antes de gastar chunks/typing, checa se essa mesma resposta ja saiu pro chat
        // nos ultimos 5 min. Se sim, bloqueia. Caso Renata (2x seguidas por handler
        // duplicado + script manual) nao volta a acontecer.
        if (isDuplicateSend(cid, cleanText)) {
          console.warn(`[send] duplicate detected, skipping chat=${cid} hash=${replyHash(cleanText).slice(0,10)}`);
        } else {
          markSent(cid, cleanText);
          // Divide em blocos naturais e envia cada um com pausa entre. Se o texto todo eh
          // curto, envia direto sem quebrar.
          const chunks = splitIntoChunks(cleanText);
          try { const chat = await client.getChatById(cid); if (chat && chat.sendStateTyping) await chat.sendStateTyping(); } catch {}
          for (let i = 0; i < chunks.length; i++) {
            const piece = chunks[i];
            if (i > 0) {
              // pausa entre blocos: proporcional ao tamanho do bloco anterior, min 1.2s, max 4s
              const prev = chunks[i - 1] || '';
              const typingMs = Math.min(4000, Math.max(1200, prev.length * 30));
              try { const chat = await client.getChatById(cid); if (chat && chat.sendStateTyping) await chat.sendStateTyping(); } catch {}
              await sleep(typingMs);
            }
            await client.sendMessage(cid, piece);
          }
        }
      }
      // Imagem: envia como MessageMedia
      if (tags.image && media.send_image_enabled && media.send_image_path) {
        try {
          if (fs.existsSync(media.send_image_path)) {
            const m = MessageMedia.fromFilePath(media.send_image_path);
            await client.sendMessage(cid, m);
          } else {
            console.warn(`[wa] send_image_path nao existe: ${media.send_image_path}`);
          }
        } catch (e) { console.error('[wa] send image fail:', e.message); }
      }
      // Arquivo: heuristica por mimetype detectado do arquivo salvo.
      // - image/*: envia como midia visual normal (nao document)
      // - video/*: envia como midia visual normal (nao document) — WhatsApp reproduz inline
      // - audio/*: envia como audio; se for opus/ogg vai como voice, resto vai como audio anexo
      // - resto (PDF, doc, etc): sendMediaAsDocument:true (senao WhatsApp tenta renderizar quebrado)
      if (tags.file && media.send_file_enabled && media.send_file_path) {
        try {
          if (fs.existsSync(media.send_file_path)) {
            const m = MessageMedia.fromFilePath(media.send_file_path);
            const mt = String(m.mimetype || '').toLowerCase();
            const opts = {};
            if (/^image\//.test(mt)) {
              // imagem: manda como midia visual
            } else if (/^video\//.test(mt)) {
              // video: manda como midia (WhatsApp aceita mp4/quicktime como reproduzivel)
            } else if (/^audio\//.test(mt)) {
              // audio: se for ogg/opus, WhatsApp trata como PTT nativo com sendAudioAsVoice
              if (/ogg|opus|amr/.test(mt)) opts.sendAudioAsVoice = true;
            } else {
              // PDF/doc/planilha/etc: envia como documento
              opts.sendMediaAsDocument = true;
            }
            await client.sendMessage(cid, m, opts);
          } else {
            console.warn(`[wa] send_file_path nao existe: ${media.send_file_path}`);
          }
        } catch (e) { console.error('[wa] send file fail:', e.message); }
      }
    };
    const result = await aiPipeline.processConversation(slot, chatId, msgs, { sendMessage: send });
    if (result && result.skipped) {
      console.log(`[ai] slot=${slot} chat=${chatId} skipped:`, result.skipped);
    } else if (result && result.ok) {
      console.log(`[ai] slot=${slot} chat=${chatId} ok tokens=${result.tokensIn}/${result.tokensOut} lat=${result.latencyMs}ms`);
    } else if (result && result.error) {
      console.error(`[ai] slot=${slot} chat=${chatId} error:`, result.error);
      // Chrome do host morreu (frame detached, execution context destroyed etc):
      // dispara reconnect em background pra que a proxima passagem do auto-replay
      // encontre o slot pronto novamente. Sem isso ficariamos travados ate o
      // proximo restart manual.
      if (result.fatal && hostSlot) {
        console.warn(`[ai] fatal Chrome error host=${hostSlot}, disparando reconnect`);
        reconnectSlot(hostSlot).catch(e => console.error(`[ai] reconnect fail:`, e && e.message));
      }
    }
    } finally {
      unlockChat(slot, chatId);
    }
  });
}

function maybeEnqueueForAI(hostSlot, slot, chatId, msg) {
  ensureAIProcessorRegistered();
  // SDR nunca responde grupos — apenas DMs individuais.
  if (String(chatId).endsWith('@g.us') || String(chatId).endsWith('@broadcast')) return;
  const sdr = db.prepare(`SELECT ai_active, sdr_mode, ai_key_id FROM sdrs WHERE slot = ?`).get(slot);
  if (!sdr) return;
  if (!sdr.ai_active) return;
  if (!sdr.ai_key_id) return;
  chatHostSlot.set(chatId, hostSlot);
  debouncer.onMessage(slot, chatId, msg);
}

function setSlotStatus(slot, status, extra = {}) {
  const now = new Date().toISOString();
  const fields = ['status = ?', 'updated_at = ?'];
  const values = [status, now];
  if (extra.qr !== undefined) { fields.push('last_qr = ?', 'last_qr_at = ?'); values.push(extra.qr, now); }
  if (status === 'ready') {
    fields.push('ready_at = ?', 'pairing_code = ?', 'pairing_code_at = ?', 'last_qr = ?', 'last_qr_at = ?');
    values.push(now, null, null, null, null);
  }
  if (extra.phone !== undefined) { fields.push('phone = ?'); values.push(extra.phone); }
  if (extra.pairingCode !== undefined) { fields.push('pairing_code = ?', 'pairing_code_at = ?'); values.push(extra.pairingCode, now); }
  db.prepare(`UPDATE sdrs SET ${fields.join(', ')} WHERE slot = ?`).run(...values, slot);
  runtimeStatus.set(slot, status);
}

function upsertConversation(slot, chatId, contactName, body, fromMe, ts) {
  const phone = String(chatId || '').split('@')[0];
  const existing = db.prepare('SELECT id, unread FROM conversations WHERE slot=? AND chat_id=?').get(slot, chatId);
  const unreadInc = fromMe ? 0 : 1;
  if (existing) {
    db.prepare(`UPDATE conversations SET contact_name = COALESCE(?, contact_name), contact_phone = COALESCE(contact_phone, ?),
                last_message = ?, last_from_me = ?, last_ts = ?, unread = unread + ?, updated_at = ? WHERE id = ?`)
      .run(contactName || null, phone, body, fromMe ? 1 : 0, ts, unreadInc, new Date().toISOString(), existing.id);
  } else {
    db.prepare(`INSERT INTO conversations (slot, chat_id, contact_phone, contact_name, last_message, last_from_me, last_ts, unread)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(slot, chatId, phone, contactName || null, body, fromMe ? 1 : 0, ts, unreadInc);
  }
}

function getSlotPhone(slot) {
  const r = db.prepare('SELECT phone FROM sdrs WHERE slot = ?').get(slot);
  return r && r.phone ? String(r.phone) : null;
}

// Slots que compartilham o mesmo chip do hostSlot.
// Regra estrita: so entra na lista quem tem master_slot = hostSlot (vinculo explicito na UI Avancado)
// ou o proprio hostSlot. Nao usa `phone = ?` porque phone duplicado (bug de duplo pareamento)
// colapsava todas as mensagens no slot de menor id.
function findSlotsSharingPhone(hostSlot) {
  const rows = db.prepare(`SELECT slot FROM sdrs WHERE master_slot = ? OR slot = ?`).all(hostSlot, hostSlot);
  const set = new Set(rows.map(r => r.slot));
  set.add(hostSlot);
  return [...set];
}

function matchTrigger(body, candidateSlots) {
  const text = String(body || '').toLowerCase();
  if (!text) return null;
  const placeholders = candidateSlots.map(() => '?').join(',');
  const rows = db.prepare(`SELECT slot, keyword FROM slot_triggers WHERE slot IN (${placeholders})`).all(...candidateSlots);
  for (const r of rows) {
    if (r.keyword && text.includes(r.keyword)) return { slot: r.slot, keyword: r.keyword };
  }
  return null;
}

// Set em memoria (chatId ja saudado no slot durante este processo)
const welcomedInMemory = new Set();

function sendWelcomeIfNeeded(hostSlot, slot, chatId) {
  // Fix Smith 2026-07-21 (welcome duplicando):
  // 1) Se ja existe QUALQUER binding pra esse chat_id com matched='__upload__', significa
  //    que o dispatcher ja enviou a mensagem de abertura pelo fluxo de upload. NAO manda welcome
  //    por cima (era um dos vetores da duplicidade).
  // 2) Se ja existe QUALQUER mensagem from_me pra esse chat neste slot, tambem NAO manda welcome
  //    (o SDR ja se apresentou; welcome so tem sentido no PRIMEIRO contato).
  // 3) Guarda contra reprocessamento no mesmo processo: Set em memoria de chatIds ja saudados.
  const row = db.prepare('SELECT welcome_message, ai_active FROM sdrs WHERE slot = ?').get(slot);
  if (!row || !row.ai_active) return;
  const welcome = row.welcome_message ? String(row.welcome_message).trim() : '';
  if (!welcome) return;
  const client = clients.get(hostSlot);
  if (!client || runtimeStatus.get(hostSlot) !== 'ready') return;
  try {
    const uploadBind = db.prepare(
      `SELECT 1 FROM contact_slot_binding WHERE slot = ? AND chat_id = ? AND matched_keyword = '__upload__' LIMIT 1`
    ).get(slot, chatId);
    if (uploadBind) return;
  } catch {}
  try {
    const already = db.prepare(
      `SELECT 1 FROM messages WHERE slot = ? AND chat_id = ? AND from_me = 1 LIMIT 1`
    ).get(slot, chatId);
    if (already) return;
  } catch {}
  const wkey = `${slot}:${chatId}`;
  if (welcomedInMemory.has(wkey)) return;
  welcomedInMemory.add(wkey);
  setTimeout(() => {
    client.sendMessage(chatId, welcome).catch(e => {
      console.error(`[wa slot ${hostSlot}] welcome send error:`, e.message);
    });
  }, 1200);
}

// Regra de roteamento (v2, fix Smith 2026-07-21):
// 1) Binding ja existente (phone+chat_id) → mantem, isolado por lead.
// 2) Se algum slot compartilhando o chip tem trigger que casa no body → escolhe esse slot.
// 3) Se so ha 1 candidato (caso normal: chip conectado direto num slot) → esse slot atende,
//    independente de trigger_mode. Isso garante que slot 2/3/4 conectado sozinho responde.
// 4) Se ha varios candidatos (master_slot compartilhando chip): pega o primeiro `any` (fallback),
//    ou o hostSlot como ultima trincheira.
function resolveSlotForIncoming(hostSlot, chatId, body) {
  const phone = String(chatId || '').split('@')[0];
  const existing = db.prepare('SELECT slot, matched_keyword FROM contact_slot_binding WHERE phone = ? AND chat_id = ?').get(phone, chatId);
  if (existing) return { slot: existing.slot, isolated: true, matched: existing.matched_keyword };

  // Fix Smith 2026-07-21 (binding LID vs phone real):
  // O dispatcher grava binding com (phone=<real do lead>, chat_id=<lid>@lid). Quando a resposta chega,
  // o incoming vem SO com chat_id=<lid>@lid e o "phone" derivado do split viraria o proprio LID.
  // Sem este fallback, criavamos um SEGUNDO binding com matched_keyword=NULL, poluindo a tabela e
  // (pior) fazendo o gate `ativo_sem_dispatch_previo` do pipeline pular no caso NULL/BFS. Se ja existe
  // qualquer binding pra este chat_id (independente do phone), reutiliza — nao cria segundo.
  const anyForChat = db.prepare('SELECT slot, matched_keyword FROM contact_slot_binding WHERE chat_id = ? ORDER BY (matched_keyword = \'__upload__\') DESC, id ASC LIMIT 1').get(chatId);
  if (anyForChat) return { slot: anyForChat.slot, isolated: true, matched: anyForChat.matched_keyword };

  const candidateSlots = findSlotsSharingPhone(hostSlot);
  const match = matchTrigger(body, candidateSlots);
  if (match) {
    db.prepare(`INSERT OR IGNORE INTO contact_slot_binding (phone, chat_id, slot, matched_keyword) VALUES (?, ?, ?, ?)`)
      .run(phone, chatId, match.slot, match.keyword);
    sendWelcomeIfNeeded(hostSlot, match.slot, chatId);
    return { slot: match.slot, isolated: true, matched: match.keyword };
  }

  // Caso 3: slot unico (chip conectado direto nele) — ele atende.
  let chosen;
  if (candidateSlots.length === 1) {
    chosen = candidateSlots[0];
  } else {
    // Caso 4: multiplos candidatos por master_slot. Prefere o hostSlot se for 'any',
    // senao primeiro 'any' do grupo, senao hostSlot.
    const modes = new Map();
    for (const s of candidateSlots) {
      const r = db.prepare('SELECT trigger_mode FROM sdrs WHERE slot = ?').get(s);
      modes.set(s, r && r.trigger_mode);
    }
    if (modes.get(hostSlot) !== 'strict') {
      chosen = hostSlot;
    } else {
      chosen = candidateSlots.find(s => modes.get(s) !== 'strict') || hostSlot;
    }
  }

  db.prepare(`INSERT OR IGNORE INTO contact_slot_binding (phone, chat_id, slot, matched_keyword) VALUES (?, ?, ?, ?)`)
    .run(phone, chatId, chosen, null);
  return { slot: chosen, isolated: true, matched: null };
}

function saveMessage(hostSlot, msg) {
  try {
    const finalChat = msg.fromMe ? msg.to : msg.from;
    const body = msg.body || (msg.type && msg.type !== 'chat' ? `[${msg.type}]` : '');
    const ts = Math.floor((msg.timestamp || Date.now() / 1000));

    let slot = hostSlot;
    if (!msg.fromMe) {
      const routing = resolveSlotForIncoming(hostSlot, finalChat, body);
      slot = routing.slot;
    } else {
      const phone = String(finalChat || '').split('@')[0];
      const existing = db.prepare('SELECT slot FROM contact_slot_binding WHERE phone = ? AND chat_id = ?').get(phone, finalChat);
      if (existing) slot = existing.slot;
    }

    // Hook IA receptiva: msg do cliente + SDR configurado → debouncer.
    // O gate final (ai_active, ai_key_id, sdr_mode, limite) roda dentro do aiPipeline.
    if (!msg.fromMe) {
      try { maybeEnqueueForAI(hostSlot, slot, finalChat, msg); } catch (e) { console.error('[wa] AI enqueue err:', e && e.message); }
    }

    // Fix Smith 2026-07-21 (wa_message_id [object Object]):
    // whatsapp-web.js 1.26 nem sempre expoe msg.id._serialized (msgs LID novas).
    // A fallback antiga `String(msg.id)` virava "[object Object]" e a UNIQUE(slot, wa_message_id)
    // colidia em TODOS os inserts posteriores do slot, engolindo silenciosamente cada msg incoming.
    // Agora: monta id a partir de fromMe/remote/id do MessageId, ou usa null (o UNIQUE aceita
    // varios NULLs em SQLite — nao ha colisao).
    function extractWaMsgId(m) {
      if (!m || !m.id) return null;
      const raw = m.id;
      if (typeof raw === 'string') return raw;
      if (raw._serialized && typeof raw._serialized === 'string') return raw._serialized;
      // Reconstroi manualmente
      const fm = raw.fromMe ? 'true' : 'false';
      const rem = raw.remote || raw.remoteJid || '';
      const idStr = raw.id || raw._serialized || '';
      const part = raw.participant ? '_' + raw.participant : '';
      if (rem && idStr) return `${fm}_${rem}_${idStr}${part}`;
      return null;
    }
    const waMsgId = extractWaMsgId(msg);
    const insertRes = db.prepare(`INSERT OR IGNORE INTO messages (slot, chat_id, wa_message_id, from_me, body, ts, type)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(slot, finalChat, waMsgId, msg.fromMe ? 1 : 0, body, ts, msg.type || 'chat');
    if (insertRes.changes === 0) {
      console.warn(`[wa slot ${hostSlot}] msg IGNORED (dupe wa_message_id) slot=${slot} chat=${finalChat} wa_id=${waMsgId}`);
    }
    let contactName = null;
    try { if (msg._data && msg._data.notifyName) contactName = msg._data.notifyName; } catch {}
    upsertConversation(slot, finalChat, contactName, body, msg.fromMe ? 1 : 0, ts);

    // Hook CRM: lead respondeu ao disparo → move casinha pra novo_lead + detect tags.
    if (!msg.fromMe) {
      const phone = String(finalChat || '').split('@')[0];
      const wasDispatched = db.prepare(
        `SELECT 1 FROM slot_upload_job WHERE target_phone = ? AND status = 'sent' LIMIT 1`
      ).get(phone);
      if (wasDispatched) {
        crmSync.markReplied(phone, body || '', waMsgId).catch(() => {});
      }
    }
  } catch (e) {
    console.error(`[wa slot ${hostSlot}] saveMessage error:`, e.message);
  }
}

const pendingPairPhone = new Map();

async function connectSlot(slot, opts = {}) {
  if (clients.has(slot)) {
    const st = runtimeStatus.get(slot);
    if (opts.force) {
      try { await clients.get(slot).destroy(); } catch {}
      clients.delete(slot);
    } else if (st === 'connecting' || st === 'qr' || st === 'ready') {
      if (opts.pairPhone) pendingPairPhone.set(slot, String(opts.pairPhone).replace(/\D/g, ''));
      return;
    } else {
      try { await clients.get(slot).destroy(); } catch {}
      clients.delete(slot);
    }
  }

  if (opts.force) await killChromeForSlot(slot);

  if (opts.pairPhone) pendingPairPhone.set(slot, String(opts.pairPhone).replace(/\D/g, ''));
  setSlotStatus(slot, 'connecting');

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: `slot-${slot}`,
      dataPath: SESSIONS_DIR,
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
  });

  client.on('qr', async (qr) => {
    // Converte payload bruto do WA (ex: "2@abc...") pra data URL PNG.
    // Se der ruim, cai no fallback do payload cru pra frontend tentar renderizar via lib CDN.
    let qrToSave = qr;
    try {
      qrToSave = await QRCode.toDataURL(qr, { width: 320, margin: 1, errorCorrectionLevel: 'M' });
    } catch (e) {
      console.error(`[wa slot ${slot}] qrcode.toDataURL fail:`, e.message);
    }
    setSlotStatus(slot, 'qr', { qr: qrToSave });
    const pairPhone = pendingPairPhone.get(slot);
    if (pairPhone) {
      pendingPairPhone.delete(slot);
      try {
        const code = await client.requestPairingCode(pairPhone, true);
        setSlotStatus(slot, 'qr', { pairingCode: code });
      } catch (e) {
        console.error(`[wa slot ${slot}] pairing code error:`, e.message);
      }
    }
  });

  client.on('code', (code) => {
    setSlotStatus(slot, 'qr', { pairingCode: code });
  });

  client.on('ready', async () => {
    let phone = null;
    try { phone = client.info && client.info.wid && client.info.wid.user; } catch {}
    setSlotStatus(slot, 'ready', { phone });
    try {
      db.prepare('UPDATE sdrs SET zeus_mode = 0, zeus_mode_at = NULL WHERE slot = ? AND zeus_mode = 1').run(slot);
    } catch {}
    // Fix Smith 2026-07-21: quando o chip fica pronto num slot >1, garante que ele apareca
    // como agente ativo na UI e receba mensagens. Antes, ai_active=0 fazia o slot recem-conectado
    // ficar "morto" ate o Jeff notar e ligar o toggle manualmente.
    try {
      db.prepare(`UPDATE sdrs SET ai_active = 1, updated_at = ?
                  WHERE slot = ? AND ai_active = 0`).run(new Date().toISOString(), slot);
    } catch (e) { console.warn(`[wa slot ${slot}] auto-activate warn:`, e.message); }
    // Anti-duplicidade de phone: se outro slot esta com o mesmo phone salvo (bug historico
    // de duplo pareamento), zera o phone dele pra o roteador nao colapsar mensagens.
    // NAO desconecta ninguem — so limpa o campo. Se o outro slot ainda estiver realmente conectado,
    // o proprio on('ready') dele vai regravar o phone (comportamento estavel).
    if (phone) {
      try {
        const dupes = db.prepare('SELECT slot FROM sdrs WHERE phone = ? AND slot != ?').all(phone, slot);
        for (const d of dupes) {
          console.warn(`[wa slot ${slot}] phone ${phone} tambem estava no slot ${d.slot}, limpando duplicidade`);
          db.prepare('UPDATE sdrs SET phone = NULL, updated_at = ? WHERE slot = ?').run(new Date().toISOString(), d.slot);
        }
      } catch (e) { console.warn(`[wa slot ${slot}] dedupe phone warn:`, e.message); }
    }
    // Sonda presence: whatsapp-web.js 1.26 NAO emite 'presence_update' de forma confiavel
    // sem chamar chat.presence.subscribe() por chat (feature ainda instavel). Tentamos best-effort;
    // se falhar, degrade gracefull pra debounce puro de 30s (BASE_DEBOUNCE_MS).
    try {
      let handlerSet = false;
      if (typeof client.on === 'function') {
        client.on('presence_update', (presence) => {
          try {
            const chatId = presence && (presence.id || (presence.chat && presence.chat.id && presence.chat.id._serialized));
            const state = presence && (presence.state || presence.type || presence.status);
            if (!chatId || !state) return;
            const phoneOnly = String(chatId).split('@')[0];
            const bind = db.prepare('SELECT slot FROM contact_slot_binding WHERE phone = ? AND chat_id = ?').get(phoneOnly, chatId);
            const slotForChat = (bind && bind.slot) || slot;
            debouncer.onPresenceChange(slotForChat, chatId, state);
          } catch { /* silencioso */ }
        });
        handlerSet = true;
      }
      if (handlerSet && !debouncer.isPresenceSupported()) {
        // marcamos como "handler instalado", nao como "presence funcional".
        // Sem eventos reais chegando, o timer base cai em 30s puro (BASE_DEBOUNCE_MS).
        console.log(`[wa slot ${slot}] presence_update handler instalado (best-effort, pode nao emitir eventos)`);
      }
    } catch (e) {
      console.warn(`[wa slot ${slot}] presence subscribe fail (degrade OK, debounce puro 30s):`, e && e.message);
    }
  });

  client.on('disconnected', (reason) => {
    setSlotStatus(slot, 'disconnected');
    clients.delete(slot);
  });

  client.on('auth_failure', () => {
    setSlotStatus(slot, 'idle');
    clients.delete(slot);
  });

  // Fix Smith 2026-07-21 (guarda contra handler duplicado):
  // Em teoria connectSlot() sempre cria Client novo. Mas se algum caminho de reconnect
  // reutilizar a mesma instancia (ou se whatsapp-web.js internamente reanexar), listeners
  // podem empilhar. Cada listener extra faz o pipeline rodar 2x/3x pra mesma msg.
  // Limpar antes de registrar eh barato e defensivo. Se ja estiver zero, no-op.
  try {
    client.removeAllListeners('message');
    client.removeAllListeners('message_create');
    client.removeAllListeners('message_ack');
  } catch {}
  client.on('message', (msg) => saveMessage(slot, msg));
  client.on('message_create', (msg) => { if (msg.fromMe) saveMessage(slot, msg); });

  // ACK do WhatsApp: 1=servidor, 2=DELIVERED (dois vezinhos cinza), 3=READ.
  // Quando o disparo é entregue (2), move o card no Kanban pra conversa_iniciada.
  client.on('message_ack', (msg, ack) => {
    try {
      if (ack < 2) return;
      if (!msg.fromMe) return;
      const to = msg.to || (msg.id && msg.id.remote) || '';
      const phone = String(to || '').split('@')[0];
      if (!phone) return;
      const row = db.prepare(
        `SELECT 1 FROM slot_upload_job WHERE target_phone = ? AND status = 'sent' LIMIT 1`
      ).get(phone);
      if (!row) return;
      crmSync.markDelivered(phone).catch(() => {});
    } catch (e) {
      console.error(`[wa slot ${slot}] message_ack hook:`, e.message);
    }
  });

  clients.set(slot, client);
  client.initialize().catch(async (e) => {
    console.error(`[wa slot ${slot}] initialize error:`, e && e.message);
    setSlotStatus(slot, 'idle');
    try { await client.destroy(); } catch {}
    clients.delete(slot);
    if (/already running/i.test(String(e && e.message))) {
      await killChromeForSlot(slot);
    }
  });
}

async function disconnectSlot(slot, opts = {}) {
  // opts.logout = true (default): desassocia o WhatsApp do celular (Aparelhos conectados some).
  //                                E apaga sessao local, forcando novo QR/pair pra reconectar.
  // opts.logout = false: so mata client em memoria, mantem sessao no disco (reconectar sem parear).
  const logout = opts.logout !== false;
  const client = clients.get(slot);
  if (client) {
    if (logout) {
      try { await client.logout(); } catch (e) { console.warn(`[wa slot ${slot}] logout warn:`, e && e.message); }
    }
    try { await client.destroy(); } catch (e) { console.warn(`[wa slot ${slot}] destroy warn:`, e && e.message); }
    clients.delete(slot);
  }
  // Garantia extra: mata puppeteer orfao caso client.destroy tenha falhado.
  try { await killChromeForSlot(slot); } catch {}

  if (logout) {
    // Apaga SOMENTE a pasta desse slot. Sem isso, ao clicar "Conectar" de novo
    // o LocalAuth tenta reusar a sessao antiga (que ja nao vale) e falha.
    const dir = slotSessionDir(slot);
    try {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      console.warn(`[wa slot ${slot}] rm session dir warn:`, e && e.message);
    }
  }

  setSlotStatus(slot, logout ? 'disconnected' : 'idle');
  db.prepare('UPDATE sdrs SET phone = NULL, last_qr = NULL, last_qr_at = NULL, ready_at = NULL, pairing_code = NULL, pairing_code_at = NULL WHERE slot = ?').run(slot);
}

function getClient(slot) {
  const st = runtimeStatus.get(slot);
  if (st !== 'ready') return null;
  return clients.get(slot) || null;
}

function isReady(slot) {
  return runtimeStatus.get(slot) === 'ready';
}

// sendText publico (Fix Smith 2026-07-21):
// Rotas HTTP (/conversations/reply, /sdrs/:slot/send-text), maturation e qualquer
// script auxiliar DEVEM passar por aqui. Aplica:
//  - splitter [[BREAK]]/paragrafos/frases
//  - typing indicator entre blocos
//  - dedupe janela 5 min (isDuplicateSend / markSent)
// Ninguem deve chamar client.sendMessage cru fora deste modulo, senao burla dedupe.
async function sendText(slot, phone, message) {
  const client = getClient(slot);
  if (!client) throw new Error(`slot ${slot} not ready`);
  const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
  const text = String(message || '').trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (isDuplicateSend(chatId, text)) {
    console.warn(`[sendText] duplicate detected, skipping chat=${chatId} hash=${replyHash(text).slice(0,10)}`);
    return { ok: false, reason: 'duplicate' };
  }
  markSent(chatId, text);
  const chunks = splitIntoChunks(text);
  try { const chat = await client.getChatById(chatId); if (chat && chat.sendStateTyping) await chat.sendStateTyping(); } catch {}
  for (let i = 0; i < chunks.length; i++) {
    const piece = chunks[i];
    if (i > 0) {
      const prev = chunks[i - 1] || '';
      const typingMs = Math.min(4000, Math.max(1200, prev.length * 30));
      try { const chat = await client.getChatById(chatId); if (chat && chat.sendStateTyping) await chat.sendStateTyping(); } catch {}
      await sleep(typingMs);
    }
    await client.sendMessage(chatId, piece);
  }
  return { ok: true, chunks: chunks.length };
}

async function restoreSlots() {
  // Inclui slots em 'connecting' e 'qr' tambem: se o processo caiu no meio de um
  // pareamento/connecting, o restart seguinte nao pode simplesmente ignorar. So
  // pula 'idle'/'disconnected' (usuario desconectou intencionalmente).
  // Se o slot tem sessao no disco (LocalAuth), ele deve tentar subir.
  const slots = db.prepare("SELECT slot FROM sdrs WHERE status IN ('ready','connecting','qr')").all();
  for (const { slot } of slots) {
    await killChromeForSlot(slot);
    setSlotStatus(slot, 'connecting');
    connectSlot(slot).catch(e => console.error(`[wa slot ${slot}] restore error:`, e && e.message));
  }
}

async function requestPairingCodeForSlot(slot, phone, force = false) {
  const phoneDigits = String(phone || '').replace(/\D/g, '');
  if (!phoneDigits || phoneDigits.length < 10 || phoneDigits.length > 15) throw new Error('phone_invalid');

  // Limpa pairing_code antigo pra UI nao mostrar codigo vencido enquanto novo nao chega.
  db.prepare('UPDATE sdrs SET pairing_code = NULL, pairing_code_at = NULL WHERE slot = ?').run(slot);

  const client = clients.get(slot);
  const st = runtimeStatus.get(slot);

  // Se o slot ja tem client vivo em 'qr', pede o codigo direto (rapido, sem force).
  if (!force && client && st === 'qr') {
    try {
      const code = await client.requestPairingCode(phoneDigits, true);
      setSlotStatus(slot, 'qr', { pairingCode: code });
      return code;
    } catch (e) {
      console.error(`[wa slot ${slot}] pair code fetch fail, force reconnect:`, e && e.message);
    }
  }

  // Caso contrario: reinicia sessao e agenda o pairing pro proximo evento 'qr'.
  // O frontend vai capturar o codigo via poll de refreshConnectModal em <5s.
  await connectSlot(slot, { pairPhone: phoneDigits, force: true });
  return null;
}

async function reconnectSlot(slot) {
  db.prepare('UPDATE sdrs SET last_qr = NULL, last_qr_at = NULL, pairing_code = NULL, pairing_code_at = NULL WHERE slot = ?').run(slot);
  await connectSlot(slot, { force: true });
}

function resolveHostSlotFor(slot) {
  const row = db.prepare('SELECT slot, master_slot, phone FROM sdrs WHERE slot = ?').get(slot);
  if (!row) return slot;
  if (row.master_slot) return row.master_slot;
  if (row.phone) {
    const active = db.prepare(`SELECT slot FROM sdrs WHERE phone = ? AND master_slot IS NULL LIMIT 1`).get(row.phone);
    if (active) return active.slot;
  }
  return slot;
}

function firstName(fullName) {
  if (!fullName) return '';
  const clean = String(fullName).trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  const first = clean.split(' ')[0];
  if (!first) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

const GREETING_RE = /^(ótimo dia|ótima tarde|ótima noite|otimo dia|otima tarde|otima noite|bom dia|boa tarde|boa noite|olá|ola|oi|ei|opa|prazer)([,!.]*)\s*/i;

function renderWithName(template, name) {
  const nome = firstName(name);
  const hasPlaceholder = /\{nome\}/i.test(template);
  if (hasPlaceholder) {
    let out = template.replace(/\{nome\}/gi, nome);
    if (!nome) {
      out = out.replace(/\s+,/g, ',');
      out = out.replace(/,\s*,/g, ',');
      out = out.replace(/\b(Oi|Olá|Ola|Ei|Opa|Prazer)\s+([,!.])\s*/gi, '$1$2 ');
      out = out.replace(/\b(Oi|Olá|Ola|Ei|Opa|Prazer)\s*,\s*/gi, '$1! ');
      out = out.replace(/\s{2,}/g, ' ').trim();
    }
    return out;
  }
  if (!nome) return template;
  const trimmed = template.trimStart();
  if (GREETING_RE.test(trimmed)) {
    return trimmed.replace(GREETING_RE, (m, greet) => `${greet} ${nome}, `);
  }
  return `Oi ${nome}, ` + trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

function getDispatchMessage(slot, targetName) {
  const rows = db.prepare('SELECT id, body FROM slot_dispatch_messages WHERE slot = ? ORDER BY position, id').all(slot);
  let template = null;
  if (rows.length) {
    let state = db.prepare('SELECT next_message_index, sent_since_pause FROM slot_dispatch_state WHERE slot = ?').get(slot);
    if (!state) {
      db.prepare('INSERT OR IGNORE INTO slot_dispatch_state (slot, next_message_index, sent_since_pause, paused_until) VALUES (?, 0, 0, 0)').run(slot);
      state = { next_message_index: 0, sent_since_pause: 0 };
    }
    const idx = state.next_message_index % rows.length;
    template = rows[idx].body;
    const nextIdx = (idx + 1) % rows.length;
    db.prepare('UPDATE slot_dispatch_state SET next_message_index = ?, sent_since_pause = sent_since_pause + 1, updated_at = ? WHERE slot = ?')
      .run(nextIdx, new Date().toISOString(), slot);
  } else {
    const wm = db.prepare('SELECT welcome_message FROM sdrs WHERE slot = ?').get(slot);
    template = wm && wm.welcome_message ? String(wm.welcome_message).trim() : '';
  }
  if (!template) return null;
  return renderWithName(template, targetName);
}

function checkAndSetPause(slot) {
  const cfg = db.prepare('SELECT dispatch_pause_every, dispatch_pause_seconds FROM sdrs WHERE slot = ?').get(slot);
  const state = db.prepare('SELECT sent_since_pause FROM slot_dispatch_state WHERE slot = ?').get(slot);
  if (!cfg || !state) return;
  const every = cfg.dispatch_pause_every || 10;
  const secs = cfg.dispatch_pause_seconds || 0;
  if (secs > 0 && state.sent_since_pause >= every) {
    const until = Math.floor(Date.now() / 1000) + secs;
    db.prepare('UPDATE slot_dispatch_state SET sent_since_pause = 0, paused_until = ?, updated_at = ? WHERE slot = ?')
      .run(until, new Date().toISOString(), slot);
  }
}

function isSlotPaused(slot) {
  const s = db.prepare('SELECT paused_until FROM slot_dispatch_state WHERE slot = ?').get(slot);
  if (!s) return false;
  return (s.paused_until || 0) > Math.floor(Date.now() / 1000);
}

function randomDelaySec(slot) {
  const cfg = db.prepare('SELECT dispatch_min_delay, dispatch_max_delay FROM sdrs WHERE slot = ?').get(slot);
  const min = (cfg && cfg.dispatch_min_delay) || 30;
  const max = (cfg && cfg.dispatch_max_delay) || 60;
  return Math.floor(min + Math.random() * Math.max(1, max - min));
}

function isDispatchRunning(slot) {
  const s = db.prepare('SELECT dispatch_running FROM slot_dispatch_state WHERE slot = ?').get(slot);
  return !!(s && s.dispatch_running);
}

function readWorkerToken() {
  try {
    const env = fs.readFileSync(path.resolve(__dirname, '../../../../jeff-worker/.env'), 'utf8');
    const m = env.match(/^API_TOKEN=(.+)$/m);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}
const WORKER_TOKEN = readWorkerToken();
const WORKER_URL = 'http://127.0.0.1:3002';

async function isWorkerReady() {
  try {
    const r = await fetch(`${WORKER_URL}/health`, { headers: { 'Authorization': `Bearer ${WORKER_TOKEN}` } });
    if (!r.ok) return false;
    const j = await r.json().catch(() => ({}));
    return j && j.wa === 'ready';
  } catch { return false; }
}

class WorkerNotReadyError extends Error {
  constructor() { super('worker_not_ready'); this.code = 'WORKER_NOT_READY'; }
}

async function sendViaWorker(phone, body) {
  const r = await fetch(`${WORKER_URL}/messages/private`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${WORKER_TOKEN}` },
    body: JSON.stringify({ to: phone, body }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || `worker_send_fail_${r.status}`);
  return j;
}

// Lock em memoria: evita que setInterval(processUploadJobs, 8s) rode em paralelo.
// Como cada job dorme 30-60s no final (randomDelaySec), 2+ ticks costumavam ficar concorrentes,
// contornando ate a defesa de dedupe em alguns casos.
let _dispatcherBusy = false;

async function processUploadJobs() {
  if (_dispatcherBusy) return;
  _dispatcherBusy = true;
  try {
  const bySlot = db.prepare(`SELECT DISTINCT slot FROM slot_upload_job WHERE status = 'pending'`).all();
  for (const { slot } of bySlot) {
    if (isSlotPaused(slot)) continue;
    if (!isDispatchRunning(slot)) continue;
    const gate = db.prepare('SELECT ai_active, zeus_mode, phone, master_slot FROM sdrs WHERE slot = ?').get(slot);
    if (!gate || !gate.ai_active) continue;
    const job = db.prepare(`SELECT id, slot, target_phone, target_name FROM slot_upload_job
                            WHERE slot = ? AND status = 'pending' ORDER BY id ASC LIMIT 1`).get(slot);
    if (!job) continue;
    // Claim atomico: transiciona pending -> processing. Se changes=0, outra
    // invocacao do dispatcher ja pegou. Impede que duas rodadas do setInterval
    // (8s) enviem a mesma mensagem em corrida, o que gerava 2-3 disparos identicos
    // pro mesmo lead (bug reportado 2026-07-21).
    const claim = db.prepare(`UPDATE slot_upload_job SET status = 'processing' WHERE id = ? AND status = 'pending'`).run(job.id);
    if (claim.changes === 0) continue;
    try {
      // Defesa em profundidade: se ja existe um job 'sent' pro mesmo slot+phone,
      // esse aqui vira duplicado, nao dispara. Cobre caso raro onde algo escapou
      // do dedupe na ingestao (import antigo, corrida entre uploads paralelos).
      const already = db.prepare(
        `SELECT id FROM slot_upload_job WHERE slot = ? AND target_phone = ? AND status = 'sent' AND id <> ? LIMIT 1`
      ).get(job.slot, job.target_phone, job.id);
      if (already) {
        db.prepare(`UPDATE slot_upload_job SET status = 'duplicate', error = 'dedupe: ja enviado', sent_at = ? WHERE id = ?`)
          .run(new Date().toISOString(), job.id);
        continue;
      }
      const message = getDispatchMessage(job.slot, job.target_name);
      if (!message) {
        db.prepare(`UPDATE slot_upload_job SET status = 'error', error = 'sem mensagem de disparo', sent_at = ? WHERE id = ?`)
          .run(new Date().toISOString(), job.id);
        continue;
      }
      // Zeus mode: envio passa pelo chip principal (jeff-worker :3002) em vez do chip do slot.
      // Fix Smith 2026-07-21: removida restricao !master_slot && !phone. Jeff pediu que QUALQUER
      // slot possa usar Zeus. Quando zeus_mode=1, o slot atende via numero principal do dono,
      // independente de ter chip proprio pareado ou master_slot vinculado. A personalidade vem
      // 100% das instructions do slot (systemPromptBuilder), sem persona injetada.
      const useZeus = !!gate.zeus_mode;
      if (useZeus) {
        // Gate anti-fantasma: se o chip do worker nao esta 'ready' (QR pendente,
        // conexao caida), NAO manda e NAO marca como sent. Devolve pending pro
        // proximo ciclo. Sem isso o worker aceitava a chamada e engolia a msg,
        // marcando job como enviado sem WhatsApp ter recebido (bug 2026-07-21).
        if (!(await isWorkerReady())) {
          db.prepare(`UPDATE slot_upload_job SET status = 'pending' WHERE id = ? AND status = 'processing'`).run(job.id);
          console.warn('[wa dispatcher] worker nao ready, job devolvido pra pending id=', job.id);
          break;
        }
        await sendViaWorker(job.target_phone, message);
        db.prepare(`INSERT OR IGNORE INTO contact_slot_binding (phone, chat_id, slot, matched_keyword) VALUES (?, ?, ?, ?)`)
          .run(job.target_phone, job.target_phone + '@c.us', job.slot, '__upload__');
      } else {
        const hostSlot = resolveHostSlotFor(job.slot);
        if (!isReady(hostSlot)) {
          // devolve claim: slot nao pronto, deixa pro proximo ciclo tentar de novo
          db.prepare(`UPDATE slot_upload_job SET status = 'pending' WHERE id = ? AND status = 'processing'`).run(job.id);
          continue;
        }
        const client = getClient(hostSlot);
        if (!client) {
          db.prepare(`UPDATE slot_upload_job SET status = 'pending' WHERE id = ? AND status = 'processing'`).run(job.id);
          continue;
        }
        const numberId = await client.getNumberId(job.target_phone);
        if (!numberId) {
          db.prepare(`UPDATE slot_upload_job SET status = 'error', error = 'nao existe no wpp', sent_at = ? WHERE id = ?`)
            .run(new Date().toISOString(), job.id);
          continue;
        }
        const chatId = numberId._serialized;
        await client.sendMessage(chatId, message);
        db.prepare(`INSERT OR IGNORE INTO contact_slot_binding (phone, chat_id, slot, matched_keyword) VALUES (?, ?, ?, ?)`)
          .run(job.target_phone, chatId, job.slot, '__upload__');
      }
      db.prepare(`UPDATE slot_upload_job SET status = 'sent', sent_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), job.id);
      // Notifica CRM: número foi disparado (garante presença no Kanban + timestamp sent_at).
      crmSync.markSent(job.target_phone, job.target_name, job.slot).catch(() => {});
      checkAndSetPause(job.slot);
      const delaySec = randomDelaySec(job.slot);
      await new Promise(r => setTimeout(r, delaySec * 1000));
    } catch (e) {
      db.prepare(`UPDATE slot_upload_job SET status = 'error', error = ?, sent_at = ? WHERE id = ?`)
        .run(String(e.message || e).slice(0, 300), new Date().toISOString(), job.id);
    }
  }
  } finally {
    _dispatcherBusy = false;
  }
}

function startUploadDispatcher() {
  // Boot: jobs presos em 'processing' (crash/restart no meio do envio) voltam
  // pra 'pending' pra serem reprocessados. Sem isso ficam parados pra sempre.
  try {
    const reset = db.prepare(`UPDATE slot_upload_job SET status = 'pending' WHERE status = 'processing'`).run();
    if (reset.changes) console.log(`[wa dispatcher] boot: ${reset.changes} job(s) processing -> pending`);
  } catch (e) { console.error('[wa dispatcher] boot reset err:', e.message); }
  // Lock em memoria: se um ciclo ainda esta rodando quando o proximo tick chega,
  // pula. Defesa dupla junto com o claim atomico no processUploadJobs.
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try { await processUploadJobs(); }
    catch (e) { console.error('upload dispatch:', e.message); }
    finally { running = false; }
  }, 8000);
}

// Watchdog: se um slot fica em 'connecting' > 90s sem virar 'qr' ou 'ready',
// o Chrome provavelmente crashou. Force-reconnect pra reabrir o pareamento.
function startConnectionWatchdog() {
  setInterval(() => {
    try {
      // Comparacao numerica (segundos epoch): updated_at eh ISO com 'T'/'Z',
      // datetime('now','-90 s') retorna string sem 'T', a comparacao lexicografica
      // sempre dava updated_at MAIOR (T > espaco) e o watchdog nunca disparava.
      // Bug 2026-07-21: slot ficava horas em 'connecting' sem force-reset.
      const stuck = db.prepare(`
        SELECT slot, status, updated_at FROM sdrs
        WHERE status = 'connecting'
          AND strftime('%s', REPLACE(REPLACE(updated_at,'T',' '),'Z','')) < strftime('%s','now') - 90
      `).all();
      for (const s of stuck) {
        console.warn(`[wa watchdog] slot ${s.slot} travado em connecting, force reset`);
        killChromeForSlot(s.slot).then(() => {
          try { clients.delete(s.slot); } catch {}
          setSlotStatus(s.slot, 'idle');
        }).catch(() => {});
      }
    } catch (e) {
      console.error('[wa watchdog] err:', e.message);
    }
  }, 30000);
}

// Reset do cache em memoria de welcomes ja enviados naquele slot.
// Usado pelo botao "Resetar memoria de conversas" (Jeff, 2026-07-21).
// Sem isso, mesmo apagando bindings e messages do DB, o Set em memoria
// continuaria bloqueando welcome pra chats reprocessados na mesma execucao.
function resetWelcomeCache(slot) {
  const prefix = `${slot}:`;
  let removed = 0;
  for (const k of welcomedInMemory) {
    if (k.startsWith(prefix)) { welcomedInMemory.delete(k); removed++; }
  }
  return removed;
}

// Lock por chatId — usado para impedir que replay/scheduler rode em paralelo com
// o debouncer natural pro mesmo chat (que gerava respostas duplicadas do bot).
// Chave = `${slot}:${chatId}`. Se ja tem processamento em andamento, novo pedido skip.
const chatProcessingLocks = new Set();
function tryLockChat(slot, chatId) {
  const k = `${slot}:${chatId}`;
  if (chatProcessingLocks.has(k)) return false;
  chatProcessingLocks.add(k);
  return true;
}
function unlockChat(slot, chatId) {
  chatProcessingLocks.delete(`${slot}:${chatId}`);
}

// Replay de conversas no vacuo: chats onde a ultima mensagem eh do cliente,
// existe binding __upload__ (lead disparado) e o cliente falou nas ultimas N horas
// sem receber resposta do bot. Reenvia essas mensagens pro pipeline pra tirar do vacuo.
// Usado quando o daily_limit ou o worker QR/disconnect deixou clientes parados.
async function replayStuckForSlot(slot, opts = {}) {
  ensureAIProcessorRegistered();
  const hoursBack = Number(opts.hoursBack) || 12;
  const cutoff = Math.floor(Date.now() / 1000) - (hoursBack * 3600);

  // Chats onde a ultima msg do banco eh do cliente e tem binding __upload__
  const stuck = db.prepare(`
    WITH last_msg AS (
      SELECT chat_id, MAX(ts) AS max_ts FROM messages WHERE slot = ? GROUP BY chat_id
    )
    SELECT m.chat_id
    FROM messages m
    JOIN last_msg lm ON m.chat_id = lm.chat_id AND m.ts = lm.max_ts
    JOIN contact_slot_binding b ON b.slot = ? AND b.chat_id = m.chat_id AND b.matched_keyword = '__upload__'
    WHERE m.slot = ? AND m.from_me = 0 AND m.ts > ?
    ORDER BY m.ts ASC
  `).all(slot, slot, slot, cutoff);

  const results = [];
  for (const row of stuck) {
    const chatId = row.chat_id;
    // Pega msgs do cliente desde a ultima resposta do bot (ou desde o disparo)
    const lastBotMsg = db.prepare(
      `SELECT ts FROM messages WHERE slot = ? AND chat_id = ? AND from_me = 1 ORDER BY ts DESC LIMIT 1`
    ).get(slot, chatId);
    const sinceTs = lastBotMsg ? lastBotMsg.ts : 0;
    const clientMsgs = db.prepare(
      `SELECT body, ts, type FROM messages WHERE slot = ? AND chat_id = ? AND from_me = 0 AND ts > ? ORDER BY ts ASC`
    ).get ? db.prepare(
      `SELECT body, ts, type FROM messages WHERE slot = ? AND chat_id = ? AND from_me = 0 AND ts > ? ORDER BY ts ASC`
    ).all(slot, chatId, sinceTs) : [];
    if (!clientMsgs.length) continue;

    // Registra no cache de roteamento e monta objs no formato que o pipeline espera
    // (aiPipeline le body/text/type — o proximo callback so precisa desses campos).
    const hostSlot = resolveHostSlotFor(slot);
    chatHostSlot.set(chatId, hostSlot);
    const msgs = clientMsgs.map(m => ({
      body: m.body || '',
      type: m.type || 'chat',
      timestamp: m.ts,
      fromMe: false,
      from: chatId,
    }));
    // Lock por chat: se o debouncer natural ja esta processando esse chat, pula.
    // Sem isso, LLM roda 2x em paralelo e envia mensagem duplicada.
    if (!tryLockChat(slot, chatId)) {
      results.push({ chatId, msgs: msgs.length, ok: false, error: 'chat_em_processamento' });
      continue;
    }
    try {
      await debouncer.processNow(slot, chatId, msgs);
      results.push({ chatId, msgs: msgs.length, ok: true });
    } catch (e) {
      results.push({ chatId, msgs: msgs.length, ok: false, error: e && e.message });
    } finally {
      unlockChat(slot, chatId);
    }
    await sleep(1500);
  }
  return { total: stuck.length, processed: results.length, results };
}

// Puxa historico dos chats com binding __upload__ direto do WhatsApp Web (client.getChats),
// salva no DB toda msg do cliente que nao existir. Recupera msgs entregues enquanto o
// Chrome estava offline (perdidas pelo handler 'message'). Depois roda replay pra atender
// quem falou por ultimo e ficou sem resposta.
async function syncMissedInboundForSlot(slot) {
  const client = clients.get(resolveHostSlotFor(slot));
  if (!client || runtimeStatus.get(resolveHostSlotFor(slot)) !== 'ready') {
    return { ok: false, error: 'slot_nao_ready' };
  }
  const bindings = db.prepare(
    `SELECT DISTINCT chat_id FROM contact_slot_binding WHERE slot = ? AND matched_keyword = '__upload__'`
  ).all(slot);

  let novos = 0;
  const detalhes = [];
  const insertMsg = db.prepare(
    `INSERT OR IGNORE INTO messages (slot, chat_id, wa_message_id, from_me, body, ts, type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  for (const b of bindings) {
    let totalNoWpp = 0, novosDesteChat = 0, ultimaClient = null;
    try {
      const chat = await client.getChatById(b.chat_id);
      if (!chat) { detalhes.push({ chat: b.chat_id, err: 'chat_nao_encontrado' }); continue; }
      const msgs = await chat.fetchMessages({ limit: 50 });
      totalNoWpp = msgs.length;
      for (const m of msgs) {
        const waId = (m.id && m.id._serialized) || null;
        const body = m.body || (m.type && m.type !== 'chat' ? `[${m.type}]` : '');
        const ts = m.timestamp || Math.floor(Date.now() / 1000);
        const res = insertMsg.run(slot, b.chat_id, waId, m.fromMe ? 1 : 0, body, ts, m.type || 'chat');
        if (res.changes > 0 && !m.fromMe) { novos++; novosDesteChat++; }
        if (!m.fromMe && (!ultimaClient || ts > ultimaClient.ts)) ultimaClient = { ts, body: (body||'').slice(0,60) };
      }
      detalhes.push({ chat: b.chat_id, total: totalNoWpp, novos: novosDesteChat, ultimaClient });
    } catch (e) {
      console.warn(`[sync-inbound] slot=${slot} chat=${b.chat_id} err:`, e && e.message);
      detalhes.push({ chat: b.chat_id, err: e && e.message });
    }
  }
  return { ok: true, chats: bindings.length, novasMsgsCliente: novos, detalhes };
}

// Roda replayStuckForSlot em todos os slots ativos periodicamente. Tira do vacuo
// clientes que ficaram sem resposta por (a) daily_limit, (b) worker desconectado
// no momento da entrega, (c) crash de Chrome antes do processor rodar.
// Intervalo: 3 min. Janela: ultimas 6 horas.
function startReplayScheduler() {
  const tick = async () => {
    try {
      const slots = db.prepare(`SELECT slot FROM sdrs WHERE ai_active = 1`).all();
      for (const { slot } of slots) {
        try {
          const out = await replayStuckForSlot(slot, { hoursBack: 6 });
          if (out.processed > 0) {
            console.log(`[replay scheduler] slot=${slot} recuperados=${out.processed}/${out.total}`);
          }
        } catch (e) {
          console.warn(`[replay scheduler] slot=${slot} err:`, e && e.message);
        }
      }
    } catch (e) {
      console.error('[replay scheduler] tick err:', e && e.message);
    }
  };
  // Primeiro tick apos 60s do boot (deixa slots subirem), depois a cada 3 min.
  setTimeout(() => { tick(); setInterval(tick, 3 * 60 * 1000); }, 60_000);
}

module.exports = { connectSlot, disconnectSlot, getClient, isReady, sendText, restoreSlots, requestPairingCodeForSlot, reconnectSlot, clients, runtimeStatus, startUploadDispatcher, startConnectionWatchdog, resetWelcomeCache, replayStuckForSlot, startReplayScheduler, syncMissedInboundForSlot };
