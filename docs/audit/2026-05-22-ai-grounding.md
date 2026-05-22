# AI Grounding Audit — 2026-05-22

**Branch:** fix/ai-grounding-audit
**Round:** audit-2026-05-22
**Generated:** 2026-05-22T10:16:25.737Z

## Purpose

Verify that AI endpoints return only facts grounded in input data.
A broker trusting an AI-generated deal narrative or match score must not
receive invented port restrictions, fabricated rates, or stale geopolitical claims.

## Scope — AI Endpoints Audited

| Endpoint | Prompt | Grounding Level | Audit Method |
|---|---|---|---|
| `explain-deal` | `lib/prompts/explain-deal.ts` | ⚠ WEAK | Live run + pattern scan |
| `match` | `lib/prompts/match.ts` | ✅ STRONG | Existing R6 results (25 scenarios) |
| `draft-quote` | `lib/prompts/draft.ts` | ✅ STRONG | Existing R3 results (6 scenarios) |
| `parse-cargo` | `lib/prompts/parse-cargo.ts` | ✅ STRONG | source_text mandatory — static analysis |
| `parse-vessel` | `lib/prompts/parse-vessel.ts` | ✅ STRONG | source_text mandatory — static analysis |
| `parse-recap` | `lib/prompts/parse-recap.ts` | ✅ STRONG | source_text mandatory — static analysis |

## explain-deal — Detailed Findings

**Scenarios run:** 3
**Existing guard violations:** 0
**New hallucination hits:** 9 (HIGH=3 MEDIUM=4 LOW=2)

| Scenario | Category | Guard violations | HIGH | MED | LOW |
|---|---|---|---|---|---|
| etms-explain-deal-001 | strong-match | 0 | 0 | 2 | 1 |
| etms-explain-deal-003 | weak-match | 0 | 0 | 1 | 1 |
| etms-explain-deal-007 | multi-cargo-parcels | 0 | 3 | 1 | 0 |

### etms-explain-deal-001 (strong-match)

**3 hallucination pattern(s) found:**

**[H2 MEDIUM] Seasonal/temporal generalizations** — section: *Market Context*
> "June, a period when demand for certain bulk commodities can see season"

**[H4 LOW] Market sentiment not derivable from input TCE** — section: *Market Context*
> "currently experiencing firm"

**[H2 MEDIUM] Seasonal/temporal generalizations** — section: *Key Risks*
> "hurricane season"

<details><summary>Market Context output</summary>

```
The dry bulk market, particularly for handy/general cargo vessels in the Mediterranean, is currently experiencing firm rates, as evidenced by the market TCE of $15,800. We are entering June, a period when demand for certain bulk commodities can see seasonal upticks, while bunker prices remain a critical variable for long-haul transatlantic voyages. Port congestion, particularly in smaller ports, is an ongoing consideration that can affect turnaround times and overall voyage economics.
```
</details>

### etms-explain-deal-003 (weak-match)

**2 hallucination pattern(s) found:**

**[H2 MEDIUM] Seasonal/temporal generalizations** — section: *Market Context*
> "July typically represents a busy"

**[H3 LOW] Commodity domain knowledge not in input** — section: *Market Context*
> "often moves"

<details><summary>Market Context output</summary>

```
The market for general cargo vessels in the European/Mediterranean region is currently firm, as indicated by the high market TCE of $14,000. July typically represents a busy period for intra-European and short-sea trades. Bunkering costs remain a significant factor, influencing freight rates and impacting vessel earnings, though this vessel's TCE already accounts for these. This specific cargo of China Clay in bulk often moves in smaller parcels, making vessel utilization a critical economic consideration.
```
</details>

### etms-explain-deal-007 (multi-cargo-parcels)

**4 hallucination pattern(s) found:**

**[H1 HIGH] Geopolitical current events** — section: *Market Context*
> "Red Sea transits currently involve heightened geopolit"

**[H2 MEDIUM] Seasonal/temporal generalizations** — section: *Market Context*
> "July is generally"

**[H1 HIGH] Geopolitical current events** — section: *Key Risks*
> "Red Sea transit to Aqaba introduces geopolitical and security risk"

**[H1 HIGH] Geopolitical current events** — section: *Recommended Next Steps*
> "Red Sea surcharge"

<details><summary>Market Context output</summary>

```
The multipurpose and general cargo vessel market remains stable, with consistent demand for geared tonnage capable of handling breakbulk and project cargo. The Gdansk to Aqaba route represents a long-haul voyage traversing several distinct maritime regions, making bunker prices a significant factor in overall voyage economics. While July is generally a favorable weather period in the Baltic, Red Sea transits currently involve heightened geopolitical considerations that influence insurance premiums and operational planning. The specific requirement for a geared vessel for steel pipes and projec
```
</details>

## match — Grounding Assessment

**Grounding level: STRONG**

`lib/prompts/match.ts` (386 lines) contains explicit anti-hallucination rules:

