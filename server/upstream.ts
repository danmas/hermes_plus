/**
 * server/upstream — работа BFF с агентами Hermes (server-side auth).
 *
 * Здесь живут ВСЕ секреты (KB/README_SECURITY_PLANS.md):
 * - session-token локального Hermes: env HERMES_DASHBOARD_SESSION_TOKEN
 *   либо парсинг `SESSION_TOKEN__="..."` из SPA HTML (`GET {origin}/`);
 * - cookie-jar l1: lazy-login `POST /auth/password-login`, автоперелогин при 401.
 *
 * В браузер ничего из этого не попадает.
 */
import http from 'node:http';
import https from 'node:https';
import type { Readable } from 'node:stream';
import type { BffConfig } from './config';

const DEFAULT_TIMEOUT_MS = 30_000;

// ── Session-token локального Hermes ──────────────────────────────────────────

let tokenCache: { token: string; fetchedAt: number } | null = null;
const TOKEN_TTL_MS = 10 * 60 * 1000;

/** Получить session-token локального агента (env → кэш → парсинг SPA HTML). */
export async function getLocalToken(cfg: BffConfig): Promise<string | null> {
  if (cfg.sessionToken) return cfg.sessionToken;
  if (tokenCache && Date.now() - tokenCache.fetchedAt < TOKEN_TTL_MS) {
    return tokenCache.token;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5_000);
    const res = await fetch(cfg.localOrigin + '/', { signal: ctrl.signal });
    clearTimeout(t);
    const html = await res.text();
    const m = html.match(/SESSION_TOKEN__\s*=\s*"([^"]+)"/);
    if (m?.[1]) {
      tokenCache = { token: m[1], fetchedAt: Date.now() };
      return m[1];
    }
  } catch {
    /* upstream недоступен — вернём устаревший кэш, если есть */
  }
  return tokenCache?.token ?? null;
}

export function invalidateLocalToken(): void {
  tokenCache = null;
}

// ── Cookie-jar l1 (аналог мини-BFF из vite.config.ts) ─────────────────────────

let l1Jar = '';
let l1LoginPromise: Promise<string> | null = null;

/** Ленивый логин на l1: один раз (и после сброса jar), дальше переиспользуем. */
export function ensureL1Login(cfg: BffConfig): Promise<string> {
  if (l1Jar) return Promise.resolve(l1Jar);
  if (!l1LoginPromise) {
    l1LoginPromise = (async () => {
      if (!cfg.l1Username || !cfg.l1Password) {
        throw new Error('креды l1 не заданы (HERMES_L1_USERNAME / HERMES_L1_PASSWORD)');
      }
      const res = await fetch(cfg.l1Origin + '/auth/password-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'basic', username: cfg.l1Username, password: cfg.l1Password }),
      });
      if (!res.ok) throw new Error(`L1 login failed: HTTP ${res.status}`);
      const setCookies = res.headers.getSetCookie?.() ?? [];
      l1Jar = setCookies
        .map((c) => c.split(';')[0])
        .filter((c) => /^hermes_session_(at|rt|provider)=/.test(c))
        .join('; ');
      if (!l1Jar) throw new Error('L1 login succeeded but no session cookies');
      return l1Jar;
    })().finally(() => {
      l1LoginPromise = null;
    });
  }
  return l1LoginPromise;
}

export function resetL1Jar(): void {
  l1Jar = '';
}

export function getL1Jar(): string {
  return l1Jar;
}

