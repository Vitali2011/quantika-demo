# Parse-Cargo Phase 3a Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand the parse-cargo eval scorer beyond ports (add weight_mt, cargo_description, laycan, commission_percent), then run a controlled 4-config × 3-run bakeoff of Gemini 2.5 Pro settings (baseline / +thinking / +responseSchema / +both) to find whether untouched model-config levers improve extraction.

**Architecture:** Keep the existing two-phase eval pattern — `run-parse-cargo.ts` calls the model and records raw ref/model field pairs; `judge-parse-cargo.ts` is a separate re-runnable pass that scores. Foundation: numeric fields scored deterministically (new tested module), text fields scored by extending the LLM judge with field-specific rubrics; aggregation becomes per-field. Stage 1: add `thinkingBudget` / `responseSchema` env knobs to the runner, run the 4-config matrix.

**Tech Stack:** TypeScript, jest (`ts-jest`), `npx tsx` eval runner, Vertex AI Gemini 2.5 Pro, Bedrock judge (`claude-sonnet-4-6`), VPS (`ssh outreach-vps`) for runs.

**Source design:** `docs/plans/2026-05-14-parse-cargo-phase3a-config-bakeoff-design.md`

---

## Environment

ALL work is on the VPS: `ssh outreach-vps "cd /root/quantika-demo && <cmd>"`. Do NOT use local Edit/Write tools — edit remote files via ssh (read with `cat`, write back via heredoc or `python3`).

- Branch `feat/parse-cargo-phase3a-config-bakeoff` already exists on the VPS with the design doc committed. First action: `ssh outreach-vps "cd /root/quantika-demo && git checkout feat/parse-cargo-phase3a-config-bakeoff && git log --oneline -2"` — confirm you're on it.
- Type-check: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit -p tsconfig.json`. A pre-commit hook also runs eslint+tsc.
- Jest single file: `npx jest scripts/progonq/__tests__/<file>.test.ts`.
- Eval runs hit real Vertex AI / Bedrock — they need `--env-file=.env.local` and take 20-30 min each; run them in `tmux`.
- Frozen env (do NOT change): model `gemini-2.5-pro`, region `us-central1`, `temperature 0`, `seed 42`, `maxTokens 16000`, judge `claude-sonnet-4-6`. Stage 1 varies ONLY `thinkingBudget` and `responseSchema` via env vars.
- Do NOT push or merge — the controller/user handles that. Commit locally on the VPS branch.

---

## FOUNDATION — expand the scorer

### Task 1: Numeric field comparator module

**Files:**

- Create: `scripts/progonq/score-fields.ts`
- Create: `scripts/progonq/__tests__/score-fields.test.ts`

**Context:** `weight_mt` and `commission_percent` are numbers transcribed verbatim from the email (not computed) — so exact match, no tolerance. The runner currently does `weight_match = refWeight === modelWeight` inline; we extract a tested helper used for both weight and commission.

**Step 1: Write the failing test** — `scripts/progonq/__tests__/score-fields.test.ts`:

```ts
import { compareNumericField } from "../score-fields";

describe("compareNumericField", () => {
  it("both null = match", () => expect(compareNumericField(null, null)).toBe(true));
  it("null vs number = mismatch", () => {
    expect(compareNumericField(null, 5)).toBe(false);
    expect(compareNumericField(5, null)).toBe(false);
  });
  it("equal numbers = match", () => expect(compareNumericField(5293, 5293)).toBe(true));
  it("unequal numbers = mismatch", () => expect(compareNumericField(5293, 5300)).toBe(false));
  it("1.25 vs 1.25 = match", () => expect(compareNumericField(1.25, 1.25)).toBe(true));
});
```

**Step 2: Run, verify it fails** — `npx jest scripts/progonq/__tests__/score-fields.test.ts` → FAIL (module not found).

**Step 3: Implement** — `scripts/progonq/score-fields.ts`:

```ts
/**
 * Numeric field comparators for parse-cargo eval scoring.
 * weight_mt / commission_percent are transcribed (not computed) → exact match, no tolerance.
 */
