/**
 * scripts/knowledge/status.ts
 *
 * Displays the status of all knowledge sources in a formatted table.
 *
 * Usage:
 *   npm run knowledge:status
 *   npm run knowledge:status <slug>  # filter by specific source
 *
 * Env:
 *   SESSIONS_DB_PATH — path to sqlite db (default: data/sessions.db)
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { runMigrations } from '../../lib/migrations/runner';
import { allMigrations } from '../../lib/migrations/index';
import { bootstrapKnowledgeSources } from '../../lib/knowledge/bootstrap';
import { listSources } from '../../lib/knowledge/governance';

// --------------------------------------------------------------------------
// Formatting helpers
// --------------------------------------------------------------------------

function formatHealthSignal(signal: string): string {
  const icons: Record<string, string> = {
    ok: '✅',
    never_synced: '⚠️',
    overdue: '⏰',
    failing: '❌',
  };
  return `${icons[signal] ?? '?'} ${signal}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;

  return date.toISOString().split('T')[0];
}

// --------------------------------------------------------------------------
// Main logic
// --------------------------------------------------------------------------

async function main(): Promise<void> {
  const dbPath =
    process.env['SESSIONS_DB_PATH'] ?? path.join(process.cwd(), 'data', 'sessions.db');

  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  runMigrations(db, allMigrations);
  bootstrapKnowledgeSources(db);

  // Optional filter by slug from command line
  const filterSlug = process.argv[2];
  const sources = listSources(db, filterSlug ? { slug: filterSlug } : {});

  if (sources.length === 0) {
    console.log('No knowledge sources found.');
    return;
  }

  // Print header
  console.log('\n📚 Knowledge Layer — Source Status\n');

  // Calculate column widths
  const maxSlugLen = Math.max(8, ...sources.map((s) => s.slug.length));
  const maxNameLen = Math.max(12, ...sources.map((s) => s.name.length));

  // Header
  const headerLine =
    'Slug'.padEnd(maxSlugLen) +
    '  ' +
    'Name'.padEnd(maxNameLen) +
    '  ' +
    'Health'.padEnd(18) +
    '  ' +
    'Last Sync'.padEnd(15) +
    '  ' +
    'Rows';
  console.log(headerLine);
  console.log('='.repeat(headerLine.length));

  // Rows
  for (const src of sources) {
    const slug = src.slug.padEnd(maxSlugLen);
    const name = src.name.padEnd(maxNameLen);
    const health = formatHealthSignal(src.health_signal).padEnd(18);
    const lastSync = formatDate(src.last_synced_at).padEnd(15);
    const rows = src.row_count !== null ? src.row_count.toLocaleString() : '-';

    console.log(`${slug}  ${name}  ${health}  ${lastSync}  ${rows}`);

    // Show error details if failing
    if (src.health_signal === 'failing' && src.last_error) {
      const errorPreview = src.last_error.substring(0, 80);
      console.log(`  ↳ Error: ${errorPreview}${src.last_error.length > 80 ? '...' : ''}`);
    }
  }

  console.log('\n');
  db.close();
}

// --------------------------------------------------------------------------
// CLI entry-point
// --------------------------------------------------------------------------

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
