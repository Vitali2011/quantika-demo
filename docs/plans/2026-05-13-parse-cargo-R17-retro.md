# parse-cargo R17 Retro

**Date:** 2026-05-13  
**Branch:** feat/parse-cargo-semi-stable-r17  
**PR:** TBD (pending R17d/e/f completion)

## Context

После merge Phase 1 (PR #126), Phase 2 (PR #130, multi-port schema),
Phase 3 (PR #131, EXTRACT-ALL-OFFERS) — 6 semi-stable scenarios оставались
нестабильными. Задача R17: установить честный 3-run baseline, починить
стабильные 3/3 reds, задокументировать Gemini-drift как новую норму.

**VPS isolation:** `/root/qd-r17` (detached worktree, не трогает production
`/root/quantika-demo`)

---

## Baseline runs (до фиксов)

| Round      | String    | Semantic  | Notes                   |
| ---------- | --------- | --------- | ----------------------- |
| R17a       | 65/95     | 74/95     | baseline post-Phase 2/3 |
| R17b       | 72/95     | 80/95     | variance check          |
| R17c       | 68/95     | 82/95     | variance check          |
| **Median** | **68/95** | **80/95** | честный baseline        |

**Variance:** ±7 string, ±8 semantic. Это норма для Gemini 2.5 Pro без version pin.

---

## Scenario classifications

| Scenario | Category        | 3-run pattern | Class      | Action                          |
| -------- | --------------- | ------------- | ---------- | ------------------------------- |
| 006      | single_cargo    | red 3/3       | A (corpus) | dest_port_alternatives добавлен |
| 035      | forwarded       | red 3/3       | A (corpus) | dest_port null→Port of Call     |
| 056      | multi_offer     | partial 3/3   | E (judge)  | ARA range alias добавлен        |
| 058      | vessel_position | red 3/3       | B (prompt) | LINE UP DWCC guard добавлен     |
| 079      | hedged_language | red 3/3       | A (corpus) | origin_port cleaned             |
| 087      | forwarded       | red 3/3       | A (corpus) | origin_port vessel dims убраны  |
| 088      | hedged_language | red 3/3       | A (corpus) | dest TBS + alternatives array   |
| 089      | MOLOO           | 0/1/0         | F (drift)  | Accept, не фиксить              |
| 095      | multi_port      | 0/1/0         | F (drift)  | Accept, не фиксить              |

### Class breakdown

| Class | Description                                          | Count |
| ----- | ---------------------------------------------------- | ----- |
| A     | Corpus re-annotation (incorrect/incomplete ref)      | 5     |
| B     | Prompt gap (edge case not covered)                   | 1     |
| E     | Judge false negative (semantic equiv not recognized) | 1     |
| F     | Drift (LLM variance, not a bug)                      | 2     |

---

## Fixes applied

### Class A — Corpus re-annotations

**scenario-087** (origin_port embeds vessel dims):

- Before: `"North Brazil (unspecified port, max LOA 190m, max draft 11.5m)"`
- After: `"North Brazil port (unspecified)"`
- Reason: vessel dims уже в `special_requirements`, не в port name

**scenario-088** (destination_port flat string instead of TBS + alternatives):

- Before: `"TBS / Marmara range / Izmir range / Mersin range"` (flat)
- After: `"TBS (to be specified)"` + `destination_port_alternatives: [...]`
- Reason: Phase 2 schema ожидает структурированный формат

**scenario-006** (missing destination_port_alternatives):

- Added: `destination_port_alternatives: ["Chornomorsk"]`
- Reason: email явно: "Odesa or Chornomorsk chopt" — alternatives не были аннотированы в Phase 2 wave

**scenario-035** (destination_port null вместо POC):

- Before: `null` для обоих items
- After: `"Port of Call (unspecified)"` + `source_text: "POC"`
- Reason: POC = Port of Call — это конкретная интерпретация, не null

**scenario-079** (origin_port.value с аннотаторской заметкой):

- Before: `"Constanta or POC (Port of Constanta / Port of Croatia — ambiguous; likely...)"`
- After: `"Constanta"` + `origin_port_alternatives: ["Port of Call (unspecified)"]`
- Reason: аннотаторские комментарии не должны попадать в value field

### Class B — Prompt fix

**scenario-058** (LINE UP DWCC без named cargo не тригерил vessel guard):

- Added pattern (4) to VESSEL POSITION GUARD:
  `"line up [tonnage] DWCC" without named commodity = vessel request`
- Email: "Please line up 8500/10000 dwcc, 14/16 May Onw at East Mediterranean"

### Class E — Judge rubric

**scenario-056** (ARA range не распознавался как Amsterdam/Rotterdam/Antwerp):

- Added alias: `"ARA" = "ARA range" = "Amsterdam/Rotterdam/Antwerp range" = "ARA ports"`

---

## Post-fix runs

| Round      | String    | Semantic  | Notes          |
| ---------- | --------- | --------- | -------------- |
| R17d       | 77/95     | 81/95     | post-fix run 1 |
| R17e       | 72/95     | 76/95     | post-fix run 2 |
| R17f       | 74/95     | 81/95     | post-fix run 3 |
| **Median** | **74/95** | **81/95** | final baseline |

**Delta vs baseline median:** string +6, semantic +1.

**Target review:** Заявленный диапазон 87-91 semantic не достигнут (получили 81).
Причина: judge уже принимал старые corpus phrasings как семантически эквивалентные,
поэтому Class A fixes улучшили только string match. Реальный win — string +6 и
4 stable fixes scenarios теперь green.

## Per-scenario fix results

| Scenario | Pre (3/3)       | Post (3/3)      | Verdict                                                                      |
| -------- | --------------- | --------------- | ---------------------------------------------------------------------------- |
| 006      | 0.0 / 0.0 / 0.0 | 1.0 / 1.0 / 1.0 | ✅ FIXED (Class A)                                                           |
| 035      | 0.0 / 0.0 / 0.0 | 1.0 / 1.0 / 1.0 | ✅ FIXED (Class A)                                                           |
| 079      | 0.0 / 0.0 / 0.0 | 1.0 / 1.0 / 1.0 | ✅ FIXED (Class A)                                                           |
| 087      | 0.0 / 0.0 / 0.0 | 1.0 / 1.0 / 1.0 | ✅ FIXED (Class A)                                                           |
| 058      | 0.0 / 0.0 / 0.0 | 1.0 / 0.0 / 1.0 | ⚠️ FLAKY 2/3 (Class B partial — model drift)                                 |
| 056      | 0.5 / 0.5 / 0.5 | 0.5 / 0.5 / 0.5 | ❌ String unchanged (Class E judge only — affects semantic)                  |
| 088      | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | ❌ Reclassified as Class F (Gemini drift — model output format inconsistent) |

**Summary:** 4 stable string fixes + 1 flaky + 1 semantic-only fix + 1 reclassified as drift.

---

## Accepted variance (Class F)

**089** — MOLOO tonnage parsing:

- Pattern: 0 → 1 → 0 по R17a/b/c
- Root cause: Gemini нестабильно интерпретирует MOLOO (More or Less at Owner's Option) numbers
- Decision: accept. Fix требовал бы жёсткой фиксации tonnage interpretation logic — overfit риск.

**095** — Multi-port re-annotation (Phase 2):

- Pattern: 0 → 1 → 0 по R17a/b/c
- Root cause: после Phase 2 re-annotation модель иногда возвращает 0 items
- Decision: accept. Нестабильность в самой модели, не в prompt/corpus.

**088** — Reclassified to Class F post-fix:

- Corpus was correctly updated to Phase 2 schema (TBS + alts array)
- Model output format unstable между сессиями: иногда split format (TBS + alts),
  иногда flat string ("TBS / Marmara range / Izmir range / Mersin range")
- В R17a/b/c модель давала split → corpus с flat string fail'ил
- В R17d/e/f модель даёт flat → corpus со split fail'ит
- Decision: accept as drift. Real fix = prompt enforcement of split format
  (out-of-scope для R17).

---

## Lessons learned

1. **Gemini без version pin = лотерея.** ±8 semantic баллов между прогонами — слишком много для уверенного "A > B" сравнения. 3-run median — минимальный стандарт.

2. **Corpus annotation debt накапливается.** Phase 2 добавила multi-port schema но не прошла все 95 сценариев с новым форматом. 5 сценариев (Class A) были неверно аннотированы — каждый требовал ручного анализа.

3. **Раннер sequential, не parallel.** `run-parse-cargo.ts` обрабатывает сценарии по одному. При Gemini 429 rate limit весь прогон замедляется. Для будущих оптимизаций: p-limit + exponential backoff вместо текущего 2s retry.

4. **Judge rubric растёт постепенно.** Каждый Round добавляет 1-2 алиаса (ARA range в R17, UK port ранее). Rubric нужен regular audit чтобы не стать overfit к конкретным сценариям.

---

## Commits

| SHA     | Description                                                         |
| ------- | ------------------------------------------------------------------- |
| dd84d0a | fix(progonq corpus): R17 Class A re-annotations — 5 scenarios       |
| 581ac5b | fix(progonq): R17 Class B+E fixes — LINE UP guard + ARA range alias |
| TBD     | docs: R17 retro + design doc section 8 + plan eval methodology      |
