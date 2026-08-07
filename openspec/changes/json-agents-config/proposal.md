## Why

Текущий реестр агентов жёстко зашит в [`src/config/agents.ts`](src/config/agents.ts) —
TypeScript-массив из трёх элементов. Чтобы добавить нового Hermes-агента, нужно:
1. Редактировать TS-файл
2. Пересобрать проект (`npm run build` или HMR-перезагрузка)

Это неудобно для оператора, который хочет быстро подключить новый агент
(другая машина, другой профиль, другой тип auth).

В проекте [`kosmos-panel`](C:\ERV\projects-ex\kosmos-panel) эта проблема решена через
декларативный [`inventory.json`](C:\ERV\projects-ex\kosmos-panel\inventory.json.example):
серверы описаны в JSON, чувствительные данные — через `${ENV_VAR}`,
файл читается при старте и hot-reload через `fs.watchFile()`.

Заимствуем этот паттерн: [`agents-config.json`](agents-config.json) становится единственным источником
правды для реестра агентов. Текущий хардкод остаётся fallback-ом.

## What Changes

- **agent-registry-json:** новый файл [`agents-config.json`](agents-config.json) в корне —
  декларативное описание всех AgentTarget. Подстановка `${VITE_XXX}` / `${XXX}`
  для чувствительных данных. Файл коммитится (содержит только плейсхолдеры, не реальные креды).
- **agent-registry-json:** [`agents-config.json.example`](agents-config.json.example) —
  документированный шаблон для новых пользователей.
- **agent-registry-json:** Vite middleware `GET /api/agents` — читает JSON,
  раскрывает env-переменные, валидирует, отдаёт клиенту `FleetConfig`.
- **agent-registry-json:** модуль [`src/config/envSubst.ts`](src/config/envSubst.ts) — чистая функция
  `expandEnvPlaceholders()` (без Node-зависимостей, работает в браузере через
  `import.meta.env`).
- **agent-registry-json:** модуль [`src/config/loadAgents.ts`](src/config/loadAgents.ts) — `fetch('/api/agents')`
  → `AgentTarget[]`.
- **agent-registry-json:** [`src/config/agents.ts`](src/config/agents.ts) —
  пробует загрузить из middleware, при неудаче падает на хардкод-fallback.
- **agent-registry-json:** [`src/hooks/useFleet.ts`](src/hooks/useFleet.ts) —
  использует асинхронный `getAgents()` вместо синхронного импорта `AGENTS`.
- **Docs:** [`KB/README_FLEET.md`](KB/README_FLEET.md) — секция «JSON-конфигурация»;
  [`KB/README_DEV.md`](KB/README_DEV.md) — упоминание `agents-config.json`.

## Non-goals

- JSON-редактор в UI (SuperJsonEditor как в kosmos-panel) — не нужно, YAGNI.
- API для сохранения конфига через UI (`POST /api/agents`) — редактирование только
  вручную в текстовом редакторе.
- Авто-поиск агентов в сети (остаётся явный реестр).
- Механизм credentials/SSH как в kosmos-panel (у нас свои auth-типы).
- Перенос всей конфигурации приложения в JSON (только agents).

## Impact

- **Specs:** `agent-registry-json`.
- **Новые файлы:** `agents-config.json`, `agents-config.json.example`,
  `src/config/envSubst.ts`, `src/config/loadAgents.ts`.
- **Изменяемые файлы:** [`vite.config.ts`](vite.config.ts) (middleware), [`src/config/agents.ts`](src/config/agents.ts)
  (JSON + fallback), [`src/hooks/useFleet.ts`](src/hooks/useFleet.ts) (async getAgents).
- **Docs:** [`KB/README_FLEET.md`](KB/README_FLEET.md), [`KB/README_DEV.md`](KB/README_DEV.md).
- **Риск:** если middleware не отвечает — клиент молча использует fallback.
  Нужно логировать в консоль предупреждение.
- **Обратная совместимость:** полная — хардкод-массив остаётся, используется
  при недоступности JSON.
