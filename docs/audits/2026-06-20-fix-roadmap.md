# Роадмап починки — аудит 2026-06-20

> Источник: [2026-06-20-uncovered-areas-audit.md](2026-06-20-uncovered-areas-audit.md)
> (10 подтверждённых, 19 спорных). Чиним через dynamic workflow по правилам
> `/orchestrator-day`: на каждый баг recon (корень, не симптом) → план → TDD-фикс →
> VALUE_CHECK перед DONE. Merge/deploy — только с go фаундера и пройденным value-gate.
>
> **FX 1.08 (`lib/currency.ts`) ИСКЛЮЧЁН** — уже отслеживается с прошлого аудита
> (2026-06-19), фаундер чинит отдельно. Не дублируем.

---

## Wave 1 — чистые код-фиксы, высокая ценность (чинить первой)

Детерминированные баги с ясным корнем и проверяемым фиксом. Не трогают данные/прод-сид,
не требуют продуктового решения.

| #    | Баг                                                                         | Файлы                                                                    | Корень                                    | Effort | Риск               | Оракул проверки                                           |
| ---- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------- | ------ | ------------------ | --------------------------------------------------------- |
| W1-1 | **compare-routes: DA всегда $0** (имя порта вместо UNLOCODE)                | `app/api/voyage/compare-routes/route.ts:78-86`                           | name-vs-code (нет `resolvePort`)          | M      | низкий             | DA для NLRTM/AEJEA ≠ 0 в модалке Suez vs Cape             |
| W1-2 | **Котировка показывается для чужого матча** (дедуп без match_id)            | `lib/quote-jobs/store.ts:38-42` + миграция UNIQUE-индекса `048`          | дедуп по (session,email) без match_id     | M      | средний (миграция) | два матча 1 груза → разные job_id                         |
| W1-3 | **Draft Quote всегда item 0** для multi-item письма                         | `app/cargo/[id]/page.tsx:110,367`, `use-quote-job.ts`, `worker.ts:28-35` | один DraftQuoteCard без itemIndex/matchId | M      | низкий             | котировка по item 1 и 2 различна; в письме есть TCE/фрахт |
| W1-4 | **ageInDays на реальных часах** → ложная «(stale)» в demo                   | `lib/data-quality/derive.ts:10-13`                                       | `Date.now()` вместо `demoNow()`           | S      | низкий             | war-risk бейдж 'live' на frozen-date 2026-05-28           |
| W1-5 | **laytime: отрицательный weatherDelayHours раздувает демередж**             | `app/api/laytime/calculate/route.ts:41-101`                              | нет валидации знака входа                 | S      | низкий             | POST с −48 → 400, не +48h                                 |
| W1-6 | **laytime: разбивка по дням ≠ Used Laytime** (нет строки погодной задержки) | `lib/laytime/calculator.ts:110-125`, `app/laytime/page.tsx:388-409`      | breakdown не вычитает weatherDelay        | S–M    | низкий             | сумма дней = Used в шапке                                 |
| W1-7 | **commission: берёт ПЕРВЫЙ % из текста** (address вместо total)             | `lib/commission.ts:20-27`                                                | regex `/(\d+)%/` без приоритета ttl/total | S      | низкий             | «1.25% addcom + 2.5% bkge ttl» → 3.75, не 1.25            |

## Wave 2 — нужны данные / продуктовое решение

| #    | Баг                                                                             | Почему развилка                                                                                                                                              | Что нужно от фаундера                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W2-1 | **Paris MoU флаги неверны** (Panama/Vanuatu и др.) `lib/sanctions/paris-mou.ts` | Это снимок официального списка Paris MoU 2024 — патчить можно только по АВТОРИТЕТНОМУ источнику, иначе ошибёмся в обе стороны. Влияет на fit% и бейджи риска | **РЕШЕНО (2026-06-20):** research + сверка с офиц. Paris MoU 2024 performance list, патч с источником в комментарии. Исполняется при заходе на Wave 2. |
| W2-2 | **commission в demo-mode всегда пусто** `parse-recap` + demo-гидрация           | Фикс = регенерация/сидинг `commissionSummary` в demo-seed.db (прод-данные, дисциплина `--dry`→backup→apply)                                                  | Включать сейчас (затрагивает прод-сид) или отдельной сессией                                                                                           |

## Excluded / Deferred

