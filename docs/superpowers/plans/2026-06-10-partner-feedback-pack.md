# Partner Feedback Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship five founder-approved partner-feedback changes — an Emails tab, cargo payout-condition extraction, ROI-tile removal, fit-score brackets, and discharge-port crane scoring — as five independently mergeable PRs.

**Architecture:** Each task is a self-contained stage group with its own branch/PR. Five tasks, ordered cheap-wins-first: **F → I → G → A → D**. Task D depends on Task A (it renders inside the Emails tab that A creates); all others are independent. No DB migration is required by any task. No economics number changes anywhere — Task G is a **read-only display** of numbers the scorers already compute.

**Tech Stack:** Next.js (App Router, RSC), TypeScript, React client components, Gemini structured-output parser (`@google/genai`), Jest (`--maxWorkers=1` on VPS).

---

## Environment / conventions (read once before any task)

- Worktree: `/root/work/quantika-demo/.worktrees/plan-fb-pack`. Run all commands from the worktree root with **no absolute path in the command string** (dispatch-guard blocks `.worktrees/` literals).
- Jest on VPS: always `npx jest <target> --maxWorkers=1 --ci --forceExit --no-coverage`. Never run >2 parallel jest waves (OOM).
- Pre-commit hook breaks in fresh worktrees (undeclared eslint plugin). After a clean manual `npx tsc --noEmit` + targeted jest, commit with `--no-verify`.
- Commit atomically (`edit && git add && git commit` in one shell); verify with `git show HEAD:<file>` (worktree commit race).
- `tests/regression/**` is **excluded from CI** (`npm test` ignores it). Treat those files as documentation, not gates — but still update/delete them when you remove the surface they test, for cleanliness.

## Out of scope (all tasks)

- **No DB migrations.** `fit_breakdown` and parsed-cargo are stored as JSON in existing TEXT columns; new optional fields are backward-compatible.
- **No crane-provider data work** (Task I): `PortMaster` has no `craneOperator` field and adding it for 483 ports is explicitly excluded. Task I delivers the *discharge-port boolean check + port-name rationale only*.
- **No ROI data deletion** (Task F): migration 030, the `roi_metrics` table, `lib/analytics/roi-metrics.ts`, the seed script, and `lib/email/templates/roi-report.ts` all stay. Only the partner-facing **UI tile + HTTP API route + both feature flags** are removed.
- **No economics/value changes** (Task G): brackets only *display* existing scorer numbers. No scorer weight, share, or score value changes.

---

# TASK F (S) — Remove the 90-day ROI summary from the partner-facing app

**Branch:** `plan-fb-pack-F-roi-removal`
**Size:** S (surgical removal; many touched files but all are the tile/route and their own tests)

**Why:** Founder decision — partner did not understand the "90-day ROI summary". Remove the confusing UI + API surface; keep all underlying data.

**Files:**
- Delete: `components/dashboard/RoiSummaryTile.tsx`
- Delete: `app/api/analytics/roi/route.ts`
- Modify: `app/dashboard/page.tsx` (remove import line 18; remove render block lines 182–185)
- Modify: `.env.local.example` (remove `NEXT_PUBLIC_ROI_GUARANTEE_ENABLED` and `ROI_GUARANTEE_ENABLED` lines)
- Delete (tests of removed surface): `__tests__/components/roi-summary-tile.test.tsx`, `__tests__/components/roi-tile-numbers.test.tsx`, `__tests__/regression/RC-roi-tile-import.test.tsx`, `__tests__/api/analytics/roi-auth.test.ts`, `__tests__/api/roi.test.ts`, `__tests__/regression/test_roi_auth_regression.test.ts`
- Delete (CI-excluded regression, for cleanliness): `tests/regression/RC4-ui-blind/gamma-18-F05-feature-flag-misalignment.test.ts`, `tests/regression/RC6-security-blacklist/gamma-18-F10-missing-auth-check.test.ts`, `tests/regression/RC3-magnitude/gamma-18-F02-nan-platform-cost.test.ts`, `tests/regression/RC1-fail-open/gamma-18-F03-negative-platform-cost.test.ts`, `tests/regression/RC1-fail-open/gamma-18-F04-nan-days-parameter.test.ts`, `tests/regression/RC1-fail-open/gamma-18-F06-api-endpoint-contract.test.ts`, `tests/regression/RC1-fail-open/gamma-18-F08-cohort-negative-months.test.ts`, `tests/regression/RC1-fail-open/gamma-18-F09-empty-days-param.test.ts`
- **KEEP (do not touch):** `lib/migrations/030-roi-metrics.ts`, `lib/migrations/index.ts`, `scripts/seed-roi-metrics.ts`, `lib/analytics/roi-metrics.ts`, `lib/email/templates/roi-report.ts`, `lib/__tests__/roi-metrics*.test.ts`, `lib/__tests__/roi-report-email.test.ts`, `scripts/data-integrity-check.ts`, `scripts/ops/post-deploy-seed.sh`

- [ ] **Step 1: Pre-removal grep — confirm the consumer set before deleting anything**

