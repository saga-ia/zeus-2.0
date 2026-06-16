require('dotenv').config({ path: '.env' });
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const path = require('path');
const { initMasterKey } = require('./src/crypto/vault');
const { getDb } = require('./src/db/database');

const PORT = process.env.PORT || 4000;

initMasterKey(process.env.VAULT_SECRET, process.env.VAULT_SALT);
getDb();

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth',            require('./src/routes/auth'));
app.use('/api/vault/passwords', require('./src/routes/vault-passwords'));
app.use('/api/vault/apikeys',   require('./src/routes/vault-apikeys'));
app.use('/api/agents',          require('./src/routes/agents'));

function isAuthenticated(req) {
  const token = req.cookies?.zeus_token;
  if (!token) return false;
  try { jwt.verify(token, process.env.JWT_SECRET); return true; }
  catch { return false; }
}

app.get('/', (req, res) => {
  if (!isAuthenticated(req)) return res.redirect(302, '/login/');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  if (!isAuthenticated(req)) return res.redirect(302, '/login/');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[zeus-platform] rodando em http://0.0.0.0:${PORT}`);
});
