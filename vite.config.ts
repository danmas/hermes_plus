import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// ── Мини-BFF для LAN-агента l1 (192.168.1.221) ────────────────────────────────
// Браузер НЕ может ходить на 221 напрямую: auth_required:true, cookie-сессия
// HttpOnly, CORS-preflight 401 на gated роутах (см. openspec hermes-auth).
// Vite dev-proxy не пробрасывает Set-Cookie, поэтому здесь server-side
// логин + cookie jar в памяти dev-процесса. Это полноценный BFF-слой,
// в проде заменяется Hono/Express (см. KB/README_FLEET.md).
const L1 = {
  origin: 'http://192.168.1.221:9119',
  username: '',
  password: '',
};

function l1ProxyPlugin(): Plugin {
  let cookieJar = '';
  let loginPromise: Promise<string> | null = null;

  /** Ленивый логин: один раз (и после 401), дальше переиспользуем jar */
  async function ensureLogin(): Promise<string> {
    if (cookieJar) return cookieJar;
    if (!loginPromise) {
      loginPromise = (async () => {
        const loginRes = await fetch(L1.origin + '/auth/password-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'basic', username: L1.username, password: L1.password }),
        });
        if (!loginRes.ok) throw new Error(`L1 login failed: HTTP ${loginRes.status}`);
        const setCookies = loginRes.headers.getSetCookie?.() ?? [];
        cookieJar = setCookies
          .map((c) => c.split(';')[0])
          .filter((c) => /^hermes_session_(at|rt|provider)=/.test(c))
          .join('; ');
        if (!cookieJar) throw new Error('L1 login succeeded but no session cookies');
        return cookieJar;
      })().finally(() => {
        loginPromise = null;
      });
    }
    return loginPromise;
  }

  return {
    name: 'hermes-plus-l1-bff',
    configureServer(server) {
      server.middlewares.use('/l1', async (req, res, next) => {
        try {
          const targetUrl = L1.origin + (req.url ?? '/');

          // Логин: проксируем на upstream (клиент может вызвать вручную)
          if (req.url?.startsWith('/auth/password-login')) {
            let body = '';
            for await (const chunk of req) body += chunk;
            const loginRes = await fetch(L1.origin + '/auth/password-login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body,
            });
            const text = await loginRes.text();
            if (loginRes.ok) {
              const setCookies = loginRes.headers.getSetCookie?.() ?? [];
              cookieJar = setCookies
                .map((c) => c.split(';')[0])
                .filter((c) => /^hermes_session_(at|rt|provider)=/.test(c))
                .join('; ');
            }
            res.statusCode = loginRes.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(text);
            return;
          }

          // Остальные /l1/* — с lazy-login cookie jar
          const jar = await ensureLogin().catch(() => cookieJar);
          const headers: Record<string, string> = { Accept: 'application/json' };
          if (jar) headers['Cookie'] = jar;

          const upstream = await fetch(targetUrl, {
            method: req.method,
            headers,
            body: ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : req,
          });
          // 401 → вероятно, сессия истекла: сбросить jar и один раз перелогиниться
          if (upstream.status === 401 && cookieJar) {
            cookieJar = '';
            const fresh = await ensureLogin().catch(() => '');
            const retry = await fetch(targetUrl, {
              method: req.method,
              headers: { ...headers, ...(fresh ? { Cookie: fresh } : {}) },
              body: ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : req,
            });
            const retryText = await retry.text();
            res.statusCode = retry.status;
            res.setHeader('Content-Type', retry.headers.get('content-type') ?? 'application/json');
            res.end(retryText);
            return;
          }
          const upstreamText = await upstream.text();
          res.statusCode = upstream.status;
          res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
          res.end(upstreamText);
        } catch (e) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ detail: `L1 BFF error: ${e instanceof Error ? e.message : String(e)}` }));
        }
      });
    },
  };
}
// ──────────────────────────────────────────────────────────────────────────────

// Порт 5173 — по умолчанию. Не использовать 3000-3002 (заняты Kosmos Panel).
//
// Vite proxy = тонкий BFF на время разработки. Браузер НЕ может ходить на
// 127.0.0.1:9119 напрямую: auth-middleware Hermes отвечает 401 на CORS-preflight
// gated-роутов (см. KB/README_SURVEY.md → «Живой замер auth»). Поэтому все
// /api/* запросы идут same-origin на 5173, а Vite проксирует их на 9119.
export default defineConfig(({ mode }) => {
  // .env.local загружается в import.meta.env для клиента, но process.env им
  // не заполняется — читаем креды l1 здесь, server-side (куки живут тут)
  const env = loadEnv(mode, process.cwd(), '');
  L1.username = env.VITE_HERMES_L1_USERNAME || '';
  L1.password = env.VITE_HERMES_L1_PASSWORD || '';

  return {
    plugins: [react(), l1ProxyPlugin()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        // REST web-API дашборда (локальные профили)
        '/api': {
          target: 'http://127.0.0.1:9119',
          changeOrigin: false,
        },
        // WebSocket-каналы чата (/api/ws, /api/events, /api/pub)
        '/api/ws': {
          target: 'ws://127.0.0.1:9119',
          ws: true,
          changeOrigin: false,
        },
        // Прокси для вебсокетов LAN агента
        '/l1/api/ws': {
          target: 'ws://192.168.1.221:9119',
          ws: true,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/l1/, ''),
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 1200,
    },
  };
});
