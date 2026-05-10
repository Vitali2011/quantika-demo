'use client';

import { useState, useMemo } from 'react';
import type { ParsedVessel, ParsedCargo } from '@/lib/types';
import { RouteCompareModal } from '@/components/economics/RouteCompareModal';

interface EconomicsTabProps {
  commissionPercent?: number | null;
  vessel?: ParsedVessel;
  cargo?: ParsedCargo;
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

export function EconomicsTab({ commissionPercent, vessel, cargo }: EconomicsTabProps) {
  const [open, setOpen] = useState(false);
  const [bunkerPriceUsdPerMt, setBunkerPriceUsdPerMt] = useState('');
  const [bunkerPort, setBunkerPort] = useState<BunkerPort>('SGSIN');
  const [bunkerGrade, setBunkerGrade] = useState<BunkerGrade>('VLSFO');

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
