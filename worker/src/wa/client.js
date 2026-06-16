const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// Stealth: substitui o puppeteer interno do whatsapp-web.js por puppeteer-extra+stealth
// reduz detecção de WebDriver/headless pela Meta (anti-ban de chip).
const puppeteerExtra = require('puppeteer-extra');
puppeteerExtra.use(require('puppeteer-extra-plugin-stealth')());
const puppeteerPath = require.resolve('puppeteer', {
  paths: [path.dirname(require.resolve('whatsapp-web.js/package.json'))],
});
require.cache[puppeteerPath] = { id: puppeteerPath, filename: puppeteerPath, loaded: true, exports: puppeteerExtra };

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const { config } = require('../config');
const logger = require('../logger');
const { db } = require('../db');
const { StateMachine } = require('./state');
const { TimedSet } = require('./dedupe');
const { attachWatchdog } = require('./watchdog');
const { normalizeForCompare } = require('../utils/jid');
const { isWhitelistedPhone, isTeamAuthorizedPhone } = require('../agent/notify');
const { resolvePhone } = require('./contact-resolver');
const { transcribe } = require('../audio/transcribe');
const apiReply = require('../agent/api-reply');

fs.mkdirSync(config.authPath, { recursive: true });
fs.mkdirSync(config.mediaPath, { recursive: true });

function killZombieChrome() {
  try {
    const pattern = `chromium.*${config.authPath}`;
    execSync(`pkill -9 -f ${JSON.stringify(pattern)} || true`, { stdio: 'ignore' });
  } catch {
    /* ignore */
  }
}

const insertMessage = db.prepare(`
  INSERT OR IGNORE INTO messages
    (message_id, chat_id, from_id, to_id, direction, type, body, has_media, media_path,
     from_me, author_name, ack, is_group, timestamp, raw_json, processed_by_agent, contact_phone)
  VALUES
    (@message_id, @chat_id, @from_id, @to_id, @direction, @type, @body, @has_media, @media_path,
     @from_me, @author_name, @ack, @is_group, @timestamp, @raw_json, @processed_by_agent, @contact_phone)
`);

const updateTranscription = db.prepare(`
  UPDATE messages
    SET transcription = @transcription,
        transcription_status = @status,
        media_path = COALESCE(@media_path, media_path),
        processed_by_agent = @processed_by_agent
  WHERE message_id = @message_id
`);

const upsertChat = db.prepare(`
  INSERT INTO chats (jid, name, is_group, last_message_ts, updated_at)
  VALUES (@jid, @name, @is_group, @last_message_ts, datetime('now'))
  ON CONFLICT(jid) DO UPDATE SET
    name = COALESCE(excluded.name, chats.name),
    is_group = excluded.is_group,
    last_message_ts = excluded.last_message_ts,
    updated_at = datetime('now')
`);

const updateAck = db.prepare(`UPDATE messages SET ack = @ack WHERE message_id = @message_id`);

// Helpers de app_settings e contact_settings pro fluxo de grupo interno da equipe (Jefferson 2026-04-24).
const getAppSettingStmt = db.prepare(`SELECT value FROM app_settings WHERE key = ?`);
const setAppSettingStmt = db.prepare(`
  INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
`);
const upsertContactSettingStmt = db.prepare(`
  INSERT INTO contact_settings (phone, api_replies_enabled, notes, set_by, updated_at)
  VALUES (@phone, @enabled, @notes, @set_by, datetime('now'))
  ON CONFLICT(phone) DO UPDATE SET
    api_replies_enabled = excluded.api_replies_enabled,
    notes = excluded.notes,
    set_by = excluded.set_by,
    updated_at = datetime('now')
`);

function getTeamGroupJid() {
  const row = getAppSettingStmt.get('internal_team_group_jid');
  return row ? row.value : null;
}
function setTeamGroupJid(jid) {
  setAppSettingStmt.run('internal_team_group_jid', jid);
}

