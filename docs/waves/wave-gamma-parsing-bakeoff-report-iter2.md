# Wave γ Parsing Bake-off Report
**Run ID:** 2026-05-06T08-26-21-395Z
**Generated:** 2026-05-06T09:18:40.446Z

## Per-endpoint winners
| Endpoint | Winner | Cost/1k | Parity+Better | Flags | Rationale |
| --- | --- | --- | --- | --- | --- |
| classify | DEFERRED | — | — | — | No qualifying model: 2 model(s) below 85% parity+better gate. |
| parse-cargo | DEFERRED | — | — | — | No qualifying model: 1 model(s) had critical issues; 1 model(s) below 85% parity+better gate. |
| parse-recap | DEFERRED | — | — | — | No qualifying model: 2 model(s) below 85% parity+better gate. |
| parse-vessel | DEFERRED | — | — | — | No qualifying model: 2 model(s) had critical issues. |

## Full aggregation matrix
| Endpoint | Model | Cases | Pass% | Parity% | Better% | Degraded% | Marginal% | Fail% | ModelErr% | ParseErr% | JudgeErr% | Crit | Cost/1k | Lat p50 | Lat p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| classify | gemini-2.5-flash-lite | 27 | 96.3 | 48.1 | 0.0 | 40.7 | 7.4 | 0.0 | 0.0 | 0.0 | 3.7 | 0 | $0.4532 | 1615ms | 2204ms |
| classify | gemini-2.5-flash | 27 | 96.3 | 59.3 | 0.0 | 29.6 | 7.4 | 0.0 | 3.7 | 0.0 | 0.0 | 0 | $1.4917 | 8132ms | 11454ms |
| parse-cargo | gemini-2.5-flash-lite | 24 | 87.5 | 8.3 | 0.0 | 70.8 | 8.3 | 4.2 | 0.0 | 0.0 | 8.3 | 1 | $0.7542 | 3000ms | 5070ms |
| parse-cargo | gemini-2.5-flash | 24 | 87.5 | 41.7 | 0.0 | 45.8 | 0.0 | 0.0 | 8.3 | 0.0 | 4.2 | 0 | $3.3878 | 20151ms | 60003ms |
| parse-recap | gemini-2.5-flash-lite | 22 | 90.9 | 0.0 | 0.0 | 90.9 | 0.0 | 0.0 | 0.0 | 0.0 | 9.1 | 0 | $0.9186 | 4389ms | 7125ms |
| parse-recap | gemini-2.5-flash | 22 | 100.0 | 13.6 | 4.5 | 77.3 | 4.5 | 0.0 | 0.0 | 0.0 | 0.0 | 0 | $5.3620 | 21204ms | 34294ms |
| parse-vessel | gemini-2.5-flash-lite | 25 | 68.0 | 28.0 | 0.0 | 36.0 | 4.0 | 12.0 | 0.0 | 4.0 | 16.0 | 1 | $0.7598 | 2939ms | 4928ms |
| parse-vessel | gemini-2.5-flash | 25 | 80.0 | 48.0 | 0.0 | 32.0 | 0.0 | 0.0 | 0.0 | 12.0 | 8.0 | 1 | $2.4336 | 8259ms | 23408ms |

## Production rollout recommendations

```bash
# classify: DEFERRED — No qualifying model: 2 model(s) below 85% parity+better gate.
# CLASSIFY_PROVIDER=gemini
# CLASSIFY_MODEL=<no-winner>
# parse-cargo: DEFERRED — No qualifying model: 1 model(s) had critical issues; 1 model(s) below 85% parity+better gate.
# PARSE_CARGO_PROVIDER=gemini
# PARSE_CARGO_MODEL=<no-winner>
# parse-recap: DEFERRED — No qualifying model: 2 model(s) below 85% parity+better gate.
# PARSE_RECAP_PROVIDER=gemini
# PARSE_RECAP_MODEL=<no-winner>
# parse-vessel: DEFERRED — No qualifying model: 2 model(s) had critical issues.
# PARSE_VESSEL_PROVIDER=gemini
# PARSE_VESSEL_MODEL=<no-winner>
```

## Notes
- Mode used: A
- Gate applied: 85%
- Disqualified for classify: none
- Disqualified for parse-cargo: gemini-2.5-flash-lite
- Disqualified for parse-recap: none
- Disqualified for parse-vessel: gemini-2.5-flash-lite, gemini-2.5-flash
