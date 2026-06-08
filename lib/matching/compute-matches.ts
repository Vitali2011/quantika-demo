import type Database from 'better-sqlite3';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';
import { cfValue } from '@/lib/types';
import { analyzePairs, type AiScorer, type RawMatch } from '@/lib/matching/pair-analyzer';
import { createMatch, listMatches } from '@/lib/matching/matches-repository';
import { callAiJson } from '@/lib/ai-provider';
import { MATCH_PROMPT } from '@/lib/prompts';
import { endpointLlmTimeout } from '@/lib/openai-helpers';
import { parseLaycan } from '@/lib/sailing/date-parsing';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { computeStoredMatchEconomics } from '@/lib/matching/stored-match-economics';
import { getLatestBunkerPrice } from '@/lib/market/bunker-repository';

/**
 * Compute matches for a session and persist them to the DB.
 *
 * Idempotent: if matches already exist for this sessionId, returns 0 immediately.
 * Called as a fire-and-forget background task from parse-cargo / parse-vessel routes
 * so the user sees matches without having to manually trigger /api/ai/match.
 */
export async function computeAndPersistMatches(
  cargos: ParsedCargo[],
  vessels: ParsedVessel[],
  sessionId: string,
  db: Database.Database,
): Promise<number> {
  if (cargos.length === 0 || vessels.length === 0) return 0;

  // Skip if matches already exist for this session (idempotency guard).
  // INSERT OR IGNORE also dedups, but skipping the full LLM round is cheaper.
  const existing = listMatches(db, { user_id: sessionId, sortBy: 'score', sortDir: 'desc', limit: 1 });
  if (existing.length > 0) return 0;

  const aiScorer: AiScorer = async ({ cargoData, vesselData, readinessData }) => {
    const result = await callAiJson<{ matches: RawMatch[] }>(
      'MATCH',
      MATCH_PROMPT,
      JSON.stringify({ cargo_inquiries: cargoData, vessel_positions: vesselData, readiness: readinessData }),
      { timeoutMs: endpointLlmTimeout(120) },
    );
    return result.matches ?? [];
  };

  // Realism buckets (handover 2026-05-30, point 2): we intentionally take ONLY the
  // main `matches` here. The auto-precompute → DB path is a curated *shortlist*, and
  // the matches table has no column for the lowConfidenceMatches / insufficientData
  // buckets — persisting them would pollute the shortlist and would need a schema
  // migration (out of scope). The buckets are NOT lost: the live POST /api/ai/match
  // path computes the same partition and persists all buckets to the session
  // (see app/api/ai/match/route.ts + its route tests). So this path shows the
  // shortlist; the full bucketed list is served live.
  // Pass db so the economics-enrichment loop in analyzePairs can resolve the same
  // Baltic tier-2 rate the persisted tce_usd_per_day column uses → match.economics
  // stays consistent with the DB column on the auto-precompute path (code-review #2).
  const { matches } = await analyzePairs(cargos, vessels, aiScorer, { db });

  const cargoMap = new Map(cargos.map((c) => [`${c.emailId}|${c.itemIndex}`, c]));
  const vesselMap = new Map(vessels.map((v) => [`${v.emailId}|${v.itemIndex}`, v]));

  // Live bunker price (NLRTM/VLSFO) for list↔detail parity. Resilient to a missing
  // bunker_prices table (e.g. minimal test DBs) — falls through to the helper default.
  let bunkerPriceUsdPerMt: number | undefined;
  try {
    bunkerPriceUsdPerMt = getLatestBunkerPrice(db, 'NLRTM', 'VLSFO')?.price_usd_per_mt;
  } catch {
    bunkerPriceUsdPerMt = undefined;
  }

  for (const m of matches) {
    const cargo = cargoMap.get(`${m.cargoEmailId}|${m.cargoItemIndex}`);
    const vessel = vesselMap.get(`${m.vesselEmailId}|${m.vesselItemIndex}`);
    const laycan = cargo ? parseLaycan(cargo.laycan) : null;
    const cargoType = cargo
      ? (typeof cargo.cargoType === 'object' && cargo.cargoType !== null && 'value' in cargo.cargoType
          ? (cargo.cargoType as unknown as { value: string }).value
          : cargo.cargoType as string)
      : null;

    const loadPort = cargo ? cfValue(cargo.originPort) : null;
    const dischargePort = cargo ? cfValue(cargo.destinationPort) : null;
    const distanceResult = loadPort && dischargePort ? getPortDistance(loadPort, dischargePort) : null;
    const vesselDwt = vessel ? (cfValue(vessel.dwtSummer) ?? 0) : 0;

    // Economics via shared helper — includes port-DA, canal, and war-risk convention
    // (excludeWarRiskFromDailyTce:true) so stored TCE matches the detail page.
    const eco = cargo && vessel
      ? computeStoredMatchEconomics({ cargo, vessel, db, bunkerPriceUsdPerMt })
      : { tce_usd_per_day: null, freight_rate_usd_per_mt: null, freight_rate_source: null };
    const tce_usd_per_day = eco.tce_usd_per_day;
    const freight_rate_usd_per_mt = eco.freight_rate_usd_per_mt;
    const freight_rate_source = eco.freight_rate_source;

    createMatch(db, {
      cargo_id: m.cargoEmailId,
      vessel_id: m.vesselEmailId,
      score: Math.max(0, Math.min(100, Math.round(m.score))),
      reason: m.matchReasons[0] ?? '',
      status: 'shortlist',
      user_id: sessionId,
      reason_structured: m.scoreBreakdown ? JSON.stringify(m.scoreBreakdown) : null,
      cargo_type: cargoType ?? null,
      load_port: loadPort,
      discharge_port: dischargePort,
      laycan_start: laycan ? laycan.start.getTime() : null,
      laycan_end: laycan ? laycan.end.getTime() : null,
      vessel_dwt: vesselDwt || null,
      tce_usd_per_day,
      distance_nm: distanceResult ? distanceResult.nm : null,
      freight_rate_usd_per_mt,
      freight_rate_source,
      vessel_name: vessel ? (cfValue(vessel.vesselName) || null) : null,
      cargo_ref: cargo ? (cfValue(cargo.cargoDescription) || null) : null,
    });
  }

  return matches.length;
}
