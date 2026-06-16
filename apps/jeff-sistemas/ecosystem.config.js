module.exports = {
  apps: [{
    name: 'jeff-sistemas',
    script: 'server.js',
    cwd: '/opt/jeff-apps/jeff-sistemas',
    instances: 1,
    autorestart: true,
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production', PORT: '3017' }
  }]
};
