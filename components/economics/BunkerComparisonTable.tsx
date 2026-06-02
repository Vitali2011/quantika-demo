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
};

function portLabel(locode: string): string {
  return PORT_NAMES[locode] ?? locode;
}

interface BunkerComparisonTableProps {
  candidates: BunkerCandidateResult[];
  liftTonnes?: number;
  recommendedSplit?: string | null;
}

export function BunkerComparisonTable({
  candidates,
  liftTonnes,
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
          Нужно залить ~{liftTonnes.toLocaleString()} т
        </p>
      )}

      <div className="overflow-x-auto">
        <table
          data-testid="bunker-comparison-table"
          className="w-full text-xs border-collapse"
        >
          <thead>
            <tr className="border-b border-gray-200 text-gray-500 text-left">
              <th className="py-1 pr-2 font-medium">Порт</th>
              <th className="py-1 pr-2 font-medium text-right">$/т</th>
              <th className="py-1 pr-2 font-medium text-right">Крюк</th>
              <th className="py-1 pr-2 font-medium text-right">+Топл $</th>
              <th className="py-1 pr-2 font-medium text-right">Время×$сут</th>
              <th className="py-1 font-medium text-right">ЭФФ. $/т</th>
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
                      <span data-testid="winner-badge" aria-label="Лучший вариант" className="text-emerald-600">
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
          <span className="font-medium">Рекомендованный сплит: </span>
          {recommendedSplit}
        </div>
      )}

      <div
        data-testid="human-decision-flags"
        className="rounded border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1"
      >
        <p className="font-semibold text-amber-900">Решает человек ⚠</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Laycan risk — проверьте, укладывается ли крюк в laycan</li>
          <li>Fuel quality — VLSFO spec различается по порту; проверить бункерный отчёт</li>
          <li>Charter type — при TC off-hire detour может требовать разрешения</li>
        </ul>
      </div>
    </div>
  );
}
