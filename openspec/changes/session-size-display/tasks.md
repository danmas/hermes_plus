# Tasks: session-size-display

## 1. Helpers

- [x] 1.1 Add pure `formatBytes(n: number): string` (B / KB / MB)
- [x] 1.2 Add pure `sessionPayloadSize(messages): { chars, bytes, approxTokens }`
- [x] 1.3 Cover empty array, text-only, and tool_calls cases (unit or manual assert)
- [x] 1.4 Define `HEAVY_SESSION_BYTES = 500_000` constant (single place)

## 2. Types / list DTO

- [x] 2.1 Optionally extend `HermesSession` with optional `bytes?` / `total_tokens?`
      only after live list JSON confirms field names
- [x] 2.2 If no live size fields — leave type as-is; do not fake fields

## 3. UI — list

- [x] 3.1 `_SessionList`: ensure `message_count` visible on each row
- [x] 3.2 If list DTO has size field — show `formatBytes` badge; else skip
- [x] 3.3 Verify list render does **not** call messages endpoint per row

## 4. UI — open session

- [x] 4.1 After messages query success in `_ChatConsole` (or session header),
      compute `sessionPayloadSize(messages)`
- [x] 4.2 Display `formatBytes(bytes)` · message count; optional `~approxTokens tok`
- [x] 4.3 If `bytes > HEAVY_SESSION_BYTES` — non-blocking heavy hint
- [x] 4.4 Recompute only when `messages` reference changes (memo)

## 5. Verification

- [x] 5.1 Open a small session — size shows KB or B, matches rough expectation
- [x] 5.2 Open a large tool-heavy session — heavy hint appears when over threshold
- [x] 5.3 Network tab: selecting list page does not N+1 `/messages` for size
- [x] 5.4 `npm run build` clean

## 6. Docs / OpenSpec

- [x] 6.1 If live list exposes size fields — note them in `KB/README_SURVEY.md`
- [x] 6.2 CHANGELOG entry when implementation lands
- [x] 6.3 `openspec validate session-size-display` (if tooling available)
- [ ] 6.4 After accept: archive into `openspec/specs/`

