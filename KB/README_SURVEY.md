# hermes_plus — Обследование Hermes web-API

Снято вживую с запущенного `hermes dashboard` на этой машине.

- **Дата обследования:** 2026-08-06
- **Версия Hermes:** 0.20.0 (release_date 2026.8.3, config_version 33)
- **База:** `http://127.0.0.1:9119`
- **Источник карты:** исходники `hermes_cli/web_server.py` + `hermes_cli/web_routers/*.py`
  (путь установки: `C:\Users\roman\AppData\Local\hermes\hermes-agent\hermes_cli`)
- **Web-UI дашборда:** React (Vite/rolldown), dist в `hermes_cli/web_dist/`

## Как поднять / заглушить

```bash
hermes dashboard --no-open --skip-build   # web-UI + REST + WS, порт 9119
hermes serve --no-open                     # headless backend (JSON-RPC/WS), тоже 9119
hermes dashboard --status                  # список процессов
hermes dashboard --stop                    # заглушить все web-server процессы
```

- `dashboard` и `serve` — это **ОДИН и тот же** machine-level сервер на 9119
  (не два разных). `--isolated` — отдельный сервер на профиль.
- Готовность в логе: строка `HERMES_DASHBOARD_READY port=9119`.

## Auth

- На loopback (`127.0.0.1`) `GET /api/status` вернул `"auth_required": false`.
- REST-роуты, требующие сессии, без cookie дают **401** (web-UI ставит cookie сам).
- Для не-интерактивного доступа есть **bearer-token seam**: токен в заголовке
  `Authorization: Bearer <...>`, но роут должен быть зарегистрирован как token-route
  (`register_token_route`). Fails closed: незарегистрированный/неизвестный токен → 401.
- Внешний bind всегда требует auth-провайдера (пароль/OAuth). `--insecure` = no-op (депрекейт июнь 2026).
  Локально — bind 127.0.0.1 + туннель.
- Модуль auth: `hermes_cli/dashboard_auth/` (`token_auth.py`, `middleware.py`, `ws_tickets.py` — тикеты для WS).

### 🧪 Живой замер auth (2026-08-06, Hermes 0.20.0, loopback :9119)

**Главное открытие для BFF/автоматизации:**

> Loopback-аутентификация = заголовок **`X-Hermes-Session-Token: <SESSION_TOKEN>`**
> (или legacy `Authorization: Bearer <SESSION_TOKEN>`). Токен генерится на каждый
> старт сервера (`secrets.token_urlsafe(32)`) и **инжектится в SPA HTML** —
> достаётся парсингом `SESSION_TOKEN__="..."` из `GET /`.

Проверено живьём:

| Запрос | Без токена | С `X-Hermes-Session-Token` |
|--------|-----------|---------------------------|
| `/api/status`, `/api/model/info` | 200 (публичные) | 200 |
| `/api/skills`, `/api/sessions`, `/api/config` | 401 | **200** |
| `/api/profiles`, `/api/profiles/sessions` | 401 | **200** |
| `/api/cron/jobs`, `/api/memory`, `/api/mcp/servers` | 401 | **200** |
| `/api/tools/toolsets`, `/api/system/stats` | 401 | **200** |
| `/api/fs/list?path=...` | 401 | 200 (422 без path — валидация) |
| WS `/api/ws?token=<SESSION_TOKEN>` | — | **101 Switching Protocols** + JSON-RPC отвечает (`gateway.ready`, `session.list`) |

**Полный список публичных роутов (без auth)** — `hermes_cli/dashboard_auth/public_paths.py`:
`/api/health`, `/api/status`, `/api/config/defaults`, `/api/config/schema`,
`/api/model/info`, `/api/dashboard/themes`, `/api/dashboard/plugins`, `/api/cron/fire`.

**Bearer-token seam — почти пуст:** единственный `register_token_route` — `/api/gateway/drain`
(плагин `plugins/dashboard_auth/drain`, NAS-driven drain control). То есть:
- ⚠️ **bearer-токен НЕ открывает `/api/skills`, `/api/sessions` и пр.** — эти роуты не token-registered
- для fleet/BFF рабочий путь — `X-Hermes-Session-Token` (полученный из HTML) или
  `HERMES_DASHBOARD_SESSION_TOKEN` в env при старте сервера (тогда токен стабилен между рестартами)
