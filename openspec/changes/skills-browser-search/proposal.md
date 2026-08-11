# Proposal: skills-browser-search

## Why

Оператор уже может смотреть **sessions** (list, messages, FTS search по scope
Session | Agent | Fleet). Для **skills** есть только счётчик в fleet-health и
тонкий `HermesClient.getSkills()` — **нет UI** списка, просмотра `SKILL.md` и
поиска. В KB (README_FLEET) «Skills matrix / browser» — заявленная цель control plane.

Нужно **аналогично сессиям**:

1. Список skills выбранного агента (profile-aware).
2. Просмотр содержимого skill (read-only).
3. Поиск: по текущему агенту, по флоту, внутри открытого skill.

## What Changes

- Capability **skills-list-read** — list через official `GET /api/skills`.
- Capability **skill-content-read** — тело skill через `GET /api/skills/content`.
- Capability **skill-search-agent** — поиск в skills **текущего** AgentTarget.
- Capability **skill-search-fleet** — multi-target aggregation + label.
- Capability **skill-search-in-skill** — поиск по тексту открытого skill.
- UI: панель Skills (list + detail), search input + scope (Skill | Agent | Fleet).
- Client: нормализация ответа list/content; reuse auth/proxy/profile.
- **Не** читать файлы skills с диска; **не** mutations в period-1.

## Non-goals

- POST/PUT skills (create, edit content, toggle enabled).
- Skill-hub / marketplace UI.
- Гарантия server-side FTS для skills (его может не быть в Hermes 0.20.0).
- Замена agent tool `skills.manage` (path модели, не UI).

## Impact

- OpenSpec: этот change + 5 capability specs + design + tasks.
- Code (после accept): `HermesClient`, types, `_SkillList` / detail pane, `App.tsx` layout.
- KB: дописать shape list/content после live-probe.
- Sessions UI **не ломаем**; skills — additive pane или tab рядом.

## Success criteria

- На live Hermes (local + LAN cookie) list skills → 200, непустой массив при наличии skills.
- Выбор skill → отображается content (markdown/text).
- Поиск Agent: filter по name/description (и path/category при наличии).
- Поиск Fleet: hits с `agentId`; partial failure не роняет UI.
- In-skill: highlight/scroll к совпадению в content.
- Period-1 acceptance только на GET endpoints.
