'use strict';
const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../auth');
const { connectSlot, disconnectSlot, runtimeStatus, sendText, requestPairingCodeForSlot, reconnectSlot, resetWelcomeCache, replayStuckForSlot, syncMissedInboundForSlot } = require('../services/waManager');

const router = express.Router();
router.use(requireAuth);

// Replay: reprocessa conversas onde o cliente falou por ultimo e nao teve resposta
// (vitimas de daily_limit ou worker offline). Nao debounca, dispara direto.
// Sync: puxa historico do WhatsApp Web (via client.getChats) pros chats disparados
// e insere no DB msgs do cliente que ficaram perdidas (chegaram durante Chrome offline).
// Depois nao roda replay automatico — chame /replay-stuck separado se quiser responder.
router.post('/:slot/sync-inbound', async (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  if (!slot) return res.status(400).json({ error: 'slot_invalido' });
  try {
    const out = await syncMissedInboundForSlot(slot);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'sync_fail', detail: e && e.message });
  }
});

// Inject: simula uma msg recebida do cliente (chatId+body). Salva no DB e roda o
// pipeline. Uso: recuperar msgs entregues durante offline do Chrome que nao chegaram
// via handler on('message'). Jeff cola o texto do WhatsApp e o bot responde.
router.post('/:slot/inject-inbound', async (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  if (!slot) return res.status(400).json({ error: 'slot_invalido' });
  const { chatId, text } = req.body || {};
  if (!chatId || !text) return res.status(400).json({ error: 'faltam chatId ou text' });
  try {
    const ts = Math.floor(Date.now() / 1000);
    db.prepare(`INSERT INTO messages (slot, chat_id, wa_message_id, from_me, body, ts, type)
                VALUES (?, ?, ?, 0, ?, ?, 'chat')`).run(slot, chatId, null, String(text), ts);
    const { replayStuckForSlot } = require('../services/waManager');
    // Reusa o replay que ja faz o certo: pega msgs from_me=0 desde a ultima resposta do bot.
    const out = await replayStuckForSlot(slot, { hoursBack: 24 });
    res.json({ ok: true, injected: { chatId, text }, replay: out });
  } catch (e) {
    res.status(500).json({ error: 'inject_fail', detail: e && e.message });
  }
});

router.post('/:slot/replay-stuck', async (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  if (!slot) return res.status(400).json({ error: 'slot_invalido' });
  const hoursBack = Math.min(72, Math.max(1, Number(req.body && req.body.hoursBack) || 12));
  try {
    const out = await replayStuckForSlot(slot, { hoursBack });
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(500).json({ error: 'replay_fail', detail: e && e.message });
  }
});

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM sdrs ORDER BY slot').all();
  const stateRows = db.prepare('SELECT slot, dispatch_running, paused_until, started_at, paused_at FROM slot_dispatch_state').all();
  const jobRows = db.prepare(`SELECT slot, status, COUNT(*) as n FROM slot_upload_job GROUP BY slot, status`).all();
  const stateBy = new Map(stateRows.map(r => [r.slot, r]));
  const nowSec = Math.floor(Date.now() / 1000);
  const sdrs = rows.map(s => {
    const st = stateBy.get(s.slot) || {};
    const counts = { pending: 0, sent: 0, error: 0 };
    for (const j of jobRows) if (j.slot === s.slot) counts[j.status] = j.n;
    return {
      ...s,
      status: runtimeStatus.get(s.slot) || s.status,
      dispatch_running: st.dispatch_running || 0,
      dispatch_paused_until: st.paused_until || 0,
      dispatch_paused_now: (st.paused_until || 0) > nowSec ? 1 : 0,
      dispatch_started_at: st.started_at || null,
      dispatch_paused_at: st.paused_at || null,
      upload_pending: counts.pending || 0,
      upload_sent: counts.sent || 0,
      upload_error: counts.error || 0,
    };
  });
  res.json({ sdrs });
});

router.get('/:slot', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const sdr = db.prepare('SELECT * FROM sdrs WHERE slot = ?').get(slot);
  if (!sdr) return res.status(404).json({ error: 'slot_not_found' });
  sdr.status = runtimeStatus.get(slot) || sdr.status;
  res.json({ sdr });
});

router.post('/:slot/connect', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const sdr = db.prepare('SELECT 1 FROM sdrs WHERE slot = ?').get(slot);
  if (!sdr) return res.status(404).json({ error: 'slot_not_found' });
  connectSlot(slot);
  res.json({ ok: true, slot, message: 'connecting' });
});

