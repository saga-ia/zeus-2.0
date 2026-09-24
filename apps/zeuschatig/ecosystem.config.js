module.exports = {
  apps: [{
    name: 'zeuschatig',
    script: '/opt/jeff-apps/zeuschatig/server.js',
    cwd: '/opt/jeff-apps/zeuschatig',
    env: { PORT: 3060, NODE_ENV: 'production' },
    max_memory_restart: '400M',
    error_file: '/opt/jeff-apps/zeuschatig/logs/err.log',
    out_file: '/opt/jeff-apps/zeuschatig/logs/out.log',
  },{
    name: 'myig-dispatcher',
    script: '/opt/jeff-apps/zeuschatig/src/dispatcher.js',
    cwd: '/opt/jeff-apps/zeuschatig',
    env: { NODE_ENV: 'production' },
    max_memory_restart: '400M',
    error_file: '/opt/jeff-apps/zeuschatig/logs/dispatcher-err.log',
    out_file: '/opt/jeff-apps/zeuschatig/logs/dispatcher-out.log',
    kill_timeout: 15000,
  }],
};
