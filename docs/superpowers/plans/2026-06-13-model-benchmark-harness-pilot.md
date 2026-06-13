# Model Benchmark Harness — Pre-flight + Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the minimal benchmark harness and run ONE pilot arm (opus-med, n=1) on the war-risk #957 replay task, producing a real $/time measurement to extrapolate the full 18-run cost — then STOP for a founder go/no-go.

**Architecture:** A benchmarked agent solves the #957 task solo via `claude --print --output-format json --model M --effort E` in a throwaway git worktree from pre-PR SHA `e242d259`. The CLI's JSON output already carries `total_cost_usd`, `duration_ms`, and token usage — pure-logic TS helpers parse and extrapolate; bash orchestrates the run. No grading/full-run machinery yet (that is a separate Phase-2 plan, written only after the pilot cost is approved).

**Tech Stack:** bash + Node/TypeScript via `tsx` (repo convention, see `scripts/diag/*.ts`), vitest for unit tests, `claude` CLI 2.1.175 (`--effort`, `--output-format json`, `--max-budget-usd` all confirmed present).

**Spec:** `docs/superpowers/specs/2026-06-13-model-benchmark-via-pr-replay-design.md`

**Scope note (why pilot-only):** The spec procedure §7 gates the full 18 runs behind a pilot cost estimate. Per writing-plans "each plan produces working testable software on its own" — this plan delivers a runnable pilot + cost number. Phase 2 (grading layers, full 6×3 run, workflow arm, frontier analysis) is deferred to its own plan authored at the go/no-go.

---

### Task 1: Bench workspace + agent brief

**Files:**

- Create: `bench/war-risk/brief.md`
- Create: `bench/war-risk/.gitignore`

- [ ] **Step 1: Create bench dir and ignore run outputs**

Create `bench/war-risk/.gitignore`:

```gitignore
results/
worktrees/
*.sample.json
```

- [ ] **Step 2: Write the agent brief (the task, WITHOUT solution or tests)**

Create `bench/war-risk/brief.md` — this is the only thing each benchmarked agent receives:

```markdown
# Task: war-risk premium — live JWC rates + Suez-transit detection

You are working in the quantika-demo repo (maritime freight matching). Implement the
following three fixes in the war-risk premium calculation. Do NOT change parsers,
DB migrations, or the RAG/knowledge ingestion path. Add focused unit tests for your
own work. Produce a short shift-table (old vs new premium by route) at the end.

## Д1 — replace the stale hardcoded JWC rate with a live, staleness-aware rate

`lib/economics/war-risk.ts` uses a hardcoded `0.075%` effective `2024-01-01`. Source the
current rate live from `data/knowledge/jwc/2025-current.yaml` (zone JWLA-033). Keep a
hardcoded fallback if the file/zone is missing or unreadable. Surface which source was
used (live vs fallback) on the result.

## Д2 — single source of truth via a tolerant YAML loader

The rate currently has two sources of truth. Add a small, memoized, tolerant YAML loader
(economics-local) that reads the JWC zones from `2025-current.yaml`, maps zone IDs to the
calculator's zone IDs, converts pct→fraction, and returns `null` on ANY error without
throwing. Do not modify the existing YAML parser, schema, or migrations. Do not touch the
RAG path.

## Д3 — thread Suez-transit detection into the HRA premium

Today `viaCanal` is not threaded into the premium logic. A voyage that TRANSITS the Suez
canal must trigger the `red-sea-hra` premium EVEN IF neither endpoint is an HRA port.
Implement transit detection and wire it so a Suez-transit voyage gets the Red Sea HRA
premium. A voyage that does not transit Suez and has no HRA port must NOT get it.

## Done when

- All three fixes implemented with focused unit tests passing.
- Shift-table printed (old vs new premium per route; no LLM calls).
- No changes to parser/migrations/RAG.
```

- [ ] **Step 3: Commit**

```bash
git add bench/war-risk/.gitignore bench/war-risk/brief.md
git commit -m "bench(war-risk): agent brief + workspace gitignore"
```

---

### Task 2: Frozen inputs — rubric + price list + effort levels

**Files:**

- Create: `bench/war-risk/rubric.md`
- Create: `bench/war-risk/prices.json`
- Create: `bench/war-risk/effort-levels.txt`

- [ ] **Step 1: Write the blind-judge rubric (frozen before any run)**

Create `bench/war-risk/rubric.md`:

