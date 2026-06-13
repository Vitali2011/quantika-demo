/**
 * THROWAWAY DIAGNOSTIC — war-risk v2 shift-table (old vs new, per route).
 * Compares pre-v2 (hardcoded rates, no viaCanal) vs post-v2 (live JWC rates + Suez threading).
 *
 * Run:
 *   SESSIONS_DB_PATH=/root/work/qd-golden/data/demo-seed.db \
 *   npx tsx scripts/diag/war-risk-shift-table.ts
 *
 * READ-ONLY. Never writes to DB. Emits Markdown table to stdout and to
 * docs/superpowers/plans/2026-06-11-war-risk-v2-shift.md
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

import {
  calculateWarRiskPremium,
  JWC_HRA_ZONES,
  JWC_RATE_DATE,
  CREW_WAR_BONUS_PER_PERSON_USD,
  DEFAULT_CREW_COUNT,
  PI_SURCHARGE_BY_ZONE_ID,
  PI_SURCHARGE_USD,
} from '@/lib/economics/war-risk';
import { loadJwcRates } from '@/lib/economics/war-risk-rates';
import { routeTransitsSuez } from '@/lib/matching/tce-calculator';
import { estimateVesselValueUsd } from '@/lib/economics/vessel-value';

const DB_PATH =
  process.env.SESSIONS_DB_PATH || path.join(process.cwd(), 'data', 'demo-seed.db');

const db = new Database(DB_PATH, { readonly: true });

interface MatchRow {
  id: number;
  load_port: string;
  discharge_port: string;
  vessel_dwt: number;
  tce_usd_per_day: number | null;
}

const matches = db
  .prepare(
    `SELECT id, load_port, discharge_port, vessel_dwt, tce_usd_per_day
     FROM matches
     WHERE load_port IS NOT NULL AND discharge_port IS NOT NULL AND vessel_dwt > 0
     ORDER BY id`,
  )
  .all() as MatchRow[];

const liveRates = loadJwcRates();
const rateDate = liveRates?.effectiveFrom ?? JWC_RATE_DATE;
const rateSource = liveRates ? 'knowledge' : 'hardcoded';

interface ShiftRow {
  matchId: number;
  route: string;
  zone: string;
  vesselValue: number;
  oldHull: number;
  newHull: number;
  oldTotal: number;
  newTotal: number;
  delta: number;
  triggerReason: string;
}

const rows: ShiftRow[] = [];

for (const m of matches) {
  const vesselValueUsd = estimateVesselValueUsd(m.vessel_dwt);
  const { load_port: fromPort, discharge_port: toPort } = m;

  // ── OLD scenario: no viaCanal, hardcoded rates ──────────────────────────────
  const oldZoneResult = calculateWarRiskPremium({
    route: { fromPort, toPort },
    vesselValueUsd,
  });
  // Resolve dominant zone using hardcoded premiumPercentPerTransit
  const oldDominantZoneId: string | null =
    oldZoneResult.applicable && oldZoneResult.zoneIds.length > 0
      ? oldZoneResult.zoneIds.reduce((a, b) => {
          const zA = JWC_HRA_ZONES.find(z => z.id === a);
          const zB = JWC_HRA_ZONES.find(z => z.id === b);
          if (!zA || !zB) return a;
          return zA.premiumPercentPerTransit >= zB.premiumPercentPerTransit ? a : b;
        })
      : null;
  const oldDominantZone = oldDominantZoneId
    ? JWC_HRA_ZONES.find(z => z.id === oldDominantZoneId) ?? null
    : null;
  const oldHull = oldDominantZone
    ? Math.round(vesselValueUsd * oldDominantZone.premiumPercentPerTransit)
    : 0;
  const oldCrewBonus = oldDominantZone ? CREW_WAR_BONUS_PER_PERSON_USD * DEFAULT_CREW_COUNT : 0;
  const oldPi = oldDominantZone
    ? (PI_SURCHARGE_BY_ZONE_ID[oldDominantZone.id] ?? PI_SURCHARGE_USD)
    : 0;
  const oldTotal = oldHull + oldCrewBonus + oldPi;

  // ── NEW scenario: viaCanal threaded, live rates ─────────────────────────────
  const suezTransit = routeTransitsSuez(fromPort, toPort);
  const newResult = calculateWarRiskPremium({
    route: { fromPort, toPort, viaCanal: suezTransit ? 'suez' : undefined },
    vesselValueUsd,
  });
  const newHull = newResult.breakdown?.hullPremiumUsd ?? 0;
  const newTotal = newResult.breakdown?.totalPremiumUsd ?? 0;

  const delta = newTotal - oldTotal;

  // Skip if both zero and no change
  if (oldTotal === 0 && newTotal === 0) continue;
  // Also include zero→non-zero and non-zero cases
  if (oldTotal === 0 && newTotal === 0) continue;

  // Trigger reason
  let triggerReason = 'none';
  if (!oldDominantZone && newResult.applicable && suezTransit) {
    triggerReason = 'new-Suez-transit';
  } else if (!oldDominantZone && newResult.applicable) {
    triggerReason = 'new-port-keyword';
  } else if (oldDominantZone && newResult.applicable) {
    triggerReason = delta !== 0 ? 'rate-change' : 'no-change';
  } else if (oldDominantZone && !newResult.applicable) {
    triggerReason = 'lost-applicability';
  }

  const zone = newResult.zoneIds[0] ?? oldDominantZoneId ?? 'unknown';
  const vUsd = vesselValueUsd;

  rows.push({
    matchId: m.id,
    route: `${fromPort} → ${toPort}`,
    zone,
    vesselValue: vUsd,
    oldHull,
    newHull,
    oldTotal,
    newTotal,
    delta,
    triggerReason,
  });
}

// Sort by |Δ| descending
rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

// ── Statistics ───────────────────────────────────────────────────────────────
const falseNegativeFixes = rows.filter(r => r.oldTotal === 0 && r.newTotal > 0);
const rateChanges = rows.filter(r => r.oldTotal > 0 && r.newTotal > 0 && r.delta !== 0);
const noChange = rows.filter(r => r.delta === 0);
const redSeaMultiplier = rows.filter(
  r => r.zone === 'red-sea-hra' && r.oldTotal > 0 && r.newHull / r.oldHull >= 2.5,
);

const totalOld = rows.reduce((s, r) => s + r.oldTotal, 0);
const totalNew = rows.reduce((s, r) => s + r.newTotal, 0);

// ── Markdown output ──────────────────────────────────────────────────────────
function fmt(n: number): string {
  return n === 0 ? '$0' : `$${n.toLocaleString('en-US')}`;
}

const lines: string[] = [
  `# War-Risk v2 — Shift Table`,
  ``,
  `**Generated:** 2026-06-11  `,
  `**Rate source:** ${rateSource} (${rateDate})  `,
  `**DB:** ${DB_PATH}  `,
  `**Total matches analysed:** ${rows.length} (of ${matches.length} with valid routes)  `,
  ``,
  `## Summary`,
  ``,
  `| Metric | Count |`,
  `|---|---|`,
  `| False-negative fixes ($0 → >$0, new Suez-transit) | ${falseNegativeFixes.length} |`,
  `| Rate-change rows (same zone, old % → new %) | ${rateChanges.length} |`,
  `| No-change rows (Δ = $0) | ${noChange.length} |`,
  `| Red Sea ×2.5+ uplift | ${redSeaMultiplier.length} |`,
  ``,
  `**Aggregate old total across affected routes:** ${fmt(totalOld)}  `,
  `**Aggregate new total across affected routes:** ${fmt(totalNew)}  `,
  `**Net shift:** ${fmt(totalNew - totalOld)}  `,
  ``,
  `## Top rows by |Δ| (all routes with any war-risk)`,
  ``,
  `| Match | Route | Zone | Vessel Value | OLD hull | NEW hull | OLD total | NEW total | Δ | Trigger |`,
  `|---|---|---|---|---|---|---|---|---|---|`,
  ...rows.slice(0, 50).map(r =>
    `| ${r.matchId} | ${r.route} | ${r.zone} | ${fmt(r.vesselValue)} | ${fmt(r.oldHull)} | ${fmt(r.newHull)} | ${fmt(r.oldTotal)} | ${fmt(r.newTotal)} | **${r.delta >= 0 ? '+' : ''}${fmt(r.delta)}** | ${r.triggerReason} |`,
  ),
  ``,
  `---`,
  ``,
  `## False-negative fixes (0 → >$0)`,
  ``,
  falseNegativeFixes.length === 0
    ? `_None — no routes changed from $0 to >$0_`
    : [
        `| Match | Route | NEW total | Trigger |`,
        `|---|---|---|---|`,
        ...falseNegativeFixes.map(r => `| ${r.matchId} | ${r.route} | ${fmt(r.newTotal)} | ${r.triggerReason} |`),
      ].join('\n'),
  ``,
  `## Red Sea rate-change rows (hull ×2.7)`,
  ``,
  redSeaMultiplier.length === 0
    ? `_None_`
    : [
        `| Match | Route | OLD hull | NEW hull | Multiplier |`,
        `|---|---|---|---|---|`,
        ...redSeaMultiplier.map(r =>
          `| ${r.matchId} | ${r.route} | ${fmt(r.oldHull)} | ${fmt(r.newHull)} | **${r.oldHull > 0 ? (r.newHull / r.oldHull).toFixed(2) : '∞'}×** |`,
        ),
      ].join('\n'),
];

const md = lines.join('\n');

console.log(md);

const outPath = path.join(process.cwd(), 'docs/superpowers/plans/2026-06-11-war-risk-v2-shift.md');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, md, 'utf8');
console.error(`\nShift table written to ${outPath}`);
