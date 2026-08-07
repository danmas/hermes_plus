# session-size-display

| Field | Value |
|-------|--------|
| Goal | Показать объём данных сессии (bytes / count / ~tokens) без N+1 fetch в списке |
| Specs | `specs/session-size/spec.md` |
| Depends on | sessions list + messages read (уже в клиенте) |
| Status | proposed |

## Workflow

1. Review `proposal.md` + `design.md`
2. Implement per `tasks.md`
3. Live check: list без лишних `/messages`; open session с badge размера
4. `openspec archive session-size-display` → promote specs
