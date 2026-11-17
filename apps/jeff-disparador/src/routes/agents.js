'use strict';
const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../auth');
const { connectSlot, disconnectSlot, runtimeStatus } = require('../services/waManager');
const waLimite = require('/opt/jeff-apps/jeff-shared/wa-limite');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM agents ORDER BY slot').all();
  // merge runtime status
  const agents = rows.map(a => ({
    ...a,
    status: runtimeStatus.get(a.slot) || a.status,
  }));
  res.json({ agents });
});

router.get('/:slot', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const agent = db.prepare('SELECT * FROM agents WHERE slot = ?').get(slot);
  if (!agent) return res.status(404).json({ error: 'slot_not_found' });
  agent.status = runtimeStatus.get(slot) || agent.status;
  res.json({ agent });
});

router.post('/:slot/connect', async (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const agent = db.prepare('SELECT status FROM agents WHERE slot = ?').get(slot);
  if (!agent) return res.status(404).json({ error: 'slot_not_found' });
  // Limite base do Zeus: no máximo 3 WhatsApps contando o próprio Zeus. Slot que já ocupa vaga pode reconectar.
  if (!agent.status || agent.status === 'idle') {
    try {
      const lim = await waLimite.estado();
      if (lim.livres <= 0) return res.status(409).json({ error: 'limite_whatsapp', message: waLimite.mensagemLimite(lim), limite: lim.limite, usados: lim.usados });
    } catch (e) {
      return res.status(503).json({ error: 'limite_indisponivel', message: 'Não consegui conferir quantos WhatsApps já estão conectados. Tente de novo em instantes.' });
    }
  }
  connectSlot(slot);
  res.json({ ok: true, slot, message: 'connecting' });
});

router.post('/:slot/disconnect', async (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const agent = db.prepare('SELECT 1 FROM agents WHERE slot = ?').get(slot);
  if (!agent) return res.status(404).json({ error: 'slot_not_found' });
  await disconnectSlot(slot);
  res.json({ ok: true, slot, message: 'disconnected' });
});

router.patch('/:slot/label', (req, res) => {
  const slot = parseInt(req.params.slot, 10);
  const { label } = req.body || {};
  if (!label) return res.status(400).json({ error: 'missing_label' });
  db.prepare('UPDATE agents SET label = ?, updated_at = ? WHERE slot = ?').run(String(label).slice(0, 40), new Date().toISOString(), slot);
  res.json({ ok: true });
});

module.exports = router;
