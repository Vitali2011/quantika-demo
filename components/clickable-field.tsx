'use client';

import { SourceQuotePopover } from './source-quote-popover';

interface Props {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  confidence?: 'confirmed' | 'interpreted' | 'uncertain';
  sourceText?: string;
  emailBody?: string;
  emailDate?: string;
  emailSubject?: string;
}

function ConfIcon({ confidence }: { confidence?: string }) {
  if (confidence === 'uncertain')   return <span title="Uncertain — check original">❓</span>;
  if (confidence === 'interpreted') return <span title="AI interpreted">⚠️</span>;
  if (confidence === 'confirmed')   return <span title="Confirmed from email">✅</span>;
  return null;
}

// Valid string confidence values — guards against runtime numeric confidence
// scores (0–1) from the LLM parser being passed where strings are expected.
// A numeric confidence is truthy, so `{confidence && ...}` would render a
// Fragment containing only a space text-node, causing React #418 hydration
// mismatch on interior server-rendered pages.
const VALID_CONF = new Set(['confirmed', 'interpreted', 'uncertain']);

export function ClickableField({
  label, value, unit, confidence,
  sourceText, emailBody, emailDate, emailSubject,
}: Props) {
  const rendered = value != null ? String(value) : '';
  if (!rendered || rendered === 'NaN') return null;

  // Only render the ConfIcon when confidence is a recognised string label.
  const confStr = typeof confidence === 'string' && VALID_CONF.has(confidence)
    ? confidence
    : undefined;

  const display = (
    <>
      {rendered}{unit ? ` ${unit}` : ''}
      {confStr ? <> <ConfIcon confidence={confStr} /></> : null}
    </>
  );

  const hasPopover = !!(sourceText && emailBody && emailDate && emailSubject);

  return (
    <div className="flex justify-between text-sm py-1 border-b border-gray-100">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">
        {hasPopover ? (
          <SourceQuotePopover
            sourceText={sourceText!}
            emailBody={emailBody!}
            emailDate={emailDate!}
            emailSubject={emailSubject!}
            confidence={confidence ?? 'confirmed'}
            label={label}
          >
            {display}
          </SourceQuotePopover>
        ) : display}
      </span>
    </div>
  );
}
