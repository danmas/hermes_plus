# Design: skills-browser-search

## Context

- KB SURVEY (Hermes 0.20.0):  
  `GET /api/skills` — список;  
  `GET /api/skills/content?...` — тело SKILL.md;  
  mutations (POST/PUT) — **вне period-1**.
- Client already: `HermesClient.getSkills()` → typed `HermesSkill[]` loosely.
- Sessions pattern: middle pane list + search scopes; right pane detail.
- Auth: same as sessions (session-token / cookie / BFF proxyPath).
- Principle: thin client to official dashboard API; never parse `skills/*.md` on disk.

## Analogy to sessions

| Sessions | Skills (this change) |
|----------|----------------------|
| `GET /api/sessions` list | `GET /api/skills` list |
| `GET /api/sessions/{id}/messages` | `GET /api/skills/content?...` |
| `GET /api/sessions/search` FTS | **No official FTS in SURVEY** → client filter MVP |
| Scope Session / Agent / Fleet | Scope **Skill** / **Agent** / **Fleet** |
| ChatConsole detail | Skill content viewer (read-only markdown/text) |

## Decisions

### D1. List source of truth
- `HermesClient.getSkills()` stays the single list entry; ensure `?profile=` is applied like sessions when target has profile.
- Normalize response: if Hermes ever returns envelope `{ skills: [] }`, unwrap to array in client (feature-detect).
- Fields for UI (when present): `name`, `description`, `path`, `enabled`, `category`.

### D2. Content endpoint
- Live-probe **exact** query params for `/api/skills/content` (name? path? id?).
- Client method: `getSkillContent(ref: { name?: string; path?: string })`.
- Cache content per `(agentId, skillKey)` in React Query (staleTime ~30–60s).
- Render: plain text / simple markdown (no need for full MDX); preserve code fences if easy.

### D3. Search scopes

| Scope | Data | Network |
|-------|------|---------|
| **Skill** (in-skill) | Loaded content string of selected skill | 0 or 1 content GET |
| **Agent** | Full skills list of current target, filter client-side | 1× `getSkills` (reuse cache) |
| **Fleet** | `getSkills` on every registry target (parallel) | N× list; optional content only if query needs body-scan |

**Agent filter fields (MVP):** `name`, `description`, `path`, `category` (case-insensitive substring).  
**Optional later:** deep search — for Agent/Fleet, also fetch content for candidates (cap N concurrent) if operator enables “search in body”.

If live-probe finds `GET /api/skills/search?q=`, prefer it for Agent/Fleet (same pattern as sessions FTS) and keep client filter as fallback.

### D4. Fleet presentation
- **MVP list mode:** flat hits `{ skill, agentId, agentName, profile }` sorted by name then agent.
- **Optional matrix mode (period-1.5):** rows = skill name, columns = agents, cell = present/enabled — from README_FLEET; not required for first accept if list+filter works.
- Partial failure: per-agent error chip; still show successes.
- Per-target timeout 2–3 s; skip offline if fleet health known.

### D5. UI layout
- Additive third column **or** tab switch in middle pane: `Sessions | Skills` (prefer tabs on middle pane to avoid 4-column squeeze on small screens).
- Skills middle pane: search + scope (Skill | Agent | Fleet) + list.
- Detail: when skill selected — content viewer; when none — empty state “Выберите skill”.
- Selecting skill does **not** destroy session selection (independent state); chat stays available if Sessions tab active.
- Collapse behavior mirrors SessionList.

### D6. Security / read-only
- Period-1: only GET. No toggle/edit UI affordances.
- Do not log full skill bodies in production builds.
- Auth errors: explicit per-target, no fake empty “no skills”.

### D7. Query UX
- Debounce ~300 ms for Agent/Fleet filter.
- Empty query → full list mode (paginated only if list is huge; MVP show full list with virtualize if >200 items).
- Highlight match substring in list title/description and in content viewer for Skill scope.

## Risks

| Risk | Mitigation |
|------|------------|
| Content query params unknown | Task 1 live-probe before UI |
| Large skill markdown | Cap render size / lazy highlight |
| No FTS on server | Client filter; document in UI “local filter” |
| Fleet N× content deep search expensive | Default: metadata only; deep opt-in |
| CORS for multi-host | Only BFF/proxied targets (same as sessions fleet) |

## Migration

Additive. No break to sessions search/list/chat.
