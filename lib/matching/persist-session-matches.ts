import type Database from 'better-sqlite3';
import { cfValue } from '@/lib/types';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';
import { createMatch } from '@/lib/matching/matches-repository';
import { parseLaycan } from '@/lib/sailing/date-parsing';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { computeStoredMatchEconomics } from '@/lib/matching/stored-match-economics';
import { calculateReadinessGap, detectSpot } from '@/lib/sailing/readiness-gap';

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

    // Economics via shared helper — includes port-DA, canal, and war-risk convention
    // (excludeWarRiskFromDailyTce:true) so stored TCE matches the detail page.
    const eco = cargo && vessel
      ? computeStoredMatchEconomics({ cargo, vessel, db })
      : { tce_usd_per_day: null, freight_rate_usd_per_mt: null, freight_rate_source: null };
    const tce_usd_per_day = eco.tce_usd_per_day;
    const freight_rate_usd_per_mt = eco.freight_rate_usd_per_mt;
    const freight_rate_source = eco.freight_rate_source;

    // Fail-closed: if the cargo laycan in parsedCargos disagrees with the stored
    // worksheet laycan, recompute readiness rather than carrying stale data verbatim.
    // This catches seed rows whose worksheet_json was built against a pre-normalization
    // July laycan while parsed_results now has the correct June string (#821).
    let worksheetJson: string | null = m.worksheet ? JSON.stringify(m.worksheet) : null;
    if (m.worksheet && cargo && laycan) {
      const storedLaycanStart = m.worksheet.readiness?.laycanStart ?? null;
      const freshLaycanStart = laycan.start.toISOString().slice(0, 10);
      if (storedLaycanStart !== freshLaycanStart) {
        const vesselOpenDate = vessel ? cfValue(vessel.openDate) : null;
        const freshReadiness = calculateReadinessGap(
          {
            openDate: vesselOpenDate,
            openPosition: vessel ? cfValue(vessel.openPosition) : null,
            speedLaden: vessel?.speedLaden ?? null,
            dwtSummer: vessel ? (cfValue(vessel.dwtSummer) ?? null) : null,
            isSpot: detectSpot(vesselOpenDate),
          },
          { laycan: cargo.laycan, originPort: cfValue(cargo.originPort) },
        );
        console.warn(
          `[persist] worksheet_rebuild cargo=${m.cargoEmailId} vessel=${m.vesselEmailId}` +
          ` stored=${storedLaycanStart} fresh=${freshLaycanStart}`,
        );
        worksheetJson = JSON.stringify({
          ...m.worksheet,
          readiness: {
            openDate: freshReadiness.openDate,
            laycanStart: freshReadiness.laycanStart,
            laycanEnd: freshReadiness.laycanEnd,
            distanceNm: freshReadiness.distanceNm,
            distanceExact: freshReadiness.distanceExact,
            speedKn: freshReadiness.speedKn,
            sailingDays: freshReadiness.sailingDays,
            arrivalDate: freshReadiness.arrivalDate,
            gapDays: freshReadiness.gapDays,
            verdict: freshReadiness.verdict,
            explanation: freshReadiness.explanation,
            openPosition: vessel ? (cfValue(vessel.openPosition) ?? null) : null,
          },
        });
      }
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
      worksheet_json: worksheetJson,
    });
  }
}
