# Wave γ Parsing Bake-off Report
**Run ID:** 2026-05-06T10-24-01-569Z
**Generated:** 2026-05-06T10:28:30.576Z

## Per-endpoint winners
| Endpoint | Winner | Cost/1k | Parity+Better | Flags | Rationale |
| --- | --- | --- | --- | --- | --- |
| parse-vessel | DEFERRED | — | — | practical-gate | No qualifying model: 1 model(s) had critical issues. |

## Full aggregation matrix
| Endpoint | Model | Cases | Pass% | Parity% | Better% | Degraded% | Marginal% | Fail% | ModelErr% | ParseErr% | JudgeErr% | Crit | Cost/1k | Lat p50 | Lat p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| parse-vessel | gemini-2.5-flash | 25 | 96.0 | 84.0 | 0.0 | 12.0 | 0.0 | 4.0 | 0.0 | 0.0 | 0.0 | 1 | $2.9798 | 6487ms | 17889ms |

## Production rollout recommendations

```bash
# parse-vessel: DEFERRED — No qualifying model: 1 model(s) had critical issues.
# PARSE_VESSEL_PROVIDER=gemini
# PARSE_VESSEL_MODEL=<no-winner>
```

## Notes
- Mode used: A
- Gate applied: 85%
- Disqualified for parse-vessel: gemini-2.5-flash
