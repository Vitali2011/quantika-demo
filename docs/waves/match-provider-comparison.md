# Match Endpoint — Provider Comparison (γv-06)

Per-scenario regression table for `POST /api/ai/match` across three providers.  
Real numbers fill in during production regression runs; this file tracks the structure.

## Provider Config

| Provider              | Env                      | Model                                                                     | Notes                           |
| --------------------- | ------------------------ | ------------------------------------------------------------------------- | ------------------------------- |
| **bedrock** (default) | `MATCH_PROVIDER=bedrock` | `BEDROCK_MODEL_ID` (default `us.anthropic.claude-opus-4-7-20260415-v1:0`) | Claude Opus 4.7 via AWS Bedrock |
| **openai** (rollback) | `MATCH_PROVIDER=openai`  | `AI_MODEL_HEAVY` (default `gpt-5.5`)                                      | ClipProxy, immediate rollback   |
| **gemini** (fallback) | `MATCH_PROVIDER=gemini`  | `AI_MODEL_GEMINI_DEFAULT` (default `gemini-2.5-flash`)                    | Vertex AI, AWS outage fallback  |

## Score Deviation Budget

Target: median absolute score deviation ≤ 5 pts between openai baseline and bedrock Claude.  
Alert threshold: any single scenario deviation > 15 pts is flagged as regression.

## Per-Scenario Comparison Table

> Status: STUB — populate during first production regression run.
> Run: `MATCH_PROVIDER=openai npm run regression:match` then `MATCH_PROVIDER=bedrock npm run regression:match`

