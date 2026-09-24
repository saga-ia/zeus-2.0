module.exports = {
  apps: [{
    name: 'jeff-sdrs-crm',
    script: 'server.js',
    cwd: '/opt/jeff-apps/jeff-sdrs-crm',
    env: {
      PORT: '3051',
      NODE_ENV: 'production',
      CRM_PASSWORD: 'sdrs2026',
      SDRS_JWT_SECRET: 'ee84cf21240a90f482ae369653438f482c34be802300fbb63c1dcca643bee137c3e0c42cffae42904da5824d85861130',
      SDRS_SSO_USER_ID: '1',
      SDRS_URL: 'https://sdrs.jefersonhenrike.com',
      WORKER_URL: 'http://127.0.0.1:3002',
      WORKER_TOKEN: 'd1d9386c16d13286a1db247453f3d74e762e1e5f4f815b724388f4fa81a292a6',
      JEFF_PHONE: '5511910075450',
    },
    max_memory_restart: '300M',
    autorestart: true,
  }]
};