router.post('/:slot/disconnect', async (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const sdr = db.prepare('SELECT 1 FROM sdrs WHERE slot = ?').get(slot);
  if (!sdr) return res.status(404).json({ error: 'slot_not_found' });
  await disconnectSlot(slot);
  res.json({ ok: true, slot, message: 'disconnected' });
});

router.patch('/:slot', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const { name, role_label } = req.body || {};
  db.prepare('UPDATE sdrs SET name = COALESCE(?, name), role_label = COALESCE(?, role_label), updated_at = ? WHERE slot = ?')
    .run(name != null ? String(name).slice(0, 60) : null,
         role_label != null ? String(role_label).slice(0, 60) : null,
         new Date().toISOString(), slot);
  res.json({ ok: true });
});

router.post('/:slot/toggle-active', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const sdr = db.prepare('SELECT ai_active FROM sdrs WHERE slot = ?').get(slot);
  if (!sdr) return res.status(404).json({ error: 'slot_not_found' });
  const next = sdr.ai_active ? 0 : 1;
  db.prepare('UPDATE sdrs SET ai_active = ?, updated_at = ? WHERE slot = ?')
    .run(next, new Date().toISOString(), slot);
  res.json({ ok: true, slot, ai_active: next });
});

router.post('/:slot/zeus-mode', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const { enabled } = req.body || {};
  const sdr = db.prepare('SELECT 1 FROM sdrs WHERE slot = ?').get(slot);
  if (!sdr) return res.status(404).json({ error: 'slot_not_found' });
  const next = enabled ? 1 : 0;
  const now = new Date().toISOString();
  db.prepare('UPDATE sdrs SET zeus_mode = ?, zeus_mode_at = ?, updated_at = ? WHERE slot = ?')
    .run(next, next ? now : null, now, slot);
  res.json({ ok: true, slot, zeus_mode: next });
});

router.post('/:slot/pair-code', async (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const { phone, force } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'missing_phone' });
  const sdr = db.prepare('SELECT 1 FROM sdrs WHERE slot = ?').get(slot);
  if (!sdr) return res.status(404).json({ error: 'slot_not_found' });
  try {
    const code = await requestPairingCodeForSlot(slot, phone, !!force);
    res.json({ ok: true, slot, code, message: code ? 'code_ready' : 'starting_session' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:slot/reconnect', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const sdr = db.prepare('SELECT 1 FROM sdrs WHERE slot = ?').get(slot);
  if (!sdr) return res.status(404).json({ error: 'slot_not_found' });
  reconnectSlot(slot);
  res.json({ ok: true, slot, message: 'restarting' });
});

router.get('/:slot/instructions', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const row = db.prepare('SELECT slot, name, role_label, instructions, instructions_updated_at FROM sdrs WHERE slot = ?').get(slot);
  if (!row) return res.status(404).json({ error: 'slot_not_found' });
  res.json({ sdr: row });
});

router.put('/:slot/instructions', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const { instructions } = req.body || {};
  const sdr = db.prepare('SELECT 1 FROM sdrs WHERE slot = ?').get(slot);
  if (!sdr) return res.status(404).json({ error: 'slot_not_found' });
  const text = instructions == null ? null : String(instructions).slice(0, 20000);
  const now = new Date().toISOString();
  db.prepare('UPDATE sdrs SET instructions = ?, instructions_updated_at = ?, updated_at = ? WHERE slot = ?')
    .run(text, now, now, slot);
  res.json({ ok: true });
});

router.post('/:slot/dispatch/start', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const sdr = db.prepare('SELECT sdr_mode, ai_active FROM sdrs WHERE slot = ?').get(slot);
  if (!sdr) return res.status(404).json({ error: 'slot_not_found' });
  // Validação: modo ativo PRECISA ter mensagem de disparo, modo receptivo precisa do ai_active ativo.
  if (sdr.sdr_mode === 'ativo') {
    const msg = db.prepare('SELECT 1 FROM slot_dispatch_messages WHERE slot = ? LIMIT 1').get(slot);
    if (!msg) return res.status(400).json({ error: 'sem_mensagem_disparo', msg: 'Configure uma mensagem de disparo para este slot antes de iniciar.' });
  }
  const now = new Date().toISOString();
  db.prepare('UPDATE sdrs SET ai_active = 1, updated_at = ? WHERE slot = ?').run(now, slot);
  // dispatch_running so importa em modo ativo (o processUploadJobs le esse flag).
  // Em modo receptivo, marcar como running serve de indicador visual de que o SDR esta operando.
  db.prepare(`INSERT INTO slot_dispatch_state (slot, next_message_index, sent_since_pause, paused_until, dispatch_running, started_at, updated_at)
              VALUES (?, 0, 0, 0, 1, ?, ?)
              ON CONFLICT(slot) DO UPDATE SET dispatch_running = 1, paused_until = 0, started_at = ?, updated_at = ?`)
    .run(slot, now, now, now, now);
  res.json({ ok: true, slot, dispatch_running: 1, sdr_mode: sdr.sdr_mode });
});

