# Knowledge Layer — Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Построить фундамент Knowledge Layer (governance meta-table + dashboard) и закрыть 5 production-критичных источников: OFAC+EU sanctions, distances (searoute-py), JWC war-risk zones, ECA zones, Panama tariffs. После Phase 1 ни один числовой output Quantika не должен быть «фиктивным».

**Architecture:** Governance meta-table `knowledge_sources` + `knowledge_sync_log` — единая точка для freshness/dashboard/alerts. Под ней — free-form адаптеры на Node (sanctions, JWC, ECA, Panama) и один Python microservice (searoute-py для distances). Daily cron только для sanctions; всё остальное — manual triggers + dashboard. См. полный design doc: [`docs/plans/2026-05-05-knowledge-layer-design.md`](./2026-05-05-knowledge-layer-design.md).

**Tech Stack:** Next.js 16 + better-sqlite3 + Vertex AI (Gemini 2.5 + text-multilingual-embedding-002) + Python 3.11 (FastAPI + searoute-py) + systemd. Tests: Jest. Reuse existing migrations runner (`lib/migrations/runner.ts`).

---

## Block A — Governance Foundation (3 дня)

### Task A1: Migration 013 — `knowledge_sources` + `knowledge_sync_log`

**Files:**

- Create: `lib/migrations/013-knowledge-sources.ts`
- Create: `__tests__/lib/migrations/013-knowledge-sources.test.ts`

**Step 1: Write failing test**

```ts
// __tests__/lib/migrations/013-knowledge-sources.test.ts
import Database from "better-sqlite3";
import migration013 from "@/lib/migrations/013-knowledge-sources";

describe("migration 013 knowledge-sources", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
  });
  afterEach(() => db.close());

  it("creates knowledge_sources table with PK on slug", () => {
    migration013.up(db);
    const cols = db.prepare("PRAGMA table_info(knowledge_sources)").all() as any[];
    expect(cols.find((c) => c.name === "slug")?.pk).toBe(1);
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        "slug",
        "name",
        "kind",
        "category",
        "source_url",
        "license",
        "upstream_version",
        "fetched_at",
        "parsed_at",
        "last_synced_at",
        "stale_threshold_days",
        "status",
        "last_error",
        "consecutive_failures",
        "refresh_command",
        "refresh_mode",
        "freshness_check_sql",
        "primary_table",
        "vector_table",
        "row_count",
        "tenant_scope",
        "metadata",
        "created_at",
        "updated_at",
      ])
    );
  });

  it("creates knowledge_sync_log with FK to source_slug", () => {
    migration013.up(db);
    const cols = db.prepare("PRAGMA table_info(knowledge_sync_log)").all() as any[];
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        "id",
        "source_slug",
        "started_at",
        "finished_at",
        "status",
        "rows_changed",
        "duration_ms",
        "error_message",
        "metadata",
      ])
    );
    const fks = db.prepare("PRAGMA foreign_key_list(knowledge_sync_log)").all() as any[];
    expect(fks.some((fk) => fk.table === "knowledge_sources" && fk.from === "source_slug")).toBe(
      true
    );
  });

  it("rolls back cleanly via down()", () => {
    migration013.up(db);
    migration013.down(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    expect(tables.map((t) => t.name)).not.toContain("knowledge_sources");
    expect(tables.map((t) => t.name)).not.toContain("knowledge_sync_log");
  });
});
```

**Step 2: Run test — verify failure**

```bash
npx jest __tests__/lib/migrations/013-knowledge-sources.test.ts -v
```

Expected: FAIL with "Cannot find module '@/lib/migrations/013-knowledge-sources'".

**Step 3: Write migration**

```ts
// lib/migrations/013-knowledge-sources.ts
import type { Migration } from "./types";

const migration013: Migration = {
  version: 13,
  name: "knowledge-sources",
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_sources (
        slug                  TEXT PRIMARY KEY,
        name                  TEXT NOT NULL,
        kind                  TEXT NOT NULL,
        category              TEXT NOT NULL,
        source_url            TEXT,
        license               TEXT,
        upstream_version      TEXT,
        fetched_at            DATETIME,
        parsed_at             DATETIME,
        last_synced_at        DATETIME,
        stale_threshold_days  INTEGER NOT NULL,
        status                TEXT NOT NULL DEFAULT 'unknown',
        last_error            TEXT,
        consecutive_failures  INTEGER NOT NULL DEFAULT 0,
        refresh_command       TEXT,
        refresh_mode          TEXT NOT NULL,
        freshness_check_sql   TEXT,
        primary_table         TEXT,
        vector_table          TEXT,
        row_count             INTEGER,
        tenant_scope          TEXT NOT NULL DEFAULT 'global',
        metadata              TEXT,
        created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_ksources_status ON knowledge_sources(status);
      CREATE INDEX IF NOT EXISTS idx_ksources_category ON knowledge_sources(category);

      CREATE TABLE IF NOT EXISTS knowledge_sync_log (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        source_slug     TEXT NOT NULL REFERENCES knowledge_sources(slug),
        started_at      DATETIME NOT NULL,
        finished_at     DATETIME,
        status          TEXT NOT NULL,
        rows_changed    INTEGER,
        duration_ms     INTEGER,
        error_message   TEXT,
        metadata        TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_synclog_source_started
        ON knowledge_sync_log(source_slug, started_at DESC);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_synclog_source_started;
      DROP TABLE IF EXISTS knowledge_sync_log;
      DROP INDEX IF EXISTS idx_ksources_category;
      DROP INDEX IF EXISTS idx_ksources_status;
      DROP TABLE IF EXISTS knowledge_sources;
    `);
  },
};

export default migration013;
```

**Step 4: Register migration in `lib/migrations/index.ts`**

Add import + push into migrations array (follow existing pattern from 012-ai-audit).

**Step 5: Run test — verify pass**

```bash
npx jest __tests__/lib/migrations/013-knowledge-sources.test.ts -v
```

Expected: PASS (all 3 tests).

**Step 6: Commit**

```bash
git add lib/migrations/013-knowledge-sources.ts lib/migrations/index.ts __tests__/lib/migrations/013-knowledge-sources.test.ts
git commit -m "feat(knowledge): migration 013 — knowledge_sources + knowledge_sync_log"
```

---

### Task A2: Governance helpers (`lib/knowledge/governance.ts`)

**Files:**

- Create: `lib/knowledge/governance.ts`
- Create: `lib/knowledge/types.ts`
- Create: `__tests__/lib/knowledge/governance.test.ts`

**Step 1: Write failing tests**

```ts
// __tests__/lib/knowledge/governance.test.ts
import Database from "better-sqlite3";
import migration013 from "@/lib/migrations/013-knowledge-sources";
import {
  registerSource,
  reportSyncStarted,
  reportSyncSuccess,
  reportSyncFailure,
  getSourceStatus,
  listSources,
} from "@/lib/knowledge/governance";

