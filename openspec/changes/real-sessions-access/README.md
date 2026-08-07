# real-sessions-access

**Period 1** — работающие примеры доступа к **реальным сессиям** реальных Hermes-агентов:
два локальных профиля (`local:projects-ex`, `local:default`) + LAN-агент
(`l1:default` на `192.168.1.221:9119`, cookie-auth).

| | |
|--|--|
| Goal | List + messages для трёх таргетов: два локальных профиля на `:9119` + `default` на `192.168.1.221` |
| Schema | spec-driven (`proposal` → `specs` → `design` → `tasks`) |
| Status | artifacts complete (proposal+specs+design updated for 3 targets); implementation tasks 0/24 |
| Validate | `openspec validate real-sessions-access` |

## Capabilities (delta specs)

| Capability | File |
|------------|------|
| `agent-registry` | `specs/agent-registry/spec.md` |
| `hermes-auth` | `specs/hermes-auth/spec.md` |
| `sessions-read` | `specs/sessions-read/spec.md` |
| `sessions-live-demo` | `specs/sessions-live-demo/spec.md` |

## Next

1. Review proposal/design with operator
2. Implement per `tasks.md` (say **«применяй»** for source changes)
3. Live-verify all three targets
4. `openspec archive real-sessions-access`
