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

export function EconomicsTab({ commissionPercent, vessel, cargo }: EconomicsTabProps) {
  const [open, setOpen] = useState(false);

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

  return (
    <div data-testid="tab-economics" className="space-y-4 text-sm">
      {commissionPercent != null && (
        <div>
          <span className="text-gray-500">Commission</span>
          <p className="font-medium">{commissionPercent}%</p>
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
        />
      )}
    </div>
  );
}
