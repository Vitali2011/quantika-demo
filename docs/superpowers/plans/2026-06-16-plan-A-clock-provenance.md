# Group A — Provenance / Demo Clock Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the demo's "now" so synthesized laycans stop carrying a false `[¹]` source footnote (#1024), the Draft Quote LLM stops calling fresh future laycans "elapsed" (#1018), and a null cargo quantity never leaks as the literal text `null mt[¹]` (#1021 display tail).

**Architecture:** The demo has three competing clocks — `lib/clock.ts:now()` (frozen demo date `2026-05-28`), `create-demo-session.ts:94 new Date()` (real wall-clock), and the Draft Quote LLM (real wall-clock, no anchor). This plan: (1) nulls the now-invalid `preferredDates.sourceText` citation at the moment `rebaseParsedCargoes` shifts a laycan; (2) switches `create-demo-session.ts` rebasing to the frozen `now()` so session-init shares the engine's clock; (3) injects the frozen date into the quote prompt; (4) hardens the Source Attribution display against null `ConfidenceField.value`.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Jest (`--maxWorkers=1 --ci --forceExit`), better-sqlite3, `@testing-library/react`.

**Locked founder decision (Tier L — unify the demo clock):**
1. `create-demo-session.ts:94` `new Date()` → `now()` (frozen demo date).
2. Null out `cargo.preferredDates.sourceText` inside `rebaseParsedCargoes` when the laycan is shifted.
3. Inject the frozen demo date into the quote prompt so #1018 stops marking dates elapsed.
4. (#1021 display tail) Guard the Source Attribution render so `value === null` never renders as `"null mt"` and never earns a `[¹]`.

---

## Background — the three "nows" (from recon)

| Where | Clock used | Value (2026-06-16 real) | Consequence |
|-------|-----------|--------------------------|-------------|
| `lib/clock.ts:now()` | demo frozen date | `2026-05-28` | match engine keeps matches FRESH |
| `lib/sample-data/create-demo-session.ts:94` | `new Date()` | `2026-06-16` (real) | rebase shifts laycans to **June**; `preferredDates.sourceText` stays **May** → false `[¹]` (#1024) |
| Draft Quote LLM (`lib/quote-jobs/prompt.ts`) | real wall-clock (no anchor) | `2026-06-16` (real) | LLM calls a Jun 3–6 laycan "elapsed" (#1018) |

Recon sources (read before implementing):
- `~/orchestrator-state/quantika-demo/recon-1024-false-footnote.md` (full root cause + call-sites + §6 shared-root with #1018)
- `~/orchestrator-state/quantika-demo/recon-1021-tonnage.md` §RC-C (display tail only — `String(null) === "null"`)

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `lib/sample-data/rebase-parsed.ts:108-119` | Modify | Drop `preferredDates.sourceText` when a laycan is shifted/synthesized (Task 1) |
| `lib/sample-data/create-demo-session.ts:94` | Modify | Use frozen `now()` instead of `new Date()` (Task 2) |
| `lib/quote-jobs/prompt.ts:6-16,45-47` | Modify | Accept `nowIso` and anchor the quote system prompt to it (Task 3) |
| `scripts/quote-workshop/worker.ts:9,55` | Modify | Resolve the frozen date via `today()` and pass it to `buildQuotePrompt` (Task 3) |
| `app/match/[id]/page.tsx:378` | Modify | Guard Weight field on `value != null` (Task 4) |
| `components/match/SourceAttributionSection.tsx:29` | Modify | Filter out fields whose `value.value == null` (Task 4) |
| `__tests__/sample-data/rebase-parsed.test.ts` | Modify (add tests) | Task 1 behavioral test |
| `__tests__/sample-data/create-demo-session-clock.test.ts` | Create | Task 2 behavioral test |
| `lib/quote-jobs/__tests__/prompt.test.ts` | Modify (add test) | Task 3 behavioral test |
| `components/match/__tests__/SourceAttributionSection.test.tsx` | Create | Task 4 behavioral test |

**Known types (verified):**
- `lib/types.ts:222` — `preferredDates: ConfidenceField<string> | null;`
- `lib/types.ts:24-27` — `interface ConfidenceField<T> { value: T; confidence: ...; sourceText?: string; }` (`sourceText` is optional → assigning `undefined` is type-clean).
- `lib/sample-data/demo-parsed-cargoes.ts:38` — `resolveDemoParsedCargoes(now)` returns `[...rebaseParsedCargoes(corpus, now), resolveSyntheticCargo(now)]` (wiring confirmed).
- `lib/demo-mode.ts:14-22` — `getDemoFrozenDate(db = getDb())` reads `demo_seed_meta`, **caches**, and **throws** if the row is missing. `now()` (clock.ts:17-22) has **no** fallback; `demoNow()` (clock.ts:39-50) does (see Risk §).
- `app/api/sample/route.ts:21` — the **only** caller of `createDemoSession()`, inside a POST request handler (DB initialized).

---

## Task 1: Drop false `[¹]` citation at rebase source (#1024)

**Files:**
- Modify: `lib/sample-data/rebase-parsed.ts:108-119`
- Test: `__tests__/sample-data/rebase-parsed.test.ts`

When `rebaseParsedCargoes` shifts (or synthesizes a spot-window for) `cargo.laycan`, the original `cargo.preferredDates.sourceText` — a quote for the ORIGINAL email date — no longer attributes the displayed value. Null it so `app/match/[id]/page.tsx:381-385` and `SourceAttributionSection.tsx:29` stop emitting a `[¹]`. Keep `preferredDates.value` so any raw-date display path still has text.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/sample-data/rebase-parsed.test.ts` inside `describe('rebaseParsedCargoes — laycan', ...)`. The existing `cargo()` helper does not set `preferredDates`, so build a fuller fixture inline:

```ts
it('drops preferredDates.sourceText when the laycan is shifted (no false [¹]) but keeps value', () => {
  const withSource = {
    emailId: 'p1',
    laycan: '11-16 May',
    cargoType: 'BULK',
    preferredDates: { value: '11-16 May 2026', confidence: 'confirmed', sourceText: '11 - 16 May' },
  } as unknown as ParsedCargo;

  const out = rebaseParsedCargoes([withSource], now);

  expect(out[0].laycan).not.toBe('11-16 May');          // laycan was shifted
  expect(out[0].preferredDates?.sourceText).toBeUndefined(); // citation dropped
  expect(out[0].preferredDates?.value).toBe('11-16 May 2026'); // display value kept
});

it('drops preferredDates.sourceText for spot cargoes synthesized to a fresh window', () => {
  const spotWithSource = {
    emailId: 's1',
    laycan: 'Spot',
    cargoType: 'BULK',
    preferredDates: { value: 'prompt', confidence: 'uncertain', sourceText: 'Spot' },
  } as unknown as ParsedCargo;

  const out = rebaseParsedCargoes([spotWithSource], now);

  expect(out[0].preferredDates?.sourceText).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/sample-data/rebase-parsed.test.ts --maxWorkers=1 --no-coverage --ci --forceExit`
Expected: FAIL — `sourceText` is still `'11 - 16 May'` / `'Spot'` (not `undefined`).

- [ ] **Step 3: Write minimal implementation**

In `lib/sample-data/rebase-parsed.ts`, add a helper above the `return cargoes.map(...)` (after line 106) and apply it in both shifted branches:

```ts
  // When the laycan is shifted/synthesized, preferredDates.sourceText (a quote for the
  // ORIGINAL email date) no longer attributes the displayed value — drop it so the match
  // page does not render a false [¹] citation (#1024). Keep .value for display.
  const dropLaycanSource = (c: ParsedCargo): ParsedCargo['preferredDates'] =>
    c.preferredDates ? { ...c.preferredDates, sourceText: undefined } : c.preferredDates;

  return cargoes.map((c) => {
    if (isSpot(c.laycan)) {
      return {
        ...c,
        laycan: `${isoDay(nowMs)} to ${isoDay(addDays(nowMs, window))}`,
        preferredDates: dropLaycanSource(c),
      };
    }
    const r = parseLaycan(c.laycan, CORPUS_REF_YEAR);
    if (r) {
      const start = addDays(r.start.getTime(), shift);
      const end = addDays(r.end.getTime(), shift);
      return {
        ...c,
        laycan: `${isoDay(start)} to ${isoDay(end)}`,
        preferredDates: dropLaycanSource(c),
      };
    }
    return { ...c }; // laycan unparseable → NOT shifted → keep original sourceText
  });
```

Note: the early-return at line 102 (`if (starts.length === 0)`) and the unparseable fallthrough keep `sourceText` intact — correct, because those laycans are not shifted.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/sample-data/rebase-parsed.test.ts --maxWorkers=1 --no-coverage --ci --forceExit`
Expected: PASS — all rebase tests green (existing width/spread/unmutated tests unchanged; new citation tests pass).

- [ ] **Step 5: Commit**

```bash
git add lib/sample-data/rebase-parsed.ts __tests__/sample-data/rebase-parsed.test.ts
git commit -m "fix(rebase): drop preferredDates.sourceText on shifted laycan (#1024)"
```

---

## Task 2: Unify session-init clock with the demo frozen date (#1024 / #1018 shared root)

**Files:**
- Modify: `lib/sample-data/create-demo-session.ts:94` (+ add import line ~1)
- Test: `__tests__/sample-data/create-demo-session-clock.test.ts` (create)

`create-demo-session.ts:94` uses `new Date()` (real wall-clock) for all rebasing, splitting the clock from the match engine's frozen `now()`. Switch to `now()` so the session is rebased onto the same frozen date the engine compares against. **See the Risk section** before implementing.

- [ ] **Step 1: Write the failing test**

Create `__tests__/sample-data/create-demo-session-clock.test.ts`. Mock the clock so the test is deterministic and never touches `demo_seed_meta`:

```ts
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Freeze the demo clock to the canonical demo date.
jest.mock('@/lib/clock', () => ({
  now: () => new Date('2026-05-28T00:00:00.000Z'),
  today: () => '2026-05-28',
}));

import { createDemoSession } from '@/lib/sample-data/create-demo-session';
import { getSession } from '@/lib/session';
import { parseLaycan } from '@/lib/sailing/date-parsing';

describe('createDemoSession — unified frozen clock (#1024/#1018)', () => {
  it('rebases cargo laycans onto the frozen demo date, not the real wall-clock', () => {
    const id = createDemoSession();
    const session = getSession(id);
    expect(session).toBeTruthy();

    const cargos = session!.parsedCargos ?? [];
    // At least one rebased laycan must land in the frozen-date neighbourhood (May/Jun 2026
    // anchored on 2026-05-28), NOT shifted forward to the real wall-clock month.
    const parsed = cargos
      .map((c) => parseLaycan(c.laycan as string, 2026))
      .filter(Boolean);
    expect(parsed.length).toBeGreaterThan(0);

    // The rebase anchors the laycan cluster MEDIAN onto `now` (2026-05-28). Assert the
    // earliest rebased start is within a few weeks of the frozen date, proving the frozen
    // clock — not real `new Date()` — drove the shift.
    const frozen = Date.UTC(2026, 4, 28); // 2026-05-28
    const minStart = Math.min(...parsed.map((r) => r!.start.getTime()));
    const driftDays = Math.abs(minStart - frozen) / 86_400_000;
    expect(driftDays).toBeLessThan(45);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/sample-data/create-demo-session-clock.test.ts --maxWorkers=1 --no-coverage --ci --forceExit`
Expected: FAIL — with `new Date()` the rebase ignores the mocked clock; laycans anchor to the real wall-clock date, so `driftDays` exceeds 45.

(If `createDemoSession`/`getSession` require store setup the test harness lacks, the implementer adds the minimal store bootstrap the existing `__tests__/demo-mode/...` session tests use — do **not** weaken the assertion.)

- [ ] **Step 3: Write minimal implementation**

In `lib/sample-data/create-demo-session.ts`, add the import and replace line 94:

```ts
import { now } from '@/lib/clock';
```

```ts
  // Frozen demo clock (lib/clock) — NOT new Date(). Unifies session-init rebasing with the
  // match engine so synthesized laycans match the engine's "now" (#1024) and downstream
  // consumers (quote prompt, freshness) share one clock (#1018). Outside DEMO_MODE now()
  // returns real time, so production behaviour is unchanged.
  const today = now();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/sample-data/create-demo-session-clock.test.ts --maxWorkers=1 --no-coverage --ci --forceExit`
Expected: PASS.

Also run the adjacent demo-session suites to confirm no regression:
Run: `npx jest __tests__/demo-clock-session-safety.test.ts __tests__/demo-mode --maxWorkers=1 --no-coverage --ci --forceExit`
Expected: PASS (these guard *session-store* expiry, a different module; `create-demo-session.ts` importing the clock does not touch them).

- [ ] **Step 5: Commit**

```bash
git add lib/sample-data/create-demo-session.ts __tests__/sample-data/create-demo-session-clock.test.ts
git commit -m "fix(demo): rebase session-init on frozen now() not new Date() (#1024 #1018)"
```

---

## Task 3: Anchor the Draft Quote prompt to the frozen date (#1018)

**Files:**
- Modify: `lib/quote-jobs/prompt.ts:6-16, 45-47`
- Modify: `scripts/quote-workshop/worker.ts:9, 55`
- Test: `lib/quote-jobs/__tests__/prompt.test.ts`

The quote builder injects no current-date anchor, so the LLM uses its real wall-clock and declares fresh future laycans "elapsed". Pass the frozen date in and add it to the **system** prompt (the existing `toMatchInlineSnapshot` covers the **user** prompt only — keeping injection in `system` avoids rewriting that snapshot, satisfying PI3).

- [ ] **Step 1: Write the failing test**

Add to `lib/quote-jobs/__tests__/prompt.test.ts`:

```ts
it('anchors the system prompt to nowIso so future laycans are not called elapsed (#1018)', async () => {
  const { system, user } = await buildQuotePrompt({
    parsedCargo: cargo as any,
    email: email as any,
    ragEnabled: false,
    nowIso: '2026-05-28',
  });
  expect(system).toContain('2026-05-28');
  expect(system).toMatch(/do not describe.*elapsed/i);
  // user prompt (frozen-template snapshot) stays untouched — date lives in system only
  expect(user).not.toContain('2026-05-28');
});

it('omits the date anchor when nowIso is not provided (back-compat)', async () => {
  const { system } = await buildQuotePrompt({ parsedCargo: cargo as any, email: email as any, ragEnabled: false });
  expect(system).not.toMatch(/CURRENT DATE/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/quote-jobs/__tests__/prompt.test.ts --maxWorkers=1 --no-coverage --ci --forceExit`
Expected: FAIL on the first new test — `system` has no `2026-05-28`. Existing tests (including the user-prompt inline snapshot) still PASS.

- [ ] **Step 3: Write minimal implementation**

In `lib/quote-jobs/prompt.ts`, extend `BuildArgs` (after line 13):

```ts
  /** Frozen "today" ISO date (YYYY-MM-DD). When set, anchors the quote's temporal reasoning. */
  nowIso?: string;
```

Destructure it (line 16) and rebuild `system` (replace lines 45-47):

```ts
export async function buildQuotePrompt({ parsedCargo, email, ragEnabled, matchId, db, nowIso }: BuildArgs): Promise<{ system: string; user: string }> {
```

```ts
  const baseSystem = ragContextParts.length
    ? `${DRAFT_QUOTE_SYSTEM_PROMPT}\n\n${ragContextParts.join('\n')}`
    : DRAFT_QUOTE_SYSTEM_PROMPT;
  const system = nowIso
    ? `${baseSystem}\n\nCURRENT DATE: ${nowIso}. Treat this as "today" for all temporal reasoning. Do NOT describe a laycan on or after ${nowIso} as elapsed, expired, or past — those dates are in the future.`
    : baseSystem;
```

In `scripts/quote-workshop/worker.ts`, import the clock (line 9 area) and resolve the date defensively (the worker runs outside the Next runtime; if the demo seed is unavailable, degrade to the current behaviour rather than crashing the quote):

```ts
import { today } from '@/lib/clock';
```

Replace line 55:

```ts
      let nowIso: string | undefined;
      try { nowIso = today(); } catch (e) { console.warn('[quote-worker] demo clock unavailable; quote omits date anchor:', e); }
      const { system, user } = await buildQuotePrompt({ parsedCargo, email, ragEnabled: isRagEnabled(), matchId: job.match_id ?? undefined, db, nowIso });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/quote-jobs/__tests__/prompt.test.ts --maxWorkers=1 --no-coverage --ci --forceExit`
Expected: PASS — `Tests: N passed` (all original + 2 new; the user-prompt inline snapshot is unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/quote-jobs/prompt.ts scripts/quote-workshop/worker.ts lib/quote-jobs/__tests__/prompt.test.ts
git commit -m "fix(quote): anchor draft-quote prompt to frozen demo date (#1018)"
```

---

## Task 4: Stop `null` cargo quantity leaking as `null mt[¹]` (#1021 display tail)

**Files:**
- Modify: `app/match/[id]/page.tsx:378`
- Modify: `components/match/SourceAttributionSection.tsx:29`
- Test: `components/match/__tests__/SourceAttributionSection.test.tsx` (create)

When the parser returns `weightMt = { value: null, sourceText: '5.000/5.500mts' }`, the page guard checks only that the `ConfidenceField` object exists (not its inner `value`), constructs `"${null} mt"`, and the section renders `Weight null mt[¹]`. Guard both the page (upstream) and the section filter (belt-and-suspenders). Scope here is the **display tail only** — the parser RC-A/RC-B prompt fixes are out of scope (Group B).

- [ ] **Step 1: Write the failing test**

Create `components/match/__tests__/SourceAttributionSection.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { SourceAttributionSection } from '@/components/match/SourceAttributionSection';

describe('SourceAttributionSection — null value guard (#1021)', () => {
  it('hides a field whose value is null even when sourceText is present (no "null" leak, no [¹])', () => {
    render(
      <SourceAttributionSection
        fields={[
          { label: 'Weight', value: { value: null as unknown as string, confidence: 'uncertain', sourceText: '5.000/5.500mts' } },
        ]}
        originalEmail="5.000/5.500mts bgd Cement"
      />
    );
    // Only field is the null-valued Weight → section renders nothing.
    expect(screen.queryByText(/Source Attribution/i)).toBeNull();
    expect(screen.queryByText(/null/)).toBeNull();
  });

  it('still renders a field with a real value + sourceText', () => {
    render(
      <SourceAttributionSection
        fields={[
          { label: 'Weight', value: { value: '2720 mt', confidence: 'confirmed', sourceText: '2,720mts' } },
        ]}
        originalEmail="2,720mts steel"
      />
    );
    expect(screen.getByText(/Source Attribution/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest components/match/__tests__/SourceAttributionSection.test.tsx --maxWorkers=1 --no-coverage --ci --forceExit`
Expected: FAIL — the null-valued field passes the current `f.value.sourceText` filter, so the section renders and `queryByText(/Source Attribution/i)` is non-null.

- [ ] **Step 3: Write minimal implementation**

In `components/match/SourceAttributionSection.tsx`, line 29:

```tsx
  const attributableFields = fields.filter(f => f.value.sourceText && f.value.value != null);
```

In `app/match/[id]/page.tsx`, line 378 (upstream guard so the `"null mt"` string is never even constructed):

```tsx
                      ...(cargo.weightMt != null && cargo.weightMt.value != null ? [{ label: 'Weight', value: { ...cargo.weightMt, value: `${cargo.weightMt.value} mt` } }] : []),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest components/match/__tests__/SourceAttributionSection.test.tsx --maxWorkers=1 --no-coverage --ci --forceExit`
Expected: PASS — `Tests: 2 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/match/[id]/page.tsx components/match/SourceAttributionSection.tsx components/match/__tests__/SourceAttributionSection.test.tsx
git commit -m "fix(match): hide null-valued ConfidenceField in Source Attribution (#1021)"
```

---

## Risk — reading the frozen clock in `create-demo-session` init context

**Flagged per dispatch.** `now()` (clock.ts:17-22) calls `getDemoFrozenDate()` which **throws** (`'demo_seed_meta has no row — run scripts/demo-seed/build.ts'`) when the demo seed row is missing, and unlike `demoNow()` it has **no** env/hardcoded fallback. Today `create-demo-session.ts:94 new Date()` never throws. Task 2 therefore introduces a new failure mode: in `DEMO_MODE=true` with an unseeded DB, `createDemoSession()` → `now()` → throw → `/api/sample` returns 500 instead of a session.

Mitigations (in order of preference; implementer + reviewer decide, do not silently expand scope):
1. **Accept + verify seed ordering (default).** `createDemoSession()` has exactly one caller — `app/api/sample/route.ts:21`, a request handler that runs after deploy seeds `demo_seed_meta` (build.ts runs in `ops/scripts/deploy-quantika-demo.sh`). `getDemoFrozenDate` caches after the first successful read, so the app's existing `now()` calls warm it. Implementer must confirm the deploy seeds the row before serving `/api/sample` (grep the deploy script for `demo-seed`).
2. **If seed ordering cannot be guaranteed:** use `new Date(demoNow())` instead of `now()` at line 94. `demoNow()` (clock.ts:39-50) returns the frozen date with a full fallback chain (DB → `DEMO_CLOCK` env → hardcoded `2026-05-28`) and never throws. Noon-vs-midnight is irrelevant because `rebaseParsedCargoes` floors to the UTC day (`dayFloor`). This deviates from the literal locked instruction (`now()`); if chosen, STOP and return `PLAN UPDATE NEEDED` for founder sign-off rather than swapping silently.

Out-of-scope guard: do **not** add the parser RC-A (European-dot) / RC-B (net-gross CBM) / RC-C scoring fixes from recon-1021 — those are Group B. This plan touches only the #1021 **display** tail.

---

## Behavioral test summary (dispatch requirements)

| Required behavior | Test | File |
|-------------------|------|------|
| No footnote on a rebased laycan | `preferredDates.sourceText` is `undefined` after shift/spot rebase | `__tests__/sample-data/rebase-parsed.test.ts` |
| Session-init uses one (frozen) clock | rebased laycans anchor to mocked `2026-05-28`, not real wall-clock | `__tests__/sample-data/create-demo-session-clock.test.ts` |
| Quote no longer says "elapsed" | system prompt contains `nowIso` + "do not describe … elapsed" | `lib/quote-jobs/__tests__/prompt.test.ts` |
| No literal `null` leak | null-valued field hidden, no `[¹]`, no "null" text | `components/match/__tests__/SourceAttributionSection.test.tsx` |

---

## Acceptance criteria per issue

### #1024 — Synthesized laycan carries false `[¹]`
| Criterion | Plan coverage |
|-----------|---------------|
| Drop `[¹]` from synthesized dates (or show true source) | Task 1 nulls `preferredDates.sourceText` at the rebase source → the page's laycan field (page.tsx:381-385) receives `sourceText: undefined` → `SourceAttributionSection` filters it → no `[¹]`. `.value` retained for display. |
| Coordinate with #1018 (single source of truth for "now") | Task 2 unifies `create-demo-session` onto `now()`. |

### #1018 — Quote says laycan "has elapsed"
| Criterion | Plan coverage |
|-----------|---------------|
| Quote treats fresh future laycan as active (not elapsed) | Task 3 injects the frozen date into the system prompt with an explicit "do not call on-or-after dates elapsed" instruction. |
| Single frozen "now" shared with engine | Task 2 (session-init) + Task 3 (`today()` from `lib/clock`) both read the same frozen clock. |

### #1021 — null cargo qty leaks as `null mt[¹]` (display tail only)
| Criterion | Plan coverage |
|-----------|---------------|
| `null` must render as "not stated", never `null mt` | Task 4 page guard never builds `"null mt"`; section filter hides null-valued fields. |
| When qty truly absent, don't footnote it `[¹]` | Task 4 section filter requires `value.value != null`. |
| (Parser: capture CBM / dot-thousand MT) | **Out of scope (Group B)** — display tail only. Issue stays **open**; PR does not `Close #1021`. |

> PR body: `Closes #1024`, `Closes #1018`. **Do not** `Close #1021` (only its display tail is fixed here).

---

## Self-Review

1. **Spec coverage:** Each of the four locked decisions maps to a task (1→Task 1, frozen-clock→Task 2, quote-inject→Task 3, #1021 display tail→Task 4). All three required behavioral tests are present.
2. **Placeholder scan:** No TBD/"handle edge cases"/"add validation" — every code step shows full code.
3. **Type consistency:** `nowIso?: string` defined in `BuildArgs` and consumed in `buildQuotePrompt` + passed by `worker.ts`. `dropLaycanSource` returns `ParsedCargo['preferredDates']` (= `ConfidenceField<string> | null`); `sourceText?` optional so `undefined` is valid. `value.value != null` guard matches `ConfidenceField.value: T`.
4. **PI3:** No existing test expectation is rewritten. Task 3 injects into `system` to leave the `user`-prompt inline snapshot intact. New tests are additive.

---

## Before using any Next.js/React API introduced or changed after v14 — WebFetch the relevant `nextjs.org`/`react.dev` docs page first.

This plan touches no new/unstable Next.js or React API: server-component edits are plain JSX guards, the client component uses existing `useState`, and tests use `@testing-library/react`. No WebFetch required for these specific edits.
