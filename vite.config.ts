import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expandEnvPlaceholders } from './src/config/envSubst';
import type { AgentTarget, AgentAuthType } from './src/types/agent';

// ── Middleware GET /api/agents ────────────────────────────────────────────────
// Читает agents-config.json из корня проекта, раскрывает ${ENV_VAR},
// валидирует, отдаёт клиенту FleetConfig. Аутентификация не требуется.
// Клиент (src/config/loadAgents.ts) на ошибку падает на хардкод-fallback.
const VALID_AUTH_TYPES: AgentAuthType[] = ['none', 'session-token', 'bearer', 'cookie'];

/** Проверка структуры конфига. Возвращает сообщение об ошибке или null. */
function validateAgents(agents: unknown): string | null {
  if (!Array.isArray(agents)) {
    return 'поле "agents" должно быть массивом';
  }
  const seen = new Set<string>();
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i] as Partial<AgentTarget>;
    const where = `agents[${i}]`;
    if (!a || typeof a !== 'object') return `${where}: элемент не является объектом`;
    if (!a.id || typeof a.id !== 'string') return `${where}: отсутствует обязательное поле "id"`;
    if (seen.has(a.id)) return `дублирующийся id агента: "${a.id}"`;
    seen.add(a.id);
    if (!a.name || typeof a.name !== 'string') {
      return `${where} (id=${a.id}): отсутствует обязательное поле "name"`;
    }
    if (!a.auth || typeof a.auth !== 'object' || typeof a.auth.type !== 'string') {
      return `${where} (id=${a.id}): отсутствует обязательное поле "auth.type"`;
    }
    if (!VALID_AUTH_TYPES.includes(a.auth.type as AgentAuthType)) {
      return `${where} (id=${a.id}): недопустимый auth.type "${a.auth.type}"; допустимые: ${VALID_AUTH_TYPES.join(', ')}`;
    }
  }
  return null;
}

function agentsConfigPlugin(env: Record<string, string>): Plugin {
  const configPath = resolve(process.cwd(), 'agents-config.json');
  return {
    name: 'hermes-plus-agents-config',
    configureServer(server) {
      server.middlewares.use('/api/agents', async (req, res) => {
        const sendJson = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        try {
          let raw: string;
          try {
            raw = await readFile(configPath, 'utf-8');
          } catch {
            sendJson(404, { error: 'agents-config.json not found' });
            return;
          }
          let parsed: { agents?: unknown };
          try {
            parsed = JSON.parse(raw);
          } catch (e) {
            sendJson(500, {
              error: 'Invalid JSON',
              details: e instanceof Error ? e.message : String(e),
            });
            return;
          }
          // env-подстановка: middleware имеет доступ к полному env (loadEnv)
          const resolved = expandEnvPlaceholders(parsed, env) as { agents?: unknown };
          const validationError = validateAgents(resolved.agents);
          if (validationError) {
            sendJson(500, { error: 'Invalid agents config', details: validationError });
            return;
          }
          sendJson(200, { agents: resolved.agents });
        } catch (e) {
          sendJson(500, {
            error: 'agents middleware error',
            details: e instanceof Error ? e.message : String(e),
          });
        }
      });

      // Dev-заглушка /api/me: в dev нет prod-BFF auth-guard, но фронт
      // (App.tsx) при старте дёргает /api/me. Без этой заглушки запрос
      // ушёл бы через proxy на Hermes :9119, тот вернул бы 401 на неизвестный
      // gated-роут → App делает redirect на /login → /login отдаёт тот же SPA
      // → снова /api/me → 401 → бесконечный цикл. Отдаём 404, чтобы guard
      // пропустил UI (см. комментарий в App.tsx).
      server.middlewares.use('/api/me', (_req, res) => {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'no auth-guard in dev' }));
      });

      // Dev-эндпоинт получения session token из локального Hermes
      server.middlewares.use('/api/auth/session-token', async (_req, res) => {
        try {
          const upstream = await fetch('http://127.0.0.1:9119/');
          const html = await upstream.text();
          const m = html.match(/SESSION_TOKEN__\s*=\s*"([^"]+)"/);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ token: m ? m[1] : null }));
        } catch (e) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Failed to fetch session token from upstream', details: e instanceof Error ? e.message : String(e) }));
        }
      });

      // WS-тикет для local Hermes (auth_required: true — cookie login server-side)
      server.middlewares.use('/api/auth/ws-ticket', async (req, res) => {
        if (req.method !== 'POST' && req.method !== 'GET') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'POST or GET' }));
          return;
        }
        try {
          const headers: Record<string, string> = { Accept: 'application/json' };
          if (LOCAL.username && LOCAL.password) {
            const jar = await ensureLocalLogin();
            if (jar) headers['Cookie'] = jar;
          }
          const token =
            process.env.HERMES_DASHBOARD_SESSION_TOKEN ||
            (await (async () => {
              try {
                const r = await fetch('http://127.0.0.1:9119/');
                const html = await r.text();
                return html.match(/SESSION_TOKEN__\s*=\s*"([^"]+)"/)?.[1] ?? '';
              } catch {
                return '';
              }
            })());
          if (token) headers['X-Hermes-Session-Token'] = token;

          const upstream = await fetch('http://127.0.0.1:9119/api/auth/ws-ticket', {
            method: 'POST',
            headers,
          });
          const text = await upstream.text();
          res.statusCode = upstream.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(text);
        } catch (e) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: 'Failed to mint local WS ticket',
              details: e instanceof Error ? e.message : String(e),
            }),
          );
        }
      });
    },
  };
}

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
  cookieJar: '',
  loginPromise: null as Promise<string> | null,
};

