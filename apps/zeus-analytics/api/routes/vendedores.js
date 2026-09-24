const express = require('express');
const db = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT v.*, (
      SELECT GROUP_CONCAT(d.apelido, ', ')
        FROM vendedor_device vd
        JOIN devices d ON d.id = vd.device_id
       WHERE vd.vendedor_id = v.id AND vd.ativo=1
    ) AS devices
    FROM vendedores v WHERE v.tenant_id=? ORDER BY v.nome
  `).all(req.user.tid);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { nome, apelido, email } = req.body || {};
  if (!nome) return res.status(400).json({ error: 'nome obrigatorio' });
  const info = db.prepare(`
    INSERT INTO vendedores (tenant_id, nome, apelido, email) VALUES (?, ?, ?, ?)
  `).run(req.user.tid, nome, apelido || null, email || null);
  res.json({ id: info.lastInsertRowid, nome, apelido, email });
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM vendedores WHERE id=? AND tenant_id=?')
    .run(req.params.id, req.user.tid);
  res.json({ deleted: info.changes });
});

// Amarra vendedor -> device
router.post('/:id/devices', (req, res) => {
  const { device_id, turno_inicio, turno_fim, dias_semana } = req.body || {};
  if (!device_id) return res.status(400).json({ error: 'device_id obrigatorio' });

  const v = db.prepare('SELECT id FROM vendedores WHERE id=? AND tenant_id=?')
    .get(req.params.id, req.user.tid);
  const d = db.prepare('SELECT id FROM devices WHERE id=? AND tenant_id=?')
    .get(device_id, req.user.tid);
  if (!v || !d) return res.status(404).json({ error: 'vendedor ou device nao encontrado' });

  const info = db.prepare(`
    INSERT INTO vendedor_device (vendedor_id, device_id, turno_inicio, turno_fim, dias_semana)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.id, device_id, turno_inicio || null, turno_fim || null, dias_semana || null);
  res.json({ id: info.lastInsertRowid });
});

router.delete('/:id/devices/:vd_id', (req, res) => {
  const info = db.prepare(`
    DELETE FROM vendedor_device WHERE id=? AND vendedor_id=?
      AND vendedor_id IN (SELECT id FROM vendedores WHERE tenant_id=?)
  `).run(req.params.vd_id, req.params.id, req.user.tid);
  res.json({ deleted: info.changes });
});

module.exports = router;
