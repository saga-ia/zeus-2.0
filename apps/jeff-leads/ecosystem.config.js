module.exports = {
  apps: [{
    name: 'jeff-leads',
    script: 'server.js',
    cwd: '/opt/jeff-apps/jeff-leads',
    env: { PORT: 3042, GOOGLE_USER: 'jefersonhenrike1@gmail.com' },
    autorestart: true,
    max_memory_restart: '200M'
  }]
};
