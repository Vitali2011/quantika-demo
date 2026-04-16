'use client';

import { SourceQuotePopover } from './source-quote-popover';

interface Props {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  confidence?: 'confirmed' | 'interpreted' | 'uncertain';
  sourceText?: string;
  emailBody?: string;
  emailFrom?: string;
  emailDate?: string;
  emailSubject?: string;
}

function ConfIcon({ confidence }: { confidence?: string }) {
  if (confidence === 'uncertain')   return <span title="Uncertain — check original">❓</span>;
  if (confidence === 'interpreted') return <span title="AI interpreted">⚠️</span>;
  if (confidence === 'confirmed')   return <span title="Confirmed from email">✅</span>;
  return null;
}

export function ClickableField({
  label, value, unit, confidence,
  sourceText, emailBody, emailFrom, emailDate, emailSubject,
}: Props) {
  const rendered = value != null ? String(value) : '';
  if (!rendered || rendered === 'NaN') return null;

  const display = (
    <>
      {rendered}{unit ? ` ${unit}` : ''}
      {confidence && <> <ConfIcon confidence={confidence} /></>}
    </>
  );

  const hasPopover = !!(sourceText && emailBody && emailFrom && emailDate && emailSubject);

  return (
    <div className="flex justify-between text-sm py-1 border-b border-gray-100">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">
        {hasPopover ? (
          <SourceQuotePopover
            sourceText={sourceText!}
            emailBody={emailBody!}
            emailFrom={emailFrom!}
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
