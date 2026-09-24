require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./src/routes/auth');
const sdrRoutes = require('./src/routes/sdrs');
const conversationRoutes = require('./src/routes/conversations');
const maturationRoutes = require('./src/routes/maturation');
const configRoutes = require('./src/routes/config');
const crmSyncRoutes = require('./src/routes/crm-sync');
const keysRoutes = require('./src/routes/keys');
const { restoreSlots, startUploadDispatcher, startConnectionWatchdog, startReplayScheduler } = require('./src/services/waManager');
const maturation = require('./src/services/maturation');

const app = express();
const PORT = process.env.PORT || 3041;

// Aviso alto se JWT_SECRET nao esta configurado — evita subir com secret default em prod.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-change-me') {
  console.error('[jeff-sdrs][SECURITY] JWT_SECRET nao definido no .env. Rodando com secret default — QUALQUER pessoa pode forjar login. Defina JWT_SECRET no .env e reinicie.');
}

// Payload grande so no endpoint de upload de contatos (default menor pra reduzir superficie de DoS).
app.use('/api/sdrs/:slot/upload-contacts', express.json({ limit: '20mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'ignore', index: 'index.html' }));

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload_too_large', limit: '100mb' });
  }
  next(err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[jeff-sdrs] unhandledRejection:', reason && reason.message ? reason.message : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[jeff-sdrs] uncaughtException:', err && err.message ? err.message : err);
});

app.use('/api/auth', authRoutes);
app.use('/api/sdrs', sdrRoutes);
app.use('/api/sdrs', configRoutes);
app.use('/api/crm', crmSyncRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/maturation', maturationRoutes);
app.use('/api/system', keysRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'jeff-sdrs', version: '1.0.0', ts: new Date().toISOString() });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not_found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[jeff-sdrs] v1.0.0 listening on 0.0.0.0:${PORT}`);
  restoreSlots();
  maturation.start();
  startUploadDispatcher();
  startConnectionWatchdog();
  startReplayScheduler();
});
