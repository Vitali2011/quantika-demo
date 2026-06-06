# Аудит системы — Часть 3/5: ДВИЖОК МАТЧИНГА

> 2026-06-05. 5 read-only Sonnet-разведчиков (оркестрация / гейты+капы / готовность / скоринг / фрахт+корзины+персист), A→Z + реальные данные БД.
> Ветка `feat/bunker-oilmonster-med-blacksea`. На ней #819 B(b) уже есть (`deb536aa`), B(c) ещё открыт; параллельно PR #829 финализирует.

---

## ГЛАВНЫЙ ВЫВОД (7 тем)

1. **Две системы оценки не согласованы + деньги входят лишь наполовину.** `fit%` (видит брокер, порог доски ≥60) и `score` (бакетирование good/possible/weak) — РАЗНЫЕ формулы → расходятся (fit=82/score=49 или fit=55/score=72). **score вообще не знает про экономику** → убыточный рейс может иметь score=100/good. У fit% есть кап «TCE<0 → потолок 40», НО он считает preFitTce только по Tier-3-оценке, расходящейся с отображаемым TCE → кап срабатывает не там.
2. **ТРИ разных формулы score.** heuristicScore (seed: real-matches+build.ts), computeScoreBreakdown (live-движок), LLM-raw (legacy). Демо-доска показывает SEED-эвристику; живая сессия — движковый score. «Score 82» значит РАЗНОЕ в демо и в live.
3. **Мусор на входе усиливается.** Движок честно ест дефекты парсинга (Часть 2): диапазон веса → верхняя граница (57.5% грузов) → завышает utilisation+classFit+выручку → убыточные выглядят прибыльными; скорость 78% null → readiness на дефолте 12.5kt; **detectSpot ломается на объект-openDate** → спот-суда → idle → демоут из main (свинг 25-35 баллов, тихо), в 3 местах вызова.
4. **Жёсткие гейты пропускают при unknown.** Все гейты «null → pass». Для портов без записи в port-master draft/crane/war-position ВСЕ молча проходят → плохие матчи в неизвестные порты выживают. War-position (#784) требует ВСЕХ 3 условий (HRA + DWT<25k + ≥3 basin-hop) → черноморские HRA-суда на внутри-Med маршрутах проходят.
5. **LLM-сбой (не таймаут) → пустая главная доска.** При ошибке матч-LLM (не timeout) движок возвращает ТОЛЬКО blocked, sweep не запускается → брокер видит 0 матчей. (ai_audit показал, что матч-LLM падал на VPS — реальный риск на кривом деплое. В seed/demo aiScorer пустой → всё sweep → ок.)
6. **Tier-2 Baltic-фрахт устаревший по дизайну.** baltic_indices = 3 static-seed строки от 2026-05-09. Tier-2 срабатывает для большинства пар (когда нет ставки из письма) → фрахт и TCE на 27-дневных данных навсегда. + distanceFactor 0.7 давит короткие черноморские плечи.
7. **live ≠ seed в персисте.** Seed (regenerate): пишет fit%/fit_breakdown, порог fit≥60, но НЕ пишет freight_rate (NULL). Live (compute-matches): пишет freight_rate, но НЕ fit%/fit_breakdown, БЕЗ fit-порога → убыточные матчи попадают на доску. Один матч выглядит по-разному в зависимости от пути.

---

## ПОУЗЛОВОЙ ВЕРДИКТ

| Узел                              | Вход       | Выход        | Цел.        | Главная боль                                                               |
| --------------------------------- | ---------- | ------------ | ----------- | -------------------------------------------------------------------------- |
| **1. Оркестрация** (analyzePairs) | ✅         | ✅ 4 корзины | ⚠️          | LLM-сбой не-timeout → пустая доска (sweep не спасает)                      |
| **2. Гейты + капы**               | ✅         | ✅           | ⚠️          | unknown-порт → все гейты pass; war-position узкий (#784)                   |
| **3. Готовность/тайминг**         | ⚠️ дефолты | ✅           | ⚠️          | detectSpot ломается на объект → спот→idle→демоут; 78% на дефолт-скорости   |
| **4. Скоринг** (fit%+score)       | ✅         | ✅           | ❌ несвязно | 2 формулы не согласованы; score без экономики → убыток=good                |
| **5. Фрахт+корзины+персист**      | ✅         | ✅           | ⚠️          | Tier-2 stale; live без fit-порога → убыток на доске; seed без freight_rate |

---

## 1. ОРКЕСТРАЦИЯ — `analyzePairs` (pair-analyzer.ts)

**26-шаговый конвейер:** O(n²) пары → per-pair (readiness + 14 hard-filters + IMSBC + laycan-validity + sanctions) → blocked-партиция → LLM-скор (aiScorer) → enrich → sweep (синтет. score=25 для не-возвращённых LLM пар) → readiness-scoring → score-sync → ballast/size-cap → blocked-dedup → confidence+fit+hold-cleanliness → sort → realism-партиция (main/lowConf/insuf) → **economics ПОСЛЕ партиции (display-only)**.
**3 вызывающих:** compute-matches (live LLM, пишет только main), /api/ai/match (live LLM, все корзины в сессию), regenerate-matches (seed, **пустой aiScorer → всё sweep**).

**Проблемы:** LLM non-timeout fail → `{matches:[],…blockedMatches}` без sweep → пустой main (`pair-analyzer.ts:364`); sweep score=25 произвольный; `cargo_item_index ?? 0` при пропуске LLM → cross-item; compute-matches игнорит lowConf/insuf (нет review/insuf-вкладок без ручного «Run Matching»); economics только для main → review-матчи без TCE.

## 2. ГЕЙТЫ + КАПЫ

**14 hard-filters** (`match-filters.ts`): draft(load+disch), crane(load+disch), volume, weight/DWCC, type-matrix, IMSBC, + Layer-B: age, dimensions, gear, voyage-restriction, flag/class, **war-position**. Правило везде: **null → pass (консервативно)**.
**Санкции:** RU/IR-флаг на EU/UK/US-порт → HIGH blocking; BY/CU/MM → MEDIUM warning. EU-age-кап (age≥25 + EU-разгрузка → fit-потолок 55) — ТОЛЬКО в fit-breakdown, не в score.
**Капы:** ballast>радиус класса → good→possible(69); deadfreight<50% → demote; DWCC-overload → score≤35 weak; idle>21д → lowConf; vague-region −20; **TCE<0 → fit-потолок 40**.

**Проблемы:**
| Проблема | Статус | Файл | Impact |
|---|---|---|---|
| unknown-порт → draft/crane/war-position ВСЕ pass | confirmed | `port-master.ts:94`, `match-filters.ts:55` | плохие матчи в немапленные порты выживают молча |
| war-position требует ВСЕХ 3 условий (HRA+DWT<25k+≥3 hops) — #784 частично | confirmed | `match-filters.ts:409` | черноморские HRA-суда на внутри-Med проходят |
| volume/weight по верхней границе диапазона (из парсинга, 57.5%) | confirmed | `cargo-weight.ts:16` | ложный reject при завышенном max |
| IMSBC Group B блокирует только при явном «no DG» в судне | confirmed | `imsbc-check.ts:318` | опасный груз проходит как caution |
| basinHopCount=null при немапленном порту → war-position pass | confirmed | `match-filters.ts:401` | HRA-судно в неизвестный порт не блокируется |
| voyage-gate vs sanctions непоследовательны на CF-объектах restrictions | confirmed | `voyage-restriction.ts:123` | voyage-restricted судно проходит если restrictions = объекты |

## 3. ГОТОВНОСТЬ / ТАЙМИНГ — `readiness-gap.ts`

**Вердикт (non-spot):** late<−1д / tight[−1,0.5) / ideal[0.5,5] / idle>5. **spot:** ideal до 30д (SPOT_IDEAL_MAX_GAP=30), idle>30. **unknown** при null openDate/laycan/distance. Bucketing: late→blocked, idle&gap>21→lowConf, unknown→insuf.
**Баллист:** `distanceNm/(speed×24)`, скорость = parseSpeedKnots(speedLaden) ?? дефолт класса (handysize 12.5).

**Проблемы:**
| Проблема | Статус | Файл | Impact |
|---|---|---|---|
| **detectSpot(объект-openDate) → false** (typeof≠string) в 3 местах | confirmed | `readiness-gap.ts:101` + `pair-analyzer.ts:96`, `persist:81`, `regenerate:156` | спот-судно → non-spot → idle вместо ideal → score −15..−25 вместо +10, демоут; тихо, без теста |
| скорость 78% null → дефолт 12.5kt у ~78% пар | confirmed | `readiness-gap.ts:194` | gapDays ±30%, пары пересекают ideal/tight/idle |
| DWT-дыра 35-50k → handysize (12.5kt + радиус 1500nm) | confirmed | `readiness-gap.ts:93` | ultramax считается медленнее + раньше ballast-кап |
| year-less даты + refYear — нет rollover (дек→янв) | confirmed | `date-parsing.ts` | январский laycan при декабре → late (неверно) |
| unknown — нет агрегированной диагностики брокеру | suspected | `pair-analyzer.ts:730` | insuf-корзина растёт без объяснения «почему» |

## 4. СКОРИНГ — fit% + score (ДВЕ СИСТЕМЫ)

**fit% (9 факторов, видит брокер):** utilisation 23 · timing 18 · ballast 18 · classFit 11 · cargoType 7 · cranes 7 · volume 4 · draft 3 · vetting 9. Дефолт missing = ×0.60 (не штраф). Капы: late≤38, util<40%≤54, ballast>2×≤54, EU-age≤55, **TCE<0≤40**.
**score (6 компонентов, бакетирует):** гео 20 · тип 20 · краны 15 · объём 15 · laycan 20 · DWT 10, ×confidence(1.0/0.7/0.4) ±readiness(+10/−15..−35)/sanctions(−10)/vague(−20). matchLevel: ≥70 good / ≥40 possible / <40 weak.

**Расхождение (вычислено):** vague+good-util → fit=82/score=49; убыток (TCE<0) → fit=40/score=100. score и fit% мерят РАЗНОЕ, не сверяются.

**Проблемы:**
| Проблема | Статус | Файл | Impact |
|---|---|---|---|
| 2 системы без reconciliation: good-bucket прячется (fit<60), possible с зелёным бейджем | confirmed | `pair-analyzer.ts:524,693` | брокер и движок не согласны что «хорошо» |
| **score без экономики** → убыток=score 100/good | confirmed | `match-scoring.ts:459` | loss-makers в good-корзине без флага в score |
| preFitTce (Tier-3 only) ≠ отображаемый TCE (полный waterfall) | confirmed | `pair-analyzer.ts:688` vs `:747` | TCE<0-кап срабатывает не там (капает прибыльные / пропускает убыточные) |
| вес по верхней границе раздувает util+classFit+выручку | confirmed | `cargo-weight.ts:10` | убыточные выглядят прибыльными |
| **3 формулы score** (heuristic/breakdown/LLM) | confirmed | `real-matches.ts:109`,`build.ts:734`,`match-scoring.ts:459` | «score 82» в демо ≠ в live |
| CII 100% null → vetting всегда unknown (5.4/9) | confirmed | `vessel-vetting.ts:100` | ветинг слепой (но дельта мала ~3.6pt) |
| fit% confidence плоский 0.60, score — 0.4/0.7/1.0 | confirmed | `fit-breakdown.ts:69` | uncertain-поля штрафуются сильнее в score |

## 5. ФРАХТ + ЭКОНОМИКА + КОРЗИНЫ + ПЕРСИСТ

**Freight resolver (4 яруса):** Tier0 ручной → Tier1 из письма → Tier2 Baltic `(день-рейт×(laden×2+2))/тонны` → Tier3 оценка `base×distanceFactor×dwtFactor`. Tier-2 RT-деноминатор пофикшен #824. На практике Tier-2 срабатывает для большинства (нет ставки в письме) на **3 static-seed строках 2026-05-09**.
**Economics-впайка:** ПОСЛЕ партиции, только main; дефолты bunker $600/расход 25/скорость 12/судно $22M; qty fallback dwt×0.65; duration round-trip или 10д при distance=0.
**Бакеты:** main(user_id NULL, fit≥60) / review(`__demo_review__`) / insuf(`__demo_insufficient__`). **fit-порог ТОЛЬКО в seed-пути**, live без порога.
**Dedup:** pass1 email-пара (highest fit), pass2 content-key (vesselName|cargoDesc|loadPort|laycanStart, disch исключён).
**Персист 3 пути:** compute (live, main, +freight_rate −fit%), persist-session (all, +fit% +freight_rate, #826 убрал storedTce-override), regenerate (seed 3 корзины, +fit% −freight_rate=NULL, tce из buildMatchEconomics).

**Проблемы:**
| Проблема | Статус | Файл | Impact |
|---|---|---|---|
| Tier-2 Baltic всегда stale (2026-05-09) | confirmed | `migration 043` + DB | TCE на 27-дневных данных навсегда |
| seed: freight_rate_usd_per_mt = NULL | confirmed | `regenerate-matches.ts:428` | у демо-матчей нет ставки фрахта в UI |
| session-buckets B(c) storedTce-override (открыт) | confirmed | `session-buckets.ts:64` | display-bucket cards предпочитают seed-TCE |
| live compute: fit%/fit_breakdown = NULL + нет fit-порога | confirmed | `compute-matches.ts:104` | убыточные/low-fit матчи на доске без fit%-бара |
| negative-TCE матчи пишутся в main (live) | confirmed | `compute-matches.ts` | брокер видит убыточные в live-сессии |
| stale-комментарий в hydrate-demo-session (#826 убрал override) | confirmed | `hydrate-demo-session.ts:123` | вводит в заблуждение |

---

## РЕАЛЬНЫЕ БАГИ vs ПО-ДИЗАЙНУ

**По дизайну (но спорно):** economics-после-партиции (display-only) — намеренно, НО это корень «убыток на доске»; sweep score 25; unknown→pass гейты.

**Реальные баги (приоритет):**

1. **score не ранжирует по деньгам; fit%-кап дырявый** (C3, Wave C3 запланирован не влит) — главный. Убыток=good. M.
2. **detectSpot объект-openDate** (3 места) — спот-суда тихо демоутятся. S. (пересекается с Частью 2.)
3. **LLM-сбой → пустая доска** (нет fallback на sweep). M.
4. **live-путь без fit-порога + NULL fit-колонки** — убыток на доске, нет fit%-бара. S-M.
5. **unknown-порт → гейты pass** — плохие матчи в немапленные порты. S-M (упирается в port-master coverage, Часть 1).
6. **war-position узкий** (#784) — черноморские HRA на внутри-Med. S.
7. **35-50k DWT → handysize** — не та скорость+радиус. S.
8. **3 формулы score (демо≠live)** + 2 несогласованные системы — архитектура. L.
9. **Tier-2 Baltic stale** — фрахт на seed (пересекается с Частью 1 market).

**Связка серии:** источники(дыры) → парсинг(дефекты+shape-баги) → **движок(честно усиливает их + своя несогласованность скоринга)**. #819 (в работе) чинит ОДИН симптом (list==detail), но глубже: движок не ранжирует по деньгам, входы = дефолты/завышены. «Почини формулу TCE» ≠ «матчи стали умнее».
