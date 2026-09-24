const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { config } = require('./config');
const logger = require('./logger');
const { db } = require('./db');
const { errorHandler } = require('./utils/errors');
const { requireAuth, requireJwt, optionalAuth } = require('./auth/middleware');

const healthRoutes = require('./routes/health');
const statusRoutes = require('./routes/status');
const qrRoutes = require('./routes/qr');
const pairRoutes = require('./routes/pair');
const authRoutes = require('./routes/auth');
const messagesRoutes = require('./routes/messages');
const groupsRoutes = require('./routes/groups');
const sendRoutes = require('./routes/send');
const historyRoutes = require('./routes/history');
const contactsRoutes = require('./routes/contacts');
const webhooksRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin');
const sessionRoutes = require('./routes/session');
const agentRoutes = require('./routes/agent');
const staticHtmlRoutes = require('./routes/static-html');
const mirrorRoutes = require('./routes/mirror');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function buildApp({ wa, queue }) {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.locals.wa = wa;
  app.locals.queue = queue;
  app.locals.queueSize = () => queue.size();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://cdn.tailwindcss.com', "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(
    cors({
      origin: false,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  // Request log + api_logs row
  const logInsert = db.prepare(
    `INSERT INTO api_logs (method, path, auth_type, status_code, duration_ms, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  app.use(optionalAuth);
  app.use((req, res, next) => {
    const t0 = Date.now();
    res.on('finish', () => {
      try {
        logInsert.run(
          req.method,
          req.path,
          req.auth?.type || 'none',
          res.statusCode,
          Date.now() - t0,
          req.ip,
          String(req.headers['user-agent'] || '').slice(0, 256)
        );
      } catch {
        /* ignore */
      }
    });
    next();
  });

  const authLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
  const apiLimiter = rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false });

  // Public
  app.use('/health', healthRoutes);
  app.use('/auth', authLimiter, authRoutes);

  // Static HTML (guarded by cookie redirect)
  app.use('/', staticHtmlRoutes);
  app.use('/public', (req, res, next) => {
    // Strip restrictive headers set by helmet so Meta/Facebook can fetch images
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.removeHeader('X-Frame-Options');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  }, express.static(PUBLIC_DIR, { fallthrough: true, maxAge: '1h' }));
  app.use('/favicon.ico', (req, res) => res.status(204).end());

  // Public landing page + form submit (no auth)
  app.use('/inscricao', require('./routes/inscricao'));
  app.use('/cigc-leads', require('./routes/cigc-leads'));
  app.use('/farias-leads', require('./routes/farias-leads'));
  app.use('/proximo-ciclo', require('./routes/proximo-ciclo'));
  app.use('/mirror', mirrorRoutes);

  // Authenticated (Bearer OR JWT cookie)
  app.use(apiLimiter, requireAuth);
  app.use('/status', statusRoutes);
  app.use('/qr', qrRoutes);
  app.use('/pair', pairRoutes);
  app.use('/messages', messagesRoutes);
  app.use('/groups', groupsRoutes);
  app.use('/', sendRoutes); // /send-message, /send-media, /send-audio
  app.use('/history', historyRoutes);
  app.use('/contacts', contactsRoutes);
  app.use('/webhooks', webhooksRoutes);
  app.use('/admin', adminRoutes);
  app.use('/session', sessionRoutes);
  app.use('/agent', agentRoutes);

  // OpenAPI docs (JWT only)
  app.get('/docs.json', requireJwt, (_req, res) => {
    res.json(require('./openapi.json'));
  });
  app.get('/docs', requireJwt, (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'docs.html'));
  });

  app.use((req, res) => res.status(404).json({ error: 'not_found', path: req.path }));
  app.use(errorHandler(logger));

  return app;
}

module.exports = { buildApp };
