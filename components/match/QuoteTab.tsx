'use client';

import { useState, useRef } from 'react';
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
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync generated draft into textarea without useEffect (derived-state pattern)
  if (hookDraft !== prevHookDraft) {
    setPrevHookDraft(hookDraft);
    setDraft(hookDraft);
  }

  const generating = state === 'queued' || state === 'processing';

  async function handleCopy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
    } catch {
      // fallback for http
      const ta = document.createElement('textarea');
      ta.value = draft;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
  }

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
        <button
          onClick={handleCopy}
          disabled={!draft}
          className="self-start rounded bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
