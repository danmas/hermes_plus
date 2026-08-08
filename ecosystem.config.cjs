// PM2 config for hermes_plus (Vite dev server)
// Start:  pm2 start ecosystem.config.js
// Stop:   pm2 stop hermes_plus
module.exports = {
  apps: [
    {
      name: 'hermes_plus',
      cwd: 'C:/ERV/projects-ex/hermes_plus',
      script: 'node_modules/vite/bin/vite.js',
      args: 'dev --port 3310',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3310,
        VITE_PORT: 3310
      }
    }
  ]
};
