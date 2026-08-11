# sessions-search

| Field | Value |
|-------|--------|
| Goal | Search in three scopes: current session, selected Hermes (agent+profile), entire fleet |
| Specs | `session-search-in-session`, `session-search-agent`, `session-search-fleet` |
| Depends on | sessions list/messages client, AgentTarget registry, auth |
| Status | proposed |

## Scopes (summary)

1. **Session** — filter messages of the selected session (client-side / messages API).
2. **Agent** — `GET /api/sessions/search?q=` on current target (FTS5).
3. **Fleet** — parallel search all registry targets; label hits; switch agent on open.

## Workflow

1. Live-probe `/api/sessions/search`
2. Implement client + three scopes per tasks.md
3. Verify no full message scan for Agent/Fleet FTS
4. Archive after accept