describe("governance", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    migration013.up(db);
    registerSource(db, {
      slug: "test-src",
      name: "Test Source",
      kind: "structured_rows",
      category: "reference",
      stale_threshold_days: 7,
      refresh_mode: "manual",
    });
  });

  it("registerSource is idempotent (upsert)", () => {
    registerSource(db, {
      slug: "test-src",
      name: "Renamed",
      kind: "structured_rows",
      category: "reference",
      stale_threshold_days: 14,
      refresh_mode: "manual",
    });
    const row = db
      .prepare("SELECT name, stale_threshold_days FROM knowledge_sources WHERE slug = 'test-src'")
      .get() as any;
    expect(row.name).toBe("Renamed");
    expect(row.stale_threshold_days).toBe(14);
  });

  it("reportSyncStarted creates sync_log row, returns id", () => {
    const id = reportSyncStarted(db, "test-src");
    expect(typeof id).toBe("number");
    const row = db.prepare("SELECT * FROM knowledge_sync_log WHERE id = ?").get(id) as any;
    expect(row.source_slug).toBe("test-src");
    expect(row.status).toBe("running");
    expect(row.started_at).toBeTruthy();
  });

  it("reportSyncSuccess updates source + sync_log, resets failures", () => {
    const id = reportSyncStarted(db, "test-src");
    reportSyncSuccess(db, id, { rowsChanged: 42, upstreamVersion: "v2025-Q1" });
    const src = db.prepare("SELECT * FROM knowledge_sources WHERE slug = 'test-src'").get() as any;
    expect(src.status).toBe("fresh");
    expect(src.last_synced_at).toBeTruthy();
    expect(src.row_count).toBe(42);
    expect(src.upstream_version).toBe("v2025-Q1");
    expect(src.consecutive_failures).toBe(0);
    const log = db.prepare("SELECT * FROM knowledge_sync_log WHERE id = ?").get(id) as any;
    expect(log.status).toBe("success");
    expect(log.rows_changed).toBe(42);
    expect(log.finished_at).toBeTruthy();
    expect(log.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("reportSyncFailure increments consecutive_failures, sets status=failed", () => {
    const id1 = reportSyncStarted(db, "test-src");
    reportSyncFailure(db, id1, new Error("boom"));
    let src = db.prepare("SELECT * FROM knowledge_sources WHERE slug = 'test-src'").get() as any;
    expect(src.status).toBe("failed");
    expect(src.consecutive_failures).toBe(1);
    expect(src.last_error).toMatch(/boom/);

    const id2 = reportSyncStarted(db, "test-src");
    reportSyncFailure(db, id2, new Error("again"));
    src = db.prepare("SELECT * FROM knowledge_sources WHERE slug = 'test-src'").get() as any;
    expect(src.consecutive_failures).toBe(2);
  });

  it("listSources returns rows with health_signal computed", () => {
    const id = reportSyncStarted(db, "test-src");
    reportSyncSuccess(db, id, { rowsChanged: 1 });
    const sources = listSources(db);
    expect(sources).toHaveLength(1);
    expect(sources[0].health_signal).toBe("ok");
  });

  it("getSourceStatus returns null for unknown slug", () => {
    expect(getSourceStatus(db, "nope")).toBeNull();
  });
});
```

**Step 2: Run test — verify failure** (`Cannot find module`).

**Step 3: Implement helpers**

```ts
// lib/knowledge/types.ts
export type SourceKind = "structured_rows" | "vector_chunks" | "mixed";
export type SourceCategory = "regulatory" | "market" | "reference" | "sanctions" | "geo";
export type RefreshMode = "auto-daily" | "auto-weekly" | "manual" | "one-shot";
export type SourceStatus = "unknown" | "fresh" | "stale" | "failed";
export type HealthSignal = "ok" | "overdue" | "failing" | "never_synced";

export interface RegisterSourceInput {
  slug: string;
  name: string;
  kind: SourceKind;
  category: SourceCategory;
  stale_threshold_days: number;
  refresh_mode: RefreshMode;
  source_url?: string;
  license?: string;
  refresh_command?: string;
  primary_table?: string;
  vector_table?: string;
  freshness_check_sql?: string;
  tenant_scope?: string;
  metadata?: Record<string, unknown>;
}

export interface SourceRow {
  slug: string;
  name: string;
  kind: SourceKind;
  category: SourceCategory;
  status: SourceStatus;
  refresh_mode: RefreshMode;
  last_synced_at: string | null;
  stale_threshold_days: number;
  consecutive_failures: number;
  row_count: number | null;
  refresh_command: string | null;
  last_error: string | null;
  upstream_version: string | null;
  health_signal: HealthSignal;
  days_since_sync: number | null;
}
```

```ts
// lib/knowledge/governance.ts
import type Database from "better-sqlite3";
import type { RegisterSourceInput, SourceRow } from "./types";

export function registerSource(db: Database.Database, input: RegisterSourceInput): void {
  db.prepare(
    `
    INSERT INTO knowledge_sources (
      slug, name, kind, category, source_url, license, refresh_command,
      refresh_mode, stale_threshold_days, primary_table, vector_table,
      freshness_check_sql, tenant_scope, metadata
    ) VALUES (
      @slug, @name, @kind, @category, @source_url, @license, @refresh_command,
      @refresh_mode, @stale_threshold_days, @primary_table, @vector_table,
      @freshness_check_sql, @tenant_scope, @metadata
    )
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      kind = excluded.kind,
      category = excluded.category,
      source_url = excluded.source_url,
      license = excluded.license,
      refresh_command = excluded.refresh_command,
      refresh_mode = excluded.refresh_mode,
      stale_threshold_days = excluded.stale_threshold_days,
      primary_table = excluded.primary_table,
      vector_table = excluded.vector_table,
      freshness_check_sql = excluded.freshness_check_sql,
      tenant_scope = excluded.tenant_scope,
      metadata = excluded.metadata,
      updated_at = CURRENT_TIMESTAMP
  `
  ).run({
    slug: input.slug,
    name: input.name,
    kind: input.kind,
    category: input.category,
    source_url: input.source_url ?? null,
    license: input.license ?? null,
    refresh_command: input.refresh_command ?? null,
    refresh_mode: input.refresh_mode,
    stale_threshold_days: input.stale_threshold_days,
    primary_table: input.primary_table ?? null,
    vector_table: input.vector_table ?? null,
    freshness_check_sql: input.freshness_check_sql ?? null,
    tenant_scope: input.tenant_scope ?? "global",
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  });
}

export function reportSyncStarted(db: Database.Database, slug: string): number {
  const r = db
    .prepare(
      `
    INSERT INTO knowledge_sync_log (source_slug, started_at, status)
    VALUES (?, CURRENT_TIMESTAMP, 'running')
  `
    )
    .run(slug);
  return Number(r.lastInsertRowid);
}

export interface SyncSuccessOpts {
  rowsChanged?: number;
  upstreamVersion?: string;
  metadata?: Record<string, unknown>;
}

export function reportSyncSuccess(
  db: Database.Database,
  syncLogId: number,
  opts: SyncSuccessOpts = {}
): void {
  const log = db
    .prepare("SELECT source_slug, started_at FROM knowledge_sync_log WHERE id = ?")
    .get(syncLogId) as any;
  if (!log) throw new Error(`sync_log id=${syncLogId} not found`);

  const tx = db.transaction(() => {
    db.prepare(
      `
      UPDATE knowledge_sync_log
      SET status = 'success',
          finished_at = CURRENT_TIMESTAMP,
          rows_changed = ?,
          duration_ms = CAST((julianday(CURRENT_TIMESTAMP) - julianday(started_at)) * 86400000 AS INTEGER),
          metadata = ?
      WHERE id = ?
    `
    ).run(
      opts.rowsChanged ?? null,
      opts.metadata ? JSON.stringify(opts.metadata) : null,
      syncLogId
    );
    db.prepare(
      `
      UPDATE knowledge_sources
      SET status = 'fresh',
          last_synced_at = CURRENT_TIMESTAMP,
          fetched_at = CURRENT_TIMESTAMP,
          parsed_at = CURRENT_TIMESTAMP,
          row_count = COALESCE(?, row_count),
          upstream_version = COALESCE(?, upstream_version),
          consecutive_failures = 0,
          last_error = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE slug = ?
    `
    ).run(opts.rowsChanged ?? null, opts.upstreamVersion ?? null, log.source_slug);
  });
  tx();
}

export function reportSyncFailure(db: Database.Database, syncLogId: number, error: Error): void {
  const log = db
    .prepare("SELECT source_slug FROM knowledge_sync_log WHERE id = ?")
    .get(syncLogId) as any;
  if (!log) throw new Error(`sync_log id=${syncLogId} not found`);

  const tx = db.transaction(() => {
    db.prepare(
      `
      UPDATE knowledge_sync_log
      SET status = 'failure', finished_at = CURRENT_TIMESTAMP, error_message = ?
      WHERE id = ?
    `
    ).run(String(error?.stack ?? error?.message ?? error), syncLogId);
    db.prepare(
      `
      UPDATE knowledge_sources
      SET status = 'failed',
          last_error = ?,
          consecutive_failures = consecutive_failures + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE slug = ?
    `
    ).run(String(error?.message ?? error), log.source_slug);
  });
  tx();
}

export function getSourceStatus(db: Database.Database, slug: string): SourceRow | null {
  const rows = listSources(db, { slug });
  return rows[0] ?? null;
}

export function listSources(db: Database.Database, opts: { slug?: string } = {}): SourceRow[] {
  const where = opts.slug ? "WHERE slug = ?" : "";
  const params = opts.slug ? [opts.slug] : [];
  return db
    .prepare(
      `
    SELECT
      slug, name, kind, category, status, refresh_mode,
      last_synced_at, stale_threshold_days, consecutive_failures,
      row_count, refresh_command, last_error, upstream_version,
      CASE
        WHEN last_synced_at IS NULL THEN 'never_synced'
        WHEN consecutive_failures >= 3 THEN 'failing'
        WHEN julianday('now') - julianday(last_synced_at) > stale_threshold_days THEN 'overdue'
        ELSE 'ok'
      END AS health_signal,
      CASE
        WHEN last_synced_at IS NULL THEN NULL
        ELSE CAST(julianday('now') - julianday(last_synced_at) AS INTEGER)
      END AS days_since_sync
    FROM knowledge_sources
    ${where}
    ORDER BY
      CASE
        WHEN last_synced_at IS NULL THEN 0
        WHEN consecutive_failures >= 3 THEN 1
        WHEN julianday('now') - julianday(last_synced_at) > stale_threshold_days THEN 2
        ELSE 3
      END,
      category, slug
  `
    )
    .all(...params) as SourceRow[];
}
```

**Step 4: Run test — verify pass.**

**Step 5: Commit**

```bash
git add lib/knowledge/governance.ts lib/knowledge/types.ts __tests__/lib/knowledge/governance.test.ts
git commit -m "feat(knowledge): governance helpers (register/reportSync*/listSources)"
```

---

### Task A3: Bootstrap registration of all 8+ sources

**Files:**

- Create: `lib/knowledge/bootstrap.ts`
- Create: `__tests__/lib/knowledge/bootstrap.test.ts`
- Modify: `lib/db/index.ts` (call bootstrap on connect — find pattern)

**Step 1: Write test**

```ts
// __tests__/lib/knowledge/bootstrap.test.ts
import Database from "better-sqlite3";
import migration013 from "@/lib/migrations/013-knowledge-sources";
import { bootstrapKnowledgeSources, KNOWLEDGE_REGISTRY } from "@/lib/knowledge/bootstrap";

describe("bootstrap", () => {
  it("registers every entry from KNOWLEDGE_REGISTRY", () => {
    const db = new Database(":memory:");
    migration013.up(db);
    bootstrapKnowledgeSources(db);
    const count = (db.prepare("SELECT COUNT(*) AS c FROM knowledge_sources").get() as any).c;
    expect(count).toBe(KNOWLEDGE_REGISTRY.length);
  });

  it("is idempotent (second call does not duplicate or wipe state)", () => {
    const db = new Database(":memory:");
    migration013.up(db);
    bootstrapKnowledgeSources(db);
    db.prepare("UPDATE knowledge_sources SET status='fresh' WHERE slug='ofac'").run();
    bootstrapKnowledgeSources(db);
    const status = (
      db.prepare("SELECT status FROM knowledge_sources WHERE slug='ofac'").get() as any
    ).status;
    expect(status).toBe("fresh"); // bootstrap should not reset status
  });

  it("contains 5 Phase-1 sources", () => {
    const slugs = KNOWLEDGE_REGISTRY.map((r) => r.slug);
    expect(slugs).toEqual(
      expect.arrayContaining(["ofac", "eu-sanctions", "distances", "jwc", "eca", "panama-tariffs"])
    );
  });
});
```

**Step 2: Run — verify failure.**

**Step 3: Implement**

```ts
// lib/knowledge/bootstrap.ts
import type Database from "better-sqlite3";
import { registerSource } from "./governance";
import type { RegisterSourceInput } from "./types";

export const KNOWLEDGE_REGISTRY: RegisterSourceInput[] = [
  // === Sanctions ===
  {
    slug: "ofac",
    name: "OFAC SDN List",
    kind: "structured_rows",
    category: "sanctions",
    source_url: "https://www.treasury.gov/ofac/downloads/sdn.xml",
    license: "US Public Domain",
    refresh_mode: "auto-daily",
    stale_threshold_days: 2,
    refresh_command: "npm run knowledge:refresh ofac",
    primary_table: "ofac_entities",
  },
  {
    slug: "eu-sanctions",
    name: "EU Consolidated Sanctions",
    kind: "structured_rows",
    category: "sanctions",
    source_url:
      "https://webgate.ec.europa.eu/europeaid/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=",
    license: "EU Public",
    refresh_mode: "auto-daily",
    stale_threshold_days: 2,
    refresh_command: "npm run knowledge:refresh eu-sanctions",
    primary_table: "eu_sanctions_entities",
  },
  // === Reference ===
  {
    slug: "distances",
    name: "Port-to-Port Sea Distances",
    kind: "structured_rows",
    category: "reference",
    license: "Apache-2.0 (searoute-py)",
    refresh_mode: "one-shot",
    stale_threshold_days: 365,
    refresh_command: "npm run knowledge:refresh distances",
    primary_table: "port_distances",
  },
  // === Regulatory ===
  {
    slug: "jwc",
    name: "JWC Listed Areas (war risk)",
    kind: "mixed",
    category: "regulatory",
    source_url: "https://www.lmalloyds.com/lma/jointwar",
    license: "LMA Public Bulletin",
    refresh_mode: "manual",
    stale_threshold_days: 100,
    refresh_command: "npm run knowledge:refresh jwc",
    primary_table: "war_risk_zones",
    vector_table: "jwc_vec",
  },
  {
    slug: "eca",
    name: "ECA Zones (MARPOL Annex VI)",
    kind: "structured_rows",
    category: "regulatory",
    source_url: "https://www.imo.org/en/OurWork/Environment/Pages/Air-Pollution.aspx",
    license: "IMO Public",
    refresh_mode: "one-shot",
    stale_threshold_days: 1500,
    refresh_command: "npm run knowledge:refresh eca",
    primary_table: "eca_zones",
  },
  {
    slug: "panama-tariffs",
    name: "Panama Canal Tariffs (ACP)",
    kind: "structured_rows",
    category: "regulatory",
    source_url: "https://pancanal.com/en/maritime-services/tariff/",
    license: "ACP Public",
    refresh_mode: "manual",
    stale_threshold_days: 365,
    refresh_command: "npm run knowledge:refresh panama-tariffs",
    primary_table: "canal_tariffs",
  },
  // === Phase 2 placeholders (registered now for dashboard completeness, populated later) ===
  {
    slug: "imsbc",
    name: "IMSBC Code",
    kind: "vector_chunks",
    category: "regulatory",
    source_url: "https://www.imorules.com/INTBSBCC.html",
    license: "IMO Public",
    refresh_mode: "one-shot",
    stale_threshold_days: 800,
    refresh_command: "npm run knowledge:refresh imsbc",
    vector_table: "imsbc_vec",
  },
  {
    slug: "igc",
    name: "IGC Grain Code",
    kind: "vector_chunks",
    category: "regulatory",
    source_url:
      "https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/MSCResolutions/MSC.23(59).pdf",
    license: "IMO Public",
    refresh_mode: "one-shot",
    stale_threshold_days: 800,
    refresh_command: "npm run knowledge:refresh igc",
    vector_table: "igc_vec",
  },
  {
    slug: "unlocode",
    name: "UN/LOCODE Directory",
    kind: "structured_rows",
    category: "reference",
    source_url: "https://unece.org/trade/cefact/UNLOCODE-Download",
    license: "UNECE Public",
    refresh_mode: "manual",
    stale_threshold_days: 200,
    refresh_command: "npm run knowledge:refresh unlocode",
    primary_table: "port_master",
  },
  {
    slug: "baltic-indices",
    name: "Baltic Dry Indices (TradingEconomics)",
    kind: "structured_rows",
    category: "market",
    source_url: "https://tradingeconomics.com/commodity/baltic",
    license: "TradingEconomics free tier",
    refresh_mode: "manual",
    stale_threshold_days: 14,
    refresh_command: "npm run knowledge:refresh baltic-indices",
    primary_table: "baltic_indices",
  },
];

export function bootstrapKnowledgeSources(db: Database.Database): void {
  const tx = db.transaction(() => {
    for (const src of KNOWLEDGE_REGISTRY) {
      const exists = db.prepare("SELECT 1 FROM knowledge_sources WHERE slug = ?").get(src.slug);
      if (exists) continue; // preserve runtime status
      registerSource(db, src);
    }
  });
  tx();
}
```

**Step 4: Wire into DB init.** Find `lib/db/index.ts` (or wherever migrations runner is invoked at startup); after `runMigrations(db)` call add `bootstrapKnowledgeSources(db)`. Verify path and pattern by reading existing init code first.

**Step 5: Run test — verify pass.**

**Step 6: Commit**

```bash
git add lib/knowledge/bootstrap.ts __tests__/lib/knowledge/bootstrap.test.ts lib/db/index.ts
git commit -m "feat(knowledge): registry of 10 sources + bootstrap on db init"
```

---

## Block B — Admin Dashboard (1.5 дня)

### Task B1: Status API endpoint `GET /api/admin/knowledge-status`

**Files:**

- Create: `app/api/admin/knowledge-status/route.ts`
- Create: `__tests__/api/admin/knowledge-status.test.ts`

**Step 1: Write test (Jest + supertest-style fetch via existing helper or `next-test-api-route-handler`).**

Check existing admin route to find auth pattern (`app/api/admin/...` if exists, or session check pattern). Replicate it.

```ts
// __tests__/api/admin/knowledge-status.test.ts
import { GET } from "@/app/api/admin/knowledge-status/route";
import { NextRequest } from "next/server";
import { withAuthenticatedAdmin } from "@/__tests__/utils/auth"; // helper if exists; else inline mock

describe("GET /api/admin/knowledge-status", () => {
  it("returns 401 without admin auth", async () => {
    const req = new NextRequest("http://localhost/api/admin/knowledge-status");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns sources array with health_signal", async () => {
    const req = withAuthenticatedAdmin(
      new NextRequest("http://localhost/api/admin/knowledge-status")
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("sources");
    expect(json).toHaveProperty("summary");
    expect(json.summary).toHaveProperty("fresh");
    expect(json.summary).toHaveProperty("stale");
    expect(json.summary).toHaveProperty("failed");
    expect(json.summary).toHaveProperty("total");
  });
});
```

**Step 2: Run — fail.**

**Step 3: Implement**

```ts
// app/api/admin/knowledge-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listSources } from "@/lib/knowledge/governance";
import { requireAdmin } from "@/lib/auth/admin"; // existing helper or inline session check

export async function GET(req: NextRequest) {
  const authError = await requireAdmin(req);
  if (authError) return authError;

  const db = getDb();
  const sources = listSources(db);

  const summary = sources.reduce(
    (acc, s) => {
      acc.total++;
      if (s.health_signal === "ok") acc.fresh++;
      else if (s.health_signal === "overdue" || s.health_signal === "never_synced") acc.stale++;
      else if (s.health_signal === "failing") acc.failed++;
      return acc;
    },
    { fresh: 0, stale: 0, failed: 0, total: 0 }
  );

  return NextResponse.json({
    sources,
    summary,
    last_check: new Date().toISOString(),
  });
}
```

**Step 4: Run — pass.**

**Step 5: Commit.**

```bash
git commit -m "feat(knowledge): GET /api/admin/knowledge-status"
```

---

### Task B2: Public healthcheck `GET /api/health/knowledge`

**Files:**

- Create: `app/api/health/knowledge/route.ts`
- Create: `__tests__/api/health/knowledge.test.ts`

**Step 1: Test — returns 200/503 based on critical_failures, no auth required.**

```ts
it('returns 503 when any source is failing', async () => {
  // setup: force one source into 'failing' via 3+ consecutive_failures
  const res = await GET(new NextRequest('http://localhost/api/health/knowledge'));
  expect(res.status).toBe(503);
  const json = await res.json();
  expect(json.status).toBe('degraded');
});
it('returns 200 when all sources are ok', async () => {
  // setup: mark all fresh
  const res = await GET(...);
  expect(res.status).toBe(200);
  expect((await res.json()).status).toBe('healthy');
});
```

**Step 2-5: Implement, similar to status endpoint but no auth + HTTP 503 if `summary.failed > 0`. Commit.**

```bash
git commit -m "feat(knowledge): public /api/health/knowledge endpoint"
```

---

### Task B3: Admin UI page `/admin/knowledge`

**Files:**

- Create: `app/admin/knowledge/page.tsx`
- Create: `app/admin/knowledge/_components/SourceTable.tsx`
- Create: `__tests__/components/admin/SourceTable.test.tsx`

**Step 1: Test of `SourceTable` rendering** (RTL):

- Renders rows by category
- Shows colored health badges (ok=green, overdue=yellow, failing=red)
- "Refresh" button calls `POST /api/admin/knowledge/refresh` with slug

**Step 2-3: Implement** — server component for page (reads via `listSources(db)`), client component for `SourceTable` with refresh button.

```tsx
// app/admin/knowledge/page.tsx (server component)
import { getDb } from "@/lib/db";
import { listSources } from "@/lib/knowledge/governance";
import { SourceTable } from "./_components/SourceTable";

export default async function KnowledgePage() {
  const db = getDb();
  const sources = listSources(db);
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Knowledge Layer — статус источников</h1>
      <SourceTable sources={sources} />
    </div>
  );
}
```

**Step 4: Sanity-check via dev server** — `npm run dev` → open `/admin/knowledge` → verify all 10 sources visible, all `never_synced` (red).

**Step 5: Commit.**

```bash
git commit -m "feat(knowledge): /admin/knowledge dashboard UI"
```

---

### Task B4: `POST /api/admin/knowledge/refresh` (manual trigger)

**Files:**

- Create: `app/api/admin/knowledge/refresh/route.ts`
- Create: `__tests__/api/admin/knowledge-refresh.test.ts`

**Step 1: Test** — admin-auth required; spawns child process for `npm run knowledge:refresh <slug>`; returns sync_log_id; rejects unknown slug.

**Step 2-3: Implement** with `child_process.spawn` (NOT `exec` — safer; pass slug through whitelist).

```ts
// validation: slug must be in KNOWLEDGE_REGISTRY
const validSlugs = new Set(KNOWLEDGE_REGISTRY.map((r) => r.slug));
if (!validSlugs.has(slug)) return NextResponse.json({ error: "unknown slug" }, { status: 400 });
```

**SECURITY:** never pass user input directly to shell. Use `spawn('npm', ['run', 'knowledge:refresh', '--', slug])`.

**Step 4: Smoke test via curl + admin session.**

**Step 5: Commit.**

```bash
git commit -m "feat(knowledge): POST /api/admin/knowledge/refresh manual trigger"
```

---

### Task B5: CLI `npm run knowledge:status` and dispatcher

**Files:**

- Create: `scripts/knowledge/status.ts`
- Create: `scripts/knowledge/refresh.ts` (dispatcher)
- Modify: `package.json` (add scripts)

**Step 1: `scripts/knowledge/status.ts`** — opens DB, calls `listSources`, prints table to stdout (use `cli-table3` if already in deps, else simple `console.table`).

**Step 2: `scripts/knowledge/refresh.ts`** — switch by slug, dispatches to per-source `seed.ts` (which we'll add in later tasks). For now stub:

```ts
const handlers: Record<string, () => Promise<void>> = {
  ofac: () => import("./sources/ofac").then((m) => m.refresh()),
  "eu-sanctions": () => import("./sources/eu-sanctions").then((m) => m.refresh()),
  distances: () => import("./sources/distances").then((m) => m.refresh()),
  jwc: () => import("./sources/jwc").then((m) => m.refresh()),
  eca: () => import("./sources/eca").then((m) => m.refresh()),
  "panama-tariffs": () => import("./sources/panama-tariffs").then((m) => m.refresh()),
};
const slug = process.argv[2];
if (!slug || !handlers[slug]) {
  console.error(`unknown slug: ${slug}`);
  process.exit(1);
}
handlers[slug]().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

**Step 3: package.json**

```json
"knowledge:status": "tsx scripts/knowledge/status.ts",
"knowledge:refresh": "tsx scripts/knowledge/refresh.ts",
"knowledge:refresh-all": "tsx scripts/knowledge/refresh-all.ts"
```

**Step 4: Verify** `npm run knowledge:status` prints empty table (no `never_synced` rows yet — expected).

**Step 5: Commit.**

```bash
git commit -m "feat(knowledge): CLI scripts (status/refresh dispatcher)"
```

---

## Block C — OFAC + EU Sanctions Adapter (2 дня)

### Task C1: Migration 014 — `ofac_entities` + `eu_sanctions_entities`

**Files:**

- Create: `lib/migrations/014-sanctions-entities.ts`
- Create: `__tests__/lib/migrations/014-sanctions-entities.test.ts`

Schema (study existing `opensanctions_cache` for naming consistency):

```sql
CREATE TABLE ofac_entities (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  uid             TEXT NOT NULL,                -- OFAC <uid>
  type            TEXT NOT NULL,                -- 'individual' | 'entity' | 'vessel' | 'aircraft'
  name            TEXT NOT NULL,
  name_normalized TEXT NOT NULL,                -- lowercase, no diacritics, normalized whitespace
  aliases         TEXT,                         -- JSON array
  country         TEXT,
  address         TEXT,                         -- JSON object
  programs        TEXT,                         -- JSON array (e.g. ['SDGT', 'IRAN'])
  publish_date    TEXT,
  raw             TEXT,                         -- full XML chunk for audit
  fetched_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(uid)
);
CREATE INDEX idx_ofac_name_norm ON ofac_entities(name_normalized);
CREATE INDEX idx_ofac_country ON ofac_entities(country);

-- analogous eu_sanctions_entities
```

Test: schema verified, indexes exist. Implement, run, commit.

```bash
git commit -m "feat(knowledge): migration 014 — ofac_entities + eu_sanctions_entities"
```

---

### Task C2: OFAC XML parser

**Files:**

- Create: `lib/knowledge/sanctions/ofac-parser.ts`
- Create: `lib/knowledge/sanctions/normalize.ts` (shared name normalization)
- Create: `__tests__/lib/knowledge/sanctions/ofac-parser.test.ts`
- Create: `__tests__/fixtures/ofac/sample-sdn.xml` (small fixture)

**Step 1: Write fixture** — 3 entries (1 individual, 1 entity, 1 vessel) extracted from real SDN sample (gist or strip from full file, ~50 lines).

**Step 2: Test** — parser yields 3 records, each with `uid`, `type`, `name`, `aliases`, `programs`.

**Step 3: Implement** using `fast-xml-parser` (check if already in deps; else `xml2js`).

```ts
// normalize.ts
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacritics
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
```

**Step 4-5: Run, commit.**

```bash
git commit -m "feat(knowledge): OFAC SDN XML parser + normalize utility"
```

---

### Task C3: EU Consolidated parser

**Files:**

- Create: `lib/knowledge/sanctions/eu-parser.ts`
- Create: `__tests__/lib/knowledge/sanctions/eu-parser.test.ts`
- Create: `__tests__/fixtures/eu/sample-eu.xml`

Same pattern, EU XML schema differs (top-level `<sanctionEntity>`, nested `<nameAlias>`).

```bash
git commit -m "feat(knowledge): EU Consolidated Sanctions XML parser"
```

---

### Task C4: OFAC adapter (fetch + diff + upsert)

**Files:**

- Create: `lib/knowledge/sanctions/ofac-adapter.ts`
- Create: `__tests__/lib/knowledge/sanctions/ofac-adapter.test.ts`
- Create: `scripts/knowledge/sources/ofac.ts`

**Step 1: Test contract**:

- `refreshOfac(db, fetcher)` calls `reportSyncStarted`, then on success `reportSyncSuccess` with rowsChanged
- On HTTP error → `reportSyncFailure`
- Diff: when entity removed from upstream, deleted from `ofac_entities`
- Idempotent: running twice with same XML → 0 rowsChanged on second run

**Step 2-3: Implement.**

```ts
// lib/knowledge/sanctions/ofac-adapter.ts
import type Database from "better-sqlite3";
import { reportSyncStarted, reportSyncSuccess, reportSyncFailure } from "../governance";
import { parseOfacXml } from "./ofac-parser";
import { normalizeName } from "./normalize";

const OFAC_URL = "https://www.treasury.gov/ofac/downloads/sdn.xml";

export type Fetcher = (url: string) => Promise<string>;

export async function refreshOfac(
  db: Database.Database,
  fetcher: Fetcher = defaultFetcher
): Promise<{ rowsChanged: number; upstreamVersion: string }> {
  const syncId = reportSyncStarted(db, "ofac");
  try {
    const xml = await fetcher(OFAC_URL);
    const entities = parseOfacXml(xml);
    const result = upsertOfacEntities(db, entities);
    const upstreamVersion = `sha256:${require("crypto").createHash("sha256").update(xml).digest("hex").slice(0, 16)}`;
    reportSyncSuccess(db, syncId, {
      rowsChanged: result.added + result.removed + result.updated,
      upstreamVersion,
      metadata: result,
    });
    return { rowsChanged: result.added + result.removed + result.updated, upstreamVersion };
  } catch (err) {
    reportSyncFailure(db, syncId, err as Error);
    throw err;
  }
}

function upsertOfacEntities(
  db: Database.Database,
  entities: ParsedEntity[]
): {
  added: number;
  updated: number;
  removed: number;
} {
  const upstreamUids = new Set(entities.map((e) => e.uid));
  const existingUids = new Set<string>(
    (db.prepare("SELECT uid FROM ofac_entities").all() as any[]).map((r) => r.uid)
  );

  const tx = db.transaction(() => {
    let added = 0,
      updated = 0,
      removed = 0;

    const upsertStmt = db.prepare(`
      INSERT INTO ofac_entities (uid, type, name, name_normalized, aliases, country, address, programs, publish_date, raw)
      VALUES (@uid, @type, @name, @name_normalized, @aliases, @country, @address, @programs, @publish_date, @raw)
      ON CONFLICT(uid) DO UPDATE SET
        name = excluded.name,
        name_normalized = excluded.name_normalized,
        aliases = excluded.aliases,
        country = excluded.country,
        address = excluded.address,
        programs = excluded.programs,
        publish_date = excluded.publish_date,
        raw = excluded.raw,
        fetched_at = CURRENT_TIMESTAMP
    `);

    for (const e of entities) {
      const isNew = !existingUids.has(e.uid);
      upsertStmt.run({
        uid: e.uid,
        type: e.type,
        name: e.name,
        name_normalized: normalizeName(e.name),
        aliases: JSON.stringify(e.aliases),
        country: e.country ?? null,
        address: e.address ? JSON.stringify(e.address) : null,
        programs: JSON.stringify(e.programs),
        publish_date: e.publishDate ?? null,
        raw: e.raw,
      });
      if (isNew) added++;
      else updated++;
    }

    const deleteStmt = db.prepare("DELETE FROM ofac_entities WHERE uid = ?");
    for (const uid of existingUids) {
      if (!upstreamUids.has(uid)) {
        deleteStmt.run(uid);
        removed++;
      }
    }

    return { added, updated, removed };
  });

  return tx();
}

async function defaultFetcher(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Quantika-Demo/1.0" } });
  if (!res.ok) throw new Error(`OFAC fetch failed: ${res.status}`);
  return res.text();
}
```

**Step 4: scripts/knowledge/sources/ofac.ts** — thin wrapper:

```ts
import { getDb } from "@/lib/db";
import { refreshOfac } from "@/lib/knowledge/sanctions/ofac-adapter";

export async function refresh() {
  const db = getDb();
  const result = await refreshOfac(db);
  console.log(`OFAC: rowsChanged=${result.rowsChanged}, version=${result.upstreamVersion}`);
}
```

**Step 5: Run test, commit.**

```bash
git commit -m "feat(knowledge): OFAC adapter with diff/upsert + governance integration"
```

---

### Task C5: EU adapter (analogous)

Same pattern as OFAC, different URL + parser. Commit.

```bash
git commit -m "feat(knowledge): EU Consolidated Sanctions adapter"
```

---

### Task C6: `sanction_corpus_view` + replace `sentinel.ts` fixtures

**Files:**

- Modify: `lib/migrations/014-sanctions-entities.ts` (add `CREATE VIEW sanction_corpus_view`)
- Modify: `lib/sanctions/sentinel.ts` (replace `loadSanctionFixtures` with view query)
- Modify: existing `lib/sanctions/sentinel.test.ts`

**View definition**:

```sql
CREATE VIEW IF NOT EXISTS sanction_corpus_view AS
SELECT 'ofac' AS source, uid, type, name, name_normalized, aliases, country, programs FROM ofac_entities
UNION ALL
SELECT 'eu' AS source, uid, type, name, name_normalized, aliases, country, programs FROM eu_sanctions_entities;
```

**Sentinel changes**: Find `loadSanctionFixtures()`. Replace with `loadSanctionCorpus(db)` that reads from view. Existing tests should still pass IF fixtures are seeded into tables in test setup. Update test setup accordingly.

**Add feature flag** `KNOWLEDGE_SANCTIONS_REAL=true`. When false → fall back to old fixtures (rollback safety).

**Step 5: Commit.**

```bash
git commit -m "feat(knowledge): sentinel uses real OFAC+EU corpus (flag-gated)"
```

---

### Task C7: Daily cron (systemd unit + heartbeat endpoint)

**Files:**

- Create: `scripts/knowledge/cron/refresh-sanctions.ts`
- Create: `ops/systemd/quantika-sanctions-refresh.service`
- Create: `ops/systemd/quantika-sanctions-refresh.timer`
- Create: `app/api/admin/cron-heartbeat/route.ts`
- Create: `__tests__/api/admin/cron-heartbeat.test.ts`

**cron script**: orchestrates OFAC + EU refresh, sends heartbeat ping after success.

**heartbeat endpoint**: stores `(cron_name, last_seen_at)` in dedicated table or in `knowledge_sources.metadata`.

**Step 5: Commit.**

```bash
git commit -m "feat(knowledge): daily sanctions cron + heartbeat tracking"
```

---

### Task C8: Alert on 2 consecutive failures

**Files:**

- Modify: `lib/knowledge/governance.ts` (after `reportSyncFailure`, fire alert if `consecutive_failures >= 2`)
- Create: `lib/knowledge/alerts.ts`
- Create: `__tests__/lib/knowledge/alerts.test.ts`

**Channels**: Sentry (existing `@sentry/nextjs`) + email (existing nodemailer/SES wrapper if found in `lib/`). For now stub email channel + real Sentry.

```ts
// lib/knowledge/alerts.ts
import * as Sentry from "@sentry/nextjs";

export interface AlertContext {
  slug: string;
  consecutiveFailures: number;
  lastError?: string;
}
export async function fireAlert(ctx: AlertContext) {
  Sentry.captureMessage(
    `Knowledge source ${ctx.slug} failed ${ctx.consecutiveFailures}× consecutively`,
    {
      level: "error",
      tags: { knowledge_source: ctx.slug },
      extra: ctx,
    }
  );
  // TODO: email channel — for Phase 1 stub
}
```

**Step 5: Commit.**

```bash
git commit -m "feat(knowledge): alert on 2 consecutive failures (Sentry)"
```

---

## Block D — Distances (3 дня)

### Task D1: Migration 015 — `port_distances` table

**Files:**

- Create: `lib/migrations/015-port-distances.ts`
- Create: `__tests__/lib/migrations/015-port-distances.test.ts`

```sql
CREATE TABLE port_distances (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  origin_locode       TEXT NOT NULL,
  dest_locode         TEXT NOT NULL,
  route_via           TEXT NOT NULL,           -- 'suez' | 'cape' | 'panama' | 'direct'
  distance_nm         REAL NOT NULL,
  calculator_version  TEXT NOT NULL,           -- 'searoute-py-1.0.0' or commit hash
  calculated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(origin_locode, dest_locode, route_via)
);
CREATE INDEX idx_dist_origin_dest ON port_distances(origin_locode, dest_locode);
```

Test, implement, commit.

```bash
git commit -m "feat(knowledge): migration 015 — port_distances cache"
```

---

### Task D2: Python service skeleton (`services/searoute/`)

**Files:**

- Create: `services/searoute/main.py`
- Create: `services/searoute/requirements.txt`
- Create: `services/searoute/Dockerfile`
- Create: `services/searoute/test_main.py`
- Create: `services/searoute/README.md`

**requirements.txt**:

```
fastapi==0.115.6
uvicorn[standard]==0.34.0
searoute==1.2.0
pydantic==2.10.4
pytest==8.3.4
httpx==0.28.1
```

**main.py**:

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Literal, Optional
import searoute as sr

app = FastAPI(title="Quantika Searoute Service", version="1.0.0")

class DistanceRequest(BaseModel):
    origin_lat: float = Field(..., ge=-90, le=90)
    origin_lon: float = Field(..., ge=-180, le=180)
    dest_lat: float = Field(..., ge=-90, le=90)
    dest_lon: float = Field(..., ge=-180, le=180)
    route_via: Literal['suez', 'cape', 'panama', 'direct'] = 'direct'

class DistanceResponse(BaseModel):
    distance_nm: float
    route_via: str
    waypoints_count: int
    calculator_version: str = "searoute-py-1.2.0"

RESTRICTIONS_MAP = {
    'cape':   ['suez', 'panama'],   # force around Cape
    'suez':   ['panama', 'cape'],
    'panama': ['suez', 'cape'],
    'direct': [],                   # let algorithm pick
}

@app.get("/health")
def health():
    return {"status": "ok", "version": app.version}

@app.post("/distance", response_model=DistanceResponse)
def distance(req: DistanceRequest):
    origin = [req.origin_lon, req.origin_lat]
    dest = [req.dest_lon, req.dest_lat]
    try:
        route = sr.searoute(
            origin, dest,
            restrictions=RESTRICTIONS_MAP[req.route_via],
            units='naut',
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"routing failed: {e}")
    return DistanceResponse(
        distance_nm=route['properties']['length'],
        route_via=req.route_via,
        waypoints_count=len(route['geometry']['coordinates']),
    )
```

**test_main.py**: hit `/health`, hit `/distance` with known port pairs (Singapore→Rotterdam should be ~8,300 nm via Suez), verify within ±10%.

**Step 5: Run pytest in venv, commit.**

```bash
git commit -m "feat(knowledge): Python searoute microservice skeleton"
```

---

### Task D3: Systemd unit + Dockerfile for searoute

**Files:**

- Create: `services/searoute/Dockerfile`
- Create: `ops/systemd/quantika-searoute.service`
- Modify: `docker-compose.yml` (add searoute service)

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
EXPOSE 8200
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8200"]
```

```ini
# ops/systemd/quantika-searoute.service
[Unit]
Description=Quantika Searoute Service
After=network.target

[Service]
WorkingDirectory=/opt/quantika/services/searoute
ExecStart=/opt/quantika/services/searoute/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8200
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Document deploy steps in `services/searoute/README.md`.

**Step 5: Commit.**

```bash
git commit -m "feat(knowledge): searoute service Dockerfile + systemd unit"
```

---

### Task D4: Node client `lib/knowledge/distances/client.ts`

**Files:**

- Create: `lib/knowledge/distances/client.ts`
- Create: `__tests__/lib/knowledge/distances/client.test.ts`

**Step 1: Test** with `nock` or `msw` mocking HTTP:

- happy path returns distance_nm
- 422 → throws RoutingError
- 5xx → retries 2× then throws
- timeout → throws TimeoutError

**Step 2-3: Implement** with `AbortController` (15s timeout — recall βf3-01 lesson):

```ts
const SEAROUTE_URL = process.env.SEAROUTE_SERVICE_URL ?? "http://127.0.0.1:8200";

export class RoutingError extends Error {}

export async function calculateDistance(
  input: {
    origin: { lat: number; lon: number };
    dest: { lat: number; lon: number };
    routeVia: "suez" | "cape" | "panama" | "direct";
  },
  opts: { timeoutMs?: number; retries?: number } = {}
): Promise<{ distanceNm: number; calculatorVersion: string }> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxRetries = opts.retries ?? 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${SEAROUTE_URL}/distance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          origin_lat: input.origin.lat,
          origin_lon: input.origin.lon,
          dest_lat: input.dest.lat,
          dest_lon: input.dest.lon,
          route_via: input.routeVia,
        }),
        signal: ctrl.signal,
      });
      if (res.status === 422) throw new RoutingError(await res.text());
      if (!res.ok) throw new Error(`searoute ${res.status}`);
      const json = await res.json();
      return { distanceNm: json.distance_nm, calculatorVersion: json.calculator_version };
    } catch (err) {
      if (err instanceof RoutingError) throw err;
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error("unreachable");
}
```

**Step 5: Commit.**

```bash
git commit -m "feat(knowledge): Node client for searoute service"
```

---

### Task D5: `lib/knowledge/distances/lookup.ts` (cache-first)

**Files:**

- Create: `lib/knowledge/distances/lookup.ts`
- Create: `__tests__/lib/knowledge/distances/lookup.test.ts`

**API**:

```ts
export async function getDistance(
  db: Database.Database,
  origin: string, // LOCODE
  dest: string, // LOCODE
  routeVia: RouteVia = "direct"
): Promise<{ distanceNm: number; source: "cache" | "computed" }>;
```

Logic:

1. Lookup `port_distances` by (origin, dest, route_via). Hit → return cache.
2. Miss → resolve LOCODE→{lat,lon} via existing `lib/ports/resolve.ts`. If unresolvable → throw.
3. Call `calculateDistance(...)` from client.
4. INSERT into `port_distances`.
5. Return `{ distanceNm, source: 'computed' }`.

**Step 5: Commit.**

```bash
git commit -m "feat(knowledge): cache-first distance lookup"
```

---

### Task D6: Initial seed (top-200 ports × 3 routes)

**Files:**

- Create: `scripts/knowledge/sources/distances.ts`
- Create: `data/knowledge/top-200-ports.json` (curated list)

**top-200-ports.json**: pull from UNCTAD or hardcode — 200 LOCODE строк с тестовых portов. Ассистент может сгенерировать.

**seed script**: для каждой пары × 3 routes — calculateDistance, batch INSERT. ~60K rows. Logs progress. Время выполнения ~2-3 часа на VPS (зависит от searoute-py performance).

**Sanity-check**: 5 known pairs hardcoded в тесте — Singapore→Rotterdam via Suez ≈ 8,300nm, Tubarão→Qingdao via Cape ≈ 14,500nm. ±5%.

**Step 5: Commit.**

```bash
git commit -m "feat(knowledge): distances seed script for top-200 ports"
```

---

### Task D7: Migrate `voyage/tce` to use `getDistance`

**Files:**

- Modify: `lib/economics/voyage-calculator.ts` — `distanceNm` becomes optional in `VoyageInput.route`
- Modify: `app/api/voyage/tce/route.ts` — auto-resolve via `getDistance` when missing
- Add feature flag: `KNOWLEDGE_LAYER_DISTANCES_ENABLED=true`
- Modify existing tests: ensure no breakage with explicit `distanceNm`

**Behaviour**:

- If flag off → require explicit `distanceNm` (current behavior)
- If flag on + `distanceNm` present → use it (user override)
- If flag on + missing → resolve via `getDistance(origin, dest, route ?? 'direct')`

**Add new tests** for auto-resolution path.

**Step 5: Commit.**

```bash
git commit -m "feat(voyage): TCE auto-resolves distance when LOCODE present (flag-gated)"
```

---

## Block E — JWC War-Risk Zones (1.5 дня)

### Task E1: Migration 016 — `war_risk_zones` + `jwc_chunks` (vec deferred to Phase 2)

**Files:**

- Create: `lib/migrations/016-war-risk-zones.ts`

```sql
CREATE TABLE war_risk_zones (
  zone_id          TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  region           TEXT NOT NULL,           -- 'red-sea' | 'black-sea' | 'gulf-of-guinea' | 'persian-gulf' | ...
  polygon_geojson  TEXT,                    -- nullable if defined by port-list
  port_list        TEXT,                    -- JSON array of LOCODE — fallback when polygon missing
  transit_rate_pct REAL NOT NULL,
  hold_rate_pct    REAL NOT NULL,
  jwc_version      TEXT NOT NULL,           -- 'JWC-2025-Q1'
  effective_from   TEXT NOT NULL,           -- ISO date
  effective_to     TEXT,                    -- nullable = active
  source_url       TEXT,
  notes            TEXT,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_warrisk_region_active ON war_risk_zones(region, effective_to);
```

```bash
git commit -m "feat(knowledge): migration 016 — war_risk_zones"
```

---

### Task E2: JWC bulletin parser (PDF or curated YAML)

**Decision**: PDF parsing JWC bulletins хрупко. Phase 1 — **curated YAML/JSON** в `data/knowledge/jwc/2025-Q1.yaml`, который ассистент или ты вручную обновляешь раз в квартал. Parser читает yaml, validates, returns rows.

**Files:**

- Create: `data/knowledge/jwc/2025-Q1.yaml` — текущая редакция
- Create: `lib/knowledge/jwc/parser.ts`
- Create: `__tests__/lib/knowledge/jwc/parser.test.ts`

**Sample yaml**:

```yaml
version: JWC-2025-Q1
effective_from: '2025-01-15'
source_url: https://www.lmalloyds.com/lma/jointwar
zones:
  - zone_id: red-sea
    name: Red Sea (south of 18°N)
    region: red-sea
    transit_rate_pct: 0.75
    hold_rate_pct: 0.50
    polygon_geojson: |
      {"type":"Polygon","coordinates":[[[32.5,12.5],[44.0,12.5],[44.0,18.0],[32.5,18.0],[32.5,12.5]]]}
    notes: 'Houthi threat — escalated 2024-Q4'
  - zone_id: black-sea
    ...
```

Validate against zod schema. Test passes.

```bash
git commit -m "feat(knowledge): JWC parser + curated YAML bulletin"
```

---

### Task E3: JWC adapter + integration into `war-risk.ts`

**Files:**

- Create: `lib/knowledge/jwc/adapter.ts`
- Create: `scripts/knowledge/sources/jwc.ts`
- Modify: `lib/economics/war-risk.ts` — replace hardcoded rates with DB lookup
- Modify: existing war-risk tests

**Adapter**: reads YAML, upserts into `war_risk_zones` (close out previous version's `effective_to` = today; insert new with `effective_from`).

**war-risk.ts changes**:

- Lookup active zones via `SELECT * FROM war_risk_zones WHERE effective_to IS NULL`
- Match port via polygon containment OR port_list
- Apply rate
- Cite jwc_version in result

**Feature flag**: `KNOWLEDGE_WAR_RISK_FROM_DB=true`. Off → existing hardcoded behavior.

```bash
git commit -m "feat(knowledge): war-risk reads from war_risk_zones (flag-gated)"
```

---

## Block F — ECA Zones (1 день)

### Task F1: Migration 017 + parser + adapter

**Files:**

- Create: `lib/migrations/017-eca-zones.ts`
- Create: `data/knowledge/eca/marpol-annex-vi.yaml`
- Create: `lib/knowledge/eca/parser.ts`
- Create: `lib/knowledge/eca/adapter.ts`
- Create: `scripts/knowledge/sources/eca.ts`
- Modify: `lib/economics/voyage-calculator.ts` — split bunker by ECA portion of route
- Modify: relevant TCE tests

```sql
CREATE TABLE eca_zones (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL UNIQUE,    -- 'North Sea ECA', 'Baltic ECA', 'North America ECA', 'NECA Mediterranean'
  region            TEXT NOT NULL,
  polygon_geojson   TEXT NOT NULL,
  fuel_sulphur_max_pct REAL NOT NULL,        -- 0.10 inside ECA
  effective_from    TEXT NOT NULL,
  effective_to      TEXT
);
```

**marpol-annex-vi.yaml**: 4 zones with manually copied polygon coordinates from MARPOL Annex VI (publicly available).

**Bunker splitter**: estimate ECA portion of route as % of distance. Phase 1 simplified: if either origin or dest is inside any ECA → assume 5% of route is in ECA. Phase 3 — proper geospatial intersection. Document this trade-off in design doc Q5 if needed.

```bash
git commit -m "feat(knowledge): ECA zones + simplified ECA-aware bunker calc"
```

---

## Block G — Panama Tariffs (0.5 дня)

### Task G1: Refresh existing Panama tariff data

**Files:**

- Modify: `lib/economics/canals/panama.ts` (или вынести в `canal_tariffs` table)
- Create: `data/knowledge/panama/tariffs-2025.yaml`
- Create: `scripts/knowledge/sources/panama-tariffs.ts`

**Decision**: Phase 1 — обновить hardcoded ставки в `panama.ts` до 2025 согласно ACP public schedule + register в knowledge_sources с `last_synced_at = today`. Phase 3 — переносить в DB при необходимости.

Update test fixtures, ensure existing TCE tests still produce correct numbers.

```bash
git commit -m "feat(knowledge): Panama Canal tariffs refreshed to 2025 ACP schedule"
```

---

## Block H — Vertex AI Embedding Pipeline (1.5 дня, foundation only)

### Task H1: Vertex AI client wrapper

**Files:**

- Create: `lib/knowledge/embeddings/client.ts`
- Create: `__tests__/lib/knowledge/embeddings/client.test.ts`

**Step 1: Tests** (use mock for `@google-cloud/aiplatform`):

- `embedDocuments([t1, t2])` returns Float32Array[2] with length 768
- batches > 250 → splits into multiple calls
- silently truncated input → logs warning

**Step 2-3: Implement**

```ts
// lib/knowledge/embeddings/client.ts
import { PredictionServiceClient } from "@google-cloud/aiplatform";

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? "quantika-demo-2026";
const LOCATION = "us-central1";
const MODEL = "text-multilingual-embedding-002";
const DIMENSIONS = 768;
const MAX_BATCH = 250;

const client = new PredictionServiceClient({
  apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`,
});

export type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY";

export async function embed(texts: string[], taskType: TaskType): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH);
    const [response] = await client.predict({
      endpoint: `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}`,
      instances: batch.map((content) => ({
        structValue: {
          fields: {
            content: { stringValue: content },
            task_type: { stringValue: taskType },
          },
        },
      })) as any,
      parameters: {
        structValue: { fields: { autoTruncate: { boolValue: false } } },
      } as any,
    });
    for (const pred of response.predictions ?? []) {
      const values = (
        pred as any
      ).structValue.fields.embeddings.structValue.fields.values.listValue.values.map(
        (v: any) => v.numberValue
      );
      out.push(new Float32Array(values));
    }
  }
  return out;
}

export const embedDocuments = (texts: string[]) => embed(texts, "RETRIEVAL_DOCUMENT");
export const embedQuery = (text: string) => embed([text], "RETRIEVAL_QUERY").then((arr) => arr[0]);
```

**Step 5: Commit.**

```bash
git commit -m "feat(knowledge): Vertex AI embedding client (multilingual-002, 768 dim)"
```

---

### Task H2: sqlite-vec extension loader

**Files:**

- Modify: `package.json` (add `sqlite-vec` dependency)
- Modify: `lib/db/index.ts` — load extension on connect
- Create: `__tests__/lib/db/sqlite-vec.test.ts`

**Step 1: Test** — after init, `db.prepare('CREATE VIRTUAL TABLE IF NOT EXISTS test_vec USING vec0(embedding FLOAT[768])').run()` succeeds.

**Step 2-3: Implement**

```ts
import * as sqliteVec from "sqlite-vec";

export function getDb() {
  const db = new Database(DB_PATH);
  sqliteVec.load(db);
  // ...existing migrations + bootstrap
  return db;
}
```

**Step 5: Commit.**

```bash
git commit -m "feat(knowledge): load sqlite-vec extension on db init"
```

---

### Task H3: Generic embed pipeline + chunk types (no usage yet)

**Files:**

- Create: `lib/knowledge/embeddings/pipeline.ts`
- Create: `lib/knowledge/embeddings/chunks.ts`
- Create: `__tests__/lib/knowledge/embeddings/pipeline.test.ts`

**chunks.ts** — types only (`Chunk`, `ChunkMetadata`, `RetrievedChunk`).

**pipeline.ts** — `embedAndStore(chunks, opts)` + truncate option. Tests cover insert path with mock embedding client.

```bash
git commit -m "feat(knowledge): embed pipeline + chunk types (foundation, no use)"
```

---

## Final Steps

### Task FIN1: Smoke test entire Phase 1

**Files:**

- Create: `__tests__/integration/knowledge-phase1.test.ts`

Integration test that:

1. Runs all 3 migrations (013, 014, 015, 016, 017)
2. Bootstraps registry
3. Mocks OFAC fetcher with fixture XML, calls `refreshOfac` — verifies fresh status
4. Calls `getDistance` for hardcoded port pair, with mocked Python service — verifies cache hit on 2nd call
5. Calls `listSources` — verifies all sources properly tracked
6. Calls `GET /api/health/knowledge` — verifies 200 (all fresh) or 503 (one failing)

```bash
git commit -m "test(knowledge): Phase 1 integration smoke"
```

---

### Task FIN2: Documentation

**Files:**

- Create: `docs/runbooks/knowledge-layer.md` — daily ops руководство
- Create: `docs/adr/2026-05-XX-knowledge-layer.md` — ADR
- Modify: `README.md` — add Knowledge Layer section pointing to runbook

```bash
git commit -m "docs(knowledge): runbook + ADR for Phase 1"
```

---

### Task FIN3: Open PR + adversarial QA

```bash
git push -u origin design/knowledge-layer-2026-05-05
gh pr create --title "feat: Knowledge Layer Phase 1 — governance + 5 critical sources" --body "..."
```

After PR opens, **invoke `/test-skill` in a fresh clean session** for adversarial QA pass before merge. Look for:

- Race conditions in cron + manual refresh
- SQL injection in `refresh_command` execution
- Unauthorized access to `/admin/knowledge`
- searoute Python service timeout/crash recovery
- OFAC XML parsing edge cases (malformed, empty, huge)

Address findings in follow-up commits to same branch.

---

## Acceptance Criteria — Phase 1 Complete

- [ ] All 17 tasks committed, no skipped tests, no `--no-verify`
- [ ] `/admin/knowledge` shows all 10 sources (5 Phase-1 active + 5 Phase-2 placeholders)
- [ ] OFAC daily cron runs 7 days without intervention; Sentry receives no errors
- [ ] `voyage/tce` accepts requests without `distanceNm` when both LOCODEs valid
- [ ] Red Sea war-risk shows ≥0.5% transit rate (not the old 0.075%)
- [ ] All existing tests pass; ≥30 new tests added
- [ ] No existing endpoint regressed (smoke test passes against staging)
- [ ] Adversarial QA PASS or all findings addressed
- [ ] Feature flags ready for instant rollback per source

---

## Phase 1 Summary

- **Duration**: ~4 weeks (calendar)
- **Tasks**: 17 distinct tasks across 8 blocks
- **Migrations**: 013 → 017 (5 new)
- **New files**: ~40 (TypeScript) + ~5 (Python) + ~10 (data/yaml) + ~5 (ops)
- **Feature flags**: `KNOWLEDGE_SANCTIONS_REAL`, `KNOWLEDGE_LAYER_DISTANCES_ENABLED`, `KNOWLEDGE_WAR_RISK_FROM_DB`
- **Deferred to Phase 2**: IMSBC RAG, IGC RAG, JWC RAG (vector chunks), UNLOCODE expansion, Baltic indices, Citation UI, hybrid retriever
- **Deferred to Phase 3**: HandyBulk, reranking, multi-source RAG, assistant-driven loop
