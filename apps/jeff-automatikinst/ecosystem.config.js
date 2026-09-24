module.exports = {
  apps: [
    {
      name: 'jeff-automatikinst',
      script: 'server.js',
      cwd: '/opt/jeff-apps/jeff-automatikinst',
      env: {
        NODE_ENV: 'production',
        PORT: 3080,
        TZ: 'America/Sao_Paulo',
        PUBLIC_BASE_URL: 'https://automatikinst.jefersonhenrike.com'
      },
      restart_delay: 5000,
      max_restarts: 10
    },
    {
      name: 'jeff-automatikinst-worker',
      script: 'worker.js',
      cwd: '/opt/jeff-apps/jeff-automatikinst',
      env: {
        NODE_ENV: 'production',
        TZ: 'America/Sao_Paulo',
        PUBLIC_BASE_URL: 'https://automatikinst.jefersonhenrike.com'
      },
      restart_delay: 5000,
      max_restarts: 10
    }
  ]
};
