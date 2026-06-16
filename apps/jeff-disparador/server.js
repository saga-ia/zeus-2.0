require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./src/routes/auth');
const agentRoutes = require('./src/routes/agents');
const campaignRoutes = require('./src/routes/campaigns');
const recipientRoutes = require('./src/routes/recipients');
const { restoreSlots } = require('./src/services/waManager');

const app = express();
const PORT = process.env.PORT || 3021;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/campaigns/:id/recipients', recipientRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'jeff-disparador', version: '0.3.0', ts: new Date().toISOString() });
});

// SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not_found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[disparador] v0.3.0 listening on 0.0.0.0:${PORT}`);
  restoreSlots();
});
