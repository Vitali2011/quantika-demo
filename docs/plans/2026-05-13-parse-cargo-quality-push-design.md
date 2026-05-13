# parse-cargo Quality Push — Design

**Date:** 2026-05-13
**Status:** approved (brainstorm complete, RAG inserted as Phase 2 per user request)
**Author:** brainstorm session, Sonnet 4.6
**Target branches:** five sequential PRs (one per phase)

---

## 1. Problem statement

После R17 у parse-cargo eval median = **81/95 semantic** при дисперсии ±8 баллов
между прогонами на одном коде. Цель пользователя — продакшен-качество
**стремящееся к 100%** на любых брокерских письмах (не только на текущем корпусе).

Главные блокеры:

- **Variance ±8 баллов** — невозможно увидеть реальный сигнал улучшения, любой
  +3 теряется в шуме Gemini drift'а.
- **Нет sampling-controls** — текущий `callAiText` использует дефолтную
  температуру Gemini (~1.0). Для extraction-задачи это абсурдно: extraction
  имеет один правильный ответ, нужна greedy decoding.
- **Single-model lock** — все 95 писем проходят через Gemini 2.5 Pro. Не
  сравнивали с альтернативами (Bedrock Sonnet 4.6, Gemini DeepThink).
- **Корпус-датчик стал целью** — 95 писем это маленькая выборка. Мы не знаем
  как парсер ведёт себя на новых типах писем.

---

## 2. Strategic principles

### 2.1 Robust production, не corpus overfit

Корпус (95 писем) — **датчик**, не цель. Если делать "если письмо упоминает
'TBS' → return X" — корпус посветлеет, но прод сломается на новых данных.

**Anti-overfit guard:** перед каждой фазой фиксируем гипотезу _какие_
сценарии должны улучшиться. После прогона проверяем — улучшилось именно
прогнозированное, или случайные другие. Если случайные — шум, не фикс.

### 2.2 Variance reduction first, accuracy second

Без снижения шума мы не можем измерять улучшения. Phase 1 (sampling foundation)
должна сначала сузить variance band с ±8 до ±2-3, и только потом имеет смысл
охотиться за +3-5 баллов через model switch или self-consistency.

### 2.3 Measurable gates

Каждая фаза = отдельный PR + 3 верификационных прогона + judge. Если median
не вырос ≥3 баллов после фазы — гипотеза не подтвердилась, откатываем или
дебажим. Не наслаиваем фазы вслепую.

### 2.4 Phased over big-bet

Четыре маленьких PR вместо одного огромного. После каждой фазы — пауза,
анализ результатов, корректировка плана. Снижает риск катастрофического
регресса.

---

## 3. Phase 1 — Sampling Foundation

**Cost:** $0 (prompt/code changes only)
**Effort:** 1 день
**Hypothesis:** median 81 → 84-86 (+3-5), variance ±8 → ±2-3

### 3.1 Changes

| Change                                   | Where                                      | Why                                                           |
| ---------------------------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| `temperature: 0` для PARSE_CARGO scope   | `lib/ai-provider.ts`                       | Greedy decoding для extraction-задачи                         |
| `seed: 42` (Vertex AI Gemini)            | `lib/ai-provider.ts`                       | Воспроизводимость в одинаковых условиях                       |
| Pin Gemini version: `gemini-2.5-pro-002` | `.env.local` `AI_MODEL_GEMINI_PARSE_CARGO` | Защита от silent updates от Google                            |
| 3-5 few-shot examples в prompt           | `lib/prompts/parse-cargo.ts`               | Обобщённые edge cases — vessel guard, alts, rotation, POC/TBS |

### 3.2 Few-shot example principles

- **Не из корпуса** — берём reformulated patterns из внешних broker mailing-list
  samples (Niavigrains, ETMS, Marelis в `.progonq/corpus/raw/`).
