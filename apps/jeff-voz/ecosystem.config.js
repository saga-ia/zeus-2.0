module.exports = {
  apps: [{
    name: 'jeff-voz',
    script: 'servidor.py',
    interpreter: '/opt/jeff-apps/jeff-voz/venv/bin/python',
    cwd: __dirname,
    env: { HOST: '127.0.0.1', PORT: '3072', MOTOR: 'edge', VOZ_EDGE: 'pt-BR-AntonioNeural', RITMO_EDGE: '+20%', TOM_EDGE: '+0Hz', VOZ_PIPER: 'cadu', VELOCIDADE: '1.1', PYTHONUNBUFFERED: '1' },
    instances: 1,
    autorestart: true,
    max_memory_restart: '900M'
  }]
};
