# Economics-cluster fix plan — #819 / #820 / #821

**Date:** 2026-06-04
**Status:** PLAN (no code, no DB writes)
**Branch:** plan-econ-cluster (planning-only worktree)
**Author:** Sonnet 4.6 sub-agent dispatched by orchestrator-day
**Inputs:** `~/orchestrator-state/quantika-demo/recon-econ-r{1,2,3}.md`

---

## 0. TL;DR — what the recon told us, what changed when we looked again

The three open issues form one cluster because they share two structural enablers:

1. **The match-display layer mixes two TCE models that never agree** (stored
   round-trip + $600 bunker vs. live laden-only + DB bunker). Display reads one
   value for the headline and the other for "Net Voyage" — sign flip baked in.
   (#819)
2. **Session matches are hydrated from the seed `matches` table with the
   stored TCE and worksheet JSON carried verbatim** — `persistSessionMatches`
   prefers the canonical stored TCE and pass-throughs `worksheet_json`, so any
   staleness in the seed row recurs on every fresh session. (#819, #821)

The plan is split into three independently shippable phases (A → B → C).
Each has its own `--dry` contract, blast-radius statement, and rollback.

**A correction to the dispatch premise (verified 2026-06-04 against
`/tmp/prod-fresh-818.db`):** the Med/BlackSea VLSFO rows are NOT missing.
`bunker_prices` already contains live OilMonster rows for ESCEU, ITAUG,
CYLMS, EGPSD, ROCND (proxy), TRIST, GRPIR for 2026-06-02 → 06-04 (the
OilMonster cron landed via PR #756/#762/#768 and is running daily). So
Phase A1 (seed Med/BS rows) is **already in place**; what remains is
the SGSIN default in `EconomicsTab.tsx:75` and the async race against
`/api/voyage/bunker-recommendation` (the OilMonster cron does its job;
the UI never lets the recommendation reach the live P&L before SGSIN
gets used).

This correction does not invalidate the rest of the plan — A2 is still the
real #820 fix and we add A1 as a freshness watchdog instead of a seed-write.

---

## 1. Code anchors (verified against `plan-econ-cluster` worktree)

| Anchor | File:line | Behaviour |
|---|---|---|
| BUNKER_CANDIDATES (Med/BS hubs included) | `app/api/voyage/bunker-recommendation/route.ts:42-55` | ROCND/EGPSD/ITAUG/ESCEU/CYLMS/GIGIB present |
| Bunker rec null-price guard | `app/api/voyage/bunker-recommendation/route.ts:166` | drops candidate when `getLatestBunkerPrice()` returns null |
| Bunker port default (UI) | `components/match/EconomicsTab.tsx:75` | `useState<BunkerPort>('SGSIN')` |
| Bunker port default (API) | `app/api/voyage/tce/route.ts:235` | `(data.bunkerPort ?? 'SGSIN').toUpperCase()` |
| Stored TCE model | `lib/matching/tce-calculator.ts:24, ~190` | `DEFAULT_BUNKER_USD_PER_MT=600`, `durationDays = ladenDays*2 + 2` (round-trip) |
| Live TCE model | `lib/economics/voyage-calculator.ts:203` + `lib/economics/voyage-days.ts` | laden-only days; bunker $ from DB |
| Display headline (stored) | `components/economics/VoyageBreakdownChart.tsx:37` | `canonicalTceUsdPerDay ?? breakdown.daily_tce_usd` |
| Display Net Voyage (live) | `components/economics/VoyageBreakdownChart.tsx:76-77` | `breakdown.net_voyage_usd` |
| persistSessionMatches storedTce-override | `lib/matching/persist-session-matches.ts:64-71` | prefers `m.economics?.tceUsdPerDay` over the live recompute "to avoid the −$102k vs +$774 divergence" |
| persistSessionMatches worksheet pass-through | `lib/matching/persist-session-matches.ts:97` | writes `m.worksheet` verbatim into `worksheet_json` |
| hydrate-demo-session reads stored TCE + worksheet | `lib/demo-mode/hydrate-demo-session.ts:120-156` | rebuilds `Match` from seed rows, including `economics.tceUsdPerDay` from the persisted column and `worksheet` from `worksheet_json` |
| spot-ideal threshold | `lib/sailing/readiness-gap.ts:35` | `SPOT_IDEAL_MAX_GAP_DAYS = 30` |
| detectSpot | `lib/sailing/readiness-gap.ts:100` | `/\b(spot|prompt|promt)\b/i` |
| classifyVerdict (non-spot) | `lib/sailing/readiness-gap.ts:107-115` | ≤5d = ideal, ≤14d = idle, etc. |

---

## 2. Phase A — #820 bunker port (lowest risk, in-lane)

### Scope

The bunker P&L silently uses Singapore VLSFO whenever the bunker
recommendation hasn't responded yet, or when the user's vessel opens
somewhere the recommendation can't serve. For Marmara→Veracruz the
recommendation will return GIGIB (Gibraltar) or ESCEU (Ceuta) once
the basin filter + DB lookup completes (verified: both have a 2026-06-04
VLSFO row in `bunker_prices`). The race + the SGSIN literal default is
what produces the "defaults to Singapore" symptom.

### A1 — bunker price freshness watchdog (no DB write)

Skip the seed step the dispatch requested. The OilMonster cron is already
populating ESCEU/ITAUG/CYLMS/EGPSD/ROCND-proxy/TRIST/GRPIR/GIGIB rows; a
manual seed-write would be a duplicate at best and a freshness regression
at worst (cron rows are dated 2026-06-04, demo-seed would write whatever
the script picks).

What we ship instead: a one-line freshness check baked into the bunker
recommendation route handler — if the freshest VLSFO row for any
BUNKER_CANDIDATE port is more than `BUNKER_STALE_DAYS` old (default 7),
log a `bunker_price_stale` warning and (optionally) emit a single
`/api/admin/health` data point. No behavioural change for fresh data.

- **File:** `app/api/voyage/bunker-recommendation/route.ts` (or a small
  helper next to `getLatestBunkerPrice`).
- **Tests:** 2 unit cases — fresh row (no warn), 30-day-old row (warn);
  test must call the route handler, not just the helper (PI2).
- **Risk:** none (read-only, log-only).
- **Rollback:** revert single file.

### A2 — kill the SGSIN literal default and the async race

Two coupled edits:

1. `components/match/EconomicsTab.tsx:75` — replace
   `useState<BunkerPort>('SGSIN')` with `useState<BunkerPort | null>(null)`,
   gate the P&L call behind `bunkerPort != null`, and set it from the
   first successful `bunker-recommendation` response (lazy default). If
   the user manually picks a port we already preserve that via
   `bunkerPortManual` — leave that path untouched.
2. `app/api/voyage/tce/route.ts:235` — replace
   `(data.bunkerPort ?? 'SGSIN').toUpperCase()` with an explicit error:
   when `data.bunkerPort` is missing, return `400 bunker_port_required`.
   The UI no longer sends a missing value (A2.1 enforces it), so this is
   a hard contract — never call the live P&L with a guessed port.

This is the smallest fix that removes the silent SGSIN path. We do NOT
add nearest-hub auto-derive logic in this PR — that becomes a separate
follow-up if the recommendation endpoint proves insufficient.

- **Files:** 2 — `components/match/EconomicsTab.tsx`,
  `app/api/voyage/tce/route.ts`.
- **Tests (PI2):**
  - React behavioural test against `EconomicsTab` (RTL): mock
    `bunker-recommendation` to resolve to GIGIB, assert the live P&L
    request body contains `bunkerPort: 'GIGIB'`, not SGSIN.
  - API test for `/api/voyage/tce` (real `client.get/post`): missing
    `bunkerPort` → 400. Present → 200.
- **Tests (real value shapes, /test-skill cold pass):** drive both code
  paths with `bunkerPort = null`, `bunkerPort = ''`, `bunkerPort = 'sgsin'`
  (lowercase), `bunkerPort = 'XXXXX'` (unknown LOCODE). Must not regress
  into a fallback price lookup.
- **Risk:** medium — every match card that opens the Economics tab
  briefly shows "loading bunker port" until the recommendation responds.
  A timer test should confirm time-to-first-P&L stays ≤500ms on a warm
  recommendation cache.
- **Rollback:** per-file revert + redeploy. No DB change, no migration.

### A3 — verification matrix

| Pair | Expected default | Why |
|---|---|---|
| Marmara → Veracruz (SEAGULL 12) | GIGIB (~$747) or ESCEU (~$609) | EastMed→WestMed→AtlanticN corridor; both in basin, both have a VLSFO row |
| Hodeidah → Marmara (ballast leg of SEAGULL 12) | EGPSD (~$860) or AEFJR (~$1024 S&B) | Red-Sea egress; Singapore correctly blocked |
| Nemrut Bay → Liverpool (SEAGULL 48) | ESCEU/GIGIB | Med→Atlantic; not SGSIN |

For each row: open `/match/<id>` → wait for Economics tab → screenshot
shows `Bunker Port = <expected>`. The `Daily TCE` and `Net Voyage`
agreement is **NOT** part of A3 — that lives in Phase B.

### A — `--dry` contract

```bash
DB=/tmp/prod-fresh-$(date +%s).db
cp /tmp/prod-fresh-818.db "$DB"

# 1. Confirm price rows already exist for all BUNKER_CANDIDATES (no seed needed).
sqlite3 "$DB" "
  SELECT port_unlocode, fuel_grade, source,
         price_usd_per_mt, price_date
    FROM bunker_prices
    WHERE port_unlocode IN ('ESCEU','ITAUG','ROCND','CYLMS','EGPSD','GIGIB','TRIST','GRPIR','SGSIN','NLRTM','AEFJR')
      AND fuel_grade='VLSFO'
      AND price_date >= date('now', '-7 days')
    ORDER BY port_unlocode, price_date DESC;
"

# 2. Parity guard — no column the old seed filled becomes empty.
sqlite3 "$DB" "
  SELECT
    SUM(CASE WHEN price_usd_per_mt IS NOT NULL THEN 1 ELSE 0 END) AS price_nonnull,
    SUM(CASE WHEN price_date IS NOT NULL THEN 1 ELSE 0 END)       AS date_nonnull,
    SUM(CASE WHEN source IS NOT NULL THEN 1 ELSE 0 END)            AS source_nonnull,
    COUNT(*) AS total
    FROM bunker_prices;
"

# 3. Hit the recommendation endpoint after building the patched code.
curl -s 'http://localhost:3000/api/voyage/bunker-recommendation?from=TRMAR&to=MXVER' | jq '.recommendation, .port'
# Expected: a Med hub (GIGIB or ESCEU), NOT 'SGSIN'.

# 4. Hit the TCE endpoint without a bunkerPort — must return 400.
curl -s -o /dev/null -w '%{http_code}\n' -X POST 'http://localhost:3000/api/voyage/tce' \
  -H 'content-type: application/json' -d '{"route":{"fromPort":"TRMAR","toPort":"MXVER"}}'
# Expected: 400
```

### Apply sequence (Rule22, MacBook → prod, NOT dev-vps → prod)

Code-only change in Phase A. No DB patch.

1. `git fetch && git checkout main && git pull` on prod host.
2. `npm ci && npm run build` (`NEXT_PUBLIC_*` re-bake — see CLAUDE.md).
3. `sudo systemctl restart quantika-demo.service` (NOT `pm2 restart` —
   prod uses systemd per dispatch note; CLAUDE.md's pm2 reference is stale
   for prod). `pm2` calls in the existing apply-to-prod.md runbooks
   apply to dev-VPS only.
4. `curl http://localhost:3000/api/health` returns 200.
5. Founder visual verify per A3 matrix.

### Rollback

`git revert <merge sha> && npm run build && sudo systemctl restart quantika-demo.service`.

---

## 3. Phase B — #819 honest TCE headline (single-display source)

### Scope

The card shows `Daily TCE = +$21,066/day` and `Net Voyage = -$19,xxx`
on the same voyage. The two numbers come from two pipelines that share
neither duration model nor bunker price. The simplest fix that respects
the "owner default sort = tce" behaviour is to make the display read
ONE number and recompute the other only for diagnostics.

### B1 — decision: display-only patch vs. stored-column recompute

Two options were considered:

| Option | What it does | Blast radius | Pro | Con |
|---|---|---|---|---|
| (a) **Display-only** — headline reads `breakdown.daily_tce_usd` (live, voyage-calculator) | Drop `canonicalTceUsdPerDay` from `VoyageBreakdownChart.tsx:37`; keep the stored column for sort/list views | TINY. Only the match-detail Economics tab is touched. List card, table cell, TCE sort all read `match.tce_usd_per_day` (the stored column) unchanged. | One-file patch. No DB write. Reversible in 1 commit. List ranking unchanged (broker-day-1 view stays stable). | List card still shows stored value (+$21,066) while the detail panel shows live (−$1,400). Two-truths visible at the table↔detail boundary. |
| (b) **Stored-column recompute** — `regenerate-matches.ts` rewrites every `tce_usd_per_day` with the live voyage-calculator path; persistSessionMatches stops preferring `m.economics?.tceUsdPerDay` | Two-file code change + one targeted seed regen + cascade through `hydrate-demo-session` (since the seed source is what fresh sessions inherit) | Larger. ~10-30 matches re-rank in owner-mode TCE sort (loss-makers fall to the bottom). Fit floor ≥60% is unchanged (`fit_percent` is computed independently — confirmed in `lib/sailing/fit-breakdown.ts`). The cross-item-contamination (R2 finding on match 43245: item-1 6500mt/Constanța worksheet attached to item-0 record) is also corrected by this regen. | Display + list stay consistent ("one truth" everywhere). The persistSessionMatches override comment about "−$102k vs +$774 divergence" goes away — the divergence is itself caused by mismatched freight tiers, and the recompute uses the same tier on both sides. | Touches the seed DB. Requires the Rule22 apply sequence + a backup. The persistSessionMatches `storedTce`-prefer guard guarded against a real bug (Baltic-tier vs estimateFreightRate-tier divergence) — that bug needs a separate fix or its own escape hatch before we can remove the guard. |

**Recommendation: ship (a) first, then schedule (b) as a follow-up.**

Rationale: (a) is a one-file, no-DB change that immediately stops the
"sign mismatch on the same card" pathology — the headline becomes
truthful. (b) is the structurally right fix but requires a separate
PR to unblock the persistSessionMatches override (the override exists
because the live recompute used to diverge wildly — that's a real
upstream bug we should fix before we lean on the live path everywhere).
Shipping (a) buys time to do (b) cleanly.

If the founder insists on "one truth in the list too" before merging,
switch to (b) and add Phase B2 below.

### B2 — blast radius (if (a) is shipped)

- Headline value changes from stored to live on the `VoyageBreakdownChart`.
- For ~10-30 matches with a positive stored TCE that goes negative live,
  the headline now reads `−$X/day` while the list cell still reads the
  stored `+$Y/day`. Acceptable for one cycle; track as a known split.
- Fit floor (`fit_percent ≥ 60`) is independent of TCE sign — confirmed
  by R3 at `lib/sailing/fit-breakdown.ts` (timing/utilisation/ballast
  components, no TCE input). No match drops below the floor.
- Owner-mode sort uses `(b.tce_usd_per_day ?? 0) - (a.tce_usd_per_day ?? 0)`
  on the list view — unchanged behaviour with (a).

Parity queries to confirm before/after:

```bash
sqlite3 /tmp/prod-fresh-818.db "
  -- Count of matches whose stored TCE is positive but live TCE
  -- would be negative (proxy: gross_freight < bunker_cost given the
  -- stored inputs and live SGSIN price). Approximated by joining
  -- against a worst-case bunker model — exact figure requires the
  -- voyage-calculator code, so this is a rough lower bound.
  SELECT COUNT(*) AS rank_change_candidates
    FROM matches
    WHERE tce_usd_per_day > 0
      AND freight_rate_usd_per_mt IS NOT NULL
      AND distance_nm IS NOT NULL;
"
```

The exact count of re-ranks is bounded by this and confirmed by spot-
checking 5 random matches in the `/match` view after deploy.

### B3 — cross-item contamination (R2 finding on 43245): in-scope or separate?

**Recommendation: separate item.** The contamination (worksheet for
item-1 Constanța 6500mt attached to an item-0 Liverpool record) is a
seed-generation bug, not a display bug. It will be fixed naturally by
option (b) above (the regen rebuilds every worksheet against the
current parsed_results). Phase B (display-only) cannot reach it.
Track as #82x: "regenerate-matches must rebuild worksheet_json against
post-normalization parsed_results, not carry stale per-match data."

### B — `--dry` contract (option (a))

```bash
# 1. Build with the display patch.
npm run build

# 2. Hit the TCE endpoint and confirm the response carries both numbers.
curl -s -X POST http://localhost:3000/api/voyage/tce \
  -H 'content-type: application/json' \
  -d '{"matchId":"43245","bunkerPort":"GIGIB"}' \
  | jq '.daily_tce_usd, .net_voyage_usd'
# Both should have the same sign (both negative or both positive).

# 3. Snapshot test of VoyageBreakdownChart — assert the headline number
#    equals breakdown.daily_tce_usd, NOT canonicalTceUsdPerDay.
npx jest --findRelatedTests components/economics/VoyageBreakdownChart.tsx --maxWorkers=1
```

### Apply sequence (option (a)) — same as Phase A code-only path.

### Rollback — revert the single display change.

---

## 4. Phase C — #821 stale session laycan (BLOCKED on C1 check)

### Scope

The match card shows "✅ Ideal timing (24.41d gap)" + 100% timing score
on a vessel whose normalized laycan opens June 2 but whose stored
worksheet still references July 4. The 24-day gap is real if July 4
were the laycan; against June 2, the real gap is −7.6 days (LATE) and
the match should fall under the LATE penalty.

### C1 — the critical unknown: recur vs. residue

**Question:** when a user opens `/matches` in a *fresh* post-Variant-B
session, does the SEAGULL 12 / Marmara→Veracruz match show the
normalized June 2 laycan (residue — old session-match records carry
the stale worksheet but new sessions get a fresh one), or does it
show the stale July 4 laycan (live-wiring bug — every new session
re-inherits the staleness from the seed matches)?

**Strong prior:** the live-wiring bug **WILL** recur. Evidence:

1. `hydrate-demo-session.ts:120-156` rebuilds `Match[]` from the seed
   `matches` table (user_id IS NULL) and carries `worksheet_json` and
   `tce_usd_per_day` verbatim into the new `Match.worksheet` and
   `Match.economics.tceUsdPerDay`.
2. `persistSessionMatches:64-71, 97` then writes the new session-match
   row using those exact carried values (prefers stored TCE, copies
   worksheet JSON).
3. Therefore: as long as the seed row for SEAGULL 12 / Veracruz has
   a stale `worksheet_json` (July 4) the new session inherits it.
4. R2 confirmed the seed `parsed_results` was normalized by
   `regenerate-matches.ts` but the per-match `worksheet_json` was NOT
   rebuilt — only DB columns like `laycan_start` were updated.

So the C1 check is mostly a confirmation step. We still run it because
"strong prior" is not the same as "verified" — and the fix branches
materially.

### C1 — the check (DESIGN, NOT EXECUTE)

```bash
# 0. Pre-condition: have a fresh prod copy. DO NOT touch prod.
cp -a /var/lib/quantika-demo/sessions.db /tmp/prod-fresh-c1.db
export SESSIONS_DB_PATH=/tmp/prod-fresh-c1.db

# 1. Start the app pointing at the copy.
PORT=3100 npm start &
APP_PID=$!

# 2. Hit the demo-session bootstrap (mirror what the UI does on first load).
curl -s -X POST http://localhost:3100/api/session/bootstrap \
  -H 'content-type: application/json' -d '{}' | jq -r '.sessionId' > /tmp/c1-session.txt
SID=$(cat /tmp/c1-session.txt)

# 3. Read the SEAGULL 12 / Marmara→Veracruz match for THIS session.
sqlite3 /tmp/prod-fresh-c1.db "
  SELECT id, laycan_start, laycan_end, worksheet_json
    FROM matches
    WHERE user_id = '$SID'
      AND load_port = 'Marmara'
      AND discharge_port = 'Veracruz'
    LIMIT 1;
" | tee /tmp/c1-row.txt

# 4. Decide.
#    laycan_start = 1780358400000 (2026-06-02) AND
#    worksheet_json.readiness.laycanStart = '2026-06-02' → RESIDUE.
#       Action: a one-time targeted regen (Phase C2-residue) clears existing
#               session matches; new sessions are clean.
#    laycan_start = 2026-06-02 BUT worksheet_json.readiness.laycanStart = '2026-07-04'
#       → LIVE-WIRING. The seed match has a stale worksheet that hydrate-demo-session
#         carries into every new session.
#       Action: Phase C2-live below.
```

The strong prior says we will see live-wiring (worksheet stale, columns
fresh). If we're wrong, we fall back to the residue branch.

### C2-live — fix path (expected branch)

Two coupled edits:

1. **`scripts/demo-seed/regenerate-matches.ts`**: when normalizing
   parsed_results, also rebuild `worksheet_json` for every affected
   seed match by running the full readiness-gap + economics pipeline
   against current parsed_results. This is the structural fix — the
   seed table stops carrying frozen-in-time payloads.
2. **`lib/matching/persist-session-matches.ts:97`**: drop the verbatim
   pass-through of `m.worksheet` when the cargo laycan in `parsedCargos`
   disagrees with `m.worksheet.readiness.laycanStart`. Fail-closed:
   recompute the worksheet, log a `worksheet_rebuild` event. This is
   the defensive layer in case (1) misses a code path.

A separate, smaller PR is the **regen seed worksheet** one-time write:
run the rebuilt `regenerate-matches.ts` against prod-demo-seed.db
exactly once, after which every new session bootstraps from a clean
seed. Detailed apply sequence in section 5.

### C2-residue — fix path (fallback branch)

If C1 shows the worksheet is clean on a fresh session, the only thing
to do is purge the existing stale session-match rows:

```sql
DELETE FROM matches
  WHERE user_id IS NOT NULL
    AND worksheet_json LIKE '%"laycanStart":"2026-07%'
    AND laycan_start = strftime('%s', '2026-06-02') * 1000;
```

No code change. One-time SQL with backup. Tracked as a hotfix.

### C3 — Latent: spot-30d "ideal" window (`SPOT_IDEAL_MAX_GAP_DAYS = 30`)

**Recommendation: defer as a separate ticket.** The 30-day window was
designed for genuinely-spot vessels where the sailing time itself
consumes most of the gap. It's the wrong tool when a non-spot vessel
mis-classifies as spot, but tightening it (e.g. dropping to 14 days)
would silently down-rank legitimate spot voyages. The cleaner fix is to
make `detectSpot` more conservative (today: literal `\b(spot|prompt|promt)\b`
on the raw open-date string; tomorrow: requires the regex AND no parseable
ISO date in the same field). That's a separate ticket because it affects
every spot vessel in the seed, not just SEAGULL 12. Track as #82y.

### C — `--dry` contract (C2-live)

```bash
DB=/tmp/prod-fresh-c1.db

# 1. Backup before any dry run.
cp -a "$DB" "$DB.bak.$(date -u +%Y%m%dT%H%M%SZ)"

# 2. Dry-run the rebuilt regenerator.
npx tsx scripts/demo-seed/regenerate-matches.ts --dry-rebuild-worksheet \
  > /tmp/c2-dry.log 2>&1
grep -cE 'planned (UPDATE|REWRITE)' /tmp/c2-dry.log
# Expected: a row for every seed match whose worksheet_json disagrees
#           with the current parsed_results normalization.

# 3. Spot-check the rewritten worksheet for match 43261 (SEAGULL 12).
grep -A 3 '43261' /tmp/c2-dry.log

# 4. Parity guard — no seed match loses laycan_start, distance_nm or
#    fit_percent that it had before.
sqlite3 "$DB" "
  SELECT COUNT(*) FROM matches
    WHERE user_id IS NULL
      AND (laycan_start IS NOT NULL OR distance_nm IS NOT NULL OR fit_percent IS NOT NULL);
"
# Record the number. After the live run, this must match exactly.
```

### Apply sequence (C2-live, Rule22, prod, NOT dev-vps → prod)

1. **MacBook → prod** SSH only. Dev-vps cannot reach prod — explicit per
   dispatch note.
2. `git fetch && git checkout main && git pull` on prod host. Confirm
   the rebuilt `regenerate-matches.ts` is on main.
3. `npm ci && npm run build`.
4. Backup: `cp -a "$SESSIONS_DB_PATH" "$SESSIONS_DB_PATH.bak.$(date -u +%Y%m%dT%H%M%SZ)"`.
5. `sqlite3 "$SESSIONS_DB_PATH" 'PRAGMA wal_checkpoint(TRUNCATE);'`.
6. Dry run (see --dry contract).
7. **Founder approval** before live run.
8. Live run: `npx tsx scripts/demo-seed/regenerate-matches.ts --rebuild-worksheet > /tmp/c2-live.log 2>&1`.
9. **Targeted column patch** (NOT file-swap). The rebuilt regenerator
   updates seed-match rows in place via SQL UPDATE — it must NEVER
   `cp /tmp/demo-seed.db $SESSIONS_DB_PATH` because that would also
   overwrite live session-match rows (see existing apply-to-prod.md
   step E pattern — same constraint). If the regenerator script
   currently does a file-swap, that's a blocking finding for C2-live;
   we open a sub-task to convert it to in-place UPDATE before merging.
10. `sudo systemctl restart quantika-demo.service`.
11. `curl http://localhost:3000/api/health` returns 200.
12. Founder visual verify: `/match/43261` shows June 2-7 laycan,
    `gapDays ≈ -7.6`, verdict `late`, timing score ≪ 100%.

### Rollback (C2-live)

`cp -a "$SESSIONS_DB_PATH.bak.<TS>" "$SESSIONS_DB_PATH"` then
`sudo systemctl restart quantika-demo.service`. Keep backup ≥7 days.

---

## 5. Cross-cutting

### 5.1 Risk-override gate (per phase)

Each phase touches the economics display or engine — `/test-skill` cold
adversarial QA is REQUIRED before merge.

The QA brief MUST drive real value shapes, not happy-path:
- bunker price = `null`, `0`, negative, NaN, +Infinity
- bunkerPort = `null`, `''`, `'sgsin'` (lowercase), `'XXXXX'`
- TCE inputs = `0` distance, `0` quantity, `0` speed, `0` consumption
- laycan = pre-normalization object `{start:'…', end:'…'}` AND
  post-normalization string `'2026-06-02 to 2026-06-07'`
- worksheet_json = both stale and fresh, attached to the wrong cargo item

### 5.2 Ship sequence (recommendation)

| Order | Phase | Why first / why later |
|---|---|---|
| 1 | A2 + A1 (one PR) | Lowest risk, in-lane to `feat-bunker-oilmonster-blacksea` ancestry, no DB write, fully reversible |
| 2 | B1 option (a) display-only | One file, no DB, no re-rank. Catches the most visible founder-facing pathology immediately. |
| 3 | C1 check (read-only) | Required to confirm strong prior; gates C2 path choice |
| 4 | C2-live (or C2-residue) | DB write — needs Rule22 apply sequence + backup + founder approval |
| 5 | B option (b) regen recompute | Largest blast radius (~10-30 ranks change); ship after C2-live so the seed worksheet is already clean and the persistSessionMatches override can be removed safely |
| (open) | C3 detectSpot tightening | New ticket; not part of cluster |
| (open) | B3 cross-item contamination | Subsumed by step 5 (option b); becomes its own ticket if step 5 is deferred |

### 5.3 Apply sequence (canonical, all phases)

Per dispatch note:

1. SSH from MacBook only; dev-vps cannot reach prod.
2. `git checkout main && git pull && npm ci && npm run build`.
3. For DB-write phases (C2-live and any future B-option-(b)):
   `cp -a "$SESSIONS_DB_PATH" "$SESSIONS_DB_PATH.bak.<TS>"`,
   `wal_checkpoint(TRUNCATE)`, **targeted in-place UPDATE** (never file-swap),
   verify against parity queries.
4. `sudo systemctl restart quantika-demo.service` (NOT `pm2 restart`).
5. `/api/health` 200, founder visual.

### 5.4 Test policy (PI2 + PI3)

- PI2: every behavioural test must call `client.get/post` or invoke the
  React component via RTL — no asserting on raw string templates.
- PI3: do NOT rewrite existing test expectations. If a test fails after
  the change, the test is the spec; STOP and escalate via `QUESTIONS.md`.

### 5.5 Out of scope (this PR cluster)

- Tightening `detectSpot` and the 30-day spot-ideal window (C3, separate
  ticket).
- Cross-item contamination in `regenerate-matches.ts` (B3, subsumed
  later, separate ticket if needed sooner).
- Adding nearest-hub auto-derive logic to `EconomicsTab.tsx` (rejected
  for now — A2 is the minimal fix; revisit if the recommendation
  endpoint proves insufficient in production).

---

## 6. Files this plan would touch (summary)

| Phase | File | Edit kind |
|---|---|---|
| A1 | `app/api/voyage/bunker-recommendation/route.ts` | add freshness log |
| A2 | `components/match/EconomicsTab.tsx` | swap `useState<BunkerPort>('SGSIN')` → lazy null + recommendation-driven set |
| A2 | `app/api/voyage/tce/route.ts` | drop SGSIN fallback → 400 |
| B1(a) | `components/economics/VoyageBreakdownChart.tsx` | drop `canonicalTceUsdPerDay` from headline |
| C2-live | `scripts/demo-seed/regenerate-matches.ts` | rebuild `worksheet_json` against current parsed_results |
| C2-live | `lib/matching/persist-session-matches.ts` | fail-closed if `m.worksheet.readiness.laycanStart` disagrees with cargo laycan |
| (deferred) B(b) | `lib/matching/persist-session-matches.ts:64-71` | remove storedTce override (after upstream divergence fix) |

Test files added per phase: 2-3 each, behavioural, real value shapes.

---

## 7. Open questions for orchestrator / founder

1. Does Phase A2 require a feature flag, or do we ship straight (the
   "loading bunker port" state will be visible for ≤500ms on first
   render)?
2. For Phase B option (a) vs (b): does the founder want "one truth in
   the list view" immediately, or is the table↔detail-panel split
   acceptable for one cycle? (a) is recommended.
3. Has prod's `SESSIONS_DB_PATH` been verified to point at the same
   table the new OilMonster cron writes into? The path is whatever
   `getStore().getDb()` resolves at boot; if it doesn't match the cron
   target, the A1 freshness check needs to point at the same DB the
   recommendation handler reads from.
