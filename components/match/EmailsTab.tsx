'use client';

interface EmailsTabProps {
  cargoEmailBody?: string | null;
  vesselEmailBody?: string | null;
  /** Optional payout condition extracted from the cargo email (Task D). */
  payoutCondition?: string | null;
}

function EmailBlock({ title, body }: { title: string; body?: string | null }) {
  return (
    <details className="rounded-md border border-ds-border" open>
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-ds-text">
        {title}
      </summary>
      {body
        ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words px-3 py-2 text-xs text-ds-text-muted font-mono">{body}</pre>
        : <p className="px-3 py-2 text-xs text-ds-text-subtle">Email body not available for this match.</p>}
    </details>
  );
}

export function EmailsTab({ cargoEmailBody, vesselEmailBody, payoutCondition }: EmailsTabProps) {
  return (
    <div data-testid="tab-emails" className="space-y-3">
      <EmailBlock title="Cargo email" body={cargoEmailBody} />
      {payoutCondition && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Payout condition</p>
          <p className="text-sm text-amber-900">{payoutCondition}</p>
        </div>
      )}
      <EmailBlock title="Vessel email" body={vesselEmailBody} />
    </div>
  );
}
