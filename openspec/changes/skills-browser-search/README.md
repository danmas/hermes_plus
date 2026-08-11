# skills-browser-search

| Field | Value |
|-------|--------|
| Goal | Просмотр skills и поиск по skills по аналогии с sessions explorer |
| Specs | `skills-list-read`, `skill-content-read`, `skill-search-agent`, `skill-search-fleet`, `skill-search-in-skill` |
| Depends on | `HermesClient` auth (session-token / cookie / BFF), AgentTarget registry, fleet health |
| Status | proposed |
| Analog | `real-sessions-access` (list + detail) + `sessions-search` (scopes) |

## Summary

1. **List** — `GET /api/skills` на выбранном AgentTarget; карточки skill.
2. **Content** — `GET /api/skills/content?...` тело SKILL.md в правой/нижней панели.
3. **Search Agent** — фильтр по списку (и при необходимости по content) на текущем target.
4. **Search Fleet** — fan-out list skills по registry; метка агента; matrix опционально.
5. **Search in-skill** — поиск по уже загруженному (или догружаемому) тексту skill.

Hermes **не** документирует FTS `/api/skills/search` (в отличие от sessions). MVP-поиск — **client-side** по полям list + content; server FTS — если live-probe найдёт endpoint.

## Non-goals (period-1)

- Создание / правка / toggle / delete skills (mutations).
- Skill-hub marketplace.
- Парсинг `skills/*.md` с диска в обход web-API.
- Семантический / embedding search.

## Workflow

1. Live-probe list + content shape (local + l1).
2. Client methods + types.
3. UI pane Skills (рядом / вместо toggle с Sessions).
4. Search scopes + verification.
5. Archive after accept.
