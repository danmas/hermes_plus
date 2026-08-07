# hermes_plus — Fleet-архитектура (несколько машин × профилей → один UI)

**Актуализация:** 2026-08-06

Цель: собрать несколько Hermes-агентов (разные машины × разные профили) в один
UI — видеть где что есть (skills/sessions/статус) и выполнять запросы на
выбранном агенте/профиле.

Это **control plane / fleet UI**, а не viewer одного Hermes.

## Главный принцип

Каждый Hermes (машина + профиль) — отдельный **endpoint** (`baseUrl` × `profile`).
UI не встраивается в один Hermes, а становится оркестратором:

1. знает **inventory** агентов (реестр)
2. опрашивает их status/skills/sessions
3. маршрутизирует запросы на выбранный target

```
┌──────────────────────────────┐
│  Fleet UI (React/Vite)       │
│  + тонкий BFF (Hono/Node)    │  ← почти всегда нужен
└──────────────┬───────────────┘
               │
     ┌─────────┼─────────┬────────────┐
     ▼         ▼         ▼            ▼
 Machine A   Machine B  Machine C   ...
 :9119       :9119      :9119
 profiles…   profiles…  profiles…
```

Прямой браузер → много удалённых 9119 почти всегда плох (CORS, auth, offline,
mixed tokens). **BFF обязателен**, как только агенты не на localhost.

## ⚠️ Auth — что показал живой замер (критично!)

По замерам 2026-08-06 (см. `README_SURVEY.md` → «Живой замер auth»):

1. **Bearer-токен НЕ открывает skills/sessions.** Единственный token-route в
   Hermes 0.20.0 — `/api/gateway/drain` (NAS drain control). Токен
   `Authorization: Bearer` на `/api/skills` → 401.
2. **Рабочая механика — `X-Hermes-Session-Token`.** Токен генерится на каждый
   старт сервера и инжектится в SPA HTML (`SESSION_TOKEN__="..."` в `GET /`).
   С ним открывается ВСЁ: skills, sessions, config, profiles, cron, ws.
3. **WS-auth:** на loopback `?token=<SESSION_TOKEN>` работает (101 + JSON-RPC);
   в gated mode — single-use тикеты `POST /api/auth/ws-ticket` (TTL 30 c).

### Как BFF должен ходить к агенту

1. Получить токен: env `HERMES_DASHBOARD_SESSION_TOKEN` (если задан при старте
   сервера — стабилен между рестартами) **или** вытащить из SPA HTML
   (`GET {baseUrl}/` → parse `SESSION_TOKEN__="..."`).
2. REST: слать `X-Hermes-Session-Token: <token>` на все запросы.
3. WS: `ws://{baseUrl}/api/ws?token=<token>` (+ `?profile=` если нужно).

> На практике для fleet удобно задавать `HERMES_DASHBOARD_SESSION_TOKEN` в env
> каждого сервера (одинаковый/известный BFF) — тогда BFF не парсит HTML и токен
> стабилен. Наружу (не loopback) — только через туннель с loopback-видимостью
> или OAuth-режим с тикетами.

## Модель данных: AgentTarget

```ts
type AgentTarget = {
  id: string;              // "home-lab:projects-ex"
  name: string;            // human label
  baseUrl: string;         // http://100.x.x.x:9119 или tunnel
  profile?: string;        // "projects-ex" | "default" | ...
  auth: {
    type: "none" | "session-token" | "bearer" | "cookie";
    token?: string;        // SESSION_TOKEN (env или из HTML)
  };
  tags?: string[];         // ["dev", "gpu", "home"]
  capabilities?: string[]; // кэш skills/toolsets
  lastSeenAt?: string;
  status?: "online" | "offline" | "degraded";
};
```

Inventory — в своём конфиге/БД UI (YAML/JSON/SQLite), реестр руками, не авто-поиск.

Пример `agents.yaml`:

```yaml
agents:
  - id: laptop-main
    name: "Laptop / default"
    baseUrl: "http://100.64.0.2:9119"
    profile: null
    auth: { type: session-token, token: "..." }

  - id: laptop-projects
    name: "Laptop / projects-ex"
    baseUrl: "http://100.64.0.2:9119"
    profile: "projects-ex"
    auth: { type: session-token, token: "..." }

  - id: vps-ops
    name: "VPS ops"
    baseUrl: "https://hermes-vps.example.ts.net"
    profile: "ops"
    auth: { type: session-token, token: "..." }
```

