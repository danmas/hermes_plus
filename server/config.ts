/**
 * server/config — конфигурация prod-BFF (env + реестр агентов).
 *
 * Читает .env.local / .env (не перекрывая уже заданные process.env),
 * собирает BffConfig и загружает agents-config.json с раскрытием ${ENV_VAR}.
 *
 * Безопасность (см. KB/README_SECURITY_PLANS.md):
 * - реестр с секретами живёт ТОЛЬКО на сервере;
 * - браузеру отдаётся sanitize-версия (без token/username/password).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expandEnvPlaceholders, type EnvSource } from '../src/config/envSubst';
import type { AgentAuthType, AgentTarget } from '../src/types/agent';

// ── .env ──────────────────────────────────────────────────────────────────────

/** Парсер KEY=VALUE (.env.local приоритетнее .env; process.env — выше обоих). */
function loadDotEnv(cwd: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of ['.env', '.env.local']) {
    const p = resolve(cwd, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      out[k] = v;
    }
  }
  return out;
}

/** Сводный источник env: dot-файлы + process.env (process.env побеждает). */
export function mergedEnv(cwd: string): EnvSource {
  const env: EnvSource = { ...loadDotEnv(cwd) };
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  return env;
}

// ── BffConfig ─────────────────────────────────────────────────────────────────

export interface BffConfig {
  /** Порт BFF (по умолчанию 8787; 3000–3002 заняты Kosmos Panel). */
  port: number;
  /**
   * Логин единственного оператора (для browser password manager).
   * Не секрет; задаётся рядом с паролем в .env.local.
   */
  username: string;
  /** Пароль единственного оператора. Обязателен — без него BFF не стартует. */
  password: string;
  /** Secure-флаг куки: auto = по x-forwarded-proto; 1/0 = принудительно. */
  cookieSecure: 'auto' | '1' | '0';
  /** Origin локального Hermes. */
  localOrigin: string;
  /** Origin LAN-агента l1. */
  l1Origin: string;
  /** Origin LAN-агента .254 (рабочий комп). */
  l254Origin: string;
  /** Стабильный SESSION_TOKEN (env), если задан — иначе парсинг SPA HTML. */
  sessionToken: string | null;
  /** Креды l1 (cookie-auth). */
  l1Username: string;
  l1Password: string;
  /** Креды .254 (cookie-auth). */
  l254Username: string;
  l254Password: string;
  /** Каталог сборки фронтенда. */
  distDir: string;
}

/**
 * Dev-friendly config: full BFF requires HERMES_PLUS_PASSWORD;
 * Vite skill-transfer middleware may use loadConfigDevFallback() if missing.
 */
export function loadConfig(cwd: string): BffConfig {
  const env = mergedEnv(cwd);
  const get = (k: string, dflt = ''): string => env[k] ?? dflt;

  const username = get('HERMES_PLUS_USERNAME', 'operator').trim();
  if (!username) {
    throw new Error(
      'HERMES_PLUS_USERNAME пуст. Задайте логин оператора в .env.local рядом с HERMES_PLUS_PASSWORD (например operator).',
    );
  }

  const password = get('HERMES_PLUS_PASSWORD');
  if (!password) {
    throw new Error(
      'HERMES_PLUS_PASSWORD не задан. Задайте длинный пароль (≥ 24 символов) в .env.local.\n' +
        'Сгенерировать: node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'base64url\'))"',
    );
  }
  if (password.length < 24) {
    throw new Error('HERMES_PLUS_PASSWORD слишком короткий (< 24 символов) — порт будет виден сканерам.');
  }

  const cookieSecureRaw = get('COOKIE_SECURE', 'auto').toLowerCase();
  const cookieSecure: BffConfig['cookieSecure'] =
    cookieSecureRaw === '1' || cookieSecureRaw === 'true'
      ? '1'
      : cookieSecureRaw === '0' || cookieSecureRaw === 'false'
        ? '0'
        : 'auto';

  return {
    port: Number(get('PORT', get('BFF_PORT', '8787'))),
    username,
    password,
    cookieSecure,
    localOrigin: get('HERMES_LOCAL_ORIGIN', 'http://127.0.0.1:9119').replace(/\/$/, ''),
    l1Origin: get('HERMES_L1_ORIGIN', 'http://192.168.1.221:9119').replace(/\/$/, ''),
    l254Origin: get('HERMES_L254_ORIGIN', 'http://192.168.1.254:9119').replace(/\/$/, ''),
    sessionToken: get('HERMES_DASHBOARD_SESSION_TOKEN') || null,
    l1Username: get('HERMES_L1_USERNAME', get('VITE_HERMES_L1_USERNAME')),
    l1Password: get('HERMES_L1_PASSWORD', get('VITE_HERMES_L1_PASSWORD')),
    l254Username: get('HERMES_L254_USERNAME', get('VITE_HERMES_L254_USERNAME')),
    l254Password: get('HERMES_L254_PASSWORD', get('VITE_HERMES_L254_PASSWORD')),
    distDir: get('BFF_DIST_DIR', resolve(cwd, 'dist')),
  };
}

// ── Реестр агентов ────────────────────────────────────────────────────────────

const VALID_AUTH_TYPES: AgentAuthType[] = ['none', 'session-token', 'bearer', 'cookie'];

/** Проверка структуры конфига (аналог валидации dev-middleware vite.config.ts). */
function validateAgents(agents: unknown): string | null {
  if (!Array.isArray(agents)) return 'поле "agents" должно быть массивом';
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

/** Публичная (sanitize) версия агента — без секретов. Отдаётся браузеру. */
export interface SanitizedAgent {
  id: string;
  name: string;
  baseUrl: string;
  proxyPath?: string;
  profile?: string;
  tags?: string[];
  auth: { type: AgentAuthType };
}

export function sanitizeAgent(a: AgentTarget): SanitizedAgent {
  return {
    id: a.id,
    name: a.name,
    baseUrl: a.baseUrl,
    ...(a.proxyPath ? { proxyPath: a.proxyPath } : {}),
    ...(a.profile ? { profile: a.profile } : {}),
    ...(a.tags?.length ? { tags: a.tags } : {}),
    auth: { type: a.auth.type },
  };
}

export interface AgentsRegistry {
  /** Полный реестр (с секретами) — только server-side. */
  agents: AgentTarget[];
  /** Версия для браузера — без секретов. */
  publicAgents: SanitizedAgent[];
}

/** Загрузить agents-config.json; при ошибке — пустой реестр (BFF продолжает работать). */
export function loadAgentsRegistry(cwd: string, env: EnvSource): AgentsRegistry {
  const path = resolve(cwd, 'agents-config.json');
  if (!existsSync(path)) {
    console.warn('[bff] agents-config.json не найден — реестр пуст');
    return { agents: [], publicAgents: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { agents?: unknown };
    const resolved = expandEnvPlaceholders(parsed, env) as { agents?: unknown };
    const err = validateAgents(resolved.agents);
    if (err) {
      console.warn(`[bff] невалидный agents-config.json: ${err} — реестр пуст`);
      return { agents: [], publicAgents: [] };
    }
    const agents = resolved.agents as AgentTarget[];
    return { agents, publicAgents: agents.map(sanitizeAgent) };
  } catch (e) {
    console.warn(`[bff] ошибка чтения agents-config.json: ${e instanceof Error ? e.message : String(e)}`);
    return { agents: [], publicAgents: [] };
  }
}