- **FX EUR→USD 1.08** — отслеживается отдельно (2026-06-19), фаундер чинит сам. ❌ не в скоупе.
- **Спорные латентные мины** (port-da key-mismatch на неиспользуемых портах, WhatsApp-ветки — прод не провижнен, sentinel-scan без триггера, NEEDS_ACTION hours-as-days). Correctness подтверждён, до пользователя не доходит на текущих данных. **Чинить корневым классом, не поштучно:** CI-гейт name→UNLOCODE reconciliation + чеклист two-write-paths. Отдельная сессия.

## Метод исполнения (по orchestrator-day)

1. **Recon** на каждый баг (Sonnet:high, read-only): systematic-debugging Ph1-3 → корень + проверка shared call-sites (баг часто в общем util → симптом в N местах).
2. **План** (Opus:high): synthesis recon → точечный фикс-план.
3. **Implement** (Opus:high, TDD): сначала падающий тест → фикс → зелёный; правки последовательно в одной ветке (без параллельных конфликтов).
4. **Cold-QA** (adversarial): независимый ревьюер пытается сломать дифф перед merge.
5. **VALUE_CHECK** на каждое value-несущее изменение перед DONE; merge/deploy — go фаундера.

Wave 1 идёт сразу. Wave 2 — после ответов фаундера на развилки.

---

## Результат исполнения Wave 1 (2026-06-20)

Конвейер: recon (Sonnet) → TDD-фикс (Opus, последовательно) → adversarial cold-QA →
Round-2 доработка забракованных → ground-truth прогон всех тронутых тестов на HEAD.
Все фиксы на ветке `claude/eager-kapitsa-f082db`. **Финальный прогон: 628 passed, 0 failed**
(затронутые зоны), tsc + eslint зелёные на каждом коммите. Merge/deploy — за фаундером.

| #                         | Статус  | Commit                  | Примечание                                                                       |
| ------------------------- | ------- | ----------------------- | -------------------------------------------------------------------------------- |
| W1-1 compare-routes DA    | ✅ done | `fb36c48e`              | корень бит (resolvePort перед getPortDa); тест ловит баг (revert-проверка)       |
| W1-2 quote dedup match_id | ✅ done | `8b89572a` + `96f1b924` | миграция 054 + дедуп по match_id; имя миграции и lock-тест приведены к конвенции |
| W1-3 Draft Quote item     | ✅ done | `f83f55cc` → `333cfba6` | Round-2: item-aware `getMatchBySlugAndItem` + канонический `cargo.itemIndex`     |
| W1-4 ageInDays demoNow    | ✅ done | `1ed7197a`              | `demoNow()` в server-логике + клиент-бейдже                                      |
| W1-5 laytime валидация    | ✅ done | `f71216a0`              | отрицательный weatherDelayHours → 400 + guard калькулятора                       |
| W1-6 laytime breakdown    | ✅ done | `14fe2b81` → `3aa0a04d` | Round-2: `appliedWeatherDeduction` из снимка + clamp сходится                    |
| W1-7 commission %         | ✅ done | `9bc54215` → `dcf97203` | Round-2: структурные `commissionAddressPct+BrokerPct`, sanity-clamp >15%         |

### Хвосты (follow-up, отдельной сессией — не блок Wave 1)

- **W1-1**: нет fallback на vague-регионы/passthrough неизвестных LOCODE (как detail/list-путь) → для расплывчатых концов DA остаётся 0 (то же направление, что и до фикса, не хуже). Low.
- **W1-3**: код-корень верен, но нет regression-теста на call-site `cargo.itemIndex` в page.tsx (откат аргумента прошёл бы тесты); pre-existing: при одном грузе на несколько судов matchIdForItem берёт первый match, не best-fit. Low.
- **W1-4 sibling**: тот же demo-clock-drift в `app/api/market/benchmark/route.ts:55,84` (TMI/EUA staleness на `Date.now()`). Тот же класс.
- **W1-6 / W1-7**: остаточные edge — render-level guard сильнее contract-теста (W1-6); tier-3 текст-fallback fails-safe в null на contrived-фразах (W1-7). Low.
- **Корневые классы** (из «Спорных» аудита): CI-гейт name→UNLOCODE reconciliation + чеклист two-write-paths закрыли бы латентные мины (port-da, WhatsApp, sentinel-scan) скопом.
