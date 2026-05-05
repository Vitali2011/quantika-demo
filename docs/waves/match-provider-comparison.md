# Match Endpoint — Provider Comparison (γv-06)

Per-scenario regression table for `POST /api/ai/match` across **4 variants**.

## Wave γ — 5-Scenario Methodology Proof (2026-05-05)

**Status:** Methodology proof DONE — 5 scenarios run through Gemini 2.5 Pro. Bedrock + OpenAI blocked (see Infrastructure Status). NOT production verdict — full 50-scenario regression needed for production decision.

**Raw results:** `.progonq/results/wave-gamma-eval-2026-05-05T18-06-18.json`  
**Corpus:** `.progonq/corpus/wave-gamma-eval/scenario-001..005.json`  
**Total cost:** $0.0813 (5 Gemini calls + 5 failed Bedrock attempts = $0.08 effective)

### Infrastructure Status

| Provider | Status     | Root Cause                                                                                   | Fix Needed                                                       |
| -------- | ---------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| openai   | SKIPPED    | ClipProxy not running at localhost:8317                                                      | Start ClipProxy or set `CLIPROXY_BASE_URL` to external proxy     |
| gemini   | **ACTIVE** | Vertex AI — GCP project `quantika-demo-2026`, key at `~/.config/gcp/quantika-vertex-ai.json` | None                                                             |
| bedrock  | ERROR      | `ValidationException: model not activated in AWS account`                                    | AWS Console → Bedrock → Model Access → request `claude-opus-4-7` |

### 5-Scenario Results — Gemini 2.5 Pro

Corpus design: 5 pairs from `lib/sample-data/` covering full difficulty range.

| Scenario     | Category       | Score  | Level | Matches | Issues | Latency  | Key Observation                                                                                                       |
| ------------ | -------------- | ------ | ----- | ------- | ------ | -------- | --------------------------------------------------------------------------------------------------------------------- |
| scenario-001 | good_match     | 25     | weak  | 1       | 4      | 26,293ms | CBM overflow detected: 6750mt × SF 2.80 = 18,900 cbm > bale cap 14,600 cbm — **correct finding, test designer error** |
| scenario-002 | weak_match     | 20     | weak  | 1       | 4      | 23,231ms | DWCC_VIOLATION + late verdict + direction mismatch — all 3 required issues surfaced ✓                                 |
| scenario-003 | borderline     | 20     | weak  | 1       | 2      | 18,610ms | DWCC overrun 450mt cited verbatim + speed_null flagged ✓                                                              |
| scenario-004 | moloo_range    | 15     | weak  | 1       | 5      | 26,349ms | Late verdict + repositioning distance + bale cap limits cargo to 6500mt ✓                                             |
| scenario-005 | readiness_edge | **75** | good  | 1       | 3      | 24,008ms | Bulk carrier + bulk urea: comfortable DWCC, tight-but-feasible timing, speed_null + P&I cited ✓                       |

**INCLUSION POLICY compliance: 5/5** — all readiness pairs returned, no self-censoring.

**Quality highlight:** scenario-001 scored 25/weak instead of expected "good" — Gemini caught a genuine stowage volume overflow the test designer missed (SF × weight > bale capacity). This is correct behavior.

### Cost Summary (5-scenario proof)

| Provider  | Calls       | Total cost (est) | Avg cost/call |
| --------- | ----------- | ---------------- | ------------- |
| openai    | 0 (skipped) | —                | —             |
| gemini    | 5           | $0.0434          | $0.0087       |
| bedrock   | 0 (error)   | —                | —             |
| **Total** | **5**       | **$0.0434**      | **$0.0087**   |

### Latency (Gemini 2.5 Pro, 5 calls)

| Provider | Median   | P95      |
| -------- | -------- | -------- |
| gemini   | 24,008ms | 26,349ms |

~18–26 seconds per call — within AbortController 85s timeout from βf3-01. Acceptable for production.

### Next Steps to Complete Comparison

1. **Bedrock:** Request `claude-opus-4-7` in AWS Console → Amazon Bedrock → Model Access
2. **OpenAI:** Start ClipProxy or configure `CLIPROXY_BASE_URL` in `.env.local`
3. **Re-run:** `npx tsx --tsconfig tsconfig.json scripts/eval/run-match-providers-comparison.ts`

---

Real numbers fill in during production regression runs; full 50-scenario table below.

## Variants Config

| Variant ID        | Provider | Model                                                                     | Notes                                                                                                                                                                           |
| ----------------- | -------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **openai**        | openai   | `AI_MODEL_HEAVY` (default `gpt-5.5`)                                      | ClipProxy, immediate rollback                                                                                                                                                   |
| **gemini-pro**    | gemini   | `AI_MODEL_GEMINI_DEFAULT` (default `gemini-2.5-pro`)                      | Vertex AI, standard mode                                                                                                                                                        |
| **gemini-pro-dt** | gemini   | `gemini-2.5-pro-deepthink` (audit key)                                    | Gemini 2.5 Pro + Deep Think (`thinkingBudget=-1`). Extended reasoning mode — like a human who writes rough notes before answering. 2-3× more output tokens, est $0.10-0.15/call |
| **bedrock-opus**  | bedrock  | `BEDROCK_MODEL_ID` (default `us.anthropic.claude-opus-4-7-20260415-v1:0`) | Claude Opus 4.7 via AWS Bedrock                                                                                                                                                 |

