# Market Indices — CSV Update Guide

Manual weekly update protocol for BHSI, TMI, and Drewry BB indices.

**When to upgrade to paid API:** when monthly revenue exceeds €2,000 — see `docs/SERVICES-DEFERRED.md`.

## How it works

- CSV files live in `lib/sample-data/market/`
- At server boot, if `market_indices` DB table is empty, rows are loaded from CSVs automatically
- The admin API endpoint allows uploading new rows without redeployment

## Weekly update (Monday 09:00)

### Option A: CSV commit (redeploy required)

1. Open the public source for each index (links below)
2. Note the last Friday close value
3. Add a row to the CSV file:

```
# lib/sample-data/market/bhsi-snapshots.csv
2026-05-16,1251,USD/day,https://www.balticexchange.com/en/data-services/market-information.html
```

4. Commit and push:
```bash
git add lib/sample-data/market/
git commit -m "data(market): weekly snapshot 2026-W20"
git push
```
5. Redeploy on VPS (PM2 restarts, boot loader picks up new rows on next cold start)

### Option B: Admin API (no redeploy)

Upload rows directly to the running server. The endpoint is idempotent — safe to call multiple times for the same date.

```bash
curl -X POST https://demo.quantika.org/api/admin/market/upload-csv \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -d '{
    "index_name": "bhsi",
    "rows": [
      {
        "date": "2026-05-16",
        "value": 1251,
        "unit": "USD/day",
        "source_url": "https://www.balticexchange.com/en/data-services/market-information.html"
      }
    ]
  }'
```

Repeat for `tmi` and `drewry-bb`.

Valid `index_name` values: `bhsi`, `tmi`, `drewry-bb`

Response (200 OK):
```json
{ "loaded": 1, "index_name": "bhsi" }
```

## Public sources

| Index | Source | Update day | URL |
|-------|--------|------------|-----|
| BHSI (Baltic Handysize Index) | Baltic Exchange public summary | Friday close | https://www.balticexchange.com/en/data-services/market-information.html |
| TMI (Toepfer Transport Market Index) | heavyliftpfi.com | Wednesday | https://heavyliftpfi.com/market-data/ |
| Drewry BB (Breakbulk index) | Drewry Shipping Insight | Weekly | https://www.drewry.co.uk/supply-chain-advisors/supply-chain-expertise/world-container-index-assessed-by-drewry |

## CSV format

```
date,value,unit,source_url
2026-05-09,1245,USD/day,https://...
2026-05-02,1198,USD/day,https://...
```

- `date` — ISO 8601, YYYY-MM-DD
- `value` — numeric (no commas, no currency symbol)
- `unit` — `USD/day` for BHSI/TMI, `USD/TEU` for Drewry BB
- `source_url` — public URL for audit trail

## Admin endpoint reference

`POST /api/admin/market/upload-csv`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `index_name` | string | yes | `bhsi`, `tmi`, or `drewry-bb` |
| `rows` | array | yes | min 1 item |
| `rows[].date` | string | yes | YYYY-MM-DD |
| `rows[].value` | number | yes | non-negative finite number |
| `rows[].unit` | string | no | defaults: `USD/day` (bhsi/tmi), `USD/TEU` (drewry-bb) |
| `rows[].source_url` | string | no | defaults to `admin-upload` |

Auth: `X-Admin-Token: $ADMIN_TOKEN` header (same token as other admin endpoints).

## Upgrade path

When paying customers reach €2,000/month revenue:
- Trading Economics API: $95/month — covers BHSI + TMI automatically
- See `docs/SERVICES-DEFERRED.md` for full upgrade decision log
