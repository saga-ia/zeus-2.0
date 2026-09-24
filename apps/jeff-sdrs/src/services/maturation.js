'use strict';
const { db } = require('../db');
const { isReady, sendText, clients } = require('./waManager');

const PHRASES = [
  'oi tudo bem?',
  'e ai como voce esta?',
  'tô por aqui, e voce?',
  'que bom te ver por aqui',
  'trabalhando muito hoje?',
  'passando pra dar um oi',
  'ta tudo tranquilo por ai?',
  'sem novidades por aqui, e ai?',
  'depois a gente conversa direito',
  'te procuro mais tarde',
  'ta correndo tudo bem?',
  'fica na paz',
  'bora marcar uma call qualquer dia',
  'tudo certo amigo, valeu',
  'boa semana pra voce',
];

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let loopActive = false;

async function runOnce() {
  const cfg = db.prepare('SELECT * FROM maturation_config WHERE id = 1').get();
  if (!cfg || !cfg.enabled) return;
  const readySlots = [];
  for (const row of db.prepare('SELECT slot, phone FROM sdrs WHERE status = ?').all('ready')) {
    if (isReady(row.slot) && row.phone) readySlots.push(row);
  }
  if (readySlots.length < 2) return;

  const enabledMap = new Map();
  for (const row of db.prepare('SELECT slot, enabled, sessions_today, last_session_at FROM maturation_status').all()) {
    enabledMap.set(row.slot, row);
  }

  const eligible = readySlots.filter(s => {
    const st = enabledMap.get(s.slot);
    if (!st || !st.enabled) return false;
    if ((st.sessions_today || 0) >= cfg.daily_max_sessions) return false;
    return true;
  });
  if (eligible.length < 2) return;

  const shuffled = eligible.sort(() => Math.random() - 0.5);
  const a = shuffled[0];
  const b = shuffled[1];

  const turns = randInt(cfg.min_turns, cfg.max_turns);

  const info = db.prepare(`INSERT INTO maturation_session (slot_a, slot_b, turns, status, started_at)
                           VALUES (?, ?, ?, 'running', ?)`).run(a.slot, b.slot, turns, new Date().toISOString());
  const sessionId = info.lastInsertRowid;

  let from = a, to = b;
  for (let i = 0; i < turns; i++) {
    const phrase = PHRASES[Math.floor(Math.random() * PHRASES.length)];
    try {
      await sendText(from.slot, to.phone, phrase);
      db.prepare('INSERT INTO maturation_log (session_id, from_slot, to_slot, body) VALUES (?, ?, ?, ?)')
        .run(sessionId, from.slot, to.slot, phrase);
    } catch (e) {
      db.prepare("UPDATE maturation_session SET status = 'failed', finished_at = ? WHERE id = ?")
        .run(new Date().toISOString(), sessionId);
      return;
    }
    await sleep(randInt(cfg.min_delay_seconds, cfg.max_delay_seconds) * 1000);
    [from, to] = [to, from];
  }

  db.prepare("UPDATE maturation_session SET status = 'done', finished_at = ? WHERE id = ?")
    .run(new Date().toISOString(), sessionId);

  const now = new Date().toISOString();
  db.prepare(`INSERT INTO maturation_status (slot, enabled, last_session_at, sessions_today) VALUES (?, 1, ?, 1)
              ON CONFLICT(slot) DO UPDATE SET last_session_at = ?, sessions_today = sessions_today + 1`)
    .run(a.slot, now, now);
  db.prepare(`INSERT INTO maturation_status (slot, enabled, last_session_at, sessions_today) VALUES (?, 1, ?, 1)
              ON CONFLICT(slot) DO UPDATE SET last_session_at = ?, sessions_today = sessions_today + 1`)
    .run(b.slot, now, now);
}

function resetDailyCounters() {
  db.prepare('UPDATE maturation_status SET sessions_today = 0').run();
}

async function loop() {
  loopActive = true;
  let lastReset = new Date().toDateString();
  while (loopActive) {
    try {
      const today = new Date().toDateString();
      if (today !== lastReset) { resetDailyCounters(); lastReset = today; }
      await runOnce();
    } catch (e) {
      console.error('[maturation] loop error:', e.message);
    }
    await sleep(60 * 1000);
  }
}

function start() { if (!loopActive) loop().catch(e => console.error('[maturation] fatal', e)); }

module.exports = { start };
