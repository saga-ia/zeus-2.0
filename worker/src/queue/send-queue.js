const crypto = require('node:crypto');
const { db } = require('../db');
const logger = require('../logger');
const { config } = require('../config');
const { typingMsFor, simulate, sleep } = require('../wa/typing');
const { TimedSet } = require('../wa/dedupe');
const { digits } = require('../utils/jid');
const { MessageMedia } = require('whatsapp-web.js');

const selectLidByPhone = db.prepare(`SELECT lid FROM contact_aliases WHERE phone = ? AND lid IS NOT NULL LIMIT 1`);

const SEND_TIMEOUT_MS = 45_000;

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

const stmt = {
  enqueue: db.prepare(`
    INSERT INTO send_queue (chat_id, kind, payload, priority, content_hash, scheduled_for)
    VALUES (@chat_id, @kind, @payload, @priority, @content_hash, @scheduled_for)
  `),
  recoverStuck: db.prepare(`
    UPDATE send_queue SET status='pending' WHERE status='sending'
  `),
  pickNext: db.prepare(`
    SELECT * FROM send_queue
    WHERE status = 'pending'
      AND (scheduled_for IS NULL OR scheduled_for <= datetime('now'))
    ORDER BY priority ASC, id ASC
    LIMIT 1
  `),
  markSending: db.prepare(`UPDATE send_queue SET status='sending' WHERE id = ?`),
  markSent: db.prepare(`
    UPDATE send_queue SET status='sent', sent_at = datetime('now') WHERE id = ?
  `),
  markError: db.prepare(`
    UPDATE send_queue SET status='pending', retry_count = retry_count + 1,
      error = @error, scheduled_for = @scheduled_for
    WHERE id = @id
  `),
  markDead: db.prepare(`UPDATE send_queue SET status='error', error = @error WHERE id = @id`),
  counts: db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END), 0) AS pending,
      COALESCE(SUM(CASE WHEN status='sending' THEN 1 ELSE 0 END), 0) AS sending,
      COALESCE(SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END), 0) AS sent,
      COALESCE(SUM(CASE WHEN status='error' THEN 1 ELSE 0 END), 0) AS error
    FROM send_queue
  `),
  flushPending: db.prepare(`UPDATE send_queue SET status='error', error='flushed' WHERE status='pending'`),
};

function hashPayload(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
}

function sample(min, max) {
  return Math.floor(min + Math.random() * (max - min));
}

function createQueue({ wa }) {
  let running = false;
  let lastSendAt = 0;
  const burstLog = [];
  const recentHashes = new TimedSet(60_000);
  const MAX_RETRY = 3;

  const recovered = stmt.recoverStuck.run();
  if (recovered.changes > 0) {
    logger.warn({ recovered: recovered.changes }, 'queue: recovered stuck sending items to pending');
  }

  async function enqueue({ chat_id, kind, payload, priority = 5, dedupe = true, scheduled_for = null }) {
    const content_hash = hashPayload({ chat_id, kind, payload });
    if (dedupe && recentHashes.has(content_hash)) {
      logger.warn({ chat_id, kind }, 'queue: duplicate content, skipping');
      return { ok: false, reason: 'duplicate' };
    }
    const info = stmt.enqueue.run({
      chat_id,
      kind,
      payload: JSON.stringify(payload || {}),
      priority,
      content_hash,
      scheduled_for,
    });
    return { ok: true, id: info.lastInsertRowid };
  }

  function pruneBurst() {
    const cutoff = Date.now() - config.sendBurstWindowMs;
    while (burstLog.length && burstLog[0] < cutoff) burstLog.shift();
  }

  function counts() {
    return stmt.counts.get();
  }

  function size() {
    return counts().pending || 0;
  }

  function flush() {
    return stmt.flushPending.run();
  }

  async function processOne(item) {
    const client = wa.getClient();
    if (!client || wa.state.current !== 'ready') {
      throw new Error(`client not ready (state=${wa.state.current})`);
    }
    const payload = JSON.parse(item.payload || '{}');
    let chatId = item.chat_id;

    // Resolve @c.us → proper wid (LID-aware) to avoid "No LID for user" on cold contacts.
    if (typeof chatId === 'string' && chatId.endsWith('@c.us')) {
      const phone = digits(chatId.split('@')[0]);
      // 1) prefer known LID from contact_aliases (covers cold/non-saved numbers we've seen before).
      let resolved = null;
      try {
        const row = phone ? selectLidByPhone.get(phone) : null;
        if (row && row.lid) resolved = row.lid;
      } catch {}
      // 2) fallback: ask whatsapp-web.js.
      if (!resolved) {
        try {
          const nid = await withTimeout(client.getNumberId(chatId.split('@')[0]), 10_000, 'getNumberId');
          if (nid && nid._serialized) resolved = nid._serialized;
        } catch {}
      }
      if (resolved && resolved !== chatId) chatId = resolved;
    }

    stmt.markSending.run(item.id);

    // Typing simulation (text only, short lead).
    let chat = null;
    try {
      chat = await withTimeout(client.getChatById(chatId), 10_000, 'getChatById');
    } catch {
      chat = null;
    }

    if (item.kind === 'text' && chat && payload.typing !== false) {
      await withTimeout(simulate(chat, typingMsFor(payload.body || '')), 15_000, 'typing').catch(() => {});
    }

    let resp;
    switch (item.kind) {
      case 'text':
        resp = await withTimeout(
          client.sendMessage(chatId, payload.body || '', { sendSeen: false }),
          SEND_TIMEOUT_MS,
          'sendMessage(text)'
        );
        break;
      case 'media': {
        const media = payload.base64
          ? new MessageMedia(payload.mimetype || 'application/octet-stream', payload.base64, payload.filename)
          : await MessageMedia.fromUrl(payload.url, { unsafeMime: true });
        resp = await client.sendMessage(chatId, media, {
          caption: payload.caption || undefined,
          sendSeen: false,
        });
        break;
      }
      case 'audio': {
        const media = payload.base64
          ? new MessageMedia(payload.mimetype || 'audio/ogg', payload.base64, payload.filename || 'audio.ogg')
          : await MessageMedia.fromUrl(payload.url, { unsafeMime: true });
        resp = await client.sendMessage(chatId, media, {
          sendAudioAsVoice: payload.asPtt !== false,
          sendSeen: false,
        });
        break;
      }
      case 'reply': {
        resp = await client.sendMessage(chatId, payload.body || '', {
          quotedMessageId: payload.quotedMessageId,
          sendSeen: false,
        });
        break;
      }
      case 'react': {
        const msg = await client.getMessageById(payload.messageId);
        resp = await msg.react(payload.emoji || '');
        break;
      }
      case 'group_action': {
        const g = await client.getChatById(chatId);
        if (!g.isGroup) throw new Error('not a group');
        const { op, args = {} } = payload;
        switch (op) {
          case 'setSubject':
            resp = await g.setSubject(args.name);
            break;
          case 'setDescription':
            resp = await g.setDescription(args.description);
            break;
          case 'addParticipants':
            resp = await g.addParticipants(args.participants);
            break;
          case 'removeParticipants':
            resp = await g.removeParticipants(args.participants);
            break;
          case 'promoteParticipants':
            resp = await g.promoteParticipants(args.participants);
            break;
          case 'demoteParticipants':
            resp = await g.demoteParticipants(args.participants);
            break;
          default:
            throw new Error(`unknown group op ${op}`);
        }
        break;
      }
      case 'mark_read': {
        const c = await client.getChatById(chatId);
        resp = await c.sendSeen();
        break;
      }
      default:
        throw new Error(`unknown kind ${item.kind}`);
    }

    stmt.markSent.run(item.id);
    lastSendAt = Date.now();
    burstLog.push(lastSendAt);
    return resp;
  }

  async function loop() {
    while (running) {
      try {
        if (wa.state.current !== 'ready') {
          await sleep(1000);
          continue;
        }
        pruneBurst();
        if (burstLog.length >= config.sendBurstLimit) {
          logger.warn({ burst: burstLog.length }, 'queue: burst cap reached, cooling down 60s');
          await sleep(60000);
          continue;
        }
        const gap = sample(config.sendMinDelayMs, config.sendMaxDelayMs);
        const since = Date.now() - lastSendAt;
        if (since < gap) await sleep(gap - since);

        const item = stmt.pickNext.get();
        if (!item) {
          await sleep(800);
          continue;
        }
        try {
          await processOne(item);
        } catch (err) {
          const retry = item.retry_count + 1;
          if (retry > MAX_RETRY) {
            stmt.markDead.run({ id: item.id, error: String(err && err.message || err) });
            logger.error({ id: item.id, err }, 'queue: giving up');
          } else {
            const backoff = Math.min(30000 * Math.pow(2, retry - 1), 300000);
            stmt.markError.run({
              id: item.id,
              error: String(err && err.message || err),
              scheduled_for: new Date(Date.now() + backoff).toISOString().replace('T', ' ').slice(0, 19),
            });
            logger.warn({ id: item.id, retry, backoff, err: err.message }, 'queue: retry scheduled');
          }
        }
      } catch (err) {
        logger.error({ err }, 'queue loop error');
        await sleep(1500);
      }
    }
  }

  function start() {
    if (running) return;
    running = true;
    loop().catch((err) => logger.error({ err }, 'queue loop crashed'));
  }

  function stop() {
    running = false;
  }

  return { enqueue, start, stop, size, counts, flush };
}

module.exports = { createQueue };