export function compareNumericField(ref: number | null, model: number | null): boolean {
  if (ref === null && model === null) return true;
  if (ref === null || model === null) return false;
  return ref === model;
}
```

**Step 4: Run, verify pass** — `npx jest scripts/progonq/__tests__/score-fields.test.ts` → PASS (5/5).

**Step 5: Commit** — `git add scripts/progonq/score-fields.ts scripts/progonq/__tests__/score-fields.test.ts && git commit -m "feat(progonq): score-fields numeric comparator module"`

---

### Task 2: Runner records + scores weight & commission, records cargo_description & laycan raw

**Files:**

- Modify: `scripts/progonq/run-parse-cargo.ts` — `ItemMatchResult` interface (~line 60), `scoreItems` (~line 204-303)

**Context:** `ItemMatchResult` already has `ref_weight`/`model_weight`/`weight_match` and `ref_commodity`/`model_commodity` (cargo_description value). Missing: commission and laycan. The corpus item shape: `commission_percent: {value: <number>}`, `laycan: {value: "<string>"}` — both ConfidenceFields, read via the existing `getFieldValue()` helper.

**Step 1: Extend `ItemMatchResult`** — add these fields to the interface (after `weight_match`):

```ts
commission_match: boolean;
ref_commission: number | null;
model_commission: number | null;
ref_laycan: string | null;
model_laycan: string | null;
```

**Step 2: Add the import** at the top of `run-parse-cargo.ts` (near the other imports):

```ts
import { compareNumericField } from "./score-fields";
```

**Step 3: Extract the new fields in `scoreItems`** — inside the `for` loop, near where `refWeight`/`refCommodity` are extracted, add:

```ts
const refCommission = getFieldValue(ref?.commission_percent as ConfidenceField | null) as
  | number
  | null;
const modelCommission = getFieldValue(model?.commission_percent as ConfidenceField | null) as
  | number
  | null;
const refLaycan = getFieldValue(ref?.laycan as ConfidenceField | null) as string | null;
const modelLaycan = getFieldValue(model?.laycan as ConfidenceField | null) as string | null;
```

**Step 4: Compute matches** — replace the existing `const weightMatch = refWeight === modelWeight;` line with:

```ts
const weightMatch = compareNumericField(refWeight, modelWeight);
const commissionMatch = compareNumericField(refCommission, modelCommission);
```

**Step 5: Push the new fields** — in the `results.push({ ... })` object, add:

```ts
      commission_match: commissionMatch,
      ref_commission: refCommission,
      model_commission: modelCommission,
      ref_laycan: refLaycan,
      model_laycan: modelLaycan,
```

**Step 6: Type-check** — `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit -p tsconfig.json` → no new errors. Also run `npx jest scripts/progonq/__tests__/score-items.test.ts` → still green (the makeItem helper there won't set commission/laycan, so they'll be null — that's fine).

**Step 7: Commit** — `git add scripts/progonq/run-parse-cargo.ts && git commit -m "feat(progonq): runner records + scores commission, records laycan raw"`

---

### Task 3: Judge — field-specific rubrics + per-field aggregation

**Files:**

- Modify: `scripts/progonq/judge-parse-cargo.ts`

**Context:** The judge currently only judges ports (`JUDGE_SYSTEM` rubric, `judgePair(ref, model)`), and aggregates a single `semantic_match_rate`. We add cargo_description + laycan rubrics, generalize `judgePair` to take a rubric, and produce a per-field breakdown. weight & commission are already deterministically scored by the runner — the judge just reads those booleans.

**Step 1: Sync the judge's `ItemMatchResult` interface** — add the fields the runner now writes (so TypeScript sees them):

```ts
  weight_match?: boolean;
  commission_match?: boolean;
  ref_commodity?: string | null;
  model_commodity?: string | null;
  ref_laycan?: string | null;
  model_laycan?: string | null;
  semantic_field_match?: { ports: boolean; weight: boolean; cargo_description: boolean; laycan: boolean; commission: boolean };
```

**Step 2: Add two rubric constants** near `JUDGE_SYSTEM`:

```ts
const CARGO_DESC_JUDGE_SYSTEM = `You are scoring whether two cargo descriptions from a shipping broker email describe THE SAME cargo.
Focus on: commodity type, packaging, and material attributes (stowage factor, dimensions, vessel/hold requirements).
IGNORE: wording, word order, prepositions, punctuation, sentence vs noun-phrase form.
Examples of EQUIVALENT: "Bagged rice, 50 kg bags" / "Bagged rice in 50 kg polypropylene bags"; "Steel, stowage equals deadweight" / "Steel products, stw dwt".
Examples of NOT equivalent: different commodity; a materially different stowage factor; one side omits a stated vessel/hold requirement the other includes.
Null on both sides = equivalent. Null on one side, described cargo on the other = NOT equivalent.
Reply ONLY with JSON: {"equiv": true | false, "reason": "one short sentence"}`;

