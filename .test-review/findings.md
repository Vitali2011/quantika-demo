# Findings: feat/wave-c-engine-logic

Branch: feat/wave-c-engine-logic
HEAD: 13029428
Phase 3 completed: 2026-06-12

All sanctioned spec changes C.1-C.8 verified implemented correctly (see discovery.md);
none re-reported below. Findings are defects in or around the new code.

## F1 - MEDIUM - Item-aware bucket React key is a no-op: feed never carries item indices

Files: lib/matching/session-buckets.ts:92-117 (feed), app/matches/MatchesClient.tsx:393 (binding)
Class: displayed-value-provenance / half-landed C.5 consumer.

The branch rewrote the bucket <li> key to cargo_id|cargo_item_index??0|vessel_id|vessel_item_index??0
with a comment claiming items of one email pair now get distinct keys. But review/insufficient
tabs render rows from toBucketRows, which builds StoredMatch objects WITHOUT
cargo_item_index/vessel_item_index -> every row degrades to |0| -> two items of the
same email pair collide exactly as the old 2-part key did. The collision predates the
branch, but the branch's stated fix for it is ineffective (half-landed-change carve-in),
and C.4 makes the trigger common: hold-cleanliness demotes ALL items of a dirty-hold
vessel pair to 'weak' -> they co-occupy the review bucket.

Impact: React duplicate-key warning + mis-recycled DOM between two distinct bucket cards.
No data corruption.
Repro: tests/regression/session-buckets-item-key.test.ts (pinned [BEHAVIOR], green - flips when fixed).
Fix direction: toBucketRows sets cargo_item_index: m.cargoItemIndex ?? 0 and vessel likewise,
or key by row.id (synthetic negative ids are already unique; main list at :696 already keys by id).

## F2 - LOW-MEDIUM - GROUP_A_RESTRICTION_RE over-blocks acceptance/unrelated phrasing

File: lib/sailing/imsbc-check.ts:279 (new regex, this branch)
Class: input-fuzz / regex.

The negative lookahead guards only the IMMEDIATE word after "no", and the .{0,40}? gap
freely crosses clause/sentence boundaries. Confirmed false positives (verdict
incompatible -> checkImsbc hard gate -> pair removed from the board):
- "no cargo restrictions, concentrates welcome" (acceptance)
- "no DG cargoes. TML certificate on board" (DG-only ban + TML cert, bridges across the sentence)
- "no grabs, holds suitable for concentrates" (gear statement)
Confirmed false negatives (conservative miss, stays caution): "cannot carry concentrates",
"concentrates not accepted".

Impact: lost matches on vessels that explicitly accept Group A; tail-case phrasings, but
vessel restrictions are free-text parses so clause-mixing is realistic. DG_RESTRICTION_RE
has the same structural weakness (pre-existing); the NEW surface here is introduced by this branch.
Repro: tests/regression/imsbc-groupA-regex-phrasing.test.ts (pinned).
Fix direction: clause-bound the gap ([^.;]{0,40}?) and widen the lookahead (grabs?,
cargo\s+restrictions), or require the hazard token in the same clause.

## F3 - LOW - C.8 clamp asymmetry: negative quantityMt still yields negative gross freight

File: lib/economics/compute-tce.ts:136-138
rate is clamped >=0 (audit C.8), quantity is not: computeTce({quantityMt: -50000,
freightRateUsdPerMt: 20, ...}) -> gross_freight_usd < 0 (verified by probe). Same
nonsense-input class the audit fix targets. One-liner: Math.max(0, safeNum(inputs.quantityMt)).

## F4 - LOW - durationDays accepts Infinity: .positive() without .finite()

File: app/api/voyage/tce/route.ts:86
Raw JSON {"durationDays":1e999} parses to Infinity, passes z.number().positive(),
returns HTTP 200 with degenerate economics (verified: status 200). C.2's "no silent $0
voyage" is closed for 0/negative but not non-finite. distanceNm next to it has the
identical pre-existing hole. Unreachable from the UI (duration computed >= 2); only
hand-crafted requests. Fix: .positive().finite() on both fields.

## F5 - INFO - Slug links cannot address the new second item rows