- **Покрывают классы, не конкретные сценарии** — vessel circular pattern,
  multi-port alternatives pattern, rotation pattern.
- **Короткие** — 3-5 строк email + 3-5 строк JSON. Не раздуваем prompt вдвое.

### 3.3 Risks

- **temperature=0 может ухудшить креативность** на ambiguous emails.
  Mitigation: измеряем; если регресс — fallback на temperature=0.1.
- **Seed support** в Vertex AI Gemini: проверить документацию перед PR.

### 3.4 Gate

3 верификационных прогона на R17 корпусе. Если median <84 — гипотеза не
работает; debug или skip.

---

## 4. Phase 2 — RAG-Augmented Few-Shot (NEW — было Phase 2.5)

**Cost:** code only + ~$5 на 3 прогона (embeddings уже proindexedованы)
**Effort:** 2-3 дня
**Hypothesis:** +5-15 баллов через dynamic few-shot retrieval из corpus

### 4.1 Концепция

Вместо статических 4 few-shot примеров из Phase 1, для каждого нового
письма делаем retrieve топ-K похожих писем из corpus и подставляем их

- их правильные ответы в prompt динамически.

**Преимущество:** парсер видит конкретный pattern, не общий. MOLOO email →
retrieve MOLOO example → видит "вот так выглядит и вот правильный ответ".

### 4.2 Infrastructure reuse

quantika-demo уже имеет RAG-стек (Phase 2 RAG live 2026-05-09):

- sqlite-vec extension для cosine k-NN
- FTS5 для hybrid (lexical + semantic)
- embed batching pipeline (76K chars/batch)
- UNLOCODE индекс готов (для нормализации портов)

Переиспользуем для parse-cargo corpus как нового индекса.

### 4.3 Algorithm

1. **Index parse-cargo corpus** (95 scenarios):
   - Document = email subject + body
   - Metadata = scenario_id, category, reference_output
   - Embed через тот же model что используется в Phase 2 RAG

2. **Retrieve at parse time:**
   - Embed incoming email body
   - k-NN search → топ-3 similar scenarios
   - Threshold: similarity ≥ 0.6 (если ниже — fallback на статические few-shot)

3. **Inject into prompt:**
   - "=== RETRIEVED SIMILAR EXAMPLES ===" section before main task
   - Each retrieved example: email body + reference_output как ground truth
   - Promt size growth: ~1500 tokens (3 examples × ~500)

4. **Leave-one-out evaluation:**
   - Для каждого scenario i: index содержит 94 других, parse i, score
   - Это fair — никогда не retrieve'аем сам себя
   - Стандарт для small-corpus RAG eval

### 4.4 Holdout strategy для prod-honesty

Хотя для R-rounds используем leave-one-out, нужно проверить **out-of-distribution**
performance:

- Берём 20% scenarios (19 emails) — НЕ индексируем
- Запускаем парсер с RAG (индекс = 76 emails) на эти 19
- Сравниваем с парсером без RAG на тех же 19
- Если RAG winner на holdout — реальный win, не overfit

### 4.5 Anti-overfit guards

- **Similarity threshold 0.6:** если нет похожих → не подсовываем examples
- **Retrieved examples ≠ exact match:** explicit instruction в prompt
  "These are SIMILAR not IDENTICAL — apply same logic, not copy answer"
- **Holdout always-fresh:** 20% scenarios никогда не в индексе

### 4.6 Risks

- **Retrieval returns wrong-class examples** (e.g. vessel circular retrieves
  cargo email) → парсер сбивается. Mitigation: классифицировать корпус
  предварительно, retrieve within class.
- **Embedding model bias:** maritime jargon (POC, TBN, MOLOO) может плохо
  embed'иться generic models. Mitigation: проверить retrieval quality
  вручную на 5 sample queries; если плохо — fine-tune или сменить embedder.
- **Latency:** +200-500ms на retrieval. В проде critical для UI; для batch
  parse-cargo не critical.

