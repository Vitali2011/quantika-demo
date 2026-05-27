# Issue #589 — AI Deal Analysis hallucinates cargo qty + vessel DWT

**Source:** /qa-walker baseline 2026-05-27. На /match/[id] клик "Explain this deal" lightbulb → Gemini 2.5 Pro modal асерт ложных значений: "50,000 MT grain parcel" / "55,500 MT DWCC", реальные данные = BULK / 58,000 DWT.

**Tier:** M (prompt + caller + eval, ~3-5 файлов) · creative=YES · brainstorm=inline-in-plan · risk-override (LLM/prompt — Class 11 PBT) → M minimum + /test-skill mandatory

## Brainstorm — hypothesis tree (per Rule #13 creative + unknown-RC)

**RC hypotheses** (из QA Walker report + investigation):

- **H1: prompt template doesn't include match payload.** LLM получает только generic system message без actual match data → инвентирует «правдоподобные broker specifics» (50k MT grain — типичный supramax parcel). Самый плохой случай. Verification: read prompt-builder file, проверить включается ли match.cargo + match.vessel в prompt context.
- **H2: prompt includes data, но system message содержит stale demo examples что LLM воспринимает как ground truth.** Например в system: «Example deal: 50,000 MT grain Constanta→Algeciras...». LLM повторяет examples вместо актуальных данных. Verification: full system message text + few-shot examples.
- **H3: prompt includes data, но generic broker-flavored response template overrides specifics.** «Write in broker style», «typical bulk operation», и LLM сглаживает реальные numbers до «typical». Verification: response post-processing logic, stripping or "generalization" step.
- **H4: caller передаёт wrong match object** (другой match, или partial data, или stale cached). Verification: trace request payload в API endpoint.

**Approaches:**

- **A1 (recommended): tighten prompt — explicit data anchoring + assertion guardrails.** Prompt template: «Cargo type: ${match.cargo.type}, quantity: ${match.cargo.qty || 'unspecified'}, vessel DWT: ${match.vessel.dwt}». System message добавляет: «You MUST cite ONLY numbers from the data above. NEVER invent quantities, sizes, or specifications. Если данных нет — explicitly state 'unspecified' or 'not provided'.»
- **A2: post-response validation guardrail.** После LLM output, extract все numeric values regex'ом и assert каждое число встречается в match payload. Если invented number found → retry с stronger anchoring OR strip number из response. Defensive, но adds latency.
- **A3: structured output (JSON schema).** Switch from free-form text → strict JSON output schema с поля {cargo_type, quantity_mt, vessel_dwt, rationale_text}. Schema validation на backend rejects invented numerics. Strongest guard, но требует UI rewrite (rationale_text — единственное narrative).
- **A4 (combined): A1 + A2 + behavioral eval.** Prompt anchoring + post-validation + eval harness с 3 fixture matches и assertion «no numeric в response которого нет в match payload».

**Choice:** A4 — самый bulletproof, prompt rewrite + guardrail + eval. Eval = ключ к prevent regression.

## Investigation steps

1. Grep `Explain this deal` / `deal analysis` / `dealRationale` / `gemini` в `lib/` `app/api/`
2. Find prompt-builder file (likely `lib/deal-analysis/prompt.ts` или подобное)
3. Find API endpoint (likely `app/api/match/[id]/explain/route.ts` или подобное)
4. Find UI component that renders modal
5. Read prompt + system message — identify H1/H2/H3 vs H4
6. Read existing eval/test coverage (если есть)
7. Confirm hypothesis → apply A4

## Fix scope (estimate)

- `lib/deal-analysis/prompt-builder.ts` (или подобное) — explicit data anchoring + assertion phrase
- `lib/deal-analysis/system-prompt.ts` (или inline) — убрать stale examples ИЛИ переписать как «do/don't» constraints
- `lib/deal-analysis/validate-response.ts` (new или extend) — extract numerics, cross-check с match payload
- `app/api/match/[id]/explain/route.ts` (или подобное) — call validate, retry если invented numerics found
- `__tests__/deal-analysis/no-invented-numerics.test.ts` (new behavioral) — 3 fixture matches × assert no numeric ∉ payload

## QA acceptance (PI2)

- Behavioral eval: 3 fixture matches × Gemini call × extract numerics regex × assert ∀ num ∈ match payload OR num ∈ standard tokens (year, scoring scales)
- Manual smoke: open /match/108 → click Explain this deal → response не содержит numbers не из match.cargo / match.vessel / match.economics

## Out of scope
- Other LLM features (Draft Quote, Ask Client)
- Frontend modal UI redesign (только backend prompt + validation)
- Switch к другой модели (остаёмся на Gemini 2.5 Pro per existing config)
- Caching / performance optimization

## PI3
- Existing tests на deal-analysis (если есть) — НЕ переписывать, только добавлять new tests
- Если current prompt template файл refactor больше 5 файлов → STOP, escalate

## Discovery context
/qa-walker baseline 2026-05-27 found this как 🔴 critical demo-blocker. Demo через 1-2 weeks. «Trust in AI = 0 after one demo» rationale.
