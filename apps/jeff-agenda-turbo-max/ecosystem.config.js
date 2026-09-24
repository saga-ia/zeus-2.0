module.exports = {
  apps: [
    {
      name: 'jeff-agenda-turbo-max',
      script: 'server.js',
      cwd: '/opt/jeff-apps/jeff-agenda-turbo-max',
      env: {
        NODE_ENV: 'production',
        PORT: 3081,
        TZ: 'America/Sao_Paulo',
        PUBLIC_BASE_URL: 'https://agendaturbomax.jefersonhenrike.com'
      },
      restart_delay: 5000,
      max_restarts: 10
    },
    {
      name: 'jeff-agenda-turbo-max-worker',
      script: 'worker.js',
      cwd: '/opt/jeff-apps/jeff-agenda-turbo-max',
      env: {
        NODE_ENV: 'production',
        TZ: 'America/Sao_Paulo',
        PUBLIC_BASE_URL: 'https://agendaturbomax.jefersonhenrike.com'
      },
      restart_delay: 5000,
      max_restarts: 10
    }
  ]
};
