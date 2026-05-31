# Matches Bucket Tabs (Wave B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development per task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Surface the two realism buckets (`lowConfidenceMatches`, `insufficientData`) on `/matches` as two extra tabs alongside the main match list, with counters and empty states.

**Architecture:** Buckets live on `SessionData` as `Match[]` (set by `POST /api/ai/match` → `updateSession`), are NOT persisted to the matches table (see `compute-matches.ts:43-50`). The server component `app/matches/page.tsx` already holds the session, so we convert the two buckets to `StoredMatch`-shaped rows (synthetic negative ids, no DB write) via a new pure helper and thread them as props to `MatchesClient`. The client renders a 3-tab bar; the existing main list stays bound to `filtered` (test contract), bucket tabs render a read-only variant of the same card.

**Tech Stack:** Next.js App Router (RSC + client component), TypeScript, Jest (source-regex + unit), Tailwind.

**Design (agreed, do not change):** 3 tabs — «Матчи (N)» / «На проверку (M)» / «Мало данных (K)». N=main matches, M=lowConfidenceMatches, K=insufficientData. Reuse the match card. Empty tab → empty state.

**Documented assumptions (founder not at terminal):**
- Bucket items are advisory and NOT in the DB → the bucket card is **read-only**: no `/match/[id]` link, no Save/Dismiss/Archive, no checkbox. (DB-backed actions would 404 on synthetic ids.) Threading them as props is enough to satisfy the acceptance criteria.
- Buckets are threaded server-side (page → client props), NOT via `/api/matches` (which serves the persisted shortlist only). The SSE refetch keeps updating the main list; buckets are the server-render snapshot. Matches the `compute-matches.ts` rationale.
- Main-list test contract forces the card markup to stay inline in `filtered.map((match) => …)`; therefore bucket cards are a separate read-only block rendered AFTER the main block (keeps first `<Link>` after `filtered.map`).

---

### Task 1: `toBucketRows` helper (Match[] → StoredMatch[] display rows)

**Files:**
- Create: `lib/matching/session-buckets.ts`
- Test: `__tests__/matches-buckets.test.tsx` (unit block)

- [ ] **Step 1: Failing unit test** — `toBucketRows` maps `cargoEmailId→cargo_id`, clamps score, assigns synthetic NEGATIVE ids, defaults missing cargo/vessel to nulls.
- [ ] **Step 2:** run, expect FAIL (module missing).
- [ ] **Step 3:** implement `toBucketRows(matches, cargos, vessels, idStart=-1): StoredMatch[]` mirroring the enrichment in `persist-session-matches.ts` (laycan/port-distance/tce), but returning in-memory rows with `id: idStart - i`, `status: 'shortlist'`, `user_id: null`, `created_at/updated_at: 0`.
- [ ] **Step 4:** run, expect PASS.
- [ ] **Step 5:** commit.

### Task 2: Thread buckets through `page.tsx`

**Files:**
- Modify: `app/matches/page.tsx`
- Test: `__tests__/matches-buckets.test.tsx` (page block — source regex)

- [ ] **Step 1:** failing source test — page imports `toBucketRows`, reads `session.lowConfidenceMatches` / `session.insufficientData`, passes `lowConfidenceMatches`/`insufficientData` props to `MatchesClient`.
- [ ] **Step 2:** run, expect FAIL.
- [ ] **Step 3:** implement: compute `lowConfidenceMatches` (idStart -1) and `insufficientData` (idStart -1_000_000) via `toBucketRows`, pass as props.
- [ ] **Step 4:** run, expect PASS.
- [ ] **Step 5:** commit.

### Task 3: Tab bar + bucket render in `MatchesClient.tsx`

**Files:**
- Modify: `app/matches/MatchesClient.tsx`
- Test: `__tests__/matches-buckets.test.tsx` (client block — source regex)

- [ ] **Step 1:** failing source tests — props `lowConfidenceMatches`/`insufficientData`; `activeTab` useState; three `data-testid="tab-matches|tab-review|tab-insufficient"` buttons with labels «Матчи»/«На проверку»/«Мало данных» and counters; bucket empty-state text «Нет пар на проверку»; main block guarded by `activeTab === 'matches'`; existing `const filtered = matches` + `filtered.map((match)` preserved.
- [ ] **Step 2:** run, expect FAIL.
- [ ] **Step 3:** implement: add optional props (default `[]`), `Tab` type + `activeTab` state, tab bar (always visible), wrap existing filter+list in `{activeTab === 'matches' && (…)}`, add read-only bucket block for the other two tabs reusing card classes.
- [ ] **Step 4:** run, expect PASS.
- [ ] **Step 5:** commit.

### Task 4: Full regression + review

- [ ] Run `NODE_OPTIONS='--max-old-space-size=8192' npm test` (single parallel). Known foreign flake: `scripts/progonq/score-classify`.
- [ ] requesting-code-review → verification-before-completion.
- [ ] finishing-a-development-branch → draft PR to main, note **visual-preview needed** (Gate 3).

---

## Self-Review
- Spec coverage: 3 tabs (Task 3) ✓ counters (Task 3) ✓ bucket data reaches UI (Tasks 1–2) ✓ main list intact (Task 3 keeps `filtered`) ✓ empty state (Task 3) ✓ reuse card (read-only variant, same classes) ✓.
- No placeholders: all steps have concrete files + behavior.
- Type consistency: `toBucketRows` returns `StoredMatch[]`; props typed `StoredMatch[]`; `Tab = 'matches' | 'review' | 'insufficient'`.