| Scenario ID | Pair Description                                      | OpenAI Score | Bedrock Score | Gemini Score | OpenAI Level | Bedrock Level | Gemini Level | Score Dev (OAI-BDR) | MANDATORY ISSUES Coverage  | Notes |
| ----------- | ----------------------------------------------------- | ------------ | ------------- | ------------ | ------------ | ------------- | ------------ | ------------------- | -------------------------- | ----- |
| S-01        | Bulk grain / Handysize, ideal timing                  | —            | —             | —            | —            | —             | —            | —                   | —                          | Stub  |
| S-02        | Bulk grain / Supramax, tight timing                   | —            | —             | —            | —            | —             | —            | —                   | —                          | Stub  |
| S-03        | Break-bulk / MPP vessel, good fit                     | —            | —             | —            | —            | —             | —            | —                   | —                          | Stub  |
| S-04        | Iron ore / Capesize, DWCC violation                   | —            | —             | —            | —            | —             | —            | —                   | DWCC_VIOLATION must appear | Stub  |
| S-05        | Fertilizer / Gearless at ungeared port                | —            | —             | —            | —            | —             | —            | —                   | CRANE_VIOLATION            | Stub  |
| S-06        | Grain / RU-flagged vessel, EU cargo                   | —            | —             | —            | —            | —             | —            | —                   | Sanction flag              | Stub  |
| S-07        | Soybean meal / vessel last_cargo Petcoke              | —            | —             | —            | —            | —             | —            | —                   | LAST_CARGO_INCOMPATIBLE    | Stub  |
| S-08        | Steel coils / laycan violation                        | —            | —             | —            | —            | —             | —            | —                   | LAYCAN_VIOLATION           | Stub  |
| S-09        | Cargo with CII-D/E restriction / CII-D vessel         | —            | —             | —            | —            | —             | —            | —                   | CII grade issue            | Stub  |
| S-10        | Volume overflow: cargo weight > grain capacity        | —            | —             | —            | —            | —             | —            | —                   | Volume math in issues      | Stub  |
| S-11        | GAP_DAYS=0 + strict laycan                            | —            | —             | —            | —            | —             | —            | —                   | GAP_DAYS cap enforced      | Stub  |
| S-12        | Unknown timing (readiness.verdict=unknown)            | —            | —             | —            | —            | —             | —            | —                   | verdict cited              | Stub  |
| S-13        | Multiple cargo restrictions, all surfaced             | —            | —             | —            | —            | —             | —            | —                   | All restrictions[] items   | Stub  |
| S-14        | Vessel last_cargo unknown, food-grade cargo           | —            | —             | —            | —            | —             | —            | —                   | uncertainty flagged        | Stub  |
| S-15        | Sub-day buffer + strict laycan                        | —            | —             | —            | —            | —             | —            | —                   | SUB_DAY_BUFFER cap         | Stub  |
| S-16        | Vessel speed null — class-default fallback            | —            | —             | —            | —            | —             | —            | —                   | speed_null flagged         | Stub  |
| S-17        | Perfect 4-factor match (geography+DWT+gear+timing)    | —            | —             | —            | —            | —             | —            | —                   | score ≥ 70 expected        | Stub  |
| S-18        | Sanctioned owner in vessel.owner field                | —            | —             | —            | —            | —             | —            | —                   | owner sanction surfaced    | Stub  |
| S-19        | Multiple violations (DWCC + LAYCAN) — lowest cap wins | —            | —             | —            | —            | —             | —            | —                   | score ≤ 20 (min cap)       | Stub  |
| S-20        | Idle vessel (gap_days > 10)                           | —            | —             | —            | —            | —             | —            | —                   | idle days in issues        | Stub  |
| S-21        | Cargo weight range 4,000-4,800 mt (uncertain)         | —            | —             | —            | —            | —             | —            | —                   | uncertainty flagged        | Stub  |
| S-22        | Breakbulk + gearless vessel + port has cranes         | —            | —             | —            | —            | —             | —            | —                   | crane availability         | Stub  |
| S-23        | TCT request cargo vs bulk carrier                     | —            | —             | —            | —            | —             | —            | —                   | cargo-vessel type          | Stub  |
| S-24        | Vessel flag BY, cargo to US port                      | —            | —             | —            | —            | —             | —            | —                   | BY sanction                | Stub  |
| S-25        | DWT exact match (0% margin)                           | —            | —             | —            | —            | —             | —            | —                   | margin note                | Stub  |
| S-26        | LLM omits pair — deterministic sweep fills            | —            | —             | —            | —            | —             | —            | —                   | sweep coverage             | Stub  |
| S-27        | grain after grain (last_cargo = wheat, cargo = corn)  | —            | —             | —            | —            | —             | —            | —                   | NO issue expected          | Stub  |
| S-28        | Old vessel position (>7 days stale)                   | —            | —             | —            | —            | —             | —            | —                   | stale flag                 | Stub  |
| S-29        | Large batch: 10 cargos × 5 vessels = 50 pairs         | —            | —             | —            | —            | —             | —            | —                   | all 50 pairs returned      | Stub  |
| S-30        | Edible oil before non-DPP last_cargo                  | —            | —             | —            | —            | —             | —            | —                   | DPP issue                  | Stub  |
| S-31        | Hold height violation (HOLD_HEIGHT_VIOLATION)         | —            | —             | —            | —            | —             | —            | —                   | score ≤ 30                 | Stub  |
| S-32        | No-TBN restriction, vessel has TBN                    | —            | —             | —            | —            | —             | —            | —                   | TBN violation              | Stub  |
| S-33        | No-TBN restriction, vessel is named                   | —            | —             | —            | —            | —             | —            | —                   | in reasons, NOT issues     | Stub  |
| S-34        | Commission TTL unclear                                | —            | —             | —            | —            | —             | —            | —                   | commission in issues       | Stub  |
| S-35        | P&I IG demand, vessel p&i_club null                   | —            | —             | —            | —            | —             | —            | —                   | P&I unknown in issues      | Stub  |
| S-36        | Vessel with restrictions[] (no Ukraine) + UA load     | —            | —             | —            | —            | —             | —            | —                   | restriction in issues      | Stub  |
| S-37        | Vessel with restrictions[] (no Ukraine) + TR load     | —            | —             | —            | —            | —             | —            | —                   | in reasons, NOT issues     | Stub  |
| S-38        | Cargo weight_mt_max > vessel.dwcc by 1 mt             | —            | —             | —            | —            | —             | —            | —                   | DWCC overrun               | Stub  |
| S-39        | MATCH_PROMPT reasons all contain ≥1 digit             | —            | —             | —            | —            | —             | —            | —                   | HARD RULE compliance       | Stub  |
| S-40        | Satisfied compliance in match_reasons not issues      | —            | —             | —            | —            | —             | —            | —                   | issues anti-pattern audit  | Stub  |
| S-41        | Vessel cargo ID integrity: ids match readiness        | —            | —             | —            | —            | —             | —            | —                   | ID cross-check             | Stub  |
| S-42        | FINAL AUDIT: no digitless reasons                     | —            | —             | —            | —            | —             | —            | —                   | digits check               | Stub  |
| S-43        | Multiple vessels, single cargo                        | —            | —             | —            | —            | —             | —            | —                   | all pairs returned         | Stub  |
| S-44        | Single vessel, multiple cargos                        | —            | —             | —            | —            | —             | —            | —                   | all pairs returned         | Stub  |
| S-45        | Vessel service_speed_kn=null                          | —            | —             | —            | —            | —             | —            | —                   | speed assumption flagged   | Stub  |
| S-46        | HOLD_GEOMETRY_VIOLATION                               | —            | —             | —            | —            | —             | —            | —                   | score ≤ 30                 | Stub  |
| S-47        | Grain after petcoke (food-grade cargo)                | —            | —             | —            | —            | —             | —            | —                   | cleaning required          | Stub  |
| S-48        | Summer draft vs port max draft conflict               | —            | —             | —            | —            | —             | —            | —                   | draft mismatch             | Stub  |
| S-49        | Readiness verdict 'late' pair                         | —            | —             | —            | —            | —             | —            | —                   | late verdict in issues     | Stub  |
| S-50        | Mixed bag: 3 good + 2 possible + 2 weak in one batch  | —            | —             | —            | —            | —             | —            | —                   | all 7 pairs returned       | Stub  |

