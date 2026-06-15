'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import type { ParsedVessel, ParsedCargo } from '@/lib/types';
import { resolveCargoWeight } from '@/lib/sailing/cargo-weight';
import { RouteCompareModal } from '@/components/economics/RouteCompareModal';
import { VoyageBreakdownChart } from '@/components/economics/VoyageBreakdownChart';
import { CalculationWaterfall } from '@/components/economics/CalculationWaterfall';
import { BunkerComparisonTable } from '@/components/economics/BunkerComparisonTable';
import type { BunkerCandidateResult } from '@/lib/economics/bunker-comparison';
import { estimateVoyageDays } from '@/lib/economics/voyage-days';
import { buildCanonicalTceInputs } from '@/lib/economics/canonical-tce-inputs';
import { estimateVesselValueUsd } from '@/lib/economics/vessel-value';
import { resolveConsMtPerDay } from '@/lib/economics/vessel-consumption';
import { parseConsumption } from '@/lib/matching/parse-vessel-fields';
import { freightBadge, FREIGHT_BADGE_CLASSES } from '@/lib/matching/freight-badge';
import type { WarRiskBreakdown } from '@/lib/economics/war-risk';
import type { TCEBreakdown } from '@/lib/economics/voyage-calculator';
import { DataQualityBadge } from '@/components/data-quality/DataQualityBadge';
import { deriveTier } from '@/lib/data-quality/derive';
import { FreightWaterfall } from './FreightWaterfall';

interface EconomicsTabProps {
  commissionPercent?: number | null;
  vessel?: ParsedVessel;
  cargo?: ParsedCargo;
  routeDistanceNm?: number | null;
  matchDbId?: number | null;
  storedFreightRate?: number | null;
  freightRateSource?: string | null;
  warRiskPremium?: number | null;
  warRiskZones?: string[] | null;
  warRiskBreakdown?: WarRiskBreakdown | null;
  warRiskBreakdownBallast?: WarRiskBreakdown | null;
  warRiskZonesBallast?: string[] | null;
  /** Stored canonical TCE from the DB row (list == detail invariant). */
  storedTceUsdPerDay?: number | null;
  /** Ballast reposition distance (open position → load port, nm). When provided,
   *  buildCanonicalTceInputs uses single-voyage span (ballast+laden+2 port days)
   *  matching the stored LIST TCE. Omit when open position is unknown → round-trip. */
  ballastDistanceNm?: number | null;
  /** True when stored TCE was computed with class-aware consumption estimate. */
  consumptionEstimated?: boolean | null;
  /** ISO date of the Baltic TC rate used for the stored TCE (W6a staleness badge). */
  balticRateAsOf?: string | null;
  /** DWT-tiered breakeven TCE floor (persisted, migration 050). */
  storedBreakevenTce?: number | null;
  /** Route-aware bunker port (matches.bunker_port, migration 053, #1002). Seeds the
   *  headline bunker selector so detail TCE uses the same port as the stored list TCE.
   *  Null (old rows / non-Med routes) → 'NLRTM' baseline (no disruption). */
  initialBunkerPort?: string | null;
}