Run BOTH (from worktree root):
```
grep -rn "RoiSummaryTile\|ROI_GUARANTEE_ENABLED\|analytics/roi" app/ lib/ components/ design-system/
grep -rn "RoiSummaryTile\|ROI_GUARANTEE_ENABLED\|/api/analytics/roi\|api/roi" __tests__/ tests/
```
Expected: source hits ONLY in `app/dashboard/page.tsx`, `components/dashboard/RoiSummaryTile.tsx`, `app/api/analytics/roi/route.ts`, `.env.local.example`. Test hits ONLY in the files listed for deletion above. **If a hit appears in any file NOT listed here (e.g. a shared layout, nav, or a kept lib file referencing the route), STOP and report BLOCKED** — the scope changed.

- [ ] **Step 2: Verify the kept lib has no dependency on the route**

Run: `grep -rn "analytics/roi\|RoiSummaryTile" lib/analytics/ lib/email/`
Expected: NO hits. `lib/analytics/roi-metrics.ts` exposes `getRoiSummary()` consumed directly by `lib/email/templates/roi-report.ts`; neither imports the HTTP route or the tile. Confirms they survive removal.

- [ ] **Step 3: Remove the dashboard render + import**

In `app/dashboard/page.tsx`, delete the import (line 18):
```ts
import { RoiSummaryTile } from '@/components/dashboard/RoiSummaryTile';
```
and the render block (lines 182–185):
```tsx
        {/* ── ROI Summary (feature flag) ──────────────────────────── */}
        {process.env.NEXT_PUBLIC_ROI_GUARANTEE_ENABLED === 'true' && (
          <RoiSummaryTile />
        )}
```

- [ ] **Step 4: Delete the tile, the route, and their tests**

```bash
git rm components/dashboard/RoiSummaryTile.tsx \
       app/api/analytics/roi/route.ts \
       __tests__/components/roi-summary-tile.test.tsx \
       __tests__/components/roi-tile-numbers.test.tsx \
       __tests__/regression/RC-roi-tile-import.test.tsx \
       __tests__/api/analytics/roi-auth.test.ts \
       __tests__/api/roi.test.ts \
       __tests__/regression/test_roi_auth_regression.test.ts \
       tests/regression/RC4-ui-blind/gamma-18-F05-feature-flag-misalignment.test.ts \
       tests/regression/RC6-security-blacklist/gamma-18-F10-missing-auth-check.test.ts \
       tests/regression/RC3-magnitude/gamma-18-F02-nan-platform-cost.test.ts \
       tests/regression/RC1-fail-open/gamma-18-F03-negative-platform-cost.test.ts \
       tests/regression/RC1-fail-open/gamma-18-F04-nan-days-parameter.test.ts \
       tests/regression/RC1-fail-open/gamma-18-F06-api-endpoint-contract.test.ts \
       tests/regression/RC1-fail-open/gamma-18-F08-cohort-negative-months.test.ts \
       tests/regression/RC1-fail-open/gamma-18-F09-empty-days-param.test.ts
```
Note: `tests/regression/RC3-magnitude/gamma-18-F07-nan-email-summary.test.ts` and `tests/regression/RC1-fail-open/gamma-18-F01-nan-financial-field.test.ts` test the KEPT `roi-metrics.ts` / email summary — **before deleting, grep each**: `grep -n "analytics/roi\|RoiSummaryTile\|getRoiSummary" tests/regression/RC3-magnitude/gamma-18-F07-nan-email-summary.test.ts tests/regression/RC1-fail-open/gamma-18-F01-nan-financial-field.test.ts`. If they import only `roi-metrics.ts`/the email template (kept), **leave them**. If they import the route/tile, delete them too.

- [ ] **Step 5: Remove both flags from `.env.local.example`**

Delete the two lines (match exact key names):
```
NEXT_PUBLIC_ROI_GUARANTEE_ENABLED=
ROI_GUARANTEE_ENABLED=
```

- [ ] **Step 6: Behavioral test (PI2) — dashboard renders without the tile**

Add `__tests__/dashboard/no-roi-tile.test.tsx`:
```tsx
import fs from 'node:fs';
import path from 'node:path';

describe('dashboard: ROI tile fully removed', () => {
  it('dashboard page no longer imports RoiSummaryTile', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'app/dashboard/page.tsx'), 'utf8');
    expect(src).not.toMatch(/RoiSummaryTile/);
    expect(src).not.toMatch(/ROI_GUARANTEE_ENABLED/);
  });
  it('tile component and api route are deleted', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'components/dashboard/RoiSummaryTile.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), 'app/api/analytics/roi/route.ts'))).toBe(false);
  });
  it('underlying data layer survives', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'lib/analytics/roi-metrics.ts'))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), 'lib/migrations/030-roi-metrics.ts'))).toBe(true);
  });
});
```

- [ ] **Step 7: Run tsc + tests, verify they pass**

```
npx tsc --noEmit 2>&1 | head -20
npx jest __tests__/dashboard/no-roi-tile.test.tsx --maxWorkers=1 --ci --forceExit --no-coverage 2>&1 | tail -10
```
Expected: tsc clean (no dangling references to the deleted route/tile); `Tests: 3 passed`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit --no-verify -m "chore(F): remove 90-day ROI summary tile + API from partner app (keep data layer)

Founder decision: partner did not understand the ROI summary. Removes the
dashboard tile, /api/analytics/roi route, and both feature flags. Keeps
migration 030, roi_metrics table, seed, roi-metrics.ts, and the email
report template untouched.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Verification:** `git status --porcelain` empty; `npx tsc --noEmit` clean; new behavioral test green.
**Rollback:** `git revert <commit>` restores tile + route + flags + tests; data layer was never touched so no data risk.

---

