# Schema Gaps — MATCH_PROMPT output

Fields a domain expert might expect to see but that are intentionally NOT in the
matcher output schema. QA agents are told these are out of scope and MUST NOT
be flagged as missing-field bugs.

Output schema (per MATCH_PROMPT):
```
{
  "matches": [
    {
      "cargo_email_id": string,
      "cargo_item_index": number,
      "vessel_email_id": string,
      "vessel_item_index": number,
      "score": number,
      "match_level": "good" | "possible" | "weak",
      "match_reasons": [ "...", "..." ],
      "issues": [ "...", "..." ]
    }
  ]
}
```

## Out of scope for MATCH_PROMPT

- **Freight rate / TCE / voyage P&L estimate** — broker computes separately
- **Bunker procurement port suggestions** — operational, post-fixture
- **Charter party clause drafting** — separate `recap.ts`/`draft.ts` prompts
- **Vetting flags** (RightShip, OCIMF SIRE, Q88) — only `cii_grade` if input has it
- **Insurance / P&I club exposure** — manual check
- **Owner/charterer credit / commercial counterparty risk** — manual
- **Weather routing / seasonal restrictions** — readiness layer scope
- **Port congestion / berth queue estimate** — readiness layer scope
- **Documentary requirements** (LOIs, BLs, COAs) — post-fixture ops

(Populated as QA agents over-flag these in early rounds.)

## Round 1 additions

- **Daily idle running cost / bunker burn during idle / ballast voyage cost in $/day** —
  the matcher has no cost model and no fuel-price input. QA may want
  `issues[]` like "$X/day idle, ballast cost $Y" but matcher only cites days.
  Stating "vessel idle 6 days before laycan" is sufficient; quantifying $ is
  out of scope.