// Rastreia último grupo onde o worker foi adicionado (memória transitória pra confirmação do Jefferson).
let lastSelfJoinedGroup = { jid: null, ts: 0 };

function isoFromUnix(ts) {
  if (!ts) return new Date().toISOString();
  return new Date(ts * 1000).toISOString();
}

// Download genérico pra mídia não-áudio (imagem, documento, vídeo).
// Não transcreve — só salva o arquivo em data/media e atualiza media_path.
// Depois aciona o agente (whitelist) pra ele poder ler o arquivo.
async function handleInboundMedia(msg, { fromJid, phone, whitelisted, queue }) {
  const messageId = msg.id?._serialized;
  try {
    const media = await msg.downloadMedia();
    if (!media || !media.data) throw new Error('media download returned empty');
    const mime = media.mimetype || '';
    let ext = 'bin';
    if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
    else if (mime.includes('png')) ext = 'png';
    else if (mime.includes('webp')) ext = 'webp';
    else if (mime.includes('heif') || mime.includes('heic')) ext = 'heic';
    else if (mime.includes('gif')) ext = 'gif';
    else if (mime.includes('pdf')) ext = 'pdf';
    else if (mime.includes('mp4')) ext = 'mp4';
    else if (mime.includes('quicktime')) ext = 'mov';
    else if (mime.includes('msword') || mime.includes('wordprocessingml')) ext = 'docx';
    else if (mime.includes('spreadsheetml') || mime.includes('excel')) ext = 'xlsx';
    else if (media.filename) {
      const m = media.filename.match(/\.([a-zA-Z0-9]{1,6})$/);
      if (m) ext = m[1].toLowerCase();
    }
    const filePath = path.join(config.mediaPath, `${messageId}.${ext}`);
    fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'));
    // Atualiza media_path na linha já persistida; processed_by_agent=0 pra whitelist re-processar.
    db.prepare(`UPDATE messages SET media_path = ?, processed_by_agent = ? WHERE message_id = ?`).run(
      filePath,
      whitelisted ? 0 : 1,
      messageId
    );
  } catch (err) {
    logger.error({ err: String(err.message || err), messageId }, 'inbound media download failed');
    db.prepare(`UPDATE messages SET processed_by_agent = 1 WHERE message_id = ?`).run(messageId);
  }
}

async function handleInboundAudio(msg, { fromJid, phone, whitelisted, queue }) {
  const messageId = msg.id?._serialized;
  // Forwarded audio da whitelist = pedido de transcrição pura. Auto-reply com texto e fim.
  const isForwarded = msg.isForwarded === true || (msg.forwardingScore || 0) > 0;
  const forwardTranscriptionMode = isForwarded && whitelisted;
  let transcribedText = null;
  try {
    const media = await msg.downloadMedia();
    if (!media || !media.data) throw new Error('media download returned empty');
    const ext = (media.mimetype || '').includes('ogg') ? 'ogg' : 'bin';
    const filePath = path.join(config.mediaPath, `${messageId}.${ext}`);
    fs.writeFileSync(filePath, Buffer.from(media.data, 'base64'));
    let status = 'failed';
    try {
      transcribedText = await transcribe(filePath);
      status = 'ok';
    } catch (err) {
      logger.warn({ err, messageId }, 'transcription failed');
    }
    updateTranscription.run({
      message_id: messageId,
      transcription: transcribedText,
      status,
      media_path: filePath,
      // Auto-transcrição de forward = já tratada, não re-trigger o agente.
      processed_by_agent: forwardTranscriptionMode ? 1 : (whitelisted ? 0 : 1),
    });
  } catch (err) {
    logger.error({ err, messageId }, 'inbound audio download failed');
    updateTranscription.run({
      message_id: messageId,
      transcription: null,
      status: 'failed',
      media_path: null,
      processed_by_agent: forwardTranscriptionMode ? 1 : (whitelisted ? 0 : 1),
    });
  }
  // Modo transcrição pura: auto-resposta com o texto e short-circuit.
  if (forwardTranscriptionMode && transcribedText && queue) {
    try {
      await queue.enqueue({
        chat_id: fromJid,
        kind: 'text',
        payload: { body: `*Transcrição:*\n\n${transcribedText}` },
        priority: 2,
      });
      logger.info({ messageId, phone }, 'forwarded audio auto-transcribed');
    } catch (err) {
      logger.warn({ err: String(err.message || err) }, 'forward transcription enqueue failed');
    }
    return;
  }
  if (forwardTranscriptionMode && !transcribedText && queue) {
    // Forward sem transcrição válida — avisa o remetente que falhou.
    try {
      await queue.enqueue({
        chat_id: fromJid,
        kind: 'text',
        payload: {
          body: 'Não consegui transcrever esse áudio (arquivo corrompido ou idioma não reconhecido). Tenta reencaminhar.',
        },
        priority: 2,
      });
    } catch {
      /* noop */
    }
    return;
  }
  if (!whitelisted && transcribedText && queue) {
    apiReply
      .handleInbound({ phone, fromJid, text: transcribedText, queue, messageId, msgType: msg.type })
      .catch((err) => logger.warn({ err, phone }, 'api reply (audio) failed'));
  }
}

