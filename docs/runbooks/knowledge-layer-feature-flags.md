# Knowledge Layer Feature Flags

**Phase:** 1
**Last updated:** 2026-05-06
**Owner:** Quantika Demo team
**Activation order:** sanctions → distances → war_risk → (later) RAG

---

## Overview

The Knowledge Layer introduces real data sources for sanctions screening, port distances, and war-risk zones. All flags default to `false` — the application runs with safe fallbacks (hardcoded values or fixture data) until each source is explicitly validated and activated. This safety-first approach means:

- A misconfigured or unavailable data source never causes a 5xx in production.
- Each source can be activated independently, in the recommended order below.
- Any flag can be reverted in under 5 minutes without a code deploy.

---

## Flag Index

| Flag | Default | Phase 1 Task |
|------|---------|--------------|
| `KNOWLEDGE_SANCTIONS_REAL` | `false` | C6 — replace sentinel.ts fixtures with live OFAC+EU corpus |
| `KNOWLEDGE_LAYER_DISTANCES_ENABLED` | `false` | D7 — migrate voyage/tce to use searoute-py distances |
| `KNOWLEDGE_WAR_RISK_FROM_DB` | `false` | E3 — JWC war-risk adapter integration |
| `KNOWLEDGE_LAYER_RAG_ENABLED` | `false` | Phase 2 placeholder — do not activate in Phase 1 |
| `ADMIN_TOKEN` | *(secret)* | Required for `/api/admin/knowledge/*` endpoints |

---

## Detailed Flags

### KNOWLEDGE_SANCTIONS_REAL

- **Default:** `false`
- **Purpose:** When `true`, sanctions checks route through the live OFAC + EU corpus stored in SQLite (`sanction_corpus_view`). When `false`, falls back to `sentinel.ts` static fixtures — no real screening takes place.
- **Cutover acceptance criteria:**
  - OFAC SDN list and EU Consolidated List adapters have completed at least one successful sync (check `knowledge_sync_log` for `source_slug = 'ofac-sdn'` and `'eu-consolidated'` with `status = 'ok'`).
  - `sanction_corpus_view` returns > 0 rows.
  - Smoke test: POST `/api/match` with a known sanctioned entity name returns `sanctions_hit: true`.
  - Smoke test: POST `/api/match` with a clean entity returns `sanctions_hit: false`.
- **Rollback (< 5 min):**
  1. Set `KNOWLEDGE_SANCTIONS_REAL=false` in `.env.production`.
  2. Reload: `pm2 reload quantika-demo` or `systemctl restart quantika-demo`.
  3. Verify: POST `/api/match` completes without 5xx; sanctions logic runs from fixtures.
- **Phase 1 task:** C6

---

### KNOWLEDGE_LAYER_DISTANCES_ENABLED

- **Default:** `false`
- **Purpose:** Routes distance queries through the Python `searoute-py` FastAPI microservice running on `outreach-vps:8200` instead of the Next.js Haversine fallback. Enables accurate sea distances (via waypoints) rather than straight-line approximations.
- **Cutover acceptance criteria:**
  - `searoute-py` service running and healthy: `curl http://outreach-vps:8200/health` returns `{"status":"ok"}`.
  - `data/knowledge/searoute-waypoints.yaml` deployed on the VPS.
  - `port_distances` table seeded (~60 K rows): `SELECT COUNT(*) FROM port_distances` > 50 000.
  - Smoke: 5 known routes (e.g., Shanghai→Rotterdam, Dubai→Hamburg) within ±5% of historical baseline values.
- **Rollback (< 5 min):**
  1. Set `KNOWLEDGE_LAYER_DISTANCES_ENABLED=false` in `.env.production`.
  2. Reload: `pm2 reload quantika-demo` or `systemctl restart quantika-demo`.
  3. Smoke check: POST `/api/match` returns distances based on Haversine (no 5xx, reasonable km values).
- **Phase 1 task:** D7

---

### KNOWLEDGE_WAR_RISK_FROM_DB

- **Default:** `false`
- **Purpose:** When `true`, JWC war-risk zone lookups (`war-risk.ts`) use the `jwc_zones` table populated by the JWC adapter. When `false`, falls back to the existing hardcoded behavior in `war-risk.ts`.
- **Cutover acceptance criteria:**
  - JWC adapter has synced at least one zone set: `SELECT COUNT(*) FROM jwc_zones` > 0.
  - `knowledge_sources` row for `'jwc-zones'` has `status = 'ok'`.
  - Smoke: POST `/api/match` with a voyage through a known high-risk area (e.g., Red Sea, Gulf of Aden) returns `war_risk_rate` > 0.
  - Regression: POST `/api/match` with a voyage through a safe corridor returns same or lower `war_risk_rate` as before.
- **Rollback (< 5 min):**
  1. Set `KNOWLEDGE_WAR_RISK_FROM_DB=false` in `.env.production`.
  2. Reload: `pm2 reload quantika-demo` or `systemctl restart quantika-demo`.
  3. Verify: `/api/match` returns war-risk values from hardcoded logic (no 5xx).
- **Phase 1 task:** E3

---

### KNOWLEDGE_LAYER_RAG_ENABLED

