module.exports = {
  apps: [{
    name: 'jeff-board-editor',
    script: './server.js',
    cwd: '/opt/jeff-apps/jeff-board-editor',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '150M',
    env: { NODE_ENV: 'production' },
  }],
};
