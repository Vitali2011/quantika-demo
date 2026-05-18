# Text-Generation Endpoints Eval Harness — Design (2026-05-18)

## Цель

Построить eval harness для 3 LLM endpoint'ов которые сейчас НЕ покрыты автотестами:

- `/api/ai/explain-deal` — 4-section narrative (Market Context / Deal Rationale / Key Risks / Next Steps) для cargo+vessel match
- `/api/ai/draft-quote` — freight quote email на основе parsed cargo
- `/api/ai/draft-reply` — follow-up email при missing info или pending negotiation

Эти endpoint'ы возвращают **free-form текст**, а не структурированный JSON — обычный "equality judge" не работает.

## Почему важно

Текст идёт прямо broker'у. Без eval мы не знаем:

- Галлюцинирует ли модель cargo facts (например, выдумывает freight rate)
- Empty sections в explain-deal → broker видит сломанный UI
- Wrong language в Arabic mode → embarrassment для Dubai клиентов
- Sender name parse fail → "Dear Sir/Madam" вместо имени

## Архитектура

### Структура corpus (per endpoint)

```
.progonq/corpus/etms-explain-deal/
  scenario-001.json   # cargo+vessel+match + expected quality criteria
  scenario-002.json
  ...

.progonq/corpus/etms-draft-quote/
  scenario-001.json   # parsed cargo + expected quote elements
  ...

.progonq/corpus/etms-draft-reply/
  scenario-001.json   # email + missingInfo OR pendingItems
  ...
```

### Scenario shape (explain-deal example)

```json
{
  "id": "etms-explain-deal-001",
  "input": {
    "match": {
      "score": 78,
      "matchLevel": "good",
      "matchReasons": ["DWT within range", "Open date matches laycan"],
      "issues": ["TCE 12% below market"],
      "cargoEmailId": "fixture-cargo-001",
      "vesselEmailId": "fixture-vessel-001",
      "economics": { "tce": 14200, "marketTce": 16100 }
    },
    "cargo": {
      /* full parsed cargo from corpus */
    },
    "vessel": {
      /* full parsed vessel from corpus */
    },
    "language": "en"
  },
  "expected_facts": [
    "Must mention DWT range from cargo (e.g. '8000-10000 MT')",
    "Must mention vessel DWT (12500 MT)",
    "Must reference TCE figure (~14200 USD)",
    "Must NOT invent a freight rate not in input",
    "Must list at least 3 concrete risks"
  ],
  "must_not_contain": [
    "USD per ton numeric rate (we have no rate data)",
    "Section headers in body content (e.g. 'Market Context, Deal Rationale')"
  ]
}
```

### Judge architecture — Factual Grounding Judge

Не "equal to ref output", а "соответствует ли модель expected_facts списку".

Для каждого scenario:

1. Запустить endpoint → получить текст
2. Для каждого `expected_fact` из scenario:
   - Промптом спросить LLM judge: "Does this text satisfy the claim: <fact>?"
   - Verdict: pass / fail / partial
3. Для каждого `must_not_contain`:
   - Promptом: "Does this text violate the rule: <rule>?"
   - Verdict: pass (нет нарушения) / fail (нарушение)
4. Aggregate score per scenario = (facts_pass + must_not_pass) / total_checks

### Judge model

Bedrock claude-cli или Gemini 2.5 Pro (через ai-provider scope `EXPLAIN_DEAL_JUDGE`).

## Scope

| Component                                  | Estimate  |
| ------------------------------------------ | --------- |
| explain-deal: 8 scenarios + runner + judge | 3-4ч      |
| draft-quote: 8 scenarios + runner + judge  | 3-4ч      |
| draft-reply: 5 scenarios + runner + judge  | 2-3ч      |
| Shared judge utilities                     | 1ч        |
| **Total**                                  | **9-12ч** |

## Phasing

**Phase 1 (3-4ч):** explain-deal eval — minimum viable. Доказательство работоспособности pattern на одном endpoint'е.

**Phase 2 (3-4ч):** draft-quote eval — re-use judge utilities.

**Phase 3 (2-3ч):** draft-reply eval — добавление по тому же шаблону.

Можно остановиться после любой phase — каждая шипает рабочий harness для своего endpoint'а.

## Сomparable to parse-recap eval (PR #218)

| Aspect            | parse-recap eval                | text-gen eval                             |
| ----------------- | ------------------------------- | ----------------------------------------- |
| Judge type        | Equality (ref==model per field) | Fact-grounding (LLM judges per claim)     |
| Reference         | Full GT object                  | List of expected_facts + must_not         |
| Per-scenario cost | ~$0.05 (judge calls)            | ~$0.20-0.50 (more LLM calls per scenario) |
| Variance          | Medium (judge LLM noise)        | Higher (sub jective fact-checking)        |

## Открытые вопросы

1. **Sample scenarios source.** explain-deal/draft-quote нужны cargo+vessel pairs. У нас 95 cargo + 56 vessel — можно скомпоновать pairs. Но без match метаданных (score, economics) нужно либо мокать, либо запустить full pipeline.
2. **Truth of expected_facts.** Кто их пишет? Я могу генерировать первичный draft, но без verification от тебя они могут быть неправильными.
3. **Baseline ожидание.** В отличие от parse-recap где baseline просто "сколько fields совпало" — для текста нет естественного %. Будем ждать вокруг 60-80% fact-coverage?

## Recommendation

Запустить **Phase 1 (explain-deal)** — 3-4ч. После этого:

- Если scores разумные → продолжить Phase 2-3
- Если выявит реальные bugs (hallucinations / empty sections) → fix их в отдельных PR
- Если judge variance слишком высокая → пересмотреть judge prompts

Решение по Phase 2-3 после Phase 1 результата.

---

**Status:** Design ready. Ожидает Vitali decision: build Phase 1 сейчас (3-4ч) или defer.
