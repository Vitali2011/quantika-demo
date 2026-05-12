/**
 * BIMCO Clauses Search Page
 *
 * Search and browse BIMCO charter party clauses (GENCON 2022, HEAVYCON, PROJECTCON).
 * Behind NEXT_PUBLIC_BIMCO_RAG_ENABLED flag.
 *
 * Spec: gamma-09
 */

'use client';

import { useEffect, useState } from 'react';

interface ClauseResult {
  content: string;
  metadata: string;
}

interface ParsedMetadata {
  charterParty: string;
  clauseNumber: string;
  title?: string;
  id?: string;
}

export default function ClausesPage() {
  const [query, setQuery] = useState('');
  const [charterPartyFilter, setCharterPartyFilter] = useState('');
  const [results, setResults] = useState<ClauseResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) {
      setError('Please enter a search query');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ q: query });
      if (charterPartyFilter) {
        params.append('cp', charterPartyFilter);
      }

      const res = await fetch(`/api/knowledge/clauses?${params.toString()}`);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      setResults(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search clauses');
    } finally {
      setLoading(false);
    }
  };

  const parseMetadata = (metadataStr: string): ParsedMetadata | null => {
    try {
      return JSON.parse(metadataStr);
    } catch {
      return null;
    }
  };

  // Feature flag check
  if (process.env.NEXT_PUBLIC_BIMCO_RAG_ENABLED !== 'true') {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">📜</div>
          <h1 className="text-xl font-bold text-gray-900">BIMCO Clauses Coming Soon</h1>
          <p className="text-sm text-gray-500">
            The BIMCO charter party clauses search feature is not yet available. Check back soon!
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">BIMCO Charter Party Clauses</h1>

          {/* Search box */}
          <div className="space-y-4 mb-6">
            <div>
              <label htmlFor="query" className="block text-sm font-medium text-gray-700 mb-2">
                Search Query
              </label>
              <input
                id="query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="e.g., laytime, demurrage, cargo..."
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Charter party filter */}
            <div>
              <label htmlFor="cp" className="block text-sm font-medium text-gray-700 mb-2">
                Charter Party (optional)
              </label>
              <select
                id="cp"
                value={charterPartyFilter}
                onChange={(e) => setCharterPartyFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Charter Parties</option>
                <option value="GENCON 2022">GENCON 2022</option>
                <option value="HEAVYCON">HEAVYCON</option>
                <option value="PROJECTCON">PROJECTCON</option>
              </select>
            </div>

            <button
              onClick={handleSearch}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Searching...' : 'Search Clauses'}
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              <p className="text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {results.length} {results.length === 1 ? 'Result' : 'Results'}
            </h2>
            {results.map((result, idx) => {
              const metadata = parseMetadata(result.metadata);
              return (
                <div key={idx} className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      {metadata && (
                        <>
                          <span className="inline-block bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded mr-2">
                            {metadata.charterParty}
                          </span>
                          <span className="text-sm text-gray-500">Clause {metadata.clauseNumber}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {metadata?.title && <h3 className="text-lg font-semibold text-gray-900 mb-2">{metadata.title}</h3>}
                  <p className="text-sm text-gray-700 leading-relaxed">{result.content}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!loading && results.length === 0 && query && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-4xl mb-4">🔍</div>
            <p className="text-gray-500">No clauses found matching your search.</p>
          </div>
        )}
      </div>
    </main>
  );
}
