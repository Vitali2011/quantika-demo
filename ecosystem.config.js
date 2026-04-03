module.exports = {
  apps: [
    {
      name: 'quantika-demo',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      cwd: '/root/quantika-demo', // will be updated at deploy time
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
