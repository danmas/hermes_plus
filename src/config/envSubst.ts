/**
 * envSubst — подстановка переменных окружения в конфиге агентов.
 *
 * Чистая функция без сайд-эффектов (кроме console.warn на нерезолвленный
 * плейсхолдер). Рекурсивно обходит объект/массив и заменяет в строках
 * синтаксис `${VAR_NAME}` на значение соответствующей env-переменной.
 *
 * Работает и в Node (middleware, `process.env`), и в браузере
 * (`import.meta.env`). Источник env определяется автоматически:
 *   - если задан аргумент `env` — используется он;
 *   - иначе `process.env` (Node) при наличии;
 *   - иначе `import.meta.env` (браузер/Vite).
 *
 * Нерезолвленный плейсхолдер (env-переменная не задана) → пустая строка
 * + один warning на каждое уникальное имя.
 */

const PLACEHOLDER_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** Источник переменных окружения (строковая карта). */
export type EnvSource = Record<string, string | undefined>;

/** Определить источник env в текущем рантайме. */
function defaultEnvSource(): EnvSource {
  // Node (middleware): process доступен (через globalThis — без @types/node)
  const proc = (globalThis as { process?: { env?: EnvSource } }).process;
  if (proc && proc.env) {
    return proc.env;
  }
  // Браузер / Vite: import.meta.env
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = import.meta as any;
    if (meta && meta.env) return meta.env as EnvSource;
  } catch {
    /* import.meta недоступен в некоторых сборках — игнорируем */
  }
  return {};
}

/** Заменить `${VAR}` в одной строке. Warn на нерезолвленные имена. */
function substString(input: string, env: EnvSource, warned: Set<string>): string {
  return input.replace(PLACEHOLDER_RE, (_match, varName: string) => {
    const value = env[varName];
    if (value === undefined || value === '') {
      if (!warned.has(varName)) {
        warned.add(varName);
        // eslint-disable-next-line no-console
        console.warn(`[envSubst] переменная окружения не задана: ${varName} (подставлена пустая строка)`);
      }
      return '';
    }
    return value;
  });
}

/**
 * Рекурсивно раскрыть `${VAR_NAME}`-плейсхолдеры во всех строках объекта.
 * Возвращает новый объект того же типа; исходный не мутируется.
 */
export function expandEnvPlaceholders<T>(obj: T, env: EnvSource = defaultEnvSource()): T {
  const warned = new Set<string>();
  return walk(obj, env, warned) as T;
}

function walk(node: unknown, env: EnvSource, warned: Set<string>): unknown {
  if (typeof node === 'string') {
    return substString(node, env, warned);
  }
  if (Array.isArray(node)) {
    return node.map((item) => walk(item, env, warned));
  }
  if (node !== null && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      out[key] = walk(value, env, warned);
    }
    return out;
  }
  return node;
}
