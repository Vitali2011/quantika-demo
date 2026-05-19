# etms-match corpus (R1-calibrated + Phase D3 expansion)

**Scenarios:** 25 (11 R1-baseline + 14 D3-expansion)
**Built:** 2026-05-19 (Opus 4.7 composed, R1-calibrated; D3 expansion added 2026-05-19)
**Source:** existing parse-cargo + parse-vessel scenarios paired manually

## Categories

| Category | Count | Purpose                                                                                |
| -------- | ----- | -------------------------------------------------------------------------------------- |
| strong   | 3     | Should be 'good' or upper 'possible' match_level (score 60+)                           |
| marginal | 5     | Should be 'possible' (score 30-70), tests under-lift/timing/long-ballast/fanout        |
| weak     | 6     | Should be 'weak' (score 5-40), tests idle/late/sparse/under-utilization                |
| no-match | 11    | MUST be hard-filtered before LLM (size/draft/sanctions/cargo-type incompat)            |

## Scenarios

| ID  | Category | Cargo | Vessel | Expected level | Score range | Trigger                                |
| --- | -------- | ----- | ------ | -------------- | ----------- | -------------------------------------- |
| 001 | no-match | C042  | V004   | —              | —           | DWCC overload                          |
| 002 | strong   | C024  | V048   | good           | 60-85       | East Med bulk spot                     |
| 003 | strong   | C030  | V028   | possible       | 45-75       | Aliaga→Varna geared                    |
| 004 | marginal | C018  | V020   | possible       | 35-65       | Long-ballast                           |
| 005 | no-match | C054  | V036   | —              | —           | Vessel draft exceeds Sfax              |
| 006 | marginal | C060  | V012   | possible       | 40-70       | Red Sea→East Med tight                 |
| 007 | weak     | C066  | V040   | weak           | 10-35       | Idle months                            |
| 008 | no-match | C006  | V052   | —              | —           | Severe under-lift                      |
| 009 | weak     | C036  | V008   | weak           | 10-30       | Late vessel                            |
| 010 | no-match | C012  | V036   | —              | —           | Undersized + wrong region              |
| 011 | no-match | C054  | V004   | —              | —           | Tiny vessel                            |
| 012 | no-match | C091  | V011   | —              | —           | Sanctions HIGH (no Ukraine + Odesa)    |
| 013 | no-match | C088  | V049   | —              | —           | Sanctions HIGH (no Ukraine voyage)     |
| 014 | no-match | C009  | V036   | —              | —           | Draft (Izmail 7.1m < 10.55m)           |
| 015 | no-match | C078  | V027   | —              | —           | Draft (Reni 7.0m < 9.573m)             |
| 016 | marginal | C037  | V027   | possible       | 30-65       | Multi-cargo fanout (6 items)           |
| 017 | weak     | C059  | V046   | weak           | 5-35        | Multi-cargo sparse fanout (11 items)   |
| 018 | marginal | C024  | V020   | possible       | 35-70       | Multi-vessel fanout (8 vessels)        |
| 019 | weak     | C022  | V018   | weak           | 10-40       | Multi-vessel under-lift (10 vessels)   |
| 020 | no-match | C001  | V011   | —              | —           | PROJECT cargo on BULK CARRIER          |
| 021 | no-match | C002  | V011   | —              | —           | BREAK_BULK cargo on BULK CARRIER       |
| 022 | weak     | C083  | V026   | weak           | 10-40       | Russia route, NO flag-block (anti-halluc) |
| 023 | strong   | C022  | V035   | good           | 70-90       | Perfect spot Savona→Samsun 99% fit     |
| 024 | marginal | C015  | V026   | possible       | 35-70       | Spot-aligned long ballast              |
| 025 | weak     | C026  | V013   | weak           | 5-35        | Sparse cargo (null weight)             |

## D3 expansion rationale (12-25)

Broadens coverage from 11 baseline pairs (mostly DWCC/draft hard-filters + simple bulk pairs) to test:

- **Sanctions path** (012, 013) — vessel.restrictions regex match on UA route, blocking=true (different from baseline's size/draft hard-filters)
- **Draft origin-port** (014, 015) — shallow ports (Izmail UAIZM 7.1m, Reni UAREN 7.0m) blocking deep-draft vessels
- **Multi-item fanout** (016, 017, 018, 019) — cargo-emails with 6-11 items and vessel-emails with 8-10 vessels; tests pair-analyzer evaluates each pairing independently
- **Cargo-type compatibility matrix** (020, 021) — PROJECT and BREAK_BULK on BULK CARRIER, hard-filter via checkCargoVesselCompat
- **Sanctions-citation guard** (022) — Russia origin without RU-flagged vessel must NOT produce sanctions citation (parser hallucination guard)
- **Upper-bound strong** (023) — 99% size fit + 3-day ballast + spot/spot alignment, tests scoring head-room
- **Long-ballast marginal** (024) — 10+ day Atlantic→Black Sea reposition; readiness boundary
- **Sparse data weak** (025) — null cargo weight, gearless vessel; tests robustness against missing fields

## Calibration changelog (R0 → R1)

| Scenario | R0 → R1 change                         | Reason                                                |
| -------- | -------------------------------------- | ----------------------------------------------------- |
| 001      | strong → no-match                      | DWCC overload (2000 < 2500) — should be hard-filtered |
| 002      | strong (range widened 70-88 → 60-85)   | Phase 2D port DB will help, R1 still bottlenecked     |
| 003      | possible (range widened 55-78 → 45-75) | Phase 2D port DB will help                            |
| 004      | unchanged                              | works as-is                                           |
| 005      | marginal → no-match                    | Vessel draft exceeds Sfax port max                    |
| 006      | possible (range widened 35-60 → 40-70) | parser slightly more generous than expected           |
| 007      | weak (prescriptive, kept)              | parser too lenient on idle — FINDING                  |
| 008      | weak → no-match                        | Severe under-lift (200% overload)                     |
| 009      | weak (prescriptive, kept)              | parser too lenient on late vessels — FINDING          |
| 010      | unchanged                              | now correctly hard-filtered (PR #236) ✓               |
| 011      | unchanged                              | now correctly hard-filtered (PR #236) ✓               |

## Eval contract (judge must check 4 things per scenario)

1. **score in range** (only if `score_range` not null) — actual score within [min, max]?
2. **match_level matches** (only if not null) — exact string match.
3. **must_cite_facts present** — at least one of these substrings appears in match_reasons (semantic fuzzy OK).
4. **must_NOT_invent absent** — none of these patterns appear in reasons or issues (hallucination check).

For `no-match` category: scenario passes if pair does NOT appear in `matches[]` array (and ideally appears in `blockedMatches[]`).

## Common hallucination guards (applied to all scenarios)

- P&I IG-club satisfied — only valid if vessel input has pi_club field
- Hold cleanliness restriction — only valid if cargo.restrictions[] literally contains it
- Charterer-specific policy (e.g., 'Cargill strict on CII') — never allowed from external knowledge
- Vetting clearance — only valid if vessel input has vetting fields
- Sanctions risk citation — only valid if vessel flag is RU/IR/BY/CU/MM or vessel.restrictions matches a regex on a route country
