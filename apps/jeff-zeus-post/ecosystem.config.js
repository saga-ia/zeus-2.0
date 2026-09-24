module.exports = {
  apps: [
    {
      name: 'jeff-zeus-post',
      script: 'server.js',
      cwd: '/opt/jeff-apps/jeff-zeus-post',
      env: { NODE_ENV: 'production', PORT: 3070, TZ: 'America/Sao_Paulo' },
      restart_delay: 5000,
      max_restarts: 10
    },
    {
      name: 'jeff-zeus-post-worker',
      script: 'worker.js',
      cwd: '/opt/jeff-apps/jeff-zeus-post',
      env: { NODE_ENV: 'production', TZ: 'America/Sao_Paulo' },
      restart_delay: 5000,
      max_restarts: 10
    }
  ]
};