# TASK I-MIN (S) — Cranes: score the discharge port too

**Branch:** `plan-fb-pack-I-discharge-cranes`
**Size:** S (one source file + tests)

**Why:** Partner case — a gearless vessel scoring 85% on cranes when the **discharge** port has workable cranes. Today `scoreCranes` only checks the **load** port (`cargo.originPort`), so a gearless vessel with cranes only at discharge scores 0. Fix: check both, name which port has cranes in the rationale.

**Files:**
- Modify: `lib/sailing/fit-breakdown.ts` (`scoreCranes` signature + body, lines 337–357; call site line 574)
- Modify (if trivial): `lib/matching/reason-enricher.ts` (gearless enrich case, lines 20–30) — else note as follow-up
- Test: `lib/sailing/__tests__/score-cranes-discharge.test.ts` (new)

**Scoring rule (planner-defined, honest):** Cranes are needed wherever cargo is handled — at **load** AND **discharge**. A gearless vessel is workable if **either** port has shore cranes (one geared end covers that end; the other end being craneless is a real but partial risk). So:
- geared vessel → 100% (unchanged).
- gearless + **both** ports have cranes → 85% (workable, unchanged ceiling), rationale names both.
- gearless + **exactly one** port has cranes → 85% but rationale names *which* port and flags the other as the gap (this is the partner case — discharge-only cranes now score 85% instead of 0).
- gearless + **neither** port has cranes → 0% (not workable).
- gearless + crane status unknown at both → 55% (unchanged conservative).

- [ ] **Step 1: Write the failing test**

`lib/sailing/__tests__/score-cranes-discharge.test.ts`:
```ts
import { scoreCranes } from '@/lib/sailing/fit-breakdown';

// Real port names from data/ports/port-master.json:
//   Constanta (RO) → hasShoreCranes: true ; a craneless port → use a known false one.
// Pick names that resolve in portHasShoreCranes(); adjust if a name returns null.
describe('scoreCranes — discharge port participates', () => {
  it('geared vessel ignores both ports → full points', () => {
    const c = scoreCranes(true, 'Constanta', 'Novorossiysk');
    expect(c.score).toBe(6);
  });

  it('gearless, cranes only at discharge → 85% and rationale names discharge port', () => {
    // load port craneless, discharge port has cranes
    const c = scoreCranes(false, 'Karasu', 'Constanta'); // adjust load to a craneless port if Karasu has cranes
    expect(Math.round((c.score / c.weight) * 100)).toBe(85);
    expect(c.rationale.toLowerCase()).toContain('discharge');
    expect(c.rationale).toContain('Constanta');
  });

  it('gearless, neither port has cranes → 0', () => {
    const c = scoreCranes(false, '<craneless-load>', '<craneless-discharge>');
    expect(c.score).toBe(0);
  });

  it('gearless, both unknown → conservative 55%', () => {
    const c = scoreCranes(false, null, null);
    expect(Math.round((c.score / c.weight) * 100)).toBe(55);
  });
});
```
**Before running:** open `data/ports/port-master.json` and pick two real names whose `hasShoreCranes` is `true` and two whose value is `false`; substitute the `<craneless-…>` placeholders so the test asserts on real data (415 true / 68 false ports exist). Verify with `portHasShoreCranes(name)` returning non-null.

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest score-cranes-discharge --maxWorkers=1 --ci --forceExit --no-coverage`
Expected: FAIL — `scoreCranes` currently takes 2 args; passing a 3rd is ignored and the discharge-only case returns 0, not 85%.

- [ ] **Step 3: Update `scoreCranes` signature + body**

Replace `lib/sailing/fit-breakdown.ts:337–357` with:
```ts
/** Cranes — geared vessel is always 100%; gearless depends on shore cranes at
 *  EITHER cargo-handling end (load and/or discharge). Names which end has them. */
