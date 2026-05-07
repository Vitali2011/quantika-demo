# ADR: Knowledge Layer Architecture

**Date:** 2026-05-06
**Status:** Accepted
**Deciders:** Vitali, Engineering Team
**Related:** [Knowledge Layer Design Document](../plans/2026-05-05-knowledge-layer-design.md), [Runbook](../runbooks/knowledge-layer.md)

---

## Context

Quantika Demo is transitioning from a polished demo to a production-grade freight forwarding tool. The first pilot is scheduled within 2-3 months. Currently, critical business data is either:

1. **Fabricated** (demo fixtures for OFAC sanctions, hardcoded war-risk rates)
2. **Manually entered** (distances between ports, Panama Canal tariffs)
3. **Stale** (war-risk 0.075% for Red Sea vs. actual 0.5%+)
4. **Missing** (no ECA zones, no regulatory RAG for IMSBC/IGC codes)

This creates three problems:

- **Trust erosion** — brokers testing the pilot will immediately detect fake data
- **Operational overhead** — manual data entry doesn't scale beyond 10-20 quotes/day
- **Compliance risk** — outdated sanctions lists, wrong war-risk rates → legal liability

We need a **unified system** to manage regulatory, market, and reference data with:

- Single source of truth for data freshness
- Automated refresh for time-sensitive sources (sanctions)
- Observable governance (dashboard, health API, alerts)
- Zero-cost data feeds (no SaaS subscriptions)
- Rollback capability per source (feature flags)

**Budget constraint:** $0/month for data feeds. All sources must use free, legitimate alternatives to commercial APIs.

**Time constraint:** Phase 1 must ship in 4 weeks to unblock pilot preparation.

---

## Decision

We will implement a **Knowledge Layer** with three architectural pillars:

### 1. Governance Meta-Table Pattern

**Decision:** Introduce two governance tables (`knowledge_sources`, `knowledge_sync_log`) as the single source of truth for data freshness, status, and sync history.

**Rationale:**

- **Unified dashboard** — `/admin/knowledge` shows status of all 10 sources in one place
- **Centralized alerts** — detect stale/failing sources across all categories
- **Loose coupling** — domain tables (e.g., `ofac_entities`, `port_distances`) remain independent; adapters call governance API
- **Audit trail** — `knowledge_sync_log` provides forensics for every refresh attempt

**Schema:**

```sql
knowledge_sources (
  slug TEXT PRIMARY KEY,
  name TEXT,
  kind TEXT (structured_rows | vector_chunks | mixed),
  category TEXT (regulatory | market | reference | sanctions | geo),
  status TEXT (unknown | fresh | stale | failed),
  last_synced_at DATETIME,
  stale_threshold_days INTEGER,
  consecutive_failures INTEGER,
  refresh_command TEXT,
  refresh_mode TEXT (auto-daily | manual | one-shot),
  ...
)

knowledge_sync_log (
  id INTEGER PRIMARY KEY,
  source_slug TEXT REFERENCES knowledge_sources(slug),
  started_at DATETIME,
  finished_at DATETIME,
  status TEXT (running | success | failure),
  rows_changed INTEGER,
  error_message TEXT,
  ...
)
```

**Alternative considered:** Embed freshness metadata in each domain table (e.g., `last_updated_at` column in `ofac_entities`).
- **Rejected:** No centralized view; hard to build dashboard; can't track failed syncs without custom logging per table.

### 2. Free-Form Adapters (No Common Interface)

**Decision:** Each knowledge source has a custom adapter with no shared interface. Adapters must only call three governance functions: `reportSyncStarted()`, `reportSyncSuccess()`, `reportSyncFailure()`.

**Rationale:**

- **Heterogeneity** — sources vary wildly: XML parsing (OFAC), Python microservice (distances), GeoJSON polygons (ECA), PDF scraping (JWC). Forcing a common interface adds complexity without value.
- **Simplicity** — adapters are 50-150 lines of source-specific logic. No need for abstract base classes or dependency injection.
- **Discoverability** — three governance functions form a minimal contract. Easy to onboard new sources.

