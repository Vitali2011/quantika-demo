import type Database from 'better-sqlite3';
import { cfValue } from '@/lib/types';
import type { Match, ParsedCargo, ParsedVessel, FitBreakdown } from '@/lib/types';
import { createMatch } from '@/lib/matching/matches-repository';
import { parseLaycan } from '@/lib/sailing/date-parsing';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { computeStoredMatchEconomics } from '@/lib/matching/stored-match-economics';
import { deriveBucketReason } from '@/lib/matching/bucket-reason';
import { breakevenTceByDwt } from '@/lib/economics/breakeven-thresholds';
import { calculateReadinessGap, detectSpot } from '@/lib/sailing/readiness-gap';
import { getLatestBunkerPrice } from '@/lib/market/bunker-repository';
import { scoreEconomics } from '@/lib/sailing/fit-breakdown';

/**
 * Replace the economics component in a seed FitBreakdown with a fresh scoreEconomics
 * computed from the live TCE, then recalculate fitPercent.
 * Other components (timing, utilisation, etc.) and penalties/caps from the seed are
 * kept intact — only the economics contribution is updated.
 */
export function patchEconomicsComponent(
  breakdown: FitBreakdown,
  liveTce: number | null,
  vesselDwt: number,
): FitBreakdown {
  const freshEcon = scoreEconomics(liveTce, vesselDwt);
  const components = breakdown.components.map((c) =>
    c.factor === 'economics' ? freshEcon : c,
  );
  const rawSum = components.reduce((a, c) => a + c.score, 0);
  const sanctionsPenalty = breakdown.sanctionsPenalty ?? 0;
  const chartererPenalty = breakdown.chartererPenalty ?? 0;
  let fit = rawSum - sanctionsPenalty - chartererPenalty;
  if (breakdown.appliedCap != null && fit > breakdown.appliedCap.ceiling) {
    fit = breakdown.appliedCap.ceiling;
  }
  const fitPercent = Math.max(0, Math.min(100, Math.round(fit * 10) / 10));
  return { ...breakdown, components, fitPercent };
}

export function persistSessionMatches(
  db: Database.Database,
  sessionId: string,
  sessionMatches: Match[],
  parsedCargos: ParsedCargo[],
  parsedVessels: ParsedVessel[],
): void {
  const cargoMap = new Map(parsedCargos.map((c) => [`${c.emailId}|${c.itemIndex}`, c]));
  const vesselMap = new Map(parsedVessels.map((v) => [`${v.emailId}|${v.itemIndex}`, v]));

  // Live bunker price (NLRTM/VLSFO) so the stored list TCE matches the detail page,
  // which auto-resolves the same baseline. Resilient to a missing bunker_prices table
  // (e.g. minimal test DBs) — falls through to the helper's default rather than throwing.
  let bunkerPriceUsdPerMt: number | undefined;
  try {
    bunkerPriceUsdPerMt = getLatestBunkerPrice(db, 'NLRTM', 'VLSFO')?.price_usd_per_mt;
  } catch {
    bunkerPriceUsdPerMt = undefined;
  }

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
      ? computeStoredMatchEconomics({ cargo, vessel, db, bunkerPriceUsdPerMt })
      : { tce_usd_per_day: null, freight_rate_usd_per_mt: null, freight_rate_source: null, consumption_estimated: false, ballast_distance_nm: null };
    const tce_usd_per_day = eco.tce_usd_per_day;
    const freight_rate_usd_per_mt = eco.freight_rate_usd_per_mt;
    const freight_rate_source = eco.freight_rate_source;
    const consumption_estimated = eco.consumption_estimated ? 1 : null;

    // Recompute economics fit component with live TCE — the seed fitBreakdown bakes
    // the economics score from regen-time TCE. Live tce_usd_per_day differs when
    // bunker price changed since regen. Replace only the economics component; all
    // other components (timing, utilisation, etc.) are geometry/readiness-based
    // and do not depend on bunker price.
    const liveFitBreakdown = m.fitBreakdown && tce_usd_per_day != null
      ? patchEconomicsComponent(m.fitBreakdown, tce_usd_per_day, vesselDwt)
      : m.fitBreakdown;
    const liveFitPercent = liveFitBreakdown?.fitPercent ?? m.fitPercent;

    // Fail-closed: if the cargo laycan in parsedCargos disagrees with the stored
    // worksheet laycan, recompute readiness rather than carrying stale data verbatim.
    // This catches seed rows whose worksheet_json was built against a pre-normalization
    // July laycan while parsed_results now has the correct June string (#821).
    const bucketReason = m.worksheet
      ? deriveBucketReason({
          verdict: m.worksheet.readiness?.verdict ?? 'unknown',
          gapDays: m.worksheet.readiness?.gapDays ?? null,
          matchLevel: m.matchLevel,
          tceUsdPerDay: tce_usd_per_day,
          vesselDwt: vesselDwt || null,
          issues: m.issues ?? [],
        })
      : undefined;
    const worksheetForPersist = m.worksheet
      ? { ...m.worksheet, hardFilters: m.hardFilters ?? m.worksheet.hardFilters, sanctions: m.sanctions, bucketReason }
      : null;
    let worksheetJson: string | null = worksheetForPersist ? JSON.stringify(worksheetForPersist) : null;
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
          ...worksheetForPersist,
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
      // TODO(W5): reason_structured still uses legacy scoreBreakdown; W5 refactors to fitBreakdown
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
      fit_percent: liveFitPercent ?? null,
      fit_breakdown: liveFitBreakdown ? JSON.stringify(liveFitBreakdown) : null,
      cargo_item_index: m.cargoItemIndex,
      vessel_item_index: m.vesselItemIndex,
      worksheet_json: worksheetJson,
      consumption_estimated,
      ballast_distance_nm: eco.ballast_distance_nm ?? null,
      breakeven_tce_usd_per_day: vesselDwt ? breakevenTceByDwt(vesselDwt) : null,
      // Refresh stale per-session rows on every render: economics drift with
      // the live bunker price and re-parses; without this the first insert
      // fossilizes for the whole session (audit B.6).
      refreshComputed: true,
    });
  }
}
