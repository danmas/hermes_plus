# Design: sessions-search

## Context

- KB: `GET /api/sessions/search?q=...` — FTS5 on dashboard :9119.
- Official dashboard UI: full-text across message content + snippets.
- List API remains `GET /api/sessions?limit&offset`; search is a **separate** path.
- Auth: same as sessions-read (session-token / cookie via client or BFF).
- Fleet: multiple `AgentTarget` in registry; each has own `state.db`.

## Three scopes

| Scope | Data source | Network |
|-------|-------------|---------|
| **Session** | Loaded `messages[]` of selected session (or fetch messages once if not loaded) | 0 or 1 messages GET |
| **Agent** | `GET /api/sessions/search?q=&profile=` on active target | 1 search request |
| **Fleet** | Same search on every online target | N search requests (parallel) |

## Decisions

### D1. Session scope = client-side (or messages endpoint), not FTS API
- `/api/sessions/search` is cross-session FTS; for one session, filter
  `content` / tool_calls text in memory after messages are available.
- Highlight matches; jump to message index / scroll into view.
- If messages not loaded yet — load via existing `getSessionMessages`, then filter.
- Messages endpoint may paginate (`pagination.has_more`). Probe it; if the
  transcript is not fully returned, either fetch remaining pages before
  filtering, or explicitly state in UI: "searched in N loaded messages".
- Optional later: if Hermes exposes in-session search param, prefer server.

### D2. Agent scope = official FTS endpoint
- `HermesClient.searchSessions(query, opts?)` →
  `/api/sessions/search?q=...` + `profile` when set.
- Normalize query for FTS5 before sending: wrap in double quotes / strip
  FTS operators (`"`, `*`, `-`, `:`, …) so input like `C++` or `"auth"`
  cannot break the query or return false zero.
- Live-probe response fields (`sessions`, `match_preview`, `match_type`, …);
  type loosely + normalize.
- Empty `q`: do not call search; show normal paginated list.
- Debounce input (~300ms) + abort the previous in-flight request
  (AbortController) on every new keystroke.

### D3. Fleet scope = fan-out + merge
- Parallel `searchSessions` per target in registry (skip offline if health known).
- Per-target timeout 2–3 s so one dead host cannot hold the whole `allSettled`.
- Each hit tagged with `agentId`, `agentName`, `profile`.
- Merge sort: prefer `started_at` / server rank if present, else stable by agent id.
- Partial failure: show errors per target, still show successful hits.
- Without prod BFF: browser may only reach targets already proxied (localhost + /l1…);
  document that full fleet search needs BFF or reachable baseUrls.

### D4. UI
- One search box; segmented control: `Session | Agent | Fleet`.
- Empty/loading state shows active scope label ("searching in projects-ex" /
  "searching entire fleet") to avoid Session-vs-Agent confusion.
- Session mode disabled if no `selectedSessionId` (or only `new`).
- Agent mode uses current fleet selection.
- Results replace or overlay list pane; clear returns to list pagination.

### D5. Security
- No tokens in URL query beyond what Hermes expects; auth headers via client/BFF.
- Do not log full message bodies in dev console in production builds.

## Risks

| Risk | Mitigation |
|------|------------|
| Search API shape differs by Hermes version | feature-detect + normalize; probe in tasks |
| Raw user query breaks FTS5 syntax | quote/strip operators client-side (D2) |
| Fleet CORS / auth | only targets with working proxy/BFF in MVP |
| Large in-session message arrays | filter in worker/idle; cap highlight count |

## Migration

Additive. No break to existing list/chat.