- **Gated-auth (auth_required: true, напр. 192.168.1.221):** bearer и session-token
  НЕ работают — только **cookie-сессия**: `POST /auth/password-login`
  `{provider:'basic',username,password}` → куки `hermes_session_at/rt/provider`
  (HttpOnly, Max-Age 12ч) → `Cookie` header на gated роуты. `GET /` без куки → 302
  на /login (SPA-токена НЕТ). Проверено живьём: 7 сессий, 210 сообщений.
- **WS-auth:** на loopback достаточно `?token=<SESSION_TOKEN>` (101 + RPC работает);
  в gated mode — single-use тикеты `POST /api/auth/ws-ticket` → `?ticket=` (TTL 30 c; на loopback
  этот эндпоинт вернул 401 — тикеты для OAuth-режима)

**Вывод для fleet-архитектуры:** BFF на каждой машине должен (1) взять токен из env
`HERMES_DASHBOARD_SESSION_TOKEN` (если задан при старте) либо вытащить из SPA HTML,
(2) слать его в `X-Hermes-Session-Token` на все REST-запросы и в `?token=` на WS-upgrade.
Токен переживает рестарт только при явном env — иначе меняется.

## Профиле-скоуп

Почти все роуты принимают `?profile=<name>`. Активный профиль: `projects-ex`.
Кросс-профильные списки: `/api/profiles/sessions`, `/api/profiles/sessions/sidebar`.

---

## Карта эндпоинтов

### Status / Health / Ops
```
GET    /api/status                       version, gateway_state, platforms, auth_required, components
GET    /api/health
GET    /api/system/stats
GET    /api/logs
GET    /api/curator                      PUT /api/curator/paused · POST /api/curator/run
GET    /api/learning/graph · /api/learning/node (GET/PUT/DELETE)
GET    /api/portal
POST   /api/ops/doctor | backup | import | import-upload | security-audit
POST   /api/ops/prompt-size | dump | config-migrate | debug-share
GET    /api/ops/backup/download
GET/POST /api/ops/hooks
POST   /api/ops/checkpoints/prune
POST   /api/hermes/update · GET /api/hermes/update/check
GET    /api/ssh/ownership
```

### Sessions (viewer сессий)
```
GET    /api/sessions                     список
GET    /api/sessions/search?q=...        FTS5-поиск
GET    /api/sessions/stats
GET    /api/sessions/empty/count · DELETE /api/sessions/empty
GET    /api/sessions/{id}
GET    /api/sessions/{id}/messages       ← сообщения сессии
GET    /api/sessions/{id}/export
GET    /api/sessions/{id}/latest-descendant
PATCH  /api/sessions/{id}                rename
DELETE /api/sessions/{id}
POST   /api/sessions/bulk-delete | import | prune
GET    /api/profiles/sessions            кросс-профильный список
GET    /api/profiles/sessions/sidebar
```
(роутеры: `list_router`, `search_router`, `manage_router` в `web_routers/sessions.py`;
`sessions_router` в `web_routers/profiles.py`)

### Skills (skills browser)
```
GET    /api/skills                       список
GET    /api/skills/content?...           тело SKILL.md
POST   /api/skills                       создать
PUT    /api/skills/content               редактировать
PUT    /api/skills/toggle                вкл/выкл
```
(+ `hub_router` для skill-hub в `web_routers/skills.py`)

### Config / Env / Model
```
GET/PUT /api/config
GET    /api/config/defaults · /api/config/schema
GET/PUT /api/env · POST /api/env/reveal · DELETE /api/env   (секреты — только reveal)
GET    /api/model/info | options | recommended-default | auxiliary | moa
PUT    /api/model/moa · POST /api/model/set
GET    /api/egress/status
GET    /api/providers/oauth · POST .../{id}/start|submit · GET .../{id}/poll/{session} · DELETE ...
GET/POST /api/providers/custom-endpoints (+ /{id}/activate, DELETE, /validate)
POST   /api/providers/validate
GET    /api/credentials/pool · POST · DELETE /{provider}/{index}
GET    /api/memory · PUT /api/memory/provider · POST /api/memory/reset
GET    /api/memory/providers/{name}/config · POST .../setup · PUT .../config
```

### Tools / Toolsets
```
GET    /api/tools/toolsets
PUT    /api/tools/toolsets/{name}
GET    /api/tools/toolsets/{name}/config | models
PUT    /api/tools/toolsets/{name}/model | provider | env
POST   /api/tools/toolsets/{name}/post-setup
GET    /api/tools/terminal/backends · PUT /api/tools/terminal/backend
GET    /api/tools/computer-use/status · POST /api/tools/computer-use/permissions/grant
```

