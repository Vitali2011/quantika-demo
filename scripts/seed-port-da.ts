/**
 * seed-port-da.ts
 *
 * Loads baseline JSON, optionally gap-fills panamax/capesize brackets via LLM,
 * then UPSERTs all rows into port_da_estimates.
 *
 * Usage:
 *   npx tsx scripts/seed-port-da.ts
 *
 * Env:
 *   LLM_MODEL   — model name for gap-fill (default: gpt-5.5)
 *   OPENAI_API_KEY / provider key — required for real LLM calls
 *   SESSIONS_DB_PATH — path to sqlite db (default: data/sessions.db)
 *
 * Idempotent: uses INSERT OR REPLACE (UNIQUE constraint on port_code+dwt brackets+cargo_type).
 */

import type Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { getDb } from '../lib/db';
import { runMigrations } from '../lib/migrations/runner';
import { allMigrations } from '../lib/migrations/index';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface BaselineBracket {
  vessel_dwt_min: number;
  vessel_dwt_max: number;
  port_dues_usd: number;
  pilotage_usd: number;
  tugs_usd: number;
  stevedoring_usd_per_mt: number;
  cargo_type: string;
  confidence: 'verified' | 'estimated' | 'low';
  source: string;
}

export interface BaselinePort {
  port_code: string;
  port_name: string;
  brackets: BaselineBracket[];
}

export interface LlmGapBracket {
  vessel_dwt_min: number;
  vessel_dwt_max: number;
  port_dues_usd: number;
  pilotage_usd: number;
  tugs_usd: number;
  stevedoring_usd_per_mt: number;
  confidence: 'estimated' | 'low';
}

// --------------------------------------------------------------------------
// LLM gap-fill
// --------------------------------------------------------------------------

const GAP_BRACKETS = [
  { name: 'panamax',  vessel_dwt_min: 65001, vessel_dwt_max: 80000 },
  { name: 'capesize', vessel_dwt_min: 80001, vessel_dwt_max: 180000 },
];

/**
 * Injectable LLM caller — defaults to real fetch, replaced by jest.fn() in tests.
 */
export type LlmCaller = (
  model: string,
  portCode: string,
  portName: string,
  bracketName: string,
  dwtMin: number,
  dwtMax: number,
) => Promise<LlmGapBracket>;

export const defaultLlmCaller: LlmCaller = async (
  model,
  portCode,
  portName,
  bracketName,
  dwtMin,
  dwtMax,
) => {
  const prompt = `You are a port cost estimator. Provide a JSON-only response (no markdown) for:
Port: ${portName} (${portCode})
Bracket: ${bracketName} (DWT ${dwtMin}–${dwtMax})
Required JSON shape:
{
  "vessel_dwt_min": ${dwtMin},
  "vessel_dwt_max": ${dwtMax},
  "port_dues_usd": <number>,
  "pilotage_usd": <number>,
  "tugs_usd": <number>,
  "stevedoring_usd_per_mt": <number>,
  "confidence": "estimated" | "low"
}
Use realistic estimates. Respond with JSON only.`;

  const apiKey = process.env['OPENAI_API_KEY'] ?? '';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  const raw = data.choices[0]?.message?.content ?? '{}';
  return JSON.parse(raw) as LlmGapBracket;
};

// --------------------------------------------------------------------------
// Input validation
// --------------------------------------------------------------------------

