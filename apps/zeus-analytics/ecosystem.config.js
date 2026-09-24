module.exports = {
  apps: [
    {
      name: 'za-api',
      script: 'api/index.js',
      cwd: '/opt/jeff-apps/zeus-analytics',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '300M',
      autorestart: true,
      time: true,
    },
    {
      name: 'za-worker',
      script: 'worker/index.js',
      cwd: '/opt/jeff-apps/zeus-analytics',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '1G',
      autorestart: true,
      time: true,
    },
    {
      name: 'za-analyzer',
      script: 'analyzer/index.js',
      cwd: '/opt/jeff-apps/zeus-analytics',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '500M',
      autorestart: true,
      time: true,
    },
  ],
};
// (notifier roda dentro do worker pra ter acesso direto aos clientes whatsapp-web.js em memoria)
