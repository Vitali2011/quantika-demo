#!/usr/bin/env tsx
/**
 * One-off migration: sanitize XSS payloads stored in charterers.name / charterers.notes.
 *
 * QA-walker (2026-05-25) stored <script>alert(1)</script> as charterer names.
 * This script finds all rows containing HTML tags and sanitizes them in place.
 * Rows whose name sanitizes to empty are deleted (no valid name left).
 *
 * Usage:
 *   npx tsx scripts/migrate-charterers-xss.ts [--dry-run] [--db-path /path/to/sessions.db]
 *
 * DB resolution: --db-path → SESSIONS_DB_PATH env var → ./data/sessions.db
 * Exit codes: 0 = ok, 1 = error
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { sanitizeText } from '../lib/sanitize-text';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dbPathArg = (() => {
  const idx = args.indexOf('--db-path');
  return idx !== -1 ? args[idx + 1] : undefined;
})();

const dbPath =
  dbPathArg ??
  process.env.SESSIONS_DB_PATH ??
  path.join(process.cwd(), 'data', 'sessions.db');

if (!fs.existsSync(dbPath)) {
  console.error(`DB not found: ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);

interface ChartererRow {
  id: string;
  name: string;
  tier: string;
  payment_history: string;
  require_lc: number;
  notes: string | null;
}

const rows = db
  .prepare<[], ChartererRow>(
    `SELECT id, name, tier, payment_history, require_lc, notes FROM charterers WHERE name LIKE '%<%' OR notes LIKE '%<%'`
  )
  .all();

if (rows.length === 0) {
  console.log('No XSS rows found — charterers table is clean.');
  db.close();
  process.exit(0);
}

console.log(`Found ${rows.length} row(s) with potential XSS content.`);

let updated = 0;
let deleted = 0;

for (const row of rows) {
  const cleanName = sanitizeText(row.name);
  const cleanNotes = row.notes != null ? sanitizeText(row.notes) : null;

  const nameChanged = cleanName !== row.name;
  const notesChanged = cleanNotes !== row.notes;

  if (!nameChanged && !notesChanged) continue;

  if (!cleanName) {
    console.log(`  DELETE id=${row.id} — name "${row.name}" sanitizes to empty`);
    if (!dryRun) {
      db.prepare(`DELETE FROM charterers WHERE id = ?`).run(row.id);
    }
    deleted++;
  } else {
    console.log(`  UPDATE id=${row.id} name="${row.name}" → "${cleanName}"`);
    if (notesChanged) {
      console.log(`    notes: "${row.notes}" → "${cleanNotes}"`);
    }
    if (!dryRun) {
      db.prepare(
        `UPDATE charterers SET name = ?, notes = ? WHERE id = ?`
      ).run(cleanName, cleanNotes, row.id);
    }
    updated++;
  }
}

db.close();

if (dryRun) {
  console.log(`\n[dry-run] Would update ${updated}, delete ${deleted} row(s).`);
} else {
  console.log(`\nDone: updated ${updated}, deleted ${deleted} row(s).`);
}
