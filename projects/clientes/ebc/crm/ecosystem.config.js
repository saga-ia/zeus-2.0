module.exports = {
  apps: [{
    name: 'jeff-ebc-crm',
    script: 'server.js',
    cwd: '/opt/jeff-apps/jeff-ebc-crm',
    env: { PORT: '3015', NODE_ENV: 'production' },
    max_memory_restart: '300M',
    autorestart: true,
  }]
};
