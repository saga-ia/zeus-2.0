module.exports = {
  apps: [{
    name: 'zeus-instalacao',
    script: 'server.js',
    cwd: __dirname,
    env: { PORT: '3071', HOST: '172.17.0.1', NODE_ENV: 'production' },
    instances: 1,
    autorestart: true,
    max_memory_restart: '150M'
  }]
};
