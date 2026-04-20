# Skeptical Forwarder Audit Report

**Date:** 2026-04-20T11:08:25.081Z
**Target:** https://demo.quantika.org
**Pipeline status:** COMPLETED
**Expected data:** __tests__/fixtures/test-suite-50/expected.json (50 emails)

## Summary

| Metric | Count |
|--------|-------|
| Total checks | 137 |
| FAIL | 1 |
| SUSPECT | 2 |
| INFO | 6 |

## Verdict

**NEEDS ATTENTION** — 1 hard failures found. These represent definitive data quality issues.

## FAIL — Hard Failures

### [sample-18] laycan_direction
- **Expected:** end 2026-09-15 >= start 2026-09-30
- **Actual:** start=2026-09-30 end=2026-09-15
- **Evidence:** Laycan from expected.json


## SUSPECT — Requires Investigation

### [sample-21] cargo_contradiction_flagged
- **Expected:** contradiction/mismatch flag
- **Actual:** NOT shown
- **Evidence:** body mentions 25,000 mts wheat AND 3,000 mts urea but total stow listed as 25,000 mts — quantity mismatch must be flagged

### [sample-23] draft_constraint_fail_shown
- **Expected:** draft constraint fail shown
- **Actual:** NOT shown — check for spurious match
- **Evidence:** 30,000 mt grain vessel needs ~10-11m draft, Beira max draft is 8.0m — DRAFT_CONSTRAINT_FAIL expected


## INFO — Notes

- **[sample-35] cargo_restrictions_match_pool:** no matches shown
  - expected: very limited matches due to restrictions
  - evidence: no tank-cleaned, no grabs, no coal, no steel scrap eliminates major bulk cargo categories
- **[sample-38] hallucinated_vessel_pattern:** IMO 9280495 shown in UI
  - expected: Equasis lookup returns different/no vessel for sequential suffix name
  - evidence: Generic name 'MV PACIFIC STAR 9' with sequential suffix is a hallucination pattern. Equasis lookup for IMO 9280495 should return a different vessel or no match.
- **[sample-41] sample41_demurrage_currency:** EUR 5,500 shown
  - expected: EUR 5,500 PDPR
  - evidence: Body: "Demurrage: EUR 5,500 PDPR"
- **[sample-47] sample47_subs_deadline:** subs mention only
  - expected: deadline 2026-04-10 (2026-04-08 + 2 banking days)
  - evidence: Subs overdue (today 2026-04-20, deadline was 2026-04-10)
- **[sample-24] sanctions_handling:** sanction flag shown
  - expected: blocked or no match
  - evidence: Novorossiysk→Hamburg sanctions
- **[COMMISSION_PAGE] eur_commissions_present:** EUR NOT present — sample-41 commission may be calculated in USD
  - expected: EUR commission from sample-41 (EUR 31/mt × 4200mt × 3.75%)
  - evidence: sample-41: Figueira da Foz → Alexandria, EUR 31.00/mt, 3.75% commission = EUR 4,882.50

## IMO Checksum Reference

IMO 1234566 (sample-37) expected checksum computation:
- Digits: 1 2 3 4 5 6 | check=6
- Sum: 1×7 + 2×6 + 3×5 + 4×4 + 5×3 + 6×2 = 7+12+15+16+15+12 = 77
- 77 mod 10 = 7 ≠ last digit 6 → **INVALID**
- App MUST refuse Equasis enrichment for this IMO

## Adversarial Cases Checked

### sample-12 — ✅ No findings

### sample-15 — ✅ No findings

### sample-18 — 🔴 FAIL
- **[FAIL] laycan_direction:** start=2026-09-30 end=2026-09-15

### sample-19 — ✅ No findings

### sample-20 — ✅ No findings

### sample-21 — 🟡 SUSPECT
- **[SUSPECT] cargo_contradiction_flagged:** NOT shown

### sample-22 — ✅ No findings

### sample-23 — 🟡 SUSPECT
- **[SUSPECT] draft_constraint_fail_shown:** NOT shown — check for spurious match

### sample-24 — 🔵 INFO only
- **[INFO] sanctions_handling:** sanction flag shown

### sample-33 — ✅ No findings

### sample-34 — ✅ No findings

### sample-35 — 🔵 INFO only
- **[INFO] cargo_restrictions_match_pool:** no matches shown

### sample-37 — ✅ No findings

### sample-38 — 🔵 INFO only
- **[INFO] hallucinated_vessel_pattern:** IMO 9280495 shown in UI

### sample-39 — ✅ No findings

### sample-41 — 🔵 INFO only
- **[INFO] sample41_demurrage_currency:** EUR 5,500 shown

### sample-44 — ✅ No findings

### sample-45 — ✅ No findings

### sample-47 — 🔵 INFO only
- **[INFO] sample47_subs_deadline:** subs mention only
