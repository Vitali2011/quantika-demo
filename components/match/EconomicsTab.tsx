'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import type { ParsedVessel, ParsedCargo } from '@/lib/types';
import { RouteCompareModal } from '@/components/economics/RouteCompareModal';
import { VoyageBreakdownChart } from '@/components/economics/VoyageBreakdownChart';
import { BunkerComparisonTable } from '@/components/economics/BunkerComparisonTable';
import type { BunkerCandidateResult } from '@/lib/economics/bunker-comparison';
import { estimateVoyageDays } from '@/lib/economics/voyage-days';
import { estimateVesselValueUsd } from '@/lib/economics/vessel-value';
import { freightBadge, FREIGHT_BADGE_CLASSES } from '@/lib/matching/freight-badge';
import type { WarRiskBreakdown } from '@/lib/economics/war-risk';
import type { TCEBreakdown } from '@/lib/economics/voyage-calculator';

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
  ROCND: 'Constanta', EGPSD: 'Port Said', ITAUG: 'Augusta',
};

function portLabel(locode: string): string {
  return PORT_NAMES[locode] ?? locode;
}

export function EconomicsTab({ commissionPercent, vessel, cargo, routeDistanceNm, matchDbId, storedFreightRate, freightRateSource, warRiskPremium, warRiskZones, warRiskBreakdown }: EconomicsTabProps) {
  const [open, setOpen] = useState(false);
  const [bunkerPriceUsdPerMt, setBunkerPriceUsdPerMt] = useState('');
  const [overrideRate, setOverrideRate] = useState(storedFreightRate != null ? String(storedFreightRate) : '');
  const [overrideTce, setOverrideTce] = useState<number | null>(null);
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [currentRate, setCurrentRate] = useState<number | null>(storedFreightRate ?? null);
  const [currentSource, setCurrentSource] = useState<string | null>(freightRateSource ?? null);
  const [resetting, setResetting] = useState(false);
  const [bunkerPort, setBunkerPort] = useState<BunkerPort>('SGSIN');
  const [bunkerGrade, setBunkerGrade] = useState<BunkerGrade>('VLSFO');
  const [bunkerPortManual, setBunkerPortManual] = useState(false);
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
  const recoCons = parseLeadingNumber(vessel?.consumption);
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
          if (!bunkerPortManual) {
            setBunkerPort(data.port);
          }
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [recoFrom, recoTo, bunkerGrade, bunkerPortManual, recoDwt, recoSpeed, recoCons, recoVoyageDays]);

  const handleOverrideSubmit = useCallback(async () => {
    if (!matchDbId) return;
    const rate = parseFloat(overrideRate);
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
    const consumption = parseLeadingNumber(vessel?.consumption);
    const quantityMt = cargo?.weightMt?.value ?? 0;

    const ready =
      origin.length > 0 &&
      destination.length > 0 &&
      dwt > 0 &&
      speedKts > 0 &&
      consumption > 0 &&
      quantityMt > 0;

    const missing: string[] = [];
    if (!origin) missing.push('load port');
    if (!destination) missing.push('discharge port');
    if (!dwt) missing.push('DWT');
    if (!speedKts) missing.push('vessel speed');
    if (!consumption) missing.push('fuel consumption');
    if (!quantityMt) missing.push('cargo quantity');

    return {
      ready,
      missing,
      origin,
      destination,
      vessel: {
        dwt,
        valueUsd: estimateVesselValueUsd(dwt),
        speedKts,
        consumptionMtPerDay: consumption,
      },
      cargo: { quantityMt, freightRateUsdPerMt: currentRate ?? storedFreightRate ?? 28 },
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
    const consumptionMtPerDay = parseLeadingNumber(vessel?.consumption);
    const originPort = cargo?.originPort?.value ?? '';
    const destinationPort = cargo?.destinationPort?.value ?? '';
    const quantityMt = cargo?.weightMt?.value ?? 0;
    const distanceNm = routeDistanceNm ?? 0;
    const freightRateUsdPerMt = currentRate ?? storedFreightRate ?? 28;
    const durationDays = estimateVoyageDays(distanceNm, speedKts);

    const missing: string[] = [];
    if (!speedKts) missing.push('vessel speed');
    if (!consumptionMtPerDay) missing.push('fuel consumption');
    if (!distanceNm) missing.push('route distance');

    const ready =
      missing.length === 0 &&
      dwt > 0 &&
      originPort.length > 0 &&
      destinationPort.length > 0 &&
      quantityMt > 0 &&
      durationDays > 0;

    return {
      ready,
      missing,
      input: ready
        ? {
            vessel: { dwt, valueUsd: estimateVesselValueUsd(dwt), speedKts, consumptionMtPerDay },
            route: { originPort, destinationPort, distanceNm },
            cargo: { quantityMt, freightRateUsdPerMt },
            bunkerPort,
            bunkerGrade,
            ...(bunkerPriceUsdPerMt !== '' ? { bunkerPriceUsdPerMt: Number(bunkerPriceUsdPerMt) } : {}),
            durationDays,
          }
        : null,
    };
  }, [vessel, cargo, routeDistanceNm, currentRate, storedFreightRate, bunkerPort, bunkerGrade, bunkerPriceUsdPerMt]);

  useEffect(() => {
    if (!voyageInputData.ready || !voyageInputData.input) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset of async-derived state when inputs become invalid
      setVoyageBreakdown(null);
      setVoyageError(null);
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
          setVoyageLoading(false);
          return;
        }
        const result = d as { breakdown: TCEBreakdown };
        setVoyageBreakdown(result.breakdown ?? null);
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
              Recalculated TCE: ${overrideTce.toLocaleString()}/day
            </p>
          )}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs text-gray-600 block mb-0.5">Rate (USD/mt)</label>
              <input
                data-testid="freight-rate-input"
                type="number"
                value={overrideRate}
                onChange={(e) => { setOverrideRate(e.target.value); setOverrideTce(null); setOverrideError(null); }}
                placeholder="e.g. 28"
                min={0}
                step={0.1}
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
            Leave empty to use latest spot price for {bunkerPort} {bunkerGrade}
          </p>
        )}
        <div className="flex gap-2 mt-2">
          <select
            value={bunkerPort}
            onChange={(e) => { setBunkerPort(e.target.value); setBunkerPortManual(true); }}
            aria-label="Bunker port"
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
          >
            {(bunkerCandidates.length > 0
              ? Array.from(new Map(bunkerCandidates.map(c => [c.port, c])).values()).map(c => c.port)
              : BUNKER_PORTS.map(p => p.value)
            ).map((code) => (
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
          <h3 className="text-xs font-semibold text-gray-700 mb-2">Бункеровка — сравнение портов</h3>
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
          <h3 className="text-xs font-semibold text-orange-900">JWC War Risk (per voyage)</h3>
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
                ${warRiskBreakdown.hullPremiumUsd.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Crew war bonus:</span>
              <span data-testid="warrisk-crew" className="font-medium">
                ${warRiskBreakdown.crewWarBonusUsd.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">P&amp;I surcharge:</span>
              <span data-testid="warrisk-pi" className="font-medium">
                ${warRiskBreakdown.piSurchargeUsd.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between pt-1 border-t border-orange-200">
              <span className="text-gray-700 font-medium">Total:</span>
              <span data-testid="warrisk-total" className="font-semibold text-orange-900">
                ${warRiskBreakdown.totalPremiumUsd.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div data-testid="warrisk-none" className="rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
          No JWC war risk zones on this route
        </div>
      )}

      {/* Voyage P&L breakdown */}
      <div data-testid="voyage-pnl-section" className="rounded border border-gray-200 bg-gray-50 p-3">
        <h3 className="text-xs font-semibold text-gray-700 mb-2">Voyage P&amp;L</h3>
        {voyageInputData.ready ? (
          voyageLoading ? (
            <p className="text-xs text-gray-400 animate-pulse">Calculating…</p>
          ) : voyageError ? (
            <p data-testid="voyage-error" className="text-xs text-red-600">{voyageError}</p>
          ) : voyageBreakdown ? (
            <VoyageBreakdownChart breakdown={voyageBreakdown} />
          ) : null
        ) : voyageInputData.missing.length > 0 ? (
          <p data-testid="voyage-missing-hint" className="text-xs text-gray-500">
            Missing: {voyageInputData.missing.join(', ')}
          </p>
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
          bunkerPort={bunkerPort}
          bunkerGrade={bunkerGrade}
          bunkerPriceManual={bunkerPriceUsdPerMt !== '' ? Number(bunkerPriceUsdPerMt) : undefined}
        />
      )}
    </div>
  );
}
