'use client';

import { useState } from 'react';

interface PscRecord {
  inspection_date: string;
  port: string | null;
  authority: 'paris-mou' | 'tokyo-mou' | 'uscg' | 'other';
  deficiencies: number;
  detained: boolean;
}

const isValidImo = (imo: string) => /^\d{7}$/.test(imo);

export function PscSearchForm() {
  const [imo, setImo] = useState('');
  const [results, setResults] = useState<PscRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchedImo, setSearchedImo] = useState('');

  const flagEnabled = process.env.NEXT_PUBLIC_PSC_DETENTION_ENABLED === 'true';

  if (!flagEnabled) {
    return (
      <div className="rounded border border-gray-200 bg-gray-50 p-6 text-center">
        <p className="text-gray-500">PSC Search not available</p>
        <p className="mt-1 text-sm text-gray-400">
          Contact your administrator to enable NEXT_PUBLIC_PSC_DETENTION_ENABLED.
        </p>
      </div>
    );
  }

  const handleSearch = async () => {
    if (!isValidImo(imo)) {
      setError('IMO must be exactly 7 digits');
      return;
    }
    setError('');
    setLoading(true);
    setSearchedImo(imo);
    try {
      const res = await fetch(`/api/vessels/${imo}/psc-history`);
      setResults(res.ok ? await res.json() : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); handleSearch(); }}>
        <input
          type="text"
          value={imo}
          onChange={(e) => setImo(e.target.value)}
          placeholder="Enter IMO number (7 digits)"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          aria-label="IMO number"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 touch-target"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {loading && (
        <p className="text-sm text-gray-500">Loading…</p>
      )}

      {!loading && results !== null && (
        <>
          {results.length === 0 ? (
            <p className="text-gray-500">
              No PSC inspections found for IMO {searchedImo}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-200 bg-white">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      Inspection Date
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
                  {results.map((record, index) => (
                    <tr
                      key={`${record.inspection_date}-${index}`}
                      className="border-b border-gray-200 hover:bg-gray-50"
                    >
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
                            Clear
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