router.post('/:slot/dispatch/reset-queue', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const sdr = db.prepare('SELECT 1 FROM sdrs WHERE slot = ?').get(slot);
  if (!sdr) return res.status(404).json({ error: 'slot_not_found' });
  const info = db.prepare(`UPDATE slot_upload_job SET status = 'pending', sent_at = NULL, error = NULL
                           WHERE slot = ? AND status IN ('sent','error')`).run(slot);
  db.prepare(`UPDATE slot_dispatch_state SET next_message_index = 0, sent_since_pause = 0, paused_until = 0, updated_at = ?
              WHERE slot = ?`).run(new Date().toISOString(), slot);
  res.json({ ok: true, slot, reset: info.changes });
});

router.post('/:slot/dispatch/pause', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const sdr = db.prepare('SELECT 1 FROM sdrs WHERE slot = ?').get(slot);
  if (!sdr) return res.status(404).json({ error: 'slot_not_found' });
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO slot_dispatch_state (slot, next_message_index, sent_since_pause, paused_until, dispatch_running, paused_at, updated_at)
              VALUES (?, 0, 0, 0, 0, ?, ?)
              ON CONFLICT(slot) DO UPDATE SET dispatch_running = 0, paused_at = ?, updated_at = ?`)
    .run(slot, now, now, now, now);
  res.json({ ok: true, slot, dispatch_running: 0 });
});

// Reset de memoria interna do agente por slot (Jeff, 2026-07-21).
// APAGA (so do slot em questao):
//   - messages, conversations (historico interno; nao afeta WhatsApp do cliente)
//   - contact_slot_binding (libera dedupe pra mesma lista poder ser redisparada)
//   - ai_interactions (log de chamadas ao LLM)
//   - slot_upload_job com status IN ('sent','duplicate','error') — pending fica preservado
//   - reset de slot_dispatch_state (sent_since_pause=0, paused_until=0, last cursor)
//   - welcomedInMemory (Set em memoria do waManager)
// NAO APAGA: sdrs (config), slot_dispatch_messages (templates), sessions/, media/,
// slot_triggers, contact_settings (regra de ouro 11910075450 intocada).
router.post('/:slot/reset-memory', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const sdr = db.prepare('SELECT 1 FROM sdrs WHERE slot = ?').get(slot);
  if (!sdr) return res.status(404).json({ error: 'slot_not_found' });

  const tx = db.transaction((s) => {
    const rMessages = db.prepare('DELETE FROM messages WHERE slot = ?').run(s);
    const rConversations = db.prepare('DELETE FROM conversations WHERE slot = ?').run(s);
    const rBindings = db.prepare('DELETE FROM contact_slot_binding WHERE slot = ?').run(s);
    const rInteractions = db.prepare('DELETE FROM ai_interactions WHERE slot = ?').run(s);
    // Preserva jobs 'pending' (disparo em andamento nao pode ser destruido).
    const rJobs = db.prepare(`DELETE FROM slot_upload_job WHERE slot = ? AND status IN ('sent','duplicate','error')`).run(s);
    db.prepare(`UPDATE slot_dispatch_state
                SET next_message_index = 0, sent_since_pause = 0, paused_until = 0, updated_at = ?
                WHERE slot = ?`).run(new Date().toISOString(), s);
    return {
      messages: rMessages.changes,
      conversations: rConversations.changes,
      bindings: rBindings.changes,
      interactions: rInteractions.changes,
      jobs: rJobs.changes,
    };
  });

  let deleted;
  try {
    deleted = tx(slot);
  } catch (e) {
    return res.status(500).json({ error: 'reset_failed', detail: e.message });
  }

  // Fora da transacao: limpa cache em memoria do welcome pra esse slot.
  let welcome = 0;
  try { welcome = resetWelcomeCache(slot) || 0; } catch {}
  deleted.welcome_cache = welcome;

  res.json({ ok: true, slot, deleted });
});

router.post('/:slot/send', async (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const { to, body } = req.body || {};
  if (!to || !body) return res.status(400).json({ error: 'missing_fields' });
  try {
    await sendText(slot, String(to), String(body));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
