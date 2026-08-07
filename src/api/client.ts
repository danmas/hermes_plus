/**
 * REST-клиент к web-API дашборда Hermes.
 *
 * Два механизма auth (живой замер 2026-08-06, см. KB/README_SURVEY.md):
 * 1. `session-token` — заголовок `X-Hermes-Session-Token` (loopback, auth_required:false).
 *    Токен из env HERMES_DASHBOARD_SESSION_TOKEN или парсится из SPA HTML (GET /).
 * 2. `cookie` — POST /auth/password-login → cookie-сессия (gated, auth_required:true,
 *    напр. LAN-агент 192.168.1.221). Куки шлются заголовком `Cookie`.
 *
 * Выбор механизма — через feature-detection: GET /api/health → auth_required.
 * Для браузера cookie-таргеты ходят только через dev-proxy (CORS + HttpOnly).
 */
import type { AgentTarget } from '../types/agent';
import type { ApiErrorBody, HermesHealth } from '../types/hermes';

export class HermesApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'HermesApiError';
  }
}

/**
 * Вытащить SESSION_TOKEN__ из SPA HTML Hermes.
 *
 * Ходим на прямой 127.0.0.1:9119 (НЕ через Vite proxy): проксированный `/`
 * отдаёт наш index.html, а не Hermes SPA. GET `/` — simple request без
 * кастомных заголовков, поэтому CORS-preflight не нужен и браузер его пускает
 * (CORS Hermes разрешает localhost-происхождения). Токен используем дальше
 * для API-запросов через прокси.
 */
async function fetchSessionToken(baseUrl: string): Promise<string | null> {
  try {
    // baseUrl='' → прямой loopback (токен живёт в Hermes, не в нашем Vite)
    const target = baseUrl || 'http://127.0.0.1:9119';
    const res = await fetch(`${target}/`);
    const html = await res.text();
    const m = html.match(/SESSION_TOKEN__\s*=\s*"([^"]+)"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export interface HermesClientOptions {
  baseUrl: string;
  /** Путь-префикс dev-proxy для удалённых агентов (напр. '/l1') */
  proxyPath?: string;
  profile?: string;
  /** Явный токен (из env HERMES_DASHBOARD_SESSION_TOKEN) */
  token?: string;
  fetchToken?: boolean;
  timeoutMs?: number;
  /** Механизм auth. По умолчанию — автоопределение через /api/health */
  authType?: 'session-token' | 'cookie';
  /** Для cookie-auth: логин/пароль */
  username?: string;
  password?: string;
}

type AuthMode = 'session-token' | 'cookie' | 'none';

export class HermesClient {
  readonly baseUrl: string;
  readonly proxyPath: string;
  readonly profile?: string;
  private token: string | null = null;
  private cookies: string | null = null;
  private authMode: AuthMode | null = null;
  private username?: string;
  private password?: string;
  private timeoutMs: number;

  constructor(opts: HermesClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.proxyPath = opts.proxyPath ?? '';
    this.profile = opts.profile;
    this.token = opts.token ?? null;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.username = opts.username;
    this.password = opts.password;
    // При proxyPath куками управляет серверный мини-BFF (vite.config.ts) —
    // клиент не логинится сам, auth не нужен.
    if (this.proxyPath) {
      this.authMode = 'none';
    } else if (opts.authType) {
      this.authMode = opts.authType;
    }
    if (!this.token && opts.fetchToken !== false) {
      // ленивый fetch токена — при первом запросе
      void this.ensureAuth();
    }
  }

  /** Гарантировать auth: выбрать механизм, получить токен/куки */
  async ensureAuth(): Promise<void> {
    if (!this.authMode) {
      this.authMode = await this.detectAuthMode();
    }
    if (this.authMode === 'session-token' && !this.token) {
      this.token = await fetchSessionToken(this.baseUrl);
    }
    if (this.authMode === 'cookie' && !this.cookies) {
      this.cookies = await this.passwordLogin();
    }
  }

