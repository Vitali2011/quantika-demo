# Changelog

All notable changes to this project are documented here (format: Keep a Changelog).

## [Unreleased]

### Added
- add SQLite MCP for local DB debugging
- C1a — +4 charters (NYPE 1946, SHELLVOY 6, BALTIME, CONGENBILL) [code-only] (#319)
- M3 bulk actions polish — filter persistence, select-all, CSV export [code-only] (#317)
- on-the-fly searoute tier 3 + LRU cache (B5b) [code-only] (#289)
- pre-populated searoute JSON + tier 2 lookup (B5a) [code-only] (#288)
- add freight_rate_usd field to parse-cargo (A2) [code-only] (#286)

### Changed
- parse-vessel — flag normalization, TC vessels, subject DWCC, TBN duplicates, SSL format (#308)" (#310)
- add pre-merge-guard workflow [deploy-affects] (#302)

### Fixed
- parse-vessel R15 — Marshall Flag norm + Madeira verbatim + UNNAMED VESSEL GUARD precision (#320)
- parse-vessel R11 — Madeira revert + unnamed vessel guard + DWCC subject (3/3 applied) (#315)
- parse-vessel runner — normalizeFlag prefix match for island state abbreviations (#314)
- parse-vessel runner — normalizeFlag (&→and, St→Saint) for annotation variance (#313)
- parse-vessel R8+ — selective recovery from reverted #308 [code-only] (#312)
- parse-vessel R9 — safe prompt rules (6/6 rules applied) (#311)
- parse-vessel truncation — maxTokens 16384 + schema maxLength + judge error fix (#309)
- parse-vessel — flag normalization, TC vessels, subject DWCC, TBN duplicates, SSL format (#308)
- parse-vessel runner — increase MAX_BODY_CHARS 5000→8000 for long fleet emails (#307)
- parse-vessel — items=[] for PPS/HOME TONNAGE/slash-separated patterns (R7) (#306)
- parse-vessel judge — LLM flag equivalence (ST VINCENT, Belize, Madeira) (#304)
- parse-vessel runner — best-match vessel pairing (fix swapped order) (#303)
- parse-vessel runner — M/V normalization + ex-name strip + null ref tolerance (#300)
- parse-vessel R5 — open_date no-year-inference + display title-case (#298)
- aria-valuetext space + mobile SAN badge overflow (#297)
- sample data session not recognized on /matches (#296)
- add /more page with logout button (#295)
- parse-vessel dwcc nullable — allow null when not explicitly stated (#290)
- cap LLM retries on parse-vessel to reduce latency (A1) (#285)
- parse-vessel R3 — open_date structured type + dwcc null rule (#287)
- parse-vessel R2 — vessel-seeking-cargo extraction rule (#284)
- use PAT for CI-nudge push in auto-rebase workflow (D5) [code-only] (#283)
- remove us.anthropic cross-region prefix causing 524 timeouts (C5) [code-only] (#282)
- aria-labels + plan constants + touch targets F2-F4 (#47) (#280)


