# Design: sessions-list-order-dates

## Context (as of code 2026-08-07)

- `HermesClient.getSessions({ limit, offset })` → only `limit`/`offset` (+ `profile`).
- `_SessionList`: `sessions = data?.sessions ?? []`, **no `.sort()`**.
- Card footer already:
  ```ts
  const date = session.started_at
    ? new Date(session.started_at).toLocaleDateString()
    : '—';
  ```
- Types (`HermesSession`): `started_at?: number`, `ended_at?: number | null`.

## Decisions

### D1. Newest-first definition
Primary key: **`started_at` descending** (larger timestamp = newer).  
Missing `started_at`: treat as oldest (sort last).  
Tie-break: `id` string descending (stable-ish).

### D2. Server vs client sort
1. Live-probe whether `GET /api/sessions` accepts order query
   (candidates: `sort=started_at`, `order=desc`, `order_by=started_at`).
2. If yes — pass from client; document in SURVEY.
3. If no — **client sort of the returned page** before render.

**Pagination caveat:** without server order, page 0 is “whatever API returns first”,
then sorted locally. Acceptable for MVP; ideal is server DESC so offset 0 = newest.

### D3. Date display on card
- Primary: `started_at`.
- Fallback: `ended_at`, else em dash.
- Format helper `formatSessionWhen(ts: number): string`:
  - same calendar day → time only or «сегодня HH:mm»;
  - else short date + time (`toLocaleString` with locale default);
  - `title` attribute = full ISO for hover.
- Do not use only `toLocaleDateString()` (hides same-day recency).

### D4. Placement
- Sort: pure function `sortSessionsNewestFirst(sessions)` before `.map`.
- Date: shared helper under `src/` (e.g. util next to size helpers if present).

## Risks

| Risk | Mitigation |
|------|------------|
| API already newest-first; double-sort harmless | Client sort is idempotent for DESC |
| API oldest-first + client page sort | Document; follow-up server param |
| `started_at` in seconds not ms | If values look like seconds (< 1e12), multiply ×1000 in formatter |

## Migration

Additive. No breaking API client changes beyond optional query params.
