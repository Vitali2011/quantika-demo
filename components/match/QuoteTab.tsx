'use client';

import { useState, useEffect } from 'react';
import AuditTrail from '@/components/audit-trail';
import { ConfidenceBadge } from './ConfidenceBadge';
import type { MatchConfidence } from '@/lib/confidence';
import type { MarketBenchmark } from '@/lib/types';
import { formatBenchmarkReference } from '@/lib/market/benchmark';
import { useToast } from '@/components/ui/toast';
import { useQuoteJob } from '@/lib/quote-jobs/use-quote-job';

interface QuoteTabProps {
  cargoEmailId?: string;
  confidence?: MatchConfidence;
  matchId?: string;
}

export function QuoteTab({ cargoEmailId, confidence, matchId }: QuoteTabProps) {
  const toast = useToast();
  const { state, draft: hookDraft, error: hookError, start, retry } =
    useQuoteJob(cargoEmailId, (msg) => toast.error(msg), matchId);
  const [draft, setDraft] = useState('');
  const [prevHookDraft, setPrevHookDraft] = useState('');
  const [benchmark, setBenchmark] = useState<MarketBenchmark | null | 'loading'>('loading');

  // Sync generated draft into textarea without useEffect (derived-state pattern)
  if (hookDraft !== prevHookDraft) {
    setPrevHookDraft(hookDraft);
    setDraft(hookDraft);
  }

  const generating = state === 'queued' || state === 'processing';

  useEffect(() => {
    fetch('/api/market/benchmark?indicator=TOEPFER_TMI')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: MarketBenchmark | null) => setBenchmark(data))
      .catch(() => setBenchmark(null));
  }, []);

  return (
    <div data-testid="tab-quote" className="space-y-4 text-sm">
      {confidence && (
        <ConfidenceBadge level={confidence.level} />
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="block text-xs font-medium text-gray-600">Draft Quote</label>
          <button
            onClick={start}
            disabled={generating || !cargoEmailId}
            className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Generate'}
          </button>
          {state === 'error' && (
            <button
              onClick={retry}
              className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700 hover:bg-red-100"
            >
              Retry
            </button>
          )}
        </div>
        {hookError && state === 'error' && (
          <p className="text-xs text-red-600">{hookError}</p>
        )}
        <textarea
          className="w-full rounded border border-gray-200 p-3 text-sm resize-y min-h-[120px]"
          placeholder="Click Generate to create an AI draft quote…"
          value={draft}
          onChange={e => setDraft(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          disabled
          title="Not available in demo"
        >
          Send Quote
        </button>
        <button
          className="rounded border border-gray-200 px-4 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          disabled
          title="Not available in demo"
        >
          Save Draft
        </button>
      </div>

      <div className="border-t pt-4 space-y-1">
        <p className="text-xs font-medium text-gray-500">📊 Benchmark</p>
        <hr className="border-gray-200" />
        {benchmark === 'loading' ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : benchmark ? (
          <>
            <p className="text-xs text-gray-700">{formatBenchmarkReference(benchmark)}</p>
            {benchmark.sourceUrl.startsWith('http') && (
              <a
                href={benchmark.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 underline"
              >
                source
              </a>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-400">📊 Benchmark unavailable</p>
        )}
      </div>

      {cargoEmailId && (
        <div className="border-t pt-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Audit Trail</p>
          <AuditTrail inquiryId={cargoEmailId} />
        </div>
      )}
    </div>
  );
}
