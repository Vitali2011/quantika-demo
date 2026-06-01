# Plan: Cargo laycan — unify format via structural dates + fix stale-year rebase (Pravka 3)

## Context
/cargo list (app/cargo/page.tsx:65 builds `laycan: cargo.laycan ?? null`) passes the RAW `cargo.laycan` (ConfidenceField<string>) to the row -> inconsistent display ("2026-06-02 to ...", stale "June 2019", "—"). The /matches list formats via lib/utils/fmt-laycan.ts `fmtLaycan(start,end)` (Unix-SECONDS -> "Jun 2-Jun 9"). Two roots: (a) cargo renders raw text, not structural dates; (b) some cargo have STALE structural dates ("June 2019") because scripts/demo-seed/build.ts + patch-fit.ts rebase only SOME cargo to NOW+N.

## Goal
/cargo shows ALL laycan in the same format as /matches (via fmtLaycan on structural dates), no past years, no raw text; "—" only for genuinely empty.

## Scope (Tier M, risk-override = date-parsing)
- `app/cargo/page.tsx` + the cargo list render path (CargoClient / row renderer): render laycan via `fmtLaycan(laycanStart, laycanEnd)` on STRUCTURAL dates (Unix seconds). If structural dates are absent on the cargo object -> parse the raw `cargo.laycan` string via `lib/sailing/date-parsing.ts` -> start/end -> fmtLaycan. "—" only when genuinely empty. (First INVESTIGATE whether the cargo object already carries structural laycan start/end; if not, that is the date-parse fallback case.)
- `scripts/demo-seed/build.ts` + `scripts/demo-seed/patch-fit.ts`: find WHY some cargo structural laycan dates are not rebased to NOW+N (stale "June 2019"); fix the rebase so ALL demo cargo get current-year dates.

## CODE vs REGEN boundary (CRITICAL — do not cross)
- This PR = CODE ONLY: the render fix + the build.ts/patch-fit.ts rebase-logic fix.
- Do NOT run the demo-seed regeneration and do NOT modify demo-seed.db. Applying the rebase to the live seed is a SEPARATE founder-gated step (regen #2, combined with the Econ speed/consumption rebase). The render fix improves display immediately for cargo that already have correct structural dates; cargo with stale structural dates clear only after regen #2.
- You MAY run build.ts in a DRY / temp-output mode to VERIFY your rebase fix covers all cargo, but never against the real data/demo-seed.db.

## Out-of-scope
- Do NOT change matching / sorting / dedup logic.
- Do NOT touch the incoming-email parser (lib/parsing/*) — only the demo seed-gen scripts + cargo render.
- Do NOT change `fmtLaycan`'s signature in lib/utils/fmt-laycan.ts (it is shared with /matches — keep stable). Add a helper if needed.
- Do NOT touch EconomicsTab / voyage / match-page files (other in-flight work).

## Risk-override -> /test-skill (MANDATORY)
date-parsing is risk-override. After impl is green, run adversarial QA (write adversarial tests) covering the raw-text parse fallback across formats: "2026-06-02 to 2026-06-09", stale "June 2019", "Jun 2-9", single date, range with year, empty -> "—", malformed -> graceful (no crash, "—" or best-effort). Require an explicit final line <<EXIT_STATUS=PASS>> or <<EXIT_STATUS=FAIL>>.

## Acceptance
- /cargo laycan all one format (matching /matches) for cargo with structural dates; date-parse fallback for the rest; "—" only truly empty; no raw "2026-06-02 to ..." text leaking through.
- build.ts/patch-fit.ts rebase logic now covers ALL cargo (verified via DRY/temp build run, NOT against prod seed).
- /test-skill PASS; npx tsc --noEmit + npm run lint clean.
- PR body MUST note: "stale-year display fully clears only after the founder-gated regen #2 (this PR fixes the render + the rebase logic; the seed itself is regenerated separately)."
UI-PR -> Gate 3 (founder prod Gate 5).
