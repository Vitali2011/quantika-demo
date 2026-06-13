import type Database from 'better-sqlite3';
import { getStore } from '@/lib/session-store';
import { updateSession } from '@/lib/session';
import { buildProcessedEmails } from '@/lib/classification-service';
import { deriveMatchLevel } from '@/lib/sailing/match-scoring';
import { deleteOrphanSessionMatches } from '@/lib/matching/matches-repository';
import { logger } from '@/lib/logger';
import { calculateWarRiskPremium } from '@/lib/economics/war-risk';
import { estimateVesselValueUsd } from '@/lib/economics/vessel-value';
import type {
  Email, Classification, ParsedCargo, ParsedVessel, ParsedFixtureRecap, Match, ScoreBreakdown, SessionData,
} from '@/lib/types';

type DemoBlob = Pick<
  SessionData,
  'emails' | 'classifications' | 'parsedCargos' | 'parsedVessels'
  | 'parsedFixtureRecaps' | 'processedEmails' | 'matches' | 'isSampleData' | 'accountId'
  | 'lowConfidenceMatches' | 'insufficientData'
>;

interface EmailRow {
  gmail_message_id: string; thread_id: string; from_addr: string; from_name: string | null;
  from_email: string | null; to_addr: string; subject: string; date: string;
  body: string; snippet: string; label_ids: string | null;
}
interface ParsedRow { parse_type: string; result_json: string; }
interface MatchRow {
  cargo_id: string; vessel_id: string; score: number;
  reason: string | null; reason_structured: string | null;
  fit_percent: number | null; fit_breakdown: string | null;
  cargo_item_index: number | null; vessel_item_index: number | null;
  worksheet_json: string | null;
  tce_usd_per_day: number | null;
  freight_rate_usd_per_mt: number | null;
  freight_rate_source: string | null;
  load_port: string | null;
  discharge_port: string | null;
  vessel_dwt: number | null;
}

function safeJsonArray<T>(json: string, ctx: string): T[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch (err) {
    logger.warn({ err, ctx }, 'demo hydrate: bad result_json, skipping row');
    return [];
  }
}

function safeJsonObject<T>(json: string | null): T | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
}

