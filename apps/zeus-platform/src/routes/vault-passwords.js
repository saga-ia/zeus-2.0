const express = require('express');
const { getDb } = require('../db/database');
const { encrypt, decrypt } = require('../crypto/vault');
const { requireAuth, auditLog } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT id, label, created_at, updated_at FROM vault_passwords ORDER BY label ASC').all();
  res.json(rows);
});

router.get('/:id', auditLog('vault.password.read'), (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM vault_passwords WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Não encontrado' });
  res.json({
    id: row.id,
    label: row.label,
    username: decrypt(row.username_enc),
    password: decrypt(row.password_enc),
    url: decrypt(row.url_enc),
    notes: decrypt(row.notes_enc),
    created_at: row.created_at,
    updated_at: row.updated_at
  });
});

router.post('/', auditLog('vault.password.create'), (req, res) => {
  const { label, username, password, url, notes } = req.body ?? {};
  if (!label || !password) return res.status(400).json({ error: 'label e password são obrigatórios' });
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO vault_passwords (label, username_enc, password_enc, url_enc, notes_enc, created_by) VALUES (?,?,?,?,?,?)'
  ).run(label, encrypt(username), encrypt(password), encrypt(url), encrypt(notes), req.user.id);
  res.json({ ok: true, id: result.lastInsertRowid });
});

router.put('/:id', auditLog('vault.password.update'), (req, res) => {
  const { label, username, password, url, notes } = req.body ?? {};
  const db = getDb();
  const row = db.prepare('SELECT id FROM vault_passwords WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Não encontrado' });
  db.prepare(
    `UPDATE vault_passwords SET
      label=COALESCE(?,label),
      username_enc=COALESCE(?,username_enc),
      password_enc=COALESCE(?,password_enc),
      url_enc=COALESCE(?,url_enc),
      notes_enc=COALESCE(?,notes_enc),
      updated_at=unixepoch()
    WHERE id=?`
  ).run(label, password ? encrypt(username) : null, password ? encrypt(password) : null, url ? encrypt(url) : null, notes ? encrypt(notes) : null, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', auditLog('vault.password.delete'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM vault_passwords WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