export function scoreCranes(
  geared: boolean | null | undefined,
  loadPort: string | null,
  dischargePort: string | null,
): FitBreakdownComponent {
  const w = FIT_WEIGHTS.cranes;
  if (geared === true) {
    return { factor: 'cranes', label: 'Cranes', weight: w, score: w, rationale: 'Ship is geared — no dependence on shore cranes.' };
  }
  if (geared === false) {
    const loadCranes = portHasShoreCranes(loadPort);
    const dischCranes = portHasShoreCranes(dischargePort);
    const loadName = loadPort ?? 'load port';
    const dischName = dischargePort ?? 'discharge port';
    // Both confirmed craneless → not workable.
    if (loadCranes === false && dischCranes === false) {
      return { factor: 'cranes', label: 'Cranes', weight: w, score: 0, rationale: 'Ship is gearless and neither load nor discharge port has cranes — not workable.' };
    }
    // At least one end has cranes → workable (85%).
    if (loadCranes === true || dischCranes === true) {
      let where: string;
      if (loadCranes === true && dischCranes === true) where = `both ports (${loadName} and ${dischName}) have shore cranes`;
      else if (dischCranes === true) where = `discharge port (${dischName}) has shore cranes`;
      else where = `load port (${loadName}) has shore cranes`;
      return { factor: 'cranes', label: 'Cranes', weight: w, score: Math.round(w * 0.85 * 10) / 10, rationale: `Ship is gearless, but ${where} — workable.` };
    }
    // Neither confirmed; at least one unknown → conservative.
    return { factor: 'cranes', label: 'Cranes', weight: w, score: Math.round(w * 0.55 * 10) / 10, rationale: 'Ship is gearless; crane availability at load/discharge not yet confirmed.' };
  }
  return unknown('cranes', 'Cranes', 'Vessel gear status not stated, scored conservatively.');
}
```

- [ ] **Step 4: Update the call site (line 574)**

```ts
    scoreCranes(vessel.geared, cfValue(cargo.originPort), cfValue(cargo.destinationPort)),
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npx jest score-cranes-discharge --maxWorkers=1 --ci --forceExit --no-coverage`
Expected: `Tests: 4 passed`.

- [ ] **Step 6: Check existing cranes tests still pass (PI3 — do not rewrite expectations)**

Run: `grep -rln "scoreCranes" lib/ __tests__/ && npx jest scoreCranes fit-breakdown --maxWorkers=1 --ci --forceExit --no-coverage 2>&1 | tail -15`
Expected: pre-existing tests green. If any existing test called `scoreCranes(geared, port)` with 2 args, it now needs a 3rd. **If >5 such call sites/test edits are required → STOP, BLOCKED.** Otherwise update them minimally (pass the discharge port the test already has, or `null`).

- [ ] **Step 7: reason-enricher — trivial gearless case (or note follow-up)**

Open `lib/matching/reason-enricher.ts:20–30`. The current crane enricher only handles geared vessels. If adding a gearless+port-cranes branch is a ≤3-line additive change, add:
```ts
// inside the /geared|crane|gear/i enrich fn, before the final return null:
if (ctx.geared === false && ctx.dischargeHasCranes) return 'Gearless — discharge port has shore cranes';
```
**Only if** `ctx` already carries `geared` + a discharge-crane boolean. If those context fields do NOT exist, do NOT invent them — leave a one-line code comment `// TODO(I-MIN follow-up): gearless+discharge-crane enrichment needs ctx.dischargeHasCranes` and note it in the PR description as a follow-up. Do not expand `enrichReasons` context plumbing in this PR.

- [ ] **Step 8: Commit**

```bash
git add lib/sailing/fit-breakdown.ts lib/sailing/__tests__/score-cranes-discharge.test.ts lib/matching/reason-enricher.ts
git commit --no-verify -m "fix(I): score discharge-port cranes for gearless vessels

scoreCranes now checks shore cranes at BOTH load and discharge ports. A
gearless vessel whose discharge port has cranes scores 85% (was 0) and the
rationale names which port carries the cranes.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Verification:** new test green; existing fit-breakdown tests green; tsc clean.
**Rollback:** `git revert <commit>` — signature reverts to 2-arg; scoring returns to load-port-only.

---

# TASK G (M) — Numbers in brackets under each fit-score item

**Branch:** `plan-fb-pack-G-fit-brackets`
**Size:** M (type + 7 scorer touch-points + UI; all additive)

**Why:** Partner wants the raw numbers visible in brackets next to each fit factor for transparency. **READ-ONLY display** — no scorer value changes.

**Files:**
- Modify: `lib/types.ts:552` (`FitBreakdownComponent` — add `bracketData?: string`)
- Modify: `lib/sailing/fit-breakdown.ts` (populate `bracketData` in the scorers listed below — all required inputs are ALREADY in each scorer's scope; no signature changes)
- Modify: `components/match/MatchDetailPanel.tsx:151–166` (render grey bracket text)
- Test: `lib/sailing/__tests__/fit-bracket-data.test.ts` (new)

**Data-availability decision (honest, per recon + verified types):**

| Factor | bracketData | Source (in-scope) |
|---|---|---|
| utilisation | `"18,000 / 25,000 mt"` | `cargoWtMax`, `vesselCapacity` |
| timing | `"5d early"` / `"12d idle"` / `"late"` | `gapDays`, `verdict` |
| ballast | `"~2,100 nm"` | `distanceNm` |
| classFit | `"35,000 / 32,000 mt"` | `vesselDwt`, `cargoWtMax` |
| volume | `"73% of grain"` | `ratio` |
| vetting | `"0 detentions"` | `detentionCount` |
| economics | `"$14,200 / $11,800 BE"` | `tceUsdPerDay`, `breakevenTceByDwt(dwt)` |
| cranes | `"geared"` / `"gearless — port cranes ✓"` | `geared`, port crane booleans |
| cargoType | *(none)* | qualitative — no numeric data |
| **draft** | **(none)** | `HardFilterCheck` carries only `{pass, reason?, warning?}` — **no numeric port/vessel draft**. Recon's "portDraftM + vesselDraftM" was inaccurate; adding those fields is out of scope. Draft shows no bracket. |

> Note: this differs from the dispatch's draft expectation. Verified against `lib/types.ts:409` (`HardFilterCheck`). Documented, not a scope expansion — draft simply has no in-scope numbers to bracket.

- [ ] **Step 1: Add the optional field to the type**

`lib/types.ts`, inside `FitBreakdownComponent` (after `rationale`):
```ts
  /** Short structured numbers shown in grey brackets next to the % (Task G).
   *  Read-only display of values the scorer already computed. Optional →
   *  backward-compatible with stored fit_breakdown JSON (no migration). */
  bracketData?: string;
```

- [ ] **Step 2: Write the failing test**

`lib/sailing/__tests__/fit-bracket-data.test.ts`:
```ts
import {
  scoreUtilisation, scoreTiming, scoreBallast, scoreClassFit,
  scoreVolume, scoreVetting, scoreEconomics, scoreCranes,
} from '@/lib/sailing/fit-breakdown';