/** Local Hermes (127.0.0.1:9119) cookie jar when auth_required and no SESSION_TOKEN__ */
const LOCAL = {
  origin: 'http://127.0.0.1:9119',
  username: '',
  password: '',
  cookieJar: '',
  loginPromise: null as Promise<string> | null,
};

async function ensureLocalLogin(): Promise<string> {
  if (LOCAL.cookieJar) return LOCAL.cookieJar;
  if (!LOCAL.loginPromise) {
    LOCAL.loginPromise = (async () => {
      if (!LOCAL.username || !LOCAL.password) {
        throw new Error(
          'local Hermes auth_required: set HERMES_LOCAL_USERNAME / HERMES_LOCAL_PASSWORD in .env.local',
        );
      }
      const loginRes = await fetch(LOCAL.origin + '/auth/password-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'basic',
          username: LOCAL.username,
          password: LOCAL.password,
        }),
      });
      if (!loginRes.ok) throw new Error(`local Hermes login failed: HTTP ${loginRes.status}`);
      const setCookies = loginRes.headers.getSetCookie?.() ?? [];
      LOCAL.cookieJar = setCookies
        .map((c) => c.split(';')[0])
        .filter((c) => /^hermes_session_(at|rt|provider)=/.test(c))
        .join('; ');
      if (!LOCAL.cookieJar) throw new Error('local login ok but no session cookies');
      return LOCAL.cookieJar;
    })().finally(() => {
      LOCAL.loginPromise = null;
    });
  }
  return LOCAL.loginPromise;
}

/** Ленивый логин: один раз (и после 401), дальше переиспользуем jar */
async function ensureL1Login(): Promise<string> {
  if (L1.cookieJar) return L1.cookieJar;
  if (!L1.loginPromise) {
    L1.loginPromise = (async () => {
      const loginRes = await fetch(L1.origin + '/auth/password-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'basic', username: L1.username, password: L1.password }),
      });
      if (!loginRes.ok) throw new Error(`L1 login failed: HTTP ${loginRes.status}`);
      const setCookies = loginRes.headers.getSetCookie?.() ?? [];
      L1.cookieJar = setCookies
        .map((c) => c.split(';')[0])
        .filter((c) => /^hermes_session_(at|rt|provider)=/.test(c))
        .join('; ');
      if (!L1.cookieJar) throw new Error('L1 login succeeded but no session cookies');
      return L1.cookieJar;
    })().finally(() => {
      L1.loginPromise = null;
    });
  }
  return L1.loginPromise;
}

