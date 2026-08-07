# Design: session-size-display

## Context

- List: `GET /api/sessions` → `{ sessions, total, limit, offset }`.
  Known item fields: `id`, `title`/`display_name`, `model`, `message_count`,
  `source`, timestamps; rest via `[k: string]: unknown`.
- Messages: `GET /api/sessions/{id}/messages` → `{ session_id, messages, pagination }`.
  Message: `role`, `content?`, `tool_calls?`, …
- Related (not primary path): `GET /api/sessions/stats`,
  `GET /api/sessions/{id}/export`.
- Live note from `real-sessions-access` design: messages payload can be 100–500 KB+.

## Goals / Non-Goals

**Goals:**
- Show operator the weight of an open session in human-readable form (B/KB/MB).
- Do not worsen list latency: size from messages only after session select.
- Reuse messages already loaded in ChatConsole (no second fetch only for size).

**Non-Goals:**
- Exact model tokenizer (tiktoken, etc.).
- Bulk size precompute for the whole fleet.
- Server-side aggregation inside Hermes (we stay a thin client).

## Decisions

### D1. Two-tier metrics
- **List row:** always `message_count`; size/token badge only if present on list DTO.
- **Open session:** compute from loaded `messages[]`.
- **Why:** avoids N+1 messages fetches; matches thin-client principle.

### D2. What “size” means
Compute from messages array:

| Metric | Definition | UI label |
|--------|------------|----------|
| `chars` | sum of string `content` lengths + JSON length of `tool_calls` if any | optional |
| `bytes` | `TextEncoder.encode(JSON.stringify(messages)).length` | primary (`186 KB`) |
| `approxTokens` | `Math.round(chars / 4)` | secondary (`~12k tok`), marked approximate |

`bytes` is the best proxy for network/render weight. `approxTokens` is UI-only.

### D3. Heavy-session threshold
- Default warn if `bytes > 500_000` (single configurable constant).
- UI: muted badge / “heavy” hint; do not block open.

### D4. No export endpoint for list sizing
- `/export` and full messages scan are out of the list path.
- Optional later: on-demand “Measure” action per row (explicit click) — not MVP.

### D5. Placement
- `_SessionList`: show `message_count`; if live JSON has `bytes` (or similar),
  map into type and show `formatBytes`.
- `_ChatConsole` header (or session meta): after messages query success,
  show `formatBytes(bytes)` · `message_count` · optional `~tok`.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| RU text breaks chars/4 token estimate | Label as approximate; primary metric is bytes |
| Huge messages stringify freezes UI | Memoize; data already in memory after load |
| List API adds official size later | Prefer server field over client compute when both exist |

## Migration

None. Additive UI + pure helpers. No API contract break.