function parseLeadingNumber(s: string | null | undefined): number {
  if (!s) return 0;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

const BUNKER_PORTS = [
  { value: 'NLRTM', label: 'Rotterdam' },
  { value: 'SGSIN', label: 'Singapore' },
  { value: 'AEFJR', label: 'Fujairah' },
  { value: 'USHOU', label: 'Houston' },
  { value: 'GIGIB', label: 'Gibraltar' },
];

const BUNKER_GRADES = ['VLSFO', 'MGO'] as const;

type BunkerPort = string;
type BunkerGrade = (typeof BUNKER_GRADES)[number];

const PORT_NAMES: Record<string, string> = {
  SGSIN: 'Singapore', NLRTM: 'Rotterdam', AEFJR: 'Fujairah',
  USHOU: 'Houston', GIGIB: 'Gibraltar', ESCEU: 'Ceuta',
  ESALG: 'Algeciras', BEANR: 'Antwerp', GRPIR: 'Piraeus',
  TRIST: 'Istanbul', ROCND: 'Constanta', EGPSD: 'Port Said', ITAUG: 'Augusta',
  CYLMS: 'Limassol',
};

function portLabel(locode: string): string {
  return PORT_NAMES[locode] ?? locode;
}

export function EconomicsTab({ commissionPercent, vessel, cargo, routeDistanceNm, matchDbId, storedFreightRate, freightRateSource, warRiskPremium, warRiskZones, warRiskBreakdown, warRiskBreakdownBallast, warRiskZonesBallast, storedTceUsdPerDay, ballastDistanceNm, consumptionEstimated, balticRateAsOf, storedBreakevenTce, initialBunkerPort }: EconomicsTabProps) {
  const [open, setOpen] = useState(false);
  const [bunkerPriceUsdPerMt, setBunkerPriceUsdPerMt] = useState('');
  const [overrideRate, setOverrideRate] = useState(storedFreightRate != null ? String(storedFreightRate) : '');
  const [overrideTce, setOverrideTce] = useState<number | null>(null);
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [currentRate, setCurrentRate] = useState<number | null>(storedFreightRate ?? null);
  const [currentSource, setCurrentSource] = useState<string | null>(freightRateSource ?? null);
  const [resetting, setResetting] = useState(false);
  // Seed from the stored route-aware port (#1002) so the headline TCE uses the
  // same bunker port as the stored LIST TCE → list == detail. Null/old rows →
  // 'NLRTM' baseline (the prior behaviour).
  const [bunkerPort, setBunkerPort] = useState<BunkerPort | null>(initialBunkerPort ?? 'NLRTM');
  const [bunkerGrade, setBunkerGrade] = useState<BunkerGrade>('VLSFO');
  const [bunkerReco, setBunkerReco] = useState<{ port: string; priceUsdPerMt: number; recommendation: string } | null>(null);
  const [bunkerFallback, setBunkerFallback] = useState<string | null>(null);
  const [bunkerCandidates, setBunkerCandidates] = useState<BunkerCandidateResult[]>([]);
  const [bunkerRecommendedSplit, setBunkerRecommendedSplit] = useState<string | null>(null);
  const [bunkerLift, setBunkerLift] = useState<{ liftTonnes: number; capacityMt: number; capped: boolean } | null>(null);
  const [euaData, setEuaData] = useState<{ value: number; period: string; stale?: boolean } | null>(null);
  const [euaPhase, setEuaPhase] = useState<'loading' | 'ok' | 'unavailable'>('loading');
  const [voyageBreakdown, setVoyageBreakdown] = useState<TCEBreakdown | null>(null);
  const [voyageLoading, setVoyageLoading] = useState(false);
  const [voyageError, setVoyageError] = useState<string | null>(null);
  const [approxPorts, setApproxPorts] = useState<Array<{ side: string; input: string; resolvedTo: string }>>([]);
  const [showCalc, setShowCalc] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/market/benchmark?indicator=EUA')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { value: number; period: string; stale?: boolean } | null) => {
        if (cancelled) return;
        if (data && typeof data.value === 'number') {
          setEuaData(data);
          setEuaPhase('ok');
        } else {
          setEuaPhase('unavailable');
        }
      })
      .catch(() => { if (!cancelled) setEuaPhase('unavailable'); });
    return () => { cancelled = true; };
  }, []);

  const recoFrom = cargo?.originPort?.value;
  const recoTo = cargo?.destinationPort?.value;
  const recoDwt = vessel?.dwtSummer?.value ?? 0;
  const recoSpeed = parseLeadingNumber(vessel?.speedLaden);
  const recoCons = resolveConsMtPerDay(parseConsumption(vessel?.consumption, 0), recoDwt);
  const recoVoyageDays = useMemo(
    () => estimateVoyageDays(routeDistanceNm, recoSpeed),
    [routeDistanceNm, recoSpeed],
  );
  useEffect(() => {
    if (!recoFrom || !recoTo) return;
    let cancelled = false;
    const params = new URLSearchParams({
      from: recoFrom,
      to: recoTo,
      grade: bunkerGrade,
    });
    if (recoDwt > 0) params.set('dwt', String(recoDwt));
    if (recoSpeed > 0) params.set('speedKn', String(recoSpeed));
    if (recoCons > 0) params.set('consMtPerDay', String(recoCons));
    if (recoVoyageDays > 0) params.set('voyageDays', String(recoVoyageDays));
    const url = `/api/voyage/bunker-recommendation?${params.toString()}`;
    fetch(url)
      .then((r) => r.ok ? r.json() : null)
      .then((data: { fallback: boolean; message: string | null; port: string | null; priceUsdPerMt: number | null; recommendation: string | null; savingsUsd: number; liftTonnes?: number; capacityMt?: number; liftCapped?: boolean; candidates: BunkerCandidateResult[] } | null) => {
        if (cancelled || !data) return;
        if (data.fallback) {
          setBunkerFallback(data.message);
          setBunkerReco(null);
          setBunkerCandidates([]);
          setBunkerRecommendedSplit(null);
          setBunkerLift(null);
        } else if (data.port && data.priceUsdPerMt != null && data.recommendation) {
          setBunkerFallback(null);
          setBunkerReco({ port: data.port, priceUsdPerMt: data.priceUsdPerMt, recommendation: data.recommendation });
          setBunkerCandidates(data.candidates ?? []);
          setBunkerRecommendedSplit(data.recommendation ?? null);
          setBunkerLift(
            typeof data.liftTonnes === 'number'
              ? {
                  liftTonnes: data.liftTonnes,
                  capacityMt: data.capacityMt ?? 0,
                  capped: data.liftCapped ?? false,
                }
              : null,
          );
          // NOTE: The headline bunkerPort is SEEDED from the stored route-aware port
          // (initialBunkerPort = matches.bunker_port) at init — NOT overridden here from
          // the live reco. Both the stored LIST TCE and this DETAIL TCE use that same
          // on-route port, so they agree on every Med/Black-Sea route ("one number",
          // epic #1004 / #1009). This client-side reco merely CONFIRMS the engine's
          // choice and surfaces the savings + comparison table (advisory). If the reco
          // returns a different port (e.g. prices moved since creation) the broker can
          // switch manually; we deliberately do not auto-override the seeded headline so
          // the detail TCE keeps matching the stored list TCE (#1002).
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [recoFrom, recoTo, bunkerGrade, recoDwt, recoSpeed, recoCons, recoVoyageDays]);

  const handleOverrideSubmit = useCallback(async () => {
    if (!matchDbId) return;
    const rate = parseFloat(overrideRate.replace(',', '.'));
    if (!Number.isFinite(rate) || rate <= 0) {
      setOverrideError('Enter a positive rate (USD/mt)');
      return;
    }
    setOverrideSaving(true);
    setOverrideError(null);
    try {
      const res = await fetch(`/api/matches/${matchDbId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ freight_rate_usd_per_mt: rate }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setOverrideError((data as { error?: string }).error ?? `Error ${res.status}`);
      } else {
        const updated = await res.json();
        setOverrideTce(updated.tce_usd_per_day ?? null);
        setCurrentRate(updated.freight_rate_usd_per_mt ?? rate);
        setCurrentSource(updated.freight_rate_source ?? 'manual');
      }
    } catch {
      setOverrideError('Network error');
    } finally {
      setOverrideSaving(false);
    }
  }, [matchDbId, overrideRate]);

  // Reset a sticky manual override back to the automatic (waterfall) rate (Wave #7).
  const handleReset = useCallback(async () => {
    if (!matchDbId) return;
    setResetting(true);
    setOverrideError(null);
    try {
      const res = await fetch(`/api/matches/${matchDbId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset_freight_rate: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setOverrideError((data as { error?: string }).error ?? `Error ${res.status}`);
      } else {
        const updated = await res.json();
        setCurrentRate(updated.freight_rate_usd_per_mt ?? null);
        setCurrentSource(updated.freight_rate_source ?? 'estimated');
        setOverrideTce(updated.tce_usd_per_day ?? null);
        setOverrideRate(
          updated.freight_rate_usd_per_mt != null ? String(updated.freight_rate_usd_per_mt) : '',
        );
      }
    } catch {
      setOverrideError('Network error');
    } finally {
      setResetting(false);
    }
  }, [matchDbId]);

  const compareInputs = useMemo(() => {
    const origin = cargo?.originPort?.value ?? '';
    const destination = cargo?.destinationPort?.value ?? '';
    const dwt = vessel?.dwtSummer?.value ?? 0;
    const speedKts = parseLeadingNumber(vessel?.speedLaden);
    const rawConsumption = parseConsumption(vessel?.consumption, 0);
    const consumption = resolveConsMtPerDay(rawConsumption, dwt);
    const quantityMt = resolveCargoWeight(cargo ?? null) ?? 0;

    const ready =
      origin.length > 0 &&
      destination.length > 0 &&
      dwt > 0 &&
      speedKts > 0 &&
      rawConsumption > 0 &&
      quantityMt > 0;

    const missing: string[] = [];
    if (!origin) missing.push('load port');
    if (!destination) missing.push('discharge port');
    if (!dwt) missing.push('DWT');
    if (!speedKts) missing.push('vessel speed');
    if (!rawConsumption) missing.push('fuel consumption');
    if (!quantityMt) missing.push('cargo quantity');

    const freightRateForCompare = currentRate ?? storedFreightRate ?? 0;
    return {
      ready: ready && freightRateForCompare > 0,
      missing,
      origin,
      destination,
      vessel: {
        dwt,
        valueUsd: estimateVesselValueUsd(dwt),
        speedKts,
        consumptionMtPerDay: consumption,
      },
      cargo: { quantityMt, freightRateUsdPerMt: freightRateForCompare },
    };
  }, [cargo, vessel, currentRate, storedFreightRate]);

  const marketRates = useMemo(() => {
    const manual = bunkerPriceUsdPerMt !== '' ? Number(bunkerPriceUsdPerMt) : undefined;
    return {
      bunkerPriceUsdPerMt: manual ?? 0,
      euaPriceEur: euaData?.value ?? 75,
      // pass port/grade for auto-resolve when price is empty
      bunkerPort,
      bunkerGrade,
    };
  }, [bunkerPriceUsdPerMt, bunkerPort, bunkerGrade, euaData]);

  const voyageInputData = useMemo(() => {
    const dwt = vessel?.dwtSummer?.value ?? 0;
    const speedKts = parseLeadingNumber(vessel?.speedLaden);
    const rawConsumptionMtPerDay = parseConsumption(vessel?.consumption, 0);
    const consumptionMtPerDay = resolveConsMtPerDay(rawConsumptionMtPerDay, dwt);
    const originPort = cargo?.originPort?.value ?? '';
    const destinationPort = cargo?.destinationPort?.value ?? '';
    const rawQuantityMt = resolveCargoWeight(cargo ?? null) ?? 0;
    // Bug H: when qty=0 but DWT is known, apply the same DWT×0.65 fallback the list
    // path uses — so P&L is consistent with the stored TCE (same number, disclosed).
    const qtyEstimated = rawQuantityMt === 0 && dwt > 0;
    const quantityMt = qtyEstimated ? dwt * 0.65 : rawQuantityMt;
    const distanceNm = routeDistanceNm ?? 0;
    // #819: drop ?? 28 — seed now persists freight_rate_usd_per_mt so storedFreightRate
    // is non-null for canonical matches. null → "freight rate required" hint, not fabrication.
    const freightRateUsdPerMt = currentRate ?? storedFreightRate ?? null;

    const missing: string[] = [];
    if (!originPort) missing.push('load port');
    if (!destinationPort) missing.push('discharge port');
    if (!dwt) missing.push('DWT');
    if (!speedKts) missing.push('vessel speed');
    if (!rawConsumptionMtPerDay) missing.push('fuel consumption');
    if (!distanceNm) missing.push('route distance');
    if (!rawQuantityMt && !qtyEstimated) missing.push('cargo quantity');
    if (!bunkerPort) missing.push('bunker port');
    if (freightRateUsdPerMt == null || freightRateUsdPerMt <= 0) missing.push('freight rate');

    const ready =
      missing.length === 0 && bunkerPort !== null && freightRateUsdPerMt != null && freightRateUsdPerMt > 0;

    // Build canonical inputs for durationDays and vessel/route/cargo normalisation.
    // bunkerPriceUsdPerMt is omitted from the POST body when not user-entered so the
    // API auto-resolves it from bunkerPort DB lookup (typeof 0 === 'number' would
    // otherwise cause the API to treat $0 as a manual price → zero bunker cost).
    const core = ready
      ? buildCanonicalTceInputs({
          vesselDwt: dwt,
          speedKts,
          consumptionMtPerDay,
          distanceNm,
          quantityMt,
          freightRateUsdPerMt,
          bunkerPriceUsdPerMt: 0,  // placeholder only; overridden below for POST body
          euaPriceEur: euaData?.value,
          vesselValueUsd: estimateVesselValueUsd(dwt),
          originPort,
          destinationPort,
          // Single-voyage duration: ballast reposition (open→load) + laden + 2 port days.
          // Mirrors stored-match-economics.ts so DETAIL TCE == LIST TCE (SEAGULL-41 fix).
          ballastDistanceNm: ballastDistanceNm ?? undefined,
        })
      : null;

    const openPosition = vessel?.openPosition?.value ?? undefined;
    const input = core
      ? {
          vessel: {
            ...core.vessel,
            // Pass open position for ballast-leg canal detection (parity with stored-match path).
            ...(openPosition ? { openPosition } : {}),
          },
          route: core.route,
          cargo: core.cargo,
          durationDays: core.durationDays,
          euaPriceEur: core.euaPriceEur,
          includeEuETS: true,   // parity: let route auto-derive EU coverage (same as stored match path)
          bunkerPort,
          bunkerGrade,
          // Only include bunkerPriceUsdPerMt when user-entered; absent → API auto-resolves
          ...(bunkerPriceUsdPerMt !== '' ? { bunkerPriceUsdPerMt: Number(bunkerPriceUsdPerMt) } : {}),
        }
      : null;

    return { ready, missing, input, qtyEstimated };
  }, [vessel, cargo, routeDistanceNm, currentRate, storedFreightRate, bunkerPort, bunkerGrade, bunkerPriceUsdPerMt, euaData, ballastDistanceNm]);

  useEffect(() => {
    if (!voyageInputData.ready || !voyageInputData.input) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset of async-derived state when inputs become invalid
      setVoyageBreakdown(null);
      setVoyageError(null);
      setApproxPorts([]);
      return;
    }
    let cancelled = false;
    setVoyageLoading(true);
    setVoyageError(null);
    fetch('/api/voyage/tce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(voyageInputData.input),
    })
      .then((r) => r.json().then((d: unknown) => ({ ok: r.ok, d })))
      .then(({ ok, d }: { ok: boolean; d: unknown }) => {
        if (cancelled) return;
        if (!ok) {
          const err = d as { error?: string };
          setVoyageError(typeof err.error === 'string' ? err.error : 'Calculation failed');
          setApproxPorts([]);
          setVoyageLoading(false);
          return;
        }
        const result = d as { breakdown: TCEBreakdown; approximatePorts?: Array<{ side: string; input: string; resolvedTo: string }> };
        setVoyageBreakdown(result.breakdown ?? null);
        setApproxPorts(result.approximatePorts ?? []);
        setVoyageLoading(false);
      })
      .catch(() => {
        if (!cancelled) { setVoyageError('Network error'); setVoyageLoading(false); }
      });
    return () => { cancelled = true; };
  }, [voyageInputData]);

  return (
    <div data-testid="tab-economics" className="space-y-4 text-sm">
      {/* Freight rate override */}
      {matchDbId != null && (
        <div data-testid="freight-rate-override" className="rounded border border-blue-200 bg-blue-50 p-3 space-y-2">
          <h3 className="text-xs font-semibold text-blue-900">Freight Rate Override</h3>
          {currentRate != null && (() => {
            const badge = freightBadge(currentSource);
            return (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-600">
                  Current:{' '}
                  <span className={`font-medium ${badge.dimmed ? 'text-gray-400' : ''}`}>
                    ${currentRate}/mt
                  </span>
                  <span
                    data-testid="freight-rate-badge"
                    className={`ml-1 px-1 rounded ${FREIGHT_BADGE_CLASSES[badge.tone]}`}
                    title={badge.title}
                  >
                    {badge.label}
                  </span>
                </p>
                {currentSource === 'manual' && (
                  <button
                    type="button"
                    data-testid="freight-rate-reset"
                    onClick={handleReset}
                    disabled={resetting}
                    className="text-xs text-blue-600 hover:underline disabled:opacity-50 flex-none"
                  >
                    {resetting ? '…' : 'Reset to auto'}
                  </button>
                )}
              </div>
            );
          })()}
          {currentSource === 'estimated' && (
            <p className="text-xs text-amber-700">≈ estimate — rate not confirmed</p>
          )}
          {overrideTce != null && (
            <p data-testid="override-tce-result" className="text-xs font-medium text-emerald-700">
              Recalculated TCE: ${overrideTce.toLocaleString('en-US')}/day
            </p>
          )}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs text-gray-600 block mb-0.5">Rate (USD/mt)</label>
              <input
                data-testid="freight-rate-input"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                value={overrideRate}
                onChange={(e) => { setOverrideRate(e.target.value); setOverrideTce(null); setOverrideError(null); }}
                placeholder="e.g. 28"
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400"
              />
            </div>
            <button
              data-testid="freight-rate-submit"
              onClick={handleOverrideSubmit}
              disabled={overrideSaving || !overrideRate}
              className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {overrideSaving ? '…' : 'Recalculate'}
            </button>
          </div>
          {overrideError && (
            <p data-testid="freight-rate-error" className="text-xs text-red-600">{overrideError}</p>
          )}
        </div>
      )}

      {/* Freight source waterfall — how the rate was derived */}
      <FreightWaterfall source={freightRateSource ?? null} rateUsdPerMt={storedFreightRate ?? null} />

      {commissionPercent != null && (
        <div>
          <span className="text-gray-500">Commission</span>
          <p className="font-medium">{commissionPercent}%</p>
        </div>
      )}

      {/* Bunker price input section */}
      <div className="space-y-1">
        <label className="text-xs text-gray-500 block">
          Bunker price (USD/mt) — optional
        </label>
        <input
          type="number"
          name="bunkerPriceUsdPerMt"
          id="bunkerPriceUsdPerMt"
          value={bunkerPriceUsdPerMt}
          onChange={(e) => setBunkerPriceUsdPerMt(e.target.value)}
          placeholder="e.g. 620"
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400"
        />
        {!bunkerPriceUsdPerMt && (
          <p className="text-xs text-gray-500 mt-1">
            Leave empty to use latest spot price{bunkerPort ? ` for ${portLabel(bunkerPort)} ${bunkerGrade}` : ''}
          </p>
        )}
        <div className="flex gap-2 mt-2">
          <select
            value={bunkerPort ?? ''}
            onChange={(e) => { setBunkerPort(e.target.value); }}
            aria-label="Bunker port"
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
          >
            {(() => {
              const base = bunkerCandidates.length > 0
                ? ['NLRTM', ...Array.from(new Map(bunkerCandidates.map(c => [c.port, c])).values()).map(c => c.port)]
                : BUNKER_PORTS.map(p => p.value);
              // Always include the selected (stored route-aware) port so it renders even
              // before the reco fetch resolves (#1002 — seeded headline must be visible).
              const withSelected = bunkerPort && !base.includes(bunkerPort) ? [bunkerPort, ...base] : base;
              return Array.from(new Set(withSelected));
            })().map((code) => (
              <option key={code} value={code}>
                {portLabel(code)}
              </option>
            ))}
          </select>
          <select
            value={bunkerGrade}
            onChange={(e) => setBunkerGrade(e.target.value as BunkerGrade)}
            aria-label="Bunker grade"
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
          >
            {BUNKER_GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        {bunkerFallback && (
          <p data-testid="bunker-fallback" className="text-xs text-amber-600 mt-1">
            {bunkerFallback}
          </p>
        )}
        {!bunkerFallback && bunkerReco && bunkerCandidates.length === 0 && (
          <p data-testid="bunker-reco" className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1 mt-1">
            {bunkerReco.recommendation}
          </p>
        )}
      </div>

      {bunkerCandidates.length > 0 && (
        <div data-testid="bunker-comparison-section" className="rounded border border-gray-200 bg-white p-3">
          <h3 className="text-xs font-semibold text-gray-700 mb-2">Bunkering — port comparison</h3>
          <BunkerComparisonTable
            candidates={bunkerCandidates}
            liftTonnes={bunkerLift?.liftTonnes}
            capacityMt={bunkerLift?.capacityMt}
            liftCapped={bunkerLift?.capped}
            recommendedSplit={bunkerRecommendedSplit}
          />
        </div>
      )}

      {/* EUA / EU ETS live price */}
      <div data-testid="eua-price-tile" className="rounded border border-gray-200 bg-gray-50 p-3 space-y-1">
        <h3 className="text-xs font-semibold text-gray-700">EUA / EU ETS Price</h3>
        <div className="flex items-center justify-between text-xs">
          {euaPhase === 'loading' ? (
            <span className="text-gray-400 animate-pulse">Loading…</span>
          ) : euaPhase === 'ok' && euaData ? (
            <>
              <span data-testid="eua-value" className="font-medium text-gray-900">
                €{euaData.value.toFixed(2)}/tCO₂
              </span>
              <span className="text-gray-400">{euaData.period}</span>
            </>
          ) : (
            <span data-testid="eua-na" className="text-gray-400">N/A</span>
          )}
        </div>
        {euaData?.stale && (
          <p data-testid="eua-stale" className="text-xs text-amber-600">⚠ Stale data</p>
        )}
      </div>

      <div>
        <button
          type="button"
          data-testid="open-route-compare"
          onClick={() => setOpen(true)}
          disabled={!compareInputs.ready}
          title={
            compareInputs.ready
              ? 'Compare Suez vs Cape routings'
              : 'Vessel/cargo data incomplete'
          }
          className="px-3 py-1.5 rounded border border-blue-500 text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium"
        >
          Compare Suez vs Cape
        </button>
        {!compareInputs.ready && compareInputs.missing.length > 0 && (
          <p data-testid="compare-missing-hint" className="mt-1 text-xs text-gray-500">
            Missing: {compareInputs.missing.join(', ')}
          </p>
        )}
      </div>

      {/* JWC war-risk breakdown */}
      {warRiskPremium != null && warRiskPremium > 0 && warRiskBreakdown ? (
        <div data-testid="warrisk-section" className="rounded border border-orange-200 bg-orange-50 p-3 space-y-2">
          <h3 className="text-xs font-semibold text-orange-900">JWC War Risk — Laden Voyage (per voyage)</h3>
          {warRiskZones && warRiskZones.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {warRiskZones.map((zone) => (
                <span
                  key={zone}
                  className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 text-xs"
                >
                  {zone}
                </span>
              ))}
            </div>
          )}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-600">Hull premium:</span>
              <span data-testid="warrisk-hull" className="font-medium">
                ${warRiskBreakdown.hullPremiumUsd.toLocaleString('en-US')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Crew war bonus:</span>
              <span data-testid="warrisk-crew" className="font-medium">
                ${warRiskBreakdown.crewWarBonusUsd.toLocaleString('en-US')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">P&amp;I surcharge:</span>
              <span data-testid="warrisk-pi" className="font-medium">
                ${warRiskBreakdown.piSurchargeUsd.toLocaleString('en-US')}
              </span>
            </div>
            <div className="flex justify-between pt-1 border-t border-orange-200">
              <span className="text-gray-700 font-medium">Total:</span>
              <span data-testid="warrisk-total" className="font-semibold text-orange-900">
                ${warRiskBreakdown.totalPremiumUsd.toLocaleString('en-US')}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div data-testid="warrisk-none" className="rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
          No JWC war risk zones on this route
        </div>
      )}

      {/* JWC war-risk — ballast reposition leg */}
      {warRiskBreakdownBallast && warRiskBreakdownBallast.totalPremiumUsd > 0 && (
        <div data-testid="warrisk-ballast-section" className="rounded border border-amber-200 bg-amber-50 p-3 space-y-2">
          <h3 className="text-xs font-semibold text-amber-900">JWC War Risk — Ballast Reposition (per voyage)</h3>
          {warRiskZonesBallast && warRiskZonesBallast.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {warRiskZonesBallast.map((zone) => (
                <span key={zone} className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-xs">{zone}</span>
              ))}
            </div>
          )}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-600">Hull premium:</span>
              <span data-testid="warrisk-ballast-hull" className="font-medium">
                ${warRiskBreakdownBallast.hullPremiumUsd.toLocaleString('en-US')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Crew war bonus:</span>
              <span data-testid="warrisk-ballast-crew" className="font-medium">
                ${warRiskBreakdownBallast.crewWarBonusUsd.toLocaleString('en-US')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">P&amp;I surcharge:</span>
              <span data-testid="warrisk-ballast-pi" className="font-medium">
                ${warRiskBreakdownBallast.piSurchargeUsd.toLocaleString('en-US')}
              </span>
            </div>
            <div className="flex justify-between pt-1 border-t border-amber-200">
              <span className="text-gray-700 font-medium">Total:</span>
              <span data-testid="warrisk-ballast-total" className="font-semibold text-amber-900">
                ${warRiskBreakdownBallast.totalPremiumUsd.toLocaleString('en-US')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* FuelEU Maritime GHG penalty (audit A.5) — data-driven, no env read */}
      {voyageBreakdown && voyageBreakdown.fueleu_usd > 0 ? (
        <div data-testid="fueleu-section" className="rounded border border-emerald-200 bg-emerald-50 p-3 space-y-1">
          <h3 className="text-xs font-semibold text-emerald-900">FuelEU Maritime — GHG penalty (per voyage)</h3>
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Penalty (€2400/tCO₂eq over target):</span>
            <span data-testid="fueleu-usd" className="font-semibold text-emerald-900">
              ${voyageBreakdown.fueleu_usd.toLocaleString('en-US')}
            </span>
          </div>
        </div>
      ) : null}

      {/* Voyage P&L breakdown */}
      <div data-testid="voyage-pnl-section" className="rounded border border-gray-200 bg-gray-50 p-3">
        <h3 className="text-xs font-semibold text-gray-700 mb-2">Voyage P&amp;L</h3>
        {voyageInputData.ready ? (
          voyageLoading ? (
            <p className="text-xs text-gray-400 animate-pulse">Calculating…</p>
          ) : voyageError ? (
            <p data-testid="voyage-error" className="text-xs text-red-600">{voyageError}</p>
          ) : voyageBreakdown ? (
            <>
              {approxPorts.length > 0 && (
                <p data-testid="voyage-approx-ports" className="text-xs text-amber-600 mb-1">
                  ⚠ Approximate port{approxPorts.length > 1 ? 's' : ''} — P&amp;L estimated:{' '}
                  {approxPorts.map((a) => `${a.input} → ${a.resolvedTo}`).join('; ')}. Confirm before fixing.
                </p>
              )}
              {voyageInputData.qtyEstimated && (
                <div data-testid="qty-estimated-badge" className="mb-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs">
                  <span className="font-medium text-amber-700">est.</span>{' '}
                  <span className="text-gray-600">Cargo quantity unknown — estimated at DWT × 0.65</span>
                </div>
              )}
              <VoyageBreakdownChart breakdown={voyageBreakdown} />
              <div className="mt-2">
                <button
                  data-testid="show-calc-toggle"
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => setShowCalc((v) => !v)}
                >
                  {showCalc ? 'Hide calculation' : 'Show calculation'}
                </button>
                {showCalc && (
                  <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3">
                    <CalculationWaterfall breakdown={voyageBreakdown} warRiskBreakdown={warRiskBreakdown} />
                  </div>
                )}
              </div>
            </>
          ) : null
        ) : voyageInputData.missing.length > 0 ? (
          <>
            <p data-testid="voyage-missing-hint" className="text-xs text-gray-500">
              Missing: {voyageInputData.missing.join(', ')}
            </p>
            {/* Stored TCE headline when consumption is estimated */}
            {storedTceUsdPerDay != null && consumptionEstimated && (
              <div data-testid="stored-tce-badge" className="mt-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs">
                <span className="text-gray-600">TCE (est.):</span>{' '}
                <span data-testid="stored-tce-value" className="font-medium text-amber-900">
                  ${storedTceUsdPerDay.toLocaleString('en-US')}/day
                </span>
                <span className="ml-1 text-amber-600 text-xs">(assumed consumption)</span>
              </div>
            )}
            {/* Breakeven floor vs persisted TCE */}
            {storedBreakevenTce != null && (
              <div className="flex justify-between text-xs text-ds-text-muted mt-2" data-testid="breakeven-line">
                <span>Breakeven floor (size-tiered)</span>
                <span className="font-mono">
                  ${storedBreakevenTce.toLocaleString('en-US')}/day
                  {storedTceUsdPerDay != null && (
                    <span className={storedTceUsdPerDay >= storedBreakevenTce ? 'text-emerald-600 ml-1' : 'text-red-500 ml-1'}>
                      {storedTceUsdPerDay >= storedBreakevenTce ? '✓ above' : '✗ below'}
                    </span>
                  )}
                </span>
              </div>
            )}
            {/* W6a: Baltic TC staleness badge */}
            {freightRateSource === 'baltic' && balticRateAsOf && (() => {
              const tier = deriveTier({ source: 'static-seed', asOf: balticRateAsOf, staleAfterDays: 14 });
              return tier !== 'live' ? (
                <div data-testid="baltic-stale-badge" className="mt-2 rounded border border-red-200 bg-red-50 p-3 text-xs flex items-center gap-1">
                  <span className="text-gray-600">Baltic TC rate:</span>
                  <DataQualityBadge tier={tier} asOf={balticRateAsOf} />
                  <span className="text-gray-500">(static seed — no live feed)</span>
                </div>
              ) : null;
            })()}
          </>
        ) : null}
      </div>

      {compareInputs.ready && (
        <RouteCompareModal
          open={open}
          onClose={() => setOpen(false)}
          origin={compareInputs.origin}
          destination={compareInputs.destination}
          vessel={compareInputs.vessel}
          cargo={compareInputs.cargo}
          marketRates={marketRates}
          bunkerPort={bunkerPort ?? undefined}
          bunkerGrade={bunkerGrade}
          bunkerPriceManual={bunkerPriceUsdPerMt !== '' ? Number(bunkerPriceUsdPerMt) : undefined}
        />
      )}
    </div>
  );
}
