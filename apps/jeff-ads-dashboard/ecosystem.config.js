module.exports = {
  apps: [{
    name: 'jeff-ads-dashboard',
    script: 'server.js',
    cwd: '/opt/jeff-apps/jeff-ads-dashboard',
    instances: 1,
    autorestart: true,
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production', PORT: '3011' }
  }]
};
