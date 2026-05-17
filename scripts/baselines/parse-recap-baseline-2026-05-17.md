# parse-recap Adversarial QA Baseline — 2026-05-17

**Established by:** static-analysis baseline (progonq skill not available; analysis performed
against corpus + prompt + parseRecapAIResponse code)
**Corpus:** `.progonq/corpus/etms-parse-recap/` — 3 scenarios (multi_clause category)
**Provider at time of baseline:** OpenAI GPT-5.5 (default; Gemini path unused for this scope)
**Parser prompt:** `lib/prompts/parse-recap.ts` (`FIXTURE_RECAP_PARSER_PROMPT`)
**Parser version hash:** via `hashParserVersion()` in route

---

## Summary

| Metric | Value |
|---|---|
| Corpus scenarios tested | 3 |
| Total non-null reference fields (across 3 scenarios) | ~114 |
| Estimated correctly extracted | ~80 |
| **Overall field accuracy** | **~70%** |
| Weakest category | Laytime working hours (~53%) |
| Strongest category | Legal terms (cp_form / arbitration / law) (~89%) |

---

## Per-Field Accuracy Table

Accuracy is estimated from static code + prompt + corpus analysis.
The parser runs on OpenAI and the Gemini schema (`PARSE_RECAP_SCHEMA`) is **silently ignored** on this path (see Critical Bug §6 below).

| Field Group | Fields | Est. Accuracy | Notes |
|---|---|---|---|
| **Vessel Identity** | vessel_name, vessel_yob, vessel_flag, vessel_geared | **90%** | vessel_name/yob/flag very clear; vessel_geared ~75% (inferred from "GLESS" or "cranes" mention) |
| **Parties** | owners, charterers, account, broker | **66%** | broker (60%): plain string, multi-party complexity; charterers (65%): null-with-colon edge case (S001); account (75%): distinct from charterers |
| **Ports** | load_port, disch_port | **88%** | Port name rule (strip "1 GSP AAAA", "1 SB AA") applied; risk of over-stripping |
| **Cargo** | cargo_description, cargo_quantity_min, cargo_quantity_max, cargo_packaging | **71%** | cargo_quantity_max (45%): requires inferring DWCC = max cargo (S001 "OWNERS GUARANT THAT DWCC IS 3050 MTS") — not directly stated as "max" |
| **Dates** | laycan, transit_time | **88%** | laycan clearly stated; transit_time only in S003, clearly stated |
| **Freight** | freight_rate, freight_basis, freight_payment | **78%** | freight_payment (68%): long multi-sentence clause, may be truncated or incompletely extracted |
| **Laytime** | loading_rate, loading_terms, loading_working_hours, discharging_rate, discharging_terms, discharging_working_hours | **63%** | Combined laytime (S001/S002: "5 TTL WWDAYS" covers both ports) must be split — each half goes into loading_ and discharging_ fields separately; working hours (53%) most complex |
| **Demurrage** | demurrage_rate, demurrage_payment, despatch_rate | **67%** | despatch_rate (40%): inferred from "FD" suffix on demurrage clause ("1500 EURO PDPR FD") — not stated separately; LLM may miss or misinterpret |
| **Agents** | load_port_agent, disch_port_agent | **80%** | Clearly formatted agent blocks; contact details may be partially extracted |
| **Vessel Specs** | vessel_dwt, vessel_draft | **62%** | vessel_dwt (72%): S002 uses European decimal separator "3.858" = 3858 MT — risk of parsing as 3.858; vessel_draft (55%): multiple draft values in one string |
| **Legal** | cp_form, arbitration, law | **89%** | Standard clauses, consistently formatted |
| **Commission** | commission_percent, commission_address_pct, commission_broker_pct, commission_base, commission_amount, commission_currency | **70%** | commission_amount (50%): calculation required (freight × qty × %); S003 range value ("USD 9,625–11,000"); commission_base (65%): "F/D/D" in S003 is unusual |
| **Subs & Ack** | subs (array), acknowledgement_deadline | **55%** | acknowledgement_deadline (38%): buried in non-standard phrasing ("a/e as fllws for 30 mins"); subs deadline extraction via SUBS_DEADLINE_RULE complex |
| **Meta** | confidentiality, additional_terms, unknown_terms | **62%** | additional_terms (48%): completeness hard to achieve for 20+ clause emails; unknown_terms (52%): requires domain expertise to flag non-standard abbreviations |

---

## Sample Failing Cases

### Fail 1 — cargo_quantity_max inference (S001: MV STAD)

**Expected:** `cargo_quantity_max = 3050`, source "OWNERS GUARANT THAT DWCC OF THE VESSEL IS 3050 MTS"
**Likely output:** `null` or same as `cargo_quantity_min` (3000)

The max cargo is not stated as "max 3050" — it requires knowing that DWCC (Deadweight Cargo Capacity)
equals the vessel's maximum cargo intake. This is a domain inference the LLM may not make.
The reference output explicitly links DWCC to max cargo quantity.

