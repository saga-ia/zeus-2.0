module.exports = {
  apps: [{
    name: 'jeff-clickup-webhook',
    script: './server.js',
    cwd: '/opt/jeff-apps/jeff-clickup-webhook',
    env: { PORT: 3015 },
    max_memory_restart: '200M',
    error_file: '/opt/jeff-apps/jeff-clickup-webhook/err.log',
    out_file: '/opt/jeff-apps/jeff-clickup-webhook/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
