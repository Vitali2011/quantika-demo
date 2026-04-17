# E2E Audit Prompt — для новой сессии Claude Code

Скопируй текст ниже (от `---START---` до `---END---`) в новую сессию Claude Code.

---START---

Ты — Opus-оркестратор для Quantika Demo (https://demo.quantika.org). Твоя задача: провести ПОЛНЫЙ end-to-end аудит качества AI-системы глазами самого скептичного freight-форвардера, который не доверяет AI и проверяет каждую цифру. Работай через параллельные sub-agent сессии на Sonnet (Agent tool, model: "sonnet"), контролируй на Opus.

## Контекст приложения

Quantika Demo — AI-ассистент для shipping-брокеров. Читает email'ы (грузовые запросы, позиции судов, fixture recaps, сертификаты, TCT), извлекает структурированные данные, сопоставляет грузы с судами по 6 параметрам + санкционная проверка.

**Stack:** Next.js 14, SQLite sessions, OpenAI GPT-5.4/5.4-mini, VPS 185.249.225.169.
**Repo:** ~/work/quantika-demo/
**VPS SSH:** `sshpass -p 'Vit15932' ssh -o StrictHostKeyChecking=no root@185.249.225.169`
**DB:** /root/quantika-demo/data/sessions.db

## Текущие 21 email в demo:

- 7 CARGO_INQUIRY (sample-1,2,7,9,18,19,21) — sample-9 содержит 3 лота
- 9 VESSEL_POSITION (sample-3,4,5,6,8,10,11,12,20) — sample-11 содержит 5 судов
- 3 FIXTURE_RECAP (sample-14,15,16)
- 1 TCT_REQUEST (sample-13)
- 1 VESSEL_CERTIFICATE (sample-17)

Итого: 9 parsedCargos, 13 parsedVessels, 9×13=117 возможных пар.
Текущий результат: 80 matches + 37 blockedMatches = 117/117 (100% coverage).

## Текущие метрики (Wave 7):
- distance_computed: 80/80 (100%)
- verdict_known: 80/80 (100%), verdicts: ideal=15, idle=65
- reasons_with_numbers: 191/191 (100%)
- sanctions_blocking: 4 (RU-flag)
- lastCargoes: 7/13 (54%) — ceiling для этого датасета
- geo_points_gt0: 100%

## Ключевые файлы:

- Типы: `lib/types.ts` (ParsedCargo 23 поля, ParsedVessel 38 полей, Match 11 полей)
- Pipeline: `app/api/ai/{classify,parse-cargo,parse-vessel,match}/route.ts`
- Scoring: `lib/sailing/match-scoring.ts` (6 компонентов: geo 20, cargoType 20, cranes 15, volume 15, laycan 20, DWT 10)
- Hard filters: `lib/sailing/match-filters.ts` (draft, crane, volume, cargoVessel)
- Readiness: `lib/sailing/readiness-gap.ts` (ideal/tight/idle/late/unknown + spot detection)
- Sanctions: `lib/validation/sanctions.ts` (normalizeFlagToISO2, 77 aliases, RU/IR→HIGH blocking)
- Ports: `lib/sailing/port-distances.ts` (103 порта, haversine fallback ×1.25)
- Enricher: `lib/matching/reason-enricher.ts` (5 правил обогащения reasons)
- LastCargoes: `lib/parsing/lastcargoes-fallback.ts` (regex post-processor)
- Smoke test: `smoke-test-ssh.sh` (L1-L7, async match polling)
- Dashboard: `app/dashboard/page.tsx`
- Sample data: `lib/sample-data/{cargo-inquiries,vessel-positions}.json`

## ЗАДАЧА: E2E аудит глазами скептичного форвардера

### ФАЗА 1 — Аудит извлечения (3 параллельных агента)

**Agent A: Аудит 9 cargo** — для КАЖДОГО из 9 parsedCargos:
1. Прочитай исходный email body из `lib/sample-data/cargo-inquiries.json`
2. Прочитай что система извлекла из DB (query VPS: parsedCargos)
3. Сравни КАЖДОЕ поле:
   - Поле populated → правильно ли значение? Совпадает с email?
   - Поле null → есть ли эта информация в email? Если да — что пропустил AI?
   - ConfidenceField → правильный ли confidence? "confirmed" стоит на точных цитатах? "interpreted" не стоит где должен быть "confirmed"?
4. Для каждого cargo выведи: email_id, populated_fields/total, missed_fields (с цитатой из email что было пропущено), wrong_values (если есть)
5. Итоговая таблица: % coverage per cargo, список всех missed fields across all cargos

**Agent B: Аудит 13 vessels** — аналогично Agent A но для ParsedVessel (38 полей):
1. Прочитай email body из vessel-positions.json
2. Сравни каждое из 38 полей с email body
3. Особое внимание: geared (правильно ли определён для Gearless судов?), lastCargoes (есть ли L/C: в email?), flag (нормализован?), built/LOA/beam (точные цифры?), openDate (spot определён?)
4. Для multi-vessel email (sample-11, 5 судов): проверить что каждое судно получило правильные данные (не перепутаны между собой)
5. Итоговая таблица: % coverage per vessel, пропущенные поля

**Agent C: Аудит классификации** — для КАЖДОГО из 21 emails:
1. Прочитай email body
2. Проверь: правильно ли классифицирован? (CARGO_INQUIRY vs VESSEL_POSITION vs TCT_REQUEST vs FIXTURE_RECAP vs VESSEL_CERTIFICATE)
3. sample-13 (TCT) — действительно ли не парсится как cargo? Проверить что cargo parser его пропускает
4. sample-17 (certificate) — не парсится ни как cargo ни как vessel?
5. sample-14/15/16 (fixtures) — не попадают в matching pipeline?
6. Итоговая таблица: email_id, expected_category, actual_category, correct? (yes/no)

### ФАЗА 2 — Аудит матчинга (3 параллельных агента)

**Agent D: Аудит scoring** — для 10 лучших матчей (top score) и 10 худших:
1. Вытянуть из DB полный scoreBreakdown для каждого
2. Проверить каждый из 6 компонентов:
   - Geographic proximity: правильное расстояние? Порты верные?
   - Cargo type match: cargoType vs vessel lastCargoes/vesselType — логичен ли score?
   - Crane handling: geared/gearless vs cargo type — правильно?
   - Volume fit: weightMt × stowageFactor vs grainCapacity — математика сходится?
   - Laycan fit: verdict правильный? gapDays расчёт верный?
   - DWT class fit: cargo/DWT ratio корректен?
3. matchReasons — каждый reason содержит цифру? Цифры корректны (не выдуманы)?
4. issues — адекватны? Не пропущены ли реальные issues?
5. Итого: сколько scoring ошибок из 120 компонентов (20 матчей × 6)

**Agent E: Аудит hard filters + sanctions** — для всех 37 blockedMatches:
1. Для каждого blocked match проверить: причина блокировки адекватна?
2. Sanctions-blocked (4 штуки): RU flag правильно определён? Маршрут действительно EU?
3. Hard-filter-blocked: какой фильтр сработал? Правильно ли? Нет ли false positives (заблокирована пара которая реально feasible)?
4. Reverse check: среди 80 approved matches — нет ли пар которые ДОЛЖНЫ были быть заблокированы?
5. Итого: false positive count, false negative count

**Agent F: Аудит readiness** — для всех 80 matches:
1. Проверить verdict для каждого: ideal/tight/idle
2. Spot vessels (openDate="spot") — получили ли они ideal verdict? (fix из Wave 5)
3. Для 5 idle-матчей: расчёт gapDays верный? sailingDays × speed = distance / (speed×24)?
4. Для ideal-матчей: действительно ли vessel успевает?
5. Итого: сколько verdicts неправильных

### ФАЗА 3 — Написание нового smoke test (1 агент)

**Agent G: Ultimate E2E smoke test** — напиши новый smoke test или расшири существующий, чтобы он проверял ВСЁ что нашли Agents A-F:

Новые проверки:
- **L8 — Email-level extraction audit**: для каждого email проверить что ВСЕ поля из email body были извлечены. Автоматический regex-scan email body на patterns (DWT:\s*\d+, LOA:\s*\d+, Laycan:\s*...) vs parsed fields
- **L9 — Match quality audit**: для каждого матча проверить scoreBreakdown математику (сумма компонентов = basePhysical), score clamped 0-100, matchLevel соответствует score (>70=good, >40=possible, ≤40=weak)
- **L10 — Sanctions completeness**: все RU-flag vessels blocked на EU routes, нет false negatives
- **L11 — Readiness correctness**: spot vessels ≠ idle, gapDays = (laycanStart - arrivalDate) / 86400000
- **L12 — Reason quality**: каждый reason содержит ≥1 digit, нет "[object Object]", нет "undefined"
- **L13 — Cross-reference**: каждый match.cargoEmailId exists in parsedCargos, каждый match.vesselEmailId exists in parsedVessels, каждый pair either in matches OR blockedMatches (100% coverage)

## Правила работы

1. **Opus оркестрирует** — запускай agents через Agent tool с model="sonnet"
2. **Параллелить где нет file conflicts** — Agents A+B+C параллельно (read-only), D+E+F параллельно (read-only), G последним (пишет код)
3. **После каждой фазы** — собери результаты, сделай сводку, запусти следующую
4. **Agent G** — получает findings от всех предыдущих агентов как input
5. **Финал** — запусти новый smoke test, покажи результат
6. **Не коммить** пока не покажешь результат мне
7. **Язык** — отчёты на русском, код на английском

---END---
