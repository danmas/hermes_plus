# hermes_plus

**Fleet control plane UI** для [Hermes Agent](https://github.com/NousResearch/hermes-agent) — единая браузерная оболочка над несколькими агентами (машины × профили).

Не «второй Hermes», а **тонкий клиент** к официальному web-API дашборда (`hermes dashboard` / `hermes serve` на `:9119`): skills, sessions, status, чат по WebSocket.

> Версия проекта: `0.1.0` · Целевая версия Hermes: **0.20.0** (Herald, 2026.8.3)  
> Статус: рабочий скелет fleet UI + live-доступ к локальным и LAN-агентам

---

## Зачем

Штатный `hermes dashboard` обслуживает **одну** установку. Когда агентов несколько (разные профили, разные машины), нужен единый operator console:

- видеть, кто online и что у кого есть (skills / sessions);
- переключаться между агентами и профилями;
- читать историю сессий;
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
  /api/*  →  127.0.0.1:9119
  /l1/*   →  192.168.1.221:9119  (+ server-side cookie login)
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

Подробности: [`KB/README_IDEA.md`](KB/README_IDEA.md), [`KB/README_FLEET.md`](KB/README_FLEET.md).

---

## Что уже работает

| Область | Статус |
|--------|--------|
| Fleet overview (health, version, skills/sessions count) | ✅ |
| Переключение активного агента | ✅ |
| Список сессий + пагинация + сообщения | ✅ |
| Чат по WS: стрим, reasoning, tool-calls, interrupt | ✅ |
| Локальные профили (`projects-ex`, `default`) | ✅ |
| LAN-агент с cookie-auth (password-login) | ✅ |
| Session-token auth (loopback) | ✅ |
| Feature-detection (`/api/status`, `auth_required`) | ✅ |
| Skills browser (полноценный UI) | ⏳ next |
| Продовый multi-host BFF (Tailscale, OAuth) | ⏳ next |
| A2A graph / orchestration | ⏳ later |

---

## Стек

- **React 18 + TypeScript + Vite 5**
- **TanStack Query** — polling fleet / sessions
- Нативный **WebSocket** — чат (JSON-RPC 2.0)
- Dev-proxy Vite как временный BFF (cookie jar для gated-агентов)

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
curl -s http://127.0.0.1:9119/api/status | head
```

### 2. Клонировать и запустить UI

```bash
git clone https://github.com/danmas/hermes_plus.git
cd hermes_plus
npm install
npm run dev    # http://localhost:5173
```

### 3. LAN-агент (опционально)

Если в реестре есть target с `auth: { type: 'cookie' }` (например `l1:default`):

```bash
# .env.local (не коммитится)
VITE_HERMES_L1_USERNAME=roman
VITE_HERMES_L1_PASSWORD=********
```

Vite-плагин логинится server-side (`POST /auth/password-login`), держит HttpOnly-куки в памяти процесса и проксирует `/l1/*` → `http://192.168.1.221:9119`.

---

## Реестр агентов

Файл [`src/config/agents.ts`](src/config/agents.ts) — ручной inventory.

```ts
{
  id: 'local:projects-ex',
  name: 'Local Hermes / projects-ex',
  baseUrl: '',                 // same-origin → Vite proxy → :9119
  profile: 'projects-ex',
  auth: { type: 'session-token' },
  tags: ['local', 'main'],
}
```

| Поле | Смысл |
|------|--------|
| `id` | Уникальный ключ (`host:profile`) |
| `baseUrl` | `''` = через Vite proxy; иначе прямой URL |
| `proxyPath` | Префикс dev-proxy для удалённого хоста (`/l1`) |
| `profile` | Query `?profile=` на REST/WS |
| `auth.type` | `session-token` \| `cookie` \| `bearer` \| `none` |

Модель: [`src/types/agent.ts`](src/types/agent.ts).  
Как масштабировать на multi-machine: [`KB/README_FLEET.md`](KB/README_FLEET.md).

---

## Auth (два механизма)

Снято с Hermes **0.20.0** вживую:

| Ситуация | `auth_required` | Как ходим |
|----------|-----------------|-----------|
| Loopback `127.0.0.1` | `false` | `X-Hermes-Session-Token` (токен из SPA HTML `GET /` или env) |
| Gated (LAN/remote) | `true` | `POST /auth/password-login` → cookie-сессия `hermes_session_*` |

- Публичные: `/api/status`, `/api/health`, `/api/model/info`.
- Gated без токена/cookie → **401**.
- Наружу bind только с auth-провайдером; `--insecure` — no-op (deprecated).

Детали и таблица эндпоинтов: [`KB/README_SURVEY.md`](KB/README_SURVEY.md).

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

Методы: `session.create` / `session.resume`, prompt submit, `slash.exec` (`/stop` = interrupt).  
Протокол: [`KB/README_WS_PROTOCOL.md`](KB/README_WS_PROTOCOL.md).

> OpenAI-compatible `/v1/chat/completions` — **отдельный** gateway platform adapter, не этот сервер на 9119.

---

## Структура репозитория

```
hermes_plus/
├── src/
│   ├── api/           # REST (client.ts) + WS (ws.ts)
│   ├── components/    # FleetSelector, SessionList, ChatConsole
│   ├── config/        # agents.ts — fleet registry
│   ├── hooks/         # useFleet
│   ├── types/         # AgentTarget, Hermes DTO, WS frames
│   ├── App.tsx
│   └── main.tsx
├── KB/                # База знаний (оглавление → README_INDEX.md)
├── openspec/          # Change proposals / specs
├── vite.config.ts     # proxy + мини-BFF для /l1
├── AGENTS.md          # Заметки для агентов/контрибьюторов
├── CHANGELOG.md
└── package.json
```

---

## Скрипты

```bash
npm run dev       # Vite :5173
npm run build     # tsc + vite build
npm run preview   # preview production build
```

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
| [README_FLEET.md](KB/README_FLEET.md) | Multi-machine control plane |

Спеки изменений: [`openspec/changes/`](openspec/changes/).

---

## Ограничения (сейчас)

- Dev-прокси = BFF. Для production multi-host нужен отдельный Hono/Express с хранением токенов/cookie server-side.
- Реестр агентов ручной (`agents.ts`), без auto-discovery.
- Skills UI — только счётчики в fleet-таблице, полноценного browser ещё нет.
- Нет OAuth / Tailscale-интеграции из коробки (сеть — на совести оператора).

---

## Лицензия / связь с Hermes

Проект **не** форк Hermes Agent. Это внешний UI-клиент к его dashboard API.  
Hermes Agent — MIT, Nous Research. Этот репозиторий — независимая оболочка поверх публичных HTTP/WS поверхностей.