## Aggregate Stats (fill after regression run)

| Metric                            | OpenAI | Bedrock      | Gemini |
| --------------------------------- | ------ | ------------ | ------ |
| Median score (50 scenarios)       | —      | —            | —      |
| Mean absolute deviation vs OpenAI | —      | 0 (baseline) | —      |
| MANDATORY ISSUES coverage rate    | —      | —            | —      |
| Score deviation > 5 pts           | —      | —            | —      |
| Score deviation > 15 pts (alert)  | —      | —            | —      |
| Avg latency (ms)                  | —      | —            | —      |
| Avg cost per call ($)             | —      | —            | —      |
| Calls > $0.10 (alert threshold)   | —      | —            | —      |

## Cost Monitoring

Cost alerts are logged in `ai_audit` table (SQLite, `data/sessions.db`):

```sql
-- Average cost per MATCH call by provider (last 7 days)
SELECT provider, model,
       COUNT(*) as calls,
       ROUND(AVG(cost_usd), 4) as avg_cost_usd,
       ROUND(MAX(cost_usd), 4) as max_cost_usd,
       ROUND(SUM(cost_usd), 2) as total_cost_usd
FROM ai_audit
WHERE scope = 'MATCH'
  AND created_at > (strftime('%s', 'now') - 7*86400) * 1000
GROUP BY provider, model
ORDER BY avg_cost_usd DESC;
```

Alert condition: `AVG(cost_usd) > 0.10` for MATCH scope → investigate batch size or consider MATCH_PROVIDER=gemini.

## Rollback Procedure

```bash
# Immediate rollback to OpenAI (gpt-5.5 via ClipProxy)
echo "MATCH_PROVIDER=openai" >> .env.local

# Or copy the full fallback preset:
cp .env.gpt-fallback.example .env.local.fallback
# Then merge into .env.local manually

# AWS outage fallback (Gemini 2.5 Pro)
echo "MATCH_PROVIDER=gemini" >> .env.local
```