```markdown
# Blind quality rubric — war-risk #957 replay (frozen 2026-06-13)

Score each axis 0-5. Judge sees ONLY a diff with author/model identifiers stripped.
Do not reward verbosity. Penalize scope creep.

1. Coverage of Д1 (live staleness-aware rate + fallback + source surfaced): 0-5
2. Coverage of Д2 (tolerant memoized loader, returns null on error, no parser/migration/RAG edits): 0-5
3. Coverage of Д3 (Suez-transit → red-sea-hra without HRA port; negative case respected): 0-5
4. Correctness/robustness (no throw on bad input, sensible fallbacks): 0-5
5. Discipline (surgical; did NOT touch parser/migrations/RAG; focused tests): 0-5

Output strict JSON: {"d1":N,"d2":N,"d3":N,"correctness":N,"discipline":N,"notes":"<=40 words"}
Judge composite = sum/25 (0..1).
```

- [ ] **Step 2: Fetch official model prices and fill the price list**

Use the `claude-api` skill (or WebFetch the official pricing page) to get current per-million-token input/output USD for `claude-sonnet-4-6` and `claude-opus-4-8`. Do NOT invent numbers. Create `bench/war-risk/prices.json` with the fetched values (example shape, replace with real figures):

```json
{
  "_source": "official Anthropic pricing, fetched 2026-06-13",
  "claude-sonnet-4-6": { "in_per_mtok_usd": 0.0, "out_per_mtok_usd": 0.0 },
  "claude-opus-4-8": { "in_per_mtok_usd": 0.0, "out_per_mtok_usd": 0.0 }
}
```

Note: `claude --output-format json` also returns `total_cost_usd` directly; `prices.json` is the cross-check and lets us recompute if the CLI omits cost.

- [ ] **Step 3: Record valid effort levels**

Confirm accepted `--effort` values and write them, one per line, to `bench/war-risk/effort-levels.txt`:

```
low
medium
high
max
```

Run to confirm none are rejected (cheap, no model call needed — bad value errors fast):

```bash
for e in low medium high max; do claude --effort "$e" --print --model claude-sonnet-4-6 --max-budget-usd 0.01 -p "say ok" >/dev/null 2>&1 && echo "$e ok" || echo "$e REJECTED"; done
```

Expected: all `ok` (or note which are rejected → adjust arms).

- [ ] **Step 4: Commit**

```bash
git add bench/war-risk/rubric.md bench/war-risk/prices.json bench/war-risk/effort-levels.txt
git commit -m "bench(war-risk): freeze rubric, prices, effort levels"
```

---

### Task 3: Pre-flight verification script

**Files:**

- Create: `scripts/bench/preflight.sh`

- [ ] **Step 1: Write the pre-flight script**

Create `scripts/bench/preflight.sh`:

```bash
#!/usr/bin/env bash
# Pre-flight for the war-risk benchmark. Read-only checks. Exits non-zero on any failure.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
START_SHA="e242d259"
REF_SHA="a8e2e3ef"
fail=0

check() { if eval "$2"; then echo "OK   $1"; else echo "FAIL $1"; fail=1; fi; }

check "start SHA exists"        "git cat-file -e ${START_SHA}^{commit} 2>/dev/null"
check "JWC yaml at start SHA"    "git ls-tree -r --name-only ${START_SHA} | grep -q 'data/knowledge/jwc/2025-current.yaml'"
check "yaml has JWLA-033 zone"   "git show ${START_SHA}:data/knowledge/jwc/2025-current.yaml | grep -qi 'JWLA-033'"
check "reference #957 exists"    "git cat-file -e ${REF_SHA}^{commit} 2>/dev/null"
check "brief present"            "test -f ${ROOT}/bench/war-risk/brief.md"
check "rubric present"           "test -f ${ROOT}/bench/war-risk/rubric.md"
check "prices filled (non-zero)" "node -e 'const p=require(\"${ROOT}/bench/war-risk/prices.json\");process.exit(p[\"claude-opus-4-8\"].in_per_mtok_usd>0?0:1)'"
check "claude --effort present"  "claude --help 2>&1 | grep -q -- '--effort'"

# Capture a real JSON output sample to lock the parser field names (cheap call).
echo "-- capturing claude JSON sample --"
claude --print --output-format json --model claude-sonnet-4-6 --effort low --max-budget-usd 0.02 \
  -p 'Reply with exactly: PREFLIGHT_OK' > "${ROOT}/bench/war-risk/usage.sample.json" 2>/dev/null
check "JSON sample has total_cost_usd" "grep -q total_cost_usd ${ROOT}/bench/war-risk/usage.sample.json"
check "JSON sample has usage tokens"   "grep -qE 'input_tokens|output_tokens' ${ROOT}/bench/war-risk/usage.sample.json"

if [ "$fail" -ne 0 ]; then echo 'PREFLIGHT FAILED'; exit 1; fi
echo 'PREFLIGHT PASSED'
```

