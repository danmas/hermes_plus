# skills-copy-dnd

| Field | Value |
|-------|--------|
| Goal | **Copy** skill (все файлы) на другой agent/profile **DnD**; cross-host; create-only + cleanup rollback |
| Specs | `skill-package`, `skill-copy-transfer`, `skill-copy-dnd`, `skill-copy-rollback` |
| Depends on | skills browser UI, AgentTarget registry, BFF upstream auth (`X-Hermes-Session-Token` / cookie) |
| Status | proposed → **unblocked for design** (transport = Hermes 0.20.0 `/api/fs/*` + `/api/files/*` + skills create) |
| Policy | **Copy only**. **All files**. **No overwrite in MVP** (rename / cancel). |

## Operator story

1. Тащит **user** skill на карточку другого агента (fleet).
2. Export полного пакета с source → import create на target.
3. Конфликт имени → Cancel / Copy as `name-copy`.
4. Ошибка mid-import → cleanup частично созданного skill на target; source не трогаем.

## Transport (не «блокер package API»)

Официальные skills-роуты (`/api/skills/content`, `POST /api/skills`) — про **SKILL.md**.  
Multi-file — через уже существующие dashboard FS/files (KB `README_SURVEY.md`, Hermes `web_server.py`):

| Role | Routes (probe-confirmed shapes in tasks/KB after phase 0) |
|------|------------------------------------------------------------|
| List tree | `GET /api/fs/list?path=` → `{ entries: [{ name, path, isDirectory }] }` |
| Read text | `GET /api/fs/read-text?path=` → `{ text, binary, truncated, byteSize, path }` |
| Read binary | `GET /api/fs/read-data-url?path=` or `/api/files/read` |
| Write text | `POST /api/fs/write-text` `{ path, content }` (parent dir must exist) |
| Mkdir | `POST /api/files/mkdir` |
| Delete tree | `DELETE /api/files` (cleanup) |
| Create skill shell | `POST /api/skills` → then write extra files under skill root |

**BFF** (`POST /api/skills/export|import`) собирает/разбирает SkillPackage server-side; браузер не держит upstream tokens.

Phase 0 = live-замер параметров, sandbox roots, `?profile=`, откуда брать skill root path, limits — **не** «существует ли API».

## MVP scope

- create-mode only + rename on conflict  
- rollback = delete partial skill on target  
- binary: reject or strict base64 cap (decide after probe)  
- DnD + DragContext + BFF in-flight lock  

## Out of MVP (separate change)

- overwrite + backup/restore  
- move/delete source  
- stock/hub drag-fork (unless explicit later)  
- streaming large packages  

## Non-goals

- Silent SKILL.md-only copy labeled as full success  
- Hermes core fork required for MVP (prefer stock 0.20.0 routes)  
