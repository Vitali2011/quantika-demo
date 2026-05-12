# R14 retro — что получилось, что не получилось, что дальше

**Date:** 2026-05-12
**Round:** R14 (parse-cargo eval)
**Plan ref:** [2026-05-12-parse-cargo-multiport-plan.md](2026-05-12-parse-cargo-multiport-plan.md)
**Design ref:** [2026-05-12-parse-cargo-multiport-design.md](2026-05-12-parse-cargo-multiport-design.md)

## Цель раунда (по плану)

Поднять semantic eval с 90/95 (R13) до 92/95 двумя corpus fixes:

- scenario-049: vessel circular → `items: []`
- scenario-048: destination wording alignment

## Что вышло

| Run  | Semantic |
| ---- | -------- |
| R14a | 82/95    |
| R14b | 83/95    |
| R14c | 83/95    |
| R14d | 83/95    |

**Медиана: 83/95.** Variance band узкий (82-83), не LLM-шум — стабильная регрессия.

## Главное открытие — Gemini drift с 11→12 мая

R14 на том же commit'е парсера, том же promptе, тех же env vars даёт **−7 баллов** относительно R13. Это не наша поломка — модель Gemini 2.5 Pro изменилась за сутки (без явных изменений с нашей стороны).

Доказательство — конкретные сценарии, которые в R13 были sem=1, теперь стабильно sem=0.5:

- **scenario-021**: ref 2 items, R13 модель вернула 2 items (match), R14 во всех 4 прогонах возвращает 1 merged item
- **scenario-078**: зеркальная ситуация — R13 модель = 1 item, R14 = 2 split items
- **scenario-058**: ref `items: []` (vessel circular), R13 модель тоже `[]`, R14 регулярно hallucinate'ит 1 item

Это **тот же multi-port паттерн**, что и в исходных 061/076 — модель то мержит, то сплитит cargo items для одной и той же ситуации. Структурно решается Phase 2 (`*Alternatives`/`*Rotation` schema).

## Анализ corpus fixes

### scenario-049 (commit 060c7f5) — ✅ WORKS

Все 4 прогона R14: 049 выпал из reds. Аннотация была реально некорректной (vessel circular ≠ cargo inquiry), модель R13 правильно возвращала `[]`, наш fix синхронизировал ref.

**Вердикт: lock-in. Merge.**

### scenario-048 (commit f81d75c → reverted в 6a7789d) — ❌ PLACEBO

После fix 048 остался sem=0.5 во всех 4 прогонах. Root cause:

`normalizePort()` в [scripts/progonq/run-parse-cargo.ts:115](scripts/progonq/run-parse-cargo.ts:115) слишком агрессивно стрипит:

- `"Port of Call, Ukraine"` → `"port of call"` (отрезается `, Ukraine` через `/,\s*[a-z ]+$/`)
- `"Ukraine port (unspecified)"` (что возвращает модель в R14) → `"ukraine"` (отрезается `"port"` суффикс через `/ port$/`)

Judge получает уже искалеченные `"port of call"` vs `"ukraine"` и говорит "не равно" — даже с нашим новым POC-alias rule (commit 842e3e2 — оставлен).

**Фикс корректен только в паре с переписанным scorer'ом** — это Phase 2 (там и scorer переписывается под multi-port).

**Вердикт: revert. Phase 2 закроет правильно.**

## Стабильные fails (4/4 в R14a/b/c/d)

| Scenario | Category                                   | Phase 2 fix?                     |
| -------- | ------------------------------------------ | -------------------------------- |
| 021      | item alignment (model merges)              | ✅ yes — *Rotation/*Alternatives |
| 048      | normalize/judge mismatch                   | ✅ yes — scorer rewrite          |
| 055      | model misses one of two distinct cargoes   | ❌ no — Phase 3 prompt fix       |
| 061      | item alignment (model merges rotation)     | ✅ yes — \*Rotation              |
| 076      | item alignment (model merges alternatives) | ✅ yes — \*Alternatives          |
| 078      | item alignment (model splits)              | ✅ yes — same fix as 021         |

**5 из 6 закроются Phase 2. 055 закроется Phase 3.**

## Полу-стабильные fails (3/4 в R14a/b/c/d)

- 056, 058, 087, 088, 089, 095 — value-mismatches и item-count drift. Real Gemini noise post-update. Будут смотреться индивидуально после Phase 2 если останутся.

## Дрейф (1-2/4)

- 017, 026, 059, 070, 074, 086 — пограничные случаи где модель колеблется между прогонами. Допустимый LLM-шум.

## Решение

**P1 (выполнено):**

1. Revert commit f81d75c (048 fix — placebo) → commit 6a7789d
2. Keep commit 060c7f5 (049 fix — works)
3. Keep commit 842e3e2 (judge POC alias — корректно semantically, foundation для Phase 2)
4. New baseline: **83/95 semantic** (vs 90/95 R13). Снижение из-за Gemini drift, не нашей работы.
5. Move forward с Phase 2 multi-port schema — закроет 5 из 6 стабильных reds.

## Follow-ups (отдельные задачи, не блокируют Phase 2)

- **Gemini model version pin** — investigate, какая версия была активна 11 мая. Pin в `lib/ai-provider.ts` для стабильности eval baselines. Без этого каждый раунд = новый baseline.
- **scorer normalizer rewrite** — часть Phase 2 (Task 2.6 в плане). Сохранять raw values для judge, нормализованные только для строкового scorer'а.
- **`ItemMatchResult` raw fields** — добавить `ref_origin_raw`, `model_origin_raw`, `ref_dest_raw`, `model_dest_raw` в Phase 2 чтобы judge получал не-нормализованные строки.
