# Knowledge Layer Runbook

**Last updated:** 2026-05-06
**Owner:** Operations Team
**Purpose:** Daily operations, monitoring, incident response, and maintenance guide for Quantika's Knowledge Layer

---

## Table of Contents

1. [Overview](#overview)
2. [Daily Operations](#daily-operations)
3. [Monitoring & Health Checks](#monitoring--health-checks)
4. [Manual Refresh Operations](#manual-refresh-operations)
5. [Incident Response](#incident-response)
6. [Adding a New Knowledge Source](#adding-a-new-knowledge-source)
7. [Rollback Procedures](#rollback-procedures)
8. [Troubleshooting](#troubleshooting)

---

## Overview

### What is the Knowledge Layer?

The Knowledge Layer is Quantika's unified system for managing regulatory, market, and reference data. It provides:

- **Governance meta-table** (`knowledge_sources`) — single source of truth for data freshness
- **10 knowledge sources** — sanctions, distances, war risk zones, ECA zones, Panama tariffs, embeddings
- **Automated refresh** — daily cron for sanctions only; manual triggers for all others
- **Admin dashboard** — `/admin/knowledge` for status monitoring
- **Health API** — `GET /api/health/knowledge` (public, unauthenticated)

### Architecture Summary

```
┌─────────────────────────────────────────────────┐
│ Admin Dashboard (/admin/knowledge)              │
│ - View source status (fresh/stale/failed)       │
│ - Trigger manual refresh                        │
└─────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│ Governance Meta-Tables (SQLite)                 │
│ - knowledge_sources                             │
│ - knowledge_sync_log                            │
└─────────────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌────────────────┐      ┌──────────────────────┐
│ Auto Refresh   │      │ Manual Refresh       │
│ (Cron Daily)   │      │ (CLI / Dashboard)    │
│ - sanctions    │      │ - distances          │
│                │      │ - jwc, eca, panama   │
└────────────────┘      └──────────────────────┘
        │                         │
        └────────────┬────────────┘
                     ▼
┌─────────────────────────────────────────────────┐
│ Domain Tables (SQLite)                          │
│ - ofac_entities, eu_sanctions_entities          │
│ - port_distances                                │
│ - war_risk_zones                                │
│ - eca_zones                                     │
│ - (embeddings via sqlite-vec)                   │
└─────────────────────────────────────────────────┘
```

### Key Files

| Path | Purpose |
|------|---------|
| `lib/knowledge/governance.ts` | Core governance API |
| `lib/knowledge/types.ts` | TypeScript types |
| `scripts/knowledge/refresh.ts` | CLI dispatcher |
| `scripts/knowledge/cron/refresh-sanctions.ts` | Daily cron script |
| `app/admin/knowledge/page.tsx` | Admin dashboard |
| `app/api/admin/knowledge-status/route.ts` | Status API |
| `app/api/health/knowledge/route.ts` | Public health endpoint |

---

## Daily Operations

### 1. Check Cron Status (Sanctions)

The **sanctions-daily** cron runs every day at 02:00 UTC. Check status:

```bash
# Check if timer is active
systemctl status quantika-sanctions-refresh.timer

# View recent cron runs (journal logs)
journalctl -u quantika-sanctions-refresh.service -n 50

# Check last heartbeat in admin dashboard
curl http://localhost:3000/api/admin/cron-heartbeat \
  -H "X-Cron-Secret: $CRON_SECRET"
```

Expected output:
```json
{
  "cron_name": "sanctions-daily",
  "last_seen_at": "2026-05-06T02:05:23.123Z",
  "status": "ok"
}
```

### 2. Check Source Status (All Sources)

```bash
# CLI
npm run knowledge:status

# Or via API
curl http://localhost:3000/api/admin/knowledge-status

# Or admin dashboard
open http://localhost:3000/admin/knowledge
```

Expected status signals:
- **ok** — source fresh, within stale threshold
- **overdue** — last sync older than `stale_threshold_days`
- **failing** — 3+ consecutive failures
- **never_synced** — source registered but never refreshed

---

## Monitoring & Health Checks

### Health Check Endpoint (Public)

```bash
curl http://localhost:3000/api/health/knowledge
```

**Response (200 OK):**
```json
{
  "status": "healthy",
  "sources": {
    "total": 10,
    "fresh": 8,
    "stale": 1,
    "failed": 1
  },
  "timestamp": "2026-05-06T10:30:00Z"
}
```

**Response (503 Service Unavailable):**
```json
{
  "status": "degraded",
  "sources": {
    "total": 10,
    "fresh": 5,
    "stale": 2,
    "failed": 3
  },
  "degraded_sources": ["ofac", "eu-sanctions", "distances"],
  "timestamp": "2026-05-06T10:30:00Z"
}
```

### Sentry Alerts

- **2+ consecutive failures** → Sentry alert with tag `knowledge_source: <slug>`
- Alert message: `Knowledge source <slug> failed N× consecutively`
- Check Sentry dashboard → Issues → tag filter `knowledge_source`

### Manual Health Check

```bash
# View all source statuses with health signals
npm run knowledge:status

# Check specific source
npm run knowledge:status | grep ofac
```

---

## Manual Refresh Operations

### Refresh a Single Source

```bash
# Syntax
npm run knowledge:refresh <slug>

# Examples
npm run knowledge:refresh ofac
npm run knowledge:refresh eu-sanctions
npm run knowledge:refresh distances
npm run knowledge:refresh jwc
npm run knowledge:refresh eca
npm run knowledge:refresh panama-tariffs
```

### Refresh Multiple Sources

```bash
# Sequential refresh (recommended for heavy sources)
npm run knowledge:refresh ofac && \
npm run knowledge:refresh eu-sanctions

# Or use the admin dashboard trigger (background jobs)
curl -X POST http://localhost:3000/api/admin/knowledge/refresh \
  -H "Content-Type: application/json" \
  -d '{"slug": "ofac"}'
```

### Check Refresh Logs

```bash
# View sync log for a specific source
sqlite3 data/quantika.db <<SQL
SELECT
  id,
  status,
  started_at,
  finished_at,
  rows_changed,
  duration_ms,
  error_message
FROM knowledge_sync_log
WHERE source_slug = 'ofac'
ORDER BY started_at DESC
LIMIT 10;
SQL
```

---

## Incident Response

### Scenario 1: Sanctions Cron Failed

**Symptom:** No heartbeat from `sanctions-daily` cron after 02:00 UTC.

**Diagnosis:**

1. Check journal logs:
   ```bash
   journalctl -u quantika-sanctions-refresh.service -n 100
   ```

2. Look for error patterns:
   - `Error: CRON_SECRET env var is required` → Missing env var
   - `[OFAC] ✗ Failed: Network timeout` → Treasury.gov down
   - `[EU] ✗ Failed: XML parse error` → Malformed upstream data

**Fix:**

1. If **network timeout** → Retry manually:
   ```bash
   npm run knowledge:refresh ofac
   npm run knowledge:refresh eu-sanctions
   ```

2. If **CRON_SECRET missing** → Add to `/opt/quantika/app/.env`:
   ```bash
   echo "CRON_SECRET=<secret>" >> /opt/quantika/app/.env
   systemctl restart quantika-sanctions-refresh.timer
   ```

3. If **upstream data malformed** → Check Sentry, file GitHub issue, contact upstream.

### Scenario 2: Source Shows "failing" Health Signal

**Symptom:** Source status shows `consecutive_failures >= 3`.

**Diagnosis:**

1. Check last error:
   ```bash
   sqlite3 data/quantika.db "SELECT last_error FROM knowledge_sources WHERE slug = 'ofac';"
   ```

2. Check sync log for stack trace:
   ```bash
   sqlite3 data/quantika.db "SELECT error_message FROM knowledge_sync_log WHERE source_slug = 'ofac' AND status = 'failure' ORDER BY started_at DESC LIMIT 1;"
   ```

**Fix:**

1. Identify root cause (network, parsing, schema change)
2. Fix code if needed (e.g., update XML parser)
3. Retry manual refresh:
   ```bash
   npm run knowledge:refresh ofac
   ```

4. Reset failure counter (if false positive):
   ```bash
   sqlite3 data/quantika.db "UPDATE knowledge_sources SET consecutive_failures = 0, status = 'unknown' WHERE slug = 'ofac';"
   ```

### Scenario 3: Searoute Service Down

**Symptom:** Distance calculations fail, `distances` source shows `failed`.

**Diagnosis:**

1. Check if searoute service is running:
   ```bash
   systemctl status quantika-searoute.service
   ```

2. Test searoute endpoint:
   ```bash
   curl http://localhost:8001/health
   ```

**Fix:**

1. Restart service:
   ```bash
   systemctl restart quantika-searoute.service
   ```

2. Check logs:
   ```bash
   journalctl -u quantika-searoute.service -n 100
   ```

3. If Python service crashes on startup → check `services/searoute/requirements.txt` dependencies

### Scenario 4: Stale Data (Overdue Source)

**Symptom:** Source shows `health_signal: overdue`, `days_since_sync > stale_threshold_days`.

**Fix:**

1. Check if source is `manual` refresh mode:
   ```bash
   sqlite3 data/quantika.db "SELECT slug, refresh_mode, stale_threshold_days, days_since_sync FROM knowledge_sources WHERE health_signal = 'overdue';"
   ```

2. Manually refresh:
   ```bash
   npm run knowledge:refresh <slug>
   ```

3. If refresh not needed (e.g., Panama tariffs stable for 2 years) → Increase threshold:
   ```bash
   sqlite3 data/quantika.db "UPDATE knowledge_sources SET stale_threshold_days = 730 WHERE slug = 'panama-tariffs';"
   ```

---

## Adding a New Knowledge Source

### Step 1: Register Source in Bootstrap

Edit `lib/knowledge/bootstrap.ts`:

```ts
registerSource(db, {
  slug: 'new-source',
  name: 'New Regulatory Source',
  kind: 'structured_rows',
  category: 'regulatory',
  refresh_mode: 'manual',
  stale_threshold_days: 90,
  source_url: 'https://example.com/data',
  license: 'Public Domain',
  refresh_command: 'npm run knowledge:refresh new-source',
  primary_table: 'new_source_data',
  freshness_check_sql: 'SELECT COUNT(*) FROM new_source_data',
});
```

### Step 2: Create Migration for Domain Table

```ts
// lib/migrations/018-new-source.ts
export default {
  version: 18,
  name: 'new-source',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS new_source_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ...
      );
    `);
  },
  down(db) {
    db.exec(`DROP TABLE IF EXISTS new_source_data;`);
  },
};
```

Register migration in `lib/migrations/index.ts`.

### Step 3: Create Adapter

```ts
// lib/knowledge/new-source/adapter.ts
import { reportSyncStarted, reportSyncSuccess, reportSyncFailure } from '../governance';

export async function refreshNewSource(db: Database) {
  const syncId = reportSyncStarted(db, 'new-source');

  try {
    // 1. Fetch upstream data
    const response = await fetch('https://example.com/data');
    const data = await response.json();

    // 2. Parse and validate
    const rows = parseData(data);

    // 3. Insert into domain table
    const insertStmt = db.prepare('INSERT INTO new_source_data (...) VALUES (...)');
    const transaction = db.transaction((rows) => {
      db.exec('DELETE FROM new_source_data'); // full replace
      for (const row of rows) {
        insertStmt.run(row);
      }
    });
    transaction(rows);

    // 4. Report success
    reportSyncSuccess(db, syncId, {
      rowsChanged: rows.length,
      upstreamVersion: data.version,
    });

    return { rowsChanged: rows.length };
  } catch (error) {
    reportSyncFailure(db, syncId, error as Error);
    throw error;
  }
}
```

### Step 4: Add CLI Handler

```ts
// scripts/knowledge/sources/new-source.ts
import { getStore } from '@/lib/session-store';
import { refreshNewSource } from '@/lib/knowledge/new-source/adapter';

export async function refresh() {
  const db = getStore().getDb();
  await refreshNewSource(db);
}
```

Update `scripts/knowledge/refresh.ts` to include `'new-source'` in `KNOWN_SLUGS`.

### Step 5: Test

```bash
# Run migration
npm run migrate

# Test refresh
npm run knowledge:refresh new-source

# Check status
npm run knowledge:status | grep new-source
```

---

## Rollback Procedures

### Feature Flag Rollback (Per Source)

All knowledge sources have feature flags. To disable a source without removing data:

**Example: Disable OFAC sanctions lookups**

1. Set env var:
   ```bash
   echo "KNOWLEDGE_SANCTIONS_REAL=false" >> .env
   ```

2. Restart app:
   ```bash
   pm2 restart quantika
   ```

3. Verify fallback:
   ```bash
   curl http://localhost:3000/api/sanctions/check?name="test"
   # Should return fallback behavior (fixtures or empty results)
   ```

**Available flags:**

| Flag | Controls |
|------|----------|
| `KNOWLEDGE_SANCTIONS_REAL` | OFAC + EU sanctions lookups |
| `KNOWLEDGE_LAYER_DISTANCES_ENABLED` | Auto-distance calculations in `/api/voyage/tce` |
| `KNOWLEDGE_WAR_RISK_FROM_DB` | JWC war risk zones from DB vs. hardcoded rates |

### Data Rollback (Migration Down)

If a migration causes production issues:

```bash
# Rollback to previous migration
npm run migrate:down

# Example: rollback migration 017 (ECA zones)
sqlite3 data/quantika.db "UPDATE schema_version SET version = 16;"
npm run migrate
```

**Note:** Data will be lost. Take a backup first:

```bash
cp data/quantika.db data/quantika.db.backup-$(date +%Y%m%d-%H%M%S)
```

### Full Rollback (Git Revert)

If entire Knowledge Layer Phase 1 needs rollback:

```bash
# Checkout previous stable commit
git log --oneline | head -20
git checkout <commit-before-knowledge-phase1>

# Rebuild and restart
npm install
npm run build
pm2 restart quantika
```

---

## Troubleshooting

### Q: How do I check if a source is fresh?

```bash
npm run knowledge:status
```

Look at `health_signal` column:
- `ok` = fresh
- `overdue` = stale but not critical
- `failing` = 3+ consecutive failures
- `never_synced` = never refreshed

### Q: How do I manually trigger a refresh from the dashboard?

1. Open `/admin/knowledge`
2. Find the source in the table
3. Click "Refresh" button
4. Wait for background job to complete (check `knowledge_sync_log` table)

### Q: Why is the sanctions cron not running?

Check:

1. Timer enabled: `systemctl is-enabled quantika-sanctions-refresh.timer`
2. Timer active: `systemctl status quantika-sanctions-refresh.timer`
3. Next run: `systemctl list-timers | grep sanctions`
4. `CRON_SECRET` env var set in `/opt/quantika/app/.env`

### Q: How do I debug a failed refresh?

1. Check Sentry for error traces (tag: `knowledge_source`)
2. Check `knowledge_sync_log` table for `error_message`
3. Run manual refresh with verbose logging:
   ```bash
   DEBUG=* npm run knowledge:refresh <slug>
   ```

### Q: How do I reset a source to "unknown" status?

```bash
sqlite3 data/quantika.db <<SQL
UPDATE knowledge_sources
SET status = 'unknown', consecutive_failures = 0, last_error = NULL
WHERE slug = '<slug>';
SQL
```

### Q: How do I check which sources are auto-refreshed vs manual?

```bash
sqlite3 data/quantika.db "SELECT slug, refresh_mode FROM knowledge_sources ORDER BY refresh_mode, slug;"
```

- `auto-daily` = cron (sanctions only)
- `manual` = triggered by ops
- `one-shot` = refresh once, rarely updated

### Q: How do I view the sync history for a source?

```bash
sqlite3 data/quantika.db <<SQL
SELECT
  started_at,
  finished_at,
  status,
  rows_changed,
  duration_ms,
  SUBSTR(error_message, 1, 100) AS error_preview
FROM knowledge_sync_log
WHERE source_slug = 'ofac'
ORDER BY started_at DESC
LIMIT 20;
SQL
```

---

## Reference

### Knowledge Source Inventory (Phase 1)

| Slug | Name | Category | Refresh Mode | Threshold (days) |
|------|------|----------|--------------|------------------|
| `ofac` | OFAC SDN List | sanctions | auto-daily | 2 |
| `eu-sanctions` | EU Consolidated Sanctions | sanctions | auto-daily | 2 |
| `distances` | Port Distances (searoute) | reference | one-shot | 365 |
| `jwc` | JWC Listed Areas (War Risk) | regulatory | manual | 100 |
| `eca` | ECA Zones (MARPOL Annex VI) | regulatory | one-shot | 1500 |
| `panama-tariffs` | Panama Canal Tariffs | regulatory | manual | 365 |
| `imsbc` | IMSBC Code (Phase 2) | regulatory | one-shot | 800 |
| `igc` | IGC Grain Code (Phase 2) | regulatory | one-shot | 800 |
| `unlocode` | UN/LOCODE (Phase 2) | reference | manual | 200 |
| `baltic-indices` | Baltic Indices (Phase 2) | market | manual | 14 |

### CLI Commands

```bash
# Status
npm run knowledge:status

# Refresh single source
npm run knowledge:refresh <slug>

# View logs
journalctl -u quantika-sanctions-refresh.service -n 100

# Check cron heartbeat
curl http://localhost:3000/api/admin/cron-heartbeat \
  -H "X-Cron-Secret: $CRON_SECRET"
```

### Key Env Vars

| Var | Purpose | Required? |
|-----|---------|-----------|
| `CRON_SECRET` | Auth token for cron heartbeat endpoint | Yes (cron) |
| `KNOWLEDGE_SANCTIONS_REAL` | Enable/disable sanctions lookups | No (default: true) |
| `KNOWLEDGE_LAYER_DISTANCES_ENABLED` | Enable/disable auto-distance calc | No (default: true) |
| `KNOWLEDGE_WAR_RISK_FROM_DB` | Enable/disable JWC war risk zones | No (default: true) |

---

## Support

- **Logs:** `journalctl -u quantika-*`
- **Sentry:** Check tag `knowledge_source` for alerts
- **Admin Dashboard:** `/admin/knowledge`
- **Health API:** `GET /api/health/knowledge`
- **GitHub Issues:** File issue with `knowledge-layer` label

For urgent production issues, escalate to on-call engineer.
