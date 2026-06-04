# Plan: PR #815 prod-apply fix — correct procedure for landing the weight-economics fix on prod demo-seed.db

Date: 2026-06-04
Status: SPEC — execution gated on founder approval. Plan only, NO writes performed by this document.
Author: planner agent (Opus), recon basis: ~/orchestrator-state/quantika-demo/recon-regenweight-r{1,2,3}.md
Refs: PR #815, issues #791 / #792, runbook scripts/demo-seed/apply-to-prod.md

---

## 1. Problem statement (single source of truth)

**Symptom**: Marmara project cargo `19d5de87705baf9b` / itemIndex=0 on prod (demo.quantika.org) still shows `tce_usd_per_day=774` and reads "weight not stated" in the match UI, AFTER #815 merged.

**Application code is CORRECT.** Three independent investigators agree on root:

- `scripts/demo-seed/regenerate-matches.ts:89-91` reads cargoes from the `parsed_results` table in `demo-seed.db`. That table was populated by `scripts/demo-seed/build.ts:531-551` from the LLM cache (`.private/raw-emails/.llm-cache/<hash>.json`) — written BEFORE the #791 re-parse that fixed Marmara `weightMtMax=186`.
- `#815` updated ONLY `lib/sample-data/demo-parsed-cargoes.json` (12-line delta on the fixture). It did NOT regenerate the LLM cache and did NOT touch `parsed_results`.
- `scripts/demo-seed/real-matches.ts:41` is the only seed-pipeline script that imports the JSON fixture directly. `regenerate-matches.ts` does not.
- Therefore: running `regenerate-matches.ts` against a prod-copy DB (verified 2026-06-04) shows total 809→395, main 28→42, idx>0 0→107 — but Marmara cargo UNCHANGED (tce still 774). Confirms the parsed_results-source gap.

