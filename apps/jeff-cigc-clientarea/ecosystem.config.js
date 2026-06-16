module.exports = {
  apps: [{
    name: 'jeff-cigc-clientarea',
    script: 'server.js',
    cwd: '/opt/jeff-apps/jeff-cigc-clientarea',
    instances: 1,
    autorestart: true,
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production', PORT: '3021' }
  }]
};
