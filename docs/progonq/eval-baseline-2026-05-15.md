# Eval Baseline — 2026-05-15

Baseline runs for `parse-vessel` and `classify` endpoints using Gemini (AI_PROVIDER=gemini).

## parse-vessel (etms-parse-vessel-baseline.json)

**Corpus**: 56 scenarios  
**Errors**: 4 (fetch failures — etms-parse-vessel-020/030/038/046)  
**Evaluated**: 52 scenarios, 106 vessel items

### Deterministic field accuracy (string / ±5% tolerance)

| Field        | Match  | %     | Notes                          |
|--------------|--------|-------|--------------------------------|
| vessel_name  | 86/106 | 81.1% | case-insensitive, strips MV prefix |
| imo          | 92/106 | 86.8% | digits-only comparison         |
| flag         | 86/106 | 81.1% | case-insensitive               |
| built        | 72/106 | 67.9% | exact year                     |
| dwt_summer   | 69/106 | 65.1% | ±5% tolerance                  |
| dwcc         | 55/106 | 51.9% | ±5% tolerance                  |
| open_position| n/a    | —     | LLM judge not yet run          |
| open_date    | n/a    | —     | LLM judge not yet run          |

**Mean deterministic-field rate**: 76.0%  
**Full deterministic match** (all 6 det fields = 1): 14/52 (26.9%)

### Notable issues
- 2 count mismatches (model returned 2× items vs ref): etms-parse-vessel-019 (ref=1, model=2), etms-parse-vessel-037 (ref=5, model=10)
- `dwcc` is the weakest deterministic field (51.9%) — likely partial extraction or unit conversion gaps
- `open_position` and `open_date` judge pending (0 LLM judge calls made)

---

## classify (etms-classify-baseline.json)

**Corpus**: 154 scenarios  
**Errors**: 0  

### Overall accuracy

| Field                  | Match   | %     |
|------------------------|---------|-------|
| category               | 147/154 | 95.5% |
| urgency                | 113/154 | 73.4% |
| is_unanswered          | 138/154 | 89.6% |
| original_sender_company| —       | LLM judge not yet run |

### Per-category breakdown

| Category       | n  | category | urgency | is_unanswered |
|----------------|----|----------|---------|---------------|
| CARGO_INQUIRY  | 89 | 96.6%    | 82.0%   | 97.8%         |
| CLIENT_REPLY   | 1  | 100%     | 0%      | 0%            |
| FIXTURE_RECAP  | 2  | 100%     | 100%    | 100%          |
| OTHER          | 2  | 50%      | 50%     | 50%           |
| TCT_REQUEST    | 3  | 100%     | 33.3%   | 100%          |
| VESSEL_POSITION| 57 | 94.7%    | 63.2%   | 78.9%         |

### Stable category failures (7 scenarios)

| Scenario             | Ref             | Got             |
|----------------------|-----------------|-----------------|
| etms-classify-005    | VESSEL_POSITION | FIXTURE_RECAP   |
| etms-classify-026    | OTHER           | CARGO_INQUIRY   |
| etms-classify-076    | VESSEL_POSITION | CARGO_INQUIRY   |
| etms-classify-077    | VESSEL_POSITION | CARGO_INQUIRY   |
| etms-classify-112    | CARGO_INQUIRY   | TCT_REQUEST     |
| etms-classify-114    | CARGO_INQUIRY   | TCT_REQUEST     |
| etms-classify-126    | CARGO_INQUIRY   | TCT_REQUEST     |

### Urgency miss distribution (41 misses)

| Direction      | Count |
|----------------|-------|
| medium → high  | 15    |
| low → medium   | 8     |
| medium → low   | 6     |
| high → medium  | 5     |
| low → high     | 3     |
| high → null    | 2     |
| high → low     | 1     |
| low → null     | 1     |

Primary urgency weakness: model over-escalates `medium` → `high` (15 cases). VESSEL_POSITION urgency notably low (63.2%).

---

## Next steps

1. Run `judge-parse-vessel.ts` on baseline to fill in `open_position` and `open_date` semantic scores
2. Run `judge-classify.ts` to fill in `original_sender_company` semantic scores
3. Investigate VESSEL_POSITION urgency weakness (63.2%) — likely prompt ambiguity on urgency criteria for position lists
4. Fix etms-parse-vessel-020/030/038/046 fetch errors (transient; re-run with `--round baseline-retry`)
