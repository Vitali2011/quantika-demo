# Golden-Set · Variant A — Handoff for a fresh session

> **You have ZERO context from the prior session. Read this file fully before acting.**
> Repo: `/Users/jarvis/work/quantika-demo` · Branch: **`feat/golden-set`** (commit `fd2e9b0c`, 15 tests green).
> Founder = non-technical ("гуманитарий"). Explain in plain Russian, give the "why", no telegraph style.

## Mission

Build a **golden-set**: ~20 cargo×vessel match pairs with externally-verified numbers
(TCE/day, distance, cargo weight) that the matching engine is tested against. It is the regression
**oracle** for the engine and the template for repairing prod. **Variant A** = derive the pairs from
the REAL demo board (full seed build), not from hand-picked guesses.

**Why it exists (root cause):** the engine always emits a number even when inputs are missing/wrong
(speed defaults to 12kt for ~78% of vessels, weight→range-max, etc.). Green tests + a rendered page
never checked "is this $/day actually correct for this ship?". Golden-set is the missing check —
read `docs/RETROSPECTIVE-root-cause-2026-06-05.md`.

## Read these first (in order)

1. `docs/superpowers/specs/2026-06-05-golden-set-design.md` — the design (3 decisions, schema, oracle).
2. `docs/superpowers/plans/2026-06-05-golden-set.md` — the implementation plan (Phases A/B/C).
3. `docs/RETROSPECTIVE-root-cause-2026-06-05.md` — why the bugs accumulated.
4. `docs/SYSTEM-AUDIT-3-ENGINE.md` + `docs/SYSTEM-AUDIT-4-STORAGE.md` — engine + storage internals.

## State: what is already DONE (Phase A harness)

On branch `feat/golden-set`, committed, **15 tests green** (`npm run golden`):

- `lib/matching/__tests__/golden-set/schema.ts` — `GoldenRecord` zod schema + `parseGoldenRecord`.
  Cargo input has optional `cargoType` (engine **CargoType MODE**: BULK/BREAK_BULK/…), `qtyMinT/qtyMaxT`.
  Vessel input has optional `dwccT`, `geared`, `craneCapacityT`.
- `lib/matching/__tests__/golden-set/tolerance.ts` — `withinTolerance(actual, {value, toleranceAbs?, tolerancePct?})`
  (abs OR pct, whichever band larger; weight exact = abs 0).
- `lib/matching/__tests__/golden-set/runner.ts` — `runGolden(record, today) → {distanceNm, weightMt,
tceUsdPerDay, bucket, matchLevel, score, reason}`. Exports `buildCargo(input)` / `buildVessel(input)`.
  Distance = LADEN leg via `getPortDistance(load, disch)` (NOT `readiness.distanceNm`, which is BALLAST).
  TCE = explicit-input `buildMatchEconomics` (isolates arithmetic).
- `lib/matching/__tests__/golden-set/golden-set.test.ts` + `golden-matches.json` — driver + 2-record stub.
  Known-bug pairs use Jest **`it.failing`** (red now, auto-flips green when the bug is fixed → promote to `it`).
- `scripts/demo-seed/golden-candidates.ts` — DEV TOOL: feeds all cargoes×vessels to `analyzePairs`,
  prints the board (non-blocked + blocked-by-reason). Adapt it to query the real seed.

**Tolerances (decided):** weight = exact (abs 0) · distance = ±3% · TCE = ±$500/day OR ±5%, whichever larger.

## Hard-won lessons from the prior session — DO NOT REPEAT THESE MISTAKES

1. **Ground-truth before belief.** Do NOT trust email subjects or parsed fields. READ the raw email
   BODY. Subjects lied repeatedly: "Turkish Steels" was 4 separate cargoes; "MV TBN 17K" was 2 vessels;
   "bb cgo" was specifically Barite. Source of truth = `.private/etms-corpus.json` (clean decoded bodies,
   REAL non-anonymized data) and `.private/raw-emails/*.json` (raw Gmail).
2. **Let the ENGINE match — do not hand-pair.** Pairing requires timing/geography/size/trading-restriction
   judgment (a broker's skill). Hand-pairing produced 4 broker-impossible pairs (a vessel that "CAN'T CALL
   UKRAINE" paired to a Ukraine cargo; a 1084 DWT coaster to a 3000t transatlantic cargo; a 30,000t cargo
   to a ~5k general-cargo ship; a Brazil vessel to a Turkey cargo). The engine correctly blocks these on
   readiness/capacity. → Feed the full real corpus to the engine, pick exemplars from its ACTUAL board.
3. **Engine-TCE is NOT the profit oracle.** It is the thing under test (inflated on short legs — e.g.
   $42k/day for a 6976dwt coaster on a 263nm leg; identical $311/day across two different vessels). So the
   ROW of the matrix (is the match good/bad = profitable/loss) must come from the EXTERNAL double-compute,
   never from engine TCE.
4. **The selection matrix is 2×2:**
   | | engine computes RIGHT | engine BREAKS it |
   |---|---|---|
   | **match good** (profitable) | 🟢 CONTROL (must stay green) | 🔴 EXEMPLAR (weight-range, detectSpot, list↔detail) |
   | **match bad** (loss) | 🟢 engine correctly capped/blocked | 🔴 EXEMPLAR (loss ranked "good" — B4) |
   ROW = external economics. COLUMN = engine board output.
5. **CargoType is a MODE** (BULK/BREAK_BULK/FCL/…), not a commodity. Steel/cement = commodity → belongs in
   `cargoDescription`. The real seed has both from the LLM parse; commodity-based freight needs it.
