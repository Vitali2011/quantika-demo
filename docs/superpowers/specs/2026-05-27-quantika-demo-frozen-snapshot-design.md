# Quantika Demo — Frozen Snapshot (parse-once + freeze date)

**Date:** 2026-05-27
**Status:** Design approved, ready for implementation plan
**Owner:** Виталий (founder), orchestrator session

## Цель

Превратить Quantika Demo из «живого парсера Gmail» в **застывшее воспроизводимое демо**:

1. **Parse-once persistence:** 153 broker email (`.private/raw-emails/*.json`) парсятся один раз в build-time. Runtime никогда не вызывает LLM-парсеры для seed-данных.
2. **Frozen "today":** все matching/freshness/expiry-вычисления используют фиксированную дату (frozenDate из seed manifest), а не реальный `new Date()`. Партнёр, открывающий демо 27 мая или через 6 месяцев, видит одинаково «свежие» матчи.
3. **Internal date shift:** письма были присланы партнёром как примеры **позднее** их реального send-date, и их laycan/open_date уже были устаревшими в момент пересылки. Phase 0 анализирует распределение → Phase 1 сдвигает все даты (header + body + parsed fields) на per-email offset так, чтобы laycan/open_date попадали в активное окно вокруг frozenDate.

## Не-цели

- Real-time Gmail flow в DEMO_MODE (выключен полностью; cron-poller не стартует)
- Runtime добавление писем в seed (требует rebuild snapshot)
- Per-session demo isolation (`DEMO_MODE` — глобальный env flag)
- Non-anonymized variant snapshot'а (отклонено: репозиторий публичный)

## Архитектура (4 компонента)

| Компонент | Файл | Ответственность |
|---|---|---|
| Clock abstraction | `lib/clock.ts` (new) | Единственный источник времени. `now()` / `today()`. В DEMO_MODE читает `frozenDate` из snapshot meta; иначе `new Date()`. Все callsites в matching/freshness/expiry заменяются. |
| Seed builder Phase 0 | `scripts/demo-seed/analyze.ts` (new) | Парсит 153 письма (через существующие парсеры), вычисляет per-email `offsetDays` + anonymization map, пишет `scripts/demo-seed/manifest.json`. Ничего не меняет в источниках. Идемпотентно, deterministic (seeded random). |
| Seed builder Phase 1 | `scripts/demo-seed/build.ts` (new) | Читает raw + manifest → shift dates в body (regex по date-strings извлечённым из parsed_result) → anonymize names → пишет `data/demo-seed.db` (`emails` + `parsed_results` + `matches` precomputed). |
| DEMO_MODE wiring | `lib/demo-mode.ts` (new) + `.env.demo` (new) | Env-flag `DEMO_MODE=true`. App reads `SESSIONS_DB_PATH=data/demo-seed.db`. Gmail-polling cron skipped. Parser endpoints возвращают cached `parsed_results` для known message_id. |

## Data flow

```
.private/raw-emails/*.json (153 файла, gitignored, реальные ETM-Services emails)
        ↓ scripts/demo-seed/analyze.ts            ← Phase 0: pure read
scripts/demo-seed/manifest.json (in git, human-reviewable)
        ↓ scripts/demo-seed/build.ts (raw + manifest)
data/demo-seed.db (in git, anonymized SQLite snapshot)
        ↓ deploy
prod app (DEMO_MODE=true) — читает demo-seed.db
        ↓ clock.now() = manifest.frozenDate
UI /matches /market /vessels показывает "fresh" данные относительно frozenDate
```

## Manifest format (`scripts/demo-seed/manifest.json`)

```json
{
  "schema_version": 1,
  "generated_at": "2026-05-27T...",
  "raw_emails_dir": ".private/raw-emails",
  "raw_emails_count": 153,
  "frozenDate": "2026-05-20",
  "demo_window_days": 14,
  "offsets": {
    "19d5de87705baf9b": {
      "offsetDays": -42,
      "rationale": "laycan 2026-04-08..12 → shift → 2026-05-20..24 (active window)",
      "shifted_fields": ["email.date", "laycan_start", "laycan_end", "vessel.open_date"]
    }
  },
  "anonymization": {
    "vessels": { "M/V SPRING WIND": "M/V SEAGULL 1" },
    "charterers": { "KORNAS LTD": "GRAIN TRADER A" },
    "brokers": { "ETM Services Management": "DEMO BROKER" },
    "sender_emails": { "management@etm-services.net": "broker@demo.local" }
  },
  "stats": {
    "active_laycans_after_shift": 142,
    "stale_laycans_after_shift": 11,
    "anonymization_unknowns": []
  }
}
```

## Phase 0 (`analyze.ts`) — алгоритм