### Cron
```
GET    /api/cron/jobs · /api/cron/jobs/{id} · /api/cron/jobs/{id}/runs
POST   /api/cron/jobs · /api/cron/jobs/{id}/pause|resume|trigger · /api/cron/fire
PUT    /api/cron/jobs/{id} · DELETE /api/cron/jobs/{id}
GET    /api/cron/delivery-targets · /api/cron/blueprints
POST   /api/cron/blueprints/instantiate
```

### MCP
```
GET    /api/mcp/servers · POST · PUT · DELETE /api/mcp/servers/{name}
POST   /api/mcp/servers/{name}/test | auth · PUT .../enabled
GET    /api/mcp/oauth/flows/{flow_id} · /api/mcp/oauth/callback/{server:path}
GET    /api/mcp/catalog · POST /api/mcp/catalog/install
```

### Git / Review
```
GET    /api/git/status | worktrees | branches | base-branches
GET    /api/git/review/list | diff | commit-context | rev-parse | ship-info
GET    /api/git/file-diff
POST   /api/git/review/stage | unstage | revert | commit | push | create-pr
POST   /api/git/worktree/add | remove · /api/git/branch/switch
```

### Profiles
```
GET    /api/profiles · POST · PATCH /{name} · DELETE /{name}
GET    /api/profiles/active · POST /api/profiles/active
GET    /api/profiles/{name}/setup-command | soul | desktop-overlay
PUT    /api/profiles/{name}/soul | description | model
POST   /api/profiles/{name}/open-terminal | describe-auto | export · /api/profiles/import
```

### Messaging / Gateway
```
GET    /api/messaging/platforms · PUT /{platform_id} · POST /{platform_id}/test
POST   /api/messaging/whatsapp/onboarding/start · GET/POST/DELETE .../{pairing_id}[/apply]
POST   /api/messaging/telegram/onboarding/start · GET/POST/DELETE .../{pairing_id}[/apply]
POST   /api/gateway/start | stop | restart | drain
GET    /api/pairing · POST /api/pairing/approve | revoke | clear-pending
GET    /api/webhooks · POST /api/webhooks[/enable] · DELETE /{name} · PUT /{name}/enabled
```

### Files / FS / Media
```
GET    /api/files · /api/files/read · /api/files/download
POST   /api/files/upload | upload-stream | mkdir · DELETE /api/files
GET    /api/fs/list | read-text | read-data-url | git-root | default-cwd
POST   /api/fs/write-text
GET    /api/media · POST /api/chat/image-upload
```

### Audio (voice)
```
POST   /api/audio/transcribe | speak
GET    /api/audio/elevenlabs/voices
WS     /api/audio/speak-stream
```

### Actions / Agent-plugins / Misc
```
GET    /api/actions/{name}/status
POST   /api/dashboard/agent-plugins/install
POST   /api/dashboard/agent-plugins/{name:path}/enable | disable | update
```

---

## 💬 Чат — через WebSocket, НЕ REST

Штатный чат дашборда идёт по WS, а не `/v1/chat/completions`:
```
WS  /api/ws        основной канал сессии/агента
WS  /api/pub       publish (отправка сообщений)
WS  /api/events    broadcast событий чат-таба (стрим токенов + tool-calls)
WS  /api/audio/speak-stream   TTS-стрим
```
- Комментарий в коде: «/api/pub + /api/events — chat-tab event broadcast».
- WS-аутентификация — через тикеты (`dashboard_auth/ws_tickets.py`).
- **TODO:** снять точный формат кадров (структура JSON: type/action/payload) из
  `web_server.py` (~строки 15843–15920) или через DevTools → Network → WS на живом сервере.

### OpenAI-совместимый REST (`/v1/...`)
Это **отдельный** «API Server» адаптер платформы внутри gateway
(`plugins/platforms/`), а НЕ этот сервер на 9119. Порт/ключ настраиваются отдельно;
число 8642 из внешних советов — не подтверждено, не хардкодить.
Нужен только если хочешь REST-чат вместо WS.

---

## Пример проверки (curl)

```bash
curl -s http://127.0.0.1:9119/api/status | python -m json.tool     # 200, без auth на loopback
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9119/api/skills   # 401 без cookie-сессии
```

## Замечания по надёжности

- Открывать сервер для feature-detection именно через `/api/status` — там `version`
  и `config_version`, по ним ветвить поведение UI между версиями Hermes.
- Не полагаться на конкретные пути вслепую при мажорных апдейтах — пере-снять карту
  тем же способом (`grep` по `web_routers/*.py` + `web_server.py`).
