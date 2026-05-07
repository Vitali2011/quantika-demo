# Wave γ Parsing Bake-off Report
**Run ID:** 2026-05-05T20-28-09-548Z
**Generated:** 2026-05-05T22:06:50.964Z

## Per-endpoint winners
| Endpoint | Winner | Cost/1k | Parity+Better | Flags | Rationale |
| --- | --- | --- | --- | --- | --- |
| classify | DEFERRED | — | — | mode-b | No qualifying model: 2 model(s) had critical issues; 1 model(s) below 80% parity+better gate. |
| parse-cargo | DEFERRED | — | — | mode-b | No qualifying model: 3 model(s) had critical issues. |
| parse-recap | DEFERRED | — | — | mode-b | No qualifying model: 1 model(s) had critical issues; 2 model(s) below 80% parity+better gate. |
| parse-vessel | DEFERRED | — | — | mode-b | No qualifying model: 3 model(s) had critical issues. |

## Full aggregation matrix
| Endpoint | Model | Cases | Pass% | Parity% | Better% | Degraded% | Marginal% | Fail% | ModelErr% | ParseErr% | JudgeErr% | Crit | Cost/1k | Lat p50 | Lat p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| classify | gemini-2.5-flash-lite | 27 | 96.3 | 7.4 | 22.2 | 0.0 | 66.7 | 3.7 | 0.0 | 0.0 | 0.0 | 1 | $0.4517 | 1568ms | 1837ms |
| classify | gemini-2.5-flash | 27 | 96.3 | 3.7 | 18.5 | 11.1 | 63.0 | 3.7 | 0.0 | 0.0 | 0.0 | 0 | $1.5308 | 8012ms | 11792ms |
| classify | gemini-2.5-pro | 27 | 92.6 | 7.4 | 7.4 | 7.4 | 70.4 | 3.7 | 0.0 | 0.0 | 3.7 | 5 | $6.2275 | 16015ms | 25291ms |
| parse-cargo | gemini-2.5-flash-lite | 24 | 54.2 | 0.0 | 8.3 | 25.0 | 20.8 | 41.7 | 0.0 | 0.0 | 4.2 | 11 | $0.7090 | 2481ms | 4558ms |
| parse-cargo | gemini-2.5-flash | 24 | 100.0 | 0.0 | 16.7 | 33.3 | 50.0 | 0.0 | 0.0 | 0.0 | 0.0 | 1 | $3.5723 | 17719ms | 45244ms |
| parse-cargo | gemini-2.5-pro | 24 | 70.8 | 0.0 | 12.5 | 16.7 | 41.7 | 0.0 | 25.0 | 4.2 | 0.0 | 1 | $10.8724 | 39929ms | 60004ms |
| parse-recap | gemini-2.5-flash-lite | 22 | 77.3 | 0.0 | 0.0 | 59.1 | 18.2 | 13.6 | 0.0 | 4.5 | 4.5 | 3 | $0.9135 | 4180ms | 8299ms |
| parse-recap | gemini-2.5-flash | 22 | 90.9 | 0.0 | 0.0 | 77.3 | 13.6 | 0.0 | 0.0 | 4.5 | 4.5 | 0 | $5.1723 | 19304ms | 35076ms |
| parse-recap | gemini-2.5-pro | 22 | 100.0 | 0.0 | 0.0 | 77.3 | 22.7 | 0.0 | 0.0 | 0.0 | 0.0 | 0 | $21.7244 | 35861ms | 50487ms |
| parse-vessel | gemini-2.5-flash-lite | 25 | 44.0 | 12.0 | 8.0 | 4.0 | 20.0 | 48.0 | 0.0 | 4.0 | 4.0 | 21 | $0.7664 | 2291ms | 3570ms |
| parse-vessel | gemini-2.5-flash | 25 | 64.0 | 8.0 | 8.0 | 8.0 | 40.0 | 20.0 | 0.0 | 16.0 | 0.0 | 13 | $2.2817 | 6914ms | 19906ms |
| parse-vessel | gemini-2.5-pro | 25 | 60.0 | 8.0 | 12.0 | 12.0 | 28.0 | 0.0 | 0.0 | 40.0 | 0.0 | 6 | $9.4711 | 13238ms | 26984ms |

## Production rollout recommendations

```bash
# classify: DEFERRED — No qualifying model: 2 model(s) had critical issues; 1 model(s) below 80% parity+better gate.
# CLASSIFY_PROVIDER=gemini
# CLASSIFY_MODEL=<no-winner>
# parse-cargo: DEFERRED — No qualifying model: 3 model(s) had critical issues.
# PARSE_CARGO_PROVIDER=gemini
# PARSE_CARGO_MODEL=<no-winner>
# parse-recap: DEFERRED — No qualifying model: 1 model(s) had critical issues; 2 model(s) below 80% parity+better gate.
# PARSE_RECAP_PROVIDER=gemini
# PARSE_RECAP_MODEL=<no-winner>
# parse-vessel: DEFERRED — No qualifying model: 3 model(s) had critical issues.
# PARSE_VESSEL_PROVIDER=gemini
# PARSE_VESSEL_MODEL=<no-winner>
```

## Notes
- Mode used: B
- Gate applied: 80%
- Disqualified for classify: gemini-2.5-pro, gemini-2.5-flash-lite
- Disqualified for parse-cargo: gemini-2.5-flash-lite, gemini-2.5-pro, gemini-2.5-flash
- Disqualified for parse-recap: gemini-2.5-flash-lite
- Disqualified for parse-vessel: gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite
