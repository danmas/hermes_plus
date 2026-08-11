# Proposal: skills-copy-dnd

## Why

Оператор разделяет user-skills и stock. Нужен **copy skill на другой профиль/машину
со всеми файлами**, жестом **DnD** на карточку агента. Ошибка mid-flight не должна
оставлять half-skill на target.

## What Changes

- **SkillPackage** v1 + validation (paths, size, deny-list basenames).
- **BFF** `export` / `import` using Hermes:
  - export: skill root → recursive `/api/fs/list` + `read-text` / `read-data-url`
  - import: `POST /api/skills` (+ mkdir) + `/api/fs/write-text` (and files API as needed)
- **DnD**: drag user skill → drop other fleet agent; progress; conflict Cancel/Rename.
- **Rollback (MVP)**: create-mode cleanup only (no overwrite/backup).
- Phase 0 live-probe of fs/files/skills signatures → KB.

## Non-goals (MVP)

- Overwrite existing skill / backup-restore (own change later).
- Move (delete on source).
- Claiming success for SKILL.md-only when source has more files.
- Requiring Hermes core PR for package endpoints (use fs/files first).

## Impact

- Specs/design/tasks (this change).
- Code later: BFF routes, client, DnD, query invalidation.
- Security: write paths, deny secrets, size caps, audit without bodies.

## Success criteria

- DnD user skill A→B (incl. other host via BFF) yields **same relative file set** on B.
- Conflict without overwrite: rename or cancel only.
- Injected failure mid-import → target clean (or explicit cleanup-failed state).
- Source unchanged.
- No success UI if package incomplete vs post-verify list.
