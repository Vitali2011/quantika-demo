# parse-vessel R8 Regression Root-Cause Analysis

> **Status:** Analysis complete (2026-05-22)  
> **Branch:** `orchestrator/parse-vessel-r8-rc-20260521`  
> **Scope:** RESEARCH ONLY — no production prompt changes in this PR

---

## Executive Summary

PR #308 introduced 5 prompt rule sections targeting 6 known corpus failures. The resulting
eval showed a -13 drop in full-match count (R7 = 42 → R8 = 29, both measured with the same
**broken** eval harness). The regression had **two distinct components**:

1. **Eval harness bug (≈11/13 of apparent regression):** #308's extraction rules caused the
   model to populate `built`/`dwt_summer` for scenarios where the reference omits those fields.
   The harness at that time penalised `model≠null` when `ref=null` — an incorrect scoring rule
   fixed later in PRs #300 and #303. These 11 scenarios were passing in R7 because the R7
   prompt did not encourage extracting these values.

2. **Genuine prompt regression (≈2/13):** Two to four additional scenarios genuinely regressed,
   likely caused by the broad "Always normalize" flag wording and/or unexpected interaction
   between the rule sections.

**With the corrected harness applied retroactively:** R8 scores ~40/56 (vs. R7's 42/56),
giving a true prompt-level delta of **–2**, not –13.

**All 5 target scenarios were also still failing in R8** — the rules were simultaneously
ineffective for their intended targets AND harmful for passing scenarios.

---

## Corpus & Rounds Reference

| Round | Full matches / 56 | Harness state | Notes |
|-------|-------------------|---------------|-------|
| R7 (pre-#308) | 42 | Broken | Baseline before #308 |
| R8 (with #308) | 29 | Broken | Reported –13 regression |
| R8 (corrected scoring) | ~40 | Fixed | Retroactively re-scored |
| R9/R10 (#311/#312) | 44 / 49 | Fixed | Post-revert + safe rules |
| R15 (current HEAD) | 51 | Fixed | After R11-R15 iterative fixes |

---

## The 5 Changes in PR #308

### Change 1 — FLAG EXTRACTION RULES

**Text:** `"Always normalize the flag field to the full official country name using maritime
registry knowledge."`  
**Intent:** Fix sc-008 (BELIZE CITY→Belize), sc-034/043 (ST VINCENT→Saint Vincent…),
sc-051 (Navis→Nevis typo).

**Result in R8 (with change):**

| Scenario | Target | R8 | R10 | R15 | Note |
|----------|--------|----|-----|-----|------|
| sc-008 | BELIZE CITY→Belize | 0.833 | 1.000 | 1.000 | Rule ignored — model still output "BELIZE CITY" |
| sc-034 | ST VINCENT→Saint Vincent | 0.875 | 1.000 | 0.958 | Rule did not fire |
| sc-043 | ST VINCENT→Saint Vincent | 0.958 | 0.958 | 1.000 | Rule did not fire |
| sc-051 | Navis→Nevis | 0.944 | 1.000 | 1.000 | Rule did not fire |

**Verdict:** **Ineffective + possible mild regression.** The broad "Always normalize"
instruction appears to have confused the model. In R7 (no normalization rule), the model
relied on general knowledge and produced reasonable results. The new rule degraded behaviour
on at least one scenario. #312 fixed these with explicit enumeration: "apply only to these
specific cases — do NOT 'normalize' other flag names."

---

### Change 2 — EXTRACT ALL VESSELS (Availability Rules)

**Text:** `"Extract EVERY vessel listed in the email, regardless of availability status."`  
**Intent:** Fix sc-029 — extract ONEGO TRADER + ONEGO MERCHANT marked "ON TC".

**Result in R8:**

| Scenario | R8 | R10 | R15 | Note |
|----------|----|-----|-----|------|
| sc-029 | 0.375 | 0.958 | 1.000 | Only 2/4 ref vessels extracted in R8 despite the rule |

**Root cause of sc-029 failure in R8:** The model extracted "MV BBA LARISA'' EX ALI AYKIN…"
and "MV YUCATAN (EX PARAKLITOS)" — vessel names with ex-name suffixes that failed the
vessel_name_match check (separate harness bug fixed in #300). The ON TC vessels were still
not extracted.

**Broader impact:** In R8, **0 scenarios had extra vessels** (`model_items > ref_items`).
The "over-extraction from non-fleet emails" described in PR #312 likely refers to qualitative
degradation rather than quantitative item count increases. The real cost was ineffectiveness
on the target + triggering over-extraction of numeric fields in other scenarios (see Change 3).

**Verdict:** **Ineffective for target. Main driver of indirect harm** via interaction with
VESSEL EXTRACTION COMPLETENESS. Fixed in #312 with fleet-position context guard: "Only apply
this rule when the surrounding context is clearly a fleet position list."

---

### Change 3 — VESSEL EXTRACTION COMPLETENESS

**Text:** `"Extract vessels that appear ONLY in detailed specification blocks, even if absent
from any tabular or summary section at the top of the email."`  
Also: `"Multiple vessels with the same name (e.g., 'TBN', 'TBN 1') are distinct entries."`  
**Intent:** Fix sc-020 (GULF ANGEL + GULF EXPRESS from spec blocks), sc-040 (TBN dedup).

**Result in R8:**

| Scenario | R8 | R10 | R15 | Note |
|----------|----|-----|-----|------|
| sc-020 | 0.792 | 1.000 | 1.000 | Only 6/8 ref vessels extracted |
| sc-040 | 0.806 | 0.917 | 0.917 | TBN dedup still partial |

**Primary cause of -11 null-ref regression:** This rule (combined with Change 4 below) caused
the model to extract `dwt_summer` and `built` from spec blocks in scenarios where the reference
annotation did not include those fields. The R8 harness penalised `model≠null` when `ref=null`.
The following 11 scenarios were passing in R7 (model not over-extracting) and failed in R8:

| Scenario | R8 score | Field affected | ref | model |
|----------|----------|----------------|-----|-------|
| sc-003 | 0.667 | built + dwt | null | 2018 / 4000 |
| sc-005 | 0.833 | built | null | 2025 |
| sc-014 | 0.833 | built | null | 2012 |
| sc-015 | 0.833 | built | null | 2010 |
| sc-021 | 0.833 | built | null | 2012 |
| sc-031 | 0.833 | dwt | null | 10000 |
| sc-041 | 0.833 | dwt | null | 6050 |
| sc-045 | 0.833 | built | null | 2026 |
| sc-047 | 0.833 | dwt | null | 3500 |
| sc-052 | 0.917 | dwt | null | 1600 |
| sc-053 | 0.958 | dwt | null | 3200 |

**Verdict:** **Ineffective for targets + primary source of harness-bug inflation.** The rule
itself is sound (re-applied safely in #311/#312 and working in R10+), but its presence in R8
caused the model to populate more fields, which the broken harness counted as failures.

---

### Change 4 — SUBJECT LINE EXTRACTION

**Text:** `"The email Subject line is a valid source for vessel parameters."`  
**Intent:** Fix sc-049 (subject "10k dwcc mv propus" → DWCC=10000, vessel=PROPUS).

**Result in R8:**

| Scenario | R8 | R10 | R15 | Note |
|----------|----|-----|-----|------|
| sc-049 | 0.833 | 0.833 | 1.000 | Partial improvement but still failing (open_date mismatch) |

**Verdict:** **Neutral / mildly harmful.** No clear regression from this rule alone. sc-049
was already partially failing in R7; the subject line extraction didn't help in R8 either.
The eventual fix (R15) came from unrelated open_date normalisation changes.

---

### Change 5 — FORMATTING MARKERS

**Text:** `"Asterisks (** ... **) and similar decorative markers around vessel sections are
formatting delimiters, NOT template placeholders or empty signals."`  
**Intent:** Fix sc-044 (MV SEA MAJESTY in `**`-wrapped block).

**Result in R8:**

| Scenario | R8 | R10 | R15 | Note |
|----------|----|-----|-----|------|
| sc-044 | 0.667 | 1.000 | 1.000 | SEA MAJESTY (0/1 vessels) — rule did not fire in R8 |

**Verdict:** **Ineffective in R8, but safe.** The wording was too vague in #308 ("similar
decorative markers"). #312's explicit example ("**********\n\nMV SEA MAJESTY\n\n…\n**********")
resolved it. No negative side effects.

---

## Harness Bugs That Inflated the Regression

| Bug | PR Fixed | Affected Scenarios in R8 | Mechanism |
|-----|----------|--------------------------|----|
| null-ref penalisation: `ref=null`, `model≠null` → match=False | #300 | sc-003,005,014,015,021,031,041,045,047,052,053 (11) | Extraction rules caused model to populate more fields |
| M/V prefix not stripped before name comparison | #300 | sc-037 (5 vessels) | "M/V GOYNUK" ≠ "GOYNUK" |
| Ex-name suffix not stripped from vessel name | #300 | sc-029, sc-034 | "MV BBA LARISA'' EX ALI AYKIN" ≠ "MV BBA LARISA" |
| Wrong best-match pairing (swapped order) | #303 | sc-038 (9 vessels) | Vessels matched to wrong reference counterparts |
| Truncation / maxTokens too low | #309 | sc-011,036,042,050 (4 errors) | Response truncated mid-JSON |

**Total harness-bug contamination: ~16 of 27 failing scenarios in R8.**

---

## Per-Scenario Table (Full Corpus)

> R8 = with #308, broken harness  
> R10 = post-revert #310 + safe rules #311/#312, fixed harness  
> R15 = current HEAD (51/56 full matches)

| Scenario | R8 | R10 | R15 | Regression cause |
|----------|----|-----|-----|-----------------|
| sc-001 | 1.000 | 1.000 | 1.000 | — |
| sc-002 | 1.000 | 1.000 | 0.833 | Regressed in R15 (unrelated) |
| sc-003 | 0.667 | 1.000 | ERR | Harness: null-ref built+dwt |
| sc-004 | 1.000 | 1.000 | 1.000 | — |
| sc-005 | 0.833 | 1.000 | 1.000 | Harness: null-ref built |
| sc-006 | 1.000 | 1.000 | 1.000 | — |
| sc-007 | 1.000 | 0.833 | 1.000 | — (R10 regression, fixed R15) |
| sc-008 | 0.833 | 1.000 | 1.000 | Change 1: flag norm ineffective |
| sc-009 | 1.000 | 1.000 | 1.000 | — |
| sc-010 | 1.000 | 1.000 | 1.000 | — |
| sc-011 | ERR | 1.000 | 1.000 | Harness: truncation |
| sc-012 | 1.000 | 1.000 | 1.000 | — |
| sc-013 | 1.000 | 1.000 | 1.000 | — |
| sc-014 | 0.833 | 1.000 | 1.000 | Harness: null-ref built |
| sc-015 | 0.833 | 1.000 | 1.000 | Harness: null-ref built |
| sc-016 | 1.000 | 1.000 | 1.000 | — |
| sc-017 | 1.000 | 1.000 | 1.000 | — |
| sc-018 | 0.933 | ERR | 1.000 | Pre-existing partial (non-#308) |
| sc-019 | 1.000 | 1.000 | 1.000 | — |
| sc-020 | 0.792 | 1.000 | 1.000 | Change 3: spec-block rule ineffective |
| sc-021 | 0.833 | 1.000 | 1.000 | Harness: null-ref built |
| sc-022 | 1.000 | 1.000 | 1.000 | — |
| sc-023 | 1.000 | 1.000 | 1.000 | — |
| sc-024 | 1.000 | 1.000 | 1.000 | — |
| sc-025 | 1.000 | 1.000 | 1.000 | — |
| sc-026 | 1.000 | 1.000 | 1.000 | — |
| sc-027 | 1.000 | 1.000 | 1.000 | — |
| sc-028 | 1.000 | 1.000 | 1.000 | — |
| sc-029 | 0.375 | 0.958 | 1.000 | Change 2: TC rule ineffective + harness ex-name |
| sc-030 | 1.000 | 1.000 | 1.000 | — |
| sc-031 | 0.833 | 1.000 | 0.833 | Harness: null-ref dwt (R15 regression unrelated) |
| sc-032 | 1.000 | 1.000 | 1.000 | — |
| sc-033 | 1.000 | 1.000 | 1.000 | — |
| sc-034 | 0.875 | 1.000 | 0.958 | Change 1: flag norm ineffective |
| sc-035 | 1.000 | 1.000 | 1.000 | — |
| sc-036 | ERR | 1.000 | 1.000 | Harness: truncation |
| sc-037 | 0.833 | 1.000 | 1.000 | Harness: M/V prefix not stripped |
| sc-038 | 0.704 | 0.963 | 1.000 | Harness: wrong vessel pairing (multi-vessel order) |
| sc-039 | 1.000 | 1.000 | 1.000 | — |
| sc-040 | 0.806 | 0.917 | 0.917 | Change 3: TBN dedup partial (still open) |
| sc-041 | 0.833 | 1.000 | 1.000 | Harness: null-ref dwt |
| sc-042 | ERR | 1.000 | 1.000 | Harness: truncation |
| sc-043 | 0.958 | 0.958 | 1.000 | Change 1: flag norm ineffective |
| sc-044 | 0.667 | 1.000 | 1.000 | Change 5: formatting markers ineffective |
| sc-045 | 0.833 | 1.000 | 1.000 | Harness: null-ref built |
| sc-046 | 1.000 | 1.000 | 1.000 | — |
| sc-047 | 0.833 | 1.000 | 1.000 | Harness: null-ref dwt |
| sc-048 | 1.000 | 1.000 | 1.000 | — |
| sc-049 | 0.833 | 0.833 | 1.000 | Change 4: subject DWCC partial (open_date fixed R15) |
| sc-050 | ERR | 1.000 | 1.000 | Harness: truncation |
| sc-051 | 0.944 | 1.000 | 1.000 | Change 1: flag norm ineffective (Navis typo) |
| sc-052 | 0.917 | 1.000 | 1.000 | Harness: null-ref dwt |
| sc-053 | 0.958 | 1.000 | 1.000 | Harness: null-ref dwt |
| sc-054 | 1.000 | 1.000 | 1.000 | — |
| sc-055 | 1.000 | 1.000 | 1.000 | — |
| sc-056 | 1.000 | 1.000 | 1.000 | — |

---

## Failure Attribution Summary

| Root cause | Scenarios | Contribution to –13 |
|------------|-----------|---------------------|
| Harness: null-ref penalisation (ref=null, model≠null) | sc-003,005,014,015,021,031,041,045,047,052,053 | **≈11** |
| Harness: truncation errors (maxTokens) | sc-011,036,042,050 | (some pre-existing) |
| Harness: M/V prefix / ex-name / pairing bugs | sc-037,038,029 | (mixed) |
| Prompt: Change 1 — broad "Always normalize" flag | sc-008,034,043,051 | ≈1–2 (pre-existing + slight worsening) |
| Prompt: Change 2 — broad "Extract ALL" without context guard | sc-029 | indirect |
| Prompt: Changes 3–5 — ineffective but not directly harmful | — | 0 direct; indirect via null-ref trigger |

**Key finding:** #308's rules were primarily harmful through an indirect mechanism — they
caused the model to extract more numeric fields, which triggered the broken null-ref harness.
The rules themselves were largely ineffective for their primary targets. The broad flag
normalization ("Always normalize") was the only change with direct prompt-level harm.

---

## Why the Broad Rules Failed

### "Always normalize" vs. targeted enumeration

#308 instructed the model to apply maritime registry knowledge generically. LLMs respond
better to explicit enumeration:

```
# #308 (failed)
"Always normalize the flag field to the full official country name using maritime registry knowledge."

# #312 (worked — R10 fixes sc-008, 034, 051)
"FLAG EXTRACTION RULES (apply only to these specific cases — do NOT 'normalize' other flag names):
- 'BELIZE CITY' → 'Belize' ...
- 'ST VINCENT' (all-caps abbreviation) → 'Saint Vincent and the Grenadines'..."
```

### "EVERY vessel" vs. context-scoped

The model conflated "fleet position circular" and "cargo inquiry" contexts when told to extract
"regardless of availability." A context guard prevents over-generalisation:

```
# #308 (ineffective)
"Extract EVERY vessel listed in the email, regardless of availability status."

# #312 (worked — R10 fixes sc-029)
"TC VESSELS IN FLEET POSITIONS:
- When an email is a vessel position circular where an owner lists their fleet...
- Only apply this rule when the surrounding context is clearly a fleet position list.
- Do NOT apply in cargo inquiry emails or certificate documents."
```

---

## Current Remaining Failures (R15: 51/56)

| Scenario | R15 score | Issue |
|----------|-----------|-------|
| sc-003 | ERR | Recurring API/truncation error in this scenario |
| sc-002 | 0.833 | Regression introduced post-R10 (unrelated to #308) |
| sc-031 | 0.833 | open_date format edge case |
| sc-034 | 0.958 | ST VINCENT → "Saint Vincent" partial match (judge variant) |
| sc-040 | 0.917 | TBN dedup — two TBN vessels with identical names, different DWT |

---

## Strategy: 1 PR = 1 Rule Change

Lessons from #308→#310→#311→#312 chain:

1. **Enumerate, don't generalise.** Prompt rules must list explicit cases (e.g., "BELIZE CITY → Belize") rather than abstract principles ("use maritime registry knowledge").

2. **Add context guards.** Rules that change extraction scope (extract more / fewer vessels, include TC status) must be gated: "only when surrounding context is a fleet position list."

3. **Eval gate per rule.** Each new rule section must be gated by a before/after eval run with the current fixed harness (R15 baseline = 51/56). A rule that drops full-match count below threshold must be dropped or narrowed.

4. **Track null-ref exposure.** When a new rule is expected to cause the model to extract more fields, verify that the corpus reference data covers those fields. Scenarios where `ref=null` for extracted fields are not a failure — but they were in R8.

5. **Proposed sequence for re-evaluation (if needed):**
   - Change 1 (flag rules): already applied safely in #312. Re-test only for sc-034 regression.
   - Change 2 (TC vessels): already applied safely in #312. Currently at 1.0 for sc-029.
   - Change 3 (spec-block completeness): already applied safely in #311. sc-040 still partial.
   - Change 4 (subject line): already applied safely in #311. sc-049 at 1.0 in R15.
   - Change 5 (formatting markers): already applied safely in #312. sc-044 at 1.0 in R15.

**All 5 changes from #308 have been safely re-applied in #311/#312 with targeted wording.
No further re-implementation is needed for these rules. Next focus: sc-002, sc-031, sc-034,
sc-040 (open issues).**

---

## Appendix: Eval Data Sources

- R8 results: `/root/work/quantika-demo/.progonq/results/etms-parse-vessel-R8.json` (May 20 23:45 — broken harness)
- R10 results: `/root/work/quantika-demo/.progonq/results/etms-parse-vessel-R10.json` (May 21 09:24 — fixed harness)
- R15 results: `/root/work/quantika-demo/.progonq/results/etms-parse-vessel-R15.json` (May 21 16:36 — current baseline)
- Corpus: `.progonq/corpus/etms-parse-vessel/` (56 scenarios)
- Harness fixes: #300 (null-ref tolerance, M/V norm, ex-name strip), #303 (pairing), #304 (flag judge), #309 (truncation), #313/#314 (normalizeFlag)