function dedupByKey<T extends { emailId: string; itemIndex: number }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = `${it.emailId}|${it.itemIndex}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(it);
  }
  return out;
}

export function buildDemoSessionBlob(db: Database.Database): DemoBlob {
  const emailRows = db.prepare(
    `SELECT gmail_message_id, thread_id, from_addr, from_name, from_email,
            to_addr, subject, date, body, snippet, label_ids FROM emails`,
  ).all() as EmailRow[];

  const emails: Email[] = emailRows.map((r) => ({
    id: r.gmail_message_id,
    threadId: r.thread_id,
    from: r.from_addr,
    fromName: r.from_name,
    fromEmail: r.from_email,
    to: r.to_addr,
    subject: r.subject,
    date: r.date,
    body: r.body,
    snippet: r.snippet,
    labelIds: r.label_ids ? safeJsonArray<string>(r.label_ids, 'label_ids') : [],
  }));

  const parsedRows = db.prepare(
    `SELECT parse_type, result_json FROM parsed_results`,
  ).all() as ParsedRow[];

  const parsedCargos: ParsedCargo[] = [];
  const parsedVessels: ParsedVessel[] = [];
  const parsedFixtureRecaps: ParsedFixtureRecap[] = [];
  const classifications: Classification[] = [];
  for (const row of parsedRows) {
    switch (row.parse_type) {
      case 'cargo': parsedCargos.push(...safeJsonArray<ParsedCargo>(row.result_json, 'cargo')); break;
      case 'vessel': parsedVessels.push(...safeJsonArray<ParsedVessel>(row.result_json, 'vessel')); break;
      case 'recap': parsedFixtureRecaps.push(...safeJsonArray<ParsedFixtureRecap>(row.result_json, 'recap')); break;
      case 'classify': classifications.push(...safeJsonArray<Classification>(row.result_json, 'classify')); break;
    }
  }

  const dedupedVessels = dedupByKey(parsedVessels);
  const dedupedCargos  = dedupByKey(parsedCargos);
  for (const v of dedupedVessels) {
    if (v.grainCapacityUnit && v.grainCapacityUnit !== 'cbm') {
      v.grainCapacityUnit = 'cbm';
    }
    // CAPACITY_PLAUSIBILITY upper bound: same rule as preNormalizeRawVessel (#976).
    // Fixes already-persisted CBFT-as-CBM values in demo-seed.db.
    const dwtVal = typeof v.dwtSummer === 'object' && v.dwtSummer !== null
      ? (v.dwtSummer as { value?: number }).value ?? null
      : (typeof v.dwtSummer === 'number' ? v.dwtSummer : null);
    if (dwtVal !== null && dwtVal > 0) {
      if (v.grainCapacity !== null && v.grainCapacity !== undefined && v.grainCapacity > 2.5 * dwtVal) {
        v.grainCapacity = null;
      }
      if (v.baleCapacity !== null && v.baleCapacity !== undefined && v.baleCapacity > 2.5 * dwtVal) {
        v.baleCapacity = null;
      }
    }
  }

  const colNames = new Set((db.prepare(`PRAGMA table_info(matches)`).all() as Array<{name:string}>).map((c) => c.name));
  const fitCols = colNames.has('fit_percent')
    ? 'fit_percent, fit_breakdown'
    : 'NULL as fit_percent, NULL as fit_breakdown';
  const idxCols = colNames.has('cargo_item_index')
    ? 'cargo_item_index, vessel_item_index'
    : 'NULL as cargo_item_index, NULL as vessel_item_index';
  const worksheetCol = colNames.has('worksheet_json')
    ? 'worksheet_json'
    : 'NULL as worksheet_json';
  const tceCol = colNames.has('tce_usd_per_day') ? 'tce_usd_per_day' : 'NULL as tce_usd_per_day';
  const freightCols = colNames.has('freight_rate_usd_per_mt')
    ? 'freight_rate_usd_per_mt, freight_rate_source'
    : 'NULL as freight_rate_usd_per_mt, NULL as freight_rate_source';
  const portCols = colNames.has('load_port')
    ? 'load_port, discharge_port'
    : 'NULL as load_port, NULL as discharge_port';
  const dwtCol = colNames.has('vessel_dwt') ? 'vessel_dwt' : 'NULL as vessel_dwt';
  const selectCols = `cargo_id, vessel_id, score, reason, reason_structured, ${fitCols}, ${idxCols}, ${worksheetCol}, ${tceCol}, ${freightCols}, ${portCols}, ${dwtCol}`;

  // Only the seeded snapshot rows (user_id IS NULL). Per-session copies that
  // persistSessionMatches writes (user_id = sessionId) must NOT be re-read here,
  // or the demo's match set would grow/duplicate with every login.
  const matchRows = db.prepare(
    `SELECT ${selectCols} FROM matches WHERE user_id IS NULL`,
  ).all() as MatchRow[];

  // Realism buckets seeded by real-matches.ts (sentinel user_ids preserved
  // by deleteOrphanSessionMatches). Hydrated into session so /matches bucket
  // tabs are non-empty on first login without triggering LLM scoring.
  const reviewRows = db.prepare(
    `SELECT ${selectCols} FROM matches WHERE user_id = '__demo_review__'`,
  ).all() as MatchRow[];
  const insufficientRows = db.prepare(
    `SELECT ${selectCols} FROM matches WHERE user_id = '__demo_insufficient__'`,
  ).all() as MatchRow[];

  function rowsToMatches(rows: MatchRow[]): Match[] {
    return rows.map((r) => {
      const tce = r.tce_usd_per_day;
      // #883: compute demo war-risk from seeded ports + dwt, mirroring the live
      // /api/voyage/tce path (estimateVesselValueUsd(dwt), NOT DEFAULT 22M) so the
      // banner premium matches the P&L line. calculateWarRiskPremium is pure/sync.
      const warRisk =
        r.load_port && r.discharge_port
          ? calculateWarRiskPremium({
              route: { fromPort: r.load_port, toPort: r.discharge_port },
              vesselValueUsd: estimateVesselValueUsd(r.vessel_dwt ?? 0),
            })
          : null;
      // Carry the seed-computed TCE into economics.tceUsdPerDay so
      // persistSessionMatches can prefer it over a live recompute.
      // Also carry the seed freight pair (QA FINDING-002): toBucketRows reads
      // the economics triple, so a tce-only object would render canonical TCE
      // with a NULL rate/source → "≈ Estimate" badge over a canonical value.
      const economics: import('@/lib/types').EconomicsResult | undefined =
        tce != null && Number.isFinite(tce)
          ? {
              breakdown: {
                bunkerCost: 0, bunkerPort: '', euEtsAmount: 0,
                euEtsApplicable: false,
                warRiskPremium: warRisk?.premiumUsd ?? 0,
                warRiskZones: warRisk?.zones ?? [],
                warRiskBreakdown: warRisk?.applicable ? warRisk.breakdown : undefined,
                warRiskTotal: warRisk?.breakdown?.totalPremiumUsd,
              },
              totalUsd: 0,
              calculatedAt: new Date(0).toISOString(),
              dataFreshness: { bunker: 'seed', eua: 'seed' },
              tceUsdPerDay: tce,
              freightRateUsdPerMt: r.freight_rate_usd_per_mt ?? undefined,
              freightRateSource: r.freight_rate_source ?? undefined,
            }
          : undefined;
      return {
        cargoEmailId: r.cargo_id,
        cargoItemIndex: r.cargo_item_index ?? 0,
        vesselEmailId: r.vessel_id,
        vesselItemIndex: r.vessel_item_index ?? 0,
        score: r.score,
        matchLevel: deriveMatchLevel(r.score),
        matchReasons: r.reason ? [r.reason] : [],
        issues: [],
        scoreBreakdown: safeJsonObject<ScoreBreakdown>(r.reason_structured),
        fitPercent: r.fit_percent ?? undefined,
        fitBreakdown: safeJsonObject<import('@/lib/types').FitBreakdown>(r.fit_breakdown),
        worksheet: safeJsonObject<import('@/lib/types').MatchWorksheet>(r.worksheet_json ?? null),
        economics,
      };
    });
  }

  const matches = rowsToMatches(matchRows);
  const lowConfidenceMatches = rowsToMatches(reviewRows);
  const insufficientData = rowsToMatches(insufficientRows);

  const processedEmails = buildProcessedEmails(emails, classifications, dedupedCargos, dedupedVessels);

  return {
    emails,
    classifications,
    parsedCargos: dedupedCargos,
    parsedVessels: dedupedVessels,
    parsedFixtureRecaps,
    processedEmails,
    matches,
    lowConfidenceMatches,
    insufficientData,
    isSampleData: true,
    accountId: 'demo',
  };
}

export function hydrateDemoSession(sessionId: string): void {
  const db = getStore().getDatabase();
  // Prune per-session match copies left by sessions that have ended. persistSessionMatches
  // writes ~436 copies (user_id = sessionId) on every /dashboard and /matches render; nothing
  // removes them when the session expires, so demo-seed.db grows ~436 rows per login. This
  // keeps the table bounded to live sessions and, after deploy, clears the accumulated bloat
  // on the first logins. Seeded rows (user_id IS NULL) — which buildDemoSessionBlob reads —
  // are authoritative and never touched.
  deleteOrphanSessionMatches(db);
  const blob = buildDemoSessionBlob(db);
  if (blob.emails.length === 0) {
    logger.warn({ sessionId }, 'demo hydrate: 0 emails — demo-seed.db may be empty/incomplete');
  }
  updateSession(sessionId, blob);
}
