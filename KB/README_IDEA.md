# hermes_plus — Идея проекта

## Цель

Собственная UI-оболочка на **Node.js/TypeScript + React** для работы с Hermes Agent:
красивый браузерный просмотр **skills**, **sessions** (в удобном виде), **config**,
плюс **чат** с агентом. Аналог/дополнение к штатному `hermes dashboard`, заточенный
под личные нужды.

## Главный архитектурный принцип

> **Тонкий клиент к официальным API Hermes, а не «второй Hermes на Node».**

- НЕ парсить `~/.hermes/state.db` и `skills/*.md` напрямую — схема и файловая структура
  меняются между версиями, а живой gateway держит WAL-локи на SQLite.
- Использовать официальный web-API дашборда (`hermes dashboard`/`hermes serve`, порт 9119).
- Мутации (правка config/skills) — либо через web-API (`PUT /api/config`, `/api/skills/content`),
  либо через `hermes` CLI (`execa`), но не прямой записью в файлы.
- **Feature-detection** через `GET /api/status` (даёт `version`, `config_version`, `auth_required`) —
  Hermes быстро развивается, не завязываться на конкретные строки вслепую.

## Рекомендуемая архитектура

```
┌─────────────────────┐   HTTP (REST) + WebSocket   ┌──────────────────────────┐
│  React/Vite UI (TS) │ ◄─────────────────────────► │  hermes serve/dashboard  │
│                     │                             │        :9119             │
│  - Skills browser   │   GET /api/skills           │  • REST web-API          │
│  - Sessions viewer  │   GET /api/sessions/{id}/…  │  • WS /api/ws /pub /events│
│  - Config viewer    │   GET/PUT /api/config       │  • профиле-скоуп ?profile=│
│  - Chat (WS stream) │   WS  /api/ws               │                          │
└─────────────────────┘                             └──────────────────────────┘
        │
        └─(опц.) BFF — только если наружу: CORS, auth-прокси, агрегация
```

### Слои

1. **Frontend (обязательно):** React + Vite + TypeScript.
   - TanStack Query — кэш + polling REST.
   - Нативный WebSocket — чат-стрим (`/api/ws`, `/api/events`), уже отдаёт tool-calls.
   - Zustand/Jotai — состояние UI (опц.).
   - Tailwind + shadcn/ui или свой дизайн.
2. **BFF (опционально, тонкий):** Next route handlers / Hono / Express.
   - Только как адаптер: прокси + auth + CORS + remote-доступ.
   - НЕ дублировать бизнес-логику Hermes.

## Варианты по сложности

| Вариант | Когда | Сложность |
|---|---|---|
| A. Pure frontend | Только localhost, фронт напрямую в API 9119 | Низкая |
| B. BFF (Next/Hono routes) | Нужен auth, CORS, агрегация, remote | Средняя |
| C. Отдельный Node-сервис | Сложная логика, multi-agent, multi-user | Высокая |
| D. Electron/Tauri | Хочешь десктоп | Средняя+ |

**Старт:** вариант A (localhost, read-only viewer) → расширять при необходимости.

## Рекомендуемый стек (итог)

- **Frontend:** Vite + React 18 + TypeScript, TanStack Query, нативный WS, Tailwind + shadcn/ui.
- **BFF (если нужен):** Hono или Next.js Route Handlers.
- **Монорепо:** pnpm workspace, общий пакет типов (сгенерировать из `/api/config/schema` где возможно).

## Минимальный план старта

1. Поднять `hermes dashboard` (порт 9119) — сервер для разработки.
2. Vite + React + TS проект.
3. Реализовать read-only:
   - список skills (`GET /api/skills`) + просмотр тела (`GET /api/skills/content`)
   - список sessions (`GET /api/sessions`) + сообщения (`GET /api/sessions/{id}/messages`)
   - статус (`GET /api/status`) для health/feature-detection
4. Добавить чат через `/api/ws` (снять формат WS-кадров из `web_server.py` / DevTools→Network→WS).
5. Красивости: фильтры, timeline сессий, cost/analytics, поиск (`/api/sessions/search` — FTS5).

## Важные нюансы

- **Auth:** dashboard по умолчанию 127.0.0.1, `auth_required: false` на loopback.
  Наружу — обязательно auth (bearer-token в `Authorization` для token-routes, или OAuth/пароль) + HTTPS/туннель.
  `--insecure` больше не отключает auth (no-op с июня 2026).
- **Profiles:** добавлять `?profile=<name>` почти во все запросы. Активный: `projects-ex`.
- **Realtime tool traces:** WS-стрим уже содержит tool-calls — удобно показывать в UI.
- **Чат ≠ /v1:** штатный чат дашборда идёт по WebSocket, а не через OpenAI-совместимый REST.
  Если хочется REST `/v1/chat/completions` — это отдельный **API Server** адаптер gateway,
  поднимается отдельно и требует своего API-ключа.

## Открытые вопросы / TODO

- [x] Снять точный формат WS-кадров `/api/ws` — **снято** 2026-08-06, см. [README_WS_PROTOCOL.md](README_WS_PROTOCOL.md): JSON-RPC 2.0, `prompt.submit`, стрим `message.delta`/`tool.start`, работает по `?token=<SESSION_TOKEN>`.
- [x] Проверить, какие роуты зарегистрированы как token-routes — **проверено** 2026-08-06: только `/api/gateway/drain` (NAS drain). Bearer НЕ открывает skills/sessions; рабочий путь — `X-Hermes-Session-Token` (см. [README_SURVEY.md](README_SURVEY.md) → «Живой замер auth»).
- [ ] Решить: read-only viewer или полноценная control-panel (влияет на нужность CLI/мутаций).
- [ ] Оценить генерацию TS-типов из `/api/config/schema`.
