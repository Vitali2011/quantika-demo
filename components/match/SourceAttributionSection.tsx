'use client';

import { useState } from 'react';
import { SourceAttribution } from './SourceAttribution';
import type { ConfidenceField } from '@/lib/types';

interface AttributableField {
  label: string;
  value: ConfidenceField<unknown>;
}

interface SourceAttributionSectionProps {
  fields: AttributableField[];
  originalEmail: string;
}

/**
 * Client-side section rendered below MatchTabs on the match detail page.
 * Shows key cargo fields with a [¹] superscript button that opens a split-view
 * attribution dialog to satisfy Trust UX (spec-alpha-13).
 */
export function SourceAttributionSection({
  fields,
  originalEmail,
}: SourceAttributionSectionProps) {
  const [active, setActive] = useState<AttributableField | null>(null);
  const [expanded, setExpanded] = useState(false);

  const attributableFields = fields.filter(f => f.value.sourceText);

  if (attributableFields.length === 0) return null;

  return (
    <div className="rounded-lg border bg-white p-4 text-sm space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Source Attribution
        </p>
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-xs text-blue-500 hover:text-blue-700 underline underline-offset-2"
          aria-expanded={expanded}
        >
          {expanded ? 'Hide' : `Show sources (${attributableFields.length})`}
        </button>
      </div>

      {expanded && (
        <>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {attributableFields.map((field) => (
              <div key={field.label}>
                <span className="text-gray-500">{field.label}</span>
                <p className="font-medium">
                  {String(field.value.value)}
                  <button
                    type="button"
                    onClick={() => setActive(field)}
                    className="ms-1 text-blue-500 hover:text-blue-700 text-xs align-super"
                    title={`View source for ${field.label}`}
                    aria-label={`View source for ${field.label}`}
                  >
                    [¹]
                  </button>
                </p>
              </div>
            ))}
          </div>

          {/* Attribution dialog */}
          {active && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Source attribution for ${active.label}`}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
              onClick={() => setActive(null)}
            >
              <div
                className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 p-5 space-y-3"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">{active.label}</p>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                    onClick={() => setActive(null)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                <SourceAttribution
                  parsedField={{
                    value: active.value.value,
                    sourceQuote: active.value.sourceText,
                    originalEmail,
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
