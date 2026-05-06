# Wave γ Parsing Bake-off Report
**Run ID:** 2026-05-06T10-38-07-147Z
**Generated:** 2026-05-06T10:42:19.588Z

## Per-endpoint winners
| Endpoint | Winner | Cost/1k | Parity+Better | Flags | Rationale |
| --- | --- | --- | --- | --- | --- |
| parse-vessel | gemini-2.5-flash | $3.1858 | 84.0% | practical-gate, single-passing | Cheapest qualifying model. passRate=100.0% (practical gate 80%, 0 crit), cost/1k=$3.1858, p50 latency=6819ms. |

## Full aggregation matrix
| Endpoint | Model | Cases | Pass% | Parity% | Better% | Degraded% | Marginal% | Fail% | ModelErr% | ParseErr% | JudgeErr% | Crit | Cost/1k | Lat p50 | Lat p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| parse-vessel | gemini-2.5-flash | 25 | 100.0 | 84.0 | 0.0 | 16.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0 | $3.1858 | 6819ms | 16181ms |

## Production rollout recommendations

```bash
# parse-vessel: gemini-2.5-flash
PARSE_VESSEL_PROVIDER=gemini
PARSE_VESSEL_MODEL=gemini-2.5-flash
```

## Notes
- Mode used: A
- Gate applied: 85%
- Disqualified for parse-vessel: none
