# L2 Approximate Laden-Draft Check + Honest Wording — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the false draft-row claim (`"Loaded ship sits within the port's draft limit."`) with honest, computed wording, and add an **approximate laden-draft estimate from cargo weight** so the draft hard-gate and the fit scorer reflect the loaded vessel — not the empty vessel. Founder decision: implement **L2** (research verdict = IMPORTANT). Canal checks (L3) are out of scope.

**Research basis:** `/root/orchestrator-state/research-draft-h.md` (founder-approved; verdict L2 = IMPORTANT) and `/root/orchestrator-state/recon-fb-draft.md` (gap list with file:line).

**Architecture:** Five stages across **two PRs**.
- **PR-1 (Stage S1, ships first):** honest-wording string fix only — disjoint one-string diff in `fit-breakdown.ts`, no behaviour change. Independent of L2.
- **PR-2 (Stages M2→M3→M4→A5):** the L2 estimator + gate wiring + scorer/UI + impact assessment. This **changes which matches pass the draft gate** — value-bearing semantics, gated behind the impact assessment + VALUE_CHECK.

**Key existing surface (verified, no new plumbing needed):**
- `runHardFilters(input)` (`lib/sailing/match-filters.ts:498`) already receives `weightMt` (cargo) and `dwtSummer` (vessel DWT) — the inputs L2 needs are already in scope.
- `classifyVesselByDwt(dwt)` (`lib/sailing/readiness-gap.ts:88`) and `VESSEL_CLASS` (`lib/constants.ts:132`) already exist — reuse for class-based TPC; do **not** write a new classifier.
- `checkDraft(port, vesselDraftM)` (`match-filters.ts:34`) wraps `portCanHandleDraft(port, vesselDraftM)` (`port-master.ts:89`) — the static comparison we keep as fallback.

**Tech Stack:** TypeScript, Jest (`--maxWorkers=1` on VPS). Pure `lib/` logic — no React, no DB migration, no route changes.

---

## Environment / conventions (read once before any stage)

- Worktree: `/root/work/quantika-demo/.worktrees/plan-draft-l2`. Run all commands from the worktree root with **no absolute path in the command string** (dispatch-guard blocks `.worktrees/` literals).
- Jest on VPS: always `npx jest <target> --maxWorkers=1 --ci --forceExit --no-coverage`. Never run >2 parallel jest waves (OOM, 12 GB RAM).
- Pre-commit hook breaks in fresh worktrees (undeclared eslint plugin). After a clean manual `npx tsc --noEmit` + targeted jest, commit with `--no-verify`.
- Commit atomically (`edit && git add && git commit` in one shell); verify with `git show HEAD:<file>` (worktree commit race).
- `tests/regression/**` is **excluded from CI** (`npm test` ignores it). Mirror any CI-critical adversarial draft test into a canonical `lib/sailing/__tests__/` file.

## Out of scope

- **No canal draft checks (L3).** Suez/Panama physical-draft constraints stay unimplemented — research rates them nice-to-have. Canal modules remain financial-only.
- **No DB migration, no new parsed field.** TPC is **not** read from email in this plan; `parse-vessel.ts` is untouched. The optional `tpc?` parameter exists in the signature for a future caller but is always passed `undefined` by the current wiring.
- **No FWA / tidal / seasonal modelling.** Port limits stay the single static "salt water summer" number (`port-master.ts:37`). L2 is a screening estimate, not a voyage-estimation engine.
- **No change to `port-master.json` data** (the ~300 unknown-port graceful-pass behaviour from recon Gap 4 is unchanged: unknown port or unknown weight → fall back to static check / pass).

---

## Concurrency note (Stage S1 ordering)

`lib/sailing/fit-breakdown.ts` is concurrently modified by **Task I (discharge cranes)** and **Task G (brackets)** of `docs/superpowers/plans/2026-06-10-partner-feedback-pack.md`. Stage S1 touches **only the single rationale string inside `scoreDraft`** (`fit-breakdown.ts:411`), which neither Task I nor Task G edits, so the diff is disjoint. **Preferred:** order S1's merge after Task I and Task G land. **Acceptable:** merge S1 earlier as long as `git diff` shows the change is confined to the one string literal — rebase if either task has touched `scoreDraft` in the interim.

---

# TASK S1 (S) — Honest wording for the draft row (ships first, own PR)

**Branch:** `plan-draft-l2-S1-honest-wording`
**Size:** S (single string literal; one file)

