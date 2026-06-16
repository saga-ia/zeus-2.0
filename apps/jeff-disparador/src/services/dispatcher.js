'use strict';
const { db } = require('../db');
const { sendText, isReady } = require('./waManager');

// Map<campaignId, { running: bool, paused: bool }>
const activeCampaigns = new Map();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
  return Math.floor(min * 1000 + Math.random() * (max - min) * 1000);
}

function interpolate(template, vars) {
  if (!vars) return template;
  let v = {};
  try { v = JSON.parse(vars); } catch {}
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => v[key] || '');
}

function pickMessage(campaign) {
  if (!campaign.message_variants) return campaign.message;
  let variants;
  try { variants = JSON.parse(campaign.message_variants); } catch {}
  if (!Array.isArray(variants) || !variants.length) return campaign.message;
  return variants[Math.floor(Math.random() * variants.length)];
}

function log(campaignId, recipientId, slot, status, detail) {
  db.prepare('INSERT INTO send_log (campaign_id, recipient_id, agent_slot, status, detail, ts) VALUES (?, ?, ?, ?, ?, ?)')
    .run(campaignId, recipientId, slot, status, detail, new Date().toISOString());
}

async function runCampaign(campaignId) {
  const state = activeCampaigns.get(campaignId);

  while (true) {
    if (!state.running) break;

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign || campaign.status === 'finished' || campaign.status === 'paused') break;

    const slots = (() => {
      try { return JSON.parse(campaign.agent_slots); } catch { return []; }
    })();

    const readySlots = slots.filter(s => isReady(s));
    if (!readySlots.length) {
      db.prepare("UPDATE campaigns SET status = 'paused' WHERE id = ?").run(campaignId);
      state.running = false;
      break;
    }

    const recipient = db.prepare(
      "SELECT * FROM recipients WHERE campaign_id = ? AND status = 'pending' ORDER BY id LIMIT 1"
    ).get(campaignId);

    if (!recipient) {
      db.prepare("UPDATE campaigns SET status = 'finished', finished_at = ? WHERE id = ?")
        .run(new Date().toISOString(), campaignId);
      state.running = false;
      break;
    }

    // rotate slot
    const slotIndex = (recipient.id % readySlots.length);
    const slot = readySlots[slotIndex];

    const message = interpolate(pickMessage(campaign), recipient.vars);

    // mark as sending
    db.prepare("UPDATE recipients SET status = 'sending', agent_slot = ?, attempts = attempts + 1 WHERE id = ?")
      .run(slot, recipient.id);

    try {
      await sendText(slot, recipient.phone, message);
      db.prepare("UPDATE recipients SET status = 'sent', sent_at = ? WHERE id = ?")
        .run(new Date().toISOString(), recipient.id);
      db.prepare('UPDATE campaigns SET sent = sent + 1 WHERE id = ?').run(campaignId);
      log(campaignId, recipient.id, slot, 'sent', null);
    } catch (e) {
      const attempts = recipient.attempts + 1;
      if (attempts >= 3) {
        db.prepare("UPDATE recipients SET status = 'failed', error = ? WHERE id = ?")
          .run(e.message, recipient.id);
        db.prepare('UPDATE campaigns SET failed = failed + 1 WHERE id = ?').run(campaignId);
        log(campaignId, recipient.id, slot, 'failed', e.message);
      } else {
        db.prepare("UPDATE recipients SET status = 'pending', error = ? WHERE id = ?")
          .run(e.message, recipient.id);
        log(campaignId, recipient.id, slot, 'retry', e.message);
      }
    }

    const delay = randomDelay(campaign.delay_min || 30, campaign.delay_max || 60);
    await sleep(delay);
  }

  activeCampaigns.delete(campaignId);
}

async function startCampaign(campaignId) {
  const existing = activeCampaigns.get(campaignId);
  if (existing && existing.running) return;

  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) throw new Error('campaign not found');

  const state = { running: true };
  activeCampaigns.set(campaignId, state);

  db.prepare("UPDATE campaigns SET status = 'running', started_at = coalesce(started_at, ?) WHERE id = ?")
    .run(new Date().toISOString(), campaignId);

  // run async, don't await
  runCampaign(campaignId).catch(e => {
    console.error(`[dispatcher] campaign ${campaignId} error:`, e);
    activeCampaigns.delete(campaignId);
    db.prepare("UPDATE campaigns SET status = 'paused' WHERE id = ?").run(campaignId);
  });
}

function pauseCampaign(campaignId) {
  const state = activeCampaigns.get(campaignId);
  if (state) state.running = false;
  db.prepare("UPDATE campaigns SET status = 'paused' WHERE id = ?").run(campaignId);
}

function isRunning(campaignId) {
  return activeCampaigns.has(campaignId) && activeCampaigns.get(campaignId).running;
}

module.exports = { startCampaign, pauseCampaign, isRunning };
