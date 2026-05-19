# etms-match corpus (R0 baseline)

**Scenarios:** 11
**Built:** 2026-05-19 (Opus 4.7 composed)
**Source:** existing parse-cargo + parse-vessel scenarios paired manually

## Categories

| Category | Count | Purpose                                                                  |
| -------- | ----- | ------------------------------------------------------------------------ |
| strong   | 3     | Should be 'good' match_level (score 70-90)                               |
| marginal | 3     | Should be 'possible' (score 35-70), tests under-lift/timing/long-ballast |
| weak     | 3     | Should be 'weak' (score 5-35), tests idle days/late vessel               |
| no-match | 2     | MUST be hard-filtered before LLM (size impossible)                       |

## Scenarios

| ID  | Category | Cargo | Vessel | Expected level | Score range |
| --- | -------- | ----- | ------ | -------------- | ----------- |
| 001 | strong   | C042  | V004   | good           | 70-90       |
| 002 | strong   | C024  | V048   | good           | 70-88       |
| 003 | strong   | C030  | V028   | possible       | 55-78       |
| 004 | marginal | C018  | V020   | possible       | 35-65       |
| 005 | marginal | C054  | V036   | possible       | 40-70       |
| 006 | marginal | C060  | V012   | possible       | 35-60       |
| 007 | weak     | C066  | V040   | weak           | 10-35       |
| 008 | weak     | C006  | V052   | weak           | 5-30        |
| 009 | weak     | C036  | V008   | weak           | 10-30       |
| 010 | no-match | C012  | V036   | —              | —           |
| 011 | no-match | C054  | V004   | —              | —           |

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
