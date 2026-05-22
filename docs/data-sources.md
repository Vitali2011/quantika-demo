# Data Sources — Quantika Demo

> Inventory of every broker-facing table: whether seeded data is **REAL** (from an
> external authoritative source) or **SYNTHETIC** (fixtures / LLM-generated / hardcoded),
> whether a committed seed/refresh script exists, and known gaps.
>
> **Rule**: this document is the single source of truth for data provenance.
> Update it whenever a seed script, refresh cron, or table schema changes.
>
> Last reviewed: 2026-05-22  
> Audit tool: `npx tsx scripts/data-integrity-check.ts`  
> Dev sync: `bash scripts/sync-dev-from-prod.sh`

---

## Dev / Prod separation

Dev and prod databases are **intentionally separate** SQLite files.  
The single source of truth is the **code in git** (seed scripts + refresh crons),
not a shared database file.

| Environment | DB path                                     | How populated                    |
|-------------|---------------------------------------------|----------------------------------|
| Prod (VPS)  | `/root/quantika-demo/data/sessions.db`      | Migrations + crons + seeds       |
| Dev (local) | `./data/sessions.db` (or `SESSIONS_DB_PATH`) | Migrations + seeds or prod snapshot |

To point dev at a prod snapshot: `bash scripts/sync-dev-from-prod.sh`

---

## Tables by category

### Operational (generated at runtime, no seed needed)

| Table | Source type | Seed script | Notes |
|-------|-------------|-------------|-------|
| `sessions` | SYNTHETIC | — | Demo sessions; ephemeral by design |
| `parsed_results` | SYNTHETIC | `scripts/seed-sample-data.ts` | Demo fixtures in `lib/sample-data/`; real parsed results arrive via email pipeline |
| `matches` | SYNTHETIC | — | AI-generated cargo-vessel pairs; no external source |
| `ai_audit` | REAL | — | Written by every LLM call via `writeAuditRecord`; no seed |
| `notifications` | SYNTHETIC | — | In-app alerts; generated at runtime |
| `emails` | REAL | `scripts/import-gmail-emails.ts` | Gmail OAuth import; requires `GMAIL_*` credentials |

---

### Reference (seeded from external data, stable)

| Table | Source type | Seed script | Source |
|-------|-------------|-------------|--------|
| `port_master` | REAL | `scripts/knowledge-unlocode-seed.ts` | UNECE UN/LOCODE 2024-2 CSV (free, public) |
| `port_da_estimates` | SYNTHETIC | `scripts/seed-port-da.ts` | Manual research + LLM gap-fill; no free public source |
| `port_distances` | REAL | populated at runtime | SeaRoute service (`SEAROUTE_SERVICE_URL`); distances computed on first use |
| `charterers` | SYNTHETIC | `scripts/knowledge/seeds/seed-charterers.ts` | Hardcoded blue-chip list of 20 names; no external API |
| `knowledge_sources` | REAL | auto-registered at app boot | Bootstrap in `lib/knowledge/bootstrap.ts` |

**Gap**: `port_da_estimates` has no free authoritative public source. The data is LLM-estimated
from broker market knowledge. Adding a real source (BIMCO Port Costs, Datalastic) is a paid integration.

---

### Market data (refreshed via crons)

| Table | Source type | Seed script | Refresh cron | Source / API |
|-------|-------------|-------------|--------------|--------------|
| `bunker_prices` | REAL (after refresh) | seeded in migration 023 with `static-seed` values | `scripts/knowledge/cron/refresh-bunker.ts` | USDA (primary) + Ship&Bunker (fallback) — **free** |
| `eua_prices` | REAL (after refresh) | seeded in migration 024 with static values | `scripts/knowledge/cron/refresh-eua.ts` | EEX auction CSV (primary) + ICAP (fallback) — **free** |
| `fx_rates` | REAL | `scripts/seed-fx-rates.ts` | `scripts/knowledge/cron/refresh-fx-rates.ts` | Frankfurter API (ECB) — **free** |
| `baltic_indices` | SYNTHETIC (static seed) | `scripts/knowledge-baltic-seed.ts` | — (no live refresh) | Static values as of 2026-05-09; real Baltic Exchange data is **paid** |
| `market_indices` | REAL / PAID | `scripts/knowledge/seeds/seed-market-indices.ts` | **OUT OF SCOPE** — parallel session | Drewry / Clarksons / TMI — **paid subscriptions** |

**Gaps**:
- `baltic_indices` static seed drifts from reality. Live data requires a Baltic Exchange
  subscription (~$200–500/mo). No free programmatic source exists; website scraping is
  prohibited by ToS. Current static values are acceptable for demo purposes.
- `market_indices` is intentionally excluded from this document — managed by a separate
  parallel session. Do not touch `market_indices` / `bhsi` / `drewry` / `tmi` here.

---

### Compliance (refreshed via crons)

| Table | Source type | Seed script | Refresh cron | Source |
|-------|-------------|-------------|--------------|--------|
| `eu_sanctions_entities` | REAL | — (cron is initial seed) | `scripts/knowledge/cron/refresh-sanctions.ts` | EU Official Journal XML — **free** |
| `ofac_entities` | REAL | — (cron is initial seed) | `scripts/knowledge/cron/refresh-sanctions.ts` | US Treasury OFAC SDN list — **free** |
| `war_risk_zones` | REAL | `scripts/knowledge-jwc-yaml-seed.ts` | — (manually updated) | JWC Listed Areas (`JWC_SOURCE_URL`) — **free** to read, no API |