function persistMessage(msg, direction, extra = {}) {
  try {
    // chat_id = o "outro lado" da conversa. Para outbound, msg.from é a conta do worker;
    // precisamos usar msg.to. Para inbound, msg.from é o remetente = chat_id.
    const chatId = (msg.fromMe ? msg.to : msg.from) || msg.from || msg.to || '';
    const isGroup = typeof chatId === 'string' && chatId.endsWith('@g.us') ? 1 : 0;
    const rawBody = typeof msg.body === 'string' ? msg.body : '';
    const mediaPath = extra.media_path || null;
    const type = msg.type || 'chat';
    const isAudio = type === 'ptt' || type === 'audio';
    const isDM = typeof chatId === 'string' && (chatId.endsWith('@c.us') || chatId.endsWith('@lid'));
    const phone = extra.phone || null;
    const whitelistedDM =
      direction === 'in' && !msg.fromMe && !isGroup && isDM && isWhitelistedPhone(phone);
    // Regra: acionador do agente só se marca processed_by_agent=0 quando já há conteúdo pra ele ler.
    // Mensagem de áudio começa com 1 (processada) e só volta a 0 depois que a transcrição terminar.
    const processed = whitelistedDM && !isAudio ? 0 : 1;
    const payload = {
      message_id: msg.id?._serialized || msg.id || `${Date.now()}-${Math.random()}`,
      chat_id: chatId,
      from_id: msg.from || null,
      to_id: msg.to || null,
      direction,
      type,
      body: rawBody || null,
      has_media: msg.hasMedia ? 1 : 0,
      media_path: mediaPath,
      from_me: msg.fromMe ? 1 : 0,
      author_name: msg._data?.notifyName || msg.author || null,
      ack: typeof msg.ack === 'number' ? msg.ack : 0,
      is_group: isGroup,
      timestamp: isoFromUnix(msg.timestamp),
      raw_json: safeJSON(msg),
      processed_by_agent: processed,
      contact_phone: phone,
    };
    insertMessage.run(payload);
    upsertChat.run({
      jid: chatId,
      name: msg._data?.notifyName || null,
      is_group: isGroup,
      last_message_ts: payload.timestamp,
    });
    return payload;
  } catch (err) {
    logger.error({ err }, 'persistMessage failed');
    return null;
  }
}

function safeJSON(obj) {
  try {
    return JSON.stringify(obj, (_k, v) => (v === undefined ? null : v));
  } catch {
    return null;
  }
}