- **Default:** `false`
- **Purpose:** Phase 2 placeholder. Will enable RAG (Retrieval-Augmented Generation) queries against the Vertex AI vector index using `text-multilingual-embedding-002`. **Do not activate in Phase 1** — the vector index is not seeded yet.
- **Cutover acceptance criteria:** *(Phase 2 — to be defined)*
  - Vector index populated in Vertex AI.
  - Embedding API latency p95 < 2 s.
  - At least 3 RAG smoke queries return relevant knowledge snippets.
- **Rollback (< 5 min):**
  1. Set `KNOWLEDGE_LAYER_RAG_ENABLED=false` in `.env.production`.
  2. Reload: `pm2 reload quantika-demo` or `systemctl restart quantika-demo`.
  3. Verify: endpoints that use RAG fall back to non-RAG logic without errors.
- **Phase 1 task:** Phase 2 (not scheduled)

---

### ADMIN_TOKEN

- **Default:** *(must be set to a secret value — not a feature flag)*
- **Purpose:** Bearer token required for all `/api/admin/knowledge/*` endpoints (health dashboard, manual sync triggers, freshness checks). Without it, admin routes return 401.
- **Setup:** Set a strong random value in `.env.production`:
  ```bash
  openssl rand -hex 32
  ```
- **Phase 1 task:** Required for all Block A–H admin endpoints (not a cutover flag — set before first deploy).

---

## Activation Order (Recommended)

Activate in this sequence after Phase 1 deploy. Each step assumes the previous one is green.

1. **Sanctions (`KNOWLEDGE_SANCTIONS_REAL=true`)** — after OFAC + EU adapters complete first sync and corpus row count > 0. Lowest blast radius: fallback is fixtures, not broken logic.
2. **Distances (`KNOWLEDGE_LAYER_DISTANCES_ENABLED=true`)** — after `searoute-py` is confirmed healthy on VPS, waypoints deployed, and `port_distances` seed complete (~60 K rows). Higher blast radius: affects all voyage TCE calculations.
3. **War-risk (`KNOWLEDGE_WAR_RISK_FROM_DB=true`)** — after JWC zones sync and regression smoke passes. Activate last because it can change pricing significantly.
4. **RAG (`KNOWLEDGE_LAYER_RAG_ENABLED=true`)** — Phase 2 only. Do not activate in Phase 1.

---

## Emergency Rollback (All Flags Off)

To disable all Knowledge Layer flags in one command:

```bash
sed -i.bak -E 's/^(KNOWLEDGE_.*=)true/\1false/' /opt/quantika/.env.production && pm2 reload quantika-demo
```

This creates a `.env.production.bak` backup before modification. To restore from backup:

```bash
cp /opt/quantika/.env.production.bak /opt/quantika/.env.production && pm2 reload quantika-demo
```

---

## Verification Commands

### Check all flag statuses at runtime

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://demo.quantika.org/api/admin/knowledge/health | jq .
```

Expected response shape:
```json
{
  "sources": [
    { "slug": "ofac-sdn", "status": "ok", "last_synced_at": "...", "row_count": 12000 },
    { "slug": "eu-consolidated", "status": "ok", "last_synced_at": "...", "row_count": 2500 },
    { "slug": "port-distances", "status": "ok", "row_count": 60000 },
    { "slug": "jwc-zones", "status": "ok", "row_count": 45 }
  ],
  "feature_flags": {
    "KNOWLEDGE_SANCTIONS_REAL": true,
    "KNOWLEDGE_LAYER_DISTANCES_ENABLED": true,
    "KNOWLEDGE_WAR_RISK_FROM_DB": false,
    "KNOWLEDGE_LAYER_RAG_ENABLED": false
  }
}
```

### Verify individual flags are active

```bash
# Sanctions flag
curl -s -X POST https://demo.quantika.org/api/match \
  -H "Content-Type: application/json" \
  -d '{"shipper":"Test Co","origin":"CNSHA","destination":"NLRTM"}' | jq '.sanctions_source'
# Should be "live_corpus" when KNOWLEDGE_SANCTIONS_REAL=true, "fixtures" when false

# Distances flag
curl -s -X POST https://demo.quantika.org/api/match \
  -H "Content-Type: application/json" \
  -d '{"origin":"CNSHA","destination":"NLRTM","vessel_type":"bulk"}' | jq '.distance_source'
# Should be "searoute" when KNOWLEDGE_LAYER_DISTANCES_ENABLED=true, "haversine" when false

# War-risk flag
curl -s -X POST https://demo.quantika.org/api/match \
  -H "Content-Type: application/json" \
  -d '{"origin":"CNSHA","destination":"NLRTM","via":["red_sea"]}' | jq '.war_risk_source'
# Should be "jwc_db" when KNOWLEDGE_WAR_RISK_FROM_DB=true, "hardcoded" when false
```

### Check searoute-py microservice health (VPS)

```bash
curl -s http://outreach-vps:8200/health
# Expected: {"status":"ok","version":"..."}
```

### Check port_distances seed count

```bash
sqlite3 /opt/quantika/data/quantika.db "SELECT COUNT(*) FROM port_distances;"
# Expected: > 50000
```
