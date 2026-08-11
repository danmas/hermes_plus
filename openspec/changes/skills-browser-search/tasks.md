# Tasks: skills-browser-search

## 1. Live probe (blocking)

- [x] 1.1 API shape from Hermes source (`web_routers/skills.py`): list = array
- [x] 1.2 Content: `GET /api/skills/content?name=` → `{ name, content, path }`
- [x] 1.3 No first-class `/api/skills/search` for installed skills (hub search is separate) → client filter
- [ ] 1.4 Repeat list+content on LAN cookie target when available
- [ ] 1.5 Update `KB/README_SURVEY.md` with verified fields

## 2. Client API

- [x] 2.1 Harden `getSkills()`: profile query, envelope unwrap, errors
- [x] 2.2 Add `getSkillContent(name)` + types
- [x] 2.3 Client filter helper `_skillSearch.ts` (no server FTS)
- [x] 2.4 Reuse auth / proxyPath / profile from `HermesClient` / `clientFor`

## 3. UI: list + content (sessions analogy)

- [x] 3.1 Middle pane tab: **Sessions | Skills**
- [x] 3.2 `SkillList` component
- [x] 3.3 `SkillViewer` read-only content
- [x] 3.4 Independent `selectedSkillName` vs `selectedSessionId`
- [x] 3.5 Collapse chrome on SkillList

## 4. Scope: Skill (in-skill)

- [x] 4.1 Scope Skill | Agent | Fleet
- [x] 4.2 Highlight + scroll in SkillViewer
- [x] 4.3 Content load via React Query on select
- [x] 4.4 Skill scope disabled without selection

## 5. Scope: Agent

- [x] 5.1 Debounce ~300ms
- [x] 5.2 Client-side filter name/description/path/category
- [x] 5.3 Empty q → full list
- [x] 5.4 Click → select skill
- [x] 5.5 Error vs empty-results

## 6. Scope: Fleet

- [x] 6.1 Parallel getSkills
- [x] 6.2 Timeout 3s; partial errors
- [x] 6.3 Tag agentId/name; sort
- [x] 6.4 Click → switch agent + skill
- [ ] 6.5 (Optional) skills matrix view

## 7. Verification

- [ ] 7.1–7.7 Live UI smoke (operator)

## 8. Docs / archive

- [x] 8.1 CHANGELOG entry
- [ ] 8.2 Archive OpenSpec after accept
