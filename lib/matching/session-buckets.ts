import { cfValue } from '@/lib/types';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';
import type { StoredMatch } from '@/lib/matching/matches-repository';
import { parseLaycan } from '@/lib/sailing/date-parsing';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { estimateFreightRate, computeEstimatedTce, parseLeadingNumber, parseConsumption } from '@/lib/matching/tce-calculator';

/**
 * Convert the session-only realism buckets (`lowConfidenceMatches` /
 * `insufficientData`, which live on `SessionData` as `Match[]`) into
 * `StoredMatch`-shaped rows for read-only display in the bucket tabs.
 *
 * These buckets are intentionally NOT persisted to the matches table
 * (see `compute-matches.ts` — the table is a curated shortlist and has no
 * bucket column). So rows are built in-memory and get synthetic NEGATIVE ids
 * (`idStart`, `idStart - 1`, …) which:
 *   - never collide with real DB autoincrement ids, and
 *   - mark the row as non-persisted, so the UI renders bucket cards read-only
 *     (no `/match/[id]` link, no status actions).
 *
 * Enrichment mirrors `persist-session-matches.ts` so a bucket card shows the
 * same fields a shortlist card would; missing cargo/vessel data degrades to null.
 */
export function toBucketRows(
  matches: Match[],
  cargos: ParsedCargo[],
  vessels: ParsedVessel[],
  idStart = -1,
): StoredMatch[] {
  const cargoMap = new Map(cargos.map((c) => [`${c.emailId}|${c.itemIndex}`, c]));
  const vesselMap = new Map(vessels.map((v) => [`${v.emailId}|${v.itemIndex}`, v]));

  return matches.map((m, i) => {
    const cargo = cargoMap.get(`${m.cargoEmailId}|${m.cargoItemIndex}`);
    const vessel = vesselMap.get(`${m.vesselEmailId}|${m.vesselItemIndex}`);
    const laycan = cargo ? parseLaycan(cargo.laycan) : null;

    const loadPort = cargo ? cfValue(cargo.originPort) : null;
    const dischargePort = cargo ? cfValue(cargo.destinationPort) : null;
    const distanceResult = loadPort && dischargePort ? getPortDistance(loadPort, dischargePort) : null;

    const vesselDwt = vessel ? (cfValue(vessel.dwtSummer) ?? 0) : 0;
    const cargoType = cargo
      ? (typeof cargo.cargoType === 'object' && cargo.cargoType !== null && 'value' in cargo.cargoType
          ? (cargo.cargoType as unknown as { value: string }).value
          : cargo.cargoType as string)
      : null;
    const quantityMt = cargo ? (cfValue(cargo.weightMt) ?? 0) : 0;
    const speedKts = vessel ? parseLeadingNumber(vessel.speedLaden) : 0;
    const consumptionMt = vessel ? parseConsumption(vessel.consumption) : 0;

    let tce_usd_per_day: number | null = null;
    let freight_rate_usd_per_mt: number | null = null;
    let freight_rate_source: string | null = null;
    if (distanceResult && distanceResult.nm > 0) {
      const freightEst = estimateFreightRate(cargoType, distanceResult.nm, vesselDwt);
      const tceEst = computeEstimatedTce(freightEst, distanceResult.nm, vesselDwt, quantityMt, speedKts, consumptionMt);
      tce_usd_per_day = tceEst.tce_usd_per_day;
      freight_rate_usd_per_mt = tceEst.freight_rate_usd_per_mt;
      freight_rate_source = tceEst.freight_rate_source;
    }

    const row: StoredMatch = {
      id: idStart - i,
      cargo_id: m.cargoEmailId,
      vessel_id: m.vesselEmailId,
      score: Math.max(0, Math.min(100, Math.round(m.score))),
      reason: m.matchReasons[0] ?? '',
      status: 'shortlist',
      user_id: null,
      created_at: 0,
      updated_at: 0,
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
      vessel_name: null,
      cargo_ref: null,
    };
    return row;
  });
}
