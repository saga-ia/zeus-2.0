require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const express = require('express');
const cors = require('cors');
const db = require('../lib/db');
const log = require('../lib/logger');

const PORT = parseInt(process.env.API_PORT || '3011', 10);

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), db: db.DB_PATH });
});

app.use('/auth', require('./routes/auth'));
app.use('/me', require('./routes/me'));
app.use('/devices', require('./routes/devices'));
app.use('/vendedores', require('./routes/vendedores'));
app.use('/conversas', require('./routes/conversas'));
app.use('/dashboard', require('./routes/dashboard'));

// Painel estatico minimo (substituido por Next.js na Fase 4)
app.use('/', express.static(path.join(__dirname, '..', 'web', 'public')));

app.use((err, req, res, _next) => {
  log.error('api', `unhandled ${req.method} ${req.url}`, err.message);
  res.status(500).json({ error: 'internal_error', detail: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  log.info('api', `Zeus Analytics API rodando em http://0.0.0.0:${PORT}`);
});
