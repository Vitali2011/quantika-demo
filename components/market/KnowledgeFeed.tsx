'use client';

interface KnowledgeRow {
  icon: string;
  iconVariant?: 'tag' | 'default';
  title: string;
  tag: string;
}

const ARTICLES: KnowledgeRow[] = [
  { icon: '§', iconVariant: 'tag', title: 'IMSBC code 2026 update — HSS Group A', tag: 'Regulation' },
  { icon: '€', title: 'EU ETS phase 2 — bunker surcharge', tag: 'Compliance' },
  { icon: '⚓', title: 'Algeciras congestion update', tag: 'Ports' },
  { icon: '⛽', title: 'VLSFO Rotterdam — week 21 spread', tag: 'Bunker' },
];

const ICON_CLS = {
  tag: 'bg-amber-50 text-amber-800 border border-amber-200',
  default: 'bg-slate-100 text-slate-500',
};

export function KnowledgeFeed() {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center justify-between pb-[18px] mb-1.5 border-b border-dashed border-slate-200">
        <div className="font-mono text-[11px] tracking-[0.14em] uppercase text-slate-500 flex items-center gap-2">
          <span className="text-sm">📚</span>
          Knowledge feed
        </div>
        <span className="font-mono text-xs text-slate-500">
          library <span className="ml-1">→</span>
        </span>
      </div>

      {ARTICLES.map((row, i) => (
        <div
          key={i}
          className="grid items-center py-3.5 px-1 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors cursor-pointer"
          style={{ gridTemplateColumns: '28px 1fr auto 16px', gap: '14px' }}
        >
          <span
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono flex-shrink-0 ${
              ICON_CLS[row.iconVariant ?? 'default']
            }`}
          >
            {row.icon}
          </span>
          <p className="text-[14.5px] text-slate-900 tracking-tight leading-snug">{row.title}</p>
          <span className="font-mono text-[10.5px] tracking-[0.08em] uppercase text-slate-500 rounded-full px-2 py-1 bg-slate-100 whitespace-nowrap">
            {row.tag}
          </span>
          <span className="text-slate-400 font-mono text-sm">→</span>
        </div>
      ))}
    </section>
  );
}

export default KnowledgeFeed;