  /** Feature-detection: /api/health → auth_required */
  private async detectAuthMode(): Promise<AuthMode> {
    try {
      const health = await this.rawRequest<HermesHealth>(this.authUrl('/api/health'));
      if (health?.auth_required) return 'cookie';
      return this.username || this.password ? 'cookie' : 'session-token';
    } catch {
      // нет health — пробуем session-token как раньше
      return this.username || this.password ? 'cookie' : 'session-token';
    }
  }

  /** POST /auth/password-login → собрать Cookie header */
  private async passwordLogin(): Promise<string> {
    const u = this.authUrl('/auth/password-login');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          provider: 'basic',
          username: this.username,
          password: this.password,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new HermesApiError(res.status, `Login failed: HTTP ${res.status}`);
      const setCookies = res.headers.getSetCookie?.() ?? [];
      const cookies = setCookies
        .map((c) => c.split(';')[0])
        .filter((c) => /^hermes_session_(at|rt|provider)=/.test(c));
      if (cookies.length === 0) throw new HermesApiError(0, 'Login succeeded but no session cookies');
      return cookies.join('; ');
    } finally {
      clearTimeout(t);
    }
  }

  /** Базовый origin+путь: baseUrl если задан, иначе window.location.origin + proxyPath */
  private base(): string {
    if (this.baseUrl) return this.baseUrl;
    return window.location.origin + this.proxyPath;
  }

  private authUrl(path: string): string {
    // Конкатенация, а не new URL(path, base): абсолютный path сбросил бы /l1
    return this.base() + path;
  }

  private url(path: string): string {
    let u = this.base() + path;
    if (this.profile) {
      const sep = u.includes('?') ? '&' : '?';
      u += `${sep}profile=${encodeURIComponent(this.profile)}`;
    }
    return u;
  }

  private async rawRequest<T>(fullUrl: string, init?: RequestInit): Promise<T> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(fullUrl, { ...init, signal: ctrl.signal });
      if (!res.ok) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          /* не JSON */
        }
        const detail = (body as ApiErrorBody | null)?.detail;
        throw new HermesApiError(res.status, detail ?? `HTTP ${res.status}`, body);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } finally {
      clearTimeout(t);
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    await this.ensureAuth();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    };
    if (this.authMode === 'session-token' && this.token) {
      headers['X-Hermes-Session-Token'] = this.token;
    } else if (this.authMode === 'cookie' && this.cookies) {
      headers['Cookie'] = this.cookies;
    }
    return this.rawRequest<T>(this.url(path), { ...init, headers });
  }

  // --- Эндпоинты ---

  getStatus() {
    return this.request<import('../types/hermes').HermesStatus>('/api/status');
  }

  getSkills() {
    return this.request<import('../types/hermes').HermesSkill[]>('/api/skills');
  }

  /** Список сессий с пагинацией — envelope { sessions, total, limit, offset } */
  getSessions(opts?: { limit?: number; offset?: number }) {
    const q = new URLSearchParams();
    if (opts?.limit != null) q.set('limit', String(opts.limit));
    if (opts?.offset != null) q.set('offset', String(opts.offset));
    const qs = q.toString();
    return this.request<import('../types/hermes').SessionsListResponse>(
      `/api/sessions${qs ? `?${qs}` : ''}`,
    );
  }

  /** Сообщения сессии — envelope { session_id, messages, pagination } */
  async getSessionMessages(sessionId: string) {
    try {
      return await this.request<import('../types/hermes').SessionMessagesResponse>(
        `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
      );
    } catch (e) {
      if (e instanceof HermesApiError && e.status === 404) {
        return { session_id: sessionId, messages: [] };
      }
      throw e;
    }
  }

  getProfiles() {
    return this.request<string[]>('/api/profiles');
  }
}

/** Клиент по AgentTarget — удобная фабрика для fleet */
export function clientFor(target: AgentTarget): HermesClient {
  return new HermesClient({
    baseUrl: target.baseUrl,
    proxyPath: target.proxyPath,
    profile: target.profile,
    token: target.auth.token,
    authType: target.auth.type === 'cookie' ? 'cookie' : undefined,
    username: target.auth.username,
    password: target.auth.password,
  });
}
