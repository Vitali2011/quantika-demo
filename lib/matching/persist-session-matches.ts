import type Database from 'better-sqlite3';
import { cfValue } from '@/lib/types';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';
import { createMatch } from '@/lib/matching/matches-repository';
import { parseLaycan } from '@/lib/sailing/date-parsing';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { computeEstimatedTce, parseLeadingNumber, parseConsumption } from '@/lib/matching/tce-calculator';
import { resolveFreightRate } from '@/lib/matching/freight-resolver';
import { getBalticDayRate } from '@/lib/market/baltic-freight';

export function persistSessionMatches(
  db: Database.Database,
  sessionId: string,
  sessionMatches: Match[],
  parsedCargos: ParsedCargo[],
  parsedVessels: ParsedVessel[],
): void {
  const cargoMap = new Map(parsedCargos.map((c) => [`${c.emailId}|${c.itemIndex}`, c]));
  const vesselMap = new Map(parsedVessels.map((v) => [`${v.emailId}|${v.itemIndex}`, v]));

  for (const m of sessionMatches) {
    const cargo = cargoMap.get(`${m.cargoEmailId}|${m.cargoItemIndex}`);
    const vessel = vesselMap.get(`${m.vesselEmailId}|${m.vesselItemIndex}`);
    const laycan = cargo ? parseLaycan(cargo.laycan) : null;

    const loadPort = cargo ? cfValue(cargo.originPort) : null;
    const dischargePort = cargo ? cfValue(cargo.destinationPort) : null;
    const distanceResult = loadPort && dischargePort ? getPortDistance(loadPort, dischargePort) : null;

    const vesselDwt = vessel ? (cfValue(vessel.dwtSummer) ?? 0) : 0;
    const cargoTypeStr = cargo
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
      const resolved = resolveFreightRate({
        cargoType: cargoTypeStr,
        parsedFreightRateUsdPerMt: cargo?.freightRateUsd ?? null,
        vesselDwt,
        quantityMt,
        distanceNm: distanceResult.nm,
        speedKts,
        balticDayRate: getBalticDayRate(db, vesselDwt),
      });
      const tceEst = computeEstimatedTce(
        { rate: resolved.value, source: resolved.source, confidence: resolved.confidence },
        distanceResult.nm, vesselDwt, quantityMt, speedKts, consumptionMt,
      );
      tce_usd_per_day = tceEst.tce_usd_per_day;
      freight_rate_usd_per_mt = tceEst.freight_rate_usd_per_mt;
      freight_rate_source = tceEst.freight_rate_source;
    }

    createMatch(db, {
      cargo_id: m.cargoEmailId,
      vessel_id: m.vesselEmailId,
      score: Math.max(0, Math.min(100, Math.round(m.score))),
      reason: m.matchReasons[0] ?? '',
      status: 'shortlist',
      user_id: sessionId,
      reason_structured: m.scoreBreakdown ? JSON.stringify(m.scoreBreakdown) : null,
      cargo_type: cargoTypeStr,
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
      fit_percent: m.fitPercent ?? null,
      fit_breakdown: m.fitBreakdown ? JSON.stringify(m.fitBreakdown) : null,
      cargo_item_index: m.cargoItemIndex,
      vessel_item_index: m.vesselItemIndex,
      worksheet_json: m.worksheet ? JSON.stringify(m.worksheet) : null,
    });
  }
}
