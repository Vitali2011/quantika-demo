/**
 * load-market-indices.ts
 *
 * Loads market index data from CSV file into market_indices table.
 *
 * Usage:
 *   npx tsx scripts/knowledge/load-market-indices.ts --file <path.csv> [--dry-run]
 *
 * CSV format: date,index_name,value,unit
 * Example:
 *   2026-05-01,drewry-bb,1200,USD/day
 *   2026-05-02,drewry-bb,1250,USD/day
 *
 * Env:
 *   SESSIONS_DB_PATH — path to sqlite db (default: data/sessions.db)
 *
 * Idempotent: uses upsertIndex (ON CONFLICT(index_name, index_date) DO UPDATE).
 */

import { readFileSync } from 'fs';
import { getStore } from '../../lib/session-store';
import { upsertIndex } from '../../lib/market/market-indices-repository';
import { randomBytes } from 'crypto';

function parseCSV(content: string): Array<{ date: string; index_name: string; value: number; unit: string }> {
  const lines = content.trim().split('\n');
  const rows: Array<{ date: string; index_name: string; value: number; unit: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Skip header if present
    if (line.startsWith('date,') || line.startsWith('Date,')) continue;

    const parts = line.split(',');
    if (parts.length < 4) {
      console.warn(`  ⚠ Skipping invalid row ${i + 1}: insufficient columns`);
      continue;
    }

    const [date, index_name, valueStr, unit] = parts.map(p => p.trim());
    const value = parseFloat(valueStr);

    if (!date || !index_name || !unit) {
      console.warn(`  ⚠ Skipping invalid row ${i + 1}: missing required fields`);
      continue;
    }

    if (!Number.isFinite(value) || value < 0) {
      console.warn(`  ⚠ Skipping invalid row ${i + 1}: invalid value (${valueStr})`);
      continue;
    }

    rows.push({ date, index_name, value, unit });
  }

  return rows;
}

export function loadMarketIndices(filePath: string, dryRun: boolean = false): void {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error(`Error reading file: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const rows = parseCSV(content);
  console.log(`Parsed ${rows.length} valid rows from ${filePath}`);

  if (dryRun) {
    console.log('\nDry-run mode: showing first 5 rows without writing to DB');
    rows.slice(0, 5).forEach((row, idx) => {
      console.log(`  ${idx + 1}. ${row.date} | ${row.index_name} | ${row.value} ${row.unit}`);
    });
    return;
  }

  const db = getStore().getDatabase();
  console.log('\nWriting to database...');

  let written = 0;
  for (const row of rows) {
    const id = `${row.index_name}-${row.date}`;
    upsertIndex(db, {
      id,
      index_name: row.index_name,
      index_date: row.date,
      value: row.value,
      unit: row.unit,
      source: 'manual-csv',
      fetched_at: new Date().toISOString(),
    });
    written++;
  }

  console.log(`✓ Wrote ${written} rows to market_indices table.`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let filePath: string | null = null;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && i + 1 < args.length) {
      filePath = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  if (!filePath) {
    console.error('Usage: npx tsx scripts/knowledge/load-market-indices.ts --file <path.csv> [--dry-run]');
    process.exit(1);
  }

  loadMarketIndices(filePath, dryRun);
}