function sanitizeBracket<T extends BaselineBracket | LlmGapBracket>(bracket: T, portCode: string): T {
  const safeNum = (v: number, fallback = 0): number =>
    Number.isFinite(v) ? Math.max(fallback, v) : fallback;
  const dwtMin = Math.max(1, Number.isFinite(bracket.vessel_dwt_min) ? bracket.vessel_dwt_min : 1);
  const dwtMax = Math.max(dwtMin, Number.isFinite(bracket.vessel_dwt_max) ? bracket.vessel_dwt_max : dwtMin);
  if (bracket.vessel_dwt_min !== dwtMin || bracket.vessel_dwt_max !== dwtMax ||
      !Number.isFinite(bracket.port_dues_usd) || bracket.port_dues_usd < 0) {
    console.warn(`[seed-port-da] sanitizing invalid bracket for ${portCode}: ` +
      `dwt=[${bracket.vessel_dwt_min},${bracket.vessel_dwt_max}] port_dues=${bracket.port_dues_usd}`);
  }
  return {
    ...bracket,
    vessel_dwt_min: dwtMin,
    vessel_dwt_max: dwtMax,
    port_dues_usd: safeNum(bracket.port_dues_usd),
    pilotage_usd: safeNum(bracket.pilotage_usd),
    tugs_usd: safeNum(bracket.tugs_usd),
    stevedoring_usd_per_mt: safeNum(bracket.stevedoring_usd_per_mt),
  };
}

// --------------------------------------------------------------------------
// Core seeding logic
// --------------------------------------------------------------------------

export async function seedPortDa(
  db: Database.Database,
  baseline: BaselinePort[],
  llmCaller: LlmCaller = defaultLlmCaller,
): Promise<void> {
  const model = process.env['LLM_MODEL'] ?? 'gpt-5.5';
  const now = Date.now();

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO port_da_estimates
      (port_code, port_name, vessel_dwt_min, vessel_dwt_max,
       port_dues_usd, pilotage_usd, tugs_usd, stevedoring_usd_per_mt,
       cargo_type, confidence, source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((rows: Parameters<typeof upsert.run>[]) => {
    for (const row of rows) {
      upsert.run(...row);
    }
  });

  const rows: Parameters<typeof upsert.run>[] = [];

  for (const port of baseline) {
    const existingMaxDwt = Math.max(...port.brackets.map((b) => b.vessel_dwt_max));

    // Insert baseline brackets
    for (const bracket of port.brackets) {
      const sBracket = sanitizeBracket(bracket, port.port_code);
      rows.push([
        port.port_code, port.port_name,
        sBracket.vessel_dwt_min, sBracket.vessel_dwt_max,
        sBracket.port_dues_usd, sBracket.pilotage_usd, sBracket.tugs_usd,
        sBracket.stevedoring_usd_per_mt,
        sBracket.cargo_type, sBracket.confidence, sBracket.source,
        now,
      ]);
    }

    // Gap-fill: add panamax/capesize brackets if not already covered
    for (const gap of GAP_BRACKETS) {
      if (existingMaxDwt >= gap.vessel_dwt_max) continue;

      try {
        const llmBracket = await llmCaller(
          model, port.port_code, port.port_name, gap.name, gap.vessel_dwt_min, gap.vessel_dwt_max,
        );
        const sLlmBracket = sanitizeBracket(llmBracket, port.port_code);
        rows.push([
          port.port_code, port.port_name,
          sLlmBracket.vessel_dwt_min, sLlmBracket.vessel_dwt_max,
          sLlmBracket.port_dues_usd, sLlmBracket.pilotage_usd, sLlmBracket.tugs_usd,
          sLlmBracket.stevedoring_usd_per_mt,
          'general', llmBracket.confidence, `llm:${model}`,
          now,
        ]);
      } catch {
        // Non-fatal: log and continue without this bracket
        console.warn(`[seed-port-da] LLM gap-fill failed for ${port.port_code}/${gap.name}`);
      }
    }
  }

  insertMany(rows);
}

// --------------------------------------------------------------------------
// CLI entry-point
// --------------------------------------------------------------------------

async function main(): Promise<void> {
  const dbPath = process.env['SESSIONS_DB_PATH']
    ?? path.join(process.cwd(), 'data', 'sessions.db');

  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Use getDb() to ensure sqlite-vec extension is loaded before migrations
  const db = getDb(dbPath);
  runMigrations(db, allMigrations);

  const baselinePath = path.join(__dirname, 'seed-data', 'port-da-base.json');
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as BaselinePort[];

  await seedPortDa(db, baseline);
  console.log(`[seed-port-da] Seeded ${baseline.length} ports.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