**The bug is in the PROCEDURE.** `scripts/demo-seed/apply-to-prod.md` (added in #815) instructs the operator to:
1. Run on dev-VPS — wrong target. Real prod is outreach-vps `185.249.225.169`, `/root/quantika-demo/data/demo-seed.db`, PM2 process `quantika-demo`, `demo.quantika.org` (deploy.yml authoritative).
2. Use `scripts/demo-seed/regenerate-matches.ts` — wrong script. It reads `parsed_results`, which carries pre-#815 weights.

This plan specifies the corrected procedure.

---

## 2. Verified facts (anchor for design)

| Fact | Source | Evidence |
|------|--------|----------|
| Real prod is outreach-vps `185.249.225.169` | memory `project_quantika_seed_prod_apply_mechanics` | deploy.yml — authoritative; dev-vps has no SSH path to prod |
| Prod DB path: `/root/quantika-demo/data/demo-seed.db` | same memory record | PM2 quantika-demo cwd |
| Prod baseline (read 2026-06-04): total=809, main(NULL)=28, Marmara `19d5...baf9b` item_index=0 tce=774 | recon R3 §3, R1 §root-hypothesis | sqlite read on prod-copy |
| `regenerate-matches.ts` reads `parsed_results` only | `scripts/demo-seed/regenerate-matches.ts:89-91` | R3 §"Cargo data source (definitive)" |
| `real-matches.ts` imports JSON fixture | `scripts/demo-seed/real-matches.ts:41` | R3 §"Is it the re-parsed JSON fixture? NO" |
| `build.ts` reads `.llm-cache/<hash>.json`, not the JSON fixture | `scripts/demo-seed/build.ts:372` via `loadLlmCacheIfAny` | grep `loadLlmCacheIfAny` |
| #815 commit changed only `demo-parsed-cargoes.json` for parsed weight data (no `.llm-cache` regen, no `parsed_results` write) | `git show 5d46c13e --stat` | 22 files; cache files git-ignored |
| Test regen via `regenerate-matches.ts` on prod COPY: 809→395, main 28→42, idx>0 0→107, Marmara unchanged | task context | confirms script reads stale DB-side weights |
| `economics.tceUsdPerDay` stored in seed = `m.economics?.tceUsdPerDay` (regen line 284) — already on the #815-wired path (`pair-analyzer.ts:770` uses `resolveCargoWeight`) | R1 §"two weight-read sites" | code |

---

## 3. Two candidate regen paths — choose B

### Candidate A — re-run `real-matches.ts` directly against prod DB

Reads `lib/sample-data/demo-parsed-cargoes.json` (#815 fixture) directly. Bypasses `parsed_results` entirely. Would land the #815 weight values into the engine without touching the LLM cache or the DB-side parsed table.

**Risks (verified vs `regenerate-matches.ts`):**
- **Insert column shape diverges from regen.**
  - regen INSERT cols (`regenerate-matches.ts:222-225`): `vessel_name`, `cargo_ref` populated, plus `worksheet_json` conditional. Does NOT write `freight_rate_usd_per_mt` / `freight_rate_source`.
  - real-matches INSERT cols (`real-matches.ts:83-97` → `buildMatchInsertSql`): writes `freight_rate_usd_per_mt`, `freight_rate_source`, `reason_structured`; does NOT write `vessel_name`, `cargo_ref`.
  - Net effect: column-NULL profile on prod would FLIP — any UI / API / test that reads `vessel_name` or `cargo_ref` (on main board rows) would break.
- **Bucket logic diverges.** regen uses MAIN_FIT_FLOOR=60 + content-key dedup (vessel name|desc|origin|laycan_start) + INSUF_CAP=60 + gapNote one-liner; real-matches uses top-6/cargo + email-pair dedup + raw `readiness.explanation`. Visible UI churn beyond the weight fix.
- **`analyzePairs` vs inline heuristic.** regen runs the canonical engine (sweep, fit-breakdown, applied caps). real-matches runs an inline heuristic-score path. Live UX risk: behaviour drift on every non-Marmara match.
- **Date rebasing.** real-matches calls `rebaseParsedCargoes(rawCargoes, new Date())` — it rebases to the LIVE date, not to the frozen demo date. regen reads `demo_seed_meta.frozen_date` (2026-05-28). Switching to real-matches shifts the entire demo timeline.

Verdict: **NOT SAFE for prod parity.** real-matches is the build-fresh path used by `seed-all.ts`, not the surgical-update path.

### Candidate B — surgical weight backfill into `parsed_results` from the #815 fixture, then run `regenerate-matches.ts` (RECOMMENDED)

Write a small loader (one-shot, plan-only spec — not implemented in this plan): for each cargo email present in BOTH `lib/sample-data/demo-parsed-cargoes.json` AND `parsed_results` (`parse_type='cargo'`), merge ONLY the weight-shape fields onto each item by `(emailId, itemIndex)`:

- `weightMt` (ConfidenceField object)
- `weightMtMin`
- `weightMtMax`
- `stowageFactor` (#815 may have touched stowage on PROJECT cargoes — verify by `git diff 5d46c13e^ 5d46c13e -- lib/sample-data/demo-parsed-cargoes.json` before merging)

Preserves: shifted laycan written by `build.ts:538-544`, every non-weight field, the email-day-offset timeline (`frozen_date=2026-05-28`), all other parsed_results rows.

Then run `regenerate-matches.ts`. The script's engine call (`analyzePairs` → `pair-analyzer.ts:770 ecoQty = resolveCargoWeight(cargo)`) now sees `weightMtMax=186` on Marmara → `buildMatchEconomics` produces a realistic 186-MT TCE → stored in `m.economics.tceUsdPerDay` → INSERT writes the correct `tce_usd_per_day`. INSERT column shape unchanged from current prod (no col-NULL flip).

**Why B is safer:**
- Insert column set unchanged → column-NULL parity preserved.
- Bucket logic unchanged → main/review/insufficient distribution drift comes from #815 ONLY, not from procedural divergence.
- Engine path unchanged → no behavioural drift on non-affected cargoes.
- Timeline (frozen_date) preserved.
- Reversible at the parsed_results layer (UPDATE only the weight fields, can be re-derived from fixture at any time).

**Known unknown for B:**
- If the #815 fixture happens to change OTHER fields (cargoType, stowageFactor, originPort, destinationPort, laycan, cargoDescription) for any cargo besides weight — the surgical-update would miss them. **Mitigation:** runbook step 0 below runs `git diff 5d46c13e^ 5d46c13e -- lib/sample-data/demo-parsed-cargoes.json` and ENUMERATES the changed-field set. If anything beyond `weightMt`/`weightMtMin`/`weightMtMax`/`stowageFactor` appears, plan UPDATE NEEDED — escalate before applying.

**Why NOT rebuild via `seed-all.ts`:** prod outreach-vps does NOT have `.private/raw-emails/.llm-cache/<hash>.json` (gitignored, local-only on operator workstation). Even on operator workstation, the cache may still hold the OLD parse — task context notes the #815 re-parse updated only the JSON fixture; the cache state is unknown. `seed-all.ts` would fall back to regex extraction without cache, or rebuild from a stale cache. Either way: not deterministic, not auditable, high risk. Surgical fixture→parsed_results merge avoids this entirely.

**Decision: Candidate B.**

---

## 4. --dry verification contract (against a COPY of prod demo-seed.db)

Goal: PROVE Candidate B produces correct + shape-compatible output BEFORE any prod write.

### 4.0 Setup — pull a fresh copy of prod DB to operator workstation

```bash
# From operator MacBook (NOT dev-vps — Rule22, no dev-vps→prod path)
TS=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p ~/quantika-prod-copy
scp root@185.249.225.169:/root/quantika-demo/data/demo-seed.db ~/quantika-prod-copy/demo-seed.db.prod-$TS
cd ~/work/quantika-demo   # local checkout on operator MacBook, main branch, post-#815
git pull --ff-only origin main
git log -1 --pretty=format:'%h %s' -- lib/sample-data/demo-parsed-cargoes.json
# expect: 5d46c13e fix(weight): #791 + #792 cargo-weight wiring (A+B+C+D+E+F) (#815)
```

### 4.1 Field-diff guard (escalation gate)

```bash
git diff 5d46c13e^ 5d46c13e -- lib/sample-data/demo-parsed-cargoes.json | head -200
# Manually enumerate which JSON keys changed per item.
# Expected key set: weightMt, weightMtMin, weightMtMax, stowageFactor (per task context).
# If ANY other key appears (cargoType, originPort, destinationPort, laycan, cargoDescription, etc.)
# → STOP. Re-spec backfill field whitelist. Do not proceed.
```

### 4.2 Run the surgical backfill (--dry against prod copy)

Loader contract (to be implemented in a separate PR per #815 follow-up — this plan only specifies behaviour):

- Input: `lib/sample-data/demo-parsed-cargoes.json`, `data/demo-seed.db` (the prod copy).
- For each fixture cargo `c` keyed by `c.emailId`:
  - Read existing `parsed_results.result_json` for `(c.emailId, parse_type='cargo')` → parse to `items[]`.
  - For each `items[i]` where `i === c.itemIndex` (fall back to a stable secondary key — see §4.3):
    - Whitelist-merge fields from §4.1 from `c` onto `items[i]` (do not delete unrelated fields).
  - `UPDATE parsed_results SET result_json = ? WHERE gmail_message_id = c.emailId AND parse_type = 'cargo'` (gated on `--dry` flag).
- Log per-row: `(emailId, itemIndex, fields_changed[], old_value→new_value)`.
- Refuse to write if any fixture cargo `c` lacks a corresponding `parsed_results` row (`MISSING_ROW emailId=…`) — escalate to founder.

```bash
DB_COPY=~/quantika-prod-copy/demo-seed.db.prod-$TS
# Loader is the follow-up implementation, not part of this plan. Spec only.
npx tsx scripts/demo-seed/backfill-815-weights.ts --db $DB_COPY --dry > /tmp/backfill-dry.log 2>&1
grep -cE 'WOULD-UPDATE' /tmp/backfill-dry.log
grep -E 'MISSING_ROW' /tmp/backfill-dry.log    # expect 0; any hit → STOP
```

### 4.3 itemIndex alignment caveat

`build.ts:531-545` re-orders cargoes by `.filter(c.emailId === email.messageId)` and assigns the row-level `itemIndex` only on regen-load (`regenerate-matches.ts:97`). The fixture's `itemIndex` (if present) may NOT equal the position in the parsed_results JSON array.

Loader mitigation: **secondary key = `(originPort, destinationPort, cargoDescription)` fingerprint.** Match fixture item to parsed_results item by fingerprint where `itemIndex` does not uniquely resolve. If neither key uniquely resolves → log `AMBIGUOUS_MATCH emailId=…` → refuse to write that email's row → escalate.

### 4.4 Live backfill on the COPY

```bash
npx tsx scripts/demo-seed/backfill-815-weights.ts --db $DB_COPY > /tmp/backfill-live.log 2>&1
tail -30 /tmp/backfill-live.log
# Verify Marmara now carries weightMtMax=186 in parsed_results:
sqlite3 $DB_COPY "
  SELECT json_extract(result_json, '$[0].weightMtMax') AS w
  FROM parsed_results
  WHERE gmail_message_id = '19d5de87705baf9b' AND parse_type = 'cargo';
"
# Expect: 186
```

### 4.5 --dry regenerate on the COPY

```bash
npx tsx scripts/demo-seed/regenerate-matches.ts --db $DB_COPY --dry > /tmp/regen-dry.log 2>&1
tail -30 /tmp/regen-dry.log
```

Capture in the runbook: `cargos=N`, `vessels=M`, `normalized parsed rows=K` (note: K=0 expected under --dry, see recon R2), bucket counts.

### 4.6 Live regenerate on the COPY

```bash
npx tsx scripts/demo-seed/regenerate-matches.ts --db $DB_COPY > /tmp/regen-live.log 2>&1
tail -30 /tmp/regen-live.log
```

### 4.7 Parity verification — sqlite queries

Run BOTH against the original `demo-seed.db.prod-$TS` (read-only baseline) AND against the post-regen `$DB_COPY`. Diff.

#### 4.7.a Schema parity (PRAGMA table_info)

```bash
for db in ~/quantika-prod-copy/demo-seed.db.prod-$TS $DB_COPY; do
  echo "=== $db ==="
  sqlite3 "$db" "PRAGMA table_info(matches);" | sort
done
# Expect: identical schemas. Any diff → STOP (regen migrated something we did not plan).
```

#### 4.7.b Per-column non-NULL count (column-NULL parity guard)

```bash
sqlite3 "$db" <<'SQL'
  SELECT 'main_count', COUNT(*) FROM matches WHERE user_id IS NULL;
  SELECT 'review_count', COUNT(*) FROM matches WHERE user_id = '__demo_review__';
  SELECT 'insuf_count', COUNT(*) FROM matches WHERE user_id = '__demo_insufficient__';
  SELECT 'cargo_id__nonnull',         COUNT(*) FROM matches WHERE cargo_id IS NOT NULL;
  SELECT 'vessel_id__nonnull',        COUNT(*) FROM matches WHERE vessel_id IS NOT NULL;
  SELECT 'cargo_item_index__nonnull', COUNT(*) FROM matches WHERE cargo_item_index IS NOT NULL;
  SELECT 'cargo_item_index__gt0',     COUNT(*) FROM matches WHERE cargo_item_index > 0;
  SELECT 'vessel_item_index__nonnull',COUNT(*) FROM matches WHERE vessel_item_index IS NOT NULL;
  SELECT 'score__nonnull',            COUNT(*) FROM matches WHERE score IS NOT NULL;
  SELECT 'reason__nonnull',           COUNT(*) FROM matches WHERE reason IS NOT NULL;
  SELECT 'status__nonnull',           COUNT(*) FROM matches WHERE status IS NOT NULL;
  SELECT 'reason_structured__nonnull',COUNT(*) FROM matches WHERE reason_structured IS NOT NULL;
  SELECT 'cargo_type__nonnull',       COUNT(*) FROM matches WHERE cargo_type IS NOT NULL;
  SELECT 'load_port__nonnull',        COUNT(*) FROM matches WHERE load_port IS NOT NULL;
  SELECT 'discharge_port__nonnull',   COUNT(*) FROM matches WHERE discharge_port IS NOT NULL;
  SELECT 'laycan_start__nonnull',     COUNT(*) FROM matches WHERE laycan_start IS NOT NULL;
  SELECT 'laycan_end__nonnull',       COUNT(*) FROM matches WHERE laycan_end IS NOT NULL;
  SELECT 'vessel_dwt__nonnull',       COUNT(*) FROM matches WHERE vessel_dwt IS NOT NULL;
  SELECT 'tce_usd_per_day__nonnull',  COUNT(*) FROM matches WHERE tce_usd_per_day IS NOT NULL;
  SELECT 'distance_nm__nonnull',      COUNT(*) FROM matches WHERE distance_nm IS NOT NULL;
  SELECT 'vessel_name__nonnull',      COUNT(*) FROM matches WHERE vessel_name IS NOT NULL;
  SELECT 'cargo_ref__nonnull',        COUNT(*) FROM matches WHERE cargo_ref IS NOT NULL;
  SELECT 'fit_percent__nonnull',      COUNT(*) FROM matches WHERE fit_percent IS NOT NULL;
  SELECT 'fit_breakdown__nonnull',    COUNT(*) FROM matches WHERE fit_breakdown IS NOT NULL;
  SELECT 'worksheet_json__nonnull',   COUNT(*) FROM matches WHERE worksheet_json IS NOT NULL;
SQL
```

Diff baseline-vs-post-regen counts. **Acceptance rule:** NO column that the baseline had populated may drop to 0 after regen. Bucket counts may shift (expected — that's the whole point), but per-column NULL profile may not change category (populated→not-populated forbidden).

#### 4.7.c Marmara cargo correctness

```bash
sqlite3 $DB_COPY "
  SELECT cargo_id, cargo_item_index, vessel_id, vessel_name,
         fit_percent, tce_usd_per_day, status, user_id, reason
  FROM matches
  WHERE cargo_id = '19d5de87705baf9b'
  ORDER BY cargo_item_index, score DESC;
"
```

**Acceptance:**
- `tce_usd_per_day` is **NOT** `774` and **NOT** any value derived from the 5000+t 65%-DWT fallback (any value > ~10000 USD/day on a 186-MT project cargo is suspect).
- `tce_usd_per_day` may legitimately be lower / more realistic OR the row may move to the `__demo_review__` bucket because a 186-MT cargo on a 7700-DWT vessel is underutilised (under-utilisation = legitimate fit demote). **Both outcomes are CORRECT.**
- `cargo_item_index = 0` for the project cargo.

#### 4.7.d #792 overload pair (SEAGULL 2 / corn) — must be gated or absent

```bash
sqlite3 $DB_COPY "
  SELECT cargo_id, cargo_item_index, vessel_id, vessel_name, status, user_id, fit_percent, reason
  FROM matches
  WHERE cargo_id LIKE '19e07d011dbc661e%'
    AND vessel_name LIKE '%SEAGULL%';
"
```

**Acceptance:** either no row, OR row present with `status='filtered'` / `user_id='__demo_review__'` and `reason` referencing overload / weight cap. Hard-acceptance is in `lib/sailing/__tests__/overload-gate-792.test.ts` already, which exercises the engine — this query verifies it landed in the seed.

#### 4.7.e item_index > 0 sanity

```bash
sqlite3 $DB_COPY "
  SELECT cargo_item_index, COUNT(*)
  FROM matches WHERE user_id IS NULL
  GROUP BY cargo_item_index ORDER BY cargo_item_index;
"
```

**Acceptance:** sum of rows with `cargo_item_index > 0` is > 0 (proves the regen wrote multi-item cargoes; task context noted 0→107 on test).

#### 4.7.f Bucket totals — sanity bands

```bash
sqlite3 $DB_COPY "SELECT user_id, COUNT(*) FROM matches GROUP BY user_id;"
```

Banding (informational, not hard-blocking — escalate if violated):
- `main (NULL)`: 28..120 (baseline 28; #815 expected to unlock some main-board matches).
- `__demo_review__`: 0..200.
- `__demo_insufficient__`: ≤ INSUF_CAP (60).

Total rows post-regen may be lower than 809 — that is EXPECTED (regen filters / dedups). Task context confirmed test run 809→395 on prod copy.

### 4.8 --dry verification PASS criteria (all must be green to proceed)

1. Schema parity (§4.7.a): identical.
2. Column-NULL parity (§4.7.b): no populated→empty regression.
3. Marmara cargo (§4.7.c): `tce_usd_per_day ≠ 774` AND not a 65%-DWT fallback band.
4. #792 SEAGULL/corn (§4.7.d): filtered OR absent.
5. cargo_item_index > 0 (§4.7.e): count > 0.
6. Bucket totals (§4.7.f): in band OR explicit founder waiver logged.
7. `MISSING_ROW` count in §4.2 backfill log = 0.
8. `AMBIGUOUS_MATCH` count in §4.3 = 0.

ANY failure → STOP. Do not touch prod.

---

## 5. Apply sequence (operator MacBook → outreach-vps prod) — Rule22 strict

**Target = outreach-vps `185.249.225.169`, NOT dev-VPS.**
**Source = operator MacBook (only host with SSH path to outreach-vps).**
**Path on prod = `/root/quantika-demo/data/demo-seed.db`.**

### Pre-flight

- Founder explicit go signal in chat, citing this plan + the dry-run log paths from §4.
- Pull-request body of #815 + this plan linked into deploy log.
- `git log -1 --pretty=format:'%h %s' -- lib/sample-data/demo-parsed-cargoes.json` on local main = `5d46c13e`.

### Step 1 — backup prod DB

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
ssh root@185.249.225.169 "
  cd /root/quantika-demo &&
  cp -a data/demo-seed.db data/demo-seed.db.bak.$TS &&
  ls -la data/demo-seed.db*
"
```

Record `data/demo-seed.db.bak.$TS` in deploy log. Keep ≥ 7 days post-apply.

### Step 2 — flush WAL

```bash
ssh root@185.249.225.169 "
  cd /root/quantika-demo &&
  sqlite3 data/demo-seed.db 'PRAGMA wal_checkpoint(TRUNCATE);'
"
```

### Step 3 — apply (choose 3A OR 3B; 3A preferred)

#### Step 3A — write-back the locally-verified COPY to prod (preferred — atomicity, smaller blast radius)

The verified COPY from §4 contains correct rows. Replace prod DB atomically:

```bash
# scp the verified copy back as a swap-in file; then atomic mv on prod.
scp ~/quantika-prod-copy/demo-seed.db.prod-$TS-verified \
    root@185.249.225.169:/root/quantika-demo/data/demo-seed.db.new
ssh root@185.249.225.169 "
  cd /root/quantika-demo &&
  pm2 stop quantika-demo &&
  mv data/demo-seed.db.new data/demo-seed.db &&
  ls -la data/demo-seed.db
"
```

Pros: file-level swap, smaller blast radius, regen was already verified in §4.
Cons: PM2 must stop during swap (≤ 30s downtime).

#### Step 3B — re-run backfill + regen IN-PLACE on prod (fallback if 3A fails network-wise)

```bash
ssh root@185.249.225.169 "
  cd /root/quantika-demo &&
  git fetch origin &&
  git log -1 --pretty=format:'%h %s' origin/main -- lib/sample-data/demo-parsed-cargoes.json
  # must print 5d46c13e
"
ssh root@185.249.225.169 "
  cd /root/quantika-demo &&
  git pull --ff-only origin main &&
  npm ci &&
  npx tsx scripts/demo-seed/backfill-815-weights.ts --db data/demo-seed.db > /tmp/backfill-prod.log 2>&1 &&
  npx tsx scripts/demo-seed/regenerate-matches.ts --db data/demo-seed.db > /tmp/regen-prod.log 2>&1 &&
  tail -30 /tmp/backfill-prod.log /tmp/regen-prod.log
"
```

Pros: no scp size constraints; uses the same git checkout the app runs from.
Cons: larger blast radius; partial-failure leaves a half-applied DB → rollback to §6.

**Default: 3A. Use 3B only on explicit founder waiver.**

### Step 4 — restart Next.js (env-bake refresh — see CLAUDE.md "VPS Deploy Notes")

```bash
ssh root@185.249.225.169 "
  pm2 restart quantika-demo --update-env &&
  pm2 logs quantika-demo --lines 50 --nostream
"
```

Note: `--update-env` is REQUIRED (`pm2 reload` does NOT re-read env per CLAUDE.md). Match the runbook.

### Step 5 — health curl (server-side health)

```bash
ssh root@185.249.225.169 "
  curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/health
"
# Expect: 200
```

### Step 6 — visual verify (browser, operator MacBook)

- `https://demo.quantika.org/match/<marmara-match-id>` — Source Attribution shows the correct cargo line for `19d5de87705baf9b/0`; Economics tab shows a realistic TCE (not 774 fallback; or row is on the review tab with under-utilisation reason — both correct).
- One previously-overloaded pair (e.g. SEAGULL 2 / corn) is absent from main board OR shown on review with overload reason.
- Main dashboard counts in band (§4.7.f).

Use Chrome MCP / Playwright per orchestrator outage-claim rule (browser-driven, `document.body.innerText.length` after ≥3s hydration). curl + grep is NOT sufficient acceptance — see orchestrator Rule "Outage / regression claim requires browser-driven verify".

---

## 6. Rollback

Triggers: any §5 step 5 or §5 step 6 acceptance fails, OR `pm2 logs quantika-demo --err` shows new errors in the 10-minute post-apply window.

```bash
ssh root@185.249.225.169 "
  cd /root/quantika-demo &&
  pm2 stop quantika-demo &&
  cp -a data/demo-seed.db.bak.$TS data/demo-seed.db &&
  pm2 start quantika-demo --update-env &&
  pm2 logs quantika-demo --lines 30 --nostream &&
  curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/health
"
```

Then: file a follow-up issue linking this plan + the failing log + the failing visual.

---

## 7. Runbook fix — rewrite `scripts/demo-seed/apply-to-prod.md`

Diff scope (separate PR, not part of this plan execution):

1. **Replace target** — every `dev-VPS` / `root@dev-vps` reference → `outreach-vps` / `root@185.249.225.169` per memory `project_quantika_seed_prod_apply_mechanics`.
2. **Replace DB path** — `/root/work/quantika-demo/demo-seed.db` → `/root/quantika-demo/data/demo-seed.db`.
3. **Replace script** — `regenerate-matches.ts` (alone) → backfill step + regen, OR file-level swap from operator-verified copy. Match §5 of this plan.
4. **Add §4-equivalent --dry verification contract** — current runbook §A `--dry` step only checks "planned INSERT/DELETE counts"; insufficient. Mandate the schema + column-NULL + Marmara + #792 + idx>0 + bucket-band checks.
5. **Add field-diff guard** — the §4.1 escalation gate.
6. **Add Rule22 wording** — explicit "only operator workstation has SSH to prod; dev-vps has none; do not attempt to execute from dev-vps."
7. **Add browser-driven verify step** — Chrome MCP / Playwright, not curl + grep, per orchestrator rule.

Cross-link this plan from the rewritten runbook (`docs/superpowers/plans/2026-06-04-815-prodapply-fix.md`).

---

## 8. Open questions / unknowns

| # | Question | Why it matters | Resolution path |
|---|----------|----------------|-----------------|
| Q1 | Does the #815 fixture diff change ONLY weight fields, or other fields too? | If other fields differ, surgical merge is insufficient. | §4.1 field-diff guard — operator inspects diff before proceeding. |
| Q2 | Does the fixture's `itemIndex` align with the parsed_results JSON array position? | If misaligned, surgical merge writes the wrong row. | §4.3 secondary fingerprint key + AMBIGUOUS_MATCH abort. |
| Q3 | After backfill+regen, does Marmara genuinely land on main board, or correctly demote to review (186 MT vs 7700 DWT under-utilisation)? | Founder UX expectation may differ from engine truth. | §4.7.c documents BOTH outcomes as CORRECT; founder reviews and signs off. |
| Q4 | Bucket-total reduction from 809 → ~395 on test run — is that intentional from regen's dedup, or from a regression? | Visible UI churn beyond the weight fix. | §4.7.f band. Test against a baseline that already ran `regen` once (idempotent), not against the unregened pre-#815 prod DB. |
| Q5 | The loader script `scripts/demo-seed/backfill-815-weights.ts` does not exist yet. | This plan specifies behaviour; implementation is a follow-up PR (separate execution). | Plan defines contract: input, field whitelist, key resolution, MISSING_ROW / AMBIGUOUS_MATCH refusal. Implementor wires it into a TDD spec. |

---

## 9. Acceptance for this plan document

- [x] Identifies the procedure-side root (wrong script + wrong target), distinct from the application code, which is correct.
- [x] Chooses Candidate B (surgical parsed_results backfill from fixture + regen) over Candidate A (real-matches.ts) with shape-parity rationale.
- [x] Mandates a --dry verification contract against a prod-COPY before any prod write, with explicit sqlite acceptance queries.
- [x] Specifies the apply sequence MacBook → outreach-vps (not dev-VPS) with Rule22, pm2 `--update-env`, browser-driven verify.
- [x] Defines rollback path.
- [x] Specifies the runbook rewrite scope (apply-to-prod.md fix).
- [x] Enumerates known unknowns + escalation gates.

---

## 10. Out-of-scope for this plan

- Execution of any regen / backfill / DB write — explicitly plan-only.
- Modifying #815 application code.
- New tests (the existing `overload-gate-792`, `cargo-weight`, `cargo-weight-integration`, `real-matches-item-index` suites cover behaviour).
- Touching dev-vps in any way.
- Implementing `scripts/demo-seed/backfill-815-weights.ts` (specified, not implemented — follow-up PR).
- Rewriting `scripts/demo-seed/apply-to-prod.md` (specified in §7, not rewritten — follow-up PR).
