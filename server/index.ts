/**
 * server/index — prod-BFF hermes_plus (Hono + Node).
 *
 * Единственный публичный компонент (см. KB/README_SECURITY_PLANS.md):
 *   браузер → https://.... → роутер :8443 → сюда (:8787)
 *
 * Обязанности:
 * 1. Авторизация оператора: пароль → HttpOnly-кука `hp_sid`, rate-limit.
 * 2. Статика собранного UI (dist/) — только после логина.
 * 3. REST-прокси с server-side auth-injection:
 *    - `/api/*`  → локальный Hermes (X-Hermes-Session-Token из env/HTML);
 *    - `/l1/*`   → LAN-агент l1 (cookie jar, lazy-login, автоперелогин при 401).
 * 4. WS-прокси (upgrade): `/api/ws`, `/l1/api/ws` — токены/тикеты подставляет BFF.
 * 5. Sanitize-реестр агентов `GET /api/agents` (без секретов).
 *
 * В браузер НЕ попадают: session-token, креды l1, ws-ticket, agents-config.json.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import { WebSocketServer } from 'ws';

import { loadAgentsRegistry, loadConfig, mergedEnv } from './config';
import {
  LOGIN_HTML,
  SESSION_COOKIE,
  clearLoginFails,
  createSession,
  destroySession,
  isValidSession,
  loginBlockedFor,
  parseCookies,
  recordLoginFail,
  sessionClearCookie,
  sessionSetCookie,
  verifyPassword,
} from './auth';
import {
  ensureL1Login,
  fetchL1WsTicket,
  getLocalToken,
  invalidateLocalToken,
  pickRequestHeaders,
  relayToUpstream,
  resetL1Jar,
  toWsUrl,
  type UpstreamResponse,
} from './upstream';
import { handleUpgrade } from './wsproxy';

// ── Инициализация ─────────────────────────────────────────────────────────────

const CWD = process.cwd();

let cfg: ReturnType<typeof loadConfig>;
try {
  cfg = loadConfig(CWD);
} catch (e) {
  console.error(`[bff] ошибка конфигурации: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

const registry = loadAgentsRegistry(CWD, mergedEnv(CWD));

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
};

type BffEnv = { Bindings: { incoming: IncomingMessage; outgoing: ServerResponse } };
const app = new Hono<BffEnv>();

function clientIp(c: { env: BffEnv['Bindings']; req: { header: (k: string) => string | undefined } }): string {
  const xff = c.req.header('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return c.env.incoming.socket.remoteAddress ?? 'unknown';
}

function isSecureRequest(c: { env: BffEnv['Bindings']; req: { header: (k: string) => string | undefined } }): boolean {
  if (cfg.cookieSecure === '1') return true;
  if (cfg.cookieSecure === '0') return false;
  const proto = c.req.header('x-forwarded-proto') ?? '';
  return proto.split(',')[0].trim() === 'https';
}

function sessionFromCookies(c: { req: { header: (k: string) => string | undefined } }): string | undefined {
  return parseCookies(c.req.header('cookie'))[SESSION_COOKIE];
}

// ── Публичные роуты (до auth-guard) ───────────────────────────────────────────

app.get('/login', (c) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.header(k, v);
  return c.html(LOGIN_HTML);
});

app.post('/auth/login', async (c) => {
  const ip = clientIp(c);
  const blocked = loginBlockedFor(ip);
  if (blocked > 0) {
    return c.json({ error: 'Too many attempts', retry_after: blocked }, 429);
  }
  let password: unknown;
  try {
    const body = (await c.req.json()) as { password?: unknown };
    password = body.password;
  } catch {
    return c.json({ error: 'Bad request: expected JSON {password}' }, 400);
  }
  if (typeof password !== 'string' || !verifyPassword(password, cfg.password)) {
    recordLoginFail(ip);
    console.warn(`[bff] неудачный логин с ${ip}`);
    return c.json({ error: 'Invalid password' }, 401);
  }
  clearLoginFails(ip);
  const sid = createSession(ip);
  c.header('Set-Cookie', sessionSetCookie(sid, isSecureRequest(c)));
  console.log(`[bff] логин ok (${ip})`);
  return c.json({ ok: true });
});

app.post('/auth/logout', (c) => {
  destroySession(sessionFromCookies(c));
  c.header('Set-Cookie', sessionClearCookie(isSecureRequest(c)));
  return c.json({ ok: true });
});

// ── Auth-guard: всё остальное — только с валидной сессией ─────────────────────

app.use('*', async (c, next) => {
  if (!isValidSession(sessionFromCookies(c))) {
    const path = new URL(c.req.url).pathname;
    if (path.startsWith('/api') || path.startsWith('/l1')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    return c.redirect('/login', 302);
  }
  await next();
});

// ── Служебные эндпоинты BFF ───────────────────────────────────────────────────

app.get('/api/me', (c) => c.json({ ok: true, user: 'operator' }));

/** Реестр агентов БЕЗ секретов (sanitize в server/config.ts). */
app.get('/api/agents', (c) => c.json({ agents: registry.publicAgents }));

