module.exports = {
  apps: [{
    name: 'jeff-farias-crm',
    script: 'server.js',
    cwd: '/opt/jeff-apps/jeff-farias-crm',
    env: { PORT: '3050', NODE_ENV: 'production' },
    max_memory_restart: '300M',
    autorestart: true,
  }]
};
