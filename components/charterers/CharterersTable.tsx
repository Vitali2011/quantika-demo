'use client';

import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export interface Charterer {
  id: string;
  name: string;
  tier: 'blue-chip' | 'second' | 'weak';
  require_lc: number;
  notes: string | null;
}

const TIER_COLORS: Record<string, string> = {
  'blue-chip': 'bg-blue-100 text-blue-800 border-blue-300',
  second: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  weak: 'bg-red-100 text-red-800 border-red-300',
};

interface Props {
  charterers: Charterer[];
}

export function CharterersTable({ charterers }: Props) {
  if (charterers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No charterers found. Add one to get started.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left px-4 py-2 font-medium text-gray-700">Name</th>
            <th className="text-left px-4 py-2 font-medium text-gray-700">Tier</th>
            <th className="text-left px-4 py-2 font-medium text-gray-700">LC Required</th>
            <th className="text-left px-4 py-2 font-medium text-gray-700">Notes</th>
          </tr>
        </thead>
        <tbody>
          {charterers.map((c) => (
            <tr key={c.id} className="border-b hover:bg-gray-50">
              <td className="px-4 py-2">
                <Link
                  href={`/charterers/${c.id}`}
                  className="text-blue-600 hover:underline font-medium"
                >
                  {c.name}
                </Link>
              </td>
              <td className="px-4 py-2">
                <Badge className={TIER_COLORS[c.tier]} variant="outline">
                  {c.tier}
                </Badge>
              </td>
              <td className="px-4 py-2">
                {c.require_lc ? (
                  <span className="text-red-600 font-medium">Yes</span>
                ) : (
                  <span className="text-green-600">No</span>
                )}
              </td>
              <td className="px-4 py-2 text-gray-500">{c.notes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
