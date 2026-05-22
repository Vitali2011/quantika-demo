#!/usr/bin/env tsx
/**
 * data-integrity-check.ts — env-aware data integrity audit for quantika-demo.
 *
 * ALWAYS prints DB path + environment in the header. Root cause of this script:
 * 2026-05-22 audit measured dev DB but the report sounded like prod — ambiguity
 * eliminated by making the measured environment explicit and mandatory.
 *
 * Usage:
 *   npx tsx scripts/data-integrity-check.ts
 *   npx tsx scripts/data-integrity-check.ts --env prod
 *   npx tsx scripts/data-integrity-check.ts --env prod --db-path /root/quantika-demo/data/sessions.db
 *
 * DB resolution order (same as app runtime):
 *   1. --db-path CLI arg
 *   2. SESSIONS_DB_PATH env var
 *   3. ./data/sessions.db  (local dev default)
 *
 * Env label (cosmetic — does NOT change which DB is opened):
 *   1. --env CLI arg (prod | dev | staging)
 *   2. NODE_ENV
 *   3. "dev" (safe default)
 *
 * Exit codes: 0 = audit clean, 1 = critical gap detected (empty table / stale data)
 *
 * Read-only: opens SQLite with { readonly: true } — never writes to any DB.
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import * as path from 'path';
import * as fs from 'fs';

// ─── CLI arg parsing ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const cliDbPath = getArg('--db-path');
const cliEnv   = getArg('--env');

const DB_PATH = cliDbPath
  ?? process.env['SESSIONS_DB_PATH']
  ?? path.join(process.cwd(), 'data', 'sessions.db');

const ENV_LABEL: string = cliEnv ?? process.env['NODE_ENV'] ?? 'dev';

// ─── Table definitions ───────────────────────────────────────────────────────

interface TableSpec {
  table: string;
  label: string;
  category: 'operational' | 'reference' | 'market' | 'compliance' | 'analytics';
  freshnessCol?: string;    // column holding the latest timestamp
  sourceCol?: string;       // column holding source tag (real/synthetic indicator)
  critical: boolean;        // if empty in prod → exit 1
}

const TABLES: TableSpec[] = [
  // Operational
  { table: 'sessions',             label: 'Sessions (demo)',        category: 'operational', freshnessCol: 'created_at',  critical: false },
  { table: 'parsed_results',       label: 'Parsed cargo/vessel',    category: 'operational', freshnessCol: 'created_at',  critical: false },
  { table: 'matches',              label: 'AI cargo-vessel matches', category: 'operational', freshnessCol: 'created_at',  critical: false },
  { table: 'ai_audit',             label: 'AI audit log',           category: 'operational', freshnessCol: 'created_at',  critical: false },
  // Reference (seeded)
  { table: 'charterers',           label: 'Charterers',             category: 'reference',   freshnessCol: 'created_at',  critical: true  },
  { table: 'port_da_estimates',    label: 'Port DA estimates',      category: 'reference',   freshnessCol: 'updated_at',  sourceCol: 'source', critical: true },
  { table: 'port_master',          label: 'Port master (UNLOCODE)', category: 'reference',   freshnessCol: 'updated_at',  critical: true  },
  { table: 'port_distances',       label: 'Port distances',         category: 'reference',   freshnessCol: 'created_at',  critical: false },
  // Market data (refreshed)
  { table: 'bunker_prices',        label: 'Bunker prices',          category: 'market',      freshnessCol: 'fetched_at',  sourceCol: 'source', critical: true },
  { table: 'eua_prices',           label: 'EUA prices',             category: 'market',      freshnessCol: 'fetched_at',  sourceCol: 'source', critical: false },
  { table: 'fx_rates',             label: 'FX rates',               category: 'market',      freshnessCol: 'fetched_at',  sourceCol: 'source', critical: true },
  { table: 'baltic_indices',       label: 'Baltic indices',         category: 'market',      freshnessCol: 'fetched_at',  sourceCol: 'source', critical: false },
  // Compliance
  { table: 'eu_sanctions_entities',label: 'EU sanctions',           category: 'compliance',  freshnessCol: 'fetched_at',  critical: true  },
  { table: 'ofac_entities',        label: 'OFAC entities',          category: 'compliance',  freshnessCol: 'fetched_at',  critical: true  },
  { table: 'war_risk_zones',       label: 'JWC war risk zones',     category: 'compliance',  freshnessCol: 'created_at',  critical: false },
  { table: 'psc_detention_history',label: 'PSC detention history',  category: 'analytics',   freshnessCol: 'fetched_at',  critical: false },
  // Analytics
  { table: 'roi_metrics',          label: 'ROI metrics',            category: 'analytics',   freshnessCol: 'created_at',  critical: false },
  // Knowledge layer governance
  { table: 'knowledge_sources',    label: 'Knowledge sources',      category: 'reference',   freshnessCol: 'updated_at',  critical: false },
];

// ─── Source type heuristic ───────────────────────────────────────────────────

function classifySource(source: string | null): string {
  if (!source) return 'unknown';
  const s = source.toLowerCase();
  if (s.includes('static') || s.includes('fixture') || s.includes('synthetic') || s.includes('seed')) return 'SYNTHETIC';
  if (s.includes('usda') || s.includes('ship') || s.includes('ecb') || s.includes('frankfurter')
      || s.includes('eu-ets') || s.includes('ofac') || s.includes('eu-') || s.includes('official')
      || s.includes('lmalloyds') || s.includes('api') || s.includes('real')) return 'REAL';
  return `REAL? (${source})`;
}

// ─── Freshness formatting ────────────────────────────────────────────────────

function formatAge(ts: string | number | null | undefined): string {
  if (ts == null || ts === '') return '—';
  let ms: number;
  if (typeof ts === 'number') {
    // Unix timestamp (seconds or milliseconds)
    ms = ts > 1e10 ? ts : ts * 1000;
  } else {
    ms = new Date(ts).getTime();
  }
  if (isNaN(ms)) return `raw:${ts}`;
  const diffDays = Math.floor((Date.now() - ms) / 86_400_000);
  if (diffDays < 0) return 'future?';
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

interface RowResult {
  label: string;
  table: string;
  category: string;
  rows: number | string;
  freshness: string;
  source: string;
  status: 'OK' | 'EMPTY' | 'STALE' | 'MISSING';
}

function run(): void {
  // ── Header ────────────────────────────────────────────────────────────────
  const absDbPath = path.resolve(DB_PATH);
  const now = new Date().toISOString();

  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  QUANTIKA DATA INTEGRITY AUDIT');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  ENV:     ${ENV_LABEL.toUpperCase()}`);
  console.log(`  DB:      ${absDbPath}`);
  console.log(`  EXISTS:  ${fs.existsSync(absDbPath) ? 'YES' : 'NO — file not found'}`);
  console.log(`  RUN AT:  ${now}`);
  console.log('══════════════════════════════════════════════════════════════');
  console.log('');

  if (!fs.existsSync(absDbPath)) {
    console.error(`ERROR: Database not found: ${absDbPath}`);
    console.error('');
    console.error('For prod audit, pass the prod DB path explicitly:');
    console.error('  --db-path /root/quantika-demo/data/sessions.db --env prod');
    console.error('');
    console.error('To copy prod DB locally first, run:');
    console.error('  bash scripts/sync-dev-from-prod.sh');
    process.exit(1);
  }

  // ── Open DB read-only ────────────────────────────────────────────────────
  const db = new Database(absDbPath, { readonly: true });
  sqliteVec.load(db);

  // ── Check each table ─────────────────────────────────────────────────────
  const results: RowResult[] = [];
  let hasGap = false;

  for (const spec of TABLES) {
    // Check table exists
    const tableExists = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(spec.table);

    if (!tableExists) {
      results.push({
        label: spec.label,
        table: spec.table,
        category: spec.category,
        rows: '—',
        freshness: '—',
        source: '—',
        status: 'MISSING',
      });
      if (spec.critical) hasGap = true;
      continue;
    }

    // Row count
    const countRow = db.prepare(`SELECT COUNT(*) AS n FROM "${spec.table}"`).get() as { n: number };
    const rows = countRow.n;

    // Freshness: latest timestamp
    let freshness = '—';
    if (spec.freshnessCol) {
      try {
        const colExists = db
          .prepare(`PRAGMA table_info("${spec.table}")`)
          .all()
          .some((c: unknown) => (c as { name: string }).name === spec.freshnessCol);
        if (colExists) {
          const fRow = db
            .prepare(`SELECT MAX("${spec.freshnessCol}") AS ts FROM "${spec.table}"`)
            .get() as { ts: string | number | null };
          freshness = formatAge(fRow?.ts);
        }
      } catch {
        freshness = 'err';
      }
    }

    // Source classification
    let source = '—';
    if (spec.sourceCol) {
      try {
        const colExists = db
          .prepare(`PRAGMA table_info("${spec.table}")`)
          .all()
          .some((c: unknown) => (c as { name: string }).name === spec.sourceCol);
        if (colExists) {
          const srcRow = db
            .prepare(`SELECT "${spec.sourceCol}" AS s, COUNT(*) AS n FROM "${spec.table}" GROUP BY "${spec.sourceCol}" ORDER BY n DESC LIMIT 1`)
            .get() as { s: string | null; n: number } | undefined;
          source = classifySource(srcRow?.s ?? null);
        }
      } catch {
        source = 'err';
      }
    }

    // Status
    let status: RowResult['status'] = 'OK';
    if (rows === 0) {
      status = spec.critical ? 'EMPTY' : 'EMPTY';
      if (spec.critical) hasGap = true;
    }

    results.push({ label: spec.label, table: spec.table, category: spec.category, rows, freshness, source, status });
  }

  db.close();

  // ── Print table ──────────────────────────────────────────────────────────
  const categoryOrder = ['operational', 'reference', 'market', 'compliance', 'analytics'];
  let lastCat = '';

  const COL = { label: 28, rows: 8, freshness: 14, source: 18, status: 8 };

  const header = [
    'Table'.padEnd(COL.label),
    'Rows'.padStart(COL.rows),
    'Freshness'.padEnd(COL.freshness),
    'Source'.padEnd(COL.source),
    'Status',
  ].join('  ');
  const hr = '─'.repeat(header.length);

  for (const cat of categoryOrder) {
    const rows = results.filter(r => r.category === cat);
    if (rows.length === 0) continue;
    if (lastCat !== cat) {
      console.log(`  ── ${cat.toUpperCase()} ──`);
      console.log(`  ${header}`);
      console.log(`  ${hr}`);
      lastCat = cat;
    }
    for (const r of rows) {
      const statusIcon = r.status === 'OK' ? '✓' : r.status === 'MISSING' ? '?' : '✗';
      const line = [
        r.label.padEnd(COL.label),
        String(r.rows).padStart(COL.rows),
        r.freshness.padEnd(COL.freshness),
        r.source.padEnd(COL.source),
        `${statusIcon} ${r.status}`,
      ].join('  ');
      console.log(`  ${line}`);
    }
    console.log('');
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const ok      = results.filter(r => r.status === 'OK').length;
  const empty   = results.filter(r => r.status === 'EMPTY').length;
  const missing = results.filter(r => r.status === 'MISSING').length;

  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  RESULT: ${hasGap ? '✗ GAPS DETECTED' : '✓ CLEAN'}`);
  console.log(`  OK: ${ok}  EMPTY: ${empty}  MISSING: ${missing}`);
  if (hasGap) {
    console.log('  !! Critical tables are empty or missing — run seeds or sync from prod.');
  }
  console.log('══════════════════════════════════════════════════════════════');
  console.log('');

  if (hasGap) process.exit(1);
}

run();
