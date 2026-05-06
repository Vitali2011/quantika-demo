# Wave γ Quality Push — Baseline (Opus Ground Truth Anchor)

**Run ID:** 2026-05-06T14-56-42-069Z
**Date:** 2026-05-06
**Reference:** Opus 4.7 independent ground truth (`ground-truth-opus.json`)
**Judge:** Bedrock Sonnet 4.6 (Mode A — candidate vs Opus reference)
**Models:** gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite

## Summary

294 total records (27 corpus cases × ~4 endpoints × 3 models). High judge error rate (77-92%) due to Bedrock Sonnet throttle limits during sustained burst. Judged subset provides directional signal for tuning.

## Per-endpoint × Per-model Quality Table

| Endpoint | Model | Cases | Judged | PARITY+B% | DEGRADED% | FAIL% | JudgeErr% | ModelErr% |
|---|---|---|---|---|---|---|---|---|
| classify | gemini-2.5-flash | 27 | 5 | 18.5% | 0.0% | 0.0% | 77.8% | 3.7% |
| classify | gemini-2.5-flash-lite | 27 | 4 | 7.4% | 7.4% | 0.0% | 85.2% | 0.0% |
| classify | gemini-2.5-pro | 27 | 4 | 3.7% | 11.1% | 0.0% | 85.2% | 0.0% |
| parse-cargo | gemini-2.5-pro | 24 | 4 | 4.2% | 12.5% | 0.0% | 45.8% | 33.3% |
| parse-cargo | gemini-2.5-flash | 24 | 2 | 0.0% | 8.3% | 0.0% | 79.2% | 12.5% |
| parse-cargo | gemini-2.5-flash-lite | 24 | 2 | 0.0% | 8.3% | 0.0% | 91.7% | 0.0% |
| parse-vessel | gemini-2.5-flash-lite | 25 | 3 | 12.0% | 0.0% | 0.0% | 88.0% | 0.0% |
| parse-vessel | gemini-2.5-pro | 25 | 3 | 12.0% | 0.0% | 0.0% | 84.0% | 4.0% |
| parse-vessel | gemini-2.5-flash | 25 | 2 | 8.0% | 0.0% | 0.0% | 92.0% | 0.0% |
| parse-recap | gemini-2.5-flash-lite | 22 | 3 | 0.0% | 13.6% | 0.0% | 86.4% | 0.0% |
| parse-recap | gemini-2.5-pro | 22 | 3 | 0.0% | 13.6% | 0.0% | 81.8% | 0.0% |
| parse-recap | gemini-2.5-flash | 22 | 2 | 0.0% | 9.1% | 0.0% | 81.8% | 9.1% |

**Note:** PARITY+B% is computed over total cases (not just judged), so judge errors depress absolute rates. Directional signal: among judged cases, all models produce usable output (0% FAIL) but most show DEGRADED patterns vs Opus reference.

## Top-5 Issue Patterns per Endpoint

### classify
1. **original_sender (low, 9 cases):** Returns company name instead of individual sender name. Opus reference distinguishes person vs company.
2. **confidence (low, 6 cases):** Slightly overconfident classification scores (0.98) for cases with some ambiguity.
3. **days_without_reply (low, 6 cases):** Template placeholder dates cause incorrect day calculations.
4. **urgency (med, 5 cases):** Urgency="high" requires laycan within 30 days per spec — models sometimes miss this rule.
5. **id (low, 3 cases):** id=null when no ID in input (expected behavior, not penalized).

### parse-cargo
1. **missing_info (med, 6 cases):** Empty missing_info array despite genuinely missing items in email.
2. **cargo_description (low, 6 cases):** Stowage factor omitted from cargo description text.
3. **loading_terms/discharge_terms (med, 3 cases):** Ambiguous FIO vs CQD terms not correctly disambiguated.
4. **volume_cbm (med, 3 cases):** volume_cbm=null despite SF present and weight_mt available for calculation.
5. **laycan confidence (low, 3 cases):** Template placeholder laycan marked as "confirmed".

### parse-vessel
1. No high/med issues surfaced in judged subset — vessel parsing shows strong PARITY alignment with Opus reference.
2. Low-severity cosmetic differences only.

### parse-recap
1. **unknown_terms (low, 7 cases):** Empty unknown_terms omitting unresolved template placeholders.
2. **additional_terms (low, 5 cases):** "ADA WOG" placed in additional_terms vs dedicated field.
3. **cargo_description (low, 4 cases):** Stowage factor omitted from cargo description.
4. Structured field extraction generally correct but verbose notes missing.

## Cost

| Component | Cost |
|---|---|
| Vertex AI (3 models × 294 calls) | $1.57 |
| Bedrock Sonnet judge (~40 successful calls) | ~$1.50 (est.) |
| **Total** | **~$3.07** |

## Artifacts

- `.specs/wave-gamma-vertex/bake-off-results/run-opus-anchor.jsonl` (294 records)
- `.specs/wave-gamma-vertex/bake-off-results/report-opus-anchor.md` (auto-generated report)
- This document