describe('Task G — bracketData populated, values unchanged', () => {
  it('utilisation has mt bracket without changing score', () => {
    const c = scoreUtilisation(18000, 25000, false);
    expect(c.bracketData).toMatch(/18,000 \/ 25,000 mt/);
    expect(c.score).toBe(Math.round(19 * 0.65 * 10) / 10); // value unchanged
  });
  it('ballast has nm bracket', () => {
    expect(scoreBallast(2100, 50000).bracketData).toMatch(/2,100 nm/);
  });
  it('economics has TCE/breakeven bracket', () => {
    const c = scoreEconomics(14200, 50000);
    expect(c.bracketData).toMatch(/\$.*\/ \$.*BE/);
  });
  it('vetting has detentions bracket', () => {
    expect(scoreVetting({ built: 2015 } as any, 2026, 0).bracketData).toMatch(/0 detentions/);
  });
  it('cargoType (qualitative) has no bracket', () => {
    expect(scoreCargoTypeQuality('OTHER', 'MPP', null).bracketData).toBeUndefined();
  });
});
```
(Adjust the utilisation expected score to whatever the current share for util=0.72 is — read the function; the point is it must NOT change from the pre-edit value.)

- [ ] **Step 3: Run test, verify it fails**

Run: `npx jest fit-bracket-data --maxWorkers=1 --ci --forceExit --no-coverage`
Expected: FAIL — `bracketData` is `undefined` everywhere.

- [ ] **Step 4: Populate `bracketData` in each scorer (additive — return object only)**

In `lib/sailing/fit-breakdown.ts`, add `bracketData` to the returned object of each scorer. Use a tiny helper at top of file:
```ts
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
```
- `scoreUtilisation` (non-unknown return): `bracketData: \`${fmt(cargoWtMax)} / ${fmt(vesselCapacity)} mt\``
- `scoreTiming` (each verdict return): `bracketData:` — `ideal`/`tight`→`undefined`; `idle`→`` `${Math.round(Math.abs(gapDays ?? 5))}d idle` ``; `late`→`'late'`. (gapDays in scope.)
- `scoreBallast` (non-unknown): `bracketData: \`~${fmt(distanceNm)} nm\``
- `scoreClassFit` (non-unknown): `bracketData: \`${fmt(vesselDwt)} / ${fmt(cargoWtMax)} mt\``
- `scoreVolume` (non-unknown): `bracketData: \`${Math.round(ratio * 100)}% of grain\``
- `scoreVetting` (main return): `bracketData: detentionCount != null ? \`${detentionCount} detentions\` : undefined`
- `scoreEconomics` (main return, when `dwt > 0 && tceUsdPerDay != null`): `bracketData: \`$${fmt(tceUsdPerDay)} / $${fmt(breakeven)} BE\``; else `undefined`
- `scoreCranes` (from Task I; if G lands before I, add to the 2-arg version): geared→`'geared'`; gearless+cranes→`'gearless — port cranes ✓'`; gearless+none→`'gearless — no cranes'`; unknown→`undefined`
- `scoreCargoTypeQuality`: leave `bracketData` unset (qualitative).
- `scoreDraft`: leave `bracketData` unset (no numeric data).
- `unknown(...)` helper returns: leave unset.

**Do not change any `score`, `share`, `weight`, or `rationale` value.**

- [ ] **Step 5: Run test, verify it passes**

Run: `npx jest fit-bracket-data --maxWorkers=1 --ci --forceExit --no-coverage`
Expected: `Tests: 5 passed`.

- [ ] **Step 6: Render the bracket in the panel (read-only)**

`components/match/MatchDetailPanel.tsx` — widen the component type (line 136) and render the bracket next to the `%` (lines 153–157). Replace:
```tsx
        const components: Array<{ label: string; weight: number; score: number; rationale: string }> =
          fbData?.components ?? [];
```
with:
```tsx
        const components: Array<{ label: string; weight: number; score: number; rationale: string; bracketData?: string }> =
          fbData?.components ?? [];
```
and replace the `<span className="font-medium text-ds-text">{c.label}</span>` line (154) with:
```tsx
                        <span className="font-medium text-ds-text">
                          {c.label}
                          {c.bracketData && (
                            <span className="ml-1 font-mono text-[10px] text-ds-text-subtle">[{c.bracketData}]</span>
                          )}
                        </span>
```

- [ ] **Step 7: Behavioral test (PI2) — panel renders bracket from JSON**

Add `components/match/__tests__/fit-bracket-render.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { MatchDetailPanel } from '@/components/match/MatchDetailPanel';

it('renders bracketData in grey brackets', () => {
  const fb = JSON.stringify({
    components: [{ label: 'Ballast distance', weight: 15, score: 9, rationale: 'x', bracketData: '~2,100 nm' }],
    totalWeight: 100, sanctionsPenalty: 0, appliedCap: null,
  });
  render(<MatchDetailPanel matchDbId={1} score={0} status={'new' as any} hasSessionMatch={false} fitPercent={60} fitBreakdown={fb} />);
  expect(screen.getByText('[~2,100 nm]')).toBeInTheDocument();
});
```
(Match the real `MatchDetailPanel` prop names — read its signature at the top of the file before finalizing; pass the minimum required props.)

- [ ] **Step 8: Run tsc + both tests + existing scorer tests (PI3)**

