'use client';

import { useState } from 'react';
import type { ParsedVessel } from '@/lib/types';
import type { CiiRating } from '@/lib/imo/cii-lookup';
import { safeRender } from '@/lib/ui-render';
import { CiiRatingBadge } from '@/components/vessel/CiiRatingBadge';
import { DismissableDemoBadge } from '@/components/ui/DismissableDemoBadge';
import { checkCompatibility, parseLastCargoes } from '@/lib/cargo/l5c-matrix';

interface VesselsTabProps {
  vessel?: ParsedVessel;
  newCargo?: string;
}

const CII_D_E_PATTERN = /\bCII\s+rating\s+([DE])\b/i;

/** Extracts CII rating D or E from vessel restrictions array. Returns null if none found. */
function parseCiiDorE(restrictions: string[]): CiiRating | null {
  for (const r of restrictions) {
    if (typeof r !== 'string') continue;
    const m = r.match(CII_D_E_PATTERN);
    if (m) return m[1].toUpperCase() as 'D' | 'E';
  }
  return null;
}

function RejectedDetails({ vessel }: { vessel: ParsedVessel }) {
  return (
    <div className="mt-3 space-y-2 text-sm">
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {vessel.imo && (
          <div>
            <span className="text-gray-500">IMO</span>
            <p className="font-medium">{vessel.imo}</p>
          </div>
        )}
        {vessel.flag && (
          <div>
            <span className="text-gray-500">Flag</span>
            <p className="font-medium">{vessel.flag}</p>
          </div>
        )}
        {vessel.dwtSummer && (
          <div>
            <span className="text-gray-500">DWT</span>
            <p className="font-medium">{safeRender(vessel.dwtSummer.value)} MT</p>
          </div>
        )}
        {vessel.vesselType && (
          <div>
            <span className="text-gray-500">Type</span>
            <p className="font-medium">{safeRender(vessel.vesselType)}</p>
          </div>
        )}
      </div>
      {vessel.restrictions.length > 0 && (
        <ul className="text-xs text-gray-500 list-disc ml-4">
          {vessel.restrictions.filter((r) => typeof r === 'string').map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
    </div>
  );
}

export function VesselsTab({ vessel, newCargo }: VesselsTabProps) {
  const [showDetails, setShowDetails] = useState(false);

  const ciiRejectedRating = vessel ? parseCiiDorE(vessel.restrictions) : null;
  const l5cResult =
    vessel?.lastCargoes && newCargo
      ? checkCompatibility(parseLastCargoes(vessel.lastCargoes), newCargo)
      : null;

  return (
    <div data-testid="tab-vessels" className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <DismissableDemoBadge storageKey="demo-badge-psc" data-testid="psc-demo-badge" />
        <DismissableDemoBadge
          storageKey="demo-badge-charterers"
          data-testid="charterers-demo-badge"
          label="Charterer data · Illustrative"
        />
      </div>
      {!vessel ? (
        <p className="text-gray-500">No vessel data available.</p>
      ) : ciiRejectedRating ? (
        /* Reject card for CII D/E */
        <div data-testid="cii-reject-card" className="rounded-lg border-2 border-orange-400 bg-orange-50 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <CiiRatingBadge rating={ciiRejectedRating} year={2025} source={vessel.ciiSource ?? 'imo-public'} size="medium" />
            <p className="font-semibold text-orange-800">
              CII rating D/E exceeds chartering policy threshold
            </p>
          </div>
          <p className="text-xs text-orange-700">
            This vessel does not meet the charterer&apos;s sustainability requirements.
            Broker may still argue the case — see details below.
          </p>
          <button
            onClick={() => setShowDetails(v => !v)}
            className="text-xs text-orange-800 underline hover:text-orange-900"
          >
            {showDetails ? 'Hide rejected details' : 'Show rejected details'}
          </button>
          {showDetails && <RejectedDetails vessel={vessel} />}
        </div>
      ) : (
        /* Normal card */
        <>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {vessel.imo && (
              <div>
                <span className="text-gray-500">IMO</span>
                <p className="font-medium">{vessel.imo}</p>
              </div>
            )}
            {vessel.flag && (
              <div>
                <span className="text-gray-500">Flag</span>
                <p className="font-medium">{vessel.flag}</p>
              </div>
            )}
            {vessel.built && (
              <div>
                <span className="text-gray-500">Built</span>
                <p className="font-medium">{vessel.built}</p>
              </div>
            )}
            {vessel.dwtSummer && (
              <div>
                <span className="text-gray-500">DWT</span>
                <p className="font-medium">{safeRender(vessel.dwtSummer.value)} MT</p>
              </div>
            )}
            {vessel.holdsCount != null && (
              <div>
                <span className="text-gray-500">Holds</span>
                <p className="font-medium">{vessel.holdsCount}</p>
              </div>
            )}
            {vessel.baleCapacity != null && (
              <div>
                <span className="text-gray-500">Bale Capacity</span>
                <p className="font-medium">{vessel.baleCapacity.toLocaleString('en-US')} {vessel.grainCapacityUnit?.toUpperCase() ?? 'CBM'}</p>
              </div>
            )}
            {vessel.craneCapacity && (
              <div>
                <span className="text-gray-500">Cranes / SWL</span>
                <p className="font-medium">{vessel.craneCapacity}</p>
              </div>
            )}
            {vessel.vesselType && (
              <div>
                <span className="text-gray-500">Type</span>
                <p className="font-medium">{safeRender(vessel.vesselType)}</p>
              </div>
            )}
          </div>
          {vessel.verificationWarning && (
            <p className="text-orange-700 bg-orange-50 rounded p-2 text-xs">
              ⚠ {vessel.verificationWarning}
            </p>
          )}
          {l5cResult && !l5cResult.compatible && (
            <p
              className="text-red-700 bg-red-50 rounded p-2 text-xs"
              title={l5cResult.warnings.concat(l5cResult.blocking_pairs.map((bp) => `${bp.previous}: ${bp.reason}`)).join('\n')}
            >
              L5C incompatible: {l5cResult.blocking_pairs.map((bp) => bp.reason).join('; ')}
            </p>
          )}
          {l5cResult && l5cResult.compatible && l5cResult.requires_extra_clean && (
            <p
              className="text-yellow-700 bg-yellow-50 rounded p-2 text-xs"
              title={l5cResult.warnings.join('\n')}
            >
              Extra hold cleaning required
            </p>
          )}
        </>
      )}
    </div>
  );
}
