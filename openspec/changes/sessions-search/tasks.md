# Tasks: sessions-search

## 1. Live probe

- [x] 1.1 `GET /api/sessions/search?q=...&profile=...` on local :9119 with auth
- [x] 1.2 Record response JSON shape incl. one example hit in KB/README_SURVEY.md
- [x] 1.3 Confirm behavior for empty `q` and unknown profile
- [x] 1.4 Probe `/api/sessions/{id}/messages` pagination: full transcript or `has_more`

## 2. Client API

- [x] 2.1 Add `HermesClient.searchSessions(q: string)` → `/api/sessions/search`
- [x] 2.2 Types for search hit (loose + known fields: id, title, preview, match_*)
- [x] 2.3 Reuse auth / profile / proxyPath from existing client

## 3. Scope: Session

- [x] 3.1 Filter loaded messages by query (content + tool_calls text)
- [x] 3.2 Load messages on demand if missing
- [x] 3.2a Handle `has_more`: fetch remaining pages or show "searched in N loaded messages"
- [x] 3.3 Highlight / scroll to match in ChatConsole
- [x] 3.4 Disable Session scope when no real session selected

## 4. Scope: Agent

- [x] 4.1 Search box + debounce; empty q → list mode
- [x] 4.1a Normalize query for FTS5 (quote / strip operators)
- [x] 4.1b Abort in-flight request on new keystroke (AbortController)
- [x] 4.2 Render hits; click → select session
- [x] 4.3 Error and loading states

## 5. Scope: Fleet

- [x] 5.1 Parallel search across `AGENTS` / registry
- [x] 5.1a Per-target timeout 2–3 s
- [x] 5.2 Tag hits with agentId; merge list
- [x] 5.3 Per-target errors; skip unreachable
- [x] 5.4 Click hit → switch agent + session

## 6. UI chrome

- [x] 6.1 Scope control: Session | Agent | Fleet
- [x] 6.2 Shared search input wired to active scope
- [x] 6.2a Empty/loading state shows active scope label (target / fleet)
- [x] 6.3 Clear search restores previous list UX

## 7. Verification

- [ ] 7.1 In-session find known phrase in open chat
- [ ] 7.2 Agent search returns FTS hits without N messages GETs
- [ ] 7.3 Fleet shows multi-agent labels; partial failure OK
- [x] 7.4 `npm run build` clean

## 8. Hygiene

- [x] 8.1 CHANGELOG
- [ ] 8.2 Archive openspec change after accept
