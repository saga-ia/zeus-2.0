module.exports = {
  apps: [{
    name: 'jeff-instagram-webhook',
    script: 'server.js',
    cwd: '/opt/jeff-apps/jeff-instagram-webhook',
    instances: 1,
    autorestart: true,
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production', PORT: '3019' }
  }]
};
