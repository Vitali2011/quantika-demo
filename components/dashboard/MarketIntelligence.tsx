interface KpiCard {
  label: string;
  value: string;
  unit: string;
  period: string;
}

// Static seed data — spec-14 will replace with real scrapers
const MARKET_KPIS: KpiCard[] = [
  { label: 'Toepfer TMI', value: '—', unit: 'USD/day', period: 'Loading…' },
  { label: 'Bunker Rotterdam', value: '—', unit: 'USD/t', period: 'Loading…' },
  { label: 'EUA EU ETS', value: '—', unit: 'EUR/t', period: 'Loading…' },
  { label: 'BHSI', value: '—', unit: 'index', period: 'Loading…' },
];

interface MarketIntelligenceProps {
  noActiveDeals?: boolean;
}

export function MarketIntelligence({ noActiveDeals }: MarketIntelligenceProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {MARKET_KPIS.map((kpi) => (
          <div key={kpi.label} className="p-3 bg-white rounded-lg border border-gray-200">
            <p className="text-xs text-gray-500 font-medium">{kpi.label}</p>
            <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{kpi.value}</p>
            <p className="text-xs text-gray-400">{kpi.unit} · {kpi.period}</p>
          </div>
        ))}
      </div>
      {noActiveDeals && (
        <p className="text-sm text-gray-500 text-center py-2">
          No active deals yet.{' '}
          <span className="font-medium">Forward your next inquiry via WhatsApp or Gmail extension</span>{' '}
          to get started.
        </p>
      )}
    </div>
  );
}