1. Read `.private/raw-emails/*.json`.
2. Для каждого письма — вызвать существующие парсеры (`parse-vessel`, `parse-cargo`, `parse-recap`, `classify`). Результаты кэшируются в `.cache/analyze-runs/<hash>.json` чтобы analyze.ts можно было перезапускать без $$.
3. Извлечь: `email.date`, `laycan_start/end`, `vessel.open_date`, `vessel_name`, `charterer_name`, `broker_name`, `sender_email`.
4. **Target frozenDate:** по умолчанию = последний email.date + 1 день (override через CLI flag `--frozen-date=YYYY-MM-DD`).
5. **Per-email offset:** target = `[frozenDate - demo_window_days, frozenDate + demo_window_days]`. Для каждого письма вычислить `offsetDays` так, чтобы:
   - cargo: середина laycan-окна попадала в `[frozenDate, frozenDate + 14d]` (laycan «открывается сегодня или скоро»)
   - vessel: open_date попадал в `[frozenDate - 7d, frozenDate + 7d]` (vessel «уже свободен или скоро»)
   - email.date сдвигается на ТОТ ЖЕ offset → falls в `[frozenDate - 21d, frozenDate]`
6. **Anonymization map:** для каждого встреченного `vessel_name`/`charterer_name`/`broker_name` сгенерировать псевдоним по детерминированному порядку первого появления (`M/V SEAGULL 1`, `M/V SEAGULL 2`, ...). Если имя уже в существующей `anonymization` секции manifest'а — переиспользовать.
7. Write `manifest.json`. Exit code 1 если есть `anonymization_unknowns` или если >20% писем не вписываются в окно.

## Phase 1 (`build.ts`) — алгоритм

1. Read `manifest.json` + `.private/raw-emails/*.json`.
2. Для каждого письма:
   - Apply `offsetDays`: shift `email.date` (Gmail header), и **всех date-strings в body** (regex-replace, source = parsed_result.dates extracted by parsers в analyze phase, чтобы не пропустить форматы вроде "10/15 May", "10-15 MAY", "10.05-15.05.26").
   - Apply anonymization: string-replace всех имён в `subject` + `body` + `from_name` + `from_email` per manifest.
3. Re-run парсеры на shifted+anonymized body → получить новый `parsed_result` (с уже сдвинутыми датами в structured fields).
4. Pre-compute matches: запустить match engine cargo↔vessel pairs с `clock.now()` = `frozenDate`. Persist в `matches` таблицу.
5. Write `data/demo-seed.db` (отдельный файл от `data/sessions.db`). Включает: `emails`, `parsed_results`, `matches`, мета-таблица `demo_seed_meta` (frozenDate, manifest_hash, generated_at).
6. `data/demo-seed.db` коммитится в git (SQLite binary, ~5-15 MB ожидаемо).

## Clock abstraction (`lib/clock.ts`)

```typescript
// lib/clock.ts
import { isDemoMode, getDemoFrozenDate } from './demo-mode';

export function now(): Date {
  if (isDemoMode()) {
    return new Date(getDemoFrozenDate());  // читает из demo_seed_meta таблицы при init
  }
  return new Date();
}

export function today(): string {
  return now().toISOString().slice(0, 10);
}
```

**Codemod:** заменить `new Date()` (без аргументов) на `now()` в `lib/freshness.ts`, `lib/matching/**`, `lib/sailing/**`, `lib/deadlines/**`, `app/api/matches/**`, `app/api/processing/**`. **НЕ трогать**: audit/log timestamps (`audit_events.created_at`), auth session expiry, file mtime, cron schedule — они должны оставаться real-time.

**Discovery requirement:** перед codemod-ом — `grep -rn "new Date()" lib/ app/ --include="*.ts" --include="*.tsx" | wc -l` для baseline. Каждый callsite классифицируется (shift/keep) с rationale в plan.

## DEMO_MODE wiring (`lib/demo-mode.ts` + `.env.demo`)

```typescript
// lib/demo-mode.ts
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}

export function getDemoFrozenDate(): string {
  // Read from demo_seed_meta table at app init, cache in memory
  if (!_cached) {
    const db = getDb();
    _cached = db.prepare('SELECT frozen_date FROM demo_seed_meta LIMIT 1').get();
  }
  return _cached.frozen_date;
}
```

`.env.demo`:
```
DEMO_MODE=true
SESSIONS_DB_PATH=data/demo-seed.db
AI_PROVIDER=cached    # parser endpoints respond from parsed_results table only
```

