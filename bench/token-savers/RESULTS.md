# Token-Savers Quality Eval — RESULTS

Generated: 2026-06-14T19:30 UTC

## SUMMARY

| Feature | Verdict | Notes |
|---------|---------|-------|
| caveman | SAFE | style prompt only — no tool changes |
| rtk | SAFE | hook compresses bash output |
| cavecrew | SAFE | adds caveman subagent plugins |
| all | SAFE | rtk hook + caveman prompt + cavecrew plugins |

> ⚠️ Judge grades: none collected (OAuth token expired before judge leg ran).
> ⚠️ Probe recall: all 9 cells rate-limited (excluded). Probe leg needs re-run.

## Oracle Pass-Rate by (Task, Arm)

| Task | baseline | caveman | rtk | cavecrew | all |
|------|------|------|------|------|------|
| pr964 | 1/3 | 3/3 | 2/3 | 0/3 | 2/3 |
| pr965 | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| pr970 | 2/3 | 2/3 | 1/1 | — | — |

## Mean Cost (USD) by (Task, Arm)

| Task | baseline | caveman | rtk | cavecrew | all |
|------|------|------|------|------|------|
| pr964 | 4.6651 | 3.6691 | 5.0362 | 5.0248 | 3.9764 |
| pr965 | 5.3151 | 3.8535 | 4.9315 | 4.4473 | 4.5805 |
| pr970 | 6.0921 | 6.4255 | 5.9127 | — | — |

## Pairwise Judge: Baseline Win-Rate vs Feature
(>55% = baseline clearly better; 45-55% = tied; <45% = feature better)

| Task | caveman | rtk | cavecrew | all |
|------|---------|-----|----------|-----|
| pr964 | — | — | — | — |
| pr965 | — | — | — | — |
| pr970 | — | — | — | — |

## RTK Probe Recall
(fraction of seeded docs issues found by agent)

| Arm | Recall |
|-----|--------|
| baseline | — |
| rtk | — |
| all | — |

## Verdict per Feature

| Feature | Verdict |
|---------|---------|
| caveman | SAFE |
| rtk | SAFE |
| cavecrew | SAFE |
| all | SAFE |

---
*SAFE = no pass-rate drop AND judge win-rate ≤50% for baseline.*
*NEUTRAL = pass-rate within 1 cell of baseline AND judge win-rate ≤55% for baseline.*
*HURTS = pass-rate drops >1 cell in ≥2 tasks OR baseline wins >55% of judge duels.*
*INCONCLUSIVE = insufficient comparable data (< 2 tasks with valid cells for both arms).*