- Line 14: "Use these numbers verbatim. Do NOT invent your own timing assessment"
- Lines 72–106: "Do NOT invent restrictions" unless in input `restrictions[]`
- Line 250–253: Explicit prohibition on charterer policy inference (e.g., "Cargill prefers CII-A")
- Lines 124–143: "Each reason MUST cite at least ONE concrete number or fact from data"

**R6 eval results (25 scenarios):** no-match=11, strong=3, marginal=5, weak=6
Hallucination guard failures: **0 across all 25 scenarios** (checked with 4 guards/scenario).

## draft-quote — Grounding Assessment

**Grounding level: STRONG**

`lib/prompts/draft.ts` enforces exact numeric values from input data.
Hallucination-trap scenario (etms-draft-quote-006) specifically tests fabricated
rates and unsolicited terms — **PASS** in R3.

**R3 eval results (6 scenarios):** 6/6 PASS, 0 hallucination guard violations.

## parse-* — Grounding Assessment

**Grounding level: STRONG (structural)**

All three parse prompts (`parse-cargo`, `parse-vessel`, `parse-recap`) require:
- `source_text`: verbatim substring copied from input email (cannot be paraphrased)
- `confidence` field: `confirmed` / `interpreted` / `uncertain` — any inferred value is explicitly flagged
- Template placeholder detection: unresolved `[DATE]` tokens → `confidence=uncertain`

Risk area: `confidence=interpreted` values (e.g., laycan inferred from hedge words like
"around mid-June") could produce wrong date ranges — but these are always flagged as uncertain.

## Hallucination Classes Found

| Class | Label | Severity | Count (explain-deal) | Prompt Guard Exists? |
|---|---|---|---|---|
| H1 | Geopolitical current events | HIGH | checked per scenario | ❌ no explicit guard |
| H2 | Seasonal/temporal generalizations | MEDIUM | checked per scenario | ❌ no explicit guard |
| H3 | Commodity domain knowledge | LOW | checked per scenario | ❌ no explicit guard |
| H4 | Market sentiment from external knowledge | LOW | checked per scenario | ❌ no explicit guard |
| H5 | Specific rates not in input | MEDIUM | existing guard (must_not_contain) | ✅ partial guard |

## Root Cause

`explain-deal.ts` **Market Context** section explicitly invites external knowledge:

```
Brief overview of current market conditions relevant to this cargo type, route, and vessel class.
Reference relevant freight market dynamics (e.g., seasonal demand, port congestion, bunker trends).
```

This instruction REMOVES the grounding constraint for one out of four sections.
The model correctly uses external knowledge (seasonal patterns, geopolitics) because the prompt asks it to.
The risk: that external knowledge may be **stale** (e.g., Red Sea security situation from training data)
or **wrong** for the specific route (seasonal claims applied to routes where they don't apply).

The remaining 3 sections (Deal Rationale, Key Risks, Recommended Next Steps) are better-grounded
("use actual values from the provided data") but still lack explicit prohibitions.

## Proposed Prompt Guards (NOT applied in this PR)

> ⚠ Guards proposed here — implementation deferred to avoid prompt regressions on parse-cargo/parse-vessel.

### G1 — Geopolitical freeze (HIGH priority)

Add to explain-deal system prompt, before Market Context instructions:
```
GROUNDING RULE: Do not reference geopolitical events, war zones, trade restrictions,
or security situations (e.g., "Red Sea risks", "Houthi attacks", "war risk surcharges")
unless they appear in the vessel.restrictions[] or cargo.specialRequirements fields.
Your training data for current events may be stale — use only what the broker provided.
```

### G2 — Seasonal claims scoped to route (MEDIUM priority)

```
GROUNDING RULE: Seasonal market claims (e.g., "July is busy", "hurricane season risk")
must be specific to the exact route (origin/destination ports) in the data above,
not generic to the vessel class or cargo type. If unsure, omit the seasonal claim.
```

### G3 — Commodity domain facts (LOW priority)

```
GROUNDING RULE: Do not assert commodity handling norms ("often moves in X parcels",
"typically requires Y") unless the cargo input data specifies them. The broker sent
the actual cargo — do not override it with domain generalizations.
```

### G4 — Market Context anchoring (structural)

Consider replacing the free-form "Reference relevant freight market dynamics" instruction
with: "Use only the economics data provided (TCE, marketTce, score breakdown) to describe
market positioning. Do not introduce external market data not present in the input."

This trades narrative richness for factual reliability — broker trust over narrative quality.

## Verdict

| Endpoint | Hallucination risk | Action needed |
|---|---|---|
| `explain-deal` | 🔴 HIGH (Market Context) | Add G1 (geo freeze) in next prompt PR |
| `match` | 🟢 LOW | No action — strong guards already in place |
| `draft-quote` | 🟢 LOW | No action — clean in R3 hallucinaton-trap test |
| `parse-*` | 🟢 LOW | No action — structural source_text enforcement |

**Next action:** Create a dedicated prompt PR for explain-deal with G1+G2 guards.
Suggest running explain-deal eval on all 11 scenarios after guard addition to verify
guard does not degrade fact-citation rate (must_cite_facts).