**Runtime guards:**
- `app/api/emails/poll/route.ts` (Gmail cron) — early return if `isDemoMode()`
- `app/api/parser/*/route.ts` — в DEMO_MODE для known `gmail_message_id` → возвращает `parsed_results` row; для unknown → 404 (не делает LLM-вызов)
- AbortController-обёрнутые AI calls (14 endpoints per memory) — в DEMO_MODE сразу возвращают cached/empty

## Edge cases

| Случай | Поведение |
|---|---|
| Новое письмо в `.private/raw-emails/` без записи в manifest | `analyze.ts` ругается `missing offset for <threadId>`, перегенерирует manifest, пользователь ревьюит diff перед commit |
| Parser сломался на shifted body (e.g., date regex не сматчился) | Fallback: shift только structured fields в parsed_results, body keep original-but-anonymized, помечается `body_shift_partial: true` в meta |
| `DEMO_MODE=true` но `data/demo-seed.db` отсутствует | App boot fails с явным сообщением — НЕ silent fallback на пустую базу |
| Anonymization map не покрывает имя | `analyze.ts` экзитит с `anonymization_unknowns` списком; builder отказывается работать пока не добавишь правило в manifest |
| Manifest commit'нут с offset для письма которого больше нет в `.private/` | analyze.ts помечает orphan offsets как warning, не fatal — можно зачистить вручную |
| Freshness тест ожидает «stale» для известной даты | Тесты с hard-coded датами обновляются на frozenDate-relative (PI3 разрешён если очевидно что тест измеряет behaviour, не expectation) |

## Testing

| Слой | Что проверяем |
|---|---|
| `lib/clock.test.ts` (unit) | DEMO_MODE=true → возвращает frozenDate; DEMO_MODE=false → real now() (with tolerance) |
| `scripts/demo-seed/analyze.test.ts` (golden) | На зафиксированном corpus (5-10 fixture emails в `__tests__/fixtures/demo-seed/`) выход `manifest.json` побайтово стабилен — guard против non-deterministic ordering |
| `scripts/demo-seed/build.test.ts` (golden) | manifest + raw fixtures → bit-exact `demo-seed.db` (через `sqlite3 .dump` diff на `emails` + `parsed_results` tables) |
| Existing freshness/matching/expiry tests | Должны проходить после `new Date()` → `clock.now()` swap. PI3 enforcement: codemod НЕ переписывает expectations, только импорты + замена. Любой failing test = root-cause в clock module, не в test |
| E2E (playwright) | Открыть `/matches` в DEMO_MODE → ≥80% видимых матчей с green freshness tag, 0 «stale» в первой странице. Открыть `/market` → виджеты показывают значения с as-of-date в окне `frozenDate ± 7d` |
| Integration | App boot c `DEMO_MODE=true` + missing `demo-seed.db` → fails с exit code ≠0 и явным сообщением |

## Migration / rollout

1. Land Phase 0 (analyze.ts) + manifest.json review pass (партнёр-данные → solo review founder'ом)
2. Land clock.ts + codemod в одной PR с PI3-чеклистом всех тронутых тестов
3. Land Phase 1 (build.ts) + `data/demo-seed.db` (~10 MB binary в git — учитывать `.gitattributes` для LFS если >50MB)
4. Land DEMO_MODE wiring + `.env.demo` template
5. Deploy: prod env устанавливает `DEMO_MODE=true`, читает demo-seed.db
6. Verify: `/matches` показывает ≥120 active матчей (current prod baseline: 0-30 active из-за stale dates)

## Open questions для writing-plans

- Should `analyze.ts` запускаться в CI на каждый PR в `.private/`-related файлы или только manually? (Recommended: manual — `.private/` outside CI surface)
- `data/demo-seed.db` size budget — если >50MB переключаемся на Git LFS, иначе обычный binary commit
- `parsed_results` cache в analyze.ts — TTL и invalidation policy (Recommended: hash-based, invalidate если parser_version или email body изменился)

## Acceptance criteria

- [ ] `lib/clock.ts` существует, все matching/freshness/expiry callsites используют `now()` вместо `new Date()`
- [ ] `scripts/demo-seed/analyze.ts` запускается локально на `.private/raw-emails/*.json` → выдаёт manifest.json
- [ ] `scripts/demo-seed/build.ts` производит `data/demo-seed.db` идемпотентно (same manifest+raw → bit-identical DB)
- [ ] `DEMO_MODE=true` + `data/demo-seed.db` → app boot ok, `/matches` рендерит ≥120 active матчей
- [ ] Все existing tests green после codemod (PI3: zero rewrites of expectations)
- [ ] Anonymization: grep -i "etm.services\|kornas\|<real vessel names>" в `data/demo-seed.db` → 0 hits
- [ ] Gmail cron disabled в DEMO_MODE (verify via prod logs: zero `email/poll` invocations за 24h)
