# progonq on ETMS corpus — design

**Date:** 2026-05-06
**Author:** Brainstorming session (Claude + Vitali)
**Status:** Approved, ready for implementation
**Implementation:** new VPS session per `.specs/wave-gamma-vertex/quality-push/PROGONQ_KICKOFF.md`

## Context

Wave γ Quality Push (PR #97) дал нам classify endpoint на 92.6% точности, но 3 других парсера (`parse-cargo`, `parse-vessel`, `parse-recap`) остались INSUFFICIENT_DATA из-за Bedrock throttling. Тем временем у нас появился **реальный корпус 154 broker emails** из ETMS pipeline (`.private/etms-corpus.json`, deployed на VPS demo).

Старый корпус (27 синтетических emails) оказался слишком мелким для статистической надёжности и не покрывал реальные edge cases (forwarded chains, multi-cargo emails, mixed languages, incomplete data).

**Цель:** на новом корпусе 154 emails — прогнать `progonq` adversarial loop на всех 4 Gemini-парсерах, получить hardened production prompts + auto-generated regression tests + final per-endpoint quality matrix vs production winner.

## Approach summary

5 фаз последовательно, плюс 2 prerequisite фазы:

```
Phase -2: Fix 16 pre-existing tsc errors in __tests__/  (small PR, ~30 min, $0)
Phase -1: Add retry+backoff to judge.ts                  (small PR, ~1h, $0)
Phase 0:  Ground truth construction (Opus extractor)     (no commits, ~$15)
Phase 1:  progonq on classify (154 cases)                (PR, ~$12, ≤14 rounds)
Phase 2:  progonq on parse-cargo (~70 cases)             (PR, ~$15, ≤18 rounds)
Phase 3:  progonq on parse-vessel (~30 cases)            (PR, ~$10, ≤14 rounds)
Phase 4:  progonq on parse-recap (~15 cases)             (PR, ~$8, ≤10 rounds)
Phase 5:  Final bake-off + production winner doc         (last PR, ~$5)
```

**Total:** ~$65 budget, 6-10 hours VPS runtime, 5-7 PRs against main.

## Phase 0 — Ground Truth Construction

### Step 0.1: Pre-classify endpoint applicability

`scripts/progonq/classify-corpus.ts` (new):

- Input: `.private/etms-corpus.json` (154 emails)
- For each email: Opus 4.7 (Bedrock) "which endpoints apply: classify=always, parse-cargo, parse-vessel, parse-recap?"
- Output: `etms-corpus-classified.json` with `applicable_endpoints: ["classify", "parse-cargo"]` per record

Cost: ~$3 (154 × short Opus call).

### Step 0.2: Build reference outputs

For each email × applicable endpoint:

- Opus 4.7 as extractor (production parser system prompt + email body, NOT as judge)
- Output saved as ground truth JSON
- Expected distribution: classify 154 + cargo ~60-80 + vessel ~20-40 + recap ~10-20 = ~250-300 calls

Cost: ~$10-15.

### Step 0.3: Convert to progonq corpus format

`scripts/progonq/build-progonq-corpus.ts` (new):

- For each endpoint, create `.progonq/corpus/etms-<endpoint>/scenario-NNN.json`
- Auto-detect categories from email features: `simple_clean`, `multi_cargo`, `forwarded_chain`, `incomplete_data`, `mixed_languages`, `numeric_edge_cases`
- Each scenario file: `{id, source_email_id, category, input: {body, subject, from}, reference_output: {...}}`

### Phase 0 artifacts

- `.private/etms-corpus-classified.json`
- `.private/etms-corpus-ground-truth.json`
- `.progonq/corpus/etms-classify/` (154 scenarios)
- `.progonq/corpus/etms-parse-cargo/` (~70 scenarios)
- `.progonq/corpus/etms-parse-vessel/` (~30 scenarios)
- `.progonq/corpus/etms-parse-recap/` (~15 scenarios)

(All under `.private/` and `.progonq/` which are gitignored — corpus stays local.)

## Phases 1-4 — progonq loop per parser

Same workflow per phase:

```
Round 0: baseline measurement
Round 1..N (max per phase):
  ├─ Sample categories per .progonq/config.yaml (1 case per category per round)
  ├─ Cold-session domain-expert reviewer (Opus, fresh context)
  │   "Senior dry-bulk chartering broker. Find CRITICAL/HIGH issues in parser output."
  ├─ Categorize each issue: real_bug | schema_gap | design_disagreement
  ├─ Apply prompt edits → re-test ALL prior PASS cases (anti-regression)
  ├─ Inject design-decisions into next round prompt
  └─ Exit: 2 consecutive rounds with 0 CRIT + 0 HIGH per case
Anti-overfit: generate 6 fresh test cases → 1 more QA round
Auto-regression tests: snapshot key fields as Vitest tests in lib/prompts/__tests__/
```

### Per-endpoint configs

| Phase | Endpoint     | Sub-corpus | Cost cap | Round cap | Categories                                                                           |
| ----- | ------------ | ---------- | -------- | --------- | ------------------------------------------------------------------------------------ |
| 1     | classify     | 154        | $12      | 14        | simple_clean, forwarded_chain, mixed_languages, ambiguous_intent, multi_intent       |
| 2     | parse-cargo  | ~70        | $15      | 18        | single_cargo, multi_cargo, incomplete_data, hedged_language, numeric_edge, forwarded |
| 3     | parse-vessel | ~30        | $10      | 14        | single_vessel, multi_vessel, position_only, full_specs, dwcc_edge                    |
| 4     | parse-recap  | ~15        | $8       | 10        | bulk_recap, project_recap, partial_recap, multi_clause                               |

### Per-phase artifacts

- Updated `lib/prompts/<endpoint>.ts` (hardened system prompt)
- New `lib/prompts/__tests__/<endpoint>.regression.test.ts` (auto-generated)
- `.progonq/results/etms-<endpoint>-<timestamp>.json` (round-by-round log)
- `.progonq/schema-gaps-<endpoint>.md` (deferred bugs not in scope)
- `.progonq/design-decisions-<endpoint>.md` (intentional design choices)
- Branch `progonq/<endpoint>-2026-05-06`, PR against main

## Phase 5 — Final bake-off + production winner

After all 4 progonq phases complete:

- Re-run `scripts/wave-gamma-bake-off/cli.ts` with hardened prompts × 3 Gemini models × 4 endpoints, judged against `etms-corpus-ground-truth.json` from Phase 0
- Uses retry+backoff judge from Phase -1 (no throttle this time)
- Output: `docs/waves/wave-gamma-progonq-final.md` with:
  - Per-endpoint × per-model PARITY+B%, FAIL%, JUDGE_ERROR%, cost/1k
  - Production winner per endpoint (may differ from PR #97 baseline)
  - Recommended env-vars block
  - Cost projection per 1000 sessions

## VPS execution model

Single Claude session, headless, autonomous, on `outreach-vps` (Petr account). Pattern proven in Wave γ V5:

```bash
IS_SANDBOX=1 nohup claude -p \
  --model opus \
  --dangerously-skip-permissions \
  --max-budget-usd 80 \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  "$(cat /root/progonq-kickoff.txt)" \
  > /root/progonq-output.jsonl 2> /root/progonq-stderr.log < /dev/null &
```

Monitoring from controlling session every 10 min:

- PID alive (`ps -p`)
- Branch sanity (must be `progonq/<endpoint>-2026-05-06`, never `main`/`master`)
- Commits delta on current phase
- Cost tracker (`cumulativeCostUsd` < $80)
- Round counter in `.progonq/results/`

## Recovery rules (carried from Wave γ lessons)

Hard bans:

- ❌ `git RESET --HARD` — destroyed Spec 01+02 in Wave γ V1, never again
- ❌ `git push --FORCE`
- ❌ `git checkout main` for commits (main is read-only, merge via PR only)
- ❌ Branches outside `progonq/<endpoint>-2026-05-06` pattern

Allowed:

- ✅ `git commit --no-verify` ONLY for regression test files in Phases 1-4 (and only if Phase -2 not yet merged)
- ✅ Up to 2 retries with exponential backoff (1s, 5s, 30s) on Bedrock throttle / API 500
- ✅ `git pull` (merge) of own branch from origin

Escalation triggers:

- 2 consecutive sub-agent failures → STOP phase, mark ESCALATION
- Throttle rate >50% on judge → STOP phase, recommend Anthropic API switch
- Round counter hits cap without 2 PASS → STOP phase, dump partial results to schema-gaps

## Out of scope (deferred to wave δ)

- `cii-lookup`, `route-decision` endpoints (still on gpt-5.5, not migrated)
- `draft-quote`, `draft-reply`, `recap` (generative, not parsers)
- `voice-transcribe`, `image-ocr`, `agent-planner`, `match` (not text parsers)
- Expanding corpus beyond 154 (next iteration)

## Success criteria

1. All 4 parsers exit progonq with 2 consecutive PASS rounds
2. Final bake-off shows ≥3pp improvement on PARITY+B% vs PR #97 baseline (where measurable)
3. JUDGE_ERROR rate <10% in final bake-off (was 77-92% in Wave γ Spec 03)
4. Auto-regression tests committed: ≥30 snapshots across 4 endpoints
5. 5-7 PRs merged to main, prod env-vars updated on VPS

## Implementation kickoff

See `.specs/wave-gamma-vertex/quality-push/PROGONQ_KICKOFF.md` (next step in this brainstorming session) — self-contained prompt to paste into new VPS Claude session.
