// Processo dedicado do scheduler (PM2: jeff-agenda-turbo-max-worker).
// Toda a lógica mora em scheduler.js — o server.js roda a mesma lógica como
// fallback embutido quando este processo não está de pé.
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';

const scheduler = require('./scheduler');

process.on('unhandledRejection', (err) => {
  console.error('[worker] unhandledRejection:', err?.stack || err);
});
process.on('uncaughtException', (err) => {
  console.error('[worker] uncaughtException:', err?.stack || err);
});

console.log('[agenda-turbo-max worker] Iniciando scheduler dedicado...');
scheduler.start('worker');