### 4.7 Gate

3 verification рaунда + holdout test:

- Leave-one-out median должен вырасти ≥5 vs Phase 1 baseline
- Holdout (20% out-of-index) должен показать тот же или близкий gain
- Если holdout показывает регресс vs Phase 1 → это overfit, фаза откатывается

---

## 5. Phase 3 — Model Exploration

**Cost:** ~$50-60 на 3 прогона × 3 модели
**Effort:** 2-3 дня
**Hypothesis:** +5-8 баллов если Sonnet 4.6 или DeepThink выигрывают

### 4.1 Comparison setup

| Model                                      | Provider    | Cost (per parse)                  |
| ------------------------------------------ | ----------- | --------------------------------- |
| A: Gemini 2.5 Pro (baseline after Phase 1) | Vertex AI   | $0.005                            |
| B: Bedrock Sonnet 4.6                      | AWS Bedrock | $0.003-0.004                      |
| C: Gemini 2.5 Pro DeepThink                | Vertex AI   | $0.010-0.015 (extended reasoning) |

**Same prompt, same temperature=0, same seed.** Меняется только провайдер.

### 4.2 Decision matrix

| Metric                  | Weight | How measured                                           |
| ----------------------- | ------ | ------------------------------------------------------ |
| Semantic median (3-run) | 50%    | Bedrock Opus 4.7 judge                                 |
| Variance band           | 20%    | max-min between runs                                   |
| Per-class accuracy      | 15%    | breakdown by category (multi-port, vessel guard, etc.) |
| Cost per parse          | 10%    | tokens × pricing                                       |
| Latency p95             | 5%     | from run-parse-cargo telemetry                         |

**Switch criterion:** challenger выигрывает ≥3 баллов по medianу при той же
или лучшей variance.

### 4.3 Bedrock Sonnet 4.6 — almost-free integration

Bedrock adapter уже работает в `lib/ai-provider.ts` (используется судьёй).
Switch требует только:

- Новый env var `AI_MODEL_BEDROCK_PARSE_CARGO=anthropic.claude-sonnet-4-6-20260101`
- Изменение `PARSE_CARGO_PROVIDER=bedrock` в `.env.local`

### 4.4 Risks

- **DeepThink доступность** — нужно проверить в Vertex AI region. Mitigation:
  если недоступен — фаза идёт с 2 моделями (A vs B), не 3.
- **Sonnet 4.6 prompt drift** — наш prompt оптимизирован под Gemini. Для
  справедливого сравнения может понадобиться лёгкая адаптация (system vs user
  role split, JSON delimiter conventions). Mitigation: запускаем raw prompt
  на обе модели; если Sonnet проваливается из-за формата — single-day prompt
  adapter работа.

### 4.5 Gate

Если challenger не выиграл ≥3 балла — остаёмся на текущем Gemini, фаза
архивируется как "explored, no switch needed".

---

## 6. Phase 4 — Self-Consistency Voting

**Cost:** 3× inference per email (~$50/прогон на R17, в проде × volume)
**Effort:** 1 день код
**Hypothesis:** +2-4 балла к median, ±2-3 → ±1 variance, закрытие flaky

### 5.1 Algorithm

1. **Sample N=3 раза с temperature=0.3** (не 0, чтобы дать разнообразие
   для голосования; не 1.0, чтобы не разбегались).
2. **Majority vote на уровне item-fields:**
   - Для каждого поля берём ответ встречающийся ≥2 раз из 3.
   - Если все 3 расходятся → выбираем из прогона с highest summed confidence;
     при равенстве — первый по индексу (deterministic tiebreaker).
3. **Items-count voting:** если 2/3 прогонов вернули 1 item, 1/3 вернул 2 —
   берём 1 item. Закрывает vessel-guard hesitation.
4. **Confidence recalibration:**
   - 3/3 agree → "confirmed"
   - 2/3 agree → "interpreted"
   - 1/1/1 split → "uncertain"

