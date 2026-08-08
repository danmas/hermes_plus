# sessions-list-order-dates

| Field | Value |
|-------|--------|
| Goal | Newest sessions on top; clear dates on session cards |
| Specs | `sessions-list-order`, `session-card-dates` |
| Status | proposed |

## As-is (code)

- No client sort; order = API page order.
- Card already shows `toLocaleDateString(started_at)` only (date, no time).
- Types: `started_at?: number`, `ended_at?: number | null`.

## Workflow

1. Live-probe sort query params on Hermes
2. Implement sort + `formatSessionWhen`
3. Verify first page feels newest-first
4. Archive after accept
