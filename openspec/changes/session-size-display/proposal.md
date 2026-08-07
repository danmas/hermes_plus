# Proposal: session-size-display

## Why

В списке и в открытой сессии оператору полезно видеть **объём данных** (насколько
тяжёлая история), а не только `message_count`. Длинные сессии с tool-calls
дают payload 100–500 KB+ JSON; без размера нельзя быстро отличить лёгкий
чат от «кирпича», который дорого грузить и медленно рендерить.

Hermes list API гарантированно отдаёт `message_count`, но **не** гарантирует
поле `bytes` / `tokens` на каждую сессию. Полный размер считается из
`GET /api/sessions/{id}/messages`. Тянуть messages для каждой строки списка —
антипаттерн (см. design `real-sessions-access`).

## What Changes

- **session-size** capability:
  - в **списке** сессий: показывать `message_count` (уже есть); опциональный
    size-badge **только** если list-объект уже содержит size/token поля от Hermes;
  - в **открытой** сессии: после загрузки messages считать payload size
    (chars, UTF-8 bytes JSON, грубая оценка tokens) и показывать в шапке
    Chat / Session detail;
  - утилиты `formatBytes` + `sessionPayloadSize(messages)`;
  - порог «тяжёлая сессия» (например > 500 KB) — визуальный warning, без блокировки.

## Non-goals

- Не сканировать messages всех сессий ради колонки Size в списке.
- Не использовать size для биллинга / точного token accounting (оценка chars/4
  для UI-бейджа, не для денег).
- Не парсить `state.db` и не ходить в `/api/sessions/{id}/export` ради размера
  на каждом рендере списка.
- Не менять auth, registry, pagination sessions-read.
- Не строить skills browser / prod BFF в рамках этого change.

## Impact

- **Specs:** новая capability `session-size`.
- **Код (после approve):** `src/types` (если list отдаёт size-поля),
  util size helpers, `_SessionList` (count + optional badge),
  `_ChatConsole` / session header (computed size after messages load).
- **Риск:** ложная точность «tokens» — в UI явно маркировать как approximate.
- **Docs:** при обнаружении живых size-полей в list — обновить `KB/README_SURVEY.md`.