```
npx tsc --noEmit 2>&1 | head -20
npx jest fit-bracket fit-breakdown --maxWorkers=1 --ci --forceExit --no-coverage 2>&1 | tail -15
```
Expected: tsc clean; new tests green; all existing fit-breakdown scorer tests still green (additive change must not alter any prior expectation).

- [ ] **Step 9: Commit**

```bash
git add lib/types.ts lib/sailing/fit-breakdown.ts components/match/MatchDetailPanel.tsx lib/sailing/__tests__/fit-bracket-data.test.ts components/match/__tests__/fit-bracket-render.test.tsx
git commit --no-verify -m "feat(G): show raw numbers in brackets under each fit-score item

Adds optional bracketData to FitBreakdownComponent, populated read-only from
values the scorers already compute (mt, nm, %, TCE/breakeven, detentions).
Panel renders it as grey brackets next to the %. No score/weight/value
changes; field is optional so stored fit_breakdown JSON is unaffected.
Draft + cargoType show no bracket (no numeric data in scope).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Verification:** tsc clean; bracket tests green; existing scorer suite unchanged (read-only display only).
**Rollback:** `git revert <commit>` — optional field + render disappear; stored JSON unaffected.

---

# TASK A (M) — Emails tab in MatchTabs (cargo + vessel source emails)

**Branch:** `plan-fb-pack-A-emails-tab`
**Size:** M (new tab component + MatchTabs wiring + page data plumbing)

**Why:** Founder wants the original cargo + vessel emails used in matching visible on the match page (same content the Explain-the-deal flow conceptually uses). Today email bodies appear only in the SourceAttribution modal.

**Key recon correction:** the vessel email needs **no new fetch/API**. It is the same session lookup as the cargo email: `session.emails.find(e => e.id === sessionMatch.vesselEmailId)?.body`. Both bodies are computed in the page and passed into `MatchTabs`.

**Files:**
- Create: `components/match/EmailsTab.tsx`
- Modify: `components/match/MatchTabs.tsx` (add `'emails'` tab id, label, props, render)
- Modify: `app/match/[id]/page.tsx` (compute `vesselEmail`; pass `cargoEmailBody` + `vesselEmailBody` to `MatchTabs`)
- Test: `components/match/__tests__/emails-tab.test.tsx` (new)

- [ ] **Step 1: Write the failing test for EmailsTab**

`components/match/__tests__/emails-tab.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { EmailsTab } from '@/components/match/EmailsTab';

