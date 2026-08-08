# hermes_plus — База знаний (оглавление)

**Последнее обновление:** 2026-08-08

Проект: **hermes_plus** — своя UI-оболочка (Node/TS + React) для работы с Hermes Agent
(просмотр skills, sessions, config, чат) через официальный web-API дашборда.

Точка входа в БЗ. Перед работой с темой — читай соответствующий README.

## Разделы

| Файл | Тема | Статус |
|---|---|---|
| [README_IDEA.md](README_IDEA.md) | Идея проекта, цель, архитектура, стек, план | ✅ |
| [README_DEV.md](README_DEV.md) | Разработка и запуск: Vite proxy (BFF в dev), слои, реестр агентов | ✅ |
| [README_SURVEY.md](README_SURVEY.md) | Обследование Hermes: карта API-эндпоинтов дашборда, auth (вкл. живой замер), WS-каналы | ✅ |
| [README_WS_PROTOCOL.md](README_WS_PROTOCOL.md) | WS-протокол чата: JSON-RPC 2.0 на /api/ws, стрим-события, RPC-методы | ✅ |
| [README_FLEET.md](README_FLEET.md) | Fleet-архитектура: несколько машин × профилей → один UI (BFF, registry, auth) | ✅ |
| [README_SECURITY_PLANS.md](README_SECURITY_PLANS.md) | Безопасность и публикация в интернет: модель угроз, выбор транспорта (Tailscale/cloudflared → проброс порта + логин BFF + Let's Encrypt) | ✅ |

## Ключевые факты (TL;DR)

- **База API:** `http://127.0.0.1:9119` (`hermes dashboard` / `hermes serve`, порт по умолчанию 9119)
- **Версия Hermes на момент обследования:** 0.20.0 (release 2026.8.3, config_version 33)
- **Принцип:** тонкий клиент к официальному web-API, **НЕ** парсить `state.db`/`skills/*.md` напрямую (схема меняется)
- **Auth:** на loopback `auth_required: false`; наружу — bearer-token (`Authorization`) или OAuth/пароль. `--insecure` задепрекейчен (no-op).
- **Профили:** почти все роуты скоупятся `?profile=<name>` (активный профиль: `projects-ex`)
- **Чат:** НЕ REST `/v1`, а WebSocket `/api/ws` + `/api/pub` + `/api/events`. OpenAI-совместимый `/v1/chat/completions` — отдельный API Server адаптер gateway, не этот сервер.

## Как поднять сервер для экспериментов

```bash
hermes dashboard --no-open --skip-build   # порт 9119, web-UI + API
# или headless без web-UI:
hermes serve --no-open
hermes dashboard --status                 # список запущенных
hermes dashboard --stop                   # заглушить
```
