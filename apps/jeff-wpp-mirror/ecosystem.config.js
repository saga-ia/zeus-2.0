module.exports = {
  apps: [{
    name: 'jeff-wpp-mirror',
    script: 'server.js',
    cwd: '/opt/jeff-apps/jeff-wpp-mirror',
    env: { NODE_ENV: 'production', PORT: '3027' }
  }]
};
