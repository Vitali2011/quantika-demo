#!/usr/bin/env -S npx tsx
/** audit-matches.ts — broker-grade audit of the 200 main demo matches. Read-only. */
import Database from 'better-sqlite3';
import path from 'node:path';
import type { FitBreakdown } from '@/lib/types';

const db = new Database(path.resolve(process.cwd(), 'data/demo-seed.db'), { readonly: true });
const rows = db.prepare(
  `SELECT cargo_id, vessel_id, vessel_name, cargo_ref, score, fit_percent, fit_breakdown, distance_nm
     FROM matches WHERE user_id IS NULL ORDER BY fit_percent DESC`,
).all() as Array<{ cargo_id: string; vessel_id: string; vessel_name: string | null; cargo_ref: string | null; score: number; fit_percent: number | null; fit_breakdown: string | null; distance_nm: number | null }>;

const n = rows.length;
const tier = (f: number) => (f >= 80 ? 'A ≥80 (сильные)' : f >= 70 ? 'B 70-79 (хорошие)' : f >= 60 ? 'C 60-69 (рабочие)' : 'D 48-59 (запасные)');
const tiers = new Map<string, number>();
const verdicts = new Map<string, number>();
let capped = 0; const capReasons = new Map<string, number>();
let idleAny = 0, idleGt10 = 0;
let unknownFactor = 0, distUnknown = 0;
let utilDead = 0, utilLow = 0, utilGood = 0, utilOver = 0, utilPart = 0;

for (const r of rows) {
  const f = r.fit_percent ?? 0;
  tiers.set(tier(f), (tiers.get(tier(f)) ?? 0) + 1);
  const fb = r.fit_breakdown ? (JSON.parse(r.fit_breakdown) as FitBreakdown) : null;
  if (!fb) continue;
  const v = fb.inputs?.verdict ?? 'n/a';
  verdicts.set(v, (verdicts.get(v) ?? 0) + 1);
  if (v === 'idle') { idleAny++; if ((fb.inputs?.gapDays ?? 0) > 10) idleGt10++; }
  if (fb.appliedCap) { capped++; const key = fb.appliedCap.reason.replace(/\d+/g, 'N').slice(0, 40); capReasons.set(key, (capReasons.get(key) ?? 0) + 1); }
  if (fb.components?.some((c) => /unknown|unverified|not performed|unavailable/i.test(c.rationale))) unknownFactor++;
  if (fb.inputs?.distanceNm == null) distUnknown++;
  const u = fb.inputs?.utilisation;
  if (fb.partCargo) utilPart++;
  else if (u == null) { /* counted in unknownFactor */ }
  else if (u < 0.40) utilDead++;
  else if (u < 0.65) utilLow++;
  else if (u <= 1.05) utilGood++;
  else utilOver++;
}

const cargoes = new Set(rows.map((r) => r.cargo_id)).size;
const vessels = new Set(rows.map((r) => r.vessel_id)).size;

console.log(`=== BROKER AUDIT · ${n} main matches ===`);
console.log(`spread: distinct cargoes=${cargoes} vessels=${vessels}`);
console.log(`\nFIT TIERS:`); [...tiers.entries()].sort().forEach(([k, c]) => console.log(`  ${k.padEnd(20)} ${c}`));
console.log(`\nTIMING verdict:`); [...verdicts.entries()].forEach(([k, c]) => console.log(`  ${k.padEnd(10)} ${c}`));
console.log(`  idle total=${idleAny} (of which wait>10d=${idleGt10})`);
console.log(`\nCAPS (broker-reality ceiling applied): ${capped}`); [...capReasons.entries()].forEach(([k, c]) => console.log(`  ${k} → ${c}`));
console.log(`\nDATA-QUALITY FLAGS:`);
console.log(`  matches with >=1 factor scored on UNKNOWN data: ${unknownFactor}`);
console.log(`  matches with UNKNOWN ballast distance: ${distUnknown}`);
console.log(`\nUTILISATION (non-part-cargo): deadfreight<40%=${utilDead} low40-65%=${utilLow} good65-105%=${utilGood} over>105%=${utilOver} · part-cargo=${utilPart}`);
console.log(`\nTOP 5:`); rows.slice(0, 5).forEach((r) => console.log(`  ${r.fit_percent}% ${r.vessel_name} × ${(r.cargo_ref ?? '').slice(0, 34)}`));
console.log(`BOTTOM 5:`); rows.slice(-5).forEach((r) => console.log(`  ${r.fit_percent}% ${r.vessel_name} × ${(r.cargo_ref ?? '').slice(0, 34)}`));
db.close();
