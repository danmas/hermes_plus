# hermes_plus

**Fleet control plane UI** для [Hermes Agent](https://github.com/NousResearch/hermes-agent) —
единая браузерная оболочка над несколькими агентами (машины × профили).

Не «второй Hermes», а **тонкий клиент** к официальному web-API дашборда
(`hermes dashboard` / `hermes serve` на `:9119`): skills, sessions, status, чат по WebSocket.

> Версия проекта: `0.1.0` · Целевая версия Hermes: **0.20.0** (Herald, 2026.8.3)  
> Статус: рабочий fleet UI (health · sessions · chat stream) + live-доступ к локальным и LAN-агентам

---

## Зачем

Штатный `hermes dashboard` обслуживает **одну** установку. Когда агентов несколько
(разные профили, разные машины), нужен единый operator console:

- видеть, кто online и что у кого есть (skills / sessions);
- переключаться между агентами и профилями;
- читать историю сессий (newest-first, размер, токены);
- чатиться с выбранным агентом со стримом reasoning и tool-calls.

Именно это делает **hermes_plus**.

---

## Архитектура

```
React/Vite UI  (localhost:5173)
        │
        │  REST + WS (same-origin)
        ▼
Vite dev-proxy  ≈  мини-BFF
  /api/*      →  127.0.0.1:9119
  /api/agents →  agents-config.json (+ env-subst)
  /l1/*       →  192.168.1.221:9119  (+ server-side cookie login)
        │
        ▼
Hermes web-API  (:9119)
  REST  /api/status | /api/skills | /api/sessions | …
  WS    /api/ws | /api/pub | /api/events
```

**Принципы**

1. Только официальный web-API. Не парсим `state.db` и `skills/*.md` — схема меняется.
2. Единица маршрутизации — **AgentTarget** (`машина + профиль + auth`).
3. Почти все REST-роуты скоупятся `?profile=<name>`.
4. Чат — **WebSocket JSON-RPC 2.0**, не OpenAI `/v1` (тот живёт в отдельном gateway-адаптере).
5. Секреты только из env / `.env.local`, никогда в git.
6. Feature-detection через `GET /api/status` / `/api/health` (`auth_required`, version).

Подробности: [`KB/README_IDEA.md`](KB/README_IDEA.md), [`KB/README_FLEET.md`](KB/README_FLEET.md).

---

## Что уже работает

| Область | Статус |
|--------|--------|
| Fleet overview (health, version, skills/sessions count) | ✅ |
| Переключение активного агента, сворачиваемые панели | ✅ |
| Список сессий: пагинация, newest-first, даты, размер/токены | ✅ |
| Чат по WS: стрим, reasoning, tool-calls, interrupt (`/stop`) | ✅ |
| Создание / resume сессий (`session.create` / `session.resume`) | ✅ |
| JSON-реестр агентов (`agents-config.json` + `${ENV}` + fallback) | ✅ |
| Локальные профили (`projects-ex`, `default`) via session-token | ✅ |
| LAN-агент с cookie-auth (password-login через мини-BFF `/l1`) | ✅ |
| Feature-detection (`/api/status`, `auth_required`) | ✅ |
| Skills browser (полноценный UI) | ⏳ next |
| Prod multi-host BFF (Hono, Tailscale, OAuth) | ⏳ next |
| A2A graph / orchestration | ⏳ later |

---

## Стек

- **React 18 + TypeScript + Vite 5**
- **TanStack Query** — polling fleet / sessions
- Нативный **WebSocket** — чат (JSON-RPC 2.0)
- Dev-proxy Vite как временный BFF (cookie jar, session-token endpoint, `/api/agents`)

---

## Быстрый старт

### 1. Hermes на машине

```bash
hermes dashboard --no-open --skip-build   # :9119, REST + WS + web-UI
# или headless:
hermes serve --no-open

hermes dashboard --status
```

Проверка:

```bash
curl -s http://127.0.0.1:9119/api/status
```

### 2. UI

```bash
git clone <repo-url>
cd hermes_plus
npm install
npm run dev    # http://localhost:5173
```

### 3. Реестр агентов

Скопируйте шаблон и отредактируйте:

```bash
cp agents-config.json.example agents-config.json
# правьте agents-config.json — не src/config/agents.ts
```

Проверка: `curl http://localhost:5173/api/agents` → `{ "agents": [...] }`.

При отсутствии/битом JSON клиент падает на `FALLBACK_AGENTS` из `src/config/agents.ts`.

### 4. LAN-агент (опционально)

Если в реестре есть target с `auth.type: "cookie"` (например `l1:default`):

```bash
# .env.local (не коммитится)
VITE_HERMES_L1_USERNAME=roman
VITE_HERMES_L1_PASSWORD=********
```

Vite-плагин логинится server-side (`POST /auth/password-login`), держит HttpOnly-куки
в памяти процесса и проксирует `/l1/*` → удалённый Hermes.

---

## Реестр агентов

**Источник правды:** [`agents-config.json`](agents-config.json)  
**Шаблон:** [`agents-config.json.example`](agents-config.json.example)

```
agents-config.json  →  Vite middleware GET /api/agents  →  клиент
                         (env-subst + валидация)          (loadAgents)
```

Пример записи:

```json
{
  "id": "local:projects-ex",
  "name": "Local Hermes / projects-ex",
  "baseUrl": "",
  "profile": "projects-ex",
  "auth": { "type": "session-token" },
  "tags": ["local", "main"]
}
```

| Поле | Смысл |
|------|--------|
| `id` | Уникальный ключ (`host:profile`) |
| `baseUrl` | `''` = same-origin через Vite proxy; иначе прямой URL |
| `proxyPath` | Префикс dev-proxy для удалённого хоста (`/l1`) |
| `profile` | Query `?profile=` на REST/WS |
| `auth.type` | `session-token` \| `cookie` \| `bearer` \| `none` |
| `auth.username` / `password` | Для cookie — через `${VITE_…}` из env |

Модель: [`src/types/agent.ts`](src/types/agent.ts).  
Fleet / multi-machine: [`KB/README_FLEET.md`](KB/README_FLEET.md).

---

## Auth (два механизма)

Снято с Hermes **0.20.0** вживую (см. [`KB/README_SURVEY.md`](KB/README_SURVEY.md)):

| Ситуация | `auth_required` | Как ходим |
|----------|-----------------|-----------|
| Loopback `127.0.0.1` | `false` | `X-Hermes-Session-Token` (из SPA HTML `GET /` или env `HERMES_DASHBOARD_SESSION_TOKEN`) |
| Gated (LAN/remote) | `true` | `POST /auth/password-login` → cookie-сессия `hermes_session_*` (через BFF) |

- Публичные: `/api/status`, `/api/health`, `/api/model/info`, …
- Gated без токена/cookie → **401**
- `Authorization: Bearer` **не** открывает skills/sessions (token-route по сути только drain)
- Наружу bind только с auth-провайдером; `--insecure` — no-op (deprecated)

---

## Карта API (кратко)

**REST (профиль через `?profile=`)**

```
GET  /api/status
GET  /api/skills
GET  /api/sessions
GET  /api/sessions/{id}/messages
GET  /api/config | /api/model/info | /api/tools/toolsets | …
```

**Чат — WebSocket JSON-RPC 2.0**

```
WS  /api/ws        основная сессия
WS  /api/pub       publish
WS  /api/events    стрим токенов + tool-calls
```

Методы: `session.create` / `session.resume`, `prompt.submit`, `slash.exec` (`/stop` = interrupt).  
Протокол: [`KB/README_WS_PROTOCOL.md`](KB/README_WS_PROTOCOL.md).

> OpenAI-compatible `/v1/chat/completions` — **отдельный** gateway platform adapter, не сервер на 9119.

---

## Структура репозитория

```
hermes_plus/
├── agents-config.json          # реестр агентов (источник правды)
├── agents-config.json.example  # шаблон с комментариями
├── src/
│   ├── api/                    # REST (client.ts) + WS (ws.ts)
│   ├── components/             # _FleetSelector, _SessionList, _ChatConsole
│   ├── config/                 # agents.ts (fallback), loadAgents, envSubst
│   ├── hooks/                  # useFleet
│   ├── types/                  # AgentTarget, Hermes DTO, WS frames
│   ├── utils/                  # session size / dates
│   ├── App.tsx
│   └── main.tsx
├── KB/                         # База знаний (точка входа → README_INDEX.md)
├── openspec/                   # Change proposals / specs
├── vite.config.ts              # proxy + /api/agents + мини-BFF /l1
├── AGENTS.md                   # правила для ИИ-агентов
├── CHANGELOG.md
└── package.json
```

---

## Скрипты

```bash
npm run dev       # Vite :5173 (strictPort)
npm run build     # tsc + vite build
npm run preview   # preview production build
```

**Dev-схема:** браузер → `localhost:5173/api/*` (same-origin) → Vite proxy → Hermes `:9119`.  
Прямой browser → 9119 с `X-Hermes-Session-Token` ломается на CORS-preflight.

---

## База знаний

Вся проектная документация — в [`KB/`](KB/):

| Файл | Тема |
|------|------|
| [README_INDEX.md](KB/README_INDEX.md) | Оглавление БЗ |
| [README_IDEA.md](KB/README_IDEA.md) | Цель, стек, план |
| [README_DEV.md](KB/README_DEV.md) | Dev-запуск, proxy, слои |
| [README_SURVEY.md](KB/README_SURVEY.md) | Живая карта API + auth |
| [README_WS_PROTOCOL.md](KB/README_WS_PROTOCOL.md) | JSON-RPC WS чата |
| [README_FLEET.md](KB/README_FLEET.md) | Multi-machine control plane, JSON-registry |

Спеки изменений: [`openspec/changes/`](openspec/changes/).

---

## Ограничения (сейчас)

- Dev-прокси = BFF. Для production multi-host нужен отдельный Hono/Express с хранением токенов/cookie server-side.
- Реестр агентов ручной (`agents-config.json`), без auto-discovery.
- Skills UI — только счётчики в fleet-панели, полноценного browser ещё нет.
- Нет OAuth / Tailscale-интеграции из коробки (сеть — на совести оператора).
- Версия в `package.json` (`0.1.0`) пока не поднята под блок CHANGELOG `0.2.0`.

---

## Лицензия / связь с Hermes

Проект **не** форк Hermes Agent. Это внешний UI-клиент к его dashboard API.  
Hermes Agent — MIT, Nous Research. Этот репозиторий — независимая оболочка поверх публичных HTTP/WS поверхностей.
