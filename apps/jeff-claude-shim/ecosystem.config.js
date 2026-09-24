module.exports = {
  apps: [{
    name: 'jeff-claude-shim',
    script: 'server.js',
    cwd: '/opt/jeff-apps/jeff-claude-shim',
    max_memory_restart: '300M',
    env: { SHIM_HOST: '172.17.0.1', SHIM_PORT: '8787', SHIM_MODEL: 'sonnet', SHIM_CONCURRENCY: '2' },
    out_file: 'logs/out.log', error_file: 'logs/err.log', time: false,
  }],
};
