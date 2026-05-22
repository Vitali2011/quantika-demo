# etms-explain-deal corpus

Eval corpus for `/api/ai/explain-deal` (Phase E8 R0).

## Source

All scenarios: **synthetic** — Opus 4.7 composed (Phase E8 R0).
Real broker corpus is blocked pending Vitali manual annotation (task #6).

## Scenario index

| ID | Category | Language | Score | Notes |
|---|---|---|---|---|
| scenario-001 | strong-match | EN | 82 | Antalya→Georgetown, MV PETRA |
| scenario-002 | marginal-match | EN | 61 | Karasu→Dakar, TCE 25% below market |
| scenario-003 | weak-match | EN | 44 | Teignmouth→Alexandria, DWT oversized 4x |
| scenario-004 | arabic-mode | AR | 78 | Alexandria→Jeddah, Arabic output expected |
| scenario-005 | null-cargo-edge-case | EN | 65 | cargo=null, tests graceful handling |
| scenario-006 | hallucination-sentinel | EN | 73 | Mersin→Casablanca, sentinel guards in must_not_contain |
| scenario-007 | multi-cargo-parcels | EN | 76 | Gdansk→Aqaba, steel pipes + project cargo parcels |
| scenario-008 | missing-freight-no-economics | EN | 58 | Tema→Antwerp, economics=null, tests no hallucinated rates |
| scenario-009 | very-strong-match | EN | 94 | Piraeus→Mumbai, score 94 TCE above market zero repositioning |
| scenario-010 | conflicting-dates | EN | 38 | Immingham→Tunis, vessel open 5 days after laycan closes |
| scenario-011 | cyrillic-input | EN | 71 | Новороссийск→Rotterdam, Cyrillic in port name tests EN output |

## Scenario schema

```json
{
  "id": "etms-explain-deal-NNN",
  "source": "synthetic — Opus 4.7 composed (Phase E8 R0)",
  "category": "<category>",
  "language": "en|ar",
  "input": {
    "match": { /* Match object with score, matchLevel, matchReasons, issues, economics */ },
    "cargo": { /* ParsedCargo or null */ },
    "vessel": { /* ParsedVessel */ }
  },
  "expected": {
    "sections_present": ["Market Context", "Deal Rationale", "Key Risks", "Recommended Next Steps"],
    "must_cite_facts": ["<key value from input to verify>"],
    "must_not_contain": ["<literal string that must NOT appear in output>"],
    "language": "en|ar"
  }
}
```

## Judge criteria

Each scenario is evaluated on 4 dimensions:

1. **Section presence** — all expected section headers present and non-empty
2. **Fact citation** — `must_cite_facts` strings appear in output (case-insensitive, number normalization)
3. **Hallucination guard** — `must_not_contain` strings absent from output (case-insensitive)
4. **Language** — output language matches `expected.language`

## Verdict levels

- **PASS** — criterion met
- **WARN** — partial (section present but empty, or fact not cited but no hallucination)
- **FAIL** — criterion violated

Overall scenario verdict: FAIL if any FAIL, else WARN if any WARN, else PASS.

## Extending the corpus

For Phase E8 R1+ (prompt tuning iterations) or real broker corpus (task #6):
1. Add new JSON files following the schema above
2. Set `"source": "real — manually annotated by <broker> YYYY-MM-DD"` for real examples
3. Run: `npx tsx --env-file=.env.local scripts/progonq/run-explain-deal.ts --round R1`
4. Judge: `npx tsx scripts/progonq/judge-explain-deal.ts --round R1`

## Phase E8 R1 (2026-05-22)

Added scenarios 007–011 covering: multi-cargo-parcels, missing-freight-no-economics,
very-strong-match, conflicting-dates, cyrillic-input.
Also fixed Arabic section headers: added explicit no-markdown instruction to
`EXPLAIN_DEAL_SYSTEM_PROMPT_AR` to prevent `**...**` wrapping that caused R0 FAIL on scenario-004.