**Pattern:**

```ts
// lib/knowledge/<source>/adapter.ts
export async function refresh<Source>(db: Database) {
  const syncId = reportSyncStarted(db, '<slug>');
  try {
    // 1. Fetch upstream data
    // 2. Parse and validate
    // 3. Insert into domain table
    reportSyncSuccess(db, syncId, { rowsChanged, upstreamVersion });
  } catch (error) {
    reportSyncFailure(db, syncId, error);
    throw error;
  }
}
```

**Alternative considered:** Abstract `KnowledgeSource` interface with `fetch()`, `parse()`, `store()` methods.
- **Rejected:** Over-engineering. OFAC XML parser has nothing in common with searoute Python client. Shared interface would be 90% no-ops.

### 3. Python Microservice for Distance Calculations

**Decision:** Implement port distance calculations as a separate Python FastAPI service (searoute-py) instead of Node.js, running alongside the Next.js app under systemd.

**Rationale:**

- **searoute-py ecosystem** — Python library is mature, Apache-2.0 licensed, actively maintained (500+ commits, used in production by maritime logistics companies)
- **No Node.js equivalent** — JavaScript/TypeScript maritime routing libraries are either unmaintained or GPL-licensed (unacceptable for commercial use)
- **Performance** — Distance calculation is CPU-intensive (Dijkstra on 60K port pairs). Python + NumPy is faster than Node.js for this workload.
- **Deployment simplicity** — Single systemd service, internal HTTP API (localhost:8001), no external dependencies

**Architecture:**

```
┌──────────────────────────────┐
│ Next.js App (TypeScript)     │
│ - voyage/tce endpoint        │
│ - accepts LOCODE pairs       │
└──────────────┬───────────────┘
               │ HTTP (internal)
               ▼
┌──────────────────────────────┐
│ searoute-py Service (Python) │
│ - FastAPI on localhost:8001  │
│ - POST /calculate-distance   │
│ - systemd unit               │
└──────────────────────────────┘
```

**Alternative considered:** Port searoute-py algorithm to TypeScript.
- **Rejected:** 2000+ lines of geospatial logic, NumPy dependencies. Estimated 2-3 weeks of engineering time vs. 1 day to integrate Python service.

**Alternative considered:** Use commercial API (AtoBviaC, $200/month).
- **Rejected:** Budget constraint. Also, vendor lock-in and per-request billing risk.

---

## Consequences

### Positive

1. **Production-ready data** — All numeric outputs (distances, war-risk, sanctions) sourced from legitimate upstream authorities. No more demo fixtures.

2. **Zero SaaS costs** — All 10 sources use free/public data (OFAC treasury.gov, EU EUR-Lex, searoute-py Apache-2.0, JWC LMA PDFs). Total monthly cost: $0.

3. **Observable governance** — Single dashboard (`/admin/knowledge`) shows freshness of all sources. Public health API (`/api/health/knowledge`) for uptime monitoring.

4. **Automated sanctions** — Daily cron refreshes OFAC + EU sanctions automatically. No manual intervention unless upstream fails.

5. **Instant rollback** — Feature flags per source (`KNOWLEDGE_SANCTIONS_REAL`, `KNOWLEDGE_LAYER_DISTANCES_ENABLED`, `KNOWLEDGE_WAR_RISK_FROM_DB`) allow instant disable without data loss.

6. **Extensibility** — Adding a new source requires:
   - Register in `knowledge_sources` table (1 SQL statement)
   - Write adapter (50-150 lines)
   - Add CLI handler (10 lines)
   - Write tests (following existing patterns)

7. **Audit trail** — `knowledge_sync_log` table preserves forensics: who triggered refresh, when, how many rows changed, error messages if failed.

### Negative

1. **Operational complexity** — Two processes to manage (Next.js + searoute-py), two systemd units (app + microservice + sanctions cron timer).
   - **Mitigation:** Runbook provides clear procedures for monitoring, incident response, rollback.