/** Собрать ответ из буферизованного upstream-ответа. */
function toHonoResponse(up: UpstreamResponse): Response {
  return new Response(new Uint8Array(up.body), {
    status: up.status,
    headers: { ...up.headers, ...SECURITY_HEADERS },
  });
}

// ── REST-прокси: локальный Hermes (/api/*) ────────────────────────────────────

app.all('/api/*', async (c) => {
  const incoming = c.env.incoming;
  const url = new URL(c.req.url);
  const upstreamPath = url.pathname + url.search;
  const method = incoming.method ?? 'GET';
  const headers = pickRequestHeaders(incoming.headers);
  const hasBody = method !== 'GET' && method !== 'HEAD';

  const doRequest = async (token: string | null) => {
    if (token) headers['x-hermes-session-token'] = token;
    return relayToUpstream({
      origin: cfg.localOrigin,
      path: upstreamPath,
      method,
      headers,
      body: hasBody ? incoming : null,
    });
  };

  try {
    const token = await getLocalToken(cfg);
    let up = await doRequest(token);
    // 401 → токен из HTML мог устареть (рестарт Hermes): обновить и повторить один раз
    if (up.status === 401 && !cfg.sessionToken) {
      invalidateLocalToken();
      const fresh = await getLocalToken(cfg);
      if (fresh && fresh !== token) {
        up = await doRequest(fresh);
      }
    }
    return toHonoResponse(up);
  } catch (e) {
    console.warn(`[bff] local proxy error (${upstreamPath}):`, e instanceof Error ? e.message : String(e));
    return c.json({ error: 'Bad Gateway', details: 'local Hermes недоступен' }, 502);
  }
});

// ── REST-прокси: LAN-агент l1 (/l1/*) ─────────────────────────────────────────

/** Пути l1, которые браузеру недоступны (секретные механики — только server-side). */
const L1_DENY = new Set(['/api/auth/ws-ticket', '/auth/password-login', '/api/auth/session-token']);

app.all('/l1/*', async (c) => {
  const incoming = c.env.incoming;
  const url = new URL(c.req.url);
  const stripped = url.pathname.replace(/^\/l1/, '') || '/';
  if (L1_DENY.has(stripped)) {
    return c.json({ error: 'Not Found' }, 404);
  }
  const upstreamPath = stripped + url.search;
  const method = incoming.method ?? 'GET';
  const baseHeaders = pickRequestHeaders(incoming.headers);
  const hasBody = method !== 'GET' && method !== 'HEAD';

  const doRequest = async (jar: string) => {
    return relayToUpstream({
      origin: cfg.l1Origin,
      path: upstreamPath,
      method,
      headers: { ...baseHeaders, ...(jar ? { cookie: jar } : {}) },
      // Тело стримится один раз: при ретрае его уже нет — для POST с телом
      // ретрай не делается (см. ниже).
      body: hasBody ? incoming : null,
    });
  };

  try {
    let jar = await ensureL1Login(cfg).catch(() => '');
    const up = await doRequest(jar);
    if (up.status === 401 && !hasBody) {
      // сессия upstream истекла: сбросить jar, перелогиниться, повторить
      resetL1Jar();
      jar = await ensureL1Login(cfg).catch(() => '');
      return toHonoResponse(await doRequest(jar));
    }
    return toHonoResponse(up);
  } catch (e) {
    console.warn(`[bff] l1 proxy error (${upstreamPath}):`, e instanceof Error ? e.message : String(e));
    return c.json({ error: 'Bad Gateway', details: 'агент l1 недоступен' }, 502);
  }
});

