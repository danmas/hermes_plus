# Changelog

Все важные изменения в проекте документируются в этом файле.

Формат: `## [Версия] - YYYY-MM-DD`, внутри — `### Добавлено` / `### Изменено` / `### Исправлено`.
Версия — из `package.json` (SemVer: MAJOR.MINOR.PATCH).

---

## [0.4.1] - 2026-08-11

### Добавлено

- Логин оператора BFF рядом с паролем: `HERMES_PLUS_USERNAME` в `.env.local` /
  `.env.example` (default `operator`).
- Поле **Логин** на `/login` с `autocomplete="username"` + пароль
  `autocomplete="current-password"` — браузерные менеджеры паролей сохраняют пару.
- **Skills browser** (openspec `skills-browser-search`): вкладка **Sessions | Skills**,
  список `GET /api/skills`, просмотр `GET /api/skills/content?name=`, поиск
  Skill | Agent | Fleet (client-side filter + fleet fan-out).
- `HermesClient.getSkillContent`, normalize envelope в `getSkills`;
  утилиты `src/utils/_skillSearch.ts`; UI `_SkillList`, `_SkillViewer`.
- **Skill copy DnD** (openspec `skills-copy-dnd`): BFF `POST /api/skills/export|import`
  (пакет через `/api/fs/*` + create), create-only + rename, cleanup rollback;
  drag user-skill → drop на fleet-карточку (`SkillDragProvider`).

### Изменено

- `POST /auth/login` принимает `{ username, password }`; оба поля сверяются
  timing-safe; единый ответ при ошибке: «Неверный логин или пароль».
- `GET /api/me` возвращает `user` из `HERMES_PLUS_USERNAME`.

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

### Добавлено (session-size-display)

- Утилиты `src/utils/_sessionSize.ts`: чистые функции `formatBytes` (B, KB, MB, GB) и `sessionPayloadSize` (подсчёт chars, bytes JSON UTF-8, approxTokens `round(chars / 4)` и детекция `isHeavy` при превышении 500 KB payload).
- В шапке активного чата (`_ChatConsole.tsx`): отображение размера истории диалога (`formatBytes`), количества сообщений, ориентировочного числа токенов (`~N tok`) и неблокирующего предупреждения `⚠️ Тяжёлая сессия` (>500 KB).
- В списке сессий (`_SessionList.tsx`): гарантированное отображение `message_count` и динамический бейдж размера (`formatBytes` и `~tok`) для ранее открытых в текущей сессии чатов через кэш без выполнения $N+1$ лишних сетевых запросов.
- Типы `HermesSession` в `src/types/hermes.ts` дополнены опциональными полями `bytes?: number` и `total_tokens?: number`.
- OpenSpec: спецификация `openspec/changes/session-size-display` (валидация пройдена).

### Добавлено (sessions-list-order-dates)

- Утилиты `src/utils/_sessionDates.ts`: `normalizeTimestamp` (поддержка Unix-таймстемпов в секундах и миллисекундах), `sortSessionsNewestFirst` (детерминированная сортировка сессий по `started_at` DESC с fallback на `ended_at` и tie-break по `id`), `formatSessionWhen` (локализованное форматирование «Сегодня, HH:mm» / «Вчера, HH:mm» / «DD.MM.YYYY, HH:mm» с полным ISO-таймстемпом в hover `title`).
- В списке сессий (`_SessionList.tsx`): гарантированный порядок Newest-First перед рендером и информативное отображение времени активности в карточках сессий.
- База знаний (`KB/README_SURVEY.md`): зафиксированы результаты живого замера `GET /api/sessions` (отсутствие параметров сортировки и формат секундных таймстемпов).
- OpenSpec: спецификация `openspec/changes/sessions-list-order-dates` (валидация пройдена).

### Исправлено

- Исправлен конфликт идентификаторов сессий (`session.seeded`): внутренний runtime session ID шлюза больше не перезаписывает постоянный SQLite ID сессии в `App.tsx` при открытии существующих сессий, устраняя ошибку `404 Not Found` на `/messages` и последующую ошибку `RPC 4007: session not found`.
- Исправлено преждевременное размонтирование `ChatConsole` при генерации в новой сессии: стабильный `key={activeAgent.id}` в `App.tsx` предотвращает уничтожение компонента и обрыв WebSocket во время стриминга ответа.
- Исправлена ошибка `403 Forbidden` при WebSocket-рукопожатии (`/api/ws`): добавлен dev-BFF роут `/api/auth/session-token` в `vite.config.ts`, метод `HermesClient.getToken()` с мьютексом `authPromise` и кэшированием токена, предотвращены лишние циклы реконнекта в `ws.ts`.

## [0.2.1] - 2026-08-08

### Добавлено

