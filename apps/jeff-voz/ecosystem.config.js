module.exports = {
  apps: [{
    name: 'jeff-voz',
    script: 'servidor.py',
    interpreter: '/opt/jeff-apps/jeff-voz/venv/bin/python',
    cwd: __dirname,
    env: { HOST: '127.0.0.1', PORT: '3072', VOZ: 'pm_alex', VELOCIDADE: '0.95', PYTHONUNBUFFERED: '1' },
    instances: 1,
    autorestart: true,
    max_memory_restart: '900M'
  }]
};
