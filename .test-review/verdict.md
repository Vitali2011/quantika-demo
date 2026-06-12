VERDICT: APPROVE-WITH-FOLLOWUPS
Branch: feat/wave-c-engine-logic
HEAD: 13029428
Base: main e9070fe2
Date: 2026-06-12 (test-skill v0.4.2, adversarial, cold-start)

# Test Review Verdict: wave C engine-logic (audit C.1-C.8)

## Severity gate

- CRITICAL: none.
- HIGH introduced: none.
- MEDIUM: F1 (bucket React key item-awareness is a no-op - toBucketRows feed gap;
  UI-only, deterministic repro, collision itself pre-existing).
- LOW-MEDIUM/LOW: F2 (new Group A regex false positives), F3 (quantity clamp asymmetry),
  F4 (Infinity durationDays).
- INFO: F5 (item-blind slugs), F6 (stale regen logs), F7 (seed-builder writers).

No blocker per gate (CRITICAL, or HIGH introduced). Pre-existing failures: 8 suites / 16
tests byte-identical base vs branch; blast-radius carve-in examined for the economics /
imsbc / ballast suites - none of those failures touch values this branch changes.

## Evidence

- All 8 sanctioned changes verified implemented (not trusted from the plan): code read +
  suites green: lib/matching 88 suites/1663 tests, lib/economics + tests/unit/economics +
  canal/voyage/hold/realism 28 suites/299, __tests__ economics/matching/migration 49
  suites/378, tests/regression 56 suites: 722 passed / 16 pre-existing failed.
- tsc --noEmit clean.
- 3 new regression suites added by review (14 tests, green):
  - tests/regression/matches-item-unique-migration-051-prodshape.test.ts (data-contract:
    in-place upgrade of a prod-shaped 050 DB, zero loss, index swap, down() dedup)
  - tests/regression/session-buckets-item-key.test.ts (F1 pin)
  - tests/regression/imsbc-groupA-regex-phrasing.test.ts (F2 pin + guard locks)
- 23 scratch probes (readiness lattice, class boundaries, basin lattice, clamp asymmetry,
  Infinity duration) executed and removed; results folded into findings.

## Followups (non-blocking, ordered)

1. F1: populate item indices in toBucketRows OR key bucket <li> by row.id (one-line).
2. F2: clause-bound GROUP_A_RESTRICTION_RE gap + widen acceptance lookahead.
3. F3: clamp negative quantityMt in computeTce (parity with rate clamp).
4. F4: .finite() on durationDays and distanceNm zod fields.
5. F5: item-aware slug format or db-id links on cargo/vessel pages.
6. F6/F7: stale regen log copy; seed-builder one-per-pair dedup comment - on next touch.

## Deploy Gate (check after merge+deploy, before declaring done)

1. Migration 051 auto-runs at service start (lib/session-store.ts:51) on BOTH prod DBs
   (sessions.db, demo-seed.db at /root/quantika-demo/data/). Verify post-restart:
   `SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1` = 51 and
   PRAGMA index_list('matches') shows idx_matches_unique_pair_item (unique) and NOT
   idx_matches_unique_cargo_vessel_user. journalctl for migration errors on first boot.
2. Stored prod matches are STALE relative to C.1/C.3/C.4/C.6/C.7/C.8 until regen: Bosporus
   fees missing on Black Sea exits, hold-blocked pairs still on main board, 90-100k DWT
   capesize economics, back-of-window 'ideal' verdicts, integer economics factor.
   Founder-authorized prod regen required (--dry first per protocol; expect material
   diffs: Bosporus fee per leg shifts TCE on every Black Sea route; small coasters can
   drop below breakeven - the realism-bucket fixture rewrite in this branch demonstrates).
3. After regen: match count may INCREASE (second items unlocked); smoke /matches (no 500,
   no React duplicate-key console spam on review tab - F1 risk), /match/<slug> resolves,
   dashboard priority cards link to per-item /match/<id>.
4. No NEXT_PUBLIC_* changes - no env/rebuild coupling beyond standard build.

## Attack plan execution

Executed: A1 (base/branch differential), A2 (migration data-contract test), A3 (regex
fuzz), A4 (cross-writer trace incl. unplanned writers build.ts/patch-fit/real-matches/
hydrate-demo-session/api-matches-POST), A5 (clamp probes), A6 (bucket key repro), A7
(Infinity probe), A8 (slug trace), A9 (clobber - via branch tests + code read), A10
(readiness lattice), A11 (class boundaries), A12 (Suez caller grep + suites), A13 (NT
grep), A14 (basin lattice), A15 (tsc + battery), A16 (stale-pin sweep via full battery).
Skipped: none. Browser-level verification of /matches multi-item rendering skipped
(no preview env; covered by Deploy Gate item 3).

---

## Controller addendum — followups resolved (HEAD 4ddb9b63)

All five findings fixed on-branch before merge, QA pin tests flipped to desired behaviour:

- F1: toBucketRows emits cargo_item_index/vessel_item_index (session-buckets.ts) AND MatchesClient keys bucket rows by unique row id (tests/regression/session-buckets-item-key.test.ts flipped, green).
- F2: GROUP_A_RESTRICTION_RE window clause-bounded ([^.;,]) + cannot/can't carry|load|accept verbs; comma-list miss documented as conservative [BEHAVIOR] pin (tests/regression/imsbc-groupA-regex-phrasing.test.ts flipped, green).
- F3: quantityMt clamped to >= 0 in computeTce (test added).
- F4: durationDays + distanceNm get .finite() — JSON 1e999/Infinity now 400 (test added).
- F5: regen log copy updated (item-pair dedup wording; cleanliness counter explained per audit C.4).
- F6/F7 (INFO): recorded as wave follow-ups, not blocking — slug links item-blind (deterministic-best), legacy seed-builder writers keep coarse semantics (superseded by regen step 5/6).

Verdict effective: APPROVE (followups consumed). Deploy Gate section unchanged — items 1-3 remain mandatory post-deploy.
