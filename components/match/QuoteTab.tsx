'use client';

import { useState } from 'react';
import { ConfidenceBadge } from './ConfidenceBadge';
import type { MatchConfidence } from '@/lib/confidence';
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

  // Sync generated draft into textarea without useEffect (derived-state pattern)
  if (hookDraft !== prevHookDraft) {
    setPrevHookDraft(hookDraft);
    setDraft(hookDraft);
  }

  const generating = state === 'queued' || state === 'processing';

  return (
    <div data-testid="tab-quote" className="flex flex-col gap-2 text-sm">
      {confidence && (
        <ConfidenceBadge level={confidence.level} />
      )}

      <div className="flex flex-col flex-1 gap-2">
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
          className="w-full flex-1 rounded border border-gray-200 p-3 text-sm resize-y min-h-[120px]"
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
    </div>
  );
}
