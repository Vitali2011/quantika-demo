# Plan + Recon role eval — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan
> task-by-task (inline; it is a bench-harness extension in this repo). Steps use checkbox (`- [ ]`).
> Before using any Next.js/React API introduced or changed after v14 — N/A here (this is bash + tsx
> tooling, no app code).

**Goal:** Build a benchmark rig that measures which model+effort fits the orchestrator-day **Разведка
(recon)** and **План (plan)** roles, reusing the war-risk execution rig, and STOP for founder go
before any paid run.

**Architecture:** Two evals sharing one rig. **Recon** = judge-against-known-root: feed a symptom-only
brief at the pre-fix SHA, capture the model's read-only root-cause text, a blind judge scores it
against the documented true root (kept out of the prompt). **Plan** = downstream-execution: a
plan-config writes a plan for the war-risk task, a _fixed_ Opus:high executor implements it, the
existing #957 jest oracle scores pass-count. The war-risk scripts are generalized with three
default-preserving env vars (`BENCH_DIR`, `BENCH_SHA`) so the committed war-risk bench stays green.

**Tech Stack:** bash orchestration scripts (`scripts/bench/`), `claude --print --output-format json`,
git worktrees, jest (#957 oracle), `tsx` for pure aggregation logic, python3 for JSON verdict parsing.

**Spec:** `docs/superpowers/specs/2026-06-13-orchestrator-day-plan-recon-eval-design.md`.

**Resolved facts (do not re-derive):**

- Recon task **#976** (capacity inflation): fix `d7fa1f9a`, **pre-fix SHA `27b7ef4f`** (bug present).
- Recon task **#975** (deeplink 404): fix `c1e4e836`, **pre-fix SHA `d7fa1f9a`** (bug present).
- Plan task **war-risk #957**: start SHA `e242d259`, oracle ref `a8e2e3ef` (3 hidden test files) —
  reused verbatim from the war-risk bench (`bench/war-risk/brief.md`, `grade-957.sh`).
- Recon configs: `sonnet-high` (`claude-sonnet-4-6`/high), `opus-low`, `opus-med`, `opus-high`
  (`claude-opus-4-8`/{low,medium,high}). Plan configs: `plan-med`, `plan-high`, `plan-max`
  (`claude-opus-4-8`/{medium,high,max}); fixed executor `claude-opus-4-8`/high.

---

## File Structure

**New data files (`bench/plan-recon/`):**

- `recon-976-brief.md`, `recon-975-brief.md` — symptom-only recon briefs (NO root, NO fix).
- `recon-roots.md` — the documented true roots (judge gold; NEVER fed to a recon run).
- `recon-judge-rubric.md` — 3-point root-match rubric for the blind judge.
- `plan-brief.md` — "produce a plan (do not code)" preamble + the war-risk Д1/Д2/Д3 task body.

**New scripts (`scripts/bench/`):**

- `run-recon-arm.sh` — one read-only recon run; captures the model's text answer + usage.
- `run-recon-matrix.sh` — recon matrix (4 configs × 2 tasks × n=3 = 24 runs), throttled.
- `judge-root.sh` — blind root-match judge for one recon answer.
- `judge-root-matrix.sh` — judge across all recon answers.
- `run-plan-arm.sh` — one plan run: Stage 1 generate plan → Stage 2 fixed-executor → #957 oracle.
- `run-plan-matrix.sh` — plan matrix (3 configs × n=3 = 9 plan + 9 executor runs).
- `aggregate-eval.ts` — pure aggregation (mean recon score / mean pass-count per config) + CLI.
- `recon-preflight.sh` — read-only preflight: SHAs exist, bug present, briefs leak-free, 1 cheap sample.

**Modified (surgical, defaults = war-risk so the existing bench is untouched):**

- `scripts/bench/new-run-worktree.sh` — `BENCH_SHA` (default `e242d259`) + `BENCH_DIR` (default `war-risk`).
- `scripts/bench/run-arm.sh` — `BENCH_DIR` for the output path (default `war-risk`).
- `scripts/bench/grade-957.sh` — `BENCH_DIR` for the solution/grades path (default `war-risk`).

---

## Task 1: Generalize the shared rig (BENCH_DIR / BENCH_SHA), war-risk defaults intact

**Files:**

- Modify: `scripts/bench/new-run-worktree.sh`
- Modify: `scripts/bench/run-arm.sh`
- Modify: `scripts/bench/grade-957.sh`

- [ ] **Step 1: Parameterize `new-run-worktree.sh` SHA + dir**

Replace the two hardcoded lines. Change:

```bash
START_SHA="e242d259"
ARM="${1:?usage: new-run-worktree.sh <arm> <run>}"
RUN="${2:?usage: new-run-worktree.sh <arm> <run>}"
WT="${ROOT}/bench/war-risk/worktrees/${ARM}-r${RUN}"
```

to:

```bash
START_SHA="${BENCH_SHA:-e242d259}"
BENCH_DIR="${BENCH_DIR:-war-risk}"
ARM="${1:?usage: new-run-worktree.sh <arm> <run>}"
RUN="${2:?usage: new-run-worktree.sh <arm> <run>}"
WT="${ROOT}/bench/${BENCH_DIR}/worktrees/${ARM}-r${RUN}"
```

- [ ] **Step 2: Parameterize `run-arm.sh` output dir**

In `run-arm.sh`, change:

```bash
OUT="${ROOT}/bench/war-risk/results/${ARM}/r${RUN}"
```

to:

```bash
OUT="${ROOT}/bench/${BENCH_DIR:-war-risk}/results/${ARM}/r${RUN}"
```

(The `BENCH_BRIEF` / `BENCH_PERM` knobs already exist. `BENCH_DIR` is inherited by the
`new-run-worktree.sh` child via the environment — no extra plumbing.)

- [ ] **Step 3: Parameterize `grade-957.sh` solution + grades dir**

In `grade-957.sh`, change:

```bash
SOL="${ROOT}/bench/war-risk/results/${ARM}/r${RUN}/solution.diff"
OUT="${ROOT}/bench/war-risk/grades/${ARM}/r${RUN}"; mkdir -p "$OUT"
```

to:

```bash
SOL="${ROOT}/bench/${BENCH_DIR:-war-risk}/results/${ARM}/r${RUN}/solution.diff"
OUT="${ROOT}/bench/${BENCH_DIR:-war-risk}/grades/${ARM}/r${RUN}"; mkdir -p "$OUT"
```

(Leave the `REF`/oracle SHA `a8e2e3ef` and the overlaid test paths unchanged — the #957 oracle is the
same regardless of where the candidate diff lives.)

- [ ] **Step 4: Verify war-risk defaults are unchanged (DRYRUN, no spend)**

Run:

```bash
cd /Users/jarvis/work/quantika-demo/.claude/worktrees/sharp-sinoussi-53ce5a
DRYRUN=1 bash scripts/bench/run-arm.sh sonnet-max claude-sonnet-4-6 max 1 8
```

Expected: prints a `DRYRUN cwd=.../bench/war-risk/worktrees/sonnet-max-r1 ...` line (war-risk path,
because `BENCH_DIR` is unset → default). Then:

```bash
DRYRUN=1 BENCH_DIR=plan-recon BENCH_SHA=27b7ef4f bash scripts/bench/run-arm.sh t976-x claude-opus-4-8 low 1 8
```

Expected: the printed `cwd=` now contains `bench/plan-recon/worktrees/t976-x-r1` (override applied).
The DRYRUN removes its own worktree; no claude call, no cost.

- [ ] **Step 5: Commit**

```bash
git add scripts/bench/new-run-worktree.sh scripts/bench/run-arm.sh scripts/bench/grade-957.sh
git commit -m "feat(bench): parameterize rig with BENCH_DIR/BENCH_SHA (war-risk defaults intact)"
```

---

## Task 2: Recon briefs, gold roots, judge rubric (symptom-only, leak-free)

**Files:**

- Create: `bench/plan-recon/recon-976-brief.md`
- Create: `bench/plan-recon/recon-975-brief.md`
- Create: `bench/plan-recon/recon-roots.md`
- Create: `bench/plan-recon/recon-judge-rubric.md`

- [ ] **Step 1: Write the #976 symptom-only brief**

`bench/plan-recon/recon-976-brief.md`:

```markdown
# Recon task — implausible vessel capacity

RECON MODE — read-only investigation. Do NOT edit files. Do NOT write code or a fix.
Read the repo as needed (Read/Grep/Glob/Bash-grep) and find the single ROOT CAUSE.

## Symptom (what was observed)

In the demo, the grain/bale capacity figure for many vessels (17+) shows impossibly large
values — on the order of ~30× the vessel's deadweight (DWT). A vessel whose DWT implies a
modest hold volume instead displays thousands of cubic-metre capacity. Some vessels are
affected, others look correct. The inflated numbers originate upstream of the UI — in how a
capacity value coming from a source email/cargo line is read into the vessel's capacity field.

## Your output (exactly these three)

1. ROOT CAUSE — one or two sentences naming the actual underlying cause (not the symptom).
2. LOCATION — the file(s) and function where it originates.
3. MECHANISM — why this produces roughly a ~30× inflation specifically.
```

- [ ] **Step 2: Write the #975 symptom-only brief**

`bench/plan-recon/recon-975-brief.md`:

```markdown
# Recon task — detail deep-link 404 after rehydrate

RECON MODE — read-only investigation. Do NOT edit files. Do NOT write code or a fix.
Read the repo as needed (Read/Grep/Glob/Bash-grep) and find the single ROOT CAUSE.

## Symptom (what was observed)

In the demo, opening a detail page directly by its URL (a deep-link to a match/vessel/fixture
detail route) returns 404 — but ONLY after the demo session has "rehydrated" (re-seeded its
in-memory session data). The very same detail page opens fine when navigated to from inside
the app. Some detail routes survive a direct deep-link; at least one route 404s every time
after rehydrate.

## Your output (exactly these three)

1. ROOT CAUSE — one or two sentences naming the actual underlying cause (not the symptom).
2. LOCATION — the file(s)/function where it originates.
3. MECHANISM — why navigating from inside the app works but a direct deep-link 404s post-rehydrate.
```

- [ ] **Step 3: Write the gold roots (judge-only — never fed to a run)**

`bench/plan-recon/recon-roots.md`:

```markdown
# Gold root causes — JUDGE INPUT ONLY. Never include in a recon run brief.

## t976 — implausible capacity (fix d7fa1f9a / qa #976)

ROOT: the grain/bale capacity arrives unit-less in the source (e.g. a value like "G/B 220.577")
and is interpreted as cubic METRES (cbm) when it is actually cubic FEET (cbft). The cbft→cbm
factor is ~35.3, so the normalizer stores a ~30× inflated cbm for those vessels. The shipped fix
nulls/clamps grain/bale capacity when it exceeds ~2.5× DWT (an implausible upper bound),
symmetrically with the pre-existing lower bound.
ACCEPT as root-found: candidate identifies the unit misread (cbft read as cbm) OR the missing
upper-bound plausibility clamp on capacity-vs-DWT as the cause of the ~30× inflation.
SYMPTOM-ONLY (score 1): candidate only restates "capacity too large / >DWT" or blames the UI/display
without locating the unit/normalizer cause.

## t975 — deep-link 404 after rehydrate (fix c1e4e836 / qa #975)

ROOT: detail routes are keyed by a numeric, session-scoped match-id that is regenerated when the
demo session rehydrates, so a deep-link id captured before rehydrate no longer resolves afterwards
→ 404. Routes keyed by a stable id (gmail-id) survive; the rehydrate-guard did not cover the detail
routes. The shipped fix extends the rehydrate-guard to the detail routes and adds a re-persist /
getMatchBySlug fallback for the stale numeric match-id.
ACCEPT as root-found: candidate identifies that the detail-route id is session-scoped/regenerated on
rehydrate (stale id) AND/OR that the rehydrate-guard does not cover those routes.
SYMPTOM-ONLY (score 1): candidate only says "session data is missing after rehydrate" or "route not
found" without pinpointing the stale/regenerated id or the guard gap.
```

- [ ] **Step 4: Write the 3-point judge rubric**

`bench/plan-recon/recon-judge-rubric.md`:

```markdown
# Blind recon grading — root-cause match

A candidate did a read-only investigation of a known bug and produced a root-cause analysis.
You are given (a) the GOLD root cause and accept/symptom guidance, and (b) the candidate's
analysis. Decide how well the candidate identified the ROOT (not the symptom). You do NOT know
which model produced the candidate text. Grade strictly; do not reward length or unrelated detail.

## Scoring

- `root`: 2 = identified the actual root per the GOLD "ACCEPT as root-found" guidance.
  1 = symptom-only / adjacent (per the GOLD "SYMPTOM-ONLY" guidance) — correct area, wrong/no root.
  0 = wrong or no usable cause.
- `location`: 0 or 1 — 1 if it named a plausible correct file/function area, else 0.
- `confidence`: your confidence in this grade, 0..3 (3 = unambiguous).
- `notes`: ONE short sentence on the deciding factor.

## Output

Output ONLY a single JSON object on one line, nothing before or after:
{"root":N,"location":N,"confidence":N,"notes":"..."}
```

- [ ] **Step 5: Verify the briefs do NOT leak the roots**

Run:

```bash
cd /Users/jarvis/work/quantika-demo/.claude/worktrees/sharp-sinoussi-53ce5a
grep -niE "cbft|cubic feet|35\.3|2\.5|gmail-id|session-scoped|rehydrate-guard|getMatchBySlug|clamp" \
  bench/plan-recon/recon-976-brief.md bench/plan-recon/recon-975-brief.md
```

Expected: **no matches** (the briefs carry only the symptom; the fix mechanism is absent). If any
line matches, reword the brief to remove the leaked term before continuing.

- [ ] **Step 6: Commit**

```bash
git add bench/plan-recon/recon-976-brief.md bench/plan-recon/recon-975-brief.md \
        bench/plan-recon/recon-roots.md bench/plan-recon/recon-judge-rubric.md
git commit -m "feat(bench): recon briefs (symptom-only) + gold roots + judge rubric"
```

---

## Task 3: Plan-eval brief (produce a plan, do not code)

**Files:**

- Create: `bench/plan-recon/plan-brief.md`

- [ ] **Step 1: Write the planning brief (war-risk task, planning-mode)**

`bench/plan-recon/plan-brief.md`:

```markdown
# Planning task — war-risk premium (PLAN ONLY)

PLANNING MODE — read-only. Produce an IMPLEMENTATION PLAN only. Do NOT edit files, do NOT
write code. Read the repo as needed. Your plan will be handed to a SEPARATE engineer who will
implement it exactly as written and is judged only on whether the resulting code passes hidden
tests — so the plan must be complete and unambiguous: exact files to touch, what each change
does, the function/loader shapes, and which unit tests to add.

You are in the quantika-demo repo (maritime freight matching). Plan the following three fixes to
the war-risk premium calculation. Do NOT plan changes to parsers, DB migrations, or the
RAG/knowledge ingestion path.

## Д1 — replace the stale hardcoded JWC rate with a live, staleness-aware rate

`lib/economics/war-risk.ts` uses a hardcoded `0.075%` effective `2024-01-01`. Source the current
rate live from `data/knowledge/jwc/2025-current.yaml` (zone JWLA-033). Keep a hardcoded fallback if
the file/zone is missing or unreadable. Surface which source was used (live vs fallback) on the result.

## Д2 — single source of truth via a tolerant YAML loader

Add a small, memoized, tolerant YAML loader (economics-local) that reads the JWC zones from
`2025-current.yaml`, maps zone IDs to the calculator's zone IDs, converts pct→fraction, and returns
`null` on ANY error without throwing. Do not modify the existing YAML parser, schema, or migrations.

## Д3 — thread Suez-transit detection into the HRA premium

`viaCanal` is not threaded into the premium logic. A voyage that TRANSITS the Suez canal must trigger
the `red-sea-hra` premium EVEN IF neither endpoint is an HRA port; a voyage that does not transit Suez
and has no HRA port must NOT get it. Plan the transit detection and wiring, both directions.

## Your output

A complete, step-by-step implementation plan (files, changes, loader/function shapes, unit tests).
No code edits — the plan text is your entire deliverable.
```

- [ ] **Step 2: Commit**

```bash
git add bench/plan-recon/plan-brief.md
git commit -m "feat(bench): plan-eval brief (war-risk task, planning-mode)"
```

---

## Task 4: Recon run script + matrix (read-only, capture text)

**Files:**

- Create: `scripts/bench/run-recon-arm.sh`
- Create: `scripts/bench/run-recon-matrix.sh`

- [ ] **Step 1: Write `run-recon-arm.sh`**

```bash
#!/usr/bin/env bash
# One recon run: fresh read worktree at the task's pre-fix SHA, claude investigates the
# symptom-only brief read-only, capture its TEXT answer (not a diff) + usage.
# Usage: run-recon-arm.sh <task> <sha> <arm> <model> <effort> <run> [budget]
# DRYRUN=1 prints the command instead of calling claude.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
TASK="${1:?task}"; SHA="${2:?sha}"; ARM="${3:?arm}"; MODEL="${4:?model}"; EFFORT="${5:?effort}"
RUN="${6:?run}"; BUDGET="${7:-4}"
BRIEF="${ROOT}/bench/plan-recon/${TASK}-brief.md"
OUT="${ROOT}/bench/plan-recon/results/${TASK}/${ARM}/r${RUN}"; mkdir -p "$OUT"

WT="$(BENCH_DIR=plan-recon BENCH_SHA="$SHA" bash "${ROOT}/scripts/bench/new-run-worktree.sh" "${TASK}-${ARM}" "$RUN")"

# Isolated config: ONLY auth + minimal settings, no ambient skills/hooks (same validity fix as
# run-arm). acceptEdits gives the model full Read/Grep/Bash to investigate; the brief forbids edits
# and we capture text, not a diff, so any stray edit is discarded with the worktree.
CLEAN="${OUT}/.cfg"; mkdir -p "$CLEAN"
cp "$HOME/.claude/.credentials.json" "$CLEAN/.credentials.json" 2>/dev/null || true
printf '{"defaultMode":"acceptEdits"}\n' > "$CLEAN/settings.json"

CMD=(claude --print --output-format json --permission-mode acceptEdits --model "$MODEL" --effort "$EFFORT" --max-budget-usd "$BUDGET")
if [ "${DRYRUN:-0}" = "1" ]; then
  printf 'DRYRUN cwd=%s cmd=CLAUDE_CONFIG_DIR=%s %s < %s\n' "$WT" "$CLEAN" "${CMD[*]}" "$BRIEF"
  git worktree remove --force "$WT"; exit 0
fi

( cd "$WT" && CLAUDE_CONFIG_DIR="$CLEAN" "${CMD[@]}" < "$BRIEF" ) > "${OUT}/run.json" 2> "${OUT}/run.err" || true

# Extract the model's text answer (.result) → recon.txt; parse usage.
python3 - "$OUT" <<'PY'
import json,sys
out=sys.argv[1]
try:
    d=json.load(open(f"{out}/run.json")); t=(d.get("result") or "").strip()
except Exception:
    t=""
open(f"{out}/recon.txt","w").write(t)
print("CAPTURED" if t else "EMPTY")
PY
npx tsx "${ROOT}/scripts/bench/parse-usage.ts" "${OUT}/run.json" > "${OUT}/usage.tsv" 2>/dev/null \
  || printf '0\t0\t0\t0\t0\n' > "${OUT}/usage.tsv"

echo "RECON_DONE task=${TASK} arm=${ARM} run=${RUN} out=${OUT}"
git worktree remove --force "$WT"
```

- [ ] **Step 2: Write `run-recon-matrix.sh`**

```bash
#!/usr/bin/env bash
# Recon matrix: 4 configs × 2 tasks × REPS, throttled, RAM-gated, setsid-detached.
# Idempotent: skips runs whose recon.txt exists or whose worktree is live.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
MAX_PAR="${MAX_PAR:-3}"; MIN_AVAIL_MB="${MIN_AVAIL_MB:-2000}"; REPS="${REPS:-3}"; BUDGET="${BUDGET:-4}"

# task:sha
TASKS=( "recon-976:27b7ef4f" "recon-975:d7fa1f9a" )
# arm:model:effort
ARMS=(
  "sonnet-high:claude-sonnet-4-6:high"
  "opus-low:claude-opus-4-8:low"
  "opus-med:claude-opus-4-8:medium"
  "opus-high:claude-opus-4-8:high"
)
avail_mb(){ free -m | awk '/^Mem:/{print $7}'; }
running(){ ls -d "${ROOT}/bench/plan-recon/worktrees/"*/ 2>/dev/null | wc -l; }
log(){ echo "[$(date +%H:%M:%S)] $*"; }

log "recon-matrix start MAX_PAR=$MAX_PAR REPS=$REPS"
for rep in $(seq 1 "$REPS"); do
  for t in "${TASKS[@]}"; do
    IFS=: read -r task sha <<< "$t"
    for spec in "${ARMS[@]}"; do
      IFS=: read -r arm model effort <<< "$spec"
      out="${ROOT}/bench/plan-recon/results/${task}/${arm}/r${rep}/recon.txt"
      wt="${ROOT}/bench/plan-recon/worktrees/${task}-${arm}-r${rep}"
      [ -f "$out" ] && { log "skip ${task}/${arm} r${rep} (done)"; continue; }
      [ -d "$wt" ]  && { log "skip ${task}/${arm} r${rep} (running)"; continue; }
      while [ "$(running)" -ge "$MAX_PAR" ]; do sleep 20; done
      while [ "$(avail_mb)" -lt "$MIN_AVAIL_MB" ]; do log "RAM wait $(avail_mb)MB"; sleep 30; done
      log "launch ${task}/${arm} r${rep}"
      setsid nohup bash "${ROOT}/scripts/bench/run-recon-arm.sh" "$task" "$sha" "$arm" "$model" "$effort" "$rep" "$BUDGET" >/dev/null 2>&1 &
      sleep 5
    done
  done
done
wait
log "RECON-MATRIX DONE"
```

- [ ] **Step 3: Verify both scripts parse + DRYRUN one recon arm (no spend)**

```bash
cd /Users/jarvis/work/quantika-demo/.claude/worktrees/sharp-sinoussi-53ce5a
bash -n scripts/bench/run-recon-arm.sh && bash -n scripts/bench/run-recon-matrix.sh && echo "SYNTAX_OK"
DRYRUN=1 bash scripts/bench/run-recon-arm.sh recon-976 27b7ef4f opus-low claude-opus-4-8 low 1 4
```

Expected: `SYNTAX_OK`, then a `DRYRUN cwd=.../bench/plan-recon/worktrees/recon-976-opus-low-r1 ...`
line referencing `recon-976-brief.md`. No claude call.

- [ ] **Step 4: Commit**

```bash
git add scripts/bench/run-recon-arm.sh scripts/bench/run-recon-matrix.sh
git commit -m "feat(bench): recon run + matrix (read-only, capture text)"
```

---

## Task 5: Root-match judge + matrix

**Files:**

- Create: `scripts/bench/judge-root.sh`
- Create: `scripts/bench/judge-root-matrix.sh`

- [ ] **Step 1: Write `judge-root.sh`**

````bash
#!/usr/bin/env bash
# Blind root-match judge for ONE recon answer. Feeds rubric + the gold root section for this task
# + the candidate recon text to an isolated claude judge in an empty cwd. Usage:
# judge-root.sh <task> <arm> <run> [model] [effort]
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
TASK="${1:?task}"; ARM="${2:?arm}"; RUN="${3:?run}"; MODEL="${4:-claude-opus-4-8}"; EFFORT="${5:-high}"
REC="${ROOT}/bench/plan-recon/results/${TASK}/${ARM}/r${RUN}/recon.txt"
OUT="${ROOT}/bench/plan-recon/grades/${TASK}/${ARM}/r${RUN}"; mkdir -p "$OUT"
[ -s "$REC" ] || { echo "NO_RECON ${TASK}/${ARM} r${RUN}"; printf '{}\n' > "${OUT}/scores.json"; exit 0; }

# Slice the gold-root section for THIS task (the "## <task...>" block) from recon-roots.md.
KEY="$(printf '%s' "$TASK" | sed 's/recon-/t/')"   # recon-976 -> t976
awk -v k="## ${KEY}" 'index($0,k){p=1} p&&/^## /&&index($0,k)==0&&NR>1{if(seen){exit}} p{print; seen=1}' \
   "${ROOT}/bench/plan-recon/recon-roots.md" > "${OUT}/gold.md"

CFG="${OUT}/.cfg"; mkdir -p "$CFG"
cp "$HOME/.claude/.credentials.json" "$CFG/.credentials.json" 2>/dev/null || true
printf '{"defaultMode":"acceptEdits"}\n' > "$CFG/settings.json"
SCRATCH="${OUT}/scratch"; mkdir -p "$SCRATCH"

{ cat "${ROOT}/bench/plan-recon/recon-judge-rubric.md"; echo; echo "## GOLD root cause:"; cat "${OUT}/gold.md";
  echo; echo "## Candidate analysis:"; echo '```'; cat "$REC"; echo '```'; } > "${OUT}/judge-input.md"

( cd "$SCRATCH" && CLAUDE_CONFIG_DIR="$CFG" claude --print --output-format json \
    --permission-mode acceptEdits --model "$MODEL" --effort "$EFFORT" --max-budget-usd 2 \
    < "${OUT}/judge-input.md" ) > "${OUT}/verdict.json" 2> "${OUT}/verdict.err" || true

python3 - "$OUT" <<'PY'
import json,re,sys
out=sys.argv[1]
try:
    d=json.load(open(f"{out}/verdict.json")); t=(d.get("result") or "").strip()
except Exception:
    t=""
v={}
try: v=json.loads(t)
except Exception:
    m=re.search(r'\{.*\}',t,re.S)
    if m:
        try: v=json.loads(m.group(0))
        except Exception: v={}
json.dump(v, open(f"{out}/scores.json","w"))
print("OK" if v else "PARSE_FAIL")
PY
echo "ROOT_JUDGED ${TASK}/${ARM} r${RUN}: $(cat ${OUT}/scores.json)"
````

- [ ] **Step 2: Write `judge-root-matrix.sh`**

```bash
#!/usr/bin/env bash
# Run the root-match judge across all recon answers, throttled. Idempotent: skips an answer
# whose scores.json already has a "root" field.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
MAX_PAR="${MAX_PAR:-6}"
TASKS=(recon-976 recon-975)
ARMS=(sonnet-high opus-low opus-med opus-high)
running(){ pgrep -fc 'scripts/bench/judge-root.sh' 2>/dev/null || echo 0; }
log(){ echo "[$(date +%H:%M:%S)] $*"; }

log "root-judge-matrix start MAX_PAR=$MAX_PAR"
for task in "${TASKS[@]}"; do
  for arm in "${ARMS[@]}"; do
    for run in 1 2 3; do
      sc="${ROOT}/bench/plan-recon/grades/${task}/${arm}/r${run}/scores.json"
      [ -s "$sc" ] && grep -q '"root"' "$sc" 2>/dev/null && { log "skip ${task}/${arm} r${run}"; continue; }
      while [ "$(running)" -ge "$MAX_PAR" ]; do sleep 8; done
      log "judge ${task}/${arm} r${run}"
      setsid nohup bash "${ROOT}/scripts/bench/judge-root.sh" "$task" "$arm" "$run" >/dev/null 2>&1 &
      sleep 2
    done
  done
done
wait
log "ROOT-JUDGE-MATRIX DONE"
```

- [ ] **Step 3: Verify syntax + the gold-slice awk picks exactly one task block**

```bash
cd /Users/jarvis/work/quantika-demo/.claude/worktrees/sharp-sinoussi-53ce5a
bash -n scripts/bench/judge-root.sh && bash -n scripts/bench/judge-root-matrix.sh && echo "SYNTAX_OK"
awk -v k="## t976" 'index($0,k){p=1} p&&/^## /&&index($0,k)==0&&NR>1{if(seen){exit}} p{print; seen=1}' \
   bench/plan-recon/recon-roots.md | head -3
```

Expected: `SYNTAX_OK`, then the first lines of ONLY the `## t976` block (starts with `## t976 —`,
does NOT bleed into the `## t975` block).

- [ ] **Step 4: Commit**

```bash
git add scripts/bench/judge-root.sh scripts/bench/judge-root-matrix.sh
git commit -m "feat(bench): blind root-match judge + matrix for recon"
```

---

## Task 6: Plan run script + matrix (Stage 1 plan → Stage 2 fixed executor → #957 oracle)

**Files:**

- Create: `scripts/bench/run-plan-arm.sh`
- Create: `scripts/bench/run-plan-matrix.sh`

- [ ] **Step 1: Write `run-plan-arm.sh`**

```bash
#!/usr/bin/env bash
# One plan-eval run. Stage 1: the plan-config writes a plan for the war-risk task (read-only).
# Stage 2: a FIXED Opus:high executor implements brief+plan via run-arm.sh. Then grade with #957.
# Usage: run-plan-arm.sh <arm> <plan_model> <plan_effort> <run> [plan_budget] [exec_budget]
# DRYRUN=1 prints the Stage-1 command and skips claude.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
ARM="${1:?arm}"; PMODEL="${2:?plan_model}"; PEFFORT="${3:?plan_effort}"; RUN="${4:?run}"
PBUD="${5:-4}"; EBUD="${6:-8}"
OUT="${ROOT}/bench/plan-recon/results/plan/${ARM}/r${RUN}"; mkdir -p "$OUT"

# ---- Stage 1: generate the plan (read-only worktree at the war-risk start SHA) ----
WT="$(BENCH_DIR=plan-recon BENCH_SHA=e242d259 bash "${ROOT}/scripts/bench/new-run-worktree.sh" "planA-${ARM}" "$RUN")"
CLEAN="${OUT}/.cfg"; mkdir -p "$CLEAN"
cp "$HOME/.claude/.credentials.json" "$CLEAN/.credentials.json" 2>/dev/null || true
printf '{"defaultMode":"acceptEdits"}\n' > "$CLEAN/settings.json"
P1=(claude --print --output-format json --permission-mode acceptEdits --model "$PMODEL" --effort "$PEFFORT" --max-budget-usd "$PBUD")
if [ "${DRYRUN:-0}" = "1" ]; then
  printf 'DRYRUN stage1 cwd=%s cmd=%s < %s\n' "$WT" "${P1[*]}" "${ROOT}/bench/plan-recon/plan-brief.md"
  git worktree remove --force "$WT"; exit 0
fi
( cd "$WT" && CLAUDE_CONFIG_DIR="$CLEAN" "${P1[@]}" < "${ROOT}/bench/plan-recon/plan-brief.md" ) \
  > "${OUT}/plan-run.json" 2> "${OUT}/plan-run.err" || true
python3 - "$OUT" <<'PY'
import json,sys
out=sys.argv[1]
try: t=(json.load(open(f"{out}/plan-run.json")).get("result") or "").strip()
except Exception: t=""
open(f"{out}/plan.md","w").write(t)
print("PLAN_OK" if len(t)>200 else "PLAN_THIN")
PY
npx tsx "${ROOT}/scripts/bench/parse-usage.ts" "${OUT}/plan-run.json" > "${OUT}/plan-usage.tsv" 2>/dev/null \
  || printf '0\t0\t0\t0\t0\n' > "${OUT}/plan-usage.tsv"
git worktree remove --force "$WT"

# ---- Stage 2: FIXED executor (Opus:high) implements brief + the generated plan ----
COMBINED="${OUT}/exec-brief.md"
{ cat "${ROOT}/bench/war-risk/brief.md"; echo; echo "## Approved implementation plan — follow it exactly:";
  echo; cat "${OUT}/plan.md"; } > "$COMBINED"
EXARM="planexec-${ARM}"
BENCH_DIR=plan-recon BENCH_BRIEF="$COMBINED" BENCH_PERM=acceptEdits \
  bash "${ROOT}/scripts/bench/run-arm.sh" "$EXARM" claude-opus-4-8 high "$RUN" "$EBUD"

# ---- Grade Stage-2 diff with the #957 hidden-test oracle ----
BENCH_DIR=plan-recon bash "${ROOT}/scripts/bench/grade-957.sh" "$EXARM" "$RUN"
echo "PLAN_RUN_DONE arm=${ARM} run=${RUN}"
```

- [ ] **Step 2: Write `run-plan-matrix.sh`**

```bash
#!/usr/bin/env bash
# Plan matrix: 3 plan-configs × REPS. Serial-ish (each run already spawns a Stage-2 executor +
# jest), throttled by live worktree count under plan-recon. Idempotent on the #957 summary.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
MAX_PAR="${MAX_PAR:-2}"; MIN_AVAIL_MB="${MIN_AVAIL_MB:-2500}"; REPS="${REPS:-3}"
# arm:plan_model:plan_effort
ARMS=( "plan-med:claude-opus-4-8:medium" "plan-high:claude-opus-4-8:high" "plan-max:claude-opus-4-8:max" )
avail_mb(){ free -m | awk '/^Mem:/{print $7}'; }
running(){ ls -d "${ROOT}/bench/plan-recon/worktrees/"*/ 2>/dev/null | wc -l; }
log(){ echo "[$(date +%H:%M:%S)] $*"; }

log "plan-matrix start MAX_PAR=$MAX_PAR REPS=$REPS"
for rep in $(seq 1 "$REPS"); do
  for spec in "${ARMS[@]}"; do
    IFS=: read -r arm model effort <<< "$spec"
    done_f="${ROOT}/bench/plan-recon/grades/planexec-${arm}/r${rep}/h957.summary"
    [ -s "$done_f" ] && grep -q Tests "$done_f" && { log "skip ${arm} r${rep} (done)"; continue; }
    while [ "$(running)" -ge "$MAX_PAR" ]; do sleep 20; done
    while [ "$(avail_mb)" -lt "$MIN_AVAIL_MB" ]; do log "RAM wait $(avail_mb)MB"; sleep 30; done
    log "launch ${arm} r${rep}"
    setsid nohup bash "${ROOT}/scripts/bench/run-plan-arm.sh" "$arm" "$model" "$effort" "$rep" >/dev/null 2>&1 &
    sleep 8
  done
done
wait
log "PLAN-MATRIX DONE"
```

- [ ] **Step 3: Verify syntax + DRYRUN Stage-1 (no spend)**

```bash
cd /Users/jarvis/work/quantika-demo/.claude/worktrees/sharp-sinoussi-53ce5a
bash -n scripts/bench/run-plan-arm.sh && bash -n scripts/bench/run-plan-matrix.sh && echo "SYNTAX_OK"
DRYRUN=1 bash scripts/bench/run-plan-arm.sh plan-med claude-opus-4-8 medium 1
```

Expected: `SYNTAX_OK`, then a `DRYRUN stage1 cwd=.../bench/plan-recon/worktrees/planA-plan-med-r1 ...`
line referencing `plan-brief.md`. No claude call, no Stage-2.

- [ ] **Step 4: Commit**

```bash
git add scripts/bench/run-plan-arm.sh scripts/bench/run-plan-matrix.sh
git commit -m "feat(bench): plan eval (gen-plan -> fixed executor -> #957 oracle)"
```

---

## Task 7: Aggregation (pure logic, TDD) + CLI

**Files:**

- Create: `scripts/bench/aggregate-eval.ts`
- Test: `scripts/bench/__tests__/aggregate-eval.test.ts`

- [ ] **Step 1: Write the failing test**

`scripts/bench/__tests__/aggregate-eval.test.ts`:

```typescript
import { meanReconScore, meanPassCount, parsePassCount } from "../aggregate-eval";

describe("meanReconScore", () => {
  it("averages root+location across runs, ignoring empty verdicts", () => {
    const rows = [
      { root: 2, location: 1 },
      { root: 1, location: 0 },
      {}, // empty/parse-fail → ignored
    ];
    const r = meanReconScore(rows);
    expect(r.n).toBe(2);
    expect(r.meanRoot).toBeCloseTo(1.5);
    expect(r.meanLocation).toBeCloseTo(0.5);
  });
  it("returns zeros and n=0 when no valid rows", () => {
    expect(meanReconScore([{}, {}])).toEqual({ n: 0, meanRoot: 0, meanLocation: 0 });
  });
});

describe("parsePassCount", () => {
  it("extracts passed count from a jest Tests: summary line", () => {
    expect(parsePassCount("Tests: 7 passed, 7 total")).toBe(7);
    expect(parsePassCount("Tests: 2 failed, 5 passed, 7 total")).toBe(5);
    expect(parsePassCount("Tests: 0 (no diff)")).toBe(0);
  });
});

describe("meanPassCount", () => {
  it("averages pass counts", () => {
    expect(meanPassCount([7, 7, 5]).mean).toBeCloseTo(6.333, 2);
    expect(meanPassCount([7, 7, 5]).n).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `cd /Users/jarvis/work/quantika-demo/.claude/worktrees/sharp-sinoussi-53ce5a && npx jest scripts/bench/__tests__/aggregate-eval.test.ts`
Expected: FAIL — `Cannot find module '../aggregate-eval'`.

- [ ] **Step 3: Write the implementation**

`scripts/bench/aggregate-eval.ts`:

```typescript
// Pure aggregation for the plan+recon eval + a thin CLI. Pure functions are unit-tested;
// the CLI (guarded to fire only under tsx) walks the results/grades dirs and prints tables.

export interface ReconVerdict {
  root?: number;
  location?: number;
}
export interface ReconAgg {
  n: number;
  meanRoot: number;
  meanLocation: number;
}

export function meanReconScore(rows: ReconVerdict[]): ReconAgg {
  const valid = rows.filter((r) => typeof r.root === "number");
  if (valid.length === 0) return { n: 0, meanRoot: 0, meanLocation: 0 };
  const sum = (f: (r: ReconVerdict) => number) => valid.reduce((a, r) => a + f(r), 0);
  return {
    n: valid.length,
    meanRoot: sum((r) => r.root ?? 0) / valid.length,
    meanLocation: sum((r) => r.location ?? 0) / valid.length,
  };
}

// Extract the "passed" number from a jest "Tests:" summary line.
export function parsePassCount(summary: string): number {
  const m = summary.match(/(\d+)\s+passed/);
  return m ? Number(m[1]) : 0;
}

export function meanPassCount(counts: number[]): { n: number; mean: number } {
  if (counts.length === 0) return { n: 0, mean: 0 };
  return { n: counts.length, mean: counts.reduce((a, b) => a + b, 0) / counts.length };
}

// CLI: print per-config recon means + plan pass-count means. Guarded so jest never triggers it.
if (process.argv[1] && process.argv[1].endsWith("aggregate-eval.ts")) {
  const fs = require("node:fs");
  const path = require("node:path");
  const ROOT = process.cwd();
  const base = path.join(ROOT, "bench/plan-recon");

  const readJSON = (p: string): any => {
    try {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      return {};
    }
  };
  const dirs = (p: string): string[] => {
    try {
      return fs.readdirSync(p);
    } catch {
      return [];
    }
  };

  console.log("=== RECON (mean root /2, location /1) ===");
  for (const task of dirs(path.join(base, "grades"))) {
    if (!task.startsWith("recon-")) continue;
    for (const arm of dirs(path.join(base, "grades", task))) {
      const rows: ReconVerdict[] = [];
      for (const run of dirs(path.join(base, "grades", task, arm))) {
        rows.push(readJSON(path.join(base, "grades", task, arm, run, "scores.json")));
      }
      const a = meanReconScore(rows);
      console.log(
        `${task}\t${arm}\tn=${a.n}\troot=${a.meanRoot.toFixed(2)}\tloc=${a.meanLocation.toFixed(2)}`
      );
    }
  }

  console.log("=== PLAN (mean #957 passed) ===");
  const pgrades = path.join(base, "grades");
  for (const arm of dirs(pgrades)) {
    if (!arm.startsWith("planexec-")) continue;
    const counts: number[] = [];
    for (const run of dirs(path.join(pgrades, arm))) {
      const sumPath = path.join(pgrades, arm, run, "h957.summary");
      try {
        counts.push(parsePassCount(fs.readFileSync(sumPath, "utf8")));
      } catch {
        /* skip */
      }
    }
    const m = meanPassCount(counts);
    console.log(`${arm}\tn=${m.n}\tpassed=${m.mean.toFixed(2)}`);
  }
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `cd /Users/jarvis/work/quantika-demo/.claude/worktrees/sharp-sinoussi-53ce5a && npx jest scripts/bench/__tests__/aggregate-eval.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add scripts/bench/aggregate-eval.ts scripts/bench/__tests__/aggregate-eval.test.ts
git commit -m "feat(bench): pure aggregation for recon scores + plan pass-counts (TDD)"
```

---

## Task 8: Preflight + STOP gate before any paid run

**Files:**

- Create: `scripts/bench/recon-preflight.sh`

- [ ] **Step 1: Write `recon-preflight.sh`**

```bash
#!/usr/bin/env bash
# Read-only preflight for the plan+recon eval. Verifies SHAs, that the bug is present at the
# pre-fix SHA, that briefs do not leak the root, and captures one cheap JSON sample. No paid runs.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
fail=0
check(){ if eval "$2"; then echo "OK   $1"; else echo "FAIL $1"; fail=1; fi; }

check "t976 pre-fix SHA 27b7ef4f exists" "git cat-file -e 27b7ef4f^{commit} 2>/dev/null"
check "t975 pre-fix SHA d7fa1f9a exists" "git cat-file -e d7fa1f9a^{commit} 2>/dev/null"
check "war-risk start SHA e242d259 exists" "git cat-file -e e242d259^{commit} 2>/dev/null"
check "recon-976 brief present" "test -f ${ROOT}/bench/plan-recon/recon-976-brief.md"
check "recon-975 brief present" "test -f ${ROOT}/bench/plan-recon/recon-975-brief.md"
check "plan brief present"      "test -f ${ROOT}/bench/plan-recon/plan-brief.md"
check "gold roots present"      "test -f ${ROOT}/bench/plan-recon/recon-roots.md"

# Leak guard: the mechanism terms must NOT appear in the symptom briefs.
check "recon briefs do not leak root" \
  "! grep -qiE 'cbft|cubic feet|35\.3|gmail-id|session-scoped|rehydrate-guard|getMatchBySlug' ${ROOT}/bench/plan-recon/recon-976-brief.md ${ROOT}/bench/plan-recon/recon-975-brief.md"

# Bug-present sanity: the war-risk hardcoded rate exists at the #957 start SHA (plan task is real).
check "war-risk hardcoded rate present at start SHA" \
  "git show e242d259:lib/economics/war-risk.ts 2>/dev/null | grep -q '0.075'"

echo "-- cheap claude JSON sample --"
claude --print --output-format json --model claude-sonnet-4-6 --effort low --max-budget-usd 0.05 \
  -p 'Reply with exactly: RECON_PREFLIGHT_OK' > "${ROOT}/bench/plan-recon/preflight.sample.json" 2>/dev/null
check "JSON sample has total_cost_usd" "grep -q total_cost_usd ${ROOT}/bench/plan-recon/preflight.sample.json"

if [ "$fail" -ne 0 ]; then echo 'RECON-PREFLIGHT FAILED'; exit 1; fi
echo 'RECON-PREFLIGHT PASSED'
```

- [ ] **Step 2: Run preflight (read-only; ~$0.01)**

Run: `cd /Users/jarvis/work/quantika-demo/.claude/worktrees/sharp-sinoussi-53ce5a && bash scripts/bench/recon-preflight.sh`
Expected: all `OK`, final `RECON-PREFLIGHT PASSED`. (If the cheap sample step is blocked by a
`claude`-substring guard in the running session, run preflight on the dev-VPS instead — see Task 9.)

- [ ] **Step 3: Add `.gitignore` for run artifacts + commit the preflight**

`bench/plan-recon/.gitignore`:

```
results/
grades/
worktrees/
*.sample.json
**/.cfg/
```

```bash
git add scripts/bench/recon-preflight.sh bench/plan-recon/.gitignore
git commit -m "feat(bench): plan+recon preflight + run-artifact gitignore"
```

- [ ] **Step 4: STOP — get founder go before any paid run**

Do NOT launch `run-recon-matrix.sh` or `run-plan-matrix.sh` here. Report to the founder: rig built,
preflight green, estimated spend **~$140–165** (recon ~$50–65 + plan ~$90–100), trim knobs available
(`REPS=2`, or one recon task). Wait for explicit go. This is the same spend-before-approval discipline
the founder used on the war-risk and hard-bench decisions.

---

## Task 9: Paid execution (ONLY after founder go) — dev-VPS, then results

**Files:** none (run + report). Create at the end: `bench/plan-recon/RESULTS.md`.

- [ ] **Step 1: Sync branch to dev-VPS and run there (unguarded plain-tmux)**

The matrices spawn raw `claude --print` subprocesses; run them on the dev-VPS (`ssh dev-vps`,
`/root/work/quantika-demo`) in tmux, exactly as the war-risk bench ran — the orchestrator
`dispatch-guard` does not intercept subprocess launches from a plain shell, so no carve-out is
needed. Push this branch, pull on the VPS, `git checkout` the branch, then in a tmux window:

```bash
cd ~/work/quantika-demo
bash scripts/bench/recon-preflight.sh            # confirm green on the VPS too
REPS=3 bash scripts/bench/run-recon-matrix.sh    # 24 read-only runs
REPS=3 bash scripts/bench/run-plan-matrix.sh     # 9 plan + 9 executor runs
```

- [ ] **Step 2: Grade**

```bash
bash scripts/bench/judge-root-matrix.sh          # recon root-match (#957 oracle already ran inside plan matrix)
npx tsx scripts/bench/aggregate-eval.ts          # print per-config recon means + plan pass-counts
```

- [ ] **Step 3: Validity sweep before trusting numbers**

Confirm, per the spec's validity guards:

- Every recon `recon.txt` is non-empty (no `EMPTY` captures). Re-run any empty arm.
- Every plan run produced a non-empty Stage-2 `solution.diff` (no empty-diff void).
- Plan Stage-2 executor was Opus:high for ALL arms (grep the run-arm invocations / `run.json` model).
- Spot-check 2–3 recon verdicts by hand against `recon-roots.md` to confirm the judge is calibrated.

- [ ] **Step 4: Write `RESULTS.md` + decide row moves**

Summarize per-config: recon mean root-score (per task + combined), plan mean #957 pass-count, cost,
duration. State the verdict for each role: does `Sonnet:high` recon lag Opus (and does `Opus:low`
already match higher efforts)? Does `Opus:medium` plan trail `high`/`max`? Note residual judge
subjectivity; do not crown a winner inside executor-variance.

- [ ] **Step 5: Apply the decision to the skill + memory**

If a row moves: edit `~/.claude/skills/orchestrator-day/SKILL.md` matrix (Разведка / План rows),
`references/dispatch-protocol.md`, and update memory
`feedback_dispatch_effort_max_default_v3_17_0` + add `project_quantika_*_2026_06_13` pointer. If no
row moves, record "measured, no change" with the numbers. Commit `RESULTS.md` to quantika-demo.

```bash
git add bench/plan-recon/RESULTS.md
git commit -m "docs(bench): plan+recon eval results + role-matrix decision"
```
