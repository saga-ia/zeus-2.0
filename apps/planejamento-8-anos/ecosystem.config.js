module.exports = {
  apps: [
    {
      name: 'planejamento-8-anos',
      cwd: '/opt/jeff-apps/planejamento-8-anos',
      script: '/usr/local/bin/gunicorn',
      interpreter: 'python3',
      args: '-w 2 -b 0.0.0.0:7180 --access-logfile - --error-logfile - app:app',
      autorestart: true,
      max_restarts: 10,
      env: { PYTHONUNBUFFERED: '1' },
    },
  ],
};
