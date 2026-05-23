'use client';

import { Popover } from '@base-ui/react/popover';

interface Props {
  children: React.ReactNode;
  sourceText: string;
  emailBody: string;
  emailDate: string;
  emailSubject: string;
  confidence: 'confirmed' | 'interpreted' | 'uncertain';
  label: string;
}

// Exported for unit testing
export function getContextSnippet(body: string, sourceText: string): string {
  if (!body || !sourceText) return body ?? '';
  const lines = body.split('\n');
  const matchIdx = lines.findIndex(line => line.includes(sourceText));
  if (matchIdx === -1) return body.slice(0, 300);
  const start = Math.max(0, matchIdx - 1);
  const end = Math.min(lines.length - 1, matchIdx + 1);
  return lines.slice(start, end + 1).join('\n');
}

const CONF_META = {
  confirmed:   { badge: '✅ Confirmed',   text: 'Explicitly stated in the original email.' },
  interpreted: { badge: '⚠️ Interpreted', text: 'Inferred from abbreviations or context — verify before use.' },
  uncertain:   { badge: '❓ Uncertain',   text: 'Possible interpretation — check the original email.' },
};

export function SourceQuotePopover({
  children, sourceText, emailBody, emailDate, emailSubject, confidence, label,
}: Props) {
  const snippet = getContextSnippet(emailBody, sourceText);
  const meta = CONF_META[confidence] ?? CONF_META.confirmed;
  const parts = snippet.split(sourceText);

  return (
    <Popover.Root>
      <Popover.Trigger render={
        <span className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-blue-600 transition-colors" />
      }>
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8}>
          <Popover.Popup className="z-50 w-80 rounded-lg border border-gray-200 bg-white shadow-xl p-4 text-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-800">{label}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{meta.badge}</span>
            </div>
            <div className="rounded bg-gray-50 border border-gray-200 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {parts.map((part, i) => (
                <span key={i}>
                  {part}
                  {i < parts.length - 1 && (
                    <mark className="bg-yellow-200 rounded px-0.5">{sourceText}</mark>
                  )}
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-500 italic">{meta.text}</p>
            <div className="border-t pt-2 text-xs text-gray-400 space-y-0.5">
              <p>Date: {new Date(emailDate).toLocaleDateString('en-US', { timeZone: 'UTC' })}</p>
              <p className="truncate">Subject: {emailSubject}</p>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
