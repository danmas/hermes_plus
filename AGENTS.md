# AGENTS.md — Правила для ИИ-агентов в проекте «hermes_plus»

**Проект:** hermes_plus  
**Синонимы:** hermes plus, Hermes Plus, Hermes UI, оболочка Hermes, dashboard-клиент, fleet UI  
**Путь:** `C:\ERV\projects-ex\hermes_plus`  
**Дата обновления:** 2026-08-06  
**Версия приложения:** 0.1.0 (скелет; см. `package.json`, `CHANGELOG.md`)

## 📋 О проекте

Собственная UI-оболочка (Node.js/TypeScript + React) для работы с **Hermes Agent**:
просмотр **skills**, **sessions**, **config** и **чат**, в перспективе — **fleet**
(несколько машин × профилей в одном UI).

Тонкий клиент к официальному web-API дашборда Hermes (`hermes dashboard` / `hermes serve`,
порт **9119**), а НЕ «второй Hermes на Node»: `state.db` и `skills/*.md` **напрямую не парсим**.

**Текущая стадия:** research + skeleton  
- KB и живой замер auth — готовы  
- REST/WS-клиенты + реестр агентов + таблица fleet-health — есть  
- Полноценный UI (sessions/skills/chat), prod-BFF multi-host — ещё нет  

## 🗣️ Тон общения

- Дружеский, прямой, конструктивный  
- Отвечай на **русском** языке  
- Будь кратким, но объясняй ключевые решения  
- Эмодзи — умеренно, по делу  

## 🚫 Кардинальные правила

- **Рабочий каталог:** `C:\ERV\projects-ex\hermes_plus`
- **НИКОГДА** не перезаписывай файлы без явного разрешения пользователя
- **НОВЫЕ файлы** с кодом/скриптами — только с префиксом `_` (напр. `_название.ts`).  
  Файлы БЗ (`KB/`) — без префикса
- **Предложения изменений** — показывай diff в ответе, но **НЕ применяй**
- **Исключения без префикса:** `AGENTS.md`, файлы в `KB/` — по явной просьбе пользователя
- **Исключение для исходников проекта:** только если пользователь сказал **«применяй»**
  или **«запиши это в файл»** явно
- **НЕ ПИШИ КОД ПОКА НЕТ:** 1) ясности 2) разрешения от пользователя

## 🏗️ Структура проекта

```
hermes_plus/
├── AGENTS.md                   # правила для ИИ-агентов (этот файл)
├── CHANGELOG.md                # история изменений
├── package.json                # Vite + React 18 + TS + TanStack Query
├── vite.config.ts              # dev: proxy /api → 127.0.0.1:9119 (тонкий BFF)
├── index.html
├── tsconfig.json
├── dist/                       # прод-сборка (после npm run build)
├── KB/                         # база знаний (живая документация)
│   ├── README_INDEX.md         #   оглавление БЗ (точка входа)
│   ├── README_IDEA.md          #   идея, цель, архитектура, стек, план
│   ├── README_DEV.md           #   запуск, слои, ограничения скелета
│   ├── README_SURVEY.md        #   карта API + живой замер auth
│   ├── README_WS_PROTOCOL.md   #   WS JSON-RPC 2.0 (/api/ws)
│   └── README_FLEET.md         #   fleet: registry, BFF, multi-host
└── src/
    ├── main.tsx                # React + QueryClient
    ├── App.tsx                 # скелет UI: таблица fleet-статуса
    ├── api/
    │   ├── client.ts           # REST: X-Hermes-Session-Token, ?profile=
    │   └── ws.ts               # WS-клиент (чат; UI ещё не подключён)
    ├── config/
    │   └── agents.ts           # реестр AgentTarget (fleet inventory)
    ├── hooks/
    │   └── useFleet.ts         # опрос fleet (refetch 30 с)
    └── types/
        ├── agent.ts            # AgentTarget
        ├── hermes.ts           # status / sessions / skills
        └── ws.ts               # JSON-RPC кадры и события
```

## ⚡ Команды

### Приложение hermes_plus
```bash
npm run dev          # Vite, порт 5173 (strictPort)
npm run build        # tsc -b && vite build
npm run preview      # превью прод-сборки
```

### Сервер Hermes (источник данных)
```bash
hermes dashboard --no-open --skip-build   # web-UI + REST + WS, порт 9119
hermes dashboard --status                 # список запущенных
hermes dashboard --stop                   # заглушить
hermes profile list                       # профили на машине
```

**Dev-схема:** браузер → `localhost:5173/api/*` (same-origin) → Vite proxy → `127.0.0.1:9119`.  
Прямой browser → 9119 с `X-Hermes-Session-Token` ломается на CORS-preflight (см. KB).