### Deep Think explained

Deep Think is NOT a separate model — it is an extended reasoning mode for `gemini-2.5-pro`.  
Enabled via `thinkingConfig: { thinkingBudget: -1, includeThoughts: false }` in the API call.  
The model spends extra tokens "thinking through" the problem before producing the final answer.  
`thinkingBudget=-1` = dynamic (model decides how much to think; larger problems → more thinking).

## Score Deviation Budget

Target: median absolute score deviation ≤ 5 pts between variants.  
Alert threshold: any single scenario deviation > 15 pts is flagged as regression.

## Per-Scenario Comparison Table

> Status: STUB — populate during first production regression run.
> Run: `npx tsx --tsconfig tsconfig.json scripts/eval/run-match-providers-comparison.ts`

| Scenario ID | Pair Description                                      | OpenAI | Gemini Pro | Gemini Pro (DT) | Bedrock Opus | Δ DT vs Pro | Δ Bedrock vs DT | MANDATORY ISSUES Coverage  | Notes |
| ----------- | ----------------------------------------------------- | ------ | ---------- | --------------- | ------------ | ----------- | --------------- | -------------------------- | ----- |
| S-01        | Bulk grain / Handysize, ideal timing                  | —      | —          | —               | —            | —           | —               | —                          | Stub  |
| S-02        | Bulk grain / Supramax, tight timing                   | —      | —          | —               | —            | —           | —               | —                          | Stub  |
| S-03        | Break-bulk / MPP vessel, good fit                     | —      | —          | —               | —            | —           | —               | —                          | Stub  |
| S-04        | Iron ore / Capesize, DWCC violation                   | —      | —          | —               | —            | —           | —               | DWCC_VIOLATION must appear | Stub  |
| S-05        | Fertilizer / Gearless at ungeared port                | —      | —          | —               | —            | —           | —               | CRANE_VIOLATION            | Stub  |
| S-06        | Grain / RU-flagged vessel, EU cargo                   | —      | —          | —               | —            | —           | —               | Sanction flag              | Stub  |
| S-07        | Soybean meal / vessel last_cargo Petcoke              | —      | —          | —               | —            | —           | —               | LAST_CARGO_INCOMPATIBLE    | Stub  |
| S-08        | Steel coils / laycan violation                        | —      | —          | —               | —            | —           | —               | LAYCAN_VIOLATION           | Stub  |
| S-09        | Cargo with CII-D/E restriction / CII-D vessel         | —      | —          | —               | —            | —           | —               | CII grade issue            | Stub  |
| S-10        | Volume overflow: cargo weight > grain capacity        | —      | —          | —               | —            | —           | —               | Volume math in issues      | Stub  |
| S-11        | GAP_DAYS=0 + strict laycan                            | —      | —          | —               | —            | —           | —               | GAP_DAYS cap enforced      | Stub  |
| S-12        | Unknown timing (readiness.verdict=unknown)            | —      | —          | —               | —            | —           | —               | verdict cited              | Stub  |
| S-13        | Multiple cargo restrictions, all surfaced             | —      | —          | —               | —            | —           | —               | All restrictions[] items   | Stub  |
| S-14        | Vessel last_cargo unknown, food-grade cargo           | —      | —          | —               | —            | —           | —               | uncertainty flagged        | Stub  |
| S-15        | Sub-day buffer + strict laycan                        | —      | —          | —               | —            | —           | —               | SUB_DAY_BUFFER cap         | Stub  |
| S-16        | Vessel speed null — class-default fallback            | —      | —          | —               | —            | —           | —               | speed_null flagged         | Stub  |
| S-17        | Perfect 4-factor match (geography+DWT+gear+timing)    | —      | —          | —               | —            | —           | —               | score ≥ 70 expected        | Stub  |
| S-18        | Sanctioned owner in vessel.owner field                | —      | —          | —               | —            | —           | —               | owner sanction surfaced    | Stub  |
| S-19        | Multiple violations (DWCC + LAYCAN) — lowest cap wins | —      | —          | —               | —            | —           | —               | score ≤ 20 (min cap)       | Stub  |
| S-20        | Idle vessel (gap_days > 10)                           | —      | —          | —               | —            | —           | —               | idle days in issues        | Stub  |
| S-21        | Cargo weight range 4,000-4,800 mt (uncertain)         | —      | —          | —               | —            | —           | —               | uncertainty flagged        | Stub  |
| S-22        | Breakbulk + gearless vessel + port has cranes         | —      | —          | —               | —            | —           | —               | crane availability         | Stub  |
| S-23        | TCT request cargo vs bulk carrier                     | —      | —          | —               | —            | —           | —               | cargo-vessel type          | Stub  |
| S-24        | Vessel flag BY, cargo to US port                      | —      | —          | —               | —            | —           | —               | BY sanction                | Stub  |
| S-25        | DWT exact match (0% margin)                           | —      | —          | —               | —            | —           | —               | margin note                | Stub  |
| S-26        | LLM omits pair — deterministic sweep fills            | —      | —          | —               | —            | —           | —               | sweep coverage             | Stub  |
| S-27        | grain after grain (last_cargo = wheat, cargo = corn)  | —      | —          | —               | —            | —           | —               | NO issue expected          | Stub  |
| S-28        | Old vessel position (>7 days stale)                   | —      | —          | —               | —            | —           | —               | stale flag                 | Stub  |
| S-29        | Large batch: 10 cargos × 5 vessels = 50 pairs         | —      | —          | —               | —            | —           | —               | all 50 pairs returned      | Stub  |
| S-30        | Edible oil before non-DPP last_cargo                  | —      | —          | —               | —            | —           | —               | DPP issue                  | Stub  |
| S-31        | Hold height violation (HOLD_HEIGHT_VIOLATION)         | —      | —          | —               | —            | —           | —               | score ≤ 30                 | Stub  |
| S-32        | No-TBN restriction, vessel has TBN                    | —      | —          | —               | —            | —           | —               | TBN violation              | Stub  |
| S-33        | No-TBN restriction, vessel is named                   | —      | —          | —               | —            | —           | —               | in reasons, NOT issues     | Stub  |
| S-34        | Commission TTL unclear                                | —      | —          | —               | —            | —           | —               | commission in issues       | Stub  |
| S-35        | P&I IG demand, vessel p&i_club null                   | —      | —          | —               | —            | —           | —               | P&I unknown in issues      | Stub  |
| S-36        | Vessel with restrictions[] (no Ukraine) + UA load     | —      | —          | —               | —            | —           | —               | restriction in issues      | Stub  |
| S-37        | Vessel with restrictions[] (no Ukraine) + TR load     | —      | —          | —               | —            | —           | —               | in reasons, NOT issues     | Stub  |
| S-38        | Cargo weight_mt_max > vessel.dwcc by 1 mt             | —      | —          | —               | —            | —           | —               | DWCC overrun               | Stub  |
| S-39        | MATCH_PROMPT reasons all contain ≥1 digit             | —      | —          | —               | —            | —           | —               | HARD RULE compliance       | Stub  |
| S-40        | Satisfied compliance in match_reasons not issues      | —      | —          | —               | —            | —           | —               | issues anti-pattern audit  | Stub  |
| S-41        | Vessel cargo ID integrity: ids match readiness        | —      | —          | —               | —            | —           | —               | ID cross-check             | Stub  |
| S-42        | FINAL AUDIT: no digitless reasons                     | —      | —          | —               | —            | —           | —               | digits check               | Stub  |
| S-43        | Multiple vessels, single cargo                        | —      | —          | —               | —            | —           | —               | all pairs returned         | Stub  |
| S-44        | Single vessel, multiple cargos                        | —      | —          | —               | —            | —           | —               | all pairs returned         | Stub  |
| S-45        | Vessel service_speed_kn=null                          | —      | —          | —               | —            | —           | —               | speed assumption flagged   | Stub  |
| S-46        | HOLD_GEOMETRY_VIOLATION                               | —      | —          | —               | —            | —           | —               | score ≤ 30                 | Stub  |
| S-47        | Grain after petcoke (food-grade cargo)                | —      | —          | —               | —            | —           | —               | cleaning required          | Stub  |
| S-48        | Summer draft vs port max draft conflict               | —      | —          | —               | —            | —           | —               | draft mismatch             | Stub  |
| S-49        | Readiness verdict 'late' pair                         | —      | —          | —               | —            | —           | —               | late verdict in issues     | Stub  |
| S-50        | Mixed bag: 3 good + 2 possible + 2 weak in one batch  | —      | —          | —               | —            | —           | —               | all 7 pairs returned       | Stub  |

## Aggregate Stats (fill after regression run)

| Metric                            | OpenAI | Gemini Pro | Gemini Pro (DT) | Bedrock Opus |
| --------------------------------- | ------ | ---------- | --------------- | ------------ |
| Median score (50 scenarios)       | —      | —          | —               | —            |
| Mean absolute deviation vs OpenAI | —      | —          | —               | —            |
| MANDATORY ISSUES coverage rate    | —      | —          | —               | —            |
| Score deviation > 5 pts           | —      | —          | —               | —            |
| Score deviation > 15 pts (alert)  | —      | —          | —               | —            |
| Avg latency (ms)                  | —      | ~24,000ms  | ~60-120s est    | —            |
| Avg cost per call ($)             | —      | ~$0.009    | ~$0.10-0.15     | —            |
| Calls > $0.10 (alert threshold)   | —      | 0/5        | expected all    | —            |

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
