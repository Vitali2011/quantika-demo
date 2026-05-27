# Clock Callsite Audit (Task 5 artifact)

Generated: 2026-05-27
Branch: design/demo-frozen-snapshot

Scope grep:
- lib/freshness.ts
- lib/matching/**
- lib/sailing/**
- lib/deadlines/**
- lib/auto-prequote/**         (exists)
- app/api/matches/**           (no matches / may not exist)
- app/api/processing/**        (no matches / may not exist)

Total `new Date()` occurrences: 14
SHIFT (to be swapped in Task 6): 9
KEEP (real-time, do not touch): 5

## SHIFT callsites

| File:Line | Snippet | Rationale |
|---|---|---|
| lib/freshness.ts:68 | `return new Date() > expiry;` | Core staleness check — drives "is this item expired" in demo; must use frozen clock |
| lib/matching/reason-enricher.ts:61 | `new Date().getFullYear() - ctx.vesselBuilt` | Computes vessel age in years for match reason display; in frozen demo this should reflect frozen year, not wall-clock year |
| lib/matching/pair-analyzer.ts:177 | `const today = options?.today ?? new Date();` | Default "today" for O(n²) pair analysis loop (laycan gap, readiness scoring); must use frozen clock |
| lib/sailing/date-parsing.ts:99 | `refYear: number = new Date().getUTCFullYear(),` | Default refYear for `parseVesselOpenDate`; used to resolve partial dates like "5 Sep" to a full ISO date |
| lib/sailing/date-parsing.ts:100 | `today: Date = new Date(),` | Default today for `parseVesselOpenDate`; resolves "TODAY/spot/prompt" keywords to a concrete date |
| lib/sailing/date-parsing.ts:173 | `refYear: number = new Date().getUTCFullYear(),` | Default refYear for `parseLaycan`; same partial-date resolution logic |
| lib/sailing/readiness-gap.ts:172 | `const refYear = opts.refYear ?? new Date().getUTCFullYear();` | Fallback refYear for `calculateReadinessGap`; downstream of pair-analyzer |
| lib/sailing/readiness-gap.ts:173 | `const today = opts.today ?? new Date();` | Fallback today for `calculateReadinessGap`; core freshness/readiness computation |
| lib/deadlines/subs-guardian.ts:44 | `now: Date = new Date(),` | Default `now` for `computeStage`; computes remaining-time-to-deadline; in frozen demo all deadlines should be evaluated against frozen clock |

## KEEP callsites

| File:Line | Snippet | Rationale |
|---|---|---|
| lib/deadlines/subs-guardian.ts:75 | `now: Date = new Date(),` | Default `now` for `processDeadline`; delegates immediately to `computeStage(deadline.deadlineAt, now)` — shares the same injectable `now` param. **However**: this is the notification dispatch path (real side-effect), so real-time dispatch is correct. Flag: see Notes. |
| lib/auto-prequote/pipeline.ts:32 | `(opts.now ?? new Date()).toISOString()` | `startedAt` operational timestamp for pipeline run record; already has `opts.now` injection point — KEEP the default as real-time but the injection already satisfies demo |
| lib/auto-prequote/pipeline.ts:61 | `finishedAt: new Date().toISOString()` | Operational run-finished timestamp; audit/observability field, must use wall-clock |
| lib/auto-prequote/queue.ts:99 | `createdAt: new Date().toISOString()` | Draft queue entry creation timestamp; audit trail must use real time |
| lib/sailing/date-parsing.ts:72 | `(defaults to \`new Date()\`)` | Comment/JSDoc only — not executable code; no change needed |

## Notes

- **Ambiguous: lib/deadlines/subs-guardian.ts:75** — `processDeadline`'s `now` param and `computeStage`'s `now` param (line 44) are structurally identical injectable defaults. In demo mode, both staleness checks should use frozen clock. However `processDeadline` also dispatches real notifications (side-effect), which complicates the decision. Recommendation: SHIFT line 75 too (swap default to `now()` from `lib/clock.ts`) — demo will see frozen deadlines; real-time dispatch in non-demo mode is unaffected since `now()` returns `new Date()` when not in demo mode. **Flag for human review before Task 6.**

- **auto-prequote/pipeline.ts:32** — already has `opts.now` injection point; the `new Date()` is only the fallback. If demo needs to freeze pipeline `startedAt`, inject at call site rather than changing the default. Low priority.

- **lib/sailing/date-parsing.ts:99 and :173** — these are function signature defaults. The codemod must target the default value expressions, not the call sites (callers that pass explicit `refYear` are already correct).

- **`new Date(arg)` callsites with an argument** (not in scope of codemod, but noted): a quick scan of the grepped files shows `new Date(Date.UTC(...))` constructs in `date-parsing.ts` that construct specific dates from components — these are NOT `new Date()` wall-clock calls and must not be touched.
