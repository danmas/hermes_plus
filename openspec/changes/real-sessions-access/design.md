## Context

- **hermes_plus 0.1.0:** Vite + React + TanStack Query skeleton; fleet health table only.
- **Hermes 0.20.0** dashboard on `127.0.0.1:9119` (live-verified): gated sessions need
  `X-Hermes-Session-Token`; list returns `{ sessions, total, limit, offset }`; messages
  return `{ session_id, messages, pagination }`.
- **Two period-1 agents** = two profiles on one machine-level dashboard:
  `projects-ex` (~55+ sessions), `default` (~168+ sessions) — not two remote hosts yet.
- **Third period-1 agent** = LAN host `192.168.1.221:9119` (l1), Hermes 0.20.0,
  `auth_required: true`, basic-auth password login → cookie session
  (live-verified 2026-08-06: `POST /auth/password-login` → 200 `{ok:true}`, cookies
  `hermes_session_at/rt/provider`; `/api/sessions?profile=default` → 200, `total: 7`).
- KB already documents auth pitfalls (CORS preflight, bearer ≠ session token).

## Goals / Non-Goals

**Goals:**
- Spec-driven period-1 slice: real list + messages for two local targets and the LAN target.
- Reuse `HermesClient` / `AgentTarget` / Vite proxy; minimal new surface.
- Runnable verification an operator can repeat after `npm run dev` or a small script.
- Align TypeScript types with live response shapes.
- Support both auth mechanisms Hermes exposes (`session-token`, `cookie`).

**Non-Goals:**
- Prod multi-host BFF, Tailscale fleet, OAuth/ws-ticket gated mode.
- Chat WS UI, session mutations, FTS search UI, skills browser.
- Beautiful design system (raw table/list is enough).
- Cross-profile single-call UX via `/api/profiles/sessions` (optional later; period-1
  uses per-target `?profile=` for clarity).

## Decisions

### D1. Period-1 agents = two local profiles + one LAN agent
- **Choice:** Keep `local:projects-ex` and `local:default` with `baseUrl: ''`; add
  `l1:default` with `baseUrl: http://192.168.1.221:9119`, `profile: default`,
  auth kind `cookie`.
- **Why:** Proves multi-target routing across two auth mechanisms (token vs cookie)
  without a full multi-host BFF; matches operator's stated goal for period 1.
- **Alt:** Fake two baseUrls via SSH tunnels — deferred.

### D2. Auth = per-target mechanism chosen by feature detection
- **Choice:** `HermesClient` supports `session-token` (header) and `cookie` (password
  login); selection decided by `auth_required` from `/api/health` (or `/api/status`).
  Loopback targets keep HTML-parsed `SESSION_TOKEN__`; LAN target logs in via
  `POST /auth/password-login` with env creds and reuses session cookies.
- **Why:** Live probe shows the two mechanisms are mutually exclusive per host
  (`auth_required` false vs true). Hardcoding either one breaks the other agent.
- **Alt:** Cookie jar browser-login for loopback — unnecessary; SPA token exists there.

### D3. Client API extensions before UI
- **Choice:** Extend `HermesClient.getSessions({ limit, offset })` and fix messages typing
  to `{ session_id, messages, pagination }`.
- **Why:** Current methods exist but ignore pagination envelope fields.
- **Alt:** Raw `fetch` in demo only — rejects, would fork auth logic.

### D4. Demo shape: UI list + optional `_` script
- **Choice:** Prefer in-app Sessions panel (select target → list → click → messages).
  Optional Node one-shot script with `_` prefix only if UI path is blocked.
- **Why:** End state is the product UI; script is a fallback for headless verify.
- **Alt:** Script-only — weaker product progress.

### D5. Same-origin `/api` only in browser
- **Choice:** No direct browser calls to :9119 for gated REST.
- **Why:** Auth middleware answers 401 on CORS preflight for custom headers.

### D6. Read-only GET surface
- **Choice:** Only list + messages (+ status if needed for health).
- **Why:** Period-1 goal is access proof, not session management.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Token rotates each Hermes restart (unless env set) | Re-fetch HTML token; document `HERMES_DASHBOARD_SESSION_TOKEN` for stability |
| Cookie session expires (Max-Age 43200 s) or rotates | Re-login transparently on 401; keep login behind single `ensureAuth()` |
| LAN agent IP dynamic (DHCP) | `hostname -I` on the host; registry baseUrl is the only place to change |
| Credentials leak into repo | env-only (`HERMES_L1_USERNAME`/`HERMES_L1_PASSWORD`); CI/review checks; never in `src/config/agents.ts` |
| Large messages payload (100k–500k+ JSON) | Load messages only on selection; show count first |
| Default page size 20 hides true total | Always surface `total`; support limit/offset in client |
| Encoding issues in PowerShell demos | Prefer app UI or Python/Node UTF-8 for verification |
| Operator confuses “two Hermes” with two machines | Demo labels: profile + agent id; docs in proposal |

## Migration Plan

1. Land OpenSpec change artifacts (this change).
2. Implement client type/method fixes.
3. Wire minimal Sessions UI or demo.
4. Live-verify both profiles; mark tasks complete.
5. `openspec archive real-sessions-access` → promote specs to `openspec/specs/`.

Rollback: revert app changes; OpenSpec change can remain open.

## Open Questions

1. Does the user want **UI-first** demo or a **CLI script** as the acceptance artifact?
   (Design default: UI-first.)
2. Should period-1 also show `carl-db` / `pilot-work` (gateway running) or stay at three targets?
3. Pagination UX: simple «next 20» vs load-more — default next/prev is enough.
4. LAN agent baseUrl stability: registry hardcodes `192.168.1.221` today; keep as the
   single editable place (documented), or introduce env `HERMES_L1_BASE_URL`? (Design
   default: hardcode + doc, env later if the IP actually drifts.)
