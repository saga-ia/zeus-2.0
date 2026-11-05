module.exports = {
  apps: [{
    name: 'jeff-sdrs-crm',
    script: 'server.js',
    cwd: '/opt/jeff-apps/jeff-sdrs-crm',
    env: {
      PORT: '3051',
      NODE_ENV: 'production',
      CRM_PASSWORD: '<REDACTED>',
      SDRS_JWT_SECRET: '<REDACTED>',
      SDRS_SSO_USER_ID: '1',
      SDRS_URL: 'https://sdrs.jefersonhenrike.com',
      WORKER_URL: 'http://127.0.0.1:3002',
      WORKER_TOKEN: '<REDACTED>',
      JEFF_PHONE: '5511910075450',
    },
    max_memory_restart: '300M',
    autorestart: true,
  }]
};