## 🔑 Auth (критично, Hermes 0.20.0)

Живой замер 2026-08-06 — подробно в [KB/README_SURVEY.md](KB/README_SURVEY.md):

| Механизм | Результат |
|----------|-----------|
| Без токена | публичные: `/api/status`, `/api/health`, …; skills/sessions → **401** |
| `Authorization: Bearer` | **не** открывает skills/sessions (token-route по сути только drain) |
| **`X-Hermes-Session-Token`** | открывает gated REST (skills, sessions, config, …) |
| Источник токена | env `HERMES_DASHBOARD_SESSION_TOKEN` **или** парсинг `SESSION_TOKEN__="..."` из `GET /` (Hermes SPA HTML) |
| WS loopback | `/api/ws?token=<SESSION_TOKEN>` — 101 + JSON-RPC |

В `src/api/client.ts`: токен из HTML `http://127.0.0.1:9119/` (не через proxy `/` — иначе наш `index.html`).

## 🚢 Fleet / targets

Единица маршрутизации — **AgentTarget** (`baseUrl` × `profile` × auth).  
Реестр: `src/config/agents.ts` (руками, не авто-поиск).

Сейчас в реестре (2 локальных на `:9119`, `baseUrl: ''` = same-origin proxy + 1 LAN):

| id | profile | auth | Назначение |
|----|---------|------|------------|
| `local:projects-ex` | `projects-ex` | session-token | основной профиль проектов |
| `local:default` | `default` | session-token | default-профиль |
| `l1:default` | `default` | cookie (env) | LAN 192.168.1.221, через мини-BFF `/l1` |

Один machine-level dashboard обслуживает много профилей через `?profile=`.  
Кросс-профильные сессии: `GET /api/profiles/sessions` (см. SURVEY/FLEET).  
Prod multi-host BFF (Hono) — в плане, см. [KB/README_FLEET.md](KB/README_FLEET.md).

## 📚 База знаний (KB)

- **Каталог:** `KB/`  
- **Оглавление (точка входа):** [KB/README_INDEX.md](KB/README_INDEX.md)  
- **Именование:** `README_<ТЕМА>.md`; при содержательных изменениях — обновлять дату в `README_INDEX.md`  
- **Перед новой темой** — сначала `README_INDEX.md`, затем нужный README  
- **README в KB можно и нужно исправлять** — живая документация  

| Файл | О чём |
|------|-------|
| `README_IDEA.md` | Идея, цель, принцип, стек, план |
| `README_DEV.md` | Запуск, слои, proxy, ограничения скелета |
| `README_SURVEY.md` | Карта REST, auth-замер, профили |
| `README_WS_PROTOCOL.md` | WS JSON-RPC: методы, стрим-события |
| `README_FLEET.md` | Multi-agent control plane, BFF, registry |

## 🧹 Code Style

- Node.js + TypeScript, **ESM** (`"type": "module"`)
- React 18 + Vite, строгий TS
- TanStack Query — REST-кэш/polling; нативный WebSocket — чат-стрим
- Не хардкодить порты/пути Hermes вслепую — feature-detection через `GET /api/status`
- UI-дизайн (Tailwind/shadcn) — ещё не подключён; скелет с inline-styles ок до отдельной задачи

## 🔧 Git

- Commit/push — **только** по явной команде пользователя  
- Коммит-месседж: краткий заголовок + пустая строка + пункты списком  
- Не выполняй `git commit` без явной команды «закоммить»

## 📝 Changelog

- **CHANGELOG.md ведётся** — новая крупная возможность или заметное изменение
  (фича, рефакторинг, API/конфиг, новая секция KB) → запись в `CHANGELOG.md`
- Формат: `## [Версия] - YYYY-MM-DD`, внутри `### Добавлено` / `### Изменено` / `### Исправлено`
- Версия — из `package.json` (SemVer)
- Запись в момент изменения; мелочи (опечатки) не вносятся

## ✅ Сделано / ❌ ещё нет (шпаргалка)

| Готово | Не готово |
|--------|-----------|
| KB + auth-замер (2 механизма: session-token + cookie) | Skills browser / content |
| `HermesClient` REST: session-token + cookie + пагинация | Sessions explorer UI |
| Fleet: 3 таргета live (97/118/65 skills, 20/20/7 sessions) | Chat UI + стрим tool-calls |
| Мини-BFF `/l1` в vite.config.ts (cookie jar, lazy-login) | Prod BFF (Hono) для multi-host |
| `npm run build` проходит | Тесты, дизайн-система |
