module.exports = {
  apps: [{
    name: 'jeff-central',
    script: 'server.js',
    cwd: '/opt/jeff-apps/jeff-central',
    env: {
      NODE_ENV: 'production',
      PORT: 3031,
      PUBLIC_HOST: 'central.jefersonhenrike.com',
      SERVER_IP: '80.241.214.10',
      WORKER_DB_PATH: '/opt/jeff-worker/data/worker.db',
    },
    autorestart: true,
    max_memory_restart: '300M',
    error_file: '/opt/jeff-apps/jeff-central/logs/err.log',
    out_file: '/opt/jeff-apps/jeff-central/logs/out.log',
    merge_logs: true,
    time: true,
  }],
};
