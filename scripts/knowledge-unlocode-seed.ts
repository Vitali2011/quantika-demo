#!/usr/bin/env tsx
/**
 * UN/LOCODE seed script — populates port_master table.
 *
 * Downloads the official UNECE UN/LOCODE CSV (via GitHub datasets mirror),
 * filters to port/terminal entries (Function column contains '1'),
 * converts DMS coordinates to decimal degrees, then UPSERTs into port_master.
 *
 * Usage:
 *   npm run knowledge:unlocode
 *   npm run knowledge:unlocode -- --dry-run
 *
 * Env:
 *   SESSIONS_DB_PATH — path to sqlite db (default: data/sessions.db)
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDb } from '../lib/db';
import { runMigrations } from '../lib/migrations/runner';
import { allMigrations } from '../lib/migrations/index';

const CSV_URL =
  'https://raw.githubusercontent.com/datasets/un-locode/main/data/code-list.csv';

// ---------------------------------------------------------------------------
// Coordinate conversion helpers
// ---------------------------------------------------------------------------

/**
 * Parse a UN/LOCODE coordinate string into decimal degrees.
 *
 * Format: "DDMM[N/S] DDDMM[E/W]"
 * Examples: "5155N 00421E",  "3352S 01832E"
 *
 * Returns null if the string is missing or cannot be parsed.
 */
export function parseUnlocodeCoords(
  raw: string | undefined
): { lat: number; lon: number } | null {
  if (!raw || raw.trim() === '') return null;

  // Remove surrounding quotes if present (CSV quirks)
  const s = raw.trim().replace(/^"|"$/g, '');
  if (s === '') return null;

  // Expect exactly two tokens separated by a space
  const parts = s.split(' ');
  if (parts.length !== 2) return null;

  const latPart = parts[0];
  const lonPart = parts[1];

  const lat = parseDms(latPart, /^(\d{2})(\d{2})([NS])$/);
  const lon = parseDms(lonPart, /^(\d{3})(\d{2})([EW])$/);

  if (lat === null || lon === null) return null;
  return { lat, lon };
}

function parseDms(token: string, re: RegExp): number | null {
  const m = token.match(re);
  if (!m) return null;
  const deg = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  const dir = m[3]!;
  const decimal = deg + min / 60;
  return dir === 'S' || dir === 'W' ? -decimal : decimal;
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

export interface UnlocodeRow {
  unlocode: string;
  name: string;
  country: string;
  lat: number | null;
  lon: number | null;
  subdivision: string | null;
}

/**
 * Parse raw CSV text into structured rows.
 * Filters out rows with no coordinates or where Function doesn't include '1'.
 */
export function parseCsv(csvText: string): UnlocodeRow[] {
  const lines = csvText.split('\n');
  if (lines.length === 0) return [];

  // Normalise header — strip BOM if present
  const rawHeader = lines[0]!.replace(/^﻿/, '');
  const headers = splitCsvLine(rawHeader);

  const idxCountry = headers.indexOf('Country');
  const idxLocation = headers.indexOf('Location');
  const idxName = headers.indexOf('Name');
  const idxSubdivision = headers.indexOf('Subdivision');
  const idxFunction = headers.indexOf('Function');
  const idxCoordinates = headers.indexOf('Coordinates');

  const missing: string[] = [];
  if (idxCountry < 0) missing.push('Country');
  if (idxLocation < 0) missing.push('Location');
  if (idxName < 0) missing.push('Name');
  if (idxSubdivision < 0) missing.push('Subdivision');
  if (idxFunction < 0) missing.push('Function');
  if (idxCoordinates < 0) missing.push('Coordinates');
  if (missing.length > 0) {
    throw new Error(`UN/LOCODE CSV missing expected columns: ${missing.join(', ')}`);
  }

  const rows: UnlocodeRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === '') continue;

    const cols = splitCsvLine(line);

    const country = (cols[idxCountry] ?? '').trim();
    const location = (cols[idxLocation] ?? '').trim();
    const name = (cols[idxName] ?? '').trim();
    const subdivision = (cols[idxSubdivision] ?? '').trim() || null;
    const fn = (cols[idxFunction] ?? '').trim();
    const coordsRaw = cols[idxCoordinates] ?? '';

    // Skip rows without a country or location code (empty / header repeats)
    if (!country || !location) continue;

    // Only keep port/terminal entries: Function field must contain '1'
    if (!fn.includes('1')) continue;

    const coords = parseUnlocodeCoords(coordsRaw);
    // Skip rows with no coordinates (cannot be used for routing / lookups)
    if (!coords) continue;

    rows.push({
      unlocode: country + location,
      name,
      country,
      lat: coords.lat,
      lon: coords.lon,
      subdivision,
    });
  }

  return rows;
}

/**
 * Minimal CSV line splitter that handles double-quoted fields.
 */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;

    if (ch === '"') {
      // Handle escaped quotes ""
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  result.push(current);
  return result;
}

// ---------------------------------------------------------------------------
// DB upsert
// ---------------------------------------------------------------------------

export function upsertRows(
  db: import('better-sqlite3').Database,
  rows: UnlocodeRow[]
): number {
  const stmt = db.prepare<[string, string, string, number | null, number | null, string | null]>(`
    INSERT OR REPLACE INTO port_master (unlocode, name, country, lat, lon, subdivision, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const upsertMany = db.transaction((batch: UnlocodeRow[]) => {
    for (const row of batch) {
      stmt.run(row.unlocode, row.name, row.country, row.lat, row.lon, row.subdivision);
    }
  });

  upsertMany(rows);
  return rows.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const dbPath =
    process.env['SESSIONS_DB_PATH'] ??
    path.join(process.cwd(), 'data', 'sessions.db');

  console.log(`[unlocode-seed] Downloading CSV from ${CSV_URL}`);
  const res = await fetch(CSV_URL);
  if (!res.ok) {
    throw new Error(`Failed to download UN/LOCODE CSV: ${res.status} ${res.statusText}`);
  }
  const csvText = await res.text();
  console.log(`[unlocode-seed] Downloaded ${csvText.length} bytes`);

  const rows = parseCsv(csvText);
  console.log(`[unlocode-seed] Parsed ${rows.length} port rows (Function includes '1', coords present)`);

  if (dryRun) {
    console.log('[DRY RUN] First 5 rows:');
    for (const r of rows.slice(0, 5)) {
      console.log(` ${r.unlocode}  ${r.name}  (${r.lat}, ${r.lon})`);
    }
    console.log('[DRY RUN] Skipping DB upsert.');
    return;
  }

  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = getDb(dbPath);
  runMigrations(db, allMigrations);

  const count = upsertRows(db, rows);
  console.log(`[unlocode-seed] Upserted ${count} rows into port_master.`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[unlocode-seed] Error:', err);
    process.exit(1);
  });
}
