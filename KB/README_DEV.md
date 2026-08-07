# hermes_plus — Разработка и запуск

**Актуализация:** 2026-08-06

Скелет приложения создан: Vite + React 18 + TypeScript + TanStack Query.
UI-вид будет делаться позже — сейчас минимальная таблица fleet-статуса.

## Запуск

```bash
npm run dev          # Vite dev-сервер, порт 5173
npm run build        # tsc + vite build (проверка типов + прод-сборка)
npm run preview      # превью прод-сборки
```

Источник данных — запущенный `hermes dashboard` на `127.0.0.1:9119`
(`hermes dashboard --no-open --skip-build`).

## Архитектура dev-режима: Vite proxy = тонкий BFF

```
Browser (5173) ──same-origin──► Vite dev server ──proxy──► Hermes :9119
   /api/skills                     /api → 127.0.0.1:9119
   /api/ws (WS)                    /api/ws → ws://127.0.0.1:9119 (ws:true)
   /l1/api/sessions                /l1 → мини-BFF (плагин) → 192.168.1.221:9119
```

Почему так (важно, из живого замера auth 2026-08-06):

- Браузер **не может** ходить на 9119 напрямую с кастомным заголовком
  `X-Hermes-Session-Token`: auth-middleware Hermes отвечает 401 на CORS-preflight
  gated-роутов (CORS-middleware стоит позже auth в цепочке).
- Решение: все `/api/*` запросы идут **same-origin** на 5173, Vite проксирует
  их на 9119 и пробрасывает заголовки как есть.
- Токен `SESSION_TOKEN__` достаётся **прямым** `GET http://127.0.0.1:9119/`
  (simple request — CORS-preflight не нужен; проксированный `/` отдал бы наш
  index.html, а не Hermes SPA).
- В проде этот слой заменяется настоящим BFF (Hono/Express) — см. README_FLEET.md.

## LAN-агент l1 (192.168.1.221) — мини-BFF в vite.config.ts

У l1 (`auth_required: true`, basic auth) **другой механизм auth** — cookie-сессия:

- Логин: `POST /auth/password-login` `{provider:'basic',username,password}` →
  3 HttpOnly куки (`hermes_session_at/rt/provider`), Max-Age 12ч.
- Куки шлются заголовком `Cookie` на gated REST (`/api/sessions` → 200, total=7).
- Vite dev-proxy НЕ пробрасывает Set-Cookie, и браузер не может хранить HttpOnly
  куки для чужого origin — поэтому в `vite.config.ts` встроен **мини-BFF-плагин**:
  - server-side lazy-login (куки живут в памяти dev-процесса);
  - `/l1/*` → `http://192.168.1.221:9119/*` с cookie jar;
  - автоперелогин при 401 (сессия истекла);
  - креды читаются из `.env.local` через `loadEnv` (VITE_HERMES_L1_USERNAME /
    VITE_HERMES_L1_PASSWORD).
- Клиент (`HermesClient`) при `proxyPath` **не логинится сам** — authMode='none',
  auth полностью на серверном слое. Это ровно то, что в проде делает BFF.

Креды l1 — **только** в `.env.local` (в .gitignore), никогда в source:
```
VITE_HERMES_L1_USERNAME=roman
VITE_HERMES_L1_PASSWORD=...
```

## Слои приложения

| Слой | Файл | Назначение |
|------|------|-----------|
| Types | `src/types/agent.ts` | AgentTarget — единица маршрутизации fleet |
| Types | `src/types/hermes.ts` | Ответы web-API Hermes (status, sessions, skills) |
| Types | `src/types/ws.ts` | WS JSON-RPC 2.0: кадры, события, методы |
| API | `src/api/client.ts` | REST-клиент: X-Hermes-Session-Token, ?profile=, таймауты |
| API | `src/api/ws.ts` | WS-клиент: connect/call/submitPrompt, реконнект |
| Config | `src/config/agents.ts` | Реестр агентов (fleet inventory) |
| Hooks | `src/hooks/useFleet.ts` | Опрос fleet (TanStack Query, refetch 30 c) |
| UI | `src/App.tsx` | Скелет: таблица fleet-статуса (вид позже) |

## Реестр агентов (agents-config.json + config/agents.ts)

**С 2026-08-07** источник правды — [`agents-config.json`](../agents-config.json)
в корне проекта (декларативный JSON). Middleware `GET /api/agents` в
`vite.config.ts` читает файл, раскрывает `${ENV_VAR}`-плейсхолдеры
([`src/config/envSubst.ts`](../src/config/envSubst.ts)), валидирует и отдаёт
клиенту. Клиент грузит через [`src/config/loadAgents.ts`](../src/config/loadAgents.ts);
`src/config/agents.ts` — теперь `FALLBACK_AGENTS` + `getAgents()`/`getAgentsSync()`.
Подробный формат — см. README_FLEET.md → «JSON-конфигурация».

`baseUrl: ''` означает same-origin (через Vite proxy на локальный 9119).
Для удалённых машин: Tailscale IP / туннель + токен в `auth.token`
(или `HERMES_DASHBOARD_SESSION_TOKEN` на той машине).

Быстрая проверка: `curl http://localhost:5173/api/agents` → `{ agents: [...] }`.
При отсутствии/битом `agents-config.json` middleware вернёт 404/500, а клиент
молча падёт на хардкод-fallback (console.warn).

## Проверка

- `npm run build` — чистая компиляция TS + сборка
- Открыть `http://localhost:5173/` — таблица: агенты online, version, skills/sessions count

## Известные ограничения скелета

- Токен фетчится при каждом создании клиента (нет кэша между рестартами)
- WS-клиент есть, но чат-UI ещё не подключён
- Кросс-машинный режим (несколько baseUrl) — требует BFF (следующий шаг)