app/cargo/[id]/page.tsx:341, app/vessel/[id]/page.tsx:213,
components/dashboard/ActionPanel.tsx:65 link via toMatchSlug(cargoEmailId, vesselEmailId),
item-blind. Two visible item matches link to ONE detail URL; getMatchBySlug now
deterministically returns the best-fit row, so the lesser item's card opens the best
item's detail. NOT a regression (pre-051 only one row existed - same landing), and the
dashboard priority-card path was correctly made item-aware (links /match/<dbId>).
Follow-up: extend the slug with item indices or prefer db-id links on cargo/vessel pages.

## F6 - INFO - Stale regen console copy after C.4/C.5

scripts/demo-seed/regenerate-matches.ts:683 log header still says "deduped to email-pair";
the "dropped main cleanliness-blocked" counter (:687) is now structurally 0 because C.4
demotes those pairs to lowConfidenceMatches before regen ever sees result.matches.
Logs only, no behavior impact.

## F7 - INFO - Seed-builder writers keep one-per-email-pair semantics

scripts/demo-seed/build.ts:710-752 (comment + best map keyed cargo_id|vesselId),
patch-fit.ts:357, real-matches.ts:91 - local-only seed tools not in the plan's writer
list. Their output remains VALID under the finer index (coarser uniqueness is compatible),
just produces fewer matches than founder C.5 intent. Update when next touched. The
canonical prod write paths (persist, compute-matches, regen, hydrate) are all item-aware; verified.

## Verified non-findings (attack surface cleared)

- Migration 051 data-contract: prod-shaped DB (chain to 050 + NULL-user seed rows +
  sentinel buckets + session rows, all item idx 0) upgrades in place: coarse index dropped
  (name matches 034 exactly), unique item-aware index created, zero row loss, second-item
  insert unlocked, same-item dup still ignored, COALESCE(NULL user) branch enforced,
  runner records v51, down() dedups to MIN(rowid).
  Test: tests/regression/matches-item-unique-migration-051-prodshape.test.ts.
  Prod invocation point confirmed: lib/session-store.ts:51 runs the chain at store init.
- refreshComputedColumns cross-item clobber: removed SET of identity columns + item-aware
  WHERE verified by branch tests - green.
- Cross-writer consistency: persist (item-aware dedup), compute-matches (passes indices),
  regen (explicit item columns + item-aware pass-1), hydrate-demo-session (reads
  cargo_item_index ?? 0 into Match) - all agree. api/matches POST defaults to item 0
  (pre-existing manual path, consistent).
- C.1 wiring: one exported helper feeds both buildMatchEconomics (laden+ballast) and the
  detail route (laden+ballast legs, route.ts:263/277) - list/detail parity holds. Basin
  lattice probed: blacksea to med/atlantic/indian/eastafrica/westafrica charge;
  intra-basin/unknown do not; Suez+Bosporus co-charge on blacksea-indian as intended.
- C.6: explicit-range boundaries (65k -> supramax via entry order, 90k -> panamax) and
  fallback edges (14999, 42k, 90001, 99999, 450k) all correct; breakevenTceByDwt is
  pure-DWT (no class hole); ballast radius + bunker defaults consume the fixed classifier.
- C.7: lattice probed - midpoint exact -> ideal (strict > w/2), depth 6/10 -> tight, last
  in-window day -> tight, past cancelling -> late, w=0 unchanged, spot branch untouched;
  new "into the laycan window" explanation only for non-spot gapDays < -1.
- C.8 Suez: no production caller passes vesselValueUsd (grep: only _quoteSuezSafe + canal
  router; both API routes build SuezInput without it) -> totalUsd change latent-only as
  claimed; scntFeeUsd already contains base_fee so totalUsd=scntFeeUsd is complete dues;
  no remaining test couples totalUsd to warRiskUsd (suites green).
- NT 0.65: no residual dwt*0.6 anywhere in app/lib/components (last 0.6 hit is an
  unrelated freight-confidence constant, tce-calculator.ts:93).
- Pre-existing failures parity: 8 suites / 16 tests fail IDENTICALLY on base e9070fe2 and
  branch (suite lists byte-identical; branch adds 1 passing test). Blast-radius carve-in
  checked: the economics failures live in calculateWarRiskPremium/calculateEuEts
  (untouched), imsbc_section_size_cap is the knowledge-scraper fetch cap (untouched),
  ballast :273 failure is the score-65 guard pin with identical signature pre/post.
  None carve in.
