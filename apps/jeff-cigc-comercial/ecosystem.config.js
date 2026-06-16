module.exports = {
  apps: [{
    name: 'jeff-cigc-comercial',
    script: 'server.js',
    cwd: '/opt/jeff-apps/jeff-cigc-comercial',
    instances: 1,
    autorestart: true,
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production', PORT: '3022' }
  }]
};
