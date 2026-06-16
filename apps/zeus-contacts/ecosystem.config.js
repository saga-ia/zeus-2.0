module.exports = {
  apps: [{
    name: 'zeus-contacts',
    script: 'server.js',
    cwd: '/opt/jeff-apps/zeus-contacts',
    instances: 1,
    autorestart: true,
    max_memory_restart: '200M',
    env: { NODE_ENV: 'production' }
  }]
};
