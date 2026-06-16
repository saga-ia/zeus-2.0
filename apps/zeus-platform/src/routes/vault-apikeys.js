const express = require('express');
const { getDb } = require('../db/database');
const { encrypt, decrypt } = require('../crypto/vault');
const { requireAuth, auditLog } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT id, service, description, expires_at, created_at FROM vault_api_keys ORDER BY service ASC').all();
  res.json(rows);
});

router.get('/:id', auditLog('vault.apikey.read'), (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM vault_api_keys WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Não encontrado' });
  res.json({
    id: row.id,
    service: row.service,
    key: decrypt(row.key_enc),
    description: row.description,
    expires_at: row.expires_at,
    created_at: row.created_at
  });
});

router.post('/', auditLog('vault.apikey.create'), (req, res) => {
  const { service, key, description, expires_at } = req.body ?? {};
  if (!service || !key) return res.status(400).json({ error: 'service e key são obrigatórios' });
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO vault_api_keys (service, key_enc, description, expires_at, created_by) VALUES (?,?,?,?,?)'
  ).run(service, encrypt(key), description ?? null, expires_at ?? null, req.user.id);
  res.json({ ok: true, id: result.lastInsertRowid });
});

router.put('/:id', auditLog('vault.apikey.update'), (req, res) => {
  const { service, key, description, expires_at } = req.body ?? {};
  const db = getDb();
  const row = db.prepare('SELECT id FROM vault_api_keys WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Não encontrado' });
  db.prepare(
    `UPDATE vault_api_keys SET
      service=COALESCE(?,service),
      key_enc=COALESCE(?,key_enc),
      description=COALESCE(?,description),
      expires_at=COALESCE(?,expires_at),
      updated_at=unixepoch()
    WHERE id=?`
  ).run(service, key ? encrypt(key) : null, description, expires_at, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', auditLog('vault.apikey.delete'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM vault_api_keys WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