### 5.2 Free-text fields handling

`special_requirements`, `missing_info` — текстовые поля где voting не работает
впрямую (3 разных формулировки).

**Heuristic:** берём ответ из прогона который согласен с majority в structured
полях (origin_port, destination_port). Если такого нет — берём самый длинный
(больше информации).

### 5.3 Implementation

Обёртка `callAiTextConsistent(scope, ..., N=3)` поверх существующего
`callAiText`. Логика голосования в новом модуле
`lib/extractors/consistency-vote.ts`. Тесты на synthetic выходы.

### 5.4 Production benefit (bonus)

Confidence-уровни становятся реально полезными в UI: поля с "uncertain" =
красный значок "проверь вручную". Это **операционная ценность независимая
от eval score**.

### 5.5 Gate

Если median не вырос ≥2 — фаза не работает (Phase 2 могла уже закрыть
flaky). Откатываем; вес идёт в Phase 4.

---

## 7. Phase 5 — Data Engineering + Continuous Eval

**Cost:** ~30 человеко-часов + $10/неделю cron
**Effort:** 1-2 недели
**Hypothesis:** +5-8 баллов через annotation cleanup; main win — robustness
к новым письмам и model updates

### 6.1 Corpus audit (1 неделя)

Пройти все 95 сценариев. Для каждого ответить:

- Эталон корректен? (типичные косяки: устаревший формат, пропущенные поля,
  аннотаторский комментарий в value).
- Какой класс ошибок (A/B/C/D/E/F)?
- Есть ли неразрешимая ambiguity?

Результат: clean baseline + audit-таблица в `.progonq/audit/2026-05-corpus-audit.md`.

### 6.2 Adversarial expansion (+50 scenarios)

Источник: Gmail-папка чартеринг (ETMS, Niavigrains, Marelis, и т.д.).

Распределение:

- 15× hedged language ("around 5000mt", "approx Mar 10/15", "subj to stem")
- 10× exotic abbreviations (POC, POL, TBN, MOLOO, MOLOSP, WSP, COA)
- 10× multi-offer (3-5 cargos в одном письме)
- 10× vessel position circulars
- 5× tricky edge cases (mojibake, forwarded chains, unclear addressee)

**Annotation workflow:**

1. Первичная аннотация через Sonnet 4.6 (approximate truth).
2. Ручная корректировка спорных кейсов (operator review).
3. Validation: запускаем парсер на новых сценариях, смотрим что неmatches —
   тоже спорные.

### 6.3 Continuous eval cron (1 день код)

Раз в неделю автоматический прогон на VPS:

```
0 3 * * 1 cd /root/quantika-demo && npx tsx scripts/progonq/run-parse-cargo.ts \
  --round Rweekly-$(date +%Y%m%d) && \
  npx tsx scripts/progonq/judge-parse-cargo.ts ...
```

Результаты в JSON в git (commit weekly). Если median упал >5 баллов от
прошлой недели → Telegram alert через bot.

### 6.4 Per-class regression tests

После Phase 1-3 у нас будет per-class accuracy breakdown. Для каждого
устойчивого класса pin **минимум 5 сценариев** как regression tests в
`__tests__/parse-cargo/regression.test.ts`. Failing test → CI red, даже
если общий median ок.

Классы:

- vessel_position (5 scenarios)
- multi_offer (5)
- hedged_language (5)
- single_cargo (5)
- multi_port_alternatives (5)
- multi_port_rotation (5)

### 6.5 Gate

Через 4 недели после старта Phase 4 — проверяем что weekly median держится
в коридоре ±2 балла. Если волатильность высокая → Phase 2/3 не закрепились;
revisit.

---

## 8. Expected outcomes