Один `baseUrl` обслуживает несколько профилей через `?profile=`.

## JSON-конфигурация (agents-config.json)

**Актуально с 2026-08-07.** Реестр агентов вынесен из TypeScript в декларативный
JSON-файл [`agents-config.json`](../agents-config.json) в корне проекта.
Хардкод-массив в [`src/config/agents.ts`](../src/config/agents.ts) остаётся
**fallback-ом** на случай недоступности JSON.

### Как это работает

```
agents-config.json  ──►  Vite middleware GET /api/agents  ──►  клиент
     (на диске)            (читает, раскрывает ${ENV}, валидирует)   (fetch)
```

1. Middleware в [`vite.config.ts`](../vite.config.ts) читает `agents-config.json`.
2. Раскрывает `${VAR_NAME}`-плейсхолдеры через env ([`src/config/envSubst.ts`](../src/config/envSubst.ts)).
3. Валидирует: уникальные `id`, обязательные `name` / `auth.type`, допустимый auth-enum.
4. Отдаёт клиенту `{ agents: [...] }`.
5. Клиент ([`src/config/loadAgents.ts`](../src/config/loadAgents.ts)) делает
   `fetch('/api/agents')`; при ошибке — `null` → fallback на `FALLBACK_AGENTS`.

### Формат файла

```json
{
  "agents": [
    {
      "id": "local:projects-ex",
      "name": "Local Hermes / projects-ex",
      "baseUrl": "",
      "profile": "projects-ex",
      "auth": { "type": "session-token" },
      "tags": ["local", "main"]
    },
    {
      "id": "l1:default",
      "name": "L1 Hermes / default (192.168.1.221)",
      "baseUrl": "",
      "proxyPath": "/l1",
      "profile": "default",
      "auth": {
        "type": "cookie",
        "username": "${VITE_HERMES_L1_USERNAME}",
        "password": "${VITE_HERMES_L1_PASSWORD}"
      },
      "tags": ["lan", "l1"]
    }
  ]
}
```

### Env-переменные (${VAR_NAME})

- Любое строковое значение поддерживает `${VAR_NAME}`.
- Middleware подставляет значение из окружения (`.env.local` → `import.meta.env`
  на клиенте / `process.env` в Node); не заданная переменная → **пустая строка** + warning.
- **Креды НИКОГДА не пишутся литералами** — только `${ENV_VAR}`. Файл коммитится
  (содержит лишь плейсхолдеры).

### Как добавить агента

1. Открыть `agents-config.json`, добавить объект в массив `agents` (уникальный `id`).
2. Секретные значения — через `${VITE_XXX}` (задать в `.env.local`).
3. Перезагрузить страницу (Vite HMR не следит за файлами вне `src/`).
4. Проверить: `curl http://localhost:5173/api/agents`.

Документированный шаблон со всеми полями и типами auth —
[`agents-config.json.example`](../agents-config.json.example).

### Ошибки и fallback

| Ситуация | Ответ `/api/agents` | Поведение клиента |
|----------|---------------------|-------------------|
| Файл отсутствует | 404 | fallback + console.warn |
| Битый JSON | 500 `{ error, details }` | fallback + console.warn |
| Дубль `id` / нет `name` / плохой auth.type | 500 `{ error, details }` | fallback + console.warn |
| Всё ок | 200 `{ agents }` | использует загруженные агенты |

## Сеть: как достучаться до машин

| Способ | Когда | Комментарий |
|--------|--------|-------------|
| Tailscale / Headscale | лучший default | стабильные 100.x IP, без публичного интернета |
| SSH tunnel | ad-hoc | `ssh -L 19119:127.0.0.1:9119 host` |
| Cloudflare Tunnel / frp | если нет mesh | нужен auth |
| Публичный bind 0.0.0.0 | не рекомендую | только с жёстким auth (OAuth) |

## Что агрегировать в UI

### A. Inventory / Health
`GET {baseUrl}/api/status?profile=...` — online, version, gateway_state, auth_required.

