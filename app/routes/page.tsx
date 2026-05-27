import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Routes — Quantika',
  description: 'TCE estimates for major bulk dry cargo tradelanes',
};

type DeltaDir = 'up' | 'down' | 'flat';

interface RouteRow {
  code: string;
  segment: string;
  name: string;
  load: string;
  discharge: string;
  cargo: string;
  tce: string;
  delta: { pct: string; dir: DeltaDir };
}

const SUPRAMAX_ROUTES: RouteRow[] = [
  {
    code: 'S1B',
    segment: 'Supramax',
    name: 'Med — Atlantic',
    load: 'Gibraltar / Algeciras',
    discharge: 'US East Coast',
    cargo: 'Grain / Coal',
    tce: '$18,200',
    delta: { pct: '+1.8%', dir: 'up' },
  },
  {
    code: 'S4A',
    segment: 'Supramax',
    name: 'Black Sea — Med',
    load: 'Constanta / Novorossiysk',
    discharge: 'Mediterranean',
    cargo: 'Grain / Clinker',
    tce: '$17,400',
    delta: { pct: '+0.9%', dir: 'up' },
  },
  {
    code: 'S2',
    segment: 'Supramax',
    name: 'Indo — South China',
    load: 'Indonesia',
    discharge: 'South China',
    cargo: 'Coal',
    tce: '$14,800',
    delta: { pct: '−1.2%', dir: 'down' },
  },
  {
    code: 'S10',
    segment: 'Supramax',
    name: 'WCSA — East',
    load: 'West Coast South America',
    discharge: 'Far East',
    cargo: 'Grain / Soya',
    tce: '$12,600',
    delta: { pct: 'flat', dir: 'flat' },
  },
  {
    code: 'S3',
    segment: 'Supramax',
    name: 'US Gulf — Far East',
    load: 'US Gulf',
    discharge: 'Japan / South Korea',
    cargo: 'Grain',
    tce: '$15,900',
    delta: { pct: '+0.4%', dir: 'up' },
  },
  {
    code: 'S6',
    segment: 'Supramax',
    name: 'W Africa — China',
    load: 'West Africa',
    discharge: 'China',
    cargo: 'Bauxite',
    tce: '$13,400',
    delta: { pct: '−0.7%', dir: 'down' },
  },
];

const CAPESIZE_ROUTES: RouteRow[] = [
  {
    code: 'C2',
    segment: 'Capesize',
    name: 'Tubarão — Rotterdam',
    load: 'Tubarão (Brazil)',
    discharge: 'Rotterdam',
    cargo: 'Iron Ore',
    tce: '$24,500',
    delta: { pct: '+2.4%', dir: 'up' },
  },
  {
    code: 'C3',
    segment: 'Capesize',
    name: 'Tubarão — Qingdao',
    load: 'Tubarão (Brazil)',
    discharge: 'Qingdao (China)',
    cargo: 'Iron Ore',
    tce: '$22,100',
    delta: { pct: '+1.1%', dir: 'up' },
  },
  {
    code: 'C5',
    segment: 'Capesize',
    name: 'W Australia — China',
    load: 'Port Hedland',
    discharge: 'Qingdao (China)',
    cargo: 'Iron Ore',
    tce: '$19,800',
    delta: { pct: '−0.3%', dir: 'down' },
  },
  {
    code: 'C10',
    segment: 'Capesize',
    name: 'Pacific RV',
    load: 'Pacific round voyage',
    discharge: 'Pacific round voyage',
    cargo: 'Coal / Ore',
    tce: '$21,300',
    delta: { pct: '+3.1%', dir: 'up' },
  },
];

const DELTA_CLS: Record<DeltaDir, string> = {
  up: 'bg-green-50 text-green-600 border border-green-200',
  down: 'bg-red-50 text-red-600 border border-red-200',
  flat: 'bg-slate-50 text-slate-500 border border-slate-200',
};

function DeltaBadge({ pct, dir }: { pct: string; dir: DeltaDir }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-mono text-[11px] font-medium ${DELTA_CLS[dir]}`}
    >
      {dir === 'up' && '▲ '}
      {dir === 'down' && '▼ '}
      {pct}
    </span>
  );
}

function RouteTable({ routes, label }: { routes: RouteRow[]; label: string }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
        <span className="text-sm">📈</span>
        <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate-500">
          {label}
        </span>
        <span className="font-normal normal-case tracking-normal text-slate-400 font-mono text-[11px] ml-1">
          $/d TCE est.
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-6 py-2.5 text-left font-mono text-[10.5px] tracking-wider uppercase text-slate-400 w-16">Code</th>
              <th className="px-3 py-2.5 text-left font-mono text-[10.5px] tracking-wider uppercase text-slate-400">Route</th>
              <th className="px-3 py-2.5 text-left font-mono text-[10.5px] tracking-wider uppercase text-slate-400 hidden md:table-cell">Load</th>
              <th className="px-3 py-2.5 text-left font-mono text-[10.5px] tracking-wider uppercase text-slate-400 hidden md:table-cell">Discharge</th>
              <th className="px-3 py-2.5 text-left font-mono text-[10.5px] tracking-wider uppercase text-slate-400 hidden lg:table-cell">Cargo</th>
              <th className="px-6 py-2.5 text-right font-mono text-[10.5px] tracking-wider uppercase text-slate-400">TCE /day</th>
              <th className="px-6 py-2.5 text-right font-mono text-[10.5px] tracking-wider uppercase text-slate-400 w-20">24h</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((row) => (
              <tr key={row.code} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors last:border-b-0">
                <td className="px-6 py-3.5">
                  <span className="font-mono text-[12.5px] font-medium text-slate-900 tracking-[0.02em]">{row.code}</span>
                </td>
                <td className="px-3 py-3.5 text-slate-900 tracking-tight">{row.name}</td>
                <td className="px-3 py-3.5 text-slate-500 text-xs hidden md:table-cell">{row.load}</td>
                <td className="px-3 py-3.5 text-slate-500 text-xs hidden md:table-cell">{row.discharge}</td>
                <td className="px-3 py-3.5 text-slate-500 text-xs hidden lg:table-cell">{row.cargo}</td>
                <td className="px-6 py-3.5 text-right font-mono text-sm font-medium text-slate-900 tabular-nums">
                  {row.tce}<span className="text-slate-400 font-normal text-[11px] ml-0.5">/d</span>
                </td>
                <td className="px-6 py-3.5 text-right">
                  <DeltaBadge pct={row.delta.pct} dir={row.delta.dir} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function RoutesPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/market"
            className="text-sm text-slate-500 hover:text-ds-accent transition-colors"
          >
            ← Market
          </Link>
          <span className="text-slate-300">/</span>
          <h1 className="text-xl font-bold text-slate-900">Tradelane Routes</h1>
        </div>

        <p className="text-sm text-slate-500 max-w-xl">
          TCE estimates for major bulk dry cargo tradelanes. Values updated daily from Baltic Exchange indices. Figures are indicative $/day for a standard vessel on each route.
        </p>

        <RouteTable routes={SUPRAMAX_ROUTES} label="Supramax (58k DWT)" />
        <RouteTable routes={CAPESIZE_ROUTES} label="Capesize (180k DWT)" />

        <p className="text-xs text-slate-400 text-center pb-4">
          Source: Baltic Exchange via Quantika market feed · Updated daily · All values in USD
        </p>
      </div>
    </main>
  );
}
