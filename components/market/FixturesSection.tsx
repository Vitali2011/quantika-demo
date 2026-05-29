import Link from 'next/link';

interface FixtureRow {
  vessel: string;
  route: string;
  cargo: string;
  type: string;
  time: string;
  rate: string;
  unit: string;
}

const FIXTURES: FixtureRow[] = [
  { vessel: 'MV Atlas', route: 'CONS → ALG', cargo: '47k HSS', type: 'Supramax', time: '14:02', rate: '$28.50', unit: '/MT' },
  { vessel: 'MV Nordic', route: 'ODE → VEN', cargo: '35k grain', type: 'Handysize', time: '11:38', rate: '$22.10', unit: '/MT' },
  { vessel: 'MV Baltic', route: 'RIG → GIB', cargo: '55k coal', type: 'Supramax', time: '09:14', rate: '$18.40', unit: '/MT' },
  { vessel: 'MV Pegas', route: 'KAR → MAR', cargo: '49k urea', type: 'Supramax', time: '07:45', rate: '$24.80', unit: '/MT' },
];

export function FixturesSection() {
  return (
    <section id="fixtures" className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center justify-between pb-[18px] mb-1.5 border-b border-dashed border-slate-200">
        <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate-500 flex items-center gap-2">
          <span className="text-sm">🔥</span>
          Recent fixtures{' '}
          <span className="normal-case tracking-normal font-normal text-slate-400">(last 24h)</span>
        </div>
        <Link href="/market#fixtures" className="font-mono text-xs text-slate-500 hover:text-ds-accent transition-colors">
          fixture log <span className="ml-1">→</span>
        </Link>
      </div>

      {FIXTURES.map((row, i) => (
        <div
          key={i}
          className="grid items-center py-3.5 px-1 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors"
          style={{ gridTemplateColumns: '1fr auto', gap: '18px' }}
        >
          <div className="flex flex-col gap-1">
            <div className="font-mono text-[13.5px] font-medium text-slate-900 tracking-tight">
              <span>{row.vessel}</span>
              <span className="text-slate-300 mx-1.5 font-normal">→</span>
              <span className="text-slate-600 font-normal">{row.route}</span>
            </div>
            <div className="font-mono text-xs text-slate-500">
              {row.cargo}
              <span className="text-slate-300 mx-1.5">·</span>
              {row.type}
              <span className="text-slate-300 mx-1.5">·</span>
              rep. {row.time}
            </div>
          </div>
          <div className="font-mono text-sm font-medium text-slate-900 tabular-nums text-right">
            {row.rate}
            <span className="text-slate-400 font-normal text-[11.5px] ml-0.5">{row.unit}</span>
          </div>
        </div>
      ))}
    </section>
  );
}

export default FixturesSection;
