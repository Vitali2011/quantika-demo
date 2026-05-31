import type { ParsedVessel } from '@/lib/types';

interface PassportTabProps {
  vessel?: ParsedVessel;
}

interface CheckRow {
  label: string;
  value: string | null | undefined;
  missing?: boolean;
}

function DemoDataBadge() {
  return (
    <span
      data-testid="passport-demo-badge"
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300"
    >
      Demo data
    </span>
  );
}

export function PassportTab({ vessel }: PassportTabProps) {
  if (!vessel) {
    return (
      <div data-testid="tab-passport" className="text-sm text-gray-500">
        <div className="mb-2">
          <DemoDataBadge />
        </div>
        No vessel data available.
      </div>
    );
  }

  const rows: CheckRow[] = [
    { label: 'Flag', value: vessel.flag },
    { label: 'Class Society', value: vessel.classSociety },
    { label: 'P&I Club', value: vessel.pandi },
    { label: 'Restrictions', value: vessel.restrictions?.length ? vessel.restrictions.join(', ') : null },
    { label: 'Last Cargoes', value: vessel.lastCargoes },
  ];

  return (
    <div data-testid="tab-passport" className="space-y-2 text-sm">
      <div className="mb-2">
        <DemoDataBadge />
      </div>
      <div className="divide-y">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex justify-between py-2">
            <span className="text-gray-500">{label}</span>
            {value ? (
              <span className="font-medium text-right max-w-xs">{value}</span>
            ) : (
              <span className="text-gray-300 italic">—</span>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 pt-2 border-t">
        Full certificate checks (ISM, MLC, AIS) — coming in spec-11.
      </p>
    </div>
  );
}
