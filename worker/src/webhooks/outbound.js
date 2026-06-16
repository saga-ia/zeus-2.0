const { db } = require('../db');
const logger = require('../logger');
const { config } = require('../config');

const stmt = {
  listActive: db.prepare(`SELECT * FROM webhooks WHERE active = 1`),
  enqueueDelivery: db.prepare(`
    INSERT INTO webhook_deliveries (webhook_id, event_type, payload, next_retry_at)
    VALUES (@webhook_id, @event_type, @payload, datetime('now'))
  `),
  pickDue: db.prepare(`
    SELECT d.*, w.url, w.token
    FROM webhook_deliveries d
    JOIN webhooks w ON w.id = d.webhook_id AND w.active = 1
    WHERE d.status = 'pending'
      AND (d.next_retry_at IS NULL OR d.next_retry_at <= datetime('now'))
    ORDER BY d.id ASC
    LIMIT 20
  `),
  markSent: db.prepare(`UPDATE webhook_deliveries SET status='sent', sent_at=datetime('now') WHERE id = ?`),
  markError: db.prepare(`
    UPDATE webhook_deliveries
    SET attempts = attempts + 1,
        last_error = @err,
        next_retry_at = @next,
        status = CASE WHEN attempts + 1 >= 6 THEN 'error' ELSE 'pending' END
    WHERE id = @id
  `),
};

function matchesEvent(subscription, event) {
  if (!subscription) return false;
  if (subscription === '*') return true;
  return subscription.split(',').map((s) => s.trim()).includes(event);
}

function createOutbound() {
  function emit(event_type, payload) {
    const body = JSON.stringify({ event: event_type, data: payload, ts: new Date().toISOString() });

    // DB-registered webhooks
    try {
      for (const w of stmt.listActive.all()) {
        if (!matchesEvent(w.events, event_type)) continue;
        stmt.enqueueDelivery.run({
          webhook_id: w.id,
          event_type,
          payload: body,
        });
      }
    } catch (err) {
      logger.error({ err }, 'webhook enqueue failed');
    }

    // Single global webhook from .env (blueprint-style)
    if (config.webhookUrl) {
      globalDeliver(config.webhookUrl, config.webhookToken, event_type, body).catch((err) =>
        logger.warn({ err: err.message }, 'global webhook delivery failed')
      );
    }
  }

  async function globalDeliver(url, token, event_type, body) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          'x-event-type': event_type,
        },
        body,
      });
      if (!resp.ok) {
        logger.warn({ status: resp.status, url }, 'global webhook non-2xx');
      }
    } catch (err) {
      logger.warn({ err: err.message, url }, 'global webhook error');
    }
  }

  async function processDue() {
    const rows = stmt.pickDue.all();
    for (const d of rows) {
      try {
        const resp = await fetch(d.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(d.token ? { authorization: `Bearer ${d.token}` } : {}),
            'x-event-type': d.event_type,
          },
          body: d.payload,
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        stmt.markSent.run(d.id);
      } catch (err) {
        const attempts = d.attempts + 1;
        const nextMs = Math.min(30_000 * 2 ** (attempts - 1), 30 * 60_000);
        const next = new Date(Date.now() + nextMs).toISOString().replace('T', ' ').slice(0, 19);
        stmt.markError.run({ id: d.id, err: String(err.message || err), next });
      }
    }
  }

  let timer = null;
  function start() {
    if (timer) return;
    timer = setInterval(() => {
      processDue().catch((err) => logger.error({ err }, 'webhook worker error'));
    }, 5000);
    timer.unref?.();
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { emit, start, stop };
}

module.exports = { createOutbound };
