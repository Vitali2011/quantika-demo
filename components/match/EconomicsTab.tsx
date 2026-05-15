'use client';

import { useState, useMemo } from 'react';
import type { ParsedVessel, ParsedCargo } from '@/lib/types';
import { RouteCompareModal } from '@/components/economics/RouteCompareModal';
import { calculateFuelEu } from '@/lib/economics/fueleu';
import { estimateVoyageDays } from '@/lib/economics/voyage-days';

interface EconomicsTabProps {
  commissionPercent?: number | null;
  vessel?: ParsedVessel;
  cargo?: ParsedCargo;
  /**
   * Route distance in nautical miles, e.g. from `match.readiness.distanceNm`.
   * When omitted/null the FuelEU tile renders without a penalty estimate
   * (shows "Voyage distance n/a") instead of using a hardcoded constant.
   */
  routeDistanceNm?: number | null;
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
] as const;

const BUNKER_GRADES = ['VLSFO', 'MGO'] as const;

type BunkerPort = (typeof BUNKER_PORTS)[number]['value'];
type BunkerGrade = (typeof BUNKER_GRADES)[number];

const MULTI_CURRENCY_V2_ENABLED =
  process.env.NEXT_PUBLIC_MULTI_CURRENCY_V2_ENABLED === 'true';

const DISPLAY_CURRENCIES = ['USD', 'EUR', 'GBP', 'NOK', 'AED'] as const;
type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

// Fallback FX rates vs USD (updated by daily cron; used for display only)
const DISPLAY_RATES: Record<DisplayCurrency, number> = {
  USD: 1, EUR: 0.926, GBP: 0.787, NOK: 10.87, AED: 3.67,
};

export function EconomicsTab({ commissionPercent, vessel, cargo, routeDistanceNm }: EconomicsTabProps) {
  const [open, setOpen] = useState(false);
  const [bunkerPriceUsdPerMt, setBunkerPriceUsdPerMt] = useState('');
  const [bunkerPort, setBunkerPort] = useState<BunkerPort>('SGSIN');
  const [bunkerGrade, setBunkerGrade] = useState<BunkerGrade>('VLSFO');
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('USD');
  const [fuelType, setFuelType] = useState('hfo');

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

    return {
      ready,
      origin,
      destination,
      vessel: {
        dwt,
        valueUsd: 22_000_000,
        speedKts,
        consumptionMtPerDay: consumption,
      },
      cargo: { quantityMt, freightRateUsdPerMt: 28 },
    };
  }, [cargo, vessel]);

  const marketRates = useMemo(() => {
    const manual = bunkerPriceUsdPerMt !== '' ? Number(bunkerPriceUsdPerMt) : undefined;
    return {
      bunkerPriceUsdPerMt: manual ?? 0,
      euaPriceEur: 75,
      // pass port/grade for auto-resolve when price is empty
      bunkerPort,
      bunkerGrade,
    };
  }, [bunkerPriceUsdPerMt, bunkerPort, bunkerGrade]);

  const fuelEuEnabled = process.env.NEXT_PUBLIC_FUELEU_ENABLED === 'true';

  const fuelEuResult = useMemo(() => {
    if (!fuelEuEnabled) return null;

    const consumption = parseLeadingNumber(vessel?.consumption);
    const speedKnots = parseLeadingNumber(vessel?.speedLaden);
    const voyageDays = estimateVoyageDays(routeDistanceNm, speedKnots);

    try {
      return calculateFuelEu({
        fuelType,
        consumptionMtPerDay: consumption,
        voyageDays,
        year: 2025,
      });
    } catch {
      return null;
    }
  }, [fuelType, vessel, routeDistanceNm, fuelEuEnabled]);

  const fuelEuVoyageDays = useMemo(() => {
    if (!fuelEuEnabled) return 0;
    const speedKnots = parseLeadingNumber(vessel?.speedLaden);
    return estimateVoyageDays(routeDistanceNm, speedKnots);
  }, [vessel, routeDistanceNm, fuelEuEnabled]);

  return (
    <div data-testid="tab-economics" className="space-y-4 text-sm">
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
            onChange={(e) => setBunkerPort(e.target.value as BunkerPort)}
            aria-label="Bunker port"
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
          >
            {BUNKER_PORTS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
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
      </div>

      {MULTI_CURRENCY_V2_ENABLED && (
        <div className="space-y-1">
          <label className="text-xs text-gray-500 block">
            Display currency
          </label>
          <select
            value={displayCurrency}
            onChange={(e) => setDisplayCurrency(e.target.value as DisplayCurrency)}
            aria-label="Display currency"
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
          >
            {DISPLAY_CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {displayCurrency !== 'USD' && (
            <p className="text-xs text-gray-400" data-testid="fx-rate-hint">
              1 USD ≈ {DISPLAY_RATES[displayCurrency].toFixed(displayCurrency === 'EUR' || displayCurrency === 'GBP' ? 3 : 2)} {displayCurrency}
              {' '}(fallback rate)
            </p>
          )}
        </div>
      )}

      {fuelEuEnabled && (
        <div
          data-testid="fueleu-tile"
          className="rounded border border-blue-200 bg-blue-50 p-3 space-y-2"
        >
          <h3 className="text-xs font-semibold text-blue-900">
            FuelEU Maritime Compliance
          </h3>

          <div className="space-y-1">
            <label className="text-xs text-gray-600 block">Fuel type</label>
            <select
              value={fuelType}
              onChange={(e) => setFuelType(e.target.value)}
              aria-label="Fuel type"
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
            >
              <option value="hfo">HFO (Heavy Fuel Oil)</option>
              <option value="vlsfo">VLSFO (Very Low Sulfur FO)</option>
              <option value="mgo">MGO (Marine Gas Oil)</option>
              <option value="lng">LNG (Liquefied Natural Gas)</option>
              <option value="methanol">Methanol (Conventional)</option>
              <option value="ammonia">Green Ammonia</option>
              <option value="biodiesel-b100">Biodiesel B100</option>
            </select>
          </div>

          {fuelEuResult && fuelEuVoyageDays === 0 && (
            <p className="text-xs text-gray-500" data-testid="fueleu-distance-missing">
              Voyage distance n/a — provide origin/destination + vessel speed for a penalty estimate.
            </p>
          )}

          {fuelEuResult && (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">WtW GHG intensity:</span>
                <span className="font-medium">
                  {fuelEuResult.ghgIntensityActual.toFixed(2)} g CO₂eq/MJ
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Target (2025):</span>
                <span className="font-medium">
                  {fuelEuResult.ghgIntensityTarget.toFixed(2)} g CO₂eq/MJ
                </span>
              </div>

              <div className="mt-2 pt-2 border-t border-blue-200">
                {fuelEuResult.isCompliant ? (
                  <div className="flex items-center gap-1.5 text-green-700">
                    <span className="text-base">✓</span>
                    <span className="font-medium">Compliant</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-orange-700">
                      <span className="text-base">⚠</span>
                      <span className="font-medium">
                        Penalty: €{fuelEuResult.penaltyEur.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="text-gray-500">
                      ≈ ${fuelEuResult.penaltyUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

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
      </div>

      <div className="rounded border border-dashed border-gray-300 p-4 text-gray-400 text-center text-xs">
        Bunker / ETS / war-risk costs — coming in spec-08 (Wave 2)
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
