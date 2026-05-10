# Private Email Corpus + Demo Auth — Design

**Date:** 2026-05-10
**Status:** Approved (brainstorming complete)
**Next:** writing-plans → implementation

---

## Цель

Превратить `demo.quantika.org` в приватную лабораторию для итеративной отладки Gemini-пайплайна на ~180 реальных freight-broker письмах (форварды клиента + прямые ETMS-рассылки). Корпус кормит существующие скиллы `/progonq` и `/progonb` — новый evaluation pipeline не строим.

## Контекст

- У пользователя ~150 форвардов от друга (реальные письма реального клиента) + 30 прямых ETMS-писем уже зашиты в `lib/sample-data/etms-emails.json`.
- Цель — найти где Gemini ошибается (parse-cargo, parse-vessel, classify, match, RAG) и итеративно править промпты.
- Существующая инфраструктура:
  - `/progonq` — local adversarial loop с domain expert review до сходимости (2 PASS подряд)
  - `/progonb` — production validation после `/progonq`
  - `scripts/wave-gamma-bake-off/` — парсинг bake-off (gpt-5.5 vs Gemini)
  - `lib/forward-parser` — unwrap forwarded message layers

## Принятые решения (брейнсторм)

| #   | Решение                                                                 | Альтернативы рассмотрены            |
| --- | ----------------------------------------------------------------------- | ----------------------------------- |
| 1   | Корпус для итеративной отладки (вариант C → B), не fine-tuning          | A visual demo / D training data     |
| 2   | Письма приватные, доступ только владельцу                               | Public in repo / VPS DB             |
| 3   | Один общий пароль на всё demo (вариант A)                               | Multi-user / hybrid public+admin    |
| 4   | Все 180 писем в `.private/` единой пачкой; старый fixture удалён из git | Старые остаются как public fallback |
| 5   | Gmail-фильтр: `label:"_ ETMS - Management"`                             | from-based фильтр                   |
| 6   | Helper-скрипт для извлечения кейсов в `/progonq` corpus                 | Новый bake-off pipeline             |