function createWAManager({ onMessage, onStateChange }) {
  const state = new StateMachine();
  let client = null;
  let reconnectTimer = null;
  let reconnectDelay = config.reconnectBaseMs;
  let destroyed = false;
  let busy = false;
  let externalQueue = null; // injetado via setQueue após createQueue()

  const inboundSeen = new TimedSet(60_000);

  state.on('change', (e) => {
    logger.info({ from: e.from, to: e.to }, 'state change');
    onStateChange?.(state);
  });

  function attachHandlers(c) {
    c.on('qr', (qr) => {
      state.transition('qr', { qr });
    });

    c.on('authenticated', () => {
      state.transition('authenticated', { qr: null });
    });

    c.on('auth_failure', (msg) => {
      logger.error({ msg }, 'auth_failure');
      state.transition('auth_failure', { lastError: String(msg) });
      scheduleReconnect('auth_failure');
    });

    c.on('ready', async () => {
      try {
        const me = c.info?.wid;
        state.transition('ready', {
          qr: null,
          meNumber: me?.user || null,
          meName: c.info?.pushname || null,
        });
        reconnectDelay = config.reconnectBaseMs;
      } catch (err) {
        logger.warn({ err }, 'ready handler partial error');
      }
    });

    c.on('disconnected', (reason) => {
      logger.warn({ reason }, 'client disconnected');
      state.transition('disconnected', { lastError: String(reason) });
      scheduleReconnect('disconnected');
    });

    c.on('message', async (msg) => {
      const key = msg.id?._serialized;
      if (key && inboundSeen.has(key)) return;
      if (key) inboundSeen.add(key);

      const fromJid = msg.from || '';
      const isGroup = fromJid.endsWith('@g.us');
      const isDM = fromJid.endsWith('@c.us') || fromJid.endsWith('@lid');

      // Resolve phone ANTES de persistir, pra gravar contact_phone e fazer whitelist check correto.
      // Para grupos, phone do autor individual (msg.author) ajudaria mas não é crítico pro fluxo de agente.
      let phone = null;
      if (isDM && !msg.fromMe) {
        phone = await resolvePhone(c, fromJid).catch(() => null);
      }

      const record = persistMessage(msg, 'in', { phone });
      if (record) onMessage?.('message.received', msg, record);

      if (msg.fromMe) return;

      // GRUPOS: só reagir quando marcado (mim ou Jefferson) ou em resposta a mensagem minha.
      if (isGroup) {
        const myNumber = c.info?.wid?.user || '';
        // Busca minha LID (@lid) dos meus próprios outbound recentes — algumas menções em grupo
        // usam LID, não @c.us. Cache simples em app_settings.
        let myLidUser = getAppSettingStmt.get('worker_lid_user')?.value || '';
        if (!myLidUser) {
          try {
            const row = db.prepare(
              `SELECT from_id FROM messages WHERE from_me=1 AND from_id LIKE '%@lid' ORDER BY id DESC LIMIT 1`
            ).get();
            if (row && row.from_id) {
              myLidUser = row.from_id.replace('@lid', '');
              setAppSettingStmt.run('worker_lid_user', myLidUser);
            }
          } catch (err) { /* ignore */ }
        }
        const mentionedIds = Array.isArray(msg.mentionedIds) ? msg.mentionedIds : [];
        const mentionedMe =
          (!!myNumber && mentionedIds.some((id) => String(id).includes(myNumber))) ||
          (!!myLidUser && mentionedIds.some((id) => String(id).includes(myLidUser)));
        const mentionedJefferson = mentionedIds.some((id) => String(id).includes('5511910075450'));
        let isReplyToMe = false;
        if (msg.hasQuotedMsg) {
          try {
            const q = await msg.getQuotedMessage();
            isReplyToMe = q?.fromMe === true;
          } catch {
            /* ignore */
          }
        }
        // Continuação de thread: se eu (bot) falei nesse grupo nos últimos 30min,
        // qualquer msg nova é considerada parte da conversa que abri, mesmo sem @mention/quote.
        // Isso resolve o caso "Zeus cobra Fulano no grupo X → Fulano responde sem quote → eu não vejo".
        let isThreadContinuation = false;
        try {
          const lastBot = db.prepare(
            `SELECT timestamp FROM messages WHERE chat_id = ? AND from_me = 1 ORDER BY id DESC LIMIT 1`
          ).get(chatId);
          if (lastBot && lastBot.timestamp) {
            const ms = Date.now() - new Date(lastBot.timestamp).getTime();
            if (ms < 30 * 60 * 1000) isThreadContinuation = true;
          }
        } catch { /* ignore */ }

        if (!mentionedMe && !mentionedJefferson && !isReplyToMe && !isThreadContinuation) return;

        const authorJid = msg.author || null;
        let authorPhone = null;
        if (authorJid) authorPhone = await resolvePhone(c, authorJid).catch(() => null);

        try {
          db.prepare(`UPDATE messages SET processed_by_agent = 0 WHERE message_id = ?`).run(key);
        } catch (err) {
          logger.warn({ err, key }, 'failed to mark group msg unprocessed');
        }

        return;
      }

      if (!isDM) return;
      // routeToAgent = whitelist técnica (Aldo/Jefferson/Daniel/Jeff/Luis) OU equipe autorizada
      // (contact_settings aprovado por Jefferson ou via grupo). Ambos disparam notify pra mim.
      const whitelisted = isWhitelistedPhone(phone) || isTeamAuthorizedPhone(phone);
      const isAudio = msg.type === 'ptt' || msg.type === 'audio';

      // Jefferson confirma "esse é o grupo da equipe" depois de me adicionar — fixa o JID oficial.
      if (phone === '5511910075450' && typeof msg.body === 'string') {
        const t = msg.body.toLowerCase();
        const matchesConfirm =
          /\besse[^.!?]*grupo[^.!?]*(?:d[ao]|de)\s+(?:equipe|time)\b/.test(t) ||
          /\beste[^.!?]*grupo[^.!?]*(?:d[ao]|de)\s+(?:equipe|time)\b/.test(t) ||
          /\bgrupo\s+(?:oficial\s+)?d[ao]\s+(?:equipe|time)\s+interna?\b/.test(t);
        if (matchesConfirm && lastSelfJoinedGroup.jid &&
            Date.now() - lastSelfJoinedGroup.ts < 30 * 60_000) {
          const jid = lastSelfJoinedGroup.jid;
          setTeamGroupJid(jid);
          logger.info({ jid }, 'internal team group JID registered by Jefferson confirmation');
          if (externalQueue) {
            externalQueue
              .enqueue({
                chat_id: '5511910075450@c.us',
                kind: 'text',
                payload: {
                  body:
                    `Confirmado. Grupo oficial da equipe = *${jid}*. ` +
                    `A partir de agora, quem entrar nesse grupo é autorizado automaticamente como equipe; quem sair, é revogado.`,
                },
                priority: 1,
              })
              .catch((err) => logger.warn({ err }, 'confirm team group enqueue failed'));
          }
        }
      }

      if (isAudio) {
        handleInboundAudio(msg, { fromJid, phone, whitelisted, queue: externalQueue }).catch((err) =>
          logger.error({ err, messageId: key }, 'audio pipeline failed')
        );
      } else if (msg.hasMedia && whitelisted) {
        handleInboundMedia(msg, { fromJid, phone, whitelisted, queue: externalQueue }).catch((err) =>
          logger.error({ err, messageId: key }, 'media pipeline failed')
        );
      } else if (whitelisted) {
        return;
      } else if (externalQueue) {
        // Fase 2: resposta via Anthropic API para não-whitelist (sujeito a panic/opt-out).
        apiReply
          .handleInbound({
            phone,
            fromJid,
            text: msg.body,
            queue: externalQueue,
            messageId: msg.id?._serialized || null,
            msgType: msg.type,
          })
          .catch((err) => logger.warn({ err, phone }, 'api reply rejected'));
      }
    });

    c.on('message_create', async (msg) => {
      if (!msg.fromMe) return;
      // Pro outbound, chat_id = msg.to. Resolve phone do destinatário.
      const toJid = msg.to || '';
      const isDM = toJid.endsWith('@c.us') || toJid.endsWith('@lid');
      let phone = null;
      if (isDM) phone = await resolvePhone(c, toJid).catch(() => null);
      const record = persistMessage(msg, 'out', { phone });
      if (record) onMessage?.('message.sent', msg, record);
    });

    c.on('message_ack', (msg, ack) => {
      try {
        updateAck.run({ ack, message_id: msg.id?._serialized });
        onMessage?.('message.ack', msg, { ack });
      } catch (err) {
        logger.warn({ err }, 'message_ack update failed');
      }
    });

    // Grupo interno da equipe (Jefferson 2026-04-24) — auto-autoriza quem entra, revoga quem sai.
    c.on('group_join', async (notification) => {
      try {
        const groupJid = notification.chatId;
        const recipients = Array.isArray(notification.recipientIds) ? notification.recipientIds : [];
        const myJid = c.info?.wid?._serialized || '';
        const myNumber = c.info?.wid?.user || '';

        const iWasAdded = recipients.some(
          (id) => String(id).includes(myNumber) || String(id) === myJid
        );
        if (iWasAdded) {
          lastSelfJoinedGroup = { jid: groupJid, ts: Date.now() };
          logger.info({ groupJid }, 'worker added to group; awaiting Jefferson confirmation');
          if (externalQueue) {
            await externalQueue
              .enqueue({
                chat_id: '5511910075450@c.us',
                kind: 'text',
                payload: {
                  body:
                    `Fui adicionado ao grupo *${groupJid}*. Se for o grupo oficial da equipe interna, ` +
                    `me responda aqui com *"esse é o grupo da equipe"* que eu fixo como oficial. ` +
                    `Depois disso, quem entrar no grupo é autorizado automaticamente como equipe.`,
                },
                priority: 2,
              })
              .catch((err) =>
                logger.warn({ err: String(err.message || err) }, 'notify jefferson on self-add failed')
              );
          }
          return;
        }

        // Alguém diferente de mim foi adicionado. É o grupo oficial da equipe?
        const teamJid = getTeamGroupJid();
        if (!teamJid || teamJid !== groupJid) return;

        for (const addedJid of recipients) {
          const phone = await resolvePhone(c, addedJid).catch(() => null);
          if (!phone) continue;
          if (isWhitelistedPhone(phone)) continue; // whitelist técnica já tem acesso pleno
          try {
            upsertContactSettingStmt.run({
              phone,
              enabled: 0,
              notes: `Autorizado por entrada no grupo oficial da equipe em ${new Date().toISOString()}`,
              set_by: 'team_group_auto',
            });
          } catch (err) {
            logger.warn({ err: String(err.message || err), phone }, 'upsert team_group_auto failed');
          }
          logger.info({ phone, groupJid }, 'team member auto-authorized by group join');
          if (externalQueue) {
            await externalQueue
              .enqueue({
                chat_id: '5511910075450@c.us',
                kind: 'text',
                payload: {
                  body:
                    `*Entrada no grupo da equipe*: phone ${phone} (jid ${addedJid}) ` +
                    `foi adicionado ao grupo oficial — autorizei automaticamente como equipe. ` +
                    `Se quiser ele na whitelist técnica (trigger automático pra mim) me avisa.`,
                },
                priority: 3,
              })
              .catch((err) =>
                logger.warn({ err: String(err.message || err) }, 'notify jefferson on group_join failed')
              );
          }
        }
      } catch (err) {
        logger.warn({ err: String(err.message || err) }, 'group_join handler failed');
      }
    });

    c.on('group_leave', async (notification) => {
      try {
        const groupJid = notification.chatId;
        const recipients = Array.isArray(notification.recipientIds) ? notification.recipientIds : [];
        const teamJid = getTeamGroupJid();
        if (!teamJid || teamJid !== groupJid) return;

        for (const removedJid of recipients) {
          const phone = await resolvePhone(c, removedJid).catch(() => null);
          if (!phone) continue;
          try {
            upsertContactSettingStmt.run({
              phone,
              enabled: 1,
              notes: `Revogado por saída do grupo oficial em ${new Date().toISOString()}`,
              set_by: 'team_group_auto_removed',
            });
          } catch (err) {
            logger.warn({ err: String(err.message || err), phone }, 'upsert team_group_auto_removed failed');
          }
          logger.info({ phone, groupJid }, 'team member auto-revoked by group leave');
          if (externalQueue) {
            await externalQueue
              .enqueue({
                chat_id: '5511910075450@c.us',
                kind: 'text',
                payload: {
                  body:
                    `*Saída do grupo da equipe*: phone ${phone} saiu (ou foi removido) do grupo oficial. ` +
                    `Revoguei o papel de equipe — volta a ser tratado como cliente pelo bot. ` +
                    `Se ele estava na whitelist técnica também, precisa ser removido manualmente do .env.`,
                },
                priority: 3,
              })
              .catch((err) =>
                logger.warn({ err: String(err.message || err) }, 'notify jefferson on group_leave failed')
              );
          }
        }
      } catch (err) {
        logger.warn({ err: String(err.message || err) }, 'group_leave handler failed');
      }
    });

    c.on('message_edit', (msg) => {
      onMessage?.('message.edit', msg);
    });
  }

  function build() {
    killZombieChrome();
    return new Client({
      authStrategy: new LocalAuth({
        clientId: config.clientId,
        dataPath: config.authPath,
      }),
      puppeteer: {
        headless: true,
        executablePath: config.chromiumPath,
        defaultViewport: { width: 1366, height: 768 },
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--disable-extensions',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process,AutomationControlled',
          '--disable-infobars',
          '--window-size=1366,768',
          '--lang=pt-BR,pt',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        ],
      },
      webVersionCache: { type: 'local' },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
  }

  async function init() {
    if (busy) return;
    busy = true;
    try {
      client = build();
      attachHandlers(client);
      await client.initialize();
    } catch (err) {
      logger.error({ err }, 'initialize failed');
      state.transition('disconnected', { lastError: String(err) });
      scheduleReconnect('initialize_error');
    } finally {
      busy = false;
    }
  }

  function scheduleReconnect(reason) {
    if (destroyed) return;
    if (reconnectTimer) return;
    const d = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, config.reconnectMaxMs);
    logger.warn({ reason, delayMs: d }, 'scheduling reconnect');
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      await destroyQuiet('reconnect');
      await init();
    }, d);
    reconnectTimer.unref?.();
  }

  async function destroyQuiet(reason) {
    if (!client) return;
    try {
      await client.destroy();
    } catch (err) {
      logger.warn({ err, reason }, 'client destroy error');
    }
    client = null;
  }

  async function recreate(reason) {
    logger.warn({ reason }, 'recreating client');
    await destroyQuiet(reason);
    reconnectDelay = config.reconnectBaseMs;
    await init();
  }

  async function shutdown() {
    destroyed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    await destroyQuiet('shutdown');
  }

  const watchdog = attachWatchdog({ state, recreate });

  return {
    state,
    setQueue: (q) => { externalQueue = q; },
    init: async () => {
      watchdog.start();
      await init();
    },
    shutdown: async () => {
      watchdog.stop();
      await shutdown();
    },
    getClient: () => client,
    recreate,
    snapshot: () => ({
      state: state.current,
      since: state.since,
      qr: state.qr,
      meNumber: state.meNumber,
      meName: state.meName,
      lastError: state.lastError,
    }),
    MessageMedia,
    normalizeForCompare,
  };
}

module.exports = { createWAManager };
