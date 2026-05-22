# Data Integrity Audit — 2026-05-22

**Scope:** Broker-facing tables in `data/sessions.db` (dev) + `data/canal.db`
**Auditor:** data-integrity-sweep worktree
**Strategy:** Broker must TRUST real data, not stubs or silently-empty tables.

---

## Verdicts by Source

| Source / Table | Rows (dev) | Freshest | Verdict | Broker Impact |
|---|---|---|---|---|
| `ofac_entities` | 19 042 | 2026-05-20 | ✅ REAL | OFAC sanctions screening OK |
| `port_distances` | 17 985 | 2026-05-17 | ✅ REAL | Route distances OK |
| `imsbc_fts` (RAG) | 49 | 2026-05-17 | ✅ REAL | Cargo RAG OK |
| `igc_fts` (RAG) | 77 | 2026-05-17 | ✅ REAL | Grain code RAG OK |
| `jwc_fts` (RAG) | 8 | 2026-05-17 | ✅ REAL | JWC bulletin RAG OK |
| `bimco_fts` (RAG) | 7 | 2026-05-17 | ⚠️ REAL but 2 failures | Vertex PERMISSION_DENIED in knowledge_sources; FTS data OK |
| `charterers` | 20 | 2026-05-17 | ✅ SEEDED-OK | Real company names (Cargill, ADM…), manual tier assignment |
| `port_da_estimates` | 94 | 2026-05-17 | ⚠️ ESTIMATED | `source='manual'/'broker-research-2026-05'` — not port-authority data |
| `psc_detention_history` | 16 | 2026-05-17 | ⚠️ SEEDED | 16-row fixture, not live PSC database |
| `roi_metrics` | 18 | 2026-05-17 | ⚠️ SYNTHETIC | Demo data |
| `fx_rates` | 200 | 2026-05-15 | ⚠️ STALE | 7 days old (C5 cron merged PR#323 — verify running on prod) |
| `baltic_indices` | 5 | 2026-05-09 | ⚠️ STALE | 13 days (threshold=14) — borderline; only 5 entries |
| `bunker_prices` | 10 | 2026-05-09 | 🔴 STALE | 14 days old, threshold=3 days |
| `eua_prices` | 1 | 2026-05-04 | 🔴 STALE | 18 days old, threshold=7 days; only 1 row |
| `canal_tariffs` (canal.db) | 22 | 2025-01-01 | ⚠️ STALE | 17 months old (Bosporus/Kiel/Panama/Suez); one-shot |
| `market_indices` | 90 | 2026-05-17 | 🔴 HARDCODED-FALLBACK | `source='seed-synthetic'` — bhsi/drewry-bb/tmi are fake |
| `eu_sanctions_entities` | 0 | — | 🔴 EMPTY | EU sanctions NOT screened; `KNOWLEDGE_SANCTIONS_REAL=true` active |
| `eca_zones` | 0→4* | — | 🔴 FIXED (dev) | Parser bug fixed; 4 MARPOL zones seeded in dev. **Prod needs apply (#approve-9)** |
| `war_risk_zones` | 0 | — | ✅ NOT CRITICAL | War risk is HARDCODED in `lib/economics/war-risk.ts`; `KNOWLEDGE_WAR_RISK_FROM_DB` flag exists in env but NO code reads it |
| `port_master` (DB) | 0 | — | ✅ NOT CRITICAL | `port-master.ts` reads `data/ports/port-master.json` (7189 entries), NOT from DB table. DB table = UN/LOCODE directory (future) |
| `matches` | 0 | — | ✅ NOT CRITICAL | Populated at runtime by broker sessions |

*\* ECA zones 0→4: `lib/knowledge/eca/parser.ts` had format mismatch (expected structured `polygon`, YAML uses `polygon_geojson` string). Fixed in this PR. Seed ran: 4 MARPOL Annex VI zones in worktree dev DB.*

---

## 🔴 Critical Issues — Broker Sees Fake/Missing Data

### 1. `eca_zones` — EMPTY (silently returns 0% ECA surcharge)
**Impact:** `calculateEcaFuelPortion()` returns `0.0` when `zones.length === 0`.
Every voyage through North Sea / Baltic / Mediterranean silently shows no ECA surcharge.
Voyage P&L is understated for any EU/North Sea route.

**Root cause:** `parser.ts` expected structured `polygon:` YAML key but `marpol-annex-vi.yaml` uses `polygon_geojson:` (raw JSON string). Never caught because seed was never run end-to-end.

**Dev fix:** Parser fixed in this PR. Seed ran successfully: 4 zones inserted.

**Prod fix (needs #approve-9):**
```bash
# On VPS after deploying this PR:
cd /var/www/quantika-demo
npx tsx scripts/knowledge/sources/eca.ts
```

---

### 2. `eu_sanctions_entities` — EMPTY (EU list not screened)
**Impact:** `KNOWLEDGE_SANCTIONS_REAL=true` in `.env.local`. `scanActiveDeals()` queries `sanction_corpus_view` which UNION-ALLs OFAC + EU. EU portion returns 0 rows → EU-sanctioned entities pass without a flag.
OFAC (19 042 rows) is working correctly.

**Root cause:** `EU_SANCTIONS_TOKEN=n00mo9i3` set in env but `knowledge_sources.eu-sanctions` status=`unknown` (never synced). Token likely invalid/expired.

**Prod fix (needs #approve-9):**
1. Rotate token at https://webgate.ec.europa.eu/fsd/fsf (free, institutional registration)
2. Set `EU_SANCTIONS_TOKEN=<new-token>` in `.env.production`
3. `npm run knowledge:refresh eu-sanctions`

---

### 3. `market_indices` — SYNTHETIC DATA
**Impact:** `source='seed-synthetic'` for all 90 rows (indices: bhsi, drewry-bb, tmi).
Broker sees fake Baltic/Drewry benchmarks in market comparison screens.

**Root cause:** Real market data sources (Toepfer TMI, Baltic Exchange, Drewry) require API keys or scraping. Seeded synthetic data as placeholder.

**Fix:** Either subscribe to a data provider (Toepfer, Baltic, Drewry) or label UI clearly as "Indicative / Not Live". Not a cheap dev-side fix.

---

## ⚠️ Stale Data (needs cron verification)

### 4. `bunker_prices` — 14 days old (threshold: 3 days)
Last: 2026-05-09. `bunker-usda` / `bunker-shipandbunker` status=`unknown`.
**Prod fix:** `npx tsx scripts/knowledge/cron/refresh-bunker.ts`

### 5. `eua_prices` — 18 days old (threshold: 7 days), only 1 row
Last: 2026-05-04. `eua-eex` / `eua-icap` status=`unknown`.
**Prod fix:** `npx tsx scripts/knowledge/cron/refresh-eua.ts`

### 6. `fx_rates` — 7 days old
Last: 2026-05-15. C5 cron PR#323 merged — verify it ran on prod.
**Prod fix:** `npm run cron:fx-rates` (or verify PM2 cron schedule)

### 7. `baltic_indices` — 13 days old (threshold: 14 days)
Borderline. Only 5 rows. `baltic-indices` status=`unknown`.
**Prod fix:** `npm run knowledge:refresh baltic-indices`

---

## Dev Cheap Fixes Applied

| Fix | File | Status |
|---|---|---|
| ECA parser: accept `polygon_geojson` string from YAML | `lib/knowledge/eca/parser.ts` | ✅ Applied + tested |
| ECA zones seed (4 MARPOL zones) | worktree `data/sessions.db` | ✅ Seeded |

---

## Prod Fixes Requiring Approve (#approve-9)

```bash
# 1. ECA zones (after PR merge)
npx tsx scripts/knowledge/sources/eca.ts

# 2. EU sanctions token rotation
# → rotate at webgate.ec.europa.eu/fsd/fsf
# → set EU_SANCTIONS_TOKEN=<new> in .env.production
npm run knowledge:refresh eu-sanctions

# 3. Bunker prices refresh
npx tsx scripts/knowledge/cron/refresh-bunker.ts

# 4. EUA prices refresh
npx tsx scripts/knowledge/cron/refresh-eua.ts

# 5. FX rates — verify C5 cron is running
pm2 status | grep quantika
# or manual: npm run cron:fx-rates

# 6. Baltic indices
npm run knowledge:refresh baltic-indices
```

---

## Env/Flag Notes

- `KNOWLEDGE_WAR_RISK_FROM_DB=true` in `.env.local` — **has no effect**: no code in `app/` or `lib/` reads this flag. War risk is always hardcoded (`JWC_HRA_ZONES` in `lib/economics/war-risk.ts`). Flag is planned but unimplemented.
- `KNOWLEDGE_SANCTIONS_REAL=true` + `eu_sanctions_entities=0` = **silent EU gap** (see issue #2 above).
- `bimco` knowledge_sources shows 2 consecutive failures: `PERMISSION_DENIED on resource project quantika-demo-2026` — Vertex AI permission issue, not affecting SQLite RAG path.
