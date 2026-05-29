import Link from 'next/link';

interface KnowledgeRow {
  icon: string;
  iconVariant?: 'tag' | 'default';
  title: string;
  source: string;
  date: string;
  tag: string;
}

const ARTICLES: KnowledgeRow[] = [
  {
    icon: '§',
    iconVariant: 'tag',
    title: 'IMSBC code 2026 update — HSS Group A amendments',
    source: 'IMO / Baltic Exchange',
    date: '2026-05-20',
    tag: 'IMSBC',
  },
  {
    icon: '§',
    iconVariant: 'tag',
    title: 'IGC code — LNG cargo containment revision',
    source: 'IMO',
    date: '2026-05-15',
    tag: 'IGC',
  },
  {
    icon: '⚓',
    title: 'Port DA schedule changes — Rotterdam Q2 2026',
    source: 'Port Authority Rotterdam',
    date: '2026-05-12',
    tag: 'Port DA',
  },
  {
    icon: '⚓',
    title: 'Algeciras congestion surcharge — DA update',
    source: 'Algeciras Port Authority',
    date: '2026-05-10',
    tag: 'Port DA',
  },
  {
    icon: '€',
    title: 'EU ETS phase 2 — bunker surcharge guidance',
    source: 'EU Commission',
    date: '2026-05-08',
    tag: 'Compliance',
  },
  {
    icon: '⛽',
    title: 'VLSFO Rotterdam — week 21 spread analysis',
    source: 'Ship & Bunker',
    date: '2026-05-07',
    tag: 'Bunker',
  },
];

const ICON_CLS = {
  tag: 'bg-amber-50 text-amber-800 border border-amber-200',
  default: 'bg-slate-100 text-slate-500',
};

export function KnowledgeFeed() {
  return (
    <section id="knowledge" className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center justify-between pb-[18px] mb-1.5 border-b border-dashed border-slate-200">
        <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate-500 flex items-center gap-2">
          <span className="text-sm">📚</span>
          Knowledge feed
        </div>
        <Link href="/admin/knowledge" className="font-mono text-xs text-slate-500 hover:text-ds-accent transition-colors">
          library <span className="ml-1">→</span>
        </Link>
      </div>

      <div className="overflow-y-auto max-h-[340px]">
        {ARTICLES.map((row, i) => (
          <div
            key={i}
            className="grid items-center py-3 px-1 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors cursor-pointer"
            style={{ gridTemplateColumns: '28px 1fr auto', gap: '12px' }}
          >
            <span
              className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono flex-shrink-0 ${
                ICON_CLS[row.iconVariant ?? 'default']
              }`}
            >
              {row.icon}
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] text-slate-900 tracking-tight leading-snug truncate">{row.title}</p>
              <p className="font-mono text-[10.5px] text-slate-400 mt-0.5">
                {row.source} · {row.date}
              </p>
            </div>
            <span className="font-mono text-[10px] tracking-[0.06em] uppercase text-slate-500 rounded-full px-2 py-1 bg-slate-100 whitespace-nowrap flex-shrink-0">
              {row.tag}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default KnowledgeFeed;
