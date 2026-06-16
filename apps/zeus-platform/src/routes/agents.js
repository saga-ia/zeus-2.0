const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function log(db, userId, action, ip) {
  try { db.prepare('INSERT INTO audit_log (user_id, action, ip) VALUES (?,?,?)').run(userId, action, ip); } catch {}
}

router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT id, name, slug, model, icon, active, created_at FROM agents ORDER BY name').all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Agente não encontrado' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { name, slug, system_prompt, model, icon } = req.body ?? {};
  if (!name || !slug || !system_prompt) return res.status(400).json({ error: 'name, slug e system_prompt são obrigatórios' });
  if (!/^[a-z0-9_-]+$/.test(slug)) return res.status(400).json({ error: 'slug só pode ter letras minúsculas, números, - e _' });

  const db = getDb();
  try {
    const r = db.prepare(
      'INSERT INTO agents (name, slug, system_prompt, model, icon) VALUES (?, ?, ?, ?, ?)'
    ).run(name, slug, system_prompt, model || 'claude-opus-4-7', icon || '🤖');
    log(db, req.user.id, 'agent.create', req.ip);
    res.status(201).json({ id: r.lastInsertRowid, name, slug, model, icon });
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Nome ou slug já existe' });
    throw e;
  }
});

router.put('/:id', (req, res) => {
  const { name, slug, system_prompt, model, icon } = req.body ?? {};
  if (!name || !slug || !system_prompt) return res.status(400).json({ error: 'name, slug e system_prompt são obrigatórios' });
  if (!/^[a-z0-9_-]+$/.test(slug)) return res.status(400).json({ error: 'slug só pode ter letras minúsculas, números, - e _' });

  const db = getDb();
  const existing = db.prepare('SELECT id FROM agents WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Agente não encontrado' });

  try {
    db.prepare(
      'UPDATE agents SET name=?, slug=?, system_prompt=?, model=?, icon=? WHERE id=?'
    ).run(name, slug, system_prompt, model || 'claude-opus-4-7', icon || '🤖', req.params.id);
    log(db, req.user.id, 'agent.update', req.ip);
    res.json({ ok: true });
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Nome ou slug já existe' });
    throw e;
  }
});

router.patch('/:id/toggle', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT id, active FROM agents WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Agente não encontrado' });
  const newActive = row.active ? 0 : 1;
  db.prepare('UPDATE agents SET active=? WHERE id=?').run(newActive, req.params.id);
  log(db, req.user.id, newActive ? 'agent.enable' : 'agent.disable', req.ip);
  res.json({ ok: true, active: newActive });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT id FROM agents WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Agente não encontrado' });
  db.prepare('DELETE FROM agents WHERE id=?').run(req.params.id);
  log(db, req.user.id, 'agent.delete', req.ip);
  res.json({ ok: true });
});

module.exports = router;