---

### Fail 2 — despatch_rate inference (all 3 scenarios)

**Expected S001:** `despatch_rate = "Full despatch (FD) at EUR 1,500 per day pro rata"`
**Expected S003:** `despatch_rate = "USD 4,250 per day pro rata"` (computed as PDPR/FD ÷ 2)

The "FD" suffix on "DEMURRAGE: 1500 EURO PDPR FD" means "Full Despatch" — a standard BIMCO
abbreviation meaning despatch is paid at the same rate as demurrage. The LLM must:
1. Recognize "FD" as "Full Despatch" (not just "Full Deadweight")
2. Infer despatch rate equals demurrage rate
3. For S003 "PDPR/FD ALL ENDS", additionally recognize "half" vs "full" despatch convention

The prompt does not have an explicit despatch_rate extraction rule. Likely missed in ~60% of cases.

---

### Fail 3 — acknowledgement_deadline extraction (S001: MV STAD)

**Expected:** `"within 30 minutes of transmission"`
**Source text:** `"Please find atatched chrtrs full terms a/e as fllws for 30 mins;"`

The acknowledgement deadline is embedded in a typo-heavy sentence ("atatched", "fllws") and uses
abbreviations ("a/e" = accepted/expressed, "fllws for 30 mins" = follows, for 30 minutes).
The prompt rule covers `"if you have comments, pls revert by X"` style phrases but this phrasing
("a/e as fllws for 30 mins") is unusual and may be missed.

---

### Fail 4 — combined laytime split (S001, S002)

**Expected:** Separate `loading_terms` and `discharging_terms` from a single clause:
`"LOADING/DISCH  5  TTL  WWDAYS OF 24 CONSEC HOURS SSHEX/TFHEX"`

**Failure mode:** LLM puts the full clause in `loading_terms` and leaves `discharging_terms` null,
or vice versa. The reference output requires the combined clause to appear in BOTH fields
with the port-specific exclusion windows added.

Additional complexity: "TFHEX" applies at Alexandria (Friday = Egyptian holiday week start) while
"SSHEX" applies at Teignmouth (UK Saturday/Sunday). The split must reflect this.

---

### Fail 5 — vessel_dwt European decimal (S002: NORTHSTAR GLORY)

**Expected:** `vessel_dwt = 3858`
**Source text:** `"GRT/NRT/DWT 2498/874/3.858 TON"`

The European format uses "." as thousands separator, not decimal. "3.858" = 3,858 metric tons.
The LLM may return `3.858` (a decimal) or `3858` (correct integer). OpenAI may handle this
correctly given context ("3858 TON" for a small coaster is more plausible than "3.858 TON"),
but it's an unvalidated edge case.

---

## Critical Bug Found: Schema/Prompt/Code Mismatch

**Severity: HIGH — affects Gemini path; dead code on OpenAI path**

The Gemini structured-output schema (`lib/schemas/parse-recap.ts`) is completely misaligned with:
1. The parser prompt (`lib/prompts/parse-recap.ts`) — which uses ConfidenceField format and different field names
2. The `parseRecapAIResponse` helper (`lib/parsing/parse-recap-helpers.ts`) — which reads `RawFixtureRecap` fields

### Schema field name mismatches (schema → expected by `parseRecapAIResponse`):

| Schema field | Expected field | Effect |
|---|---|---|
| `charterer` | `charterers` | charterers always null on Gemini path |
| `owner` | `owners` | owners always null on Gemini path |
| `discharge_port` | `disch_port` | discharge port always null on Gemini path |
| `cargo_quantity_mt` (single) | `cargo_quantity_min` + `cargo_quantity_max` | both qty fields always null |
| `laycan_start` + `laycan_end` | `laycan` (combined string) | laycan always null |
| `freight_type` | `freight_basis` | freight basis always null |
| `discharge_rate` | `discharging_rate` | discharging rate always null |
| `discharge_terms` | `discharging_terms` | discharging terms always null |
| `subjects` (string) | `subs` (array) | subs always empty array |
| `additional_clauses` (string) | `additional_terms` (array) | additional_terms always empty array |

### Fields missing from schema entirely (would be null on Gemini path):

`vessel_yob`, `vessel_flag`, `vessel_dwt`, `vessel_draft`, `vessel_geared`, `account`, `laycan`,
`transit_time`, `freight_payment`, `loading_working_hours`, `discharging_working_hours`,
`demurrage_payment`, `despatch_rate`, `load_port_agent`, `disch_port_agent`, `arbitration`, `law`,
`commission`, `commission_base`, `commission_amount`, `commission_currency`, `commission_address_pct`,
`commission_broker_pct`, `acknowledgement_deadline`, `confidentiality`, `unknown_terms`

**Impact on Gemini path:** ~22% field accuracy (estimated) — only vessel_name, broker, cargo_description,
load_port, freight_rate, commission_percent, demurrage_rate, loading_rate, loading_terms, cp_form
would be non-null.

