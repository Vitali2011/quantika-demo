# parse-cargo: corpus fixes + multi-port schema (R14 → R15 → R16)

**Date:** 2026-05-12
**Status:** approved (brainstorm complete)
**Author:** brainstorm session, Sonnet 4.6
**Target branch (Phase 1):** `progonq/parse-cargo-2026-05-11` (PR #126 in flight)
**Target branch (Phase 2):** `feat/parse-cargo-multiport` (new, off main after R14 lands)
**Target branch (Phase 3):** TBD after R15

---

## 1. Problem statement (human-language)

LLM-парсер freight email'ов достиг 90/95 (94.7%) семантической точности на eval корпусе.
Все 5 оставшихся провалов сидят в одном симптоме — "несовпадение количества cargo items
между ref и model" — но при детальном разборе оказались тремя **разными** проблемами:

1. **Corpus annotation ошибки** (049, 048): аннотатор размечал не то / другими словами.
   Модель права, ref надо поправить.
2. **Структурный gap в schema** (061, 076, плюс 072/074/075 в audit): freight брокеры
   часто пишут "load at El Arish OR El Dekheila" (одна загрузка, две альтернативы) или
   "discharge at Banjul + Dakar" (одна загрузка, два порта выгрузки в rotation). Сейчас
   модель и аннотатор расходятся как это представить — потому что в `ParsedCargo` нет
   полей для этого. Решаем структурно: добавляем `*Alternatives` и `*Rotation`.
3. **Реальная ошибка модели** (055): пропущен один из двух parallel cargo offers
   ("5500mt salt + 6000-7000mt salt/rice" → модель вернула только второй). Это
   отдельная задача на prompt-tuning.

Решение разносим на 3 раунда возрастающей сложности.

## 2. Phase 1 — R14 (corpus only, ~1 час, 0 кода)

### 2.1 Изменения

| Файл                                                 | Изменение                                                                                              | Reasoning                                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.progonq/corpus/etms-parse-cargo/scenario-049.json` | `reference_output.items: []`                                                                           | Email — vessel position circular ("2 x 5000MT DWCC open S.KOREA/CHINA"). VESSEL POSITION GUARD в prompt'е корректно возвращает `[]`. Аннотатор разметил как cargo inquiry — это annotation error.                                                                        |
| `.progonq/corpus/etms-parse-cargo/scenario-048.json` | item[0].destination_port → `"Port of Call, Ukraine"` (или canonical form, в которой модель уже отдаёт) | Item 1 (Hereke→Batumi) совпадает 1:1. Item 0 расходится только в wording dest: ref `"Port to be nominated, Ukraine"` vs model `"Port of Call (unspecified) / Ukraine port (unspecified)"`. POC = Port of Call = Port to be nominated в maritime broker speak — синонимы. |

### 2.2 Validation

- Запустить R14 локально (`scripts/progonq/run-parse-cargo.ts --round R14`) или на VPS
- Ожидаемый результат: **92/95** (90 + 2 corpus fixes)
- Если 92/95 — мержим PR #126 в main, lock'аем gain
- Если меньше — discrepancy debug отдельно (judge может не принять new ref wording)

### 2.3 Out of scope для Phase 1

- Никаких aliases в `normalizePort()` ([scripts/progonq/run-parse-cargo.ts:115](scripts/progonq/run-parse-cargo.ts:115))
- Никаких изменений в LLM prompt
- Никаких изменений в типах / API / matching

## 3. Phase 2 — R15 (structural multi-port schema, ~3-5 дней)

### 3.1 Branch

После merge PR #126: `git checkout main && git pull && git checkout -b feat/parse-cargo-multiport`.

### 3.2 Schema extension (D1: Schema A — parallel optional fields)

#### `lib/types.ts` — `ParsedCargo`

```typescript
export interface ParsedCargo {
  // ... existing fields ...
  originPort: ConfidenceField<string> | null; // existing — primary/representative
  originPortAlternatives: string[] | null; // NEW: "X or Y" — vessel chooses one
  originPortRotation: string[] | null; // NEW: "X + Y" — vessel calls both in sequence
  destinationPort: ConfidenceField<string> | null; // existing
  destinationPortAlternatives: string[] | null; // NEW
  destinationPortRotation: string[] | null; // NEW
  weightMt: ConfidenceField<number> | null; // existing — total cargo weight
  weightPerPort: number[] | null; // NEW (D4): parallel array to *Rotation, breakdown per port (e.g. 10000+30000=40000)
}
```

**Backward compatibility (D1 rationale):**
`originPort` / `destinationPort` остаются single — primary port из alternatives/rotation
(первый в массиве). Все существующие downstream consumers, которые читают только
`cargo.originPort`, продолжают работать без изменений.

**Confidence на alternatives (D3):** `string[]` без per-port confidence. Если LLM сомневается
в alt — он его не должен включать. Confidence остаётся только на primary.

### 3.3 LLM prompt extension

`lib/prompts/parse-cargo.ts`:

Добавить новый раздел в prompt:

```
=== MULTI-PORT CARGOES ===

When email mentions ALTERNATIVE ports ("X or Y", "X / Y", "load at X or Y"):
  → emit ONE item with:
    - origin_port = primary (first mentioned)
    - origin_port_alternatives = [other ports]

When email mentions ROTATION ports ("X + Y", "X and Y", "discharge at X then Y", "combined X+Y"):
  → emit ONE item with:
    - destination_port = primary (first port in rotation)
    - destination_port_rotation = [all ports including primary]
    - weight_per_port = [tonnage per port] if breakdown specified (e.g. "10000mt Banjul + 30000mt Dakar")
    - weight_mt = total cargo (sum of all parts)

Examples:
  "El Arish OR El Dekheila → POC 16000mt"
    → { origin_port: "El Arish", origin_port_alternatives: ["El Dekheila"], destination_port: "Port of Call", weight_mt: 16000 }

  "Kandla → Banjul 10000mt + Dakar 30000mt"
    → { origin_port: "Kandla", destination_port: "Banjul", destination_port_rotation: ["Banjul", "Dakar"], weight_mt: 40000, weight_per_port: [10000, 30000] }

When email mentions TWO DIFFERENT cargo offers in same message ("5500mt salt + 7000mt rice"):
  → emit TWO separate items (different cargoes, not rotation).
```

### 3.4 Schema validation

`lib/schemas.ts` — `PARSE_CARGO_SCHEMA`:

Добавить optional поля в JSON schema (origin_port_alternatives, origin_port_rotation,
destination_port_alternatives, destination_port_rotation, weight_per_port). Все nullable.

### 3.5 `parseCargoAIResponse` extraction

`app/api/ai/parse-cargo/route.ts:93-152`:

В `RawCargoItem` добавить новые поля. В `parsed.push(...)` extract'нуть их в `ParsedCargo`:

```typescript
originPortAlternatives: Array.isArray(item.origin_port_alternatives) ? item.origin_port_alternatives.map(String) : null,
originPortRotation: Array.isArray(item.origin_port_rotation) ? item.origin_port_rotation.map(String) : null,
destinationPortAlternatives: Array.isArray(item.destination_port_alternatives) ? item.destination_port_alternatives.map(String) : null,
destinationPortRotation: Array.isArray(item.destination_port_rotation) ? item.destination_port_rotation.map(String) : null,
weightPerPort: Array.isArray(item.weight_per_port) ? item.weight_per_port.map(Number).filter(n => !isNaN(n)) : null,
```

### 3.6 Matching engine — D2 phase 2a (pass-through)

В этом раунде matching engine **остаётся как есть** — читает `cargo.originPort` (primary).
Это значит: matcher делает свою работу относительно primary port, ignores alternatives/rotation.

Затрагиваемые файлы (zero-touch в Phase 2a):

- `lib/matching/pair-analyzer.ts:67,74,107,108,214,215`
- `lib/sailing/match-filters.ts:207,208,232,233,244,245`
- `lib/sailing/match-scoring.ts:315,318,341`
- `lib/economics/route-decision.ts:194,195`

**Phase 2b (отдельная follow-up задача, не в этом PR):** matcher evaluate каждый
alternative origin/destination → pick best по distance/cost/draft, return matched alt
в результате. Для rotation — both ports must pass hard filters, distance = sum of
leg distances, capacity covers total weight.

### 3.7 Scorer extension

`scripts/progonq/run-parse-cargo.ts`:

`scoreItems()` сравнивает alternatives/rotation как **sets** (порядок не важен):

```typescript
function setEqual(a: string[] | null, b: string[] | null): boolean {
  const aNorm = (a ?? [])
    .map((p) => normalizePort(p))
    .filter(Boolean)
    .sort();
  const bNorm = (b ?? [])
    .map((p) => normalizePort(p))
    .filter(Boolean)
    .sort();
  return aNorm.length === bNorm.length && aNorm.every((v, i) => v === bNorm[i]);
}
```

`route_match` теперь = `(primary origin match) && (primary dest match) && (origin alts set match) && (origin rotation set match) && (dest alts set match) && (dest rotation set match)`.

Weight match расширяется — если rotation указан и `weight_per_port` есть с обеих сторон,
сравниваем как ordered array (порядок per port matters при rotation).

### 3.8 Judge extension

`scripts/progonq/judge-parse-cargo.ts` — обновить rubric:

```
SEMANTIC EQUIVALENCE for multi-port:
- "X or Y" / "X / Y" → alternatives. Both representations equivalent.
- "X + Y" / "X and Y" / "X then Y" → rotation. Both representations equivalent.
- "Port of Call" / "POC" / "Port to be nominated" / "TBN" → equivalent (unspecified destination).
- Country-only port ("Ukraine port") + dest country specified → equivalent to "Port of Call, Ukraine".
```

### 3.9 Corpus re-annotation

Перепроверить и при необходимости переразметить:

- **scenario-061** (Kandla → Banjul + Dakar 40000mt = 10k + 30k): currently split в 2 items → переразметить как 1 item с rotation
- **scenario-076** (El Arish OR El Dekheila → POC 16000mt): 1 item с alternatives
- **scenario-072** (audit hit: alternative pattern)
- **scenario-074** (audit hit: rotation/combined pattern)
- **scenario-075** (audit hit: rotation pattern)

Plus full corpus audit pass — поискать "/", " or ", " + ", "and disch", "rotation", "combined" в bodies, переразметить найденное.

### 3.10 Sample data

`lib/sample-data/demo-parsed-cargoes.json` — обновить если затронут (новые optional поля
просто добавятся как null где не нужно).

### 3.11 Validation

- Type check: `npm run typecheck` (новые поля везде)
- Existing tests: `npm test` (не должны сломаться — backward compat)
- Run R15: `npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts --round R15`
- Ожидаемо: **94/95** (90 + 2 corpus + 2 multi-port)
- 055 остаётся красным — это Phase 3

### 3.12 Out of scope для Phase 2

- Phase 2b (matcher actually evaluates alternatives) — separate follow-up
- UI rendering alternatives/rotation — separate task (текущий UI покажет только primary, что не ломает UX)
- Confidence per-alternative — D3 решено: не делаем

## 4. Phase 3 — R16 (prompt fix for 055, ~1 день)

### 4.1 Branch

`feat/parse-cargo-extract-all-offers` после merge Phase 2.

### 4.2 Изменение

`lib/prompts/parse-cargo.ts` — добавить ясное правило про parallel cargo offers:

```
=== EXTRACT ALL DISTINCT CARGO OFFERS ===

When email mentions MULTIPLE cargo offers in single message:
- Different commodities (e.g. "salt + rice") → separate items
- Different tonnage offerings (e.g. "5500mt + 6000-7000mt") → separate items
- Different load ports for different cargoes → separate items
- "or" between WHOLE offers (not just ports) → separate items

DO NOT merge into single item with combined tonnage.
Only merge under MULTI-PORT rules above (alternatives/rotation), where it's ONE physical cargo movement.
```

### 4.3 Validation

- Запустить R16
- Ожидаемо: **95/95**
- Risk: prompt change может задеть другие сценарии. Run full corpus, не только 055.

## 5. Risks & Mitigations

| Risk                                                                            | Impact | Mitigation                                                                                                                                                                                  |
| ------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 2 schema change ломает downstream consumer я не нашёл                     | High   | Backward compat по дизайну: `originPort` остаётся primary string. Перед merge — full grep `originPort` и `destinationPort` по всему репо, проверить что никто не делает strict shape check. |
| Phase 2 prompt change ломает уже зелёные сценарии                               | High   | Run full R15 корпус, diff с R14. Любая регрессия — block PR. Adversarial QA round опционально.                                                                                              |
| Re-annotated corpus 061/076 не пройдут judge с новым schema                     | Medium | Judge rubric обновляется в same PR (3.8). Если judge всё ещё BLOCK — adjust ref wording.                                                                                                    |
| Phase 2b (real matcher logic) откладывается → пользы для прода нет, только eval | Medium | OK trade-off: схема готова, follow-up задача чёткая. Ship structural change без поломок > shipped both в одном PR с риском.                                                                 |
| 055 prompt fix ломает other scenarios                                           | Medium | Phase 3 = standalone PR, full corpus regression run обязателен.                                                                                                                             |

## 6. Decisions log

- **D1**: Schema A (parallel optional fields) — chosen. Backward compat win.
- **D2**: Matcher pass-through в Phase 2a; real evaluation = Phase 2b follow-up.
- **D3**: Alternatives/rotation = `string[]` без per-port confidence.
- **D4**: `weightPerPort: number[] | null` parallel array к rotation для breakdown сохранения.
- **Phasing**: 3 PR, не 1. Маленький R14 fast win, большой R15 structural, маленький R16 prompt tune.
- **Branch strategy**: Phase 2 — отдельная ветка off main после merge R14, не продолжаем в текущей progonq ветке.

## 7. Open follow-ups (out of this design)

- **Phase 2b**: matching engine real evaluation of alternatives + rotation
- **UI**: показ alternatives/rotation в processing/match results
- **Future eval rounds**: после 95/95 — adversarial corpus expansion (cold cases brokers throw at the parser)

## 8. Eval reality post-Gemini-drift (2026-05)

После завершения Phase 1-3 (PR #126, #130, #131) и R17 round был зафиксирован
устойчивый Gemini-drift, который меняет интерпретацию результатов eval.

**Наблюдения:**

- Gemini 2.5 Pro нестабилен между прогонами без version pin
- Variance band: ±7 баллов по string score, ±8 баллов по semantic score между сессиями
- R17a=74/95, R17b=80/95, R17c=82/95 semantic — всё на одном коде

**НОВАЯ норма:**

- 3-run median вместо single-run target
- Целевая зона = куда попадает медиана 3 прогонов (не worst-case, не best-case)
- 1/3 прогонов red → Class F drift → accept as known limitation
- 3/3 прогонов red → real bug → fix

**Классификация стабильных reds (R17):**

- Class A (corpus wrong): scenarios 006, 035, 079, 087, 088 — re-annotated
- Class B (prompt gap): scenario 058 — LINE UP DWCC guard added
- Class E (judge false negative): scenario 056 — ARA range alias added
- Class F (drift): scenarios 089, 095 — accepted, не фиксить

**Implications for future rounds:**

- Никогда не сравнивать single-run результаты между разными датами без variance check
- Version pin Gemini рассмотреть как опцию если variance мешает продуктовым решениям
- Baseline = медиана 3 прогонов. Regression = медиана упала > 3 баллов.
