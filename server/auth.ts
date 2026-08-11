/**
 * server/auth — авторизация оператора prod-BFF.
 *
 * Один пользователь (владелец). Механика (KB/README_SECURITY_PLANS.md):
 * - POST /auth/login { username, password } → HttpOnly/Secure/SameSite=Lax кука `hp_sid`;
 * - логин + пароль из .env.local (HERMES_PLUS_USERNAME / HERMES_PLUS_PASSWORD);
 * - сессии в памяти (idle 12 ч, абсолютный TTL 7 дней);
 * - rate-limit на логин: ≤ 5 неудач с IP за 15 минут, дальше 429;
 * - сравнение секретов — timingSafeEqual по SHA-256 (без сторонних зависимостей).
 *
 * Куки НЕ Secure при прямом http (dev/LAN); за reverse-proxy с TLS
 * выставляется x-forwarded-proto: https → Secure включается (COOKIE_SECURE=auto).
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'hp_sid';

const IDLE_TTL_MS = 12 * 3600 * 1000; // 12 часов неактивности
const ABS_TTL_MS = 7 * 24 * 3600 * 1000; // 7 дней абсолютный
const MAX_AGE_S = Math.floor(ABS_TTL_MS / 1000);

// ── Сессии (in-memory) ────────────────────────────────────────────────────────

interface Session {
  createdAt: number;
  lastSeen: number;
  ip: string;
}

const sessions = new Map<string, Session>();

function sweep(): void {
  const now = Date.now();
  for (const [sid, s] of sessions) {
    if (now - s.lastSeen > IDLE_TTL_MS || now - s.createdAt > ABS_TTL_MS) {
      sessions.delete(sid);
    }
  }
}

/** Создать сессию; вернуть sid (32 байта hex). */
export function createSession(ip: string): string {
  sweep();
  const sid = randomBytes(32).toString('hex');
  sessions.set(sid, { createdAt: Date.now(), lastSeen: Date.now(), ip });
  return sid;
}

/** Проверить sid (заодно продлевает lastSeen). */
export function isValidSession(sid: string | undefined): boolean {
  if (!sid || !/^[a-f0-9]{64}$/.test(sid)) return false;
  const s = sessions.get(sid);
  if (!s) return false;
  const now = Date.now();
  if (now - s.lastSeen > IDLE_TTL_MS || now - s.createdAt > ABS_TTL_MS) {
    sessions.delete(sid);
    return false;
  }
  s.lastSeen = now;
  return true;
}

export function destroySession(sid: string | undefined): void {
  if (sid) sessions.delete(sid);
}

// ── Rate-limit логина ─────────────────────────────────────────────────────────

const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;

const failLog = new Map<string, number[]>();

/** Возвращает секунды до разблокировки (>0) или 0, если логин разрешён. */
export function loginBlockedFor(ip: string): number {
  const now = Date.now();
  const recent = (failLog.get(ip) ?? []).filter((t) => now - t < FAIL_WINDOW_MS);
  failLog.set(ip, recent);
  if (recent.length >= MAX_FAILS) {
    return Math.max(1, Math.ceil((FAIL_WINDOW_MS - (now - recent[0])) / 1000));
  }
  return 0;
}

export function recordLoginFail(ip: string): void {
  const arr = failLog.get(ip) ?? [];
  arr.push(Date.now());
  failLog.set(ip, arr);
}

export function clearLoginFails(ip: string): void {
  failLog.delete(ip);
}

// ── Пароль / куки ─────────────────────────────────────────────────────────────

/** Сравнение строки без timing-атак (SHA-256 + timingSafeEqual). */
export function verifySecret(input: string, expected: string): boolean {
  const a = createHash('sha256').update(String(input)).digest();
  const b = createHash('sha256').update(String(expected)).digest();
  return timingSafeEqual(a, b);
}

/** @deprecated используйте verifySecret — оставлено для совместимости. */
export function verifyPassword(input: string, expected: string): boolean {
  return verifySecret(input, expected);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

/** Set-Cookie для сессии: HttpOnly + SameSite=Lax, Secure — по флагу. */
export function sessionSetCookie(sid: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_S}${secure ? '; Secure' : ''}`;
}

/** Set-Cookie для выхода (удаление куки). */
export function sessionClearCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

// ── Страница логина (inline HTML, без ассетов из dist) ────────────────────────

export const LOGIN_HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>hermes_plus — вход</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0b0f14; color: #d7e0ea;
    font: 14px/1.45 -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  }
  .card {
    width: min(360px, calc(100vw - 32px)); padding: 28px 24px;
    background: #121821; border: 1px solid #1f2a38; border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,.45);
  }
  h1 { margin: 0 0 4px; font-size: 18px; }
  .sub { margin: 0 0 20px; font-size: 12px; color: #7d8ca0; }
  label { display: block; margin: 0 0 6px; font-size: 12px; color: #9fb0c3; }
  .field { margin-bottom: 12px; }
  input[type=text],
  input[type=password] {
    width: 100%; padding: 10px 12px; border-radius: 8px;
    border: 1px solid #2a3a4e; background: #0d131b; color: #e6edf5; outline: none;
  }
  input[type=text]:focus,
  input[type=password]:focus { border-color: #2dd4bf; }
  button {
    margin-top: 8px; width: 100%; padding: 10px 12px; border: 0; border-radius: 8px;
    background: #14b8a6; color: #04211d; font-weight: 600; cursor: pointer;
  }
  button:hover { background: #2dd4bf; }
  button:disabled { opacity: .6; cursor: default; }
  .err { margin-top: 12px; min-height: 16px; font-size: 12px; color: #f87171; }
</style>
</head>
<body>
  <form class="card" id="f" method="post" action="/auth/login" autocomplete="on">
    <h1>hermes_plus</h1>
    <p class="sub">Fleet Control Plane — доступ только для оператора</p>
    <div class="field">
      <label for="u">Логин</label>
      <input id="u" name="username" type="text" autocomplete="username"
             autocapitalize="off" spellcheck="false" autofocus required>
    </div>
    <div class="field">
      <label for="p">Пароль</label>
      <input id="p" name="password" type="password" autocomplete="current-password" required>
    </div>
    <button type="submit" id="b">Войти</button>
    <div class="err" id="e"></div>
  </form>
<script>
  document.getElementById('f').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = document.getElementById('b');
    const err = document.getElementById('e');
    const username = document.getElementById('u').value;
    const password = document.getElementById('p').value;
    btn.disabled = true; err.textContent = '';
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) { location.replace('/'); return; }
      if (res.status === 429) {
        const d = await res.json().catch(() => ({}));
        err.textContent = 'Слишком много попыток. Повторите через ' + (d.retry_after || 60) + ' с.';
      } else {
        err.textContent = 'Неверный логин или пароль';
      }
    } catch {
      err.textContent = 'Сеть недоступна';
    } finally {
      btn.disabled = false;
    }
  });
</script>
</body>
</html>
`;