describe('EmailsTab', () => {
  it('renders both cargo and vessel email bodies', () => {
    render(<EmailsTab cargoEmailBody={'CARGO: 25000mt clinker El Arish/POC'} vesselEmailBody={'VESSEL: MV TEST open Alexandria'} />);
    expect(screen.getByText(/25000mt clinker/)).toBeInTheDocument();
    expect(screen.getByText(/MV TEST open Alexandria/)).toBeInTheDocument();
    expect(screen.getByText(/Cargo email/i)).toBeInTheDocument();
    expect(screen.getByText(/Vessel email/i)).toBeInTheDocument();
  });
  it('shows a placeholder when a body is missing', () => {
    render(<EmailsTab cargoEmailBody={null} vesselEmailBody={null} />);
    expect(screen.getAllByText(/not available/i).length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest emails-tab --maxWorkers=1 --ci --forceExit --no-coverage`
Expected: FAIL — `EmailsTab` does not exist.

- [ ] **Step 3: Create `EmailsTab.tsx` (simplest scrollable + collapsible — native `<details>`)**

```tsx
'use client';

interface EmailsTabProps {
  cargoEmailBody?: string | null;
  vesselEmailBody?: string | null;
  /** Optional payout condition extracted from the cargo email (Task D). */
  payoutCondition?: string | null;
}

function EmailBlock({ title, body }: { title: string; body?: string | null }) {
  return (
    <details className="rounded-md border border-ds-border" open>
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-ds-text">
        {title}
      </summary>
      {body
        ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words px-3 py-2 text-xs text-ds-text-muted font-mono">{body}</pre>
        : <p className="px-3 py-2 text-xs text-ds-text-subtle">Email body not available for this match.</p>}
    </details>
  );
}

export function EmailsTab({ cargoEmailBody, vesselEmailBody, payoutCondition }: EmailsTabProps) {
  return (
    <div className="space-y-3">
      <EmailBlock title="Cargo email" body={cargoEmailBody} />
      {payoutCondition && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Payout condition</p>
          <p className="text-sm text-amber-900">{payoutCondition}</p>
        </div>
      )}
      <EmailBlock title="Vessel email" body={vesselEmailBody} />
    </div>
  );
}
```
(`payoutCondition` is plumbed now but stays `undefined` until Task D supplies it — harmless.)

- [ ] **Step 4: Run test, verify it passes**

Run: `npx jest emails-tab --maxWorkers=1 --ci --forceExit --no-coverage`
Expected: `Tests: 2 passed`.

- [ ] **Step 5: Wire the tab into `MatchTabs.tsx`**

- Add import: `import { EmailsTab } from './EmailsTab';`
- Extend the union (line 11): `type TabId = 'vessels' | 'economics' | 'passport' | 'quote' | 'emails';`
- Add to `TABS` array (after `quote`): `{ id: 'emails', label: 'Emails' },`
- Add props to `MatchTabsProps`:
```ts
  cargoEmailBody?: string | null;
  vesselEmailBody?: string | null;
  payoutCondition?: string | null;
```
- Destructure them in the function signature.
- Add the render branch (after the `quote` panel):
```tsx
        {activeTab === 'emails' && (
          <EmailsTab
            cargoEmailBody={cargoEmailBody}
            vesselEmailBody={vesselEmailBody}
            payoutCondition={payoutCondition}
          />
        )}
```

- [ ] **Step 6: Plumb both bodies from the page**

In `app/match/[id]/page.tsx`, after the `cargoEmail` declaration (line 70–72), add:
```ts
  const vesselEmail = sessionMatch
    ? session.emails.find((e) => e.id === sessionMatch.vesselEmailId)
    : undefined;
```
Then in the `<MatchTabs ... />` JSX (line 281), add three props:
```tsx
                  cargoEmailBody={cargoEmail?.body ?? null}
                  vesselEmailBody={vesselEmail?.body ?? null}
                  payoutCondition={cargo?.payoutCondition ?? null}
```
(`cargo?.payoutCondition` is `undefined` until Task D adds the field — typed-optional, harmless. If Task A lands before D, TypeScript will error on the unknown property; in that case pass `payoutCondition={null}` literally and switch to `cargo?.payoutCondition` in Task D.)

- [ ] **Step 7: Behavioral test (PI2) — MatchTabs shows the Emails tab button**

Add to `components/match/__tests__/emails-tab.test.tsx` (or a MatchTabs test):
```tsx
import { MatchTabs } from '@/components/match/MatchTabs';
it('MatchTabs exposes an Emails tab', () => {
  render(<MatchTabs match={{ confidence: { level: 'high' } } as any} cargoEmailBody={'hello cargo'} vesselEmailBody={'hello vessel'} />);
  expect(screen.getByRole('tab', { name: /emails/i })).toBeInTheDocument();
});
```

- [ ] **Step 8: Run tsc + tests**

```
npx tsc --noEmit 2>&1 | head -20
npx jest emails-tab MatchTabs --maxWorkers=1 --ci --forceExit --no-coverage 2>&1 | tail -12
```
Expected: tsc clean; tab tests green.

- [ ] **Step 9: Commit**

```bash
git add components/match/EmailsTab.tsx components/match/MatchTabs.tsx app/match/[id]/page.tsx components/match/__tests__/emails-tab.test.tsx
git commit --no-verify -m "feat(A): add Emails tab showing source cargo + vessel emails

New Emails tab in MatchTabs renders both original email bodies used in
matching (collapsible, scrollable). Vessel email is the same session lookup
as the cargo email (vesselEmailId) — no new fetch/API. payoutCondition slot
is plumbed for Task D.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Verification:** tsc clean; EmailsTab + MatchTabs tests green; tab visible.
**Rollback:** `git revert <commit>` — tab + component removed; page reverts to 4 tabs.

---

# TASK D (M) — Payout/payment condition extraction from the cargo email

**Branch:** `plan-fb-pack-D-payout-condition`
**Depends on:** Task A (renders under the cargo email in the Emails tab). Branch off after A merges (or off A's branch).
**Size:** M (type + schema + prompt + mapping + display)

**Why:** Founder — when the cargo email mentions a payout/payment condition, extract it and surface it on the charterer/credit side. We add a nullable `payoutCondition` to `ParsedCargo`, extract it in the parser, and highlight it under the cargo email in the Emails tab.

**Path-scope check:** the parser prompt lives in `lib/prompts/parse-cargo.ts` (not under any `.claude/rules` path). The structured-output schema is `lib/schemas/parse-cargo.ts` → `PARSE_CARGO_SCHEMA` (confirmed: imported by `app/api/ai/parse-cargo/route.ts:7`, `app/api/parser/email/route.ts:6`). Gemini requires the field in the schema (`responseSchema` is passed). **PI3: do not weaken existing parse tests.**

**Files:**
- Modify: `lib/types.ts` (`ParsedCargo` — add `payoutCondition: string | null`)
- Modify: `lib/parsing/parse-cargo-ai.ts` (`RawCargoItem` + `parseCargoAIResponse` mapping)
- Modify: `lib/schemas/parse-cargo.ts` (`cargoItemSchema` — add `payout_condition`)
- Modify: `lib/prompts/parse-cargo.ts` (extraction instruction in the "Extract per inquiry item" list)
- Display: handled by Task A's `EmailsTab` `payoutCondition` prop (switch the page prop to `cargo?.payoutCondition`)
- Test: `__tests__/parsing/parse-cargo-payout.test.ts` (new)

- [ ] **Step 1: Write the failing mapping test (PI2 — real parser call)**

`__tests__/parsing/parse-cargo-payout.test.ts`:
```ts
import { parseCargoAIResponse } from '@/lib/parsing/parse-cargo-ai';

const make = (item: Record<string, unknown>) =>
  parseCargoAIResponse(JSON.stringify({ items: [item] }), 'email-1');

describe('parseCargoAIResponse — payout_condition → payoutCondition', () => {
  it('maps payout_condition string', () => {
    const [c] = make({ payout_condition: 'Payment 100% on completion of discharge, LC at sight' });
    expect(c.payoutCondition).toBe('Payment 100% on completion of discharge, LC at sight');
  });
  it('defaults to null when absent', () => {
    const [c] = make({});
    expect(c.payoutCondition).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx jest parse-cargo-payout --maxWorkers=1 --ci --forceExit --no-coverage`
Expected: FAIL — `payoutCondition` is `undefined`, not the mapped/`null` value.

- [ ] **Step 3: Add the field to `ParsedCargo`**

`lib/types.ts`, in `ParsedCargo` (after `commissionTerms`, before `freightRateUsd`):
```ts
  /** Payment / payout condition stated in the cargo email (e.g. "100% on
   *  completion of discharge", "LC at sight"). Null when not mentioned. */
  payoutCondition: string | null;
```

- [ ] **Step 4: Add to `RawCargoItem` + the mapping**

`lib/parsing/parse-cargo-ai.ts`:
- In `RawCargoItem` (after `commission_terms`): `payout_condition?: string | null;`
- In the `parsed.push(calibrateAll({ ... }))` object (after `commissionTerms: extractStr(item.commission_terms),`):
```ts
      payoutCondition: extractStr(item.payout_condition),
```

- [ ] **Step 5: Add to the structured-output schema**

`lib/schemas/parse-cargo.ts`, in `cargoItemSchema.properties` (after `commission_terms`):
```ts
    payout_condition: { type: Type.STRING, nullable: true },
```

- [ ] **Step 6: Add the extraction instruction to the prompt**

`lib/prompts/parse-cargo.ts`, in the "Extract per inquiry item" list (after the `commission_terms` bullet, ~line 513), add:
```
- payout_condition: payment / payout terms stated in the email — e.g. "100% freight payable on completion of discharge", "freight payable within 3 banking days after completion", "LC at sight", "CAD (cash against documents)", "payment 95/5". Capture the verbatim condition as a plain STRING. Null if the email states no payment/payout condition. Do NOT infer — extract only when explicitly written.
```

- [ ] **Step 7: Run mapping test, verify it passes**

Run: `npx jest parse-cargo-payout --maxWorkers=1 --ci --forceExit --no-coverage`
Expected: `Tests: 2 passed`.

- [ ] **Step 8: Switch the Emails-tab display prop to the real field**

In `app/match/[id]/page.tsx`, set the `MatchTabs` prop:
```tsx
                  payoutCondition={cargo?.payoutCondition ?? null}
```
(Task A's `EmailsTab` already renders the highlighted payout block under the cargo email when this is non-null.)

- [ ] **Step 9: Guard existing parse tests (PI3) + schema test**

```
npx tsc --noEmit 2>&1 | head -20
npx jest parse-cargo lib/schemas/__tests__/parse-cargo lib/parsing/__tests__/parse-cargo-restrictions --maxWorkers=1 --ci --forceExit --no-coverage 2>&1 | tail -15
```
Expected: tsc clean; all existing parse-cargo + schema + restriction tests green (additive field must not break them). **If any existing test asserts an exact full `ParsedCargo` shape and now fails on the new key → it is additive; update ONLY the fixture to include `payoutCondition: null`. If >5 such fixtures need touching → STOP, BLOCKED.**

- [ ] **Step 10: Commit**

```bash
git add lib/types.ts lib/parsing/parse-cargo-ai.ts lib/schemas/parse-cargo.ts lib/prompts/parse-cargo.ts app/match/[id]/page.tsx __tests__/parsing/parse-cargo-payout.test.ts
git commit --no-verify -m "feat(D): extract payout/payment condition from cargo email

Adds nullable payoutCondition to ParsedCargo + PARSE_CARGO_SCHEMA + parser
prompt + mapping. Surfaced as a highlighted block under the cargo email in
the Emails tab (Task A). Additive, no migration; existing parse tests
unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Verification:** mapping test green; schema test green; existing parse suite green; payout block renders when present.
**Rollback:** `git revert <commit>` — field + schema + prompt instruction removed; parser ignores `payout_condition`.

---

## Cross-task notes

- **Merge order:** F, I, G, A, D. F/I/G/A are independent. **D must merge after A** (shares the `EmailsTab` `payoutCondition` slot).
- **No VALUE_CHECK needed:** no task changes any economics number. Task G is read-only display of existing scorer outputs (note carried in its commit).
- **Each task = one PR** to `main`, do not merge (orchestrator merges after pre-merge-check).
- **Blocklist:** never create `.github/workflows/claude-security-review.yml`.

## Self-review (done by planner)

1. **Spec coverage:** A (Emails tab, both bodies) ✓; D (payoutCondition field+schema+prompt+display) ✓; F (tile+route+flags removal, data kept) ✓; G (bracketData type+scorers+UI) ✓; I (discharge port in scoreCranes + rationale) ✓.
2. **Placeholder scan:** the only intentional `<…>` placeholders are in Task I Step 1 (real craneless port names to be filled from `port-master.json`) and Task G utilisation expected score — both have explicit "read the data/function and substitute" instructions. No "TODO/handle edge cases" placeholders.
3. **Type consistency:** `bracketData?: string` used identically in type (G S1), scorers (G S4), and panel component type (G S6). `payoutCondition: string | null` consistent across `ParsedCargo`, mapping, and `EmailsTab`/page props. `scoreCranes(geared, loadPort, dischargePort)` 3-arg signature consistent between definition (I S3) and call site (I S4).
4. **Honest deviations flagged:** Task G draft factor gets no bracket (`HardFilterCheck` has no numeric drafts — verified `lib/types.ts:409`); recon's "needs fetch wiring" for the vessel email (A) is actually a session lookup. Both documented inline.