**Why:** `scoreDraft` (`fit-breakdown.ts:411`) currently returns `"Loaded ship sits within the port's draft limit."` on pass. No laden calc exists — the check only compares the vessel's **stated max draft** against the port limit (recon Gap 1, "Display lie"). The partner-broker flagged it. This is an L1 honesty fix that must not wait on the L2 estimator.

**Files:**
- Modify: `lib/sailing/fit-breakdown.ts` (the `scoreDraft` pass-branch rationale string, ~line 411)
- Modify/add test: `lib/sailing/__tests__/fit-breakdown.test.ts` (assert the new rationale; remove any assertion on the old string)

- [ ] **Step 1 (TDD, RED): pre-removal grep, then write the failing assertion**

The pass-branch rationale is a literal string. Before changing it, grep for every place that asserts on it (Pre-removal grep is discovery, not a PI3 violation):
```
grep -rn "Loaded ship sits within" __tests__/ tests/ lib/__tests__/ lib/sailing/__tests__/
grep -rn "Loaded ship sits within" app/ lib/ components/
```
Expected: source hit only in `lib/sailing/fit-breakdown.ts`; test hits only in `fit-breakdown.test.ts` (and possibly a CI-excluded `tests/regression/**`). **If a hit appears in `app/` or `components/` (UI snapshot, copy test), it is in scope — update it in this same commit. If hits exceed 5 files or touch modules outside `lib/sailing`, STOP → BLOCKED with the list.**

Add a test asserting the pass-branch rationale matches the new honest text (per research §7), e.g.:
```ts
expect(scoreDraft({ draft: { pass: true } }).rationale)
  .toBe("Vessel's stated max draft is within the port's limit. Laden draft from cargo weight not yet computed.");
```
Run it — it must FAIL (RED).

- [ ] **Step 2 (GREEN): change the string**

