# etms-draft-quote corpus

Eval corpus for `/api/ai/draft-quote` (Phase G2 R0).

## Source

All scenarios: **synthetic** — Opus 4.7 composed (Phase G2 R0).
Real broker corpus is blocked pending manual annotation (task #8).

## Scenario index

| ID | Category | Language | Freight rate | Notes |
|---|---|---|---|---|
| scenario-001 | standard | EN | 23.50 USD/mt | Karasu→Puerto Limon, HRC 10,400 MT, MV PETRA |
| scenario-002 | arabic-language | AR | 18.00 USD/mt | Alexandria→Jeddah, grain 8,500 MT, MV AL-NOUR |
| scenario-003 | lumpsum-instead-of-per-mt | EN | USD 42,000 LS | Marmara→Vera Cruz, project cargo 14 tanks, MV HELIOS |
| scenario-004 | with-extra-clauses | EN | 22.50 USD/mt | Novorossiysk→Istanbul, coal, war risk + sanctions |
| scenario-005 | standard | EN | 28.50 USD/mt | Teignmouth→Alexandria, clay 3,000 MT, MV STAD |
| scenario-006 | hallucination-trap | EN | **none** | Piraeus→Tunis, fertilizer — tests rate invention |

## Scenario schema

```json
{
  "id": "etms-draft-quote-NNN",
  "source": "synthetic — Opus 4.7 composed (Phase G2 R0)",
  "category": "<category>",
  "input": {
    "cargo_ref": "<reference for traceability>",
    "vessel_ref": "<reference for traceability>",
    "cargo": { /* ParsedCargo inline */ },
    "vessel": { /* ParsedVessel inline or null */ },
    "freight_rate_usd_per_mt": 23.50,  // null when lumpsum or hallu-trap
    "lumpsum_usd": null,               // set when lumpsum category
    "extra_clauses": null,             // string with additional CP clauses
    "broker_name": "<recipient name>",
    "language": "en|ar"
  },
  "expected": {
    "sections_present": ["Subject", "Greeting", "Terms", "Closing"],
    "must_cite_facts": ["<key value to verify>"],
    "must_NOT_invent": ["<literal string that must NOT appear>"],
    "language": "en|ar"
  }
}
```

## Judge criteria

Each scenario is evaluated on 6 dimensions:

1. **Section presence** — Subject / Greeting / Terms / Closing detected via line-anchored regex
   (`(^|\n)` anchor — prevents false positive from mid-sentence mentions)
2. **Fact citation** — `must_cite_facts` strings appear in output (case-insensitive, number normalization)
3. **Hallucination guard** — `must_NOT_invent` strings absent from output (case-insensitive)
4. **Currency consistency** — no EUR/GBP amounts mixed into USD-denominated quote
5. **Language** — output language matches `expected.language`
6. **Length sanity** — body 5–15 non-empty lines (WARN only, not auto-fail)

## Verdict levels

- **PASS** — criterion met
- **WARN** — advisory only (currently: length sanity outside range)
- **FAIL** — criterion violated

Overall scenario verdict: FAIL if any FAIL, else WARN if any WARN, else PASS.

## Hallucination trap (scenario-006)

When no freight rate is provided in the input, the model should:
- Use the placeholder `[RATE TO BE CONFIRMED]` per `DRAFT_QUOTE_SYSTEM_PROMPT`
- NOT invent a numeric rate (e.g. "25 USD/mt", "28.50", etc.)

The judge checks:
- `must_cite_facts: ["[RATE TO BE CONFIRMED]"]` — placeholder must appear
- `must_NOT_invent: [...]` — list of numeric rates that should NOT appear

## Extending the corpus

For Phase G2 R1+ (prompt tuning) or real broker corpus:
1. Add new JSON files following the schema above
2. Set `"source": "real — manually annotated by <broker> YYYY-MM-DD"` for real examples
3. Run: `npx tsx --env-file=.env.local scripts/progonq/run-draft-quote.ts --round R1`
4. Judge: `npx tsx scripts/progonq/judge-draft-quote.ts --round R1`