| Phase                         | Cost          | Effort | Expected delta                          | Cumulative semantic median |
| ----------------------------- | ------------- | ------ | --------------------------------------- | -------------------------- |
| Baseline (post-R17)           | —             | —      | —                                       | 81                         |
| Phase 1 — Sampling            | $0            | 1d     | +3-5                                    | 84-86                      |
| **Phase 2 — RAG few-shot** ⭐ | code + $5     | 2-3d   | **+5-15**                               | **89-99**                  |
| Phase 3 — Models              | $50           | 3d     | +0-5 (diminishing return after RAG)     | 89-100+                    |
| Phase 4 — Self-consistency    | code + 3× ops | 1d     | +1-3                                    | 90-100+                    |
| Phase 5 — Data engineering    | 30 чел-ч      | 2w     | +3-5 (annotation cleanup + corpus exp.) | 93-100+                    |

**Honest range:** 91-95 median semantic после всех фаз. 100% — асимптотическая
цель; реалистичный таргет для production = 95+ при variance ±1-2.

**Why RAG поднят в Phase 2:**

1. Максимальный ожидаемый gain (+5-15) среди всех фаз
2. Инфраструктура уже есть (sqlite-vec + FTS5 + embed pipeline live с 2026-05-09)
3. После RAG потенциал Phase 3/4 снижается — diminishing returns
4. Если RAG закроет gap (89-99) → Phase 3/4 можно skip или сделать с меньшим scope

---

## 9. Risks & Mitigations

| Risk                                                     | Impact | Mitigation                                                                              |
| -------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| Phase 1 temperature=0 ломает creative interpretation     | Medium | Measure; fallback на 0.1                                                                |
| Seed parameter не поддерживается в Vertex AI             | Low    | Skip seed, оставляем temperature=0                                                      |
| Phase 2 Sonnet 4.6 prompt drift                          | Medium | Адаптируем prompt если raw результаты плохие                                            |
| Phase 3 majority vote на free-text не работает           | Low    | Heuristic для text fields (longest answer)                                              |
| Phase 4 annotation cleanup открывает новые baseline reds | Low    | Это feature, не bug — мы видим реальные провалы                                         |
| Cron breaks без alert system                             | Medium | Telegram bot + dead-man-switch (если weekly run не сделан 48ч → alert)                  |
| Все 4 фазы не дают целевые 91-95                         | High   | Reassess strategy; возможно нужен two-stage pipeline (classifier→extractor) как Phase 5 |

---

## 10. Out of scope

- **Two-stage pipeline (classifier → extractor).** Big-bet restructure;
  держим как Phase 5 backup если Phase 1-4 не дотягивают.
- **Real-time eval в проде (вместо batch corpus).** Будущая работа.
- **Multi-language support** (текущий корпус только English).
- **OCR для attached PDF** — отдельная задача.

---

## 11. Decisions log

- **D1:** Cup goal = robust production quality, не corpus 100%.
- **D2:** Phased over big-bet — 4 PR в sequence с гейтами.
- **D3:** Phase 1 first because variance reduction is prerequisite для
  измерения accuracy gains.
- **D4:** Bedrock Sonnet 4.6 вместо Opus 4.7 для Phase 2 (5× дешевле,
  обычно сопоставим для structured extraction).
- **D5:** Self-consistency N=3 (не 5) — баланс cost/benefit.
- **D6:** Few-shot examples из external broker mail (не из корпуса) для
  избежания overfit'а.
- **D7:** Continuous eval weekly (не daily) — экономия + достаточная
  частота для catch'а drift'а.
- **D8:** RAG-augmented few-shot поднят в Phase 2 (был Phase 2.5) по запросу
  пользователя 2026-05-13. Reason: максимальный ожидаемый gain (+5-15),
  инфраструктура уже есть, после RAG диминирующий return на Phase 3/4 —
  если gap закроется, последующие фазы можно skip.

---

## 12. Next step

После merge'а этого design doc → invoke `superpowers:writing-plans` skill
для создания implementation plan с task-by-task breakdown каждой фазы.
