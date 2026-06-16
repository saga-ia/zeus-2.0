module.exports = {
  apps: [{
    name: 'jeff-google-oauth',
    script: 'server.js',
    cwd: '/opt/jeff-apps/jeff-google-oauth',
    instances: 1,
    autorestart: true,
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production', PORT: '3018' }
  }]
};