2. **Python dependency** — Introduces Python 3.11 + FastAPI + searoute-py to the stack.
   - **Mitigation:** Pinned versions in `requirements.txt`, containerized (Dockerfile), systemd handles restarts. Python is mature and stable for long-running services.

3. **No real-time updates** — Sanctions refresh daily (not hourly). War-risk zones refresh quarterly.
   - **Mitigation:** Acceptable for freight forwarding use case. Real-time sanctions aren't required (OFAC updates ~1x/day). Feature flag allows emergency manual refresh if needed.

4. **Manual refresh burden** — Non-sanctions sources require manual trigger (JWC, ECA, Panama tariffs).
   - **Mitigation:** These sources update infrequently (quarterly/yearly). Dashboard shows "overdue" signal when stale. CLI command is simple: `npm run knowledge:refresh <slug>`.

5. **searoute-py single point of failure** — If Python service crashes, distance calculations fail.
   - **Mitigation:** systemd auto-restart. Health check endpoint (`/health`). Cached distances in `port_distances` table (60K rows pre-seeded for top-200 ports). UX degrades gracefully (user must enter `distanceNm` manually if LOCODE lookup fails).

6. **Migration coupling** — Migrations 013-017 form a dependency chain. Rolling back one requires careful ordering.
   - **Mitigation:** Migration down() functions are tested. Runbook documents rollback procedure. Feature flags allow disabling sources without migration rollback.

### Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| OFAC/EU upstream API down | Sanctions refresh fails | Medium | Consecutive failure alerts via Sentry (2+ failures → alert). Manual fallback to cached data (last successful sync). |
| searoute-py memory leak | Distance calculations crash | Low | systemd `Restart=always` with memory limits. Health check monitors uptime. Pre-seeded cache covers 80% of common routes. |
| Stale war-risk zones (JWC quarterly updates missed) | Incorrect war-risk quotes | Medium | Dashboard shows "overdue" signal. Sentry alert if 3+ failures. Runbook documents manual refresh procedure. |
| Migration 013-017 breaks existing tables | Data corruption | Low | Tested in CI (regression suite). Migrations are idempotent (`IF NOT EXISTS`). Rollback via `down()` functions. |
| Python version drift on VPS | searoute service fails to start | Medium | Pinned Python 3.11 in `pyproject.toml`. Containerized (Dockerfile). CI tests against exact Python version. |

---

## Alternatives Considered

### Alternative 1: Use a Data Lakehouse (DuckDB, Parquet files)

**Proposal:** Store knowledge sources as Parquet files in a data lake, query via DuckDB.

**Pros:**
- Columnar format, efficient for analytics
- Immutable data versioning (Git LFS or S3)

**Cons:**
- **Overkill** — Total data size is <100MB (sanctions 50K rows, distances 60K rows). SQLite handles this easily.
- **Operational complexity** — Need separate process for Parquet export, DuckDB query engine, S3/Git LFS for versioning.
- **No transactional writes** — Hard to implement atomic refresh (delete-then-insert).

**Decision:** Rejected. SQLite is simpler, faster for our data size, supports transactions natively.

### Alternative 2: Use Supabase (Postgres + Realtime)

**Proposal:** Migrate from SQLite to Supabase, use Postgres for knowledge tables, enable realtime subscriptions for dashboard.

**Pros:**
- Managed Postgres, auto-backups
- Realtime subscriptions (no polling)

**Cons:**
- **Cost** — Supabase free tier has 500MB limit, 2GB bandwidth/month. Sanctions + distances + embeddings ≈ 150MB + 10GB/month bandwidth (sanctions refresh daily). Would exceed free tier.
- **Lock-in** — Migrating away from Supabase is non-trivial.
- **Complexity** — Need database connection pooling, network reliability, auth.

**Decision:** Rejected. SQLite + better-sqlite3 is fast, free, local, zero-dependency. No network overhead.

### Alternative 3: Use GraphQL for Knowledge API

**Proposal:** Build a GraphQL API for querying knowledge sources instead of REST endpoints.

