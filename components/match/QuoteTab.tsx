'use client';

import { useState, useEffect } from 'react';
import AuditTrail from '@/components/audit-trail';
import { ConfidenceBadge } from './ConfidenceBadge';
import type { MatchConfidence } from '@/lib/confidence';
import type { MarketBenchmark } from '@/lib/types';
import { formatBenchmarkReference } from '@/lib/market/benchmark';
import { csrfFetch } from '@/lib/csrf-client';
import { useToast } from '@/components/ui/toast';
import { parseJsonResponse } from '@/lib/http/parse-json-response';

interface QuoteTabProps {
  cargoEmailId?: string;
  confidence?: MatchConfidence;
}

export function QuoteTab({ cargoEmailId, confidence }: QuoteTabProps) {
  const [draft, setDraft] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [benchmark, setBenchmark] = useState<MarketBenchmark | null | 'loading'>('loading');
  const blockSend = confidence?.blockSend ?? false;
  const blockedFields = confidence?.blockedFields ?? [];
  const toast = useToast();

  function handleSaveDraft() {
    const key = `quote_draft_${cargoEmailId ?? 'no-id'}`;
    sessionStorage.setItem(key, draft);
    toast.success('Сохранено');
  }

  function handleSendQuote() {
    toast.success('Отправлено');
  }

  async function generateDraft() {
    if (!cargoEmailId) return;
    setGenerating(true);
    setGenerateError('');
    try {
      const res = await csrfFetch('/api/ai/draft-quote', {
        method: 'POST',
        body: JSON.stringify({ emailId: cargoEmailId }),
      });
      const data = await parseJsonResponse<{ draft?: string }>(res);
      setDraft(data.draft ?? '');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate draft';
      setGenerateError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }

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
            onClick={generateDraft}
            disabled={generating || !cargoEmailId}
            className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
        {generateError && (
          <p className="text-xs text-red-600">{generateError}</p>
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