function l1ProxyPlugin(): Plugin {

  return {
    name: 'hermes-plus-l1-bff',
    configureServer(server) {
      server.middlewares.use('/l1', async (req, res, next) => {
        try {
          const targetUrl = L1.origin + (req.url ?? '/');

          // Сессионный токен L1 для WebSocket-подключений
          if (req.url === '/api/auth/session-token') {
            try {
              const jar = await ensureL1Login().catch(() => L1.cookieJar);
              const upstream = await fetch(L1.origin + '/', {
                headers: jar ? { Cookie: jar } : {},
              });
              const html = await upstream.text();
              const m = html.match(/SESSION_TOKEN__\s*=\s*"([^"]+)"/);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ token: m ? m[1] : null }));
            } catch (e) {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Failed to fetch L1 session token', details: e instanceof Error ? e.message : String(e) }));
            }
            return;
          }

          // WS ticket для cookie-auth агента (gated Hermes требует ticket на /api/ws)
          if (req.url === '/api/auth/ws-ticket') {
            try {
              const jar = await ensureL1Login();
              const upstream = await fetch(L1.origin + '/api/auth/ws-ticket', {
                method: 'POST',
                headers: { Cookie: jar, Accept: 'application/json' },
              });
              const text = await upstream.text();
              res.statusCode = upstream.status;
              res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
              res.end(text);
            } catch (e) {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Failed to fetch L1 WS ticket', details: e instanceof Error ? e.message : String(e) }));
            }
            return;
          }

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
              L1.cookieJar = setCookies
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
          const jar = await ensureL1Login().catch(() => L1.cookieJar);
          const headers: Record<string, string> = { Accept: 'application/json' };
          if (jar) headers['Cookie'] = jar;

          const upstream = await fetch(targetUrl, {
            method: req.method,
            headers,
            body: ['GET', 'HEAD'].includes(req.method ?? '') ? undefined : req,
          });
          // 401 → вероятно, сессия истекла: сбросить jar и один раз перелогиниться
          if (upstream.status === 401 && L1.cookieJar) {
            L1.cookieJar = '';
            const fresh = await ensureL1Login().catch(() => '');
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
/**
 * Dev: skill export/import (same as prod BFF routes).
 * Without this, POST /api/skills/export hits Hermes → 405.
 * Installs at the FRONT of the middleware stack (post-hook + unshift)
 * so it always wins over the /api → :9119 proxy.
 */
function skillTransferPlugin(): Plugin {
  async function handleSkillTransfer(
    req: import('http').IncomingMessage,
    res: import('http').ServerResponse,
    next: (err?: unknown) => void,
  ) {
    const pathOnly = (req.url || '').split('?')[0].replace(/\/+$/, '') || '/';
    const isExport = pathOnly === '/api/skills/export' || pathOnly.endsWith('/api/skills/export');
    const isImport = pathOnly === '/api/skills/import' || pathOnly.endsWith('/api/skills/import');
    if (!isExport && !isImport) {
      return next();
    }
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'POST only' }));
      return;
    }

    const sendJson = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
    };

    console.log(`[vite] skill-transfer ${req.method} ${pathOnly}`);

    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString('utf8') || '{}';
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        sendJson(400, { error: 'Invalid JSON body' });
        return;
      }

      const { loadConfig, loadAgentsRegistry, mergedEnv } = await import('./server/config.ts');
      const { createAgentHttp, AgentHttpError } = await import('./server/agent-http.ts');
      const { validatePackage } = await import('./server/skill-package.ts');
      const {
        exportSkillPackage,
        importSkillPackage,
        findAgent,
        tryAcquireImportLock,
        releaseImportLock,
      } = await import('./server/skill-transfer.ts');

      const cwd = process.cwd();
      let cfg: ReturnType<typeof loadConfig>;
      try {
        cfg = loadConfig(cwd);
      } catch (e) {
        const envAll = mergedEnv(cwd);
        cfg = {
          port: 8787,
          username: 'dev',
          password: 'x'.repeat(24),
          cookieSecure: '0',
          localOrigin: (envAll.HERMES_LOCAL_ORIGIN || 'http://127.0.0.1:9119').replace(/\/$/, ''),
          l1Origin: (envAll.HERMES_L1_ORIGIN || 'http://192.168.1.221:9119').replace(/\/$/, ''),
          l254Origin: (envAll.HERMES_L254_ORIGIN || 'http://192.168.1.254:9119').replace(
            /\/$/,
            '',
          ),
          sessionToken: envAll.HERMES_DASHBOARD_SESSION_TOKEN || null,
          l1Username: envAll.HERMES_L1_USERNAME || envAll.VITE_HERMES_L1_USERNAME || '',
          l1Password: envAll.HERMES_L1_PASSWORD || envAll.VITE_HERMES_L1_PASSWORD || '',
          l254Username: envAll.HERMES_L254_USERNAME || envAll.VITE_HERMES_L254_USERNAME || '',
          l254Password: envAll.HERMES_L254_PASSWORD || envAll.VITE_HERMES_L254_PASSWORD || '',
          distDir: resolve(cwd, 'dist'),
        };
        if (e instanceof Error) {
          console.warn('[vite] skill-transfer: loadConfig failed, using dev cfg:', e.message);
        }
      }

      const registry = loadAgentsRegistry(cwd, mergedEnv(cwd));
      const agents = registry.agents;

      if (isExport) {
        const agentId = String(body.agentId || '').trim();
        const skillName = String(body.skillName || '').trim();
        if (!agentId || !skillName) {
          sendJson(400, { error: 'agentId and skillName required' });
          return;
        }
        const agent = findAgent(agents, agentId);
        if (!agent) {
          sendJson(404, { error: `unknown agentId: ${agentId}` });
          return;
        }
        try {
          const http = createAgentHttp(cfg, agent);
          const pkg = await exportSkillPackage(http, skillName);
          sendJson(200, { ok: true, package: pkg });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const status = e instanceof AgentHttpError ? e.status : 500;
          console.warn('[vite] skill export fail:', msg);
          sendJson(status >= 400 && status < 600 ? status : 500, { error: msg });
        }
        return;
      }

      const agentId = String(body.agentId || '').trim();
      if (!agentId) {
        sendJson(400, { error: 'agentId required' });
        return;
      }
      const agent = findAgent(agents, agentId);
      if (!agent) {
        sendJson(404, { error: `unknown agentId: ${agentId}` });
        return;
      }
      const checked = validatePackage(body.package);
      if (!checked.ok) {
        sendJson(400, { error: checked.error });
        return;
      }
      const pkg = checked.package;
      const name = String(body.nameOverride || pkg.name).trim();
      if (!tryAcquireImportLock(agentId, name)) {
        sendJson(409, { error: 'import already in progress for this skill on target' });
        return;
      }
      try {
        const http = createAgentHttp(cfg, agent);
        const result = await importSkillPackage(http, pkg, name);
        sendJson(200, { ok: true, ...result });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const cleanedUp = Boolean((e as { cleanedUp?: boolean }).cleanedUp);
        const cleanupFailed = Boolean((e as { cleanupFailed?: boolean }).cleanupFailed);
        const status =
          e instanceof AgentHttpError ? e.status : msg.includes('already exists') ? 409 : 500;
        console.warn('[vite] skill import fail:', msg);
        sendJson(status >= 400 && status < 600 ? status : 500, {
          error: msg,
          cleanedUp,
          cleanupFailed,
        });
      } finally {
        releaseImportLock(agentId, name);
      }
    } catch (e) {
      sendJson(500, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    name: 'hermes-plus-skill-transfer',
    configureServer(server) {
      // After internal middlewares are installed, force our handler to the FRONT
      // so the /api → :9119 proxy never sees export/import.
      return () => {
        server.middlewares.stack.unshift({
          route: '',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          handle: handleSkillTransfer as any,
        });
        console.log('[vite] skill-transfer middleware installed (export/import)');
      };
    },
  };
}

/**
 * Local Hermes /api proxy with await cookie/token inject (auth_required:true).
 * Handles requests before Vite proxy so first requests are not unauthenticated.
 */
function localApiAuthPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'hermes-plus-local-api-auth',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        // Only REST /api/* — not our special middleware routes, not WS upgrade
        if (!url.startsWith('/api/')) return next();
        if (
          url.startsWith('/api/agents') ||
          url.startsWith('/api/me') ||
          url.startsWith('/api/auth/session-token') ||
          url.startsWith('/api/auth/ws-ticket') ||
          url.startsWith('/api/skills/export') ||
          url.startsWith('/api/skills/import') ||
          url.startsWith('/api/ws') ||
          url.startsWith('/api/events') ||
          url.startsWith('/api/pub')
        ) {
          return next();
        }
        if (req.headers.upgrade?.toLowerCase() === 'websocket') return next();

        try {
          const headers: Record<string, string> = {
            Accept: req.headers.accept || 'application/json',
          };
          if (req.headers['content-type']) {
            headers['Content-Type'] = String(req.headers['content-type']);
          }
          const token = env.HERMES_DASHBOARD_SESSION_TOKEN || '';
          if (token) headers['X-Hermes-Session-Token'] = token;

          if (LOCAL.username && LOCAL.password) {
            try {
              const jar = await ensureLocalLogin();
              if (jar) headers['Cookie'] = jar;
            } catch (e) {
              console.warn(
                '[vite] local Hermes login failed:',
                e instanceof Error ? e.message : e,
              );
            }
          }

          const method = req.method || 'GET';
          let body: Buffer | undefined;
          if (method !== 'GET' && method !== 'HEAD') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            body = Buffer.concat(chunks);
          }

          const upstream = await fetch(LOCAL.origin + url, {
            method,
            headers,
            body: body && body.length ? body : undefined,
          });

          if (upstream.status === 401 && LOCAL.cookieJar) {
            LOCAL.cookieJar = '';
            try {
              const jar = await ensureLocalLogin();
              if (jar) headers['Cookie'] = jar;
            } catch {
              /* keep going */
            }
            const retry = await fetch(LOCAL.origin + url, {
              method,
              headers,
              body: body && body.length ? body : undefined,
            });
            const retryBuf = Buffer.from(await retry.arrayBuffer());
            res.statusCode = retry.status;
            const ct = retry.headers.get('content-type');
            if (ct) res.setHeader('Content-Type', ct);
            res.end(retryBuf);
            return;
          }

          const buf = Buffer.from(await upstream.arrayBuffer());
          res.statusCode = upstream.status;
          const ct = upstream.headers.get('content-type');
          if (ct) res.setHeader('Content-Type', ct);
          res.end(buf);
        } catch (e) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              detail: `local API BFF error: ${e instanceof Error ? e.message : String(e)}`,
            }),
          );
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
  LOCAL.username =
    env.HERMES_LOCAL_USERNAME || env.VITE_HERMES_LOCAL_USERNAME || '';
  LOCAL.password =
    env.HERMES_LOCAL_PASSWORD || env.VITE_HERMES_LOCAL_PASSWORD || '';

  // Чтобы server/loadConfig и ensureLocalLogin видели .env.local
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }

  return {
    plugins: [
      react(),
      agentsConfigPlugin(env),
      skillTransferPlugin(),
      localApiAuthPlugin(env),
      l1ProxyPlugin(),
    ],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        // Fallback REST (если middleware не перехватил)
        '/api': {
          target: 'http://127.0.0.1:9119',
          changeOrigin: false,
        },
        // Dashboard login for local
        '/auth': {
          target: 'http://127.0.0.1:9119',
          changeOrigin: false,
        },
        // WebSocket-каналы чата (/api/ws, /api/events, /api/pub)
        '/api/ws': {
          target: 'ws://127.0.0.1:9119',
          ws: true,
          changeOrigin: false,
          configure: (proxy) => {
            proxy.on('proxyReqWs', (proxyReq) => {
              // Cookie/token на upgrade — доп. к ?ticket= из клиента
              if (LOCAL.cookieJar) proxyReq.setHeader('Cookie', LOCAL.cookieJar);
              else if (LOCAL.username && LOCAL.password) {
                void ensureLocalLogin()
                  .then((jar) => {
                    /* jar warm for next reconnect */
                    void jar;
                  })
                  .catch(() => {});
              }
              const token = env.HERMES_DASHBOARD_SESSION_TOKEN || '';
              if (token) proxyReq.setHeader('X-Hermes-Session-Token', token);
            });
          },
        },
        // Прокси для вебсокетов LAN агента (с пробросом auth-кук из BFF)
        '/l1/api/ws': {
          target: 'ws://192.168.1.221:9119',
          ws: true,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/l1/, ''),
          configure: (proxy) => {
            proxy.on('proxyReqWs', (_proxyReq, _req) => {
              if (L1.cookieJar) {
                _proxyReq.setHeader('Cookie', L1.cookieJar);
              }
            });
          },
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 1200,
    },
  };
});