**Pros:**
- Single endpoint, flexible queries
- Type-safe schema

**Cons:**
- **Complexity** — Need GraphQL server (Apollo, GraphQL Yoga), schema definitions, resolvers.
- **No read-heavy queries** — Knowledge Layer is write-heavy (refresh operations), read-light (admin dashboard). GraphQL benefits (avoiding over-fetching) don't apply.

**Decision:** Rejected. REST endpoints (`GET /api/admin/knowledge-status`, `POST /api/admin/knowledge/refresh`) are simpler and sufficient.

### Alternative 4: Use Temporal for Orchestration

**Proposal:** Use Temporal workflows for sanctions cron, retry logic, and sync orchestration.

**Pros:**
- Distributed workflows, durable execution
- Built-in retries, timeouts, versioning

**Cons:**
- **Overkill** — Sanctions refresh is a single 10-minute job (fetch OFAC XML → parse → insert). No distributed coordination needed.
- **Operational burden** — Need Temporal server, workers, database.

**Decision:** Rejected. systemd timer + simple TypeScript script is sufficient. Sentry handles error tracking.

---

## Implementation Notes

### Phase 1 Scope (Shipped)

| Block | Tasks | Duration |
|-------|-------|----------|
| A | Governance meta-tables, bootstrap, types | 3 days |
| B | Admin dashboard, status API, health API, CLI | 4 days |
| C | OFAC + EU sanctions (parsers, adapters, cron) | 5 days |
| D | searoute-py microservice, distances adapter | 4 days |
| E | JWC war-risk zones (parser, adapter) | 2 days |
| F | ECA zones (GeoJSON, bunker integration) | 2 days |
| G | Panama tariffs refresh | 1 day |
| H | Vertex AI embeddings client, sqlite-vec loader | 3 days |
| FIN | Integration tests, documentation, PR | 2 days |

**Total:** 26 days (elapsed: 4 weeks with parallelization)

### Deferred to Phase 2

- **IMSBC RAG** — Vector chunks from IMSBC Code (IMO regulatory cargo guidance)
- **IGC RAG** — Vector chunks from IGC Grain Code (grain cargo regulations)
- **JWC RAG** — Vector chunks from JWC PDFs (war-risk zone narratives)
- **UNLOCODE expansion** — Full UN/LOCODE dataset (6000+ ports vs. current 120)
- **Baltic indices** — BDI, BCI, BSI, BHSI from TradingEconomics API
- **Citation UI** — Show data provenance in quote results ("Source: OFAC SDN List, updated 2026-05-06")
- **Hybrid retriever** — FTS5 + vector search + Reciprocal Rank Fusion

### Deferred to Phase 3

- **HandyBulk route fixings** — LLM extraction from HandyBulk newsletter PDFs
- **Reranking** — Vertex AI Ranking API for RAG results
- **Multi-source RAG** — Combine IMSBC + IGC + JWC in single query
- **Assistant-driven loop** — LLM asks clarifying questions before retrieval

---

## References

- [Knowledge Layer Design Document](../plans/2026-05-05-knowledge-layer-design.md)
- [Knowledge Layer Runbook](../runbooks/knowledge-layer.md)
- [searoute-py GitHub](https://github.com/genthalili/searoute-py)
- [OFAC SDN List](https://sanctionslist.ofac.treas.gov/Home/SdnList)
- [EU Consolidated Sanctions](https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions)
- [JWC Listed Areas](https://www.lmalloyds.com/LMA/Market_Places/JWC/Hull_War_Listed_Areas.aspx)
- [MARPOL Annex VI (ECA)](https://www.imo.org/en/OurWork/Environment/Pages/Emission-Control-Areas-(ECAs).aspx)
- [Panama Canal Tariffs](https://www.pancanal.com/en/price/tariff/)
- [Michael Nygard ADR Template](https://github.com/joelparkerhenderson/architecture-decision-record)

---

## Changelog

- **2026-05-06:** ADR created (Status: Accepted)
