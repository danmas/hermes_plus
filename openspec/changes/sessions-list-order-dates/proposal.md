# Proposal: sessions-list-order-dates

## Why

Оператор ожидает, что **свежие сессии сверху**. Сейчас `_SessionList`
рендерит `data.sessions` **как пришло** с `GET /api/sessions` — без
`sort`/`order` в query и без клиентской сортировки. Порядок API
не зафиксирован в типах/KB; при «старые сверху» UX ломается.

Даты у сессии в Hermes **есть**: `started_at?: number`, `ended_at?: number | null`
(unix ms в типах). Карточка уже рисует `toLocaleDateString()` от `started_at`,
но без времени, без fallback на `ended_at` и без относительного формата
(«сегодня 14:32» / «вчера»).

## What Changes

1. **sessions-list-order** — гарантировать newest-first:
   - предпочесть серверный sort, если Hermes принимает параметр
     (проверить live: `sort`, `order`, `order_by` и т.п.);
   - иначе сортировать текущую страницу на клиенте по `started_at` DESC
     (нет даты → в конец; tie-break по `id`);
   - зафиксировать поведение в спеке и при необходимости в KB.

2. **session-card-dates** — обогатить футер карточки:
   - показывать дату/время из `started_at` (primary);
   - если `started_at` нет — `ended_at` или «—»;
   - формат: локаль пользователя, дата + время (или relative + title с полным ISO).

## Non-goals

- Не менять PAGE_SIZE / пагинацию limit-offset как модель.
- Не тащить все сессии ради глобального sort, если API не умеет order
  (тогда newest-first **внутри страницы** + пометка в design о лимите).
- Не трогать chat WS, size badges, auth, registry.
- Не парсить `state.db`.

## Impact

- **Specs:** `sessions-list-order`, `session-card-dates`.
- **Код:** `_SessionList.tsx`, возможно `getSessions` query params,
  маленький `formatSessionDate` helper.
- **Docs:** live-результат sort params → `KB/README_SURVEY.md`.
