const express = require('express');
const crypto = require('crypto');
const db = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT id, apelido, numero, status, conectado_em, criado_em
      FROM devices WHERE tenant_id=? ORDER BY id DESC
  `).all(req.user.tid);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { apelido } = req.body || {};
  if (!apelido) return res.status(400).json({ error: 'apelido obrigatorio' });
  const session_id = `t${req.user.tid}-${crypto.randomBytes(6).toString('hex')}`;
  const info = db.prepare(`
    INSERT INTO devices (tenant_id, apelido, session_id, status)
    VALUES (?, ?, ?, 'initializing')
  `).run(req.user.tid, apelido, session_id);
  res.json({ id: info.lastInsertRowid, apelido, session_id, status: 'initializing' });
});

router.get('/:id/qr', (req, res) => {
  const d = db.prepare(`
    SELECT id, status, ultimo_qr, ultimo_qr_em FROM devices
     WHERE id=? AND tenant_id=?
  `).get(req.params.id, req.user.tid);
  if (!d) return res.status(404).json({ error: 'not found' });
  if (d.status === 'ready') return res.json({ status: 'ready' });
  if (!d.ultimo_qr) return res.json({ status: d.status, qr: null });
  if (req.query.format === 'svg') {
    res.set('Content-Type', 'image/svg+xml');
    return res.send(d.ultimo_qr);
  }
  res.json({ status: d.status, qr_svg: d.ultimo_qr, qr_at: d.ultimo_qr_em });
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM devices WHERE id=? AND tenant_id=?')
    .run(req.params.id, req.user.tid);
  res.json({ deleted: info.changes });
});

router.post('/:id/restart', (req, res) => {
  const info = db.prepare(`
    UPDATE devices SET status='initializing', ultimo_qr=NULL, ultimo_qr_em=NULL
     WHERE id=? AND tenant_id=?
  `).run(req.params.id, req.user.tid);
  res.json({ ok: info.changes > 0 });
});

module.exports = router;
