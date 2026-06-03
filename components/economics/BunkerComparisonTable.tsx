'use client';

import type { BunkerCandidateResult } from '@/lib/economics/bunker-comparison';

const PORT_NAMES: Record<string, string> = {
  SGSIN: 'Singapore',
  CNZOS: 'Zhoushan',
  HKHKG: 'Hong Kong',
  KRPUS: 'Busan',
  CNSHA: 'Shanghai',
  TWKHH: 'Kaohsiung',
  LKCMB: 'Colombo',
  AEFJR: 'Fujairah',
  SAJED: 'Jeddah',
  NLRTM: 'Rotterdam',
  BEANR: 'Antwerp',
  GIGIB: 'Gibraltar',
  ESALG: 'Algeciras',
  ESLPA: 'Las Palmas',
  GRPIR: 'Piraeus',
  TRIST: 'Istanbul',
  USHOU: 'Houston',
  USNYC: 'New York',
  PABLB: 'Balboa',
  BRSSZ: 'Santos',
  USLAX: 'Los Angeles',
  ZADUR: 'Durban',
  MTMLA: 'Malta',
  // Bug 4 — regional Med/Black Sea hubs added 2026-06-02
  ROCND: 'Constanta',
  EGPSD: 'Port Said',
  ITAUG: 'Augusta',
  ESCEU: 'Ceuta',
  CYLMS: 'Limassol',
};

function portLabel(locode: string): string {
  return PORT_NAMES[locode] ?? locode;
}

interface BunkerComparisonTableProps {
  candidates: BunkerCandidateResult[];
  liftTonnes?: number;
  capacityMt?: number;
  liftCapped?: boolean;
  recommendedSplit?: string | null;
}

export function BunkerComparisonTable({
  candidates,
  liftTonnes,
  capacityMt,
  liftCapped,
  recommendedSplit,
}: BunkerComparisonTableProps) {
  if (candidates.length === 0) {
    return (
      <p data-testid="bunker-table-empty" className="text-xs text-gray-500">
        No on-route bunker ports found — enter price manually or select nearest port.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {liftTonnes != null && (
        <p data-testid="lift-header" className="text-xs font-medium text-gray-700">
          Need to lift ~{liftTonnes.toLocaleString('en-US')} t
          {capacityMt != null && capacityMt > 0 && (
            <span className="ml-1 text-gray-500 font-normal">
              (tank capacity ~{capacityMt.toLocaleString('en-US')} t)
            </span>
          )}
          {liftCapped && (
            <span data-testid="lift-capped-warn" className="ml-1 text-amber-700 font-normal">
              ⚠ hit capacity — intermediate bunkering required
            </span>
          )}
        </p>
      )}

      <div className="overflow-x-auto">
        <table
          data-testid="bunker-comparison-table"
          className="w-full text-xs border-collapse"
        >
          <thead>
            <tr className="border-b border-gray-200 text-gray-500 text-left">
              <th className="py-1 pr-2 font-medium">Port</th>
              <th className="py-1 pr-2 font-medium text-right">$/t</th>
              <th className="py-1 pr-2 font-medium text-right">Detour</th>
              <th className="py-1 pr-2 font-medium text-right">+Fuel $</th>
              <th className="py-1 pr-2 font-medium text-right">Time×$/day</th>
              <th className="py-1 pr-2 font-medium text-right">Carbon $/t</th>
              <th className="py-1 font-medium text-right">Eff. $/t</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c, i) => {
              const isWinner = i === 0;
              return (
                <tr
                  key={c.port}
                  data-testid={`bunker-row-${i}`}
                  data-winner={isWinner ? 'true' : 'false'}
                  className={
                    isWinner
                      ? 'bg-emerald-50 font-semibold text-emerald-900'
                      : 'text-gray-700 odd:bg-gray-50'
                  }
                >
                  <td data-testid={`port-${i}`} className="py-1 pr-2 flex items-center gap-1">
                    {isWinner && (
                      <span data-testid="winner-badge" aria-label="Best option" className="text-emerald-600">
                        ✅
                      </span>
                    )}
                    {portLabel(c.port)}
                    <span className="text-gray-400 font-normal ml-0.5">{c.grade}</span>
                  </td>
                  <td data-testid={`price-${i}`} className="py-1 pr-2 text-right">
                    {c.priceUsdPerMt.toFixed(0)}
                  </td>
                  <td data-testid={`deviation-${i}`} className="py-1 pr-2 text-right">
                    {c.deviationNm > 0
                      ? `${c.deviationNm.toFixed(0)}nm / ${c.deviationHours.toFixed(1)}h`
                      : '—'}
                  </td>
                  <td className="py-1 pr-2 text-right">
                    {c.deviationFuelUsd > 0 ? `$${c.deviationFuelUsd.toFixed(0)}` : '—'}
                  </td>
                  <td className="py-1 pr-2 text-right">
                    {c.timeCostUsd > 0 ? `$${c.timeCostUsd.toFixed(0)}` : '—'}
                  </td>
                  <td data-testid={`carbon-${i}`} className="py-1 pr-2 text-right text-slate-500">
                    {c.carbonUsdPerMt > 0 ? `${c.carbonUsdPerMt.toFixed(2)}` : '—'}
                  </td>
                  <td data-testid={`eff-${i}`} className="py-1 text-right font-semibold">
                    {c.effectiveUsdPerMt.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {recommendedSplit && (
        <div
          data-testid="recommended-split"
          className="rounded border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800"
        >
          <span className="font-medium">Recommended split: </span>
          {recommendedSplit}
        </div>
      )}

      <div
        data-testid="human-decision-flags"
        className="rounded border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1"
      >
        <p className="font-semibold text-amber-900">Human decision required ⚠</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Laycan risk — verify detour fits within laycan window</li>
          <li>Fuel quality — VLSFO spec varies by port; check bunker report</li>
          <li>Charter type — TC off-hire detour may require owner consent</li>
        </ul>
      </div>
    </div>
  );
}
