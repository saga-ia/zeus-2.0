'use strict';
// Debouncer de mensagens recebidas. Junta rajadas (cliente manda 3 audios seguidos)
// e chama processConversation apenas 1x quando parar de digitar OU estourar maxWait.
//
// API:
//   onMessage(slot, chatId, msg)          -> agenda/reset timer, adiciona ao buffer
//   onPresenceChange(slot, chatId, state) -> 'composing' | 'available' | 'unavailable' | 'recording' | 'paused'
//   flush(slot, chatId)                    -> for permanente cancela e roda agora
//
// Config:
//   BASE_DEBOUNCE_MS: 30_000  (quando NAO tem presence support)
//   FAST_DEBOUNCE_MS: 8_000   (depois de "paused/available" com presence support)
//   TYPING_DEBOUNCE_MS: 45_000 (enquanto ta "composing")
//   MAX_WAIT_MS: 180_000      (hard cap)

const BASE_DEBOUNCE_MS = 30_000;
const FAST_DEBOUNCE_MS = 8_000;
const TYPING_DEBOUNCE_MS = 45_000;
const MAX_WAIT_MS = 180_000;

const buckets = new Map(); // key = `${slot}:${chatId}` -> bucket

let processor = null;      // (slot, chatId, msgs) => Promise
let presenceSupported = false;

function setProcessor(fn) { processor = fn; }
function setPresenceSupported(v) { presenceSupported = !!v; }
function isPresenceSupported() { return presenceSupported; }

function bucketKey(slot, chatId) { return `${slot}:${chatId}`; }

function getBucket(slot, chatId) {
  const k = bucketKey(slot, chatId);
  let b = buckets.get(k);
  if (!b) {
    b = {
      slot, chatId,
      buffer: [],
      timer: null,
      isTyping: false,
      processing: false,
      firstAt: 0,
      lastActivityAt: 0,
      abort: null,
    };
    buckets.set(k, b);
  }
  return b;
}

function clearBucket(slot, chatId) {
  const k = bucketKey(slot, chatId);
  const b = buckets.get(k);
  if (b && b.timer) clearTimeout(b.timer);
  buckets.delete(k);
}

function scheduleFire(bucket, ms) {
  if (bucket.timer) clearTimeout(bucket.timer);
  // respeita MAX_WAIT_MS
  const elapsed = Date.now() - bucket.firstAt;
  const remainingCap = Math.max(0, MAX_WAIT_MS - elapsed);
  const finalMs = Math.min(ms, remainingCap);
  bucket.timer = setTimeout(() => fire(bucket).catch(e => console.error('[debouncer] fire err:', e && e.message)), finalMs);
}

async function fire(bucket) {
  if (!processor) {
    console.warn('[debouncer] processor nao registrado, descartando buffer');
    clearBucket(bucket.slot, bucket.chatId);
    return;
  }
  if (bucket.processing) return;
  if (!bucket.buffer.length) { clearBucket(bucket.slot, bucket.chatId); return; }
  bucket.processing = true;
  const msgs = bucket.buffer.slice();
  bucket.buffer = [];
  try {
    await processor(bucket.slot, bucket.chatId, msgs);
  } catch (e) {
    console.error(`[debouncer] processor err slot=${bucket.slot} chat=${bucket.chatId}:`, e && e.message);
  } finally {
    bucket.processing = false;
    // se chegou mais msg durante processamento, reagenda
    if (bucket.buffer.length) {
      scheduleFire(bucket, BASE_DEBOUNCE_MS);
    } else {
      clearBucket(bucket.slot, bucket.chatId);
    }
  }
}

function onMessage(slot, chatId, msg) {
  const b = getBucket(slot, chatId);
  if (b.firstAt === 0) b.firstAt = Date.now();
  b.lastActivityAt = Date.now();
  b.buffer.push(msg);
  // Se ta digitando, espera mais. Se nao, base debounce.
  const wait = b.isTyping ? TYPING_DEBOUNCE_MS : BASE_DEBOUNCE_MS;
  scheduleFire(b, wait);
}

function onPresenceChange(slot, chatId, state) {
  const k = bucketKey(slot, chatId);
  const b = buckets.get(k);
  if (!b) return; // ninguem esperando, ignora
  const s = String(state || '').toLowerCase();
  if (s === 'composing' || s === 'recording') {
    b.isTyping = true;
    scheduleFire(b, TYPING_DEBOUNCE_MS);
  } else if (s === 'paused' || s === 'available' || s === 'unavailable') {
    if (b.isTyping) {
      b.isTyping = false;
      // parou de digitar -> corre pra responder
      scheduleFire(b, FAST_DEBOUNCE_MS);
    }
  }
}

function flush(slot, chatId) {
  const k = bucketKey(slot, chatId);
  const b = buckets.get(k);
  if (b) fire(b).catch(() => {});
}

function stats() {
  return { buckets: buckets.size, presenceSupported };
}

// Bypass do debouncer: chama o processor com msgs sinteticas imediatamente.
// Usado pelo replay de conversas travadas (nao passa por buffer/timer).
async function processNow(slot, chatId, msgs) {
  if (!processor) throw new Error('processor_nao_registrado');
  return processor(slot, chatId, msgs);
}

module.exports = {
  setProcessor,
  setPresenceSupported,
  isPresenceSupported,
  onMessage,
  onPresenceChange,
  flush,
  processNow,
  stats,
  BASE_DEBOUNCE_MS,
  MAX_WAIT_MS,
};
