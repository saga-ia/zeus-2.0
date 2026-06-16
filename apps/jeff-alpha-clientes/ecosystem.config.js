module.exports = {
  apps: [{
    name: 'jeff-alpha-clientes',
    script: 'server.js',
    cwd: __dirname,
    env: { PORT: '3020', NODE_ENV: 'production' },
    instances: 1,
    autorestart: true,
    max_memory_restart: '300M'
  }]
};
