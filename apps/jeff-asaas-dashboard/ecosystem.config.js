module.exports = {
  apps: [{
    name: 'jeff-asaas-dashboard',
    script: 'server.js',
    cwd: '/opt/jeff-apps/jeff-asaas-dashboard',
    instances: 1,
    autorestart: true,
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production', PORT: '3013' }
  }]
};
