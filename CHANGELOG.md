# Changelog

Все важные изменения в проекте документируются в этом файле.

Формат: `## [Версия] - YYYY-MM-DD`, внутри — `### Добавлено` / `### Изменено` / `### Исправлено`.
Версия — из `package.json` (SemVer: MAJOR.MINOR.PATCH).

---

## [0.1.0] - 2026-08-06

### Добавлено

- Инициализация проекта: `AGENTS.md`, база знаний `KB/` (README_IDEA, README_SURVEY,
  README_WS_PROTOCOL, README_FLEET, README_DEV), запись в каталоге Obsidian
  `projects-ex-catalog.md`, скилл `projects-ex` обновлён.
- Живой замер auth web-API дашборда Hermes 0.20.0:
  - без токена открыты только публичные роуты (status, model/info, health и т.п.);
  - bearer-токен НЕ работает для skills/sessions — единственный token-route
    `/api/gateway/drain`;
  - заголовок `X-Hermes-Session-Token` открывает все gated-роуты; токен живёт
    в SPA HTML (`SESSION_TOKEN__="..."`);
  - WS-чат `/api/ws?token=...` — работает (101, JSON-RPC отвечает).
- Скелет приложения: Vite + React 18 + TypeScript + TanStack Query.
  - `src/api/client.ts` — REST-клиент (X-Hermes-Session-Token, ?profile=, таймауты);
  - `src/api/ws.ts` — WS-клиент (JSON-RPC 2.0, reconnect);
  - `src/config/agents.ts` — реестр агентов (fleet inventory);
  - `src/hooks/useFleet.ts` — опрос fleet (refetch 30 c);
  - `src/App.tsx` — скелет UI: таблица fleet-статуса (вид позже);
  - Vite proxy `/api` → `127.0.0.1:9119` (тонкий BFF в dev).
- Git-репозиторий инициализирован.

### Изменено

- Правка README_SURVEY/README_WS_PROTOCOL/README_IDEA — закрыты TODO по
  WS-handshake auth и token-routes (см. «Живой замер auth»).
- Live-замер auth gated-агента: добавлен второй механизм — cookie-сессия
  (password-login → hermes_session_* куки); задокументирован в README_SURVEY/DEV.
- OpenSpec change `real-sessions-access` расширен: proposal заполнен, спеки
  дополнены cookie-auth + LAN-таргетом l1:default (192.168.1.221), задачи 1.x–2.x
  и live-verify 4.1–4.3/4.5–4.7 выполнены.

### Добавлено (реализация cookie-auth + LAN)

- `src/api/client.ts`: cookie-механизм (password-login, jar), feature-detection
  через `/api/health` (`auth_required`), пагинация `{limit,offset}`, envelope-типы
  `{sessions,total,limit,offset}` и `{session_id,messages,pagination}`.
- `src/config/agents.ts`: третий таргет `l1:default` (192.168.1.221, cookie-auth,
  креды из env).
- `vite.config.ts`: мини-BFF-плагин `/l1` → 221 (server-side lazy-login, cookie jar
  в памяти, автоперелогин при 401; креды из `.env.local` через loadEnv).
- `.env.local`: креды l1 (не коммитится).
- Fleet-таблица показывает 3 агента (97/118/65 skills, 20/20/7 sessions).

## [0.2.0] - 2026-08-07

### Добавлено

- Полноценная приборная панель флота (Fleet Control Plane UI) в тёмном стиле (Graphite & Neon/Teal accents).
- Компонент `_FleetSelector` для отображения здоровья и быстрого переключения активного агента.
- Компонент `_SessionList` для просмотра истории сессий чата выбранного агента с постраничной пагинацией.
- Компонент `_ChatConsole` для потокового вывода диалога через WebSocket, рендеринга reasoning (мыслей) и вызовов инструментов (tool calls).
- Механизм сворачивания (collapsibility) боковых панелей (Fleet, Sessions) для максимизации рабочей зоны чата.
- Проксирование WebSocket для удаленного LAN-агента в `vite.config.ts` (`/l1/api/ws` -> 192.168.1.221).
- Подробные логи кадров WebSocket-трафика (`[WS] Received frame:`) для отладки протокола и резервный обработчик RPC-событий в `ws.ts`.
- Асинхронное получение токена сессии `ensureAuth` перед открытием WebSocket.
- Визуальный лоадер «Hermes думает...» при отправке сообщений для информирования пользователя.
- Поддержка создания сессий через `session.create` на WebSocket-шлюзе, исключающая ошибки `4001 session not found` и `404 Not Found` на несуществующих в SQLite сессиях.
- Корректный `session.resume` существующих сессий с передачей `profile`.
- Кнопка прерывания генерации (Interrupt / `/stop` через `slash.exec`) в шапке чата и строке ввода при активном стриминге ответа.
- Автообновление списка сессий в боковой панели после завершения генерации ответа (`turn.end`).
- **JSON-конфигурация реестра агентов** (`agents-config.json`): декларативный
  список AgentTarget вместо хардкода в TS. Подстановка `${ENV_VAR}` для кред,
  документированный шаблон `agents-config.json.example`.
- Vite middleware `GET /api/agents`: чтение JSON, env-подстановка, валидация
  (уникальные id, обязательные name/auth.type, enum auth-типов), 404/500 с деталями.
- Модули `src/config/envSubst.ts` (`expandEnvPlaceholders`) и
  `src/config/loadAgents.ts` (`loadAgentsFromConfig` с fallback).

### Изменено (json-agents-config)

- `src/config/agents.ts`: хардкод стал `FALLBACK_AGENTS`; добавлены
  `getAgents()` / `getAgentsSync()`; `AGENTS` — deprecated-алиас fallback-а.
- `src/App.tsx`: асинхронная загрузка агентов через `getAgents()` с
  синхронным fallback при старте.
- KB: README_FLEET (секция «JSON-конфигурация»), README_DEV (agents-config.json).
