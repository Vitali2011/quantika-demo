# Phase 1 — Sampling Foundation Retro

## Results

| Round  | String | Semantic |
| ------ | ------ | -------- |
| R18a   | 78/95  | 83/95    |
| R18b   | 75/95  | 81/95    |
| R18c   | 78/95  | 84/95    |
| Median | **78** | **83**   |

## Delta vs R17 baseline (string 74, semantic 81)

- String: +4 (74 → 78)
- Semantic: +2 (81 → 83)
- Variance string: ±1.5 (was ±8) — **dramatic improvement**

## Phase 1 Gate Verdict

| Gate              | Target | Actual | Status  |
| ----------------- | ------ | ------ | ------- |
| String median ≥84 | 84     | 78     | ❌ MISS |
| Variance ≤4       | ≤4     | ±1.5   | ✅ PASS |

**Overall: PARTIAL** — median target missed, but variance goal exceeded expectations.

## What Worked

- **temperature=0 + seed=42**: variance dropped from ±8 to ±1.5. This is the main win of Phase 1.
- **few-shot examples**: likely contributed to the +4 string improvement (hard to isolate).
- **gemini-2.5-pro model pin**: gemini-2.5-pro-002 unavailable in us-central1; using unversioned gemini-2.5-pro.

## Why median didn't reach 84

Phase 1 was designed to kill variance (success) and hoped few-shot examples would boost accuracy.
The +4 improvement on string is real but below the 84-86 target. The remaining gap is likely:

- Hedged language scenarios (still the largest failure category)
- Multi-port rotation edge cases
- These require either RAG (Phase 2) or model switch (Phase 3) to improve

## Decision: Proceed to Phase 2

- String delta +4 ≥ +3 threshold → proceed gate MET
- Phase 2 RAG is the main bet (+5-15 expected)
- Phase 2 will be measured vs **R18 median (78 string / 83 semantic)** as new baseline