- [ ] **Step 2: Make executable and run it**

```bash
chmod +x scripts/bench/preflight.sh
bash scripts/bench/preflight.sh
```

Expected: every line `OK …`, final `PREFLIGHT PASSED`. If `yaml has JWLA-033 zone` fails, open `usage.sample.json` and the yaml to adjust the brief's zone ID. Keep `usage.sample.json` (gitignored) — Task 4 parses it.

- [ ] **Step 3: Commit**

```bash
git add scripts/bench/preflight.sh
git commit -m "bench(war-risk): pre-flight verification script"
```

---

### Task 4: Usage/cost JSON parser (pure logic, TDD)

**Files:**

- Create: `scripts/bench/parse-usage.ts`
- Test: `scripts/bench/__tests__/parse-usage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/bench/__tests__/parse-usage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseUsage } from "../parse-usage";

describe("parseUsage", () => {
  it("extracts cost, duration, and tokens from claude --output-format json", () => {
    const raw = JSON.stringify({
      type: "result",
      subtype: "success",
      total_cost_usd: 0.1234,
      duration_ms: 45000,
      num_turns: 7,
      usage: { input_tokens: 1200, output_tokens: 3400 },
      result: "done",
    });
    expect(parseUsage(raw)).toEqual({
      costUsd: 0.1234,
      durationMs: 45000,
      inTokens: 1200,
      outTokens: 3400,
      turns: 7,
    });
  });

  it("throws a clear error on non-JSON", () => {
    expect(() => parseUsage("not json")).toThrow(/parse-usage: invalid JSON/);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run scripts/bench/__tests__/parse-usage.test.ts`
Expected: FAIL — `Cannot find module '../parse-usage'`.

- [ ] **Step 3: Write the minimal implementation**

Create `scripts/bench/parse-usage.ts`:

```ts
export interface Usage {
  costUsd: number;
  durationMs: number;
  inTokens: number;
  outTokens: number;
  turns: number;
}

export function parseUsage(raw: string): Usage {
  let o: any;
  try {
    o = JSON.parse(raw);
  } catch {
    throw new Error("parse-usage: invalid JSON");
  }
  const u = o.usage ?? {};
  return {
    costUsd: Number(o.total_cost_usd ?? 0),
    durationMs: Number(o.duration_ms ?? 0),
    inTokens: Number(u.input_tokens ?? 0),
    outTokens: Number(u.output_tokens ?? 0),
    turns: Number(o.num_turns ?? 0),
  };
}

// CLI: node/tsx parse-usage.ts <file.json> → prints one TSV line
if (process.argv[2]) {
  const fs = await import("node:fs");
  const u = parseUsage(fs.readFileSync(process.argv[2], "utf8"));
  console.log(`${u.costUsd}\t${u.durationMs}\t${u.inTokens}\t${u.outTokens}\t${u.turns}`);
}
```

- [ ] **Step 4: Run the test to confirm it passes; sanity-check on the real sample**

```bash
npx vitest run scripts/bench/__tests__/parse-usage.test.ts
npx tsx scripts/bench/parse-usage.ts bench/war-risk/usage.sample.json
```

Expected: test PASS; second line prints a TSV `cost  ms  in  out  turns` from the real sample. If fields are 0 because the CLI uses different key names, fix `parse-usage.ts` to the real names seen in `usage.sample.json`, then re-run.

- [ ] **Step 5: Commit**

```bash
git add scripts/bench/parse-usage.ts scripts/bench/__tests__/parse-usage.test.ts
git commit -m "bench(war-risk): usage/cost JSON parser + tests"
```

---

### Task 5: Cost extrapolation helper (pure logic, TDD)

**Files:**

- Create: `scripts/bench/estimate.ts`
- Test: `scripts/bench/__tests__/estimate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/bench/__tests__/estimate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extrapolate } from "../estimate";

describe("extrapolate", () => {
  it("scales one pilot run to the full matrix with a safety factor", () => {
    const r = extrapolate({
      pilotCostUsd: 2,
      pilotDurationMs: 600000,
      arms: 6,
      repeats: 3,
      safety: 1.3,
    });
    expect(r.runs).toBe(18);
    expect(r.estCostUsd).toBeCloseTo(46.8, 5); // 2 * 18 * 1.3
    expect(r.estWallClockHoursSerial).toBeCloseTo(3, 5); // 18 * 10min / 60
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run scripts/bench/__tests__/estimate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the minimal implementation**

Create `scripts/bench/estimate.ts`:

```ts
export interface EstimateInput {
  pilotCostUsd: number;
  pilotDurationMs: number;
  arms: number;
  repeats: number;
  safety: number; // multiplier for variance/heavier arms (e.g. opus-max > opus-med)
}
export interface Estimate {
  runs: number;
  estCostUsd: number;
  estWallClockHoursSerial: number;
}

