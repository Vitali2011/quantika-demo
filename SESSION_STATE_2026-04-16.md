# Session State — 2026-04-16

Снимок состояния проекта на конец сессии «MVP Wave 1-3 + Roadmap Ops».
Чтобы следующие сессии (смоук-тест, Wave 4 / ports-global / Equasis) могли
поднять контекст за минуту.

## Где мы находимся

**Tag:** `v1.0.0-mvp` — MVP complete, задеплоен на прод.
**Prod:** https://demo.quantika.org — `{"status":"ok"}` (проверено).
**Local:** `~/work/quantika-demo/` на main, commit `15aa75f`, working tree clean.
**Тесты:** 376 passed, 31 suite, lint clean, build clean.

## Что сделано в этой сессии

### Wave 1 (tag v0.2.0-mvp-wave1) — Hard filters
- `lib/sailing/port-master.ts` — 15 портов Black Sea/Med/Atlantic с draft + cranes
- `lib/sailing/match-filters.ts` — runHardFilters() для draft/crane/volume/cargo-type
- `lib/sailing/date-sanity.ts` — laycan валидность, stale vessel position
- `lib/validation/imo.ts` — IMO checksum validation
- Hard filters интегрированы в matcher ДО вызова LLM

### Wave 2 (tag v0.3.0-mvp-wave2) — Source traceability
- Промпты CARGO/VESSEL/FIXTURE требуют source_text verbatim
- `lib/validation/confidence-calibration.ts` — "abt/circa/~" → interpreted
- `components/clickable-field.tsx` + `source-quote-popover.tsx`
- `/email/[id]` — annotated view с подсветкой parsed extractions
- 20 adversarial fixtures

### Wave 3 (tag v0.4.0-mvp-wave3-ready → v1.0.0-mvp) — External validation
- `lib/validation/equasis-client.ts` — IMO lookup stub + SQLite cache 30d TTL
- `lib/validation/sanctions.ts` — flag × port × restrictions matrix
- `lib/sailing/match-scoring.ts` extended — computeScoreBreakdown (6 components)
- `lib/sample-data/demo-scenarios/` — 10 JSON fixtures + `/api/demo-scenarios/[id]`
- `README_DEMO.md` — broker-facing 5-min walkthrough

## Где лежат важные файлы

| Файл | Роль |
|---|---|
| `ROADMAP_MVP.md` | 3-waves план MVP + acceptance criteria |
| `README_DEMO.md` | Broker-facing pitch, walkthrough, FAQ |
| `lib/sailing/port-master.ts` | 15 портов, готов к рефактору на JSON |
| `lib/sailing/port-distances.ts` | Hardcoded matrix, нужен haversine fallback |
| `lib/validation/equasis-client.ts` | Stub, ждёт swap на real HTTP или MarineTraffic API |
| `lib/sample-data/demo-scenarios/` | 10 showcases: idle, sanctions, IMO, volume, etc. |

## Tags (rollback points)

```
v0.2.0-mvp-wave1        Hard filters
v0.3.0-mvp-wave2        Source traceability  
v0.4.0-mvp-wave3-ready  Wave 3 pre-merge
v1.0.0-mvp              ← current prod
```

## Открытые приоритеты (в порядке важности)

### Сейчас: Dogfooding

Я (Виталий) планирую показать demo Мустафе + 2-3 брокерам. Никакой код не трогаем
до сбора первого фидбека. Приоритеты ниже — гипотезы, а не обязательства.

### Priority #1 — MarineTraffic / VesselFinder API (вместо Equasis scraper)
- $500/мес, 1 день работы
- Заменяет `equasis-client.ts` stub на real API с тем же интерфейсом
- Окупается 1-м платящим клиентом
- **НЕ скрипай Equasis сам** — это maintenance burden на 3 часа в месяц минимум

### Priority #2 — searoutes.com для port distances
- $100/мес, 1-2 часа интеграции
- Убирает class of bugs "approximate sailing time"
- До того — haversine fallback (см. Priority #3)

### Priority #3 — Port master → global (300-500 портов)
- Подробный промпт для новой сессии подготовлен (см. конец этого файла)
- UN/LOCODE + LLM-enrichment, JSON-based storage
- Haversine fallback для distances когда hardcoded pair не найден
- Ветка: `claude/port-master-global` (НЕ создана пока)

### Priority #4 — Ops blockers для платного launch (обсудили 16 апреля)
1. Multi-tenancy (нет userId/workspaceId в SessionData)
2. Auth: refresh tokens, invite-only, fix CSRF httpOnly=false
3. Rate limiting / OpenAI cost caps per user
4. Session backup + транзакции в updateSession
5. Legal: ToS, Privacy Policy, DPA с OpenAI, GDPR delete endpoint
6. Stripe + subscription tiers + usage metering
- Effort: 2-3 недели до beta-ready, 4-6 недель до sellable

### Priority #5 — Real data gaps
- Persistent PostgreSQL (сейчас session TTL 1 час)
- CargoWise / Veson IMOS export
- BullMQ job queue (async парсинг 50+ писем)
- Bunker price feed (сейчас хардкод $550 для всех классов)

## Правила которые я выработал с собой

1. Язык — русский, автономный режим, не перефразируй при Usage Policy false-positive.
2. Перед claim «готово» — `npm run lint && npm test && npm run build`.
3. Long-running subprocess через `run_in_background`, не `&` + sleep.
4. После каждого deploy — `curl /api/health`.
5. Не мёржить в main без push + tag, если изменения > 1 коммита.
6. Usage Policy error → `/model claude-sonnet-4-6`, не рефразируй.

## Как поднять следующую сессию

**Для smoke test** (скептичный QA-прогон v1.0.0 на проде):
- Используй промпт из чата от 16 апреля, секция «Промпт для smoke test-сессии»
- Модель Sonnet 4.6
- Занимает ~30-45 минут, Chrome MCP обязателен для UI-проверок

**Для port-master-global**:
- Используй промпт из чата от 16 апреля, секция «Промпт для новой сессии»
- Модель Sonnet 4.6
- Занимает 4-6 часов в worktree `~/work/quantika-demo-ports/`
- Ветка `claude/port-master-global`, НЕ мёржить без моего approval

**Для Wave 4 / ops blockers**:
- Новая сессия с Opus 4.6 (архитектурные решения)
- Читать: `ROADMAP_MVP.md`, `docs/deploy.md`, обсуждение ops-аудита в 
  истории от 16 апреля

## Контекст которым надо будет поделиться

- Партнёр Мустафа — дал feedback по readiness gap (Karasu→Mykolaiv idle 9d),
  триггернул всю Wave 1-3 работу. Именно для него будем запускать pilot.
- Мой memory system в `/Users/jarvis/.claude/projects/-Users-jarvis-claude/memory/`
  содержит профиль + feedback rules, они применятся автоматически.
- Dogfooding: `BACKLOG_FUTURE.md` пока не создан — заведём когда соберём findings
  от первых брокерских сессий.