## Архитектура

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: AUTH PERIMETER                                 │
│   middleware.ts → /login → cookie-based session         │
│   ENV: DEMO_AUTH_USER, DEMO_AUTH_PASSWORD, _SECRET      │
│   Bypass для /login, /api/auth/*, /_next/*, статика     │
└─────────────────────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Layer 2: GMAIL → PRIVATE STORAGE                        │
│   scripts/setup-gmail-oauth.ts (one-time)               │
│   scripts/import-gmail-emails.ts (incremental)          │
│   Gmail API + OAuth refresh_token                       │
│   Filter: label:"_ ETMS - Management"                   │
│   → .private/raw-emails/<thread_id>.json                │
└─────────────────────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Layer 3: BUILD CORPUS                                   │
│   scripts/build-corpus.ts                               │
│   raw threads → forward-parser unwrap → Email[]         │
│   → .private/etms-corpus.json                           │
└─────────────────────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Layer 4: UI HOOK                                        │
│   app/api/etms-demo/route.ts                            │
│   Reads .private/etms-corpus.json (если есть)           │
│   Иначе → 503 "corpus not loaded"                       │
└─────────────────────────────────────────────────────────┘
                         ▼
   [existing UI: classify → parse → match → RAG]
                         ▼
   [/progonq когда увидена проблема — отдельный скилл]
```

## Файловая структура

```
.private/                                    # gitignored полностью
├── README.md                                # инструкции по setup
├── oauth-credentials.json                   # Google OAuth client (secret)
├── oauth-token.txt                          # refresh_token (secret)
├── raw-emails/
│   └── <thread_id>.json                     # сырые Gmail thread payloads
└── etms-corpus.json                         # собранный Email[] для UI

scripts/
├── setup-gmail-oauth.ts                     # NEW: OAuth flow в браузере
├── import-gmail-emails.ts                   # NEW: incremental fetch
├── build-corpus.ts                          # NEW: raw → corpus.json
├── extract-corpus-cases.ts                  # NEW: corpus → /progonq/corpus/
└── sync-corpus-vps.sh                       # NEW: scp на VPS

middleware.ts                                # CHANGED: auth check
app/login/page.tsx                           # NEW: login form
app/api/auth/login/route.ts                  # NEW: POST creds
app/api/auth/logout/route.ts                 # NEW: clear cookie
app/api/etms-demo/route.ts                   # CHANGED: read .private/

.gitignore                                   # CHANGED: + .private/, + lib/sample-data/etms-emails.json
lib/sample-data/etms-emails.json             # DELETED: git rm
package.json                                 # CHANGED: + scripts (import:emails, build:corpus, sync:corpus:vps)
```

## ENV переменные

```bash
# .env.local (gitignored)
DEMO_AUTH_ENABLED=true
DEMO_AUTH_USER=admin
DEMO_AUTH_PASSWORD=<set by user, see .private/README.md>
DEMO_AUTH_SECRET=<generated via openssl rand -hex 32>
DEMO_AUTH_COOKIE_DAYS=30
```

⚠ Текущий пароль (`Wil159321`) — слабый. Перед production deploy рекомендуется заменить на 24+ случайных символа.

## Workflow: импорт и обновление

```bash
# Один раз — OAuth setup
npm run setup:gmail-oauth          # открывает браузер, сохраняет refresh_token

# Регулярно — при появлении новых писем
npm run import:emails              # инкрементально добирает с label
npm run build:corpus               # пересобирает .private/etms-corpus.json
npm run sync:corpus:vps            # scp на demo.quantika.org

# Использование
# → заходишь на demo.quantika.org → login → Demo: ETMS Circulars → 180 писем
```

## Workflow: интеграция с /progonq

Когда через UI замечена проблема (например, parse-cargo пропускает DWCC в форвардах):

```bash
# Шаг 1: извлечь релевантные кейсы из корпуса
npm run corpus:extract -- \
  --where 'body matches /DWCC/i' \
  --count 8 \
  --to .progonq/parse-cargo-dwcc-2026-05-XX/corpus/dwcc-in-forward/

# Шаг 2: запустить скилл в новой сессии Claude
/progonq parse-cargo dwcc-extraction-on-forwards

# /progonq сам делает Phase 1-5 (parse → QA → decide → fix prompt → loop)
# По завершении — /progonb для prod validation
```

## YAGNI — что не строим

- Multi-user аккаунты (один пароль решает 95% сценариев)
- Анонимизация писем (за паролем — уже private)
- Auto-judge "Gemini vs gpt-5.5" pipeline (есть scripts/wave-gamma-bake-off + /progonq)
- Web-UI для управления корпусом (CLI scripts достаточно)
- Auto-scheduling импорта (manual когда нужно)
- Веб-форма OAuth setup (terminal helper хватит)

## Estimate

| Компонент                                  | Время            |
| ------------------------------------------ | ---------------- |
| Auth middleware + /login page + API        | 2-3 ч            |
| OAuth setup helper                         | 1 ч              |
| Gmail import (incremental)                 | 2-3 ч            |
| Build corpus (forward unwrap pipeline)     | 2 ч              |
| UI hook + npm scripts + sync:vps           | 1 ч              |
| Удаление старого fixture (git + VPS)       | 30 мин           |
| Helper для /progonq case extraction        | 1 ч              |
| .gitignore + ENV docs + .private/README.md | 30 мин           |
| **Итого**                                  | **~10-12 часов** |

Можно одной волной. Логично разбивать на 2 PR:

- PR-1: Auth + .private/ infrastructure + удаление старого fixture
- PR-2: Import + build-corpus + UI hook + extract-cases helper

## Open items (уточнить при implementation)

1. Где именно хостить /login страницу (отдельный route group чтобы не наследовать layout?)
2. Каким клиентом ходить в Gmail API — `googleapis` (тяжелый, но canonical) или `gmail-api-js` (легче)? Зависит от того, что уже в node_modules.
3. Нужен ли `/api/auth/logout` или достаточно очистить cookie через UI? (вопрос UX)
4. Делать ли `dry-run` режим у `import:emails` для тестирования фильтра?
5. Rate limiting: Gmail API имеет квоты (250 quota units/user/sec) — для 150 писем не критично, но стоит ловить 429.

## Безопасность

- Пароль в `.env.local` (gitignored) и в systemd unit на VPS, не в git.
- OAuth refresh_token в `.private/oauth-token.txt` (gitignored). При утечке — отозвать в Google Account → Security → Apps with access.
- Cookie auth: httpOnly, Secure (на проде), SameSite=Lax, signed HMAC через DEMO_AUTH_SECRET.
- Все приватные пути в `.gitignore` проверить через `git check-ignore` перед первым коммитом.
- VPS: `.private/` владелец `root`, mode 700.

## Связь с другими планами

- Не блокирует и не блокируется wave-γ работой (parsing bake-off).
- Удаление `lib/sample-data/etms-emails.json` может затронуть `scripts/wave-gamma-bake-off/corpus.ts` (он использует sample-data) — проверить при implementation, возможно нужна fallback стратегия.
- Auth слой совместим с Phase 1 knowledge layer (KNOWLEDGE_RAG_ENABLED флаг работает независимо).
