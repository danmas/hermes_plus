## 1. Client: auth + sessions envelope

- [x] 1.1 Align `HermesClient.getSessions` with live shape `{ sessions, total, limit, offset }` and optional `{ limit, offset }` args
- [x] 1.2 Align `getSessionMessages` return type with `{ session_id, messages, pagination }`
- [x] 1.3 Confirm token path: explicit token OR parse `SESSION_TOKEN__` from `http://127.0.0.1:9119/` (not Vite `/`)
- [x] 1.4 Keep `clientFor(AgentTarget)` applying `profile` query on all session calls
- [x] 1.5 Add `cookie` auth kind to `AgentTarget.auth` (`type: 'none' | 'session-token' | 'cookie'`) and to `HermesClientOptions`
- [x] 1.6 Implement cookie login: `POST /auth/password-login` with `{provider:'basic',username,password}`; store `hermes_session_at/rt/provider`; attach as `Cookie` header to gated requests
- [x] 1.7 Implement feature-detection: probe `GET /api/health` (or `/api/status`) → `auth_required` decides token-vs-cookie; cache per target
- [x] 1.8 Read LAN creds from env `HERMES_L1_USERNAME` / `HERMES_L1_PASSWORD`; never from source

## 2. Registry (period-1 targets)

- [x] 2.1 Verify `src/config/agents.ts` has `local:projects-ex` and `local:default` only (or document extras)
- [x] 2.2 Labels/tags clear for operator (name includes profile)
- [x] 2.3 Add third target `l1:default`: baseUrl `http://192.168.1.221:9119`, profile `default`, auth kind `cookie`, creds from env

## 3. Live demo / UI

- [ ] 3.1 Add Sessions view: target selector → paginated session table (id, title, model, message_count, source)
- [ ] 3.2 On row select: load and show messages summary (count + first N roles/snippets)
- [ ] 3.3 Surface per-target errors (offline / 401 / missing env) without blank success
- [ ] 3.4 Keep fleet health entry point; do not remove existing skeleton without replacement nav

## 4. Live verification (acceptance)

- [x] 4.1 Start/confirm `hermes dashboard` on :9119
- [x] 4.2 Run demo: `projects-ex` list returns HTTP 200 and real rows (or total=0 honestly)
- [x] 4.3 Run demo: `default` list returns HTTP 200 and real rows
- [ ] 4.4 Open messages for one non-empty `projects-ex` session; confirm `messages[]` and `role`
- [x] 4.5 Confirm no session token committed to git
- [x] 4.6 Run demo: `l1:default` login via env creds → list returns HTTP 200 and real rows
- [x] 4.7 Confirm demo fails clearly when `HERMES_L1_USERNAME`/`HERMES_L1_PASSWORD` unset

## 5. Docs / OpenSpec hygiene

- [ ] 5.1 If response fields differ from KB, update `KB/README_SURVEY.md` / `README_DEV.md`
- [ ] 5.2 Note OpenSpec change id `real-sessions-access` in CHANGELOG when implementation lands
- [ ] 5.3 `openspec validate real-sessions-access` passes
- [ ] 5.4 After implementation accepted: archive change into main `openspec/specs/`
