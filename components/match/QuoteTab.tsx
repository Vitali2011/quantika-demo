'use client';

import { useState } from 'react';
import AuditTrail from '@/components/audit-trail';
import { ConfidenceBadge } from './ConfidenceBadge';
import type { MatchConfidence } from '@/lib/confidence';

interface QuoteTabProps {
  cargoEmailId?: string;
  confidence?: MatchConfidence;
}

export function QuoteTab({ cargoEmailId, confidence }: QuoteTabProps) {
  const [draft, setDraft] = useState('');
  const blockSend = confidence?.blockSend ?? false;
  const blockedFields = confidence?.blockedFields ?? [];

  return (
    <div data-testid="tab-quote" className="space-y-4 text-sm">
      {confidence && (
        <ConfidenceBadge level={confidence.level} />
      )}

      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-600">Draft Quote</label>
        <textarea
          className="w-full rounded border border-gray-200 p-3 text-sm resize-y min-h-[120px]"
          placeholder="Draft quote text will appear here…"
          value={draft}
          onChange={e => setDraft(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={blockSend}
          title={blockSend ? `${blockedFields.length} critical field(s) uncertain: ${blockedFields.join(', ')}` : undefined}
        >
          Send Quote
        </button>
        <button className="rounded border border-gray-200 px-4 py-2 text-sm">
          Save Draft
        </button>
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
