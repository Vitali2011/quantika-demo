/**
 * PSC Detention History Page
 *
 * Displays PSC inspection history for a vessel by IMO.
 * Behind NEXT_PUBLIC_PSC_DETENTION_ENABLED flag.
 */

'use client';

import { use, useEffect, useState } from 'react';

interface PscRecord {
  id: string;
  imo: string;
  inspection_date: string; // YYYY-MM-DD
  port: string | null;
  authority: 'paris-mou' | 'tokyo-mou' | 'uscg' | 'other';
  deficiencies: number;
  detained: boolean;
  source_url: string | null;
}

interface Props {
  params: Promise<{ imo: string }>;
}

export default function PscHistoryPage({ params }: Props) {
  const { imo } = use(params);
  const [records, setRecords] = useState<PscRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      if (process.env.NEXT_PUBLIC_PSC_DETENTION_ENABLED !== 'true') {
        setError('PSC detention history not available');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/vessels/${imo}/psc-history`);
        if (!response.ok) {
          throw new Error('Failed to fetch PSC history');
        }
        const data = await response.json();
        setRecords(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [imo]);

  if (process.env.NEXT_PUBLIC_PSC_DETENTION_ENABLED !== 'true') {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">🔒</div>
          <h1 className="text-xl font-bold text-gray-900">Feature Not Enabled</h1>
          <p className="text-sm text-gray-500">
            PSC detention history not available. Contact your administrator to enable
            NEXT_PUBLIC_PSC_DETENTION_ENABLED.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center gap-3">
          <h1 className="text-2xl font-bold">PSC Detention History</h1>
          <span
            data-testid="demo-data-badge"
            className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200"
          >
            Demo data
          </span>
        </div>
        <p className="mb-4 text-sm text-gray-500">IMO: {imo}</p>

        {loading && <p className="text-gray-500">Loading...</p>}

        {!loading && error && (
          <div className="rounded border border-red-200 bg-red-50 p-4 text-red-800">
            Error: {error}
          </div>
        )}

        {!loading && !error && records.length === 0 && (
          <p className="text-gray-500">No inspection records found.</p>
        )}

        {!loading && !error && records.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border border-gray-200 rounded-lg">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                    Port
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                    Authority
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                    Deficiencies
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                    Detained
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {record.inspection_date}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {record.port || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {record.authority}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {record.deficiencies}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {record.detained ? (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                          Detained
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                          Not Detained
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
