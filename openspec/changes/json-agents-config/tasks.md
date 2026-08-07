## 1. Data: config files

- [x] 1.1 Create `agents-config.json.example` — documented template with all fields, auth types, and env-var comments
- [x] 1.2 Create `agents-config.json` — working config with current 3 agents (`local:projects-ex`, `local:default`, `l1:default`), credentials as `${VITE_XXX}` placeholders only

## 2. Env substitution

- [x] 2.1 Create `src/config/envSubst.ts` — `expandEnvPlaceholders<T>(obj: T): T` with recursive `${VAR_NAME}` substitution
- [x] 2.2 Support `import.meta.env` on client, `process.env` in Node
- [x] 2.3 Warn (console.warn) on unresolved placeholders (env var not set)

## 3. Vite middleware

- [x] 3.1 Add `GET /api/agents` middleware in [`vite.config.ts`](vite.config.ts) via `configureServer()`
- [x] 3.2 Middleware reads `agents-config.json` from project root, applies `expandEnvPlaceholders`, validates, returns JSON
- [x] 3.3 Validation: unique `id` per agent, required `name` and `auth.type`, valid auth type enum
- [x] 3.4 On validation error: HTTP 500 with `{ error, details }` body
- [x] 3.5 On file not found: HTTP 404 with `{ error }` body (client uses fallback)

## 4. Client loader

- [x] 4.1 Create `src/config/loadAgents.ts` — `loadAgentsFromConfig(): Promise<AgentTarget[] | null>`
- [x] 4.2 Fetch `GET /api/agents`; on non-ok/null return `null`
- [x] 4.3 Console.warn on fetch failure with reason (so operator knows fallback is active)

## 5. Adapt agents.ts

- [x] 5.1 Keep current hardcoded `FALLBACK_AGENTS` array as-is
- [x] 5.2 Export `async getAgents(): Promise<AgentTarget[]>` — tries `loadAgentsFromConfig()`, falls back to `FALLBACK_AGENTS`
- [x] 5.3 Export `getAgentsSync(): AgentTarget[]` — returns cached agents or fallback
- [x] 5.4 Keep deprecated `AGENTS` export for backward compatibility (= `FALLBACK_AGENTS`)
- [x] 5.5 Add comment: "Edit agents-config.json to add/remove agents; this file is the fallback"

## 6. Adapt useFleet.ts

- [x] 6.1 Replace `import { AGENTS }` with `import { getAgents }` (реализовано в `App.tsx`; `useFleet` уже принимает `agents` параметром)
- [x] 6.2 Call `getAgents()` on mount; store result in state
- [x] 6.3 Fleet table renders from loaded agents (not hardcoded AGENTS)

## 7. Docs

- [x] 7.1 Update [`KB/README_FLEET.md`](KB/README_FLEET.md): add «JSON-конфигурация» section — file format, env vars, how to add an agent
- [x] 7.2 Update [`KB/README_DEV.md`](KB/README_DEV.md): mention `agents-config.json` and `GET /api/agents` middleware

## 8. Live verification (acceptance)

- [ ] 8.1 `npm run dev` → `curl http://localhost:5173/api/agents` returns 3 agents with expanded env vars
- [ ] 8.2 Delete `agents-config.json` → app still works (fallback), console shows warning
- [ ] 8.3 Add 4th dummy agent to `agents-config.json` → `/api/agents` returns 4 agents, UI shows 4
- [ ] 8.4 Break JSON syntax → `/api/agents` returns 500 with error detail
- [ ] 8.5 Duplicate agent `id` → `/api/agents` returns 500 with duplicate-id error
- [ ] 8.6 Unset `VITE_HERMES_L1_PASSWORD` → `/api/agents` returns config with empty password string + console warning
- [x] 8.7 `npm run build` passes (no TS errors)
