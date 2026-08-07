## Why

Проект пока умеет только показывать fleet health (`/api/status`) для двух локальных
профилей. Реальной работы с данными агентов нет: сессии не читаются, второй способ
аутентификации (gated-агент с паролем) не поддержан.

Цель периода 1 — **доказать работающий доступ к реальным сессиям реальных
Hermes-агентов**, включая агента в LAN, и закрепить это спеками, чтобы дальше
строить UI на проверенной основе.

Ключевое открытие живого замера (2026-08-06): у Hermes **два разных механизма auth**,
и второй не покрыт текущим кодом:

| Агент | `auth_required` | Механизм |
|---|---|---|
| локальный `127.0.0.1:9119` | `false` | `X-Hermes-Session-Token` (токен из SPA HTML) |
| `192.168.1.221:9119` (l1) | `true` | `POST /auth/password-login` → cookie-сессия |

## What Changes

- **agent-registry:** три таргета периода 1 — `local:projects-ex`, `local:default`
  и `l1:default` (`http://192.168.1.221:9119`, профиль `default`).
- **hermes-auth:** два механизма как first-class:
  - `session-token` — заголовок `X-Hermes-Session-Token` (loopback, `auth_required:false`);
  - `cookie` — `POST /auth/password-login` (`{provider,username,password}`) → куки
    `hermes_session_at/rt/provider` → передача cookie на gated REST.
  - Выбор механизма — по feature-detection через `GET /api/status` / `/api/health`
    (`auth_required`), а не хардкодом.
- **sessions-read:** список + сообщения с пагинацией для любого таргета,
  единообразно поверх обоих механизмов auth.
- **sessions-live-demo:** запускаемая демонстрация против **живых** агентов;
  честный отчёт об ошибке вместо пустого success.
- **Секреты:** креды 221 только из env (`HERMES_L1_USERNAME` / `HERMES_L1_PASSWORD`),
  никогда в git.

## Non-goals

- Продовый multi-host BFF, Tailscale, OAuth, ws-тикеты.
- Чат-UI по WebSocket, мутации сессий (rename/delete/import), FTS-поиск, skills browser.
- Дизайн-система: сырых таблиц/списков достаточно.
- Кросс-профильный `/api/profiles/sessions` одним вызовом (позже; период 1 — явный
  `?profile=` на таргет для наглядности).

## Impact

- **Specs:** `agent-registry`, `hermes-auth`, `sessions-read`, `sessions-live-demo`.
- **Код:** `src/types/agent.ts` (auth-дескриптор), `src/api/client.ts` (cookie-логин,
  пагинация, envelope-типы), `src/config/agents.ts` (третий таргет),
  `vite.config.ts` (прокси на удалённого агента), Sessions-вью.
- **Риск (браузер):** cookie-механизм для 221 требует прокси (CORS + HttpOnly куки),
  поэтому dev-прокси становится обязательным путём, а не удобством.
- **Docs:** `KB/README_SURVEY.md`, `KB/README_DEV.md` (мини-BFF для l1),
  `KB/README_FLEET.md`, `CHANGELOG.md`.
