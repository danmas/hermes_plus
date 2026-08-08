// PM2 config for hermes_plus — prod-BFF (Hono, server/)
// Перед запуском: npm run build (dist/ + dist-server/index.mjs)
// Start:  pm2 start ecosystem.config.cjs
// Stop:   pm2 stop hermes_plus
// Логи:   pm2 logs hermes_plus
//
// Примечание: старый dev-режим (Vite) через PM2 больше не поднимаем —
// dev-эндпоинты (/api/auth/session-token) отдают токен полного доступа
// и не должны быть в сети (см. KB/README_SECURITY_PLANS.md).
module.exports = {
  apps: [
    {
      name: 'hermes_plus',
      cwd: 'C:/ERV/projects-ex/hermes_plus',
      script: 'dist-server/index.mjs',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        // Порт и секреты — в .env.local (читает server/config.ts),
        // здесь только не-секретные дефолты
        PORT: 8787
      }
    }
  ]
};
