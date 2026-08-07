# json-agents-config

Перенос реестра Hermes-агентов из хардкод-TypeScript в декларативный
JSON-файл [`agents-config.json`](agents-config.json) с подстановкой env-переменных.
Паттерн заимствован из [`kosmos-panel`](C:\ERV\projects-ex\kosmos-panel)
([`inventory.json`](C:\ERV\projects-ex\kosmos-panel\inventory.json.example)).

| | |
|--|--|
| Goal | Декларативный JSON-реестр агентов: добавление нового агента = правка JSON, без пересборки |
| Schema | spec-driven (`proposal` → `specs` → `design` → `tasks`) |
| Reference | [`kosmos-panel`](C:\ERV\projects-ex\kosmos-panel) inventory.json pattern |

## Capabilities (delta specs)

| Capability | File |
|------------|------|
| `agent-registry-json` | `specs/agent-registry-json/spec.md` |

## Next

1. Review proposal/design with operator
2. Implement per `tasks.md` (say **«применяй»** for source changes)
3. Verify: `GET /api/agents` returns valid FleetConfig
4. Verify: fallback works when `agents-config.json` is missing
5. `openspec archive json-agents-config`
