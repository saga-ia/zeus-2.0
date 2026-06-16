module.exports = {
  apps: [{
    name: 'jeff-farias-clientarea',
    script: 'server.js',
    cwd: '/opt/jeff-apps/jeff-farias-clientarea',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production', PORT: '3023' }
  }]
};