- Новая секция KB: `KB/README_SECURITY_PLANS.md` — модель угроз, журнал решений
  по транспорту (cloudflared ❌ → Tailscale Serve ✅ → проброс порта + логин BFF ✅,
  т.к. есть домен carlinkmail.ru), финальная схема публикации в интернет
  (BFF :8787, Let's Encrypt DNS-01, требования к авторизации), план работ.
- `KB/README_INDEX.md`: раздел добавлен в оглавление.

## [0.3.0] - 2026-08-08

### Добавлено

- **Prod-BFF (Hono + Node)** — каталог `server/`: единственный публичный
  компонент для публикации UI в интернет (см. KB/README_SECURITY_PLANS.md):
  - логин оператора по паролю (timingSafeEqual) → HttpOnly/SameSite=Lax кука
    `hp_sid`; сессии in-memory (idle 12 ч / TTL 7 дней); rate-limit на логин
    (5 неудач / 15 мин с IP → 429); встроенная страница `/login`;
  - REST-прокси с server-side auth-injection: `/api/*` → локальный Hermes
    (`X-Hermes-Session-Token` из env/SPA HTML, ретрай при 401), `/l1/*` →
    LAN-агент (cookie jar, lazy-login, автоперелогин); секретные роуты
    (`ws-ticket`, `password-login`) для браузера заблокированы;
  - WS-мост `/api/ws`, `/l1/api/ws`: проверка куки на upgrade, upstream-токены
    и single-use тикеты подставляет сервер, кадры JSON-RPC 1:1;
  - `GET /api/agents` — sanitize-реестр (без секретов); статика `dist/` +
    SPA-fallback — только после логина;
  - секреты (session-token Hermes, креды l1) в браузер не попадают.
- Конфигурация: `.env.example` (шаблон), `HERMES_PLUS_PASSWORD` обязателен
  (≥ 24 символов), порт 8787.
- Smoke-тесты (одноразовые, удалены после прогона): 14/14 PASS — auth,
  REST-прокси обоих живых агентов, WS-мост local/l1.

### Изменено

- `src/api/client.ts`: в PROD-сборке клиент не запрашивает dev-эндпоинты
  (`/api/auth/session-token`, `/l1/api/auth/ws-ticket`) — auth server-side.
- `src/App.tsx`: auth-guard `GET /api/me` → 401 → редирект `/login`
  (dev-режим не затронут).
- `package.json`: `build` = UI + сервер (esbuild-бандл `dist-server/index.mjs`),
  `start`, `typecheck:server`; зависимости: hono, @hono/node-server, ws.
- `ecosystem.config.cjs`: PM2 поднимает prod-BFF вместо Vite dev.
- KB: README_SECURITY_PLANS — секция «Реализация BFF», статусы плана работ.

## [0.3.1] - 2026-08-08

### Добавлено

- Второй LAN-upstream в prod-BFF: маршрут `/l254/*` (REST + WS `/l254/api/ws`)
  с собственным cookie-jar (аналог `/l1`). Позволяет одному BFF показывать
  агентов двух машин: `l1:default` (192.168.1.221) и `local:*` (.254, рабочий комп).
  - `server/config.ts`: `l254Origin`, `l254Username`, `l254Password` (env `HERMES_L254_*`);
  - `server/upstream.ts`: `ensureL254Login` / `resetL254Jar` / `fetchL254WsTicket`;
  - `server/index.ts`: REST-прокси `/l254/*` (lazy-login, ретрай при 401) + WS-upgrade.
- `agents-config.json`: local-агенты переведены на `proxyPath: "/l254"` (same-origin
  через BFF, без CORS); креды — из env `HERMES_L254_USERNAME / HERMES_L254_PASSWORD`.

### Исправлено

- Prod-BFF отдаёт `index.html` с заголовком `Cache-Control: no-cache, must-revalidate`
  (явные роуты `/`, `/index.html` до `serveStatic`, чтение файла на каждый запрос).
  Раньше закэшированный браузером `index.html` тянул старый бандл, который
  запрашивал dev-эндпоинты `/l1/api/auth/session-token` и `/l1/api/auth/ws-ticket`
  → 404 в консоли (в prod они заблокированы; auth полностью server-side).

## [0.4.0] - 2026-08-10

### Добавлено (sessions-search)

- **Поиск по сессиям в трёх scope-ах** в панели сессий (`_SessionList.tsx`):
  - **Session** — клиентский поиск по загруженным сообщениям открытой сессии
    (`content` + `tool_calls`); переиспользует кэш `['messages', ...]` TanStack Query;
    при неполной загрузке показывает честную пометку «искали в N загруженных сообщениях»;
  - **Agent** — FTS5-поиск `GET /api/sessions/search?q=` на активном таргете
    (1 запрос, без N GET сообщений); рендер сниппетов с подсветкой `>>>match<<<`;
  - **Fleet** — параллельный fan-out по всем таргетам реестра (`Promise.allSettled`,
    per-target timeout 3 с, пропуск offline по fleet-health, ошибки не валят общий
    результат); хиты помечены агентом, сортировка по времени активности.
- Поиск в чате (`_ChatConsole.tsx`): scroll-to-match и подсветка `<mark>` найденных
  совпадений в транскрипте (focusMessage).
- Переключатель scope Session | Agent | Fleet + общий поисковый ввод с debounce 300 мс;
  пустой запрос возвращает обычный список сессий; пустые/загрузочные состояния
  показывают активный scope.
- `src/api/client.ts`: метод `searchSessions(q, {limit, offset, signal})` с
  нормализацией запроса для FTS5 (`normalizeFtsQuery` — оборачивание в кавычки,
  экранирование `"`) и пробросом внешнего `AbortSignal` (отмена запроса при новом вводе).
- `src/utils/_sessionSearch.ts`: `searchFleetSessions` (fan-out, таймауты, ошибки
  таргетов) и `parseSnippet` (парсер маркеров `>>>`/`<<<`).
- Типы `SessionSearchHit` / `SessionSearchResponse` (`src/types/hermes.ts`) по
  результатам живого probe.
- Стили поиска в `src/_index.css` (scope-switcher, карточки хитов, сниппеты, `<mark>`).

### Изменено

- `src/App.tsx`: состояние `messageFocus`, выбор сессии из результатов поиска
  (в т.ч. с переключением агента в Fleet-scope), проброс `fleetHealth` в панель сессий.
- KB: `README_SURVEY.md` — живой замер `GET /api/sessions/search` (конверт
  `{results:[...]}`, пример hit с полями, поведение пустого `q`/неизвестного profile,
  маркеры `>>>match<<<`, полный транскрипт messages без `has_more`).