const LAYCAN_JUDGE_SYSTEM = `You are scoring whether two laycan (date-range) values from a shipping broker email describe THE SAME laycan.
Treat as EQUIVALENT any format differences for the same date range: "09/13 February 2026" = "9-13 Feb 2026" = "Feb 9-13, 2026".
Treat vague/relative forms as equivalent only when they clearly mean the same window: "first half of May 2026" = "1-15 May 2026"; "spot prompt" = "spot / prompt".
NOT equivalent: different date ranges; one side specific, the other a different vague window.
Null on both sides = equivalent. Null on one side, a date on the other = NOT equivalent.
Reply ONLY with JSON: {"equiv": true | false, "reason": "one short sentence"}`;
```

**Step 3: Generalize `judgePair`** — change its signature to take the rubric:

```ts
async function judgePair(ref: string | null, model: string | null, system: string): Promise<JudgeVerdict> {
  if (ref === model) return { equiv: true, reason: 'identical strings' };
  const userMsg = `REF:   ${JSON.stringify(ref)}\nMODEL: ${JSON.stringify(model)}`;
  // ... existing body, but pass `system` instead of the hardcoded JUDGE_SYSTEM ...
```

Update the existing `callAiText('PARSE_CARGO_JUDGE', JUDGE_SYSTEM, userMsg, ...)` call inside it to use the `system` parameter.

**Step 4: Update the port judge calls** — in `main()`, the two existing `judgePair(refOriginJ, modelOriginJ)` / `judgePair(refDestJ, modelDestJ)` calls now pass `JUDGE_SYSTEM` as the 3rd arg.

**Step 5: Add per-field judging in the main loop** — for EACH item `m` in `r.item_matches` (not only when route fails), compute the 5-field result. Ports: `m.route_match || (judged origin equiv && judged dest equiv)`. weight: `m.weight_match`. commission: `m.commission_match`. cargo_description: judge `m.ref_commodity` vs `m.model_commodity` with `CARGO_DESC_JUDGE_SYSTEM` (cache it like port pairs). laycan: judge `m.ref_laycan` vs `m.model_laycan` with `LAYCAN_JUDGE_SYSTEM` (cache it). Store on `m.semantic_field_match = { ports, weight, cargo_description, laycan, commission }`.

- Reuse the existing cache + `pairKey` + 800ms-delay pattern. To keep cache keys distinct per field type, prefix the pair key input with the field name, e.g. `pairKey('cargodesc:' + ref, model)` — adjust `pairKey` to accept a prefix, or hash `{field, ref, model}`.

**Step 6: Per-field aggregation + summary** — after the loop, compute aggregate per-field accuracy across all items of all scenarios:

```ts
const FIELDS = ["ports", "weight", "cargo_description", "laycan", "commission"] as const;
const fieldTotals: Record<string, { match: number; total: number }> = {};
for (const f of FIELDS) fieldTotals[f] = { match: 0, total: 0 };
for (const r of results)
  for (const m of r.item_matches) {
    const sfm = m.semantic_field_match;
    if (!sfm) continue;
    for (const f of FIELDS) {
      fieldTotals[f].total++;
      if (sfm[f]) fieldTotals[f].match++;
    }
  }
```

Print each field's `match/total (pct%)`. Keep the existing `string_full` / `semantic_full` lines too (backward-compat). Also write `r.semantic_field_match` summaries into the results JSON via the existing `writeFileSync`.

**Step 7: Type-check** — `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit -p tsconfig.json` → clean.

**Step 8: Commit** — `git add scripts/progonq/judge-parse-cargo.ts && git commit -m "feat(progonq): judge field-specific rubrics + per-field aggregation"`

---

### Task 4: Foundation gate — baseline run + sanity check

**Files:** none (verification only)

**Context:** Before the 12-run bakeoff, prove the expanded scorer is trustworthy.

**Step 1: Run config A (baseline) once** —

```
ssh outreach-vps "cd /root/quantika-demo && tmux new-session -d -s f_gate 'cd /root/quantika-demo && npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts --round R21-gate > /tmp/r21-gate.log 2>&1; npx tsx --env-file=.env.local scripts/progonq/judge-parse-cargo.ts --results .progonq/results/etms-parse-cargo-R21-gate.json >> /tmp/r21-gate.log 2>&1; echo DONE >> /tmp/r21-gate.log'"
```

Wait for `DONE` in `/tmp/r21-gate.log` (~25-30 min). Confirm the judge prints the new per-field lines.

**Step 2: Eyeball 3-5 scenarios** — open `.progonq/results/etms-parse-cargo-R21-gate.json`, pick 3-5 scenarios, manually verify: are the per-field `semantic_field_match` results plausible vs the actual email + reference? Spot-check at least one cargo_description judge verdict and one laycan judge verdict — is the judge reasoning sane, not hallucinating?

**Step 3: GATE** — if the per-field numbers look plausible and the judge verdicts are sane → proceed. If the scorer looks wrong (e.g. every laycan scored mismatch, or judge verdicts nonsensical) → STOP, fix Task 3, re-run. Do NOT proceed to the 12-run bakeoff on a broken scorer.

**Step 4: Record** — note config-A baseline per-field numbers in the design doc's results section (append a "Foundation gate" note). Commit: `git add docs/plans/2026-05-14-parse-cargo-phase3a-config-bakeoff-design.md && git commit -m "docs(parse-cargo): Phase 3a foundation gate — baseline per-field numbers"`

---

## STAGE 1 — Gemini config bakeoff

### Task 5: Eval-script config knobs (thinkingBudget + responseSchema)

**Files:**

- Modify: `scripts/progonq/run-parse-cargo.ts` — the `callAiText` call in `runScenario` (~line 320), imports

**Context:** The runner must accept two new env knobs so each bakeoff config is just an env-var set. `PARSE_CARGO_SCHEMA` already exists at `lib/schemas/parse-cargo.ts` (exported via `@/lib/schemas`) — reuse it, do NOT write a new schema. Production already uses `responseSchema: PARSE_CARGO_SCHEMA` — so config C makes the eval match production.

**Step 1: Add the import** near the top of `run-parse-cargo.ts`:

```ts
import { PARSE_CARGO_SCHEMA } from "@/lib/schemas";
```

**Step 2: Add the knobs to the `callAiText` opts** — in `runScenario`, the opts object currently has `maxTokens / timeoutMs / temperature / seed / model`. Add:

```ts
        ...(process.env.PARSE_CARGO_THINKING_BUDGET
          ? { thinkingBudget: Number(process.env.PARSE_CARGO_THINKING_BUDGET) }
          : {}),
        ...(process.env.PARSE_CARGO_USE_SCHEMA === '1'
          ? { responseSchema: PARSE_CARGO_SCHEMA as Record<string, unknown> }
          : {}),
```

**Step 3: Log the active config** — near the existing `[run-parse-cargo] round=...` log line, also log the knobs so each run's log is self-documenting:

```ts
console.error(
  `[run-parse-cargo] thinkingBudget=${process.env.PARSE_CARGO_THINKING_BUDGET ?? "off"} useSchema=${process.env.PARSE_CARGO_USE_SCHEMA === "1"}`
);
```

**Step 4: Type-check** — clean.

**Step 5: Smoke-test config C wiring** — run ONE scenario with the schema knob on:

```
ssh outreach-vps "cd /root/quantika-demo && PARSE_CARGO_USE_SCHEMA=1 npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts --round smoke-schema --scenario etms-parse-cargo-001"
```

Confirm: no error, `item_count_model` > 0, the log shows `useSchema=true`. Then `PARSE_CARGO_THINKING_BUDGET=-1` likewise on one scenario — confirm it runs (it will be slower). Clean up: `rm -f .progonq/results/etms-parse-cargo-smoke-schema.json` and the thinking smoke file.

**Step 6: Commit** — `git add scripts/progonq/run-parse-cargo.ts && git commit -m "feat(progonq): runner accepts thinkingBudget + responseSchema env knobs"`

---

### Task 6: Run the 4-config × 3-run bakeoff

**Files:** none (experiment execution)

**Context:** 4 configs, 3 runs each = 12 runs. Each ~25-30 min (config B/D with thinking will be slower). Run sequentially in tmux to avoid Vertex/Bedrock rate-limit contention. The judge cache is shared across runs (content-hashed) so most judge pairs after the first run are cache hits.

Config → env-var mapping:

- **A baseline:** (no extra env)
- **B +thinking:** `PARSE_CARGO_THINKING_BUDGET=-1`
- **C +schema:** `PARSE_CARGO_USE_SCHEMA=1`
- **D +both:** `PARSE_CARGO_THINKING_BUDGET=-1 PARSE_CARGO_USE_SCHEMA=1`

**Step 1: Run config A ×3** — for `i` in 1,2,3, in tmux sequentially:

```
npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts --round R21-A-<i>
npx tsx --env-file=.env.local scripts/progonq/judge-parse-cargo.ts --results .progonq/results/etms-parse-cargo-R21-A-<i>.json
```

(One tmux session that does all 3 sequentially + judge after each, then `echo DONE`.)

**Step 2: Run config B ×3** — same, prefix the run command with `PARSE_CARGO_THINKING_BUDGET=-1`, round tags `R21-B-1/2/3`.

**Step 3: Run config C ×3** — prefix with `PARSE_CARGO_USE_SCHEMA=1`, round tags `R21-C-1/2/3`.

**Step 4: Run config D ×3** — prefix with `PARSE_CARGO_THINKING_BUDGET=-1 PARSE_CARGO_USE_SCHEMA=1`, round tags `R21-D-1/2/3`.

**Step 5: Collect per-field numbers** — for each of the 12 result files, capture the judge's per-field summary line. Build a table: rows = config, columns = the 5 fields, cells = median of the 3 runs (also note min/max as the variance band).

**Step 6: Commit the raw result references** — `.progonq/results/` is gitignored, so DON'T git-add the JSONs. Instead write the 12-run per-field table into the design doc (Step in Task 7).

---

### Task 7: Analysis, decision tree, docs, memory

**Files:**

- Modify: `docs/plans/2026-05-14-parse-cargo-phase3a-config-bakeoff-design.md`
- Modify: `/Users/jarvis/.claude/projects/-Users-jarvis-claude/memory/project_parse_cargo_phase1_5.md` (LOCAL file — but this plan runs on the VPS; if the executor cannot reach local memory, leave a clear note in the design doc and report it to the controller instead)

**Step 1: Per-field regression check** — for each config B/C/D vs config A baseline: did any field regress? (Like Phase 1.6's RULE 10 — helped some, hurt others.) A config that lifts one field and drops another is not a clean win.

**Step 2: Write the results section** — append to the design doc: the 4×5 per-field median table, the variance bands, the regression-check findings.

**Step 3: Apply the decision tree** —

- A Gemini config gives a clear cross-field gain with no regressions → recommend shipping that config (note: enabling thinking in production is a ~2-3× cost decision — flag it, don't decide it).
- Configs give marginal gains → record the config ceiling; Stage 2 (Sonnet / architecture) is the next phase, to be designed with this knowledge.
- Configs don't help / only regress → config levers exhausted; Stage 2 mandatory.
  Write the verdict into the design doc.

**Step 4: Update memory** — add a "Phase 3a — COMPLETE" section to `project_parse_cargo_phase1_5.md`: what the expanded scorer added, the 4-config per-field results, the verdict, and whether Stage 2 is triggered. Update the `MEMORY.md` index line. (If the VPS executor cannot edit local memory files, instead write a clearly-marked "MEMORY UPDATE NEEDED" block in the design doc with the exact content, and report it.)

**Step 5: Commit** — `git add docs/plans/2026-05-14-parse-cargo-phase3a-config-bakeoff-design.md && git commit -m "docs(parse-cargo): Phase 3a results — config bakeoff per-field table + verdict"`

**Step 6: Report to the controller** — summarize: per-field table, verdict, whether Stage 2 is triggered, and the production-config recommendation (with the cost caveat).

---

## Notes for the executing engineer

- **DRY/YAGNI:** `compareNumericField` is deliberately tiny — don't add tolerance/rounding logic; these fields are transcribed, not computed.
- **The Foundation gate (Task 4) is a hard stop.** A broken scorer makes all 12 runs worthless. Eyeball the judge verdicts before committing 5-6 hours of runs.
- **Frozen env:** never change model/region/temp/seed/maxTokens. Stage 1 varies ONLY the two new env knobs. Mixing other changes makes configs incomparable.
- **Judge cache:** shared and content-hashed — this is why 12 runs are affordable. If you change a judge rubric mid-bakeoff, the old cached verdicts become stale — don't touch rubrics after Task 4's gate passes.
- **This is a measurement experiment.** Do NOT merge to main or deploy. The output is the per-field table + verdict; the user decides production changes (especially the thinking cost trade-off) separately.
