# Proposal: sessions-search

## Why

Оператору нужно находить текст в истории без ручного скролла. Hermes уже даёт
FTS5 через `GET /api/sessions/search?q=...` (dashboard) и tool `session_search`
(агент). В hermes_plus поиска в UI ещё нет: список — только `limit`/`offset`.

Нужны **три режима** с разным scope:

1. **In-session** — поиск по сообщениям **выбранной** сессии (локальный filter /
   якоря в уже загруженных messages, без FTS по всему профилю).
2. **Agent** — поиск по **всем сессиям** выбранного AgentTarget (машина + profile)
   через официальный `/api/sessions/search`.
3. **Fleet** — поиск по **всем** targets из registry: N запросов (или BFF fan-out),
   merge результатов с меткой агента.

## What Changes

- Capability **session-search-in-session** — filter/highlight в открытой сессии.
- Capability **session-search-agent** — REST search на одном Hermes target.
- Capability **session-search-fleet** — multi-target aggregation.
- UI: единый search input + переключатель scope (Session | Agent | Fleet).
- Client: `searchSessions(q)` (+ optional profile); fleet helper поверх registry.
- **Не** парсить `state.db`; **не** подменять FTS клиентским сканом всех messages
  всех сессий.

## Non-goals

- Семантический / embedding search.
- Замена agent tool `session_search` (это path модели, не UI).
- Мутации (delete/rename) из результатов поиска.
- Гарантия единого ранжирования cross-host без BFF (MVP = merge + sort by time).

## Impact

- Specs: три capability-файла.
- Code: `HermesClient`, `_SessionList` / search bar, optional BFF proxy for fleet.
- Live-probe shape of `/api/sessions/search` → обновить KB при расхождении.