### B. Skills / Toolsets
`GET {baseUrl}/api/skills?profile=...` · `GET {baseUrl}/api/tools/toolsets?profile=...`
→ таблица «где какой skill есть» (skills matrix).

### C. Sessions
`GET {baseUrl}/api/sessions?profile=...` · `GET {baseUrl}/api/sessions/{id}/messages?profile=...`
⚠️ На одной машине для кросс-профильного списка есть готовые роуты
`/api/profiles/sessions` и `/api/profiles/sessions/sidebar` — один запрос вместо
N запросов по профилям.

### D. Выполнение запросов (чат / задача)

Уровень 1 — **UI → конкретный агент** (операторский режим, то что нужно):
BFF проксирует WS на выбранный target: `/api/ws` (JSON-RPC 2.0, см.
`README_WS_PROTOCOL.md`). Селектор Agent ▾ Profile ▾ → чат на выбранный target.

Уровень 2 — **A2A (агент → агент)**: опционально, позже, только если подтвердится
наличие A2A-механики в текущей версии Hermes (в карте API 0.20.0 её нет —
не закладываться как на основу).

## Архитектура BFF

```
/api/fleet/agents                        список targets
/api/fleet/agents/:id/status             прокси → target /api/status
/api/fleet/agents/:id/skills             прокси → target /api/skills
/api/fleet/agents/:id/sessions           прокси → target /api/sessions
/api/fleet/agents/:id/sessions/:sid/messages
/api/fleet/agents/:id/ws                 WS proxy → target /api/ws?token=...
```

BFF делает:
- хранит токены (не в браузере)
- добавляет `?profile=` и `X-Hermes-Session-Token`
- health-check + timeout + retry
- нормализует ответы разных версий Hermes (feature-detection через `/api/status`)
- CORS только для своего UI

Фронт говорит только с BFF.

## UX — минимально полезный набор экранов

1. **Fleet overview** — карточки агентов: online/offline, version, profile, tags
2. **Skills matrix** — строки = skills, колонки = agents, галочки «есть/нет»
3. **Sessions explorer** — фильтр по agent + profile + поиск (FTS5 `/api/sessions/search`)
4. **Chat / Run** — селектор Agent ▾ Profile ▾ → чат/задача на выбранный target
   (JSON-RPC по WS: `prompt.submit`, стрим `message.delta`/`tool.start`, см. README_WS_PROTOCOL)
5. **Routing presets** (позже) — «coding → laptop-projects», «ops → vps-ops»

## Практический стартовый план

1. **Сеть** — машины в Tailscale; проверить `curl http://100.x.x.x:9119/api/status`.
2. **Токен** — задать `HERMES_DASHBOARD_SESSION_TOKEN` на каждой машине (или
   научить BFF парсить HTML); проверить `curl -H "X-Hermes-Session-Token: ..." /api/skills`.
3. **Registry** — `agents.yaml` с 2–3 targets (разные машины/профили).
4. **BFF** — Hono/Express: proxy status/skills/sessions + auth injection.
5. **UI** — Fleet list + skills + sessions (read-only).
6. **Chat** — WS proxy на один выбранный target.
7. Потом: bulk actions, cost/analytics, routing presets.

## Чего избегать

- Парсить `state.db` с удалённых машин по SSH «для удобства» — нарушение принципа
  тонкого клиента, схема меняется
- Хранить токены в localStorage фронта — только BFF
- UI, который хардкодит порты/пути без agentId
- Считать, что один dashboard «видит» остальные — нужен свой слой (BFF + registry)
- Зависеть от bearer-токенов на skills/sessions — их нет (см. замер)

## Открытые вопросы

- [ ] `HERMES_DASHBOARD_SESSION_TOKEN` — проверить, что заданный env реально
      подхватывается при `hermes dashboard` (по коду `_resolve_session_token` — да,
      но проверить живьём)
- [ ] WS с `?profile=` — работает ли скоуп профиля на WS-канале или только на REST
- [ ] Точный флоу создания НОВОЙ сессии через WS (первый `prompt.submit` без sid?)
- [ ] A2A-механика в Hermes — существует ли вообще в текущей версии (не критично для MVP)