/** Одноразовый WS-тикет l1 (TTL 30 с) — для WS-handshake, живёт только на сервере. */
export async function fetchL1WsTicket(cfg: BffConfig, jar: string): Promise<string | null> {
  try {
    const res = await fetch(cfg.l1Origin + '/api/auth/ws-ticket', {
      method: 'POST',
      headers: { Cookie: jar, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ticket?: string };
    return data.ticket ?? null;
  } catch {
    return null;
  }
}

// ── Cookie-jar .254 (рабочий комп, аналог l1) ────────────────────────────────

let l254Jar = '';
let l254LoginPromise: Promise<string> | null = null;

/** Ленивый логин на .254: один раз (и после сброса jar), дальше переиспользуем. */
export function ensureL254Login(cfg: BffConfig): Promise<string> {
  if (l254Jar) return Promise.resolve(l254Jar);
  if (!l254LoginPromise) {
    l254LoginPromise = (async () => {
      if (!cfg.l254Username || !cfg.l254Password) {
        throw new Error('креды .254 не заданы (HERMES_L254_USERNAME / HERMES_L254_PASSWORD)');
      }
      const res = await fetch(cfg.l254Origin + '/auth/password-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'basic', username: cfg.l254Username, password: cfg.l254Password }),
      });
      if (!res.ok) throw new Error(`L254 login failed: HTTP ${res.status}`);
      const setCookies = res.headers.getSetCookie?.() ?? [];
      l254Jar = setCookies
        .map((c) => c.split(';')[0])
        .filter((c) => /^hermes_session_(at|rt|provider)=/.test(c))
        .join('; ');
      if (!l254Jar) throw new Error('L254 login succeeded but no session cookies');
      return l254Jar;
    })().finally(() => {
      l254LoginPromise = null;
    });
  }
  return l254LoginPromise;
}

export function resetL254Jar(): void {
  l254Jar = '';
}

export function getL254Jar(): string {
  return l254Jar;
}

/** Одноразовый WS-тикет .254 (TTL 30 с) — для WS-handshake, живёт только на сервере. */
export async function fetchL254WsTicket(cfg: BffConfig, jar: string): Promise<string | null> {
  try {
    const res = await fetch(cfg.l254Origin + '/api/auth/ws-ticket', {
      method: 'POST',
      headers: { Cookie: jar, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ticket?: string };
    return data.ticket ?? null;
  } catch {
    return null;
  }
}

// ── REST-ретрансляция ─────────────────────────────────────────────────────────

export interface UpstreamResponse {
  status: number;
  /** Отфильтрованные заголовки (без hop-by-hop и Set-Cookie). */
  headers: Record<string, string>;
  body: Buffer;
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'set-cookie',
  'content-length', // пересчитываем сами по буферу
]);

function filterResponseHeaders(raw: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!v || HOP_BY_HOP.has(k.toLowerCase())) continue;
    out[k] = Array.isArray(v) ? v.join(', ') : v;
  }
  return out;
}

/**
 * Выполнить запрос к upstream и вернуть буферизованный ответ.
 * Тело запроса (если есть) стримится из clientReq.
 */
export function relayToUpstream(opts: {
  origin: string;
  path: string; // с query: '/api/skills?profile=x'
  method: string;
  headers: Record<string, string>;
  body?: Readable | null;
  timeoutMs?: number;
}): Promise<UpstreamResponse> {
  return new Promise((resolvePromise, rejectPromise) => {
    const url = new URL(opts.origin + opts.path);
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      {
        method: opts.method,
        headers: { ...opts.headers, host: url.host },
        timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolvePromise({
            status: res.statusCode ?? 502,
            headers: filterResponseHeaders(res.headers),
            body: Buffer.concat(chunks),
          }),
        );
        res.on('error', rejectPromise);
      },
    );
    req.on('timeout', () => req.destroy(new Error(`upstream timeout (${opts.path})`)));
    req.on('error', rejectPromise);
    if (opts.body) {
      opts.body.pipe(req);
    } else {
      req.end();
    }
  });
}

/** Записать буферизованный upstream-ответ в клиентский ServerResponse. */
export function writeUpstreamResponse(
  out: http.ServerResponse,
  up: UpstreamResponse,
  extraHeaders?: Record<string, string>,
): void {
  out.writeHead(up.status, {
    ...up.headers,
    ...(extraHeaders ?? {}),
    'content-length': String(up.body.length),
  });
  out.end(up.body);
}

/** Заголовки запроса к upstream из клиентских (убрать hop-by-hop/cookie/host). */
export function pickRequestHeaders(raw: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!v) continue;
    const lk = k.toLowerCase();
    if (HOP_BY_HOP.has(lk) || lk === 'host' || lk === 'cookie' || lk === 'authorization') continue;
    out[k] = Array.isArray(v) ? v.join(', ') : v;
  }
  return out;
}

/** ws(s):// URL из http(s):// origin + путь + query. */
export function toWsUrl(origin: string, path: string, search: string): string {
  const u = new URL(origin + path + (search || ''));
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u.toString();
}