**Gap**: `war_risk_zones` has no automated refresh cron. Updates require:
1. Monitor JWC listed areas page: `https://lmalloyds.com/specialist-areas/underwriting/listed-areas/`
2. Update the YAML fixtures
3. Re-run `scripts/knowledge-jwc-yaml-seed.ts`

A cron that auto-scrapes the JWC page would need HTML parsing; medium complexity, no blocker.

---

### Analytics (seeded with synthetic fixtures)

| Table | Source type | Seed script | Source |
|-------|-------------|-------------|--------|
| `roi_metrics` | SYNTHETIC | `scripts/seed-roi-metrics.ts` | Deterministic LCG seed (18 rows); no external source. Used by ROI Guarantee feature. |
| `psc_detention_history` | SYNTHETIC | `scripts/knowledge/seeds/seed-psc-history.ts` | Fixture from `lib/knowledge/sources/psc/fixture.ts`. Real data: Equasis — **paid** (~€100/yr, requires registration). |

**Gap**: `psc_detention_history` uses synthetic fixture data. Equasis API (real PSC inspections)
requires registration + fee. For a production system, integrate Equasis or scrape Paris/Tokyo MoU
(free but rate-limited HTML). No committed refresh script exists for real PSC data.

---

### Knowledge RAG tables (embedded document vectors)

| Table | Source type | Seed script | Source |
|-------|-------------|-------------|--------|
| `imsbc_vec` / `imsbc_fts` | REAL | `scripts/knowledge-imsbc-embed.ts` | IMSBC Code (IMO publication) — **paid** physical document; fixture text in repo |
| `igc_vec` / `igc_fts` | REAL | `scripts/knowledge-igc-embed.ts` | IGC Code (IMO) — **paid**; fixture text in repo |
| `jwc_vec` / `jwc_fts` | REAL | `scripts/knowledge-jwc-embed.ts` / `scripts/knowledge-jwc-yaml-seed.ts` | JWC Listed Areas — **free** |
| `bimco_vec` / `bimco_fts` | REAL | `scripts/seed-bimco-clauses.ts` | BIMCO charter party clauses — fixture in `lib/knowledge/sources/bimco/`; **paid** origin |

---

### Other tables (infrastructure / integrations)

| Table | Source type | Notes |
|-------|-------------|-------|
| `pipedrive_deal_mapping` / `pipedrive_tokens` | REAL | Populated via Pipedrive webhook + OAuth; requires `PIPEDRIVE_*` env vars |
| `opensanctions_cache` | REAL | Response cache for OpenSanctions API (`OPENSANCTIONS_API_KEY`); TTL-based |
| `trial_state` | SYNTHETIC | Per-user trial flag; set via admin API |
| `whatsapp_users` | REAL | WhatsApp contacts; populated via WhatsApp webhook |
| `schema_migrations` | INTERNAL | Managed by `lib/migrations/runner.ts`; do not seed manually |

---

## Seed execution order (fresh install)

Run in this order for a fully populated dev environment:

```bash
# 1. Migrations run automatically on first app start (or via seed scripts)

# 2. Reference tables
npx tsx --env-file=.env.local scripts/knowledge-unlocode-seed.ts    # port_master
npx tsx --env-file=.env.local scripts/seed-port-da.ts               # port_da_estimates
npx tsx --env-file=.env.local scripts/knowledge/seeds/seed-charterers.ts  # charterers

# 3. Compliance (requires internet)
npx tsx --env-file=.env.local scripts/knowledge/cron/refresh-sanctions.ts  # eu_sanctions + ofac
npx tsx --env-file=.env.local scripts/knowledge-jwc-yaml-seed.ts           # war_risk_zones

# 4. Market data (requires internet)
npx tsx --env-file=.env.local scripts/seed-fx-rates.ts              # fx_rates (30 days ECB)
npx tsx --env-file=.env.local scripts/knowledge/cron/refresh-bunker.ts    # bunker_prices
npx tsx --env-file=.env.local scripts/knowledge/cron/refresh-eua.ts       # eua_prices
npx tsx --env-file=.env.local scripts/knowledge-baltic-seed.ts       # baltic_indices (static)

# 5. Analytics seeds
npx tsx --env-file=.env.local scripts/seed-roi-metrics.ts            # roi_metrics
npx tsx --env-file=.env.local scripts/knowledge/seeds/seed-psc-history.ts  # psc_detention_history

# 6. Knowledge RAG (requires AI provider key for embeddings)
npx tsx --env-file=.env.local scripts/knowledge-imsbc-embed.ts
npx tsx --env-file=.env.local scripts/knowledge-igc-embed.ts
npx tsx --env-file=.env.local scripts/knowledge-jwc-embed.ts
npx tsx --env-file=.env.local scripts/seed-bimco-clauses.ts
```

Or use the post-deploy seed guard (handles idempotency):
```bash
bash scripts/ops/post-deploy-seed.sh
```

---

## Known gaps summary

| Table | Gap | Cost to close |
|-------|-----|---------------|
| `port_da_estimates` | No authoritative public source; synthetic | BIMCO Port Costs or Datalastic — **paid** |
| `baltic_indices` | Static seed drifts from live market | Baltic Exchange subscription — **paid** (~$200–500/mo) |
| `psc_detention_history` | Synthetic fixture, no live refresh | Equasis registration + fee — **~€100/yr** |
| `war_risk_zones` | No automated refresh cron | JWC scraper — medium effort, free source |
| `market_indices` | Out of scope — separate session | Drewry / Clarksons / TMI — **paid** |
