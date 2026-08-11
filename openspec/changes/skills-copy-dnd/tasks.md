# Tasks: skills-copy-dnd

## 0. Phase 0 — live signatures (blocking for implement, not “API missing”)

- [x] 0.0 Source map (`web_server.py` 0.20.x): fs list/read-text/write-text/read-data-url shapes + limits
- [x] 0.0b Unauth live: `/api/fs/*` → 401 without cookie/token (2026-08-11)
- [x] 0.9 Document in `KB/README_SURVEY.md` (skills full-file copy + fs signatures)
- [ ] 0.1 Auth: obtain session-token / BFF path on running dashboard
- [ ] 0.2 `GET /api/skills?profile=` — live fields (path? provenance?)
- [ ] 0.3 `GET /api/skills/content?name=` — skill root from `path`
- [ ] 0.4 `GET /api/fs/list?path=<skillRoot>` — recursion sample
- [ ] 0.5 `GET /api/fs/read-text` — confirm truncated/binary flags live
- [ ] 0.6 `POST /api/fs/write-text` smoke on throwaway under skill/tmp if safe
- [ ] 0.7 `POST /api/files/mkdir` + `DELETE /api/files` cleanup path
- [ ] 0.8 Profile isolation of skill paths
- [ ] 0.10 Green light for implement: full-file copy via fs/files confirmed end-to-end

## 1. SkillPackage

- [ ] 1.1 TS types v1
- [ ] 1.2 Path validation + deny-basename
- [ ] 1.3 Size caps; binary policy (MVP reject unless probe allows)
- [ ] 1.4 Unit tests

## 2. BFF export / import

- [ ] 2.1 `POST /api/skills/export` `{ agentId, skillName }` → package
- [ ] 2.2 Recursive list+read via upstream fs
- [ ] 2.3 `POST /api/skills/import` create-only + optional `nameOverride`
- [ ] 2.4 create skill + mkdir + write-text for each file
- [ ] 2.5 Post-verify list vs package
- [ ] 2.6 Operator auth + rate limit + audit (no bodies)
- [ ] 2.7 In-flight lock `(targetAgentId, name)`

## 3. Rollback (create only)

- [ ] 3.1 Cleanup partial skill on target after failed import
- [ ] 3.2 Explicit error if cleanup fails
- [ ] 3.3 **No** overwrite/backup/restore in this change

## 4. Client

- [ ] 4.1 exportSkill / importSkill → BFF
- [ ] 4.2 Conflict: exists? → rename dialog
- [ ] 4.3 Invalidate `['skills', targetId]`

## 5. DnD UI

- [ ] 5.1 Draggable user rows only
- [ ] 5.2 Drop on other fleet cards + highlight
- [ ] 5.3 DragContext + dataTransfer fallback
- [ ] 5.4 Progress + double-drop guard (UI + rely on BFF lock)
- [ ] 5.5 Same-agent no-op

## 6. Verification

- [ ] 6.1 Single-file skill copy profile→profile
- [ ] 6.2 Multi-file skill: all relative paths present on target
- [ ] 6.3 Cross-host via BFF
- [ ] 6.4 Fail mid-import → target clean; source intact
- [ ] 6.5 Name conflict: cancel / rename only
- [ ] 6.6 DnD triggers same pipeline
- [ ] 6.7 No success on incomplete package

## 7. Docs / archive

- [ ] 7.1 CHANGELOG when implementing code
- [ ] 7.2 Archive after accept

## Deferred (new change)

- [ ] Overwrite + backup/restore
- [ ] Move
- [ ] Stock fork
- [ ] Large package streaming
