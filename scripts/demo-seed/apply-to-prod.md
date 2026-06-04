# Prod-apply demo-seed.db — #791 weight fix

> **DO NOT execute autonomously. Founder signs each step.**
>
> This runbook applies the #791 / #792 weight-economics fix to the production
> demo-seed.db after the PR merges. The code-side fix (helper + 12 call sites +
> INSERT cols + parse-prompt + re-parsed corpus) lands via PR; this runbook
> takes the re-parsed fixture from main → produces matches in the prod DB.

## Pre-flight (on dev-VPS, root@dev-vps)

1. `cd /root/work/quantika-demo`
2. `git pull && git checkout main`
3. `npm ci && npm run build`
4. Confirm the re-parsed fixture is on main:
   `git log -1 --pretty=format:'%h %s' lib/sample-data/demo-parsed-cargoes.json`
   → must reference the #791 re-parse commit.

## Step A — Dry-run regenerate

```bash
cd /root/work/quantika-demo
npx tsx scripts/demo-seed/regenerate-matches.ts --dry > /tmp/regen-dry.log 2>&1
wc -l /tmp/regen-dry.log
grep -cE 'planned (INSERT|DELETE)' /tmp/regen-dry.log
tail -30 /tmp/regen-dry.log
```

Inspect: planned DELETE and INSERT counts. **Founder approval required to proceed.**

## Step B — Backup prod demo-seed.db

```bash
DB=/root/work/quantika-demo/demo-seed.db
TS=$(date -u +%Y%m%dT%H%M%SZ)
cp -a "$DB" "$DB.bak.$TS"
ls -la "$DB"*
```

Record `$DB.bak.$TS` for rollback. Keep ≥7 days.

## Step C — wal_checkpoint (flush WAL before swap)

```bash
sqlite3 "$DB" 'PRAGMA wal_checkpoint(TRUNCATE);'
```

## Step D — Execute regen (live)

```bash
npx tsx scripts/demo-seed/regenerate-matches.ts > /tmp/regen-live.log 2>&1
tail -30 /tmp/regen-live.log
```

## Step E — Verify in DB

```bash
sqlite3 "$DB" "
  -- Targeted: previously-broken pairs (Marmara storage tanks + grain trader).
  SELECT cargo_id, cargo_item_index, vessel_id,
         fit_percent, tce_usd_per_day, status, reason
    FROM matches
    WHERE cargo_id LIKE '19d5de87705baf9b%'
       OR cargo_id LIKE '19e07d011dbc661e%'
    ORDER BY cargo_id, cargo_item_index, score DESC LIMIT 30;

  -- #792 — SEAGULL 2 / corn pair must be either gated (status='filtered')
  -- or absent from shortlist.
  SELECT m.cargo_id, m.cargo_item_index, m.vessel_id, m.status, m.reason
    FROM matches m
    WHERE m.cargo_id LIKE '19e07d011dbc661e%'
      AND m.cargo_item_index = 0
      AND m.vessel_id LIKE '%SEAGULL%';

  -- General health: bucket distribution.
  SELECT status, COUNT(*) FROM matches GROUP BY status;

  -- cargo_item_index distribution: must show non-zero values for multi-item emails.
  SELECT cargo_item_index, COUNT(*)
    FROM matches WHERE user_id IS NULL
    GROUP BY cargo_item_index ORDER BY cargo_item_index;
"
```

Pass criteria:
- The Marmara cargo `19d5de87705baf9b/0` shows non-null `tce_usd_per_day` and `fit_percent`.
- SEAGULL 2 vs corn either not in shortlist OR `status='filtered'` with overload reason.
- `cargo_item_index > 0` count > 0 (proves Task 3 INSERT fix is live).

## Step F — Restart Next.js (env-bake refresh — see CLAUDE.md)

```bash
pm2 restart quantika-demo --update-env
pm2 logs quantika-demo --lines 50 --nostream
```

## Step G — Visual verify (browser)

- Navigate to `/match/<previously-broken match id>`
- Source Attribution shows correct cargo line (not itemIndex=0 default for non-zero items)
- Economics tab shows non-zero TCE for range-cargoes
- Previously "Possible / Overload" pair is gone from shortlist or marked Overload
- fit-% no longer shows "weight not stated" for the 31 range-cargoes

## Rollback (if any Step E/F/G fails)

```bash
pm2 stop quantika-demo
cp -a "$DB.bak.$TS" "$DB"
pm2 start quantika-demo --update-env
pm2 logs quantika-demo --lines 30 --nostream
```

## Post-apply

- Note Step A `regen-dry.log` counts in the deploy log.
- Confirm `pm2 logs quantika-demo --err` is clean for 10 min post-restart.
- File a follow-up if any regression surfaces (link this runbook + commit SHA).
