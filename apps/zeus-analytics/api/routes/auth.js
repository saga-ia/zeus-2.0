const express = require('express');
const db = require('../../lib/db');
const { hash, check, sign } = require('../../lib/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { nome, email, senha, gerente_phone } = req.body || {};
  if (!nome || !email || !senha) return res.status(400).json({ error: 'nome, email, senha obrigatorios' });
  if (senha.length < 6) return res.status(400).json({ error: 'senha muito curta' });

  const exists = db.prepare('SELECT id FROM tenants WHERE email=?').get(email);
  if (exists) return res.status(409).json({ error: 'email ja cadastrado' });

  const senha_hash = await hash(senha);
  const info = db.prepare(`
    INSERT INTO tenants (nome, email, senha_hash, gerente_phone)
    VALUES (?, ?, ?, ?)
  `).run(nome, email, senha_hash, gerente_phone || null);

  db.prepare('INSERT INTO configuracoes_avaliacao (tenant_id) VALUES (?)').run(info.lastInsertRowid);

  const token = sign({ tid: info.lastInsertRowid, email });
  res.json({ token, tenant: { id: info.lastInsertRowid, nome, email } });
});

router.post('/login', async (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) return res.status(400).json({ error: 'email e senha obrigatorios' });
  const t = db.prepare('SELECT id, nome, email, senha_hash, ativo FROM tenants WHERE email=?').get(email);
  if (!t || !t.ativo) return res.status(401).json({ error: 'credenciais invalidas' });
  const ok = await check(senha, t.senha_hash);
  if (!ok) return res.status(401).json({ error: 'credenciais invalidas' });
  const token = sign({ tid: t.id, email: t.email });
  res.json({ token, tenant: { id: t.id, nome: t.nome, email: t.email } });
});

module.exports = router;
