interface InboxBreakdownProps {
  cargoInquiries: number;
  vesselPositions: number;
  fixtureRecaps: number;
  clientReplies: number;
  noise: number;
}

const STATS = [
  { key: 'cargoInquiries', emoji: '📦', label: 'Cargo Inquiries' },
  { key: 'vesselPositions', emoji: '🚢', label: 'Vessel Positions' },
  { key: 'fixtureRecaps', emoji: '📋', label: 'Fixture Recaps' },
  { key: 'clientReplies', emoji: '💬', label: 'Client Replies' },
  { key: 'noise', emoji: '📁', label: 'Noise' },
] as const;

export function InboxBreakdown(props: InboxBreakdownProps) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {STATS.map(({ key, emoji, label }) => (
        <div key={key} className="flex flex-col items-center p-3 bg-white rounded-lg border border-gray-200 text-center">
          <span className="text-lg">{emoji}</span>
          <span className="text-lg font-bold text-gray-900 tabular-nums">{props[key]}</span>
          <span className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</span>
        </div>
      ))}
    </div>
  );
}
