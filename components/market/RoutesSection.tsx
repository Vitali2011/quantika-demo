import Link from 'next/link';

type DeltaDir = 'up' | 'down' | 'flat';

interface RouteRow {
  code: string;
  name: string;
  meta: string;
  value: string;
  delta: { pct: string; dir: DeltaDir };
}

const ROUTES: RouteRow[] = [
  { code: 'S1B', name: 'Med — Atlantic', meta: 'via Gibraltar', value: '$18,200', delta: { pct: '+1.8%', dir: 'up' } },
  { code: 'S4A', name: 'Black Sea — Med', meta: 'grain & clinker', value: '$17,400', delta: { pct: '+0.9%', dir: 'up' } },
  { code: 'S2', name: 'Indo — South China', meta: 'coal trade', value: '$14,800', delta: { pct: '−1.2%', dir: 'down' } },
  { code: 'S10', name: 'WCSA — East', meta: 'trans-Pacific', value: '$12,600', delta: { pct: 'flat', dir: 'flat' } },
];

const DELTA_CLS: Record<DeltaDir, string> = {
  up: 'bg-green-50 text-green-600 border border-green-200',
  down: 'bg-red-50 text-red-600 border border-red-200',
  flat: 'bg-slate-50 text-slate-500 border border-slate-200',
};

function DeltaBadge({ pct, dir }: { pct: string; dir: DeltaDir }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-mono text-[11.5px] font-medium ${DELTA_CLS[dir]}`}
    >
      {dir === 'up' && (
        <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
          <path d="M5 2 L8 6 H2 Z" />
        </svg>
      )}
      {dir === 'down' && (
        <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
          <path d="M5 8 L2 4 H8 Z" />
        </svg>
      )}
      {pct}
    </span>
  );
}

export function RoutesSection() {
  return (
    <section id="routes" className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
      <div className="flex items-center justify-between pb-[18px] mb-1.5 border-b border-dashed border-slate-200">
        <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate-500 flex items-center gap-2">
          <span className="text-sm">📈</span>
          Routes — TCE est.{' '}
          <span className="normal-case tracking-normal font-normal text-slate-400">
            $/d (Supramax)
          </span>
        </div>
        <Link href="/routes" className="font-mono text-xs text-slate-500 hover:text-ds-accent transition-colors">
          all routes <span className="ml-1">→</span>
        </Link>
      </div>

      {ROUTES.map((row) => (
        <div
          key={row.code}
          className="grid items-center py-3.5 px-1 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors"
          style={{ gridTemplateColumns: '52px 1fr auto auto', gap: '16px' }}
        >
          <span className="font-mono text-[12.5px] font-medium text-slate-900 tracking-[0.02em]">
            {row.code}
          </span>
          <div className="text-[14.5px] text-slate-900 tracking-tight">
            {row.name}{' '}
            <span className="text-slate-500 text-[12.5px] font-mono ml-1.5">{row.meta}</span>
          </div>
          <div className="font-mono text-sm font-medium text-slate-900 tabular-nums text-right min-w-[90px]">
            {row.value}
            <span className="text-slate-400 font-normal text-[11.5px] ml-0.5"> /d</span>
          </div>
          <DeltaBadge pct={row.delta.pct} dir={row.delta.dir} />
        </div>
      ))}
    </section>
  );
}

export default RoutesSection;
