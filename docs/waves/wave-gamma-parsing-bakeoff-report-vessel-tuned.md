# Wave γ Parsing Bake-off Report
**Run ID:** 2026-05-06T09-38-40-868Z
**Generated:** 2026-05-06T09:49:59.649Z

## Per-endpoint winners
| Endpoint | Winner | Cost/1k | Parity+Better | Flags | Rationale |
| --- | --- | --- | --- | --- | --- |
| parse-vessel | DEFERRED | — | — | practical-gate | No qualifying model: 2 model(s) had critical issues. |

## Full aggregation matrix
| Endpoint | Model | Cases | Pass% | Parity% | Better% | Degraded% | Marginal% | Fail% | ModelErr% | ParseErr% | JudgeErr% | Crit | Cost/1k | Lat p50 | Lat p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| parse-vessel | gemini-2.5-flash-lite | 21 | 81.0 | 71.4 | 0.0 | 9.5 | 0.0 | 14.3 | 0.0 | 0.0 | 4.8 | 3 | $0.7581 | 2174ms | 3354ms |
| parse-vessel | gemini-2.5-flash | 22 | 90.9 | 90.9 | 0.0 | 0.0 | 0.0 | 4.5 | 0.0 | 0.0 | 4.5 | 1 | $2.1840 | 4886ms | 10722ms |

## Production rollout recommendations

```bash
# parse-vessel: DEFERRED — No qualifying model: 2 model(s) had critical issues.
# PARSE_VESSEL_PROVIDER=gemini
# PARSE_VESSEL_MODEL=<no-winner>
```

## Notes
- Mode used: A
- Gate applied: 85%
- Disqualified for parse-vessel: gemini-2.5-flash-lite, gemini-2.5-flash
