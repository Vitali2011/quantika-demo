/**
 * BIMCO Clauses Search Page
 *
 * Search and browse BIMCO charter party clauses (GENCON 2022, HEAVYCON, PROJECTCON).
 * Behind NEXT_PUBLIC_BIMCO_RAG_ENABLED flag.
 *
 * Spec: gamma-09
 */

'use client';

import { useState } from 'react';
import { Badge, Card } from '@/design-system/primitives';

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

  if (process.env.NEXT_PUBLIC_BIMCO_RAG_ENABLED !== 'true') {
    return (
      <main className="min-h-screen bg-ds-bg flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">📜</div>
          <h1 className="text-xl font-bold text-ds-text">BIMCO Clauses Coming Soon</h1>
          <p className="text-sm text-ds-text-muted">
            The BIMCO charter party clauses search feature is not yet available. Check back soon!
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ds-bg p-6">
      <div className="max-w-4xl mx-auto">
        <Card padding="lg" className="mb-6">
          <h1 className="text-2xl font-bold text-ds-text mb-6">BIMCO Charter Party Clauses</h1>

          <div className="space-y-4 mb-6">
            <div>
              <label htmlFor="query" className="block text-sm font-medium text-ds-text mb-2">
                Search Query
              </label>
              <input
                id="query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="e.g., laytime, demurrage, cargo..."
                className="w-full px-4 py-2 border border-ds-border rounded-ds-md text-ds-text bg-ds-surface focus:outline-none focus:ring-2 focus:ring-ds-accent/40 focus:border-ds-accent transition-colors duration-ds-fast"
              />
            </div>

            <div>
              <label htmlFor="cp" className="block text-sm font-medium text-ds-text mb-2">
                Charter Party (optional)
              </label>
              <select
                id="cp"
                value={charterPartyFilter}
                onChange={(e) => setCharterPartyFilter(e.target.value)}
                className="w-full px-4 py-2 border border-ds-border rounded-ds-md text-ds-text bg-ds-surface focus:outline-none focus:ring-2 focus:ring-ds-accent/40 focus:border-ds-accent transition-colors duration-ds-fast"
              >
                <option value="">All Charter Parties</option>
                <option value="GENCON 2022">GENCON 2022</option>
                <option value="HEAVYCON">HEAVYCON</option>
                <option value="PROJECTCON">PROJECTCON</option>
                <option value="NYPE 1946">NYPE 1946</option>
                <option value="SHELLVOY 6">SHELLVOY 6</option>
                <option value="BALTIME">BALTIME</option>
                <option value="CONGENBILL">CONGENBILL</option>
              </select>
            </div>

            <button
              onClick={handleSearch}
              disabled={loading}
              className="w-full bg-ds-accent text-ds-accent-fg py-2 px-4 rounded-ds-md hover:bg-ds-accent/90 disabled:opacity-50 disabled:pointer-events-none font-medium transition-colors duration-ds-fast"
            >
              {loading ? 'Searching...' : 'Search Clauses'}
            </button>
          </div>

          {error && (
            <div className="bg-ds-danger-soft border border-ds-danger/20 text-ds-danger px-4 py-3 rounded-ds-md mb-4">
              <p className="text-sm">{error}</p>
            </div>
          )}
        </Card>

        {results.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-ds-text">
              {results.length} {results.length === 1 ? 'Result' : 'Results'}
            </h2>
            {results.map((result, idx) => {
              const metadata = parseMetadata(result.metadata);
              return (
                <Card key={idx} padding="lg">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {metadata && (
                        <>
                          <Badge variant="info">{metadata.charterParty}</Badge>
                          <span className="text-sm text-ds-text-muted">Clause {metadata.clauseNumber}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {metadata?.title && (
                    <h3 className="text-base font-semibold text-ds-text mb-2">{metadata.title}</h3>
                  )}
                  <p className="text-sm text-ds-text leading-relaxed">{result.content}</p>
                </Card>
              );
            })}
          </div>
        )}

        {!loading && results.length === 0 && query && (
          <Card padding="lg" className="text-center py-12">
            <div className="text-4xl mb-4">🔍</div>
            <p className="text-ds-text-muted">No clauses found matching your search.</p>
          </Card>
        )}
      </div>
    </main>
  );
}