In `scoreDraft`, pass-branch, replace:
```ts
rationale: "Loaded ship sits within the port's draft limit."
```
with the honest wording (research §7 recommends *"Vessel's maximum stated draft is within the port's limit. Actual laden draft not computed."* — adopt that phrasing, lightly adjusted for the codebase's voice). Use the exact same string the test asserts. Update any other asserting test found in Step 1 to the new string in this same commit.

- [ ] **Step 3 (verify):** `npx tsc --noEmit` clean; `npx jest --findRelatedTests lib/sailing/fit-breakdown.ts --maxWorkers=1 --ci --forceExit --no-coverage` green.

- [ ] **Step 4 (commit):** atomic `edit && git add && git commit --no-verify` on branch `plan-draft-l2-S1-honest-wording`; verify with `git show HEAD:lib/sailing/fit-breakdown.ts | grep "stated max draft"`.

**Rollback:** revert the one string. No data, no gate impact — pure copy.

**Verification (S1 done):** tsc clean + fit-breakdown test green + grep shows zero remaining `"Loaded ship sits within"` references.

---

# TASK M2 (M) — `estimateLadenDraft()` estimator module (TDD, no wiring)

**Branch:** `plan-draft-l2-L2-laden-draft` (PR-2; M2/M3/M4/A5 share this branch)
**Size:** M (one new pure module + its test; no caller yet)

**Why:** Provide the approximate laden-draft figure L2 needs, with a documented conservative bias, before touching any gate.

**Files:**
- Create: `lib/sailing/laden-draft.ts`
- Create: `lib/sailing/__tests__/laden-draft.test.ts`

**Design — `estimateLadenDraft(dwtTons, cargoTons, tpc?)`:**

```ts
export interface LadenDraftEstimate {
  ladenDraftM: number;        // estimated laden draft, metres, salt water
  method: 'tpc' | 'class-tpc' | 'empirical' | 'unknown';
  approximate: true;          // ALWAYS approximate — never present as exact
  vesselClass: VesselClassName | null;
}
export function estimateLadenDraft(
  dwtTons: number | null | undefined,
  cargoTons: number | null | undefined,
  tpc?: number | null,
): LadenDraftEstimate | null;
```

Computation order (first applicable wins):
1. **Guard:** if `dwtTons`/`cargoTons` null, non-finite, or `<= 0` → return `null` (`method:'unknown'` is not emitted; null signals "cannot estimate → caller falls back to static check"). Mirrors the retriever empty-query / null-guard convention — no estimate on garbage input.
2. **Full-load reference draft** from the empirical regression (research §2):
   `fullLoadDraftM = 0.4991 * dwtTons ** 0.2991`
3. **Partial-load scaling** when cargo < DWT (research §2):
   `ladenDraftM = fullLoadDraftM * (cargoTons / dwtTons) ** 0.3` → `method:'empirical'`.
   (When `cargoTons >= dwtTons`, clamp the ratio to 1 → full-load draft; over-DWT cargo is already caught by the separate `checkCargoWeight` gate.)
4. **If `tpc` supplied** (future-proofing; current wiring passes `undefined`): use the TPC immersion form from a class light-draft baseline instead — `method:'tpc'`. Document that this branch is presently unexercised by production callers but unit-tested.
5. **Class-based TPC table** (`method:'class-tpc'`) is available as an alternative estimate keyed on `classifyVesselByDwt(dwtTons)` with research §2 values **Handy≈45, Supra≈52, Panamax≈60, Cape≈80 t/cm**. Decide in M2 whether the empirical (step 2–3) or class-TPC path is primary; **default to empirical as primary** (continuous in DWT, no light-draft assumption) and expose class-TPC as a cross-check used only in tests. Record the choice in a module-top comment.

**Conservative bias (must be documented in-code and tested):** round the returned `ladenDraftM` **up** to the nearest 0.1 m (`Math.ceil(x*10)/10`). Rationale: a screening tool should over-state draft so it errs toward flagging a possible overdraft rather than silently passing one (research §1: discharge port is the limiting point; false-OK is the dangerous failure). State this bias in the rationale wording (Stage M4) as "(approximate, conservative)".

- [ ] **Step 1 (TDD, RED):** write `laden-draft.test.ts` with anchored cases derived **by hand** from the formulae (do not back-fill expectations from a run):
  - Handymax 58k DWT, cargo 52k t → expect ~12.6–12.8 m (research §5 worked example: ~12.7 m laden, overdraft vs 12.5 m limit). Assert the estimate is `>= 12.5` so the example correctly trips a 12.5 m port.
  - Panamax 75k DWT full load → expect ~13–14.5 m (research §2 class table).
  - Handysize 30k DWT, light cargo 10k t → partial-load draft well below full load.
  - Null/zero/negative DWT or cargo → `null`.
  - Cargo > DWT → ratio clamps to 1 (full-load draft, not >full).
  - `approximate === true` always.
  Run → RED.

- [ ] **Step 2 (GREEN):** implement `lib/sailing/laden-draft.ts` per design. Reuse `classifyVesselByDwt` from `./readiness-gap` and `VESSEL_CLASS`/`VesselClassName` from `../constants`. No I/O, no DB, pure function.

- [ ] **Step 3 (verify):** `npx tsc --noEmit` clean; `npx jest --findRelatedTests lib/sailing/laden-draft.ts --maxWorkers=1 --ci --forceExit --no-coverage` green.

- [ ] **Step 4 (commit):** atomic, `--no-verify`, on branch `plan-draft-l2-L2-laden-draft`.

**Rollback:** delete the two new files; nothing imports them yet.

---

# TASK M3 (M) — Wire estimated laden draft into the draft hard-gate

**Branch:** `plan-draft-l2-L2-laden-draft`
**Size:** M (gate logic in one file + tests). **VALUE-BEARING: changes which matches pass.**

**Why:** Recon Gap 1 — `checkDraft` compares the static stated draft only. Compare the **estimated laden draft** against the port limit, keep the static check as the fallback when cargo weight (or DWT) is unknown.

**Files:**
- Modify: `lib/sailing/match-filters.ts` (`checkDraft` and its two call sites at lines 499, 511 inside `runHardFilters`; `HardFilterInput` already carries `weightMt` + `dwtSummer` — no new input field)
- Modify/add: `lib/sailing/__tests__/match-filters.test.ts` and/or `run-hard-filters-all-gates.test.ts`

**Design:**
- Add an overload/extension so the gate can use a laden figure. Preferred shape: a new internal helper `checkDraftLaden(port, staticDraftM, estimate)` that:
  - if `estimate` is non-null → compare `estimate.ladenDraftM` vs `portCanHandleDraft(port, estimate.ladenDraftM)`;
  - else → delegate to the existing `checkDraft(port, staticDraftM)` (static fallback unchanged).
- In `runHardFilters`, compute `const laden = estimateLadenDraft(input.dwtSummer, effectiveCargoWeight(input.weightMt));` once and pass it to both the origin and destination draft checks. Derive `effectiveCargoWeight` the same way `checkVolume`/`checkCargoWeight` already do (`isRange ? weightMt.max : weightMt`) — reuse that idiom for consistency; max-of-range is the conservative (heaviest) cargo, consistent with the round-up bias.
- **Fallback invariants (keep):** unknown port → `portCanHandleDraft` already returns `ok:true`; unknown cargo or DWT → `estimateLadenDraft` returns `null` → static `checkDraft` path → existing behaviour. No new graceful-pass holes.
- The `FilterResult.reason` on failure must name the laden basis, e.g. `estimated laden draft 12.7m exceeds port max 12.5m (approximate, from 52000t cargo)`.

- [ ] **Step 1 (TDD, RED):** add gate tests:
  - Vessel static draft 11.0 m (passes static) **but** 58k DWT + 52k t cargo → estimated laden ~12.7 m → port limit 12.5 m → **fail** (the bug case now caught).
  - Same vessel, cargo unknown (`weightMt: null`) → falls back to static 11.0 m → **pass** (fallback intact).
  - Unknown port → pass (graceful, unchanged).
  - Destination-port limit lower than origin → fails on dest leg (both legs use the laden figure).
  Run → RED.
- [ ] **Step 2 (GREEN):** implement; reuse `estimateLadenDraft`. Keep `checkDraft`'s existing signature exported and behaviour intact (other callers/tests depend on it) — add the laden path alongside, do not mutate the static one.
- [ ] **Step 3 (PI3 boundary check):** run the full sailing suite:
  `npx jest lib/sailing/__tests__ --maxWorkers=1 --ci --forceExit --no-coverage`.
  Pinned `match-filters` / `run-hard-filters` / `fit-breakdown` expectations **will shift** because previously-passing fixtures now fail the laden gate. **Re-derive each broken expectation by hand** per Wave-2 conventions (compute the laden estimate for that fixture's DWT+cargo, confirm the new pass/fail is *correct*, then update). **If > 5 distinct test expectations break → STOP, report `PLAN-UPDATE-NEEDED` with the count and list** — do not bulk-rewrite.
- [ ] **Step 4 (commit):** atomic, `--no-verify`.

**Rollback:** the laden path is additive; revert `runHardFilters` to call the static `checkDraft` (one-line per call site) to disable the new gate semantics without removing the estimator.

---

# TASK M4 (M) — Fit-breakdown draft scorer + computed UI wording

**Branch:** `plan-draft-l2-L2-laden-draft`
**Size:** M (scorer rationale + plumbing the laden figure to it)

**Why:** Replace the S1 interim honest wording with the **computed** laden figure so the draft row reads e.g. *"Estimated laden draft ~12.7m (approximate) vs port limit 12.5m."* (research §6 / task spec §4).

**Files:**
- Modify: `lib/sailing/fit-breakdown.ts` (`scoreDraft`)
- Modify: `lib/sailing/match-filters.ts` if the laden figure / port limit must be surfaced on `MatchHardFilters.draft` (likely add optional fields `estimatedLadenDraftM?`, `portLimitM?` to the draft `FilterResult` so the scorer can render numbers without recomputing)
- Modify/add: `lib/sailing/__tests__/fit-breakdown.test.ts`

**Design:**
- Extend the draft `FilterResult` (or a sibling field on `MatchHardFilters`) with optional `estimatedLadenDraftM` and `portLimitM`, populated in M3's gate. `scoreDraft` reads them.
- Pass branch rationale:
  - if laden figure present: `Estimated laden draft ~${X.X}m (approximate) within port limit ${Y.Y}m.`
  - if no laden figure (fallback): keep the S1 honest wording (stated-max, laden not computed).
- Fail branch rationale: mirror M3's reason with the laden basis.
- **Borderline note:** the existing scorer doc-comment mentions a "within 0.5m of port max = marginal" concept — if a marginal band is currently scored, keep that behaviour but base it on the laden figure when available. Do not invent new scoring weights (no economics/score-value change beyond what the corrected gate already implies).

- [ ] **Step 1 (TDD, RED):** assert the three rationale variants (laden-pass with numbers, fallback-pass with S1 wording, fail with laden basis). RED.
- [ ] **Step 2 (GREEN):** implement; thread the optional fields from M3.
- [ ] **Step 3 (PI3):** same boundary discipline as M3 — re-derive any shifted fit-breakdown expectations by hand; >5 broken → STOP `PLAN-UPDATE-NEEDED`.
- [ ] **Step 4 (cross-cutting grep):** the draft rationale string changed again — grep:
  `grep -rn "stated max draft\|laden draft\|Loaded ship sits" __tests__/ app/ lib/ components/` and reconcile every hit.
- [ ] **Step 5 (commit):** atomic, `--no-verify`.

**Rollback:** revert `scoreDraft` to the S1 honest string; optional `FilterResult` fields are backward-compatible (ignored if unread).

---

# TASK A5 (M) — Impact assessment + VALUE_CHECK (gates merge of M3/M4)

**Branch:** `plan-draft-l2-L2-laden-draft`
**Size:** M (analysis + a committed impact report; no production code)

**Why:** M3 changes the draft gate = it changes **which matches pass**. Per task spec §5 this is value-bearing gate semantics: the founder must see the flips before merge. This stage is a **hard gate** on PR-2 — do not request merge until it passes.

**Files:**
- Create: `docs/impact/2026-06-10-laden-draft-flips.md` (committed report)
- Optional: a throwaway script under `scripts/` (delete before final commit, or keep if it follows repo script conventions — confirm with orchestrator; default delete to keep `git status` clean per Rule #15).

- [ ] **Step 1 (before/after on dev seed):** run the matching pipeline against the dev seed (`data/demo-seed.db`) on the **pre-M3 commit** and the **post-M4 commit**. Capture, for every match pair, the draft-gate pass/fail. (Reuse the existing matching entrypoint — `runHardFilters` via `pair-analyzer` / the compute-matches path. Do **not** hit prod data; recon notes match #54335 is prod-only and absent from the seed.)
- [ ] **Step 2 (count + list flips):** produce a table of pairs whose draft gate **flipped** (pass→fail and fail→pass), each with vessel DWT, cargo tons, estimated laden draft, port limit, and the leg that tripped. This is the founder-review artifact.
- [ ] **Step 3 — VALUE_CHECK (concrete oracle, must pass before merge):**
  - **Oracle 1 (correctness of the example):** the research worked example — Handymax 58k DWT, 52k t grain, 12.5 m discharge limit — must appear in the **pass→fail** list (the tool now catches the overdraft it previously missed). If it does not flip, the estimator or wiring is wrong → STOP.
  - **Oracle 2 (no spurious mass-fail):** the **pass→fail** count must be a *minority* of previously-passing draft rows (sanity: research §1 estimates draft is a real constraint in ~30–40% of port/cargo pairs, and most seed pairs are not at-limit). If > ~50% of passing pairs flip to fail, the conservative round-up or formula is mis-scaled → STOP, investigate before merge.
  - **Oracle 3 (fallback preserved):** any pair with unknown cargo weight or unknown DWT must **not** flip (still uses static check). Zero such flips expected.
  - Record all three oracle outcomes in the report with the concrete numbers.
- [ ] **Step 4 (founder handoff):** the committed report + flip list is the orchestrator/founder review artifact. **PR-2 must not be merged until the founder approves the flips.** Note this explicitly in the PR description.
- [ ] **Step 5 (cleanup):** `git status --porcelain` empty (delete any throwaway script; commit the report).

**Rollback:** report-only stage; nothing to roll back. If the VALUE_CHECK fails, roll back M3 (one-line per call site, see M3 rollback) — the estimator (M2) and honest wording (S1) can still ship.

---

## PR plan / merge order

1. **PR-1** = Stage S1 → title `fix(draft): honest wording — stated max draft, laden not computed`. Ships first (after partner-feedback-pack Tasks I & G land, or with a verified-disjoint diff). Low risk, no gate change.
2. **PR-2** = Stages M2+M3+M4+A5 on `plan-draft-l2-L2-laden-draft` → title `feat(draft): L2 approximate laden-draft hard-gate + computed fit wording`. **Blocked on A5 VALUE_CHECK + founder flip-review.** Do NOT merge without founder sign-off on the flip list.

*(This planning document itself is delivered on branch `plan-draft-l2` via the PR titled `docs(plan): L2 approximate laden-draft check + honest wording` — do not merge, do not implement.)*

## PI3 / PI2 reminders for the implementer

- **PI3:** do not rewrite existing test expectations to match your implementation. Re-derive each shifted draft fixture by hand and confirm the new pass/fail is *correct* before updating. >5 broken expectations in any single stage → STOP, `PLAN-UPDATE-NEEDED`.
- **PI2:** at least one behavioural test per stage that calls the real function (`estimateLadenDraft(...)`, `runHardFilters(...)`, `scoreDraft(...)`) — not a string-only assertion. M2/M3/M4 each satisfy this by construction.

## Verification + rollback summary

| Stage | Verify | Rollback |
|---|---|---|
| S1 | tsc + fit-breakdown test + grep zero old string | revert one string |
| M2 | tsc + laden-draft test (hand-derived cases) | delete 2 new files |
| M3 | tsc + full `lib/sailing/__tests__` suite, PI3 ≤5 | revert call sites to static `checkDraft` |
| M4 | tsc + fit-breakdown test + cross-cutting grep | revert `scoreDraft` to S1 string |
| A5 | 3 oracles pass + founder approves flips | report-only; roll back M3 if oracle fails |
