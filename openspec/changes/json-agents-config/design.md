## Context

- **hermes_plus 0.1.0:** Vite + React + TanStack Query skeleton. Реестр агентов —
  хардкод-массив `AGENTS` в [`src/config/agents.ts`](src/config/agents.ts) (3 таргета:
  `local:projects-ex`, `local:default`, `l1:default`).
- **kosmos-panel** (референсный проект): декларативная JSON-конфигурация серверов
  в [`inventory.json`](C:\ERV\projects-ex\kosmos-panel\inventory.json.example) +
  подстановка `${ENV_VAR}` + hot-reload через `fs.watchFile()`.
- **Auth:** два механизма уже работают в `HermesClient` — `session-token` (loopback)
  и `cookie` (gated LAN). Типы `AgentTarget` / `AgentAuth` / `FleetConfig` уже
  определены в [`src/types/agent.ts`](src/types/agent.ts).
- **Vite dev-server:** уже делает proxy `/api` → `127.0.0.1:9119` и мини-BFF `/l1`.
  Можем добавить свой middleware для `/api/agents`.

## Goals / Non-Goals

**Goals:**
- Вынести реестр агентов из TypeScript в декларативный JSON-файл.
- Подстановка env-переменных `${VAR_NAME}` для чувствительных данных (токены, пароли).
- Vite middleware `GET /api/agents` — единая точка получения конфига клиентом.
- Полная обратная совместимость: хардкод-fallback при недоступности JSON.
- Документированный пример [`agents-config.json.example`](agents-config.json.example).

**Non-Goals:**
- JSON-редактор в UI.
- API для сохранения конфига через UI.
- Авто-поиск агентов.
- Hot-reload через `fs.watchFile` (Vite HMR достаточно).

## Decisions

### D1. Файл называется `agents-config.json`, лежит в корне, коммитится

- **Choice:** Имя `agents-config.json` (не `agents.json`), корень проекта.
  Файл в git (содержит только `${ENV_VAR}` плейсхолдеры, не реальные креды).
- **Why:** Следует naming convention kosmos-panel (`inventory.json` / `config.json`).
  Префикс `agents-` явно указывает на содержание. Коммит файла позволяет
  новому разработчику сразу видеть структуру реестра.
- **Alt:** `public/agents-config.json` — тогда Vite автоматически раздаёт как статику,
  но путь менее очевидный и нет middleware-валидации.

### D2. Vite middleware, не отдельный BFF-сервер

- **Choice:** Добавить `GET /api/agents` как кастомный middleware в
  [`vite.config.ts`](vite.config.ts) (через `configureServer()`).
- **Why:** BFF (Hono) ещё не написан. Vite middleware — минимальный путь:
  читает файл с диска, раскрывает env, валидирует, отдаёт JSON. Никаких
  новых зависимостей.
- **Alt:** Отдельный BFF-эндпоинт — потребовал бы запуска второго процесса.

### D3. env-подстановка — отдельная чистая функция

- **Choice:** `src/config/envSubst.ts` с функцией `expandEnvPlaceholders<T>(obj): T`.
  Рекурсивный обход, замена `${VITE_XXX}` → `import.meta.env.VITE_XXX`,
  `${XXX}` → `import.meta.env.XXX`.
- **Why:** Нужна и в middleware (Node `process.env`), и потенциально на клиенте
  (`import.meta.env`). Чистая функция без сайд-эффектов.
- **Alt:** Использовать `dotenv` на сервере и `import.meta.env` на клиенте —
  раздвоение логики.

### D4. Клиент загружает агентов через `fetch('/api/agents')`

- **Choice:** `src/config/loadAgents.ts` → `loadAgentsFromConfig()` → `fetch('/api/agents')`.
  При неудаче возвращает `null`, вызывающий код использует fallback.
- **Why:** Асинхронный fetch — естественный путь для SPA. Middleware уже
  сделал всю работу (чтение, env, валидация), клиент получает готовый `FleetConfig`.
- **Alt:** Прямой импорт JSON (`import agents from '../agents-config.json'`) —
  но тогда env-подстановку пришлось бы делать на клиенте, и import не
  поддерживает hot-reload для JSON вне `public/`.

### D5. Хардкод-fallback остаётся в `agents.ts`

- **Choice:** `agents.ts` экспортирует `getAgents()` — асинхронная функция,
  которая пробует `loadAgentsFromConfig()`, при неудаче возвращает
  текущий хардкод-массив. Также есть `getAgentsSync()` для синхронного
  доступа (использует кэш или fallback).
- **Why:** Полная обратная совместимость. Если `agents-config.json` удалён
  или middleware не работает — приложение продолжает функционировать.
- **Alt:** Убрать хардкод совсем — рискованно, ломает dev-окружение без файла.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| JSON невалиден — приложение падает | Валидация в middleware: проверка структуры, уникальности id, обязательных полей. При ошибке — 500 с детальным сообщением |
| env-переменная не задана — плейсхолдер остаётся как строка | Логировать warning в консоль; `HermesClient` упадёт на auth, что лучше чем молчаливый undefined |
| Клиент не может достучаться до `/api/agents` | Fallback на хардкод; console.warn с причиной |
| После редактирования JSON нужна перезагрузка страницы | Vite HMR не триггерится на изменения вне `src/`. Пока приемлемо; в будущем — polling |
| Путаница: `agents-config.json` vs `agents.ts` | Документация; комментарий в `agents.ts`: «FALLBACK — edit agents-config.json instead» |

## Migration Plan

1. Land OpenSpec change artifacts (этот change).
2. Реализовать по tasks.md.
3. Убедиться: `npm run dev` → `/api/agents` возвращает 3 таргета.
4. Убедиться: удаление `agents-config.json` → страница работает (fallback).
5. `openspec archive json-agents-config` → promote specs.

Rollback: вернуть `agents.ts` к прямому экспорту массива; удалить middleware.
