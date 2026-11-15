// PM2: pm2 start ecosystem.config.js && pm2 save
module.exports = {
  apps: [{
    name: 'jeff-videoia',
    script: 'server.js',
    cwd: '/opt/jeff-apps/jeff-videoia',
    max_memory_restart: '600M',
    env: {
      NODE_ENV: 'production',
      PORT: 3092,
      HOST: '172.17.0.1',            // só a rede do Docker: o NPM chega, a internet não
      CLAUDE_BIN: '/root/.nvm/versions/node/v20.20.2/bin/claude',
      VIDEOIA_MODELO: 'sonnet',      // IA da edição (sonnet: ~20-40 s por pedido, ~US$ 0,04)
      VIDEOIA_ESFORCO: 'medium',
    },
  }],
};