export function extrapolate(i: EstimateInput): Estimate {
  const runs = i.arms * i.repeats;
  const estCostUsd = i.pilotCostUsd * runs * i.safety;
  const estWallClockHoursSerial = (i.pilotDurationMs * runs) / 1000 / 3600;
  return { runs, estCostUsd, estWallClockHoursSerial };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run scripts/bench/__tests__/estimate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/bench/estimate.ts scripts/bench/__tests__/estimate.test.ts
git commit -m "bench(war-risk): cost/time extrapolation helper + tests"
```

---

### Task 6: Throwaway worktree helper

**Files:**

- Create: `scripts/bench/new-run-worktree.sh`

- [ ] **Step 1: Write the script**

Create `scripts/bench/new-run-worktree.sh`:

```bash
#!/usr/bin/env bash
# Create a fresh worktree at the benchmark start SHA. Prints the worktree path.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
START_SHA="e242d259"
ARM="${1:?usage: new-run-worktree.sh <arm> <run>}"
RUN="${2:?usage: new-run-worktree.sh <arm> <run>}"
WT="${ROOT}/bench/war-risk/worktrees/${ARM}-r${RUN}"
git worktree remove --force "$WT" 2>/dev/null || true
git worktree add --quiet --detach "$WT" "$START_SHA"
echo "$WT"
```

- [ ] **Step 2: Make executable and smoke-test it (then clean up)**

```bash
chmod +x scripts/bench/new-run-worktree.sh
WT=$(bash scripts/bench/new-run-worktree.sh smoke 0)
git -C "$WT" rev-parse --short HEAD   # expect: e242d259
git worktree remove --force "$WT"
```

Expected: prints a path, then `e242d259`.

- [ ] **Step 3: Commit**

```bash
git add scripts/bench/new-run-worktree.sh
git commit -m "bench(war-risk): throwaway worktree helper"
```

---

### Task 7: Run-arm script (one benchmarked solve)

**Files:**

- Create: `scripts/bench/run-arm.sh`

- [ ] **Step 1: Write the script (with DRYRUN mode for safe testing)**

Create `scripts/bench/run-arm.sh`:

```bash
#!/usr/bin/env bash
# Run ONE benchmarked solve: fresh worktree, claude solves the brief, capture diff+usage.
# Usage: run-arm.sh <arm> <model> <effort> <run> [budget_usd]
# DRYRUN=1 prints the command instead of calling claude (for tests).
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
ARM="${1:?arm}"; MODEL="${2:?model}"; EFFORT="${3:?effort}"; RUN="${4:?run}"; BUDGET="${5:-8}"
BRIEF="${ROOT}/bench/war-risk/brief.md"
OUT="${ROOT}/bench/war-risk/results/${ARM}/r${RUN}"
mkdir -p "$OUT"

WT="$(bash "${ROOT}/scripts/bench/new-run-worktree.sh" "$ARM" "$RUN")"

CMD=(claude --print --output-format json --model "$MODEL" --effort "$EFFORT" --max-budget-usd "$BUDGET")
if [ "${DRYRUN:-0}" = "1" ]; then
  printf 'DRYRUN cwd=%s cmd=%s < %s\n' "$WT" "${CMD[*]}" "$BRIEF"
  git worktree remove --force "$WT"; exit 0
fi

# Run claude inside the worktree, feeding the brief on stdin.
( cd "$WT" && "${CMD[@]}" < "$BRIEF" ) > "${OUT}/run.json" 2> "${OUT}/run.err" || true

# Capture the produced diff (agent's changes vs the start SHA) and usage metrics.
git -C "$WT" add -A
git -C "$WT" diff --cached e242d259 > "${OUT}/solution.diff" || true
npx tsx "${ROOT}/scripts/bench/parse-usage.ts" "${OUT}/run.json" > "${OUT}/usage.tsv" 2>/dev/null \
  || echo "0	0	0	0	0" > "${OUT}/usage.tsv"

echo "RUN_DONE arm=${ARM} run=${RUN} out=${OUT}"
git worktree remove --force "$WT"
```

- [ ] **Step 2: Make executable and test the DRYRUN path (no model call)**

```bash
chmod +x scripts/bench/run-arm.sh
DRYRUN=1 bash scripts/bench/run-arm.sh opus-med claude-opus-4-8 medium 0
```

Expected: one `DRYRUN cwd=… cmd=claude --print --output-format json --model claude-opus-4-8 --effort medium --max-budget-usd 8 < …/brief.md` line, worktree auto-removed.

- [ ] **Step 3: Commit**

```bash
git add scripts/bench/run-arm.sh
git commit -m "bench(war-risk): run-arm script (dry-run testable)"
```

---

### Task 8: Pilot run + cost extrapolation → FOUNDER GATE

**Files:**

- Create: `scripts/bench/pilot.sh`

- [ ] **Step 1: Write the pilot wrapper**

Create `scripts/bench/pilot.sh`:

```bash
#!/usr/bin/env bash
# Pilot: one real opus-med solve, then extrapolate full 6x3 matrix cost/time.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
bash "${ROOT}/scripts/bench/run-arm.sh" opus-med claude-opus-4-8 medium 1 8
read -r COST MS IN OUT TURNS < "${ROOT}/bench/war-risk/results/opus-med/r1/usage.tsv"
echo "PILOT  cost=\$${COST}  durationMs=${MS}  in=${IN}  out=${OUT}  turns=${TURNS}"
npx tsx -e "
import { extrapolate } from './scripts/bench/estimate.ts';
const e = extrapolate({ pilotCostUsd:${COST:-0}, pilotDurationMs:${MS:-0}, arms:6, repeats:3, safety:1.3 });
console.log('ESTIMATE full', e.runs, 'runs ~ \$'+e.estCostUsd.toFixed(2), '| serial wall-clock ~'+e.estWallClockHoursSerial.toFixed(1)+'h');
"
```

- [ ] **Step 2: Run the pilot (real model call — costs a few $)**

```bash
chmod +x scripts/bench/pilot.sh
bash scripts/bench/pilot.sh
```

Expected: a `PILOT cost=$… durationMs=…` line, then an `ESTIMATE full 18 runs ~ $… | serial wall-clock ~…h` line. Inspect `bench/war-risk/results/opus-med/r1/solution.diff` to confirm the agent actually produced a war-risk solution (non-empty diff touching `lib/economics/war-risk*.ts`).

- [ ] **Step 3: Commit the harness + pilot artifacts metadata**

```bash
git add scripts/bench/pilot.sh
git commit -m "bench(war-risk): pilot runner + full-matrix cost extrapolation"
```

- [ ] **Step 4: STOP — founder go/no-go**

Report to the founder: pilot `$`/time, the extrapolated full-18 `$`/hours, and a one-line read on the pilot diff quality. Do NOT proceed to the full run. Phase 2 (grading layers, 6×3 run, workflow arm, blind judge, frontier) is authored as a separate plan only after the founder approves the estimated spend.

---

## Self-Review

**Spec coverage:** §2 task replay → Tasks 1,3,6,7. §3 arms/n → deferred to Phase 2 (pilot uses 1 arm; matrix sizing lives in `estimate.ts` Task 5). §4 harness (CLI, effort, capture) → Tasks 3,4,7. §5 oracle/grading → **Phase 2 (out of scope here, by design)**. §6 metrics (cost/tokens/time) → Tasks 4,5,8; prices Task 2. §7 procedure pre-flight+pilot+gate → Tasks 3,8. §8 risks (LLM-free, effort flag, prices) → Tasks 2,3. §9 pre-flight checklist → Task 3. Gaps: grading + frontier intentionally deferred (gated), noted in scope.

**Placeholder scan:** `prices.json` zeros are a real fetch step (Task 2 Step 2 uses claude-api skill), not a hidden TODO. `usage.sample.json` field-name confirmation is explicit in Task 4 Step 4. No "TBD/handle edge cases" prose; every code step has full code.

**Type consistency:** `Usage`/`parseUsage` (Task 4) field names (`costUsd,durationMs,inTokens,outTokens,turns`) match `run-arm.sh` TSV order and `pilot.sh` `read` order (`COST MS IN OUT TURNS`). `extrapolate`/`EstimateInput` (Task 5) signature matches the `pilot.sh` inline call (`pilotCostUsd,pilotDurationMs,arms,repeats,safety`). Start SHA `e242d259` and ref `a8e2e3ef` consistent across Tasks 3,6,7.
