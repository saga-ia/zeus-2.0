module.exports = {
  apps: [{
    name: 'jeff-vps-monitor',
    script: 'server.js',
    cwd: '/opt/jeff-apps/jeff-vps-monitor',
    instances: 1,
    autorestart: true,
    max_memory_restart: '200M',
    env: { NODE_ENV: 'production', PORT: '3012' }
  }]
};