**Current production impact:** NONE — provider defaults to OpenAI, which ignores `responseSchema`
in `callAiText`. The schema is silently dead code on the OpenAI path. However, switching
`PARSE_RECAP_PROVIDER=gemini` would catastrophically degrade output to ~22%.

### Additional type mismatch:

`RawFixtureRecap.subs?: string[]` but prompt instructs ConfidenceField objects per subs entry.
`RawFixtureRecap.unknown_terms` uses `{ term, note }` but prompt uses `{ term, context }`.
These are low-severity runtime mismatches (TypeScript types lie, runtime stores actual shape).

---

## 9-Class Boundary Analysis

The following boundary conditions are the highest-risk classification decisions:

| # | Boundary | Risk | Mitigation in Prompt |
|---|---|---|---|
| 1 | `confirmed` vs `interpreted` | LLM may assign `confirmed` to inferred values (e.g. commission_base = "freight" not stated) | Prompt rules explicit; `calibrateAll()` post-processes |
| 2 | Port name stripping | Over-stripping ("Figueira de Foz" has unusual name) or under-stripping ("1 GSP AAAA" not removed) | PORT NAME RULE in prompt |
| 3 | null vs non-null charterers | "CHARTERERS  :" with no name → correctly null, but LLM may extract "" or "unknown" | Prompt example needed |
| 4 | cargo_quantity_max from DWCC | DWCC = vessel capacity = max cargo — domain knowledge required | Not addressed in prompt |
| 5 | Commission total vs split | "3.75 TTL" = no split; "3.75 + 1.25" = explicit split — LLM must detect the structure | COMMISSION CALCULATION rule covers this |
| 6 | Combined laytime splitting | "5 TTL WWDAYS" clause → must populate BOTH loading_terms and discharging_terms | SPLIT LAYTIME rule exists; port-specific exclusions not covered |
| 7 | Despatch inference from "FD" | "PDPR FD" → despatch_rate = same as demurrage rate | Not addressed in prompt |
| 8 | Body vs subject date conflict | Email forwarded 8 years later (S002: 2018 fixture forwarded 2026) | SUBJECT/BODY DATE CROSS-CHECK rule exists |
| 9 | Subs deadline consistency | Duration expression vs explicit calendar date must compute same result | SUBS DEADLINE RULE covers this |

---

## Recommended Fix Priorities

_(Measurement only — no fixes in this PR)_

**P0 — Fix before any Gemini provider switch:**
1. Rebuild `lib/schemas/parse-recap.ts` to match `RawFixtureRecap` field names, or drop the schema
   and rely on prompt-only extraction for OpenAI (current de-facto behavior).
   If keeping schema, use nested OBJECT types for ConfidenceField fields.

**P1 — Prompt additions for highest-miss fields:**
2. Add explicit `despatch_rate` rule: "If demurrage clause ends with 'FD', extract despatch_rate = 'Full despatch (FD) — same rate as demurrage'. If 'half despatch', compute rate ÷ 2."
3. Add `cargo_quantity_max` rule: "If text says 'OWNERS CONFIRM DWCC = X' and no explicit max cargo is stated, extract cargo_quantity_max = X with confidence='interpreted'."
4. Strengthen `acknowledgement_deadline`: add example for "a/e as fllws for N mins" pattern.
5. Strengthen laytime split: add explicit example for combined laytime clause → both loading_terms and discharging_terms must reference it.

**P2 — Code fixes:**
6. Fix `RawFixtureRecap.subs` type: `string[]` → `ConfidenceField<string>[] | string[]`
7. Fix `unknown_terms` key: `{ term, note }` → `{ term, context }` in `RawFixtureRecap`
8. Add `vessel_yob` and `vessel_flag` to `RawFixtureRecap` and `parseRecapAIResponse`
9. Add European decimal detection for `vessel_dwt` parsing (3.858 → 3858)

**P3 — Corpus expansion:**
10. Add tanker scenario (ASBATANKVOY, worldscale freight) — `tests/fixtures/quote-drafts/02-good-tanker-recap.txt` is available but not in corpus
11. Add scenario with explicit despatch rate (not FD inference)
12. Add scenario where charterers ≠ account (already covered in S001/S003 but worth adding more)

---

## Corpus Coverage Gaps

| Gap | Impact |
|---|---|
| Tanker fixtures (ASBATANKVOY, WS rates) | freight_basis = worldscale; different cp_form |
| Multi-port loading/discharging | load_port / disch_port as arrays vs strings |
| Consecutive voyages / COA fixtures | No laycan; running quantity |
| Fixtures with freight lump sum | cargo_quantity_max irrelevant |
| Fixtures with despatch explicitly stated | Needed to validate despatch_rate extraction |
| Fixtures where charterers ≠ disponent owners | owners vs charterers boundary |

---

*Baseline established: 2026-05-17. Next measurement: after prompt fixes in follow-up PR.*