6. **No est/default flag exists in the engine.** Speed null → silently 12kt, never marked "estimated". So
   the "absent-speed → est." golden assertions stay `it.failing` until an engine change surfaces input
   provenance — this is a PREREQUISITE for bug B3 ("honest est. flag in UI"). Note it next to B3 in
   `docs/BUGFIX-WAVES-2026-06-05.md`.

## Variant A — steps

### 0. Precondition: claude-cli

`npm run seed:all` parses 153 emails via `AI_PROVIDER=claude-cli`. Verify claude-cli works locally FIRST
(e.g. a tiny `claude --print` smoke). If it does not → STOP and tell the founder; fall back to Variant B
(2 real anchors + synthetic targeted exemplars — see the plan).

### 1. Build the full seed (the real board)

`npm run seed:all` → builds `data/demo-seed.db` (~631 matches across 3 buckets: main `user_id IS NULL`,
review `__demo_review__`, insufficient `__demo_insufficient__`). Heavy/slow (LLM parse). Read
`scripts/demo-seed/seed-all.ts` for args (`--frozen-date`, `--raw-dir`). This is the same pipeline that
builds prod demo — see `docs/SYSTEM-AUDIT-4-STORAGE.md` §4.

### 2. Find real bug-class instances on the board

Query `data/demo-seed.db` (model: `scripts/demo-seed/audit-matches.ts`). For EACH known bug, find a REAL
pair on the board that exhibits it:

- **negative-TCE ranked good** (B4): `tce_usd_per_day < 0` yet bucket=main / matchLevel good.
- **weight-range → max** (B6): cargo where `weightMtMin ≠ weightMtMax` and the max drove a reject/overload.
- **detectSpot** (B10): a spot vessel (object-openDate) bucketed idle/review instead of ideal.
- **list↔detail TCE** (#819/B5): the card vs list TCE divergence (may already be fixed post-#829 → verify-first).
- **non-bulk** commodity (steel/cement) freighted as bulk.
- **unknown-port** gate pass.
- Plus **5 clean controls**: profitable, well-utilised, all-real-inputs matches the engine handles right.
  The bug-classes are catalogued in `docs/BUGFIX-WAVES-2026-06-05.md` (B3–B19) and `docs/SYSTEM-AUDIT-3-ENGINE.md`.

### 3. Verify each selected pair EXTERNALLY (the oracle)

Founder has opted into a **Workflow** for this (parallel per-pair verify + adversarial double-compute).
Per pair:

- **weight** ← read the cargo's raw email body (`.private/raw-emails`), record the STATED quantity (exact).
- **distance** ← **searoutes.com (web)** for load→disch — NOT `data/distances/searoute-pairs.json` (that is
  the engine's own Tier-2 cheat-sheet; using it is circular). Record nm + URL in provenance.
- **TCE** ← **two independent computations** (standard TCE formula, externally-sourced freight + bunker).
  Must agree within ±5%, else flag for the founder. Founder spot-checks 3–4 on broker intuition.
  Present each pair to the founder with: ports (location + region in Russian), laden distance, the external
  TCE, and the 2×2 placement — for his broker confirmation BEFORE locking it in.

### 4. Populate the fixture + classify

Replace the stub `golden-matches.json` with the ~20 verified records. Bug pairs whose CORRECT value the
engine gets wrong → `it.failing` in the driver (red now, auto-flip on fix). Controls + currently-correct
values → normal `it`. Add the engine's `bucket`/`reason`/`score` to provenance.

### 5. Baseline + wiring (Phase C)

- `npm run golden` → controls green, bug pairs red-documented. Write `docs/superpowers/golden-set/BASELINE-<date>.md`.
- VALUE_CHECK: `npm run golden` is the gate command. The orchestrator-day skill repo
  (`~/.claude/skills/orchestrator-day/`) wires it into pre-merge Check F via `scripts/value-check-emit.sh
<pr> golden-set match|mismatch golden` (separate repo — note it, don't block on it).
- `superpowers:finishing-a-development-branch` when done.

## Key facts

- **Data:** `.private/raw-emails/` (153 raw Gmail JSON) · `.private/etms-corpus.json` (153 clean decoded
  bodies, REAL) · `data/distances/searoute-pairs.json` (engine Tier-2, NOT the oracle) ·
  `data/demo-seed.db` (built by seed:all; currently 0 bytes locally until you build).
- **Frozen clock:** pass explicit `today` to the engine. The demo frozen date comes from
  `demo_seed_meta.frozen_date` after build; for the candidate dev-tool the prior session used `2026-05-10`
  so the May/June laycans were future. Pin `frozenDate` in `golden-matches.json` for determinism.
- **Engine entry points:** `analyzePairs(cargos, vessels, async()=>[], {today, db?})` (`lib/matching/pair-analyzer.ts`)
  → `{matches, lowConfidenceMatches, insufficientData, blockedMatches}`. `buildMatchEconomics(input)` →
  `{tceUsdPerDay, …}` (`lib/matching/tce-calculator.ts`). `getPortDistance(a,b)?.nm` (`lib/sailing/port-distances.ts`).
- **Skills:** use `superpowers:using-superpowers` first. `subagent-driven-development` for fixture/code tasks;
  the verify step = a `Workflow` (founder opted in). `superpowers:systematic-debugging` if a build step fails.
- **Model:** Sonnet for build/query/wiring; Opus (`/model claude-opus-4-7` or 4.8) for the 2×2 selection
  judgment + designing the verify workflow.
- **Prod is off-limits** for this task (safety layer blocks it; the founder did not request it). Everything
  is local.

## Definition of done

~20 verified golden pairs in `golden-matches.json` (controls + `it.failing` bug exemplars), `npm run golden`
behaving as designed, a BASELINE doc, the est-flag→B3 dependency recorded, branch finished via the
finishing skill. Every value-bearing number traceable to its external source in `provenance`.
