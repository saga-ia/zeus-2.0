const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

const CRM_URL = process.env.CRM_URL || 'http://127.0.0.1:3051';
const CRM_TOKEN = process.env.CRM_TOKEN || '';

async function syncLeadToCRM(phone, name, campaign_id) {
  if (!CRM_TOKEN) return { ok: false, error: 'CRM_TOKEN not configured' };

  try {
    const res = await fetch(`${CRM_URL}/api/leads/sync-from-sdrs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CRM_TOKEN}`,
      },
      body: JSON.stringify({
        phone,
        name,
        campaign_id,
        timestamp: Math.floor(Date.now() / 1000),
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      return { ok: false, error };
    }

    const data = await res.json();
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

router.post('/campaigns/:id/push-to-crm', async (req, res) => {
  const campaignId = req.params.id;

  const jobs = db.prepare(`
    SELECT DISTINCT target_phone, target_name
    FROM slot_upload_job
    WHERE status IN ('sent', 'pending')
    ORDER BY created_at ASC
    LIMIT 500
  `).all();

  if (!jobs.length) {
    return res.json({ ok: true, pushed: 0, failed: 0, errors: [] });
  }

  const results = { pushed: 0, failed: 0, errors: [] };

  for (const job of jobs) {
    const syncRes = await syncLeadToCRM(job.target_phone, job.target_name, campaignId);
    if (syncRes.ok) {
      results.pushed++;
    } else {
      results.failed++;
      results.errors.push({ phone: job.target_phone, error: syncRes.error });
    }
  }

  res.json(results);
});

router.get('/campaigns/:id/crm-status', async (req, res) => {
  const campaignId = req.params.id;

  const total = db.prepare(`
    SELECT COUNT(DISTINCT target_phone) as n
    FROM slot_upload_job
    WHERE status IN ('sent', 'pending')
  `).get().n;

  res.json({
    ok: true,
    total_recipients: total,
    synced_to_crm: 0,
    pending: total,
    failed: 0,
    last_sync: null,
  });
});

module.exports = router;
