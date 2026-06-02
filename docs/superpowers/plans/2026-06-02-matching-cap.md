# Matching: Top-N Cap + Overflow + Gearless Amber UI — Layer C

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Full TDD per task (failing test on REAL shapes → red → minimal impl → green → commit). Checkbox steps. **NOTE:** the gearless-amber task touches `.tsx` → this is a UI PR → orchestrator will run a PREVIEW gate before merge.

**Goal:** Surface only the few ironclad matches — top-3 per cargo by fit on the main board, the rest kept in DB but hidden (overflow); and stop showing green "OK" for gearless+breakbulk when port cranes are unverified (amber "confirm cranes").

**Architecture:** Add a per-cargo rank to stored matches (rank 1..N by fit, computed at persist time); main-board query/view surfaces rank ≤ 3, marks the rest `overflow` (hidden, not deleted). Separately, the cranes verdict in match UI turns amber for gearless+breakbulk+unverified-port. Conservative: changes are additive; existing saved/dismissed states preserved.

**Tech Stack:** TypeScript, `lib/matching/*` (compute/persist/repository), match board + detail `.tsx`, Jest + (UI) component test.

**Spec:** `docs/superpowers/specs/2026-06-02-matching-gates-cap-clean-data-design.md` (Layer C). **Prereqs merged:** Layer B (#764 gates), Layer A (#767 clean data).

**Scope (Layer C only).** Do NOT run the full regen or any prod-data write (separate final plan). Build + test the cap + UI; regen consumes it later.

---

### Task 0: Locate ranking/persist + board query + cranes-verdict UI (investigation, no code)
- [ ] `grep -rn "rank\|overflow\|status.*shortlist\|ORDER BY.*fit\|fitPercent" lib/matching/` → where matches are persisted/queried for the board (`persist-session-matches.ts`, `matches-repository.ts`, `compute-matches.ts`).
- [ ] Find the main-board list query + the match-detail Cranes verdict cell (`grep -rln "Cranes\|cranes\|Gearless\|✅ OK" app/ components/`).
- [ ] Record exact files in PR description. Commit nothing.

### Task 1: Per-cargo fit rank on stored matches
**Files:** Modify the persist site (Task 0); add a `rank` (per-cargo, 1-based by fitPercent desc) — migration if a column is needed (`lib/migrations/`), else computed field. Test: `lib/matching/__tests__/cargo-rank.test.ts` (new).
- [ ] Failing test (REAL shape): given 5 matches for one cargo with fitPercent [90,80,70,60,50] + matches for a 2nd cargo, ranking assigns 1..5 per cargo independently (rank resets per cargo), ties broken stably.
- [ ] red → impl → green → Commit: `feat(match): per-cargo fit rank on stored matches`

### Task 2: Top-3 surface + overflow-hidden on main board
**Files:** Modify board query/repository (Task 0) to surface `rank <= 3` by default and flag `rank > 3` as overflow (kept, not deleted); Test: extend repository test.
- [ ] Failing test: a cargo with 7 matches → board query returns 3 (ranks 1-3); the other 4 are retrievable but flagged overflow / excluded from default board; saved/dismissed matches are NOT hidden by the cap (explicit user state overrides).
- [ ] red → impl → green → Commit: `feat(match): main board shows top-3 per cargo, rest overflow-hidden`

### Task 3: Gearless + breakbulk + unverified port cranes → amber "confirm cranes" (not green OK)
**Files:** Modify the Cranes verdict cell (Task 0, `.tsx`) + any verdict-deriving helper; Test: component/unit test for the verdict.
- [ ] Failing test (REAL cases): geared=false + cargo breakbulk + port cranes unverified (null) → verdict = amber "Confirm cranes (load/disch)", NOT green "OK"; geared=true → green OK; gearless + bulk (not breakbulk) → unchanged (bulk terminals fine); gearless + port cranes confirmed true → green OK.
- [ ] red → impl → green → Commit: `fix(match-ui): gearless+breakbulk+unverified cranes shows amber, not green OK`

---

## Self-review (writing-plans)
- **Spec coverage (Layer C):** top-3 cap ✓(T1+T2), overflow-hidden ✓(T2), gearless amber ✓(T3). Task 0 locates exact sites.
- **Real shapes / edge cases:** per-cargo rank reset, ties, saved/dismissed override the cap, bulk-vs-breakbulk distinction for cranes.
- **UI PR note:** T3 touches `.tsx` → orchestrator runs PREVIEW_OPENED gate (screenshot the amber badge) before merge.
- **Out of scope:** full regen + prod-apply (final plan), SWL crane matching, Layer A/B (merged).

## Subsequent plan
- `Regen + prod` — regenerate demo dataset through fixed A+B+C pipeline; verify count drops to a few per cargo + zero surviving violations + reviewed/audited matches resolved; `--dry`-first prod apply (Rule #22), backup→dry→inspect→real→wal_checkpoint→restart→health; then Gate5 user-checklist (visible result on demo.quantika.org).
