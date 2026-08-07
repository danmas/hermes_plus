# hermes_plus — WS-протокол чата (реверс из исходников)

Снято из исходников Hermes 0.20.0:
`hermes_cli/web_server.py`, `tui_gateway/ws.py`, `tui_gateway/server.py`,
`tui_gateway/methods_*.py`. Дата: 2026-08-06.

## Суть

Embedded-чат дашборда — это **JSON-RPC 2.0 поверх WebSocket** на `/api/ws`.
`/api/ws` делегирует в `tui_gateway.ws.handle_ws`, который реюзает
`tui_gateway.server.dispatch` — тот же диспетчер RPC-методов, что и у `hermes --tui`.

⚠️ Важно: под капотом чат гоняет **PTY с `hermes --tui`** (см. `_resolve_chat_argv`),
а `/api/ws` — это транспорт к его JSON-RPC gateway. То есть ты говоришь с тем же
движком, что и настоящий TUI.

- `_DASHBOARD_EMBEDDED_CHAT_ENABLED = True` (иначе close code `4403`).
- WS-auth через тикеты (`dashboard_auth/ws_tickets.py`); провал → close `4401`.

## Три WS-эндпоинта

| WS | Роль | Говорит клиент? |
|---|---|---|
| `/api/ws` | Основной JSON-RPC канал агента (запросы + события) | Да (RPC-запросы) |
| `/api/pub` | Publish в channel (PTY-сайдкар пишет туда emit'ы) | Да (text-кадры) |
| `/api/events` | Broadcast подписчикам того же channel (tool-call feed для сайдбара) | Нет — только слушает |

- `/api/pub` и `/api/events` требуют `?channel=<id>`, где `id` матчит
  `^[A-Za-z0-9._-]{1,128}$` (`_VALID_CHANNEL_RE`). Невалидный → close `4400`.
- Для полноценного чата достаточно **`/api/ws`** — он и шлёт запросы, и стримит события.
  `/api/pub`+`/api/events` — вспомогательный fan-out между PTY-сайдкаром и React-сайдбаром.

## Формат кадров (JSON-RPC 2.0)

### Запрос (клиент → сервер)
```json
{ "jsonrpc": "2.0", "id": 1, "method": "prompt.submit",
  "params": { "session_id": "<sid>", "text": "привет" } }
```

### Ответ (сервер → клиент)
```json
{ "jsonrpc": "2.0", "id": 1, "result": { ... } }
{ "jsonrpc": "2.0", "id": 1, "error": { "code": 4090, "message": "..." } }
```

### Событие (сервер → клиент, без id) — конверт `_event_frame`
```json
{ "jsonrpc": "2.0", "method": "event",
  "params": { "type": "message.delta", "session_id": "<sid>",
              "payload": { "text": "часть ответа" } } }
```
При подключении первым приходит `event` c `type: "gateway.ready"`.

## Стрим-события чата (`params.type`)

Токены коалесятся (буфер ~30fps) для трёх типов — **это стрим ответа**:
```
message.delta      payload.text   ← токены ответа ассистента
reasoning.delta    payload.text   ← reasoning-стрим
thinking.delta     payload.text   ← thinking-стрим
```
Tool-события (жизненный цикл инструментов, для UI-трейса):
```
tool.start        payload = {name, tool_id, ...}
tool.generating   payload = {name}
tool.complete     payload = {...open_tool}
tool.output_risk  payload = {tool_id, ...}
```
Маркеры хода:
```
turn.start / turn.started   turn.end   turn.error
```
Управляющие/системные:
```
gateway.ready   control.ack   control.error   interrupt.ack
session.seeded  session.reclaimed  session.info
approval.request  reload_mcp.ack  shutdown.ack
```

## Ключевые RPC-методы (из `tui_gateway/methods_*.py`)

### Чат
```
prompt.submit    params: { session_id, text,
                           truncate_before_user_ordinal?, interrupted?,
                           queued?, confirm_empty_truncate? }
                 коды ошибок: 4090 (лимит), 4009/4004/4018 и т.п.
slash.exec       выполнить slash-команду
complete.path / complete.slash    автодополнение
```
### Сессии
```
session.list         params: { profile? }        историчный список из state.db
session.active_list  live-сессии в этом gateway-процессе
session.resume       params: { session_id, cols?, ... }
session.branch / session.compress
```
### Прочее
```
model.options   llm.oneshot   skills.manage   plugins.manage
tools.*         shell.exec     cli.exec        process.list
projects.discover_repos / tree / project_sessions
setup.status / setup.runtime_check   reload.mcp
pet.* / learning.frames / usage.bars / session.usage / billing.*
```
(полный список — в массиве методов `tui_gateway/server.py`, ~строки 198–282)

## Минимальный клиентский флоу

1. Открыть `ws://127.0.0.1:9119/api/ws` (с WS-тикетом/cookie-сессией; на loopback
   `auth_required:false`, но тикет-механика для WS всё равно есть — снять живьём).
2. Дождаться `event` c `type:"gateway.ready"`.
3. Получить/создать session_id: `session.list` (история) или `session.active_list`.
4. Отправить `prompt.submit {session_id, text}`.
5. Рендерить входящие `event`:
   - копить `message.delta.payload.text` в пузырь ассистента,
   - показывать `tool.start`/`tool.complete` как трейс,
   - закрыть пузырь по `turn.end` (или показать `turn.error`).
6. Прерывание — отдельный RPC (interrupt → `interrupt.ack`).

## TODO / не снято точно

- [x] Точный WS-handshake auth: на loopback достаточно `?token=<SESSION_TOKEN>`
      (проверено живьём 2026-08-06: 101 + JSON-RPC отвечает). В gated mode —
      `POST /api/auth/ws-ticket` → `?ticket=` (TTL 30 c, single-use).
- [ ] Полная схема `result` у `session.list` / `session.resume` (поля сессии).
- [ ] Точный payload `tool.start` (какие поля кроме name/tool_id).
- [ ] Как создаётся НОВАЯ сессия (не resume) — вероятно первый `prompt.submit`
      без существующего session_id либо отдельный метод; проверить живьём.
