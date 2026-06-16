module.exports = {
  apps: [{
    name: 'jeff-zapsign-webhook',
    script: 'server.js',
    cwd: '/opt/jeff-apps/jeff-zapsign-webhook',
    instances: 1,
    autorestart: true,
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production', PORT: '3014' }
  }]
};
