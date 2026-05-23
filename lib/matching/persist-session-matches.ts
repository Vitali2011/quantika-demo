import type Database from 'better-sqlite3';
import { cfValue } from '@/lib/types';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';
import { createMatch } from '@/lib/matching/matches-repository';
import { parseLaycan } from '@/lib/sailing/date-parsing';
import { getPortDistance } from '@/lib/sailing/port-distances';

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

    createMatch(db, {
      cargo_id: m.cargoEmailId,
      vessel_id: m.vesselEmailId,
      score: Math.max(0, Math.min(100, Math.round(m.score))),
      reason: m.matchReasons[0] ?? '',
      status: 'shortlist',
      user_id: sessionId,
      reason_structured: m.scoreBreakdown ? JSON.stringify(m.scoreBreakdown) : null,
      cargo_type: cargo ? cargo.cargoType : null,
      load_port: loadPort,
      discharge_port: dischargePort,
      laycan_start: laycan ? laycan.start.getTime() : null,
      laycan_end: laycan ? laycan.end.getTime() : null,
      vessel_dwt: vessel ? cfValue(vessel.dwtSummer) : null,
      tce_usd_per_day: null,
      distance_nm: distanceResult ? distanceResult.nm : null,
    });
  }
}
