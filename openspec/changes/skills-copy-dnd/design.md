# Design: skills-copy-dnd

## Context

- Skills browser UI: user vs stock (`provenance` / heuristics).
- Fleet `AgentTarget`; BFF already injects session-token/cookie (`server/upstream.ts`).
- Hermes 0.20.x:
  - Skills CRUD surface is **SKILL.md-centric** (`/api/skills`, `/content`).
  - **Multi-file IO** exists: `/api/fs/list|read-text|write-text|read-data-url`,
    `/api/files` (list/read/upload/mkdir/delete) — see `web_server.py` + KB SURVEY.
- Gap was overstated as “no multi-file API”; real work is **wiring + probe** of
  path roots, profile scope, and create+write layout.

## Decisions

### D1. Copy only
Never delete/uninstall on source.

### D2. SkillPackage v1
```ts
{
  version: 1,
  name: string,
  category?: string,
  source: { agentId: string; profile?: string },
  files: Array<{
    relativePath: string, // posix, relative to skill root; includes SKILL.md
    content: string,
    encoding: "utf-8" | "base64"
  }>,
  meta?: { exportedAt: string; fileCount: number; totalBytes: number }
}
```
- Reject `..`, absolute paths, null bytes.
- MUST include `SKILL.md`.
- Deny-basename at export (`.env`, `*.pem`, known key names — align with Hermes
  sensitive-path helpers where possible).
- Total / per-file size caps (config); fail closed. BFF buffers responses in
  memory today → keep packages small; streams later.

### D3. Transport via fs/files (not Hermes package PR)

**Export (BFF → source Hermes):**

1. Resolve skill identity (`name`, optional `category`) on source.
2. Resolve **absolute skill root path** (probe: from content `path` parent,
   skills home + category/name, or list metadata if present).
3. Recursive `GET /api/fs/list?path=` (code: required `path`; 422 without).
4. For each file: `read-text` if not binary; if `binary: true` → `read-data-url`
   or reject in MVP.
5. Build SkillPackage with relative paths from skill root.

**Import (BFF → target Hermes), create-mode only:**

1. Ensure name free (or apply `nameOverride` from rename dialog).
2. `POST /api/skills` with SKILL.md content (+ category) to create shell.
3. Ensure directories exist (`POST /api/files/mkdir` as needed) — note:
   `write-text` requires **parent dir already exists**.
4. Write remaining files via `POST /api/fs/write-text` (and upload for binary if allowed).
5. Post-verify: recursive `fs/list` vs `package.files.length` (+ names).

**Forbidden:** success path that only uses content GET + POST skills when export
discovered additional files.

### D4. Pipeline
```
DnD drop
  → resolve source skill + target agentId
  → POST /api/skills/export (BFF, full package)
  → if target has name → UI Cancel | Rename (no overwrite MVP)
  → POST /api/skills/import { package, nameOverride? }  // create only
  → invalidate skills queries
```
Export completes **before** any target write.

### D5. Rollback (MVP — create only)

| Situation | Action |
|-----------|--------|
| Export fails | no target writes |
| Import fails after create | delete partial skill on target (`DELETE /api/files` recursive and/or skills uninstall if available); report failure |
| Overwrite | **out of MVP** |

No staging-rename, no backup package, no restore-from-backup in this change.

If cleanup fails → error «нужна ручная проверка» + audit (skill name, target).

### D6. Conflicts (MVP)
- Exists on target → Cancel / **Copy as `name-copy`** (or operator-entered name).
- No overwrite button in MVP.

### D7. DnD UX
- Drag source: **user** skills only (`isUserSkill` / path heuristic if no provenance).
- Drop: fleet agent cards (other agents/profiles).
- Same agent → no-op toast.
- Shared **DragContext** (`draggingSkill`) + `dataTransfer` fallback (cross-pane scroll).
- Highlight valid targets; progress modal; in-flight UI lock.
- **BFF lock** on `(targetAgentId, skillName)` for concurrent imports (not UI-only).

### D8. Who can be copied
Default: user/agent provenance. Stock/hub: not draggable in MVP.

### D9. Security
- Operator session required for BFF export/import.
- Rate limit; audit without file bodies.
- Sensitive basenames denied at export.
- Binary: MVP prefer **reject** with clear error unless probe shows safe upload path.

### D10. Phase 0 probe checklist
Live on local + one LAN target if possible:

1. `GET /api/skills?profile=` — fields: name, description, path?, provenance?, category  
2. `GET /api/skills/content?name=` — path of SKILL.md → skill root  
3. `GET /api/fs/list?path=<skillRoot>` — entries shape  
4. `GET /api/fs/read-text?path=` — text/binary/truncated limits  
5. `POST /api/fs/write-text` — body shape (`path`, `content`)  
6. `POST /api/files/mkdir`, `DELETE /api/files` — cleanup capability  
7. Profile isolation: same name different profile paths  
8. Whether `/api/fs/*` honors profile or only absolute paths under sandbox  

Document results in KB; adjust path-resolution algorithm only after probe.

## Risks

| Risk | Mitigation |
|------|------------|
| skill root path unknown from list | derive from content.path parent; probe |
| write-text parent-must-exist | ordered mkdir |
| fs sandbox blocks skills dir | probe early; fail closed with message |
| large packages OOM in BFF | hard size caps |
| provenance missing | path heuristics + section already in UI |
| partial import | create-only cleanup |

## Rejected for MVP

- Overwrite + backup/restore (too fragile without atomic rename).
- Buttons-only first (product: DnD in same ship).
- SKILL.md-only labeled full copy.
- Waiting on Hermes core package endpoints before trying fs/files.

## Migration

Additive. Skills browser stays; adds DnD + BFF transfer routes.
