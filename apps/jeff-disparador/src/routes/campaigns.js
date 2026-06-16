'use strict';
const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../auth');
const dispatcher = require('../services/dispatcher');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all();
  res.json({ campaigns });
});

router.post('/', (req, res) => {
  const { name, message, message_variants, agent_slots, delay_min, delay_max } = req.body || {};
  if (!name || !message) return res.status(400).json({ error: 'name and message required' });
  if (!agent_slots || !Array.isArray(agent_slots) || agent_slots.length === 0)
    return res.status(400).json({ error: 'agent_slots required (array of ints)' });

  const slotsJson = JSON.stringify(agent_slots.map(Number));
  const variantsJson = message_variants ? JSON.stringify(message_variants) : null;
  const result = db.prepare(
    'INSERT INTO campaigns (name, message, message_variants, agent_slots, delay_min, delay_max, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(name, message, variantsJson, slotsJson, delay_min || 30, delay_max || 60, 'draft', req.user.username);

  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  if (!campaign) return res.status(404).json({ error: 'not_found' });
  const total = db.prepare('SELECT COUNT(*) AS n FROM recipients WHERE campaign_id = ?').get(id).n;
  const byStatus = db.prepare('SELECT status, COUNT(*) AS n FROM recipients WHERE campaign_id = ? GROUP BY status').all(id);
  res.json({ campaign: { ...campaign, recipient_counts: { total, ...Object.fromEntries(byStatus.map(r => [r.status, r.n])) } } });
});

router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const campaign = db.prepare('SELECT status FROM campaigns WHERE id = ?').get(id);
  if (!campaign) return res.status(404).json({ error: 'not_found' });
  if (campaign.status === 'running') return res.status(409).json({ error: 'cannot edit running campaign' });

  const { name, message, message_variants, agent_slots, delay_min, delay_max } = req.body || {};
  const updates = [];
  const vals = [];
  if (name) { updates.push('name = ?'); vals.push(name); }
  if (message) { updates.push('message = ?'); vals.push(message); }
  if (message_variants !== undefined) { updates.push('message_variants = ?'); vals.push(JSON.stringify(message_variants)); }
  if (agent_slots) { updates.push('agent_slots = ?'); vals.push(JSON.stringify(agent_slots.map(Number))); }
  if (delay_min !== undefined) { updates.push('delay_min = ?'); vals.push(delay_min); }
  if (delay_max !== undefined) { updates.push('delay_max = ?'); vals.push(delay_max); }
  if (!updates.length) return res.status(400).json({ error: 'nothing to update' });

  db.prepare(`UPDATE campaigns SET ${updates.join(', ')} WHERE id = ?`).run(...vals, id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const campaign = db.prepare('SELECT status FROM campaigns WHERE id = ?').get(id);
  if (!campaign) return res.status(404).json({ error: 'not_found' });
  if (campaign.status === 'running') return res.status(409).json({ error: 'stop campaign first' });
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
  res.json({ ok: true });
});

router.post('/:id/start', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  if (!campaign) return res.status(404).json({ error: 'not_found' });
  if (campaign.status === 'running') return res.status(409).json({ error: 'already_running' });

  const pending = db.prepare("SELECT COUNT(*) AS n FROM recipients WHERE campaign_id = ? AND status = 'pending'").get(id).n;
  if (pending === 0) return res.status(400).json({ error: 'no pending recipients' });

  try {
    await dispatcher.startCampaign(id);
    res.json({ ok: true, message: 'campaign started' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/pause', (req, res) => {
  const id = parseInt(req.params.id, 10);
  dispatcher.pauseCampaign(id);
  res.json({ ok: true });
});

router.post('/:id/resume', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await dispatcher.startCampaign(id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/progress', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const campaign = db.prepare('SELECT status, total, sent, failed FROM campaigns WHERE id = ?').get(id);
  if (!campaign) return res.status(404).json({ error: 'not_found' });
  const byStatus = db.prepare('SELECT status, COUNT(*) AS n FROM recipients WHERE campaign_id = ? GROUP BY status').all(id);
  res.json({ ...campaign, counts: Object.fromEntries(byStatus.map(r => [r.status, r.n])) });
});

router.get('/:id/logs', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
  const offset = parseInt(req.query.offset || '0', 10);
  const logs = db.prepare('SELECT * FROM send_log WHERE campaign_id = ? ORDER BY ts DESC LIMIT ? OFFSET ?').all(id, limit, offset);
  res.json({ logs });
});

module.exports = router;