// ── Статика dist/ + SPA-fallback ──────────────────────────────────────────────

// index.html читаем на каждый запрос (не кэшируем): после пересборки dist/
// меняются хэши ассетов, и закэшированный HTML тянет старый бандл.
const SPA_INDEX_PATH = resolve(cfg.distDir, 'index.html');

function spaIndexResponse(c: Context<BffEnv>): Response {
  if (!existsSync(SPA_INDEX_PATH)) {
    return c.text('dist/ не найден: выполните `npm run build`', 503);
  }
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.header(k, v);
  c.header('content-type', 'text/html; charset=utf-8');
  // index.html не кэшировать: после пересборки меняются хэши ассетов,
  // и закэшированный HTML тянет старый бандл
  c.header('cache-control', 'no-cache, must-revalidate');
  return c.body(readFileSync(SPA_INDEX_PATH));
}

// Явно ДО serveStatic, чтобы index.html не отдавался из статики без no-cache
app.get('/', (c) => spaIndexResponse(c));
app.get('/index.html', (c) => spaIndexResponse(c));

app.use('/*', serveStatic({ root: './dist' }));

// SPA-fallback: клиентские маршруты (например /login уже обработан выше)
app.get('*', (c) => spaIndexResponse(c));

// ── HTTP-сервер + WS-upgrade ──────────────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true });

const nodeServer = serve(
  { fetch: app.fetch, port: cfg.port, hostname: '0.0.0.0' },
  (info) => {
    console.log(`[bff] hermes_plus BFF: http://127.0.0.1:${info.port}`);
    console.log(`[bff] local → ${cfg.localOrigin} | l1 → ${cfg.l1Origin}`);
    console.log(`[bff] агентов в реестре: ${registry.agents.length}`);
    if (!existsSync(resolve(cfg.distDir, 'index.html'))) {
      console.warn('[bff] ВНИМАНИЕ: dist/index.html отсутствует — UI не будет работать (npm run build)');
    }
  },
);

nodeServer.on('upgrade', (req, socket, head) => {
  void (async () => {
    const cookies = parseCookies(req.headers.cookie);
    if (!isValidSession(cookies[SESSION_COOKIE])) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    const pathname = new URL(req.url ?? '', 'http://localhost').pathname;

    if (pathname === '/api/ws') {
      await handleUpgrade({
        req,
        socket,
        head,
        wss,
        prepare: async (q) => {
          const token = await getLocalToken(cfg);
          if (!token) return null;
          q.set('token', token);
          return { url: toWsUrl(cfg.localOrigin, '/api/ws', `?${q.toString()}`) };
        },
      });
      return;
    }

    if (pathname === '/l1/api/ws') {
      await handleUpgrade({
        req,
        socket,
        head,
        wss,
        prepare: async (q) => {
          try {
            const jar = await ensureL1Login(cfg);
            const ticket = await fetchL1WsTicket(cfg, jar);
            if (!ticket) return null;
            q.set('ticket', ticket);
            return {
              url: toWsUrl(cfg.l1Origin, '/api/ws', `?${q.toString()}`),
              headers: { Cookie: jar },
            };
          } catch (e) {
            console.warn('[bff:ws] l1 prepare failed:', e instanceof Error ? e.message : String(e));
            return null;
          }
        },
      });
      return;
    }

    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  })();
});

process.on('SIGINT', () => {
  console.log('\n[bff] SIGINT — остановка');
  wss.close();
  nodeServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
});
