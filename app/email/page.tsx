import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { Card, Button } from '@/design-system/primitives';
import { formatDate } from '@/lib/utils';
import type { EmailCategory } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Email Inbox — Quantika',
};

const CATEGORY_LABELS: Record<EmailCategory, string> = {
  CARGO_INQUIRY: 'Cargo',
  VESSEL_POSITION: 'Vessel',
  FIXTURE_RECAP: 'Recap',
  CLIENT_REPLY: 'Reply',
  DOCUMENT: 'Doc',
  TCT_REQUEST: 'TCT',
  VESSEL_CERTIFICATE: 'Certificate',
  OTHER: 'Other',
};

const CATEGORY_COLORS: Record<EmailCategory, string> = {
  CARGO_INQUIRY: 'text-blue-700 bg-blue-50 border-blue-200',
  VESSEL_POSITION: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  FIXTURE_RECAP: 'text-purple-700 bg-purple-50 border-purple-200',
  CLIENT_REPLY: 'text-ds-text bg-ds-surface border-ds-border',
  DOCUMENT: 'text-ds-text-muted bg-ds-surface border-ds-border',
  TCT_REQUEST: 'text-orange-700 bg-orange-50 border-orange-200',
  VESSEL_CERTIFICATE: 'text-teal-700 bg-teal-50 border-teal-200',
  OTHER: 'text-ds-text-muted bg-ds-surface border-ds-border',
};

export default async function EmailInboxPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/');
  const session = getSession(sessionId);
  if (!session) redirect('/');

  const { emails, processedEmails } = session;

  if (emails.length === 0) {
    return (
      <main className="min-h-screen bg-ds-bg flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <div className="text-4xl">📭</div>
          <h1 className="text-xl font-bold text-ds-text">No emails yet</h1>
          <p className="text-sm text-ds-text-muted">
            Connect Gmail or upload emails to start processing freight inquiries.
          </p>
          <Link
            href="/processing"
            className="inline-flex items-center gap-2 rounded-ds-md bg-ds-accent px-5 py-2.5 text-sm font-semibold text-ds-accent-fg hover:bg-ds-accent/90 transition-colors duration-ds-fast"
          >
            Upload emails
          </Link>
        </div>
      </main>
    );
  }

  // Merge emails with their processing classification
  const processedMap = new Map(processedEmails.map((p) => [p.emailId, p]));
  const emailRows = emails.map((email) => ({
    email,
    processed: processedMap.get(email.id) ?? null,
  }));

  const needsAction = emailRows.filter((r) => r.processed?.status === 'NEEDS_ACTION');
  const rest = emailRows.filter((r) => r.processed?.status !== 'NEEDS_ACTION');
  const sorted = [...needsAction, ...rest];

  return (
    <main className="min-h-screen bg-ds-bg px-4 py-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-ds-text">Email Inbox</h1>
            <p className="text-sm text-ds-text-muted">{emails.length} emails · {needsAction.length} need action</p>
          </div>
          <Link
            href="/processing"
            className="inline-flex items-center gap-1 rounded-ds-md bg-ds-surface border border-ds-border px-3 py-1.5 text-xs font-medium text-ds-text hover:bg-ds-surface-muted transition-colors duration-ds-fast"
          >
            + Upload
          </Link>
        </div>

        {sorted.map(({ email, processed }) => {
          const isLowConfidence = processed && processed.confidence < 80;
          const category = processed?.type;

          return (
            <Card
              key={email.id}
              padding="none"
              className={isLowConfidence ? 'border-amber-300 ring-1 ring-amber-200' : ''}
            >
              <div className="p-4 space-y-3">
                {/* Header row */}
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-ds-text truncate max-w-xs">
                        {email.subject}
                      </p>
                      {category && (
                        <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-ds-sm border ${CATEGORY_COLORS[category]}`}>
                          {CATEGORY_LABELS[category]}
                        </span>
                      )}
                      {isLowConfidence && (
                        <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-ds-sm border border-amber-300 text-amber-700 bg-amber-50">
                          Low confidence {processed.confidence}%
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ds-text-muted mt-0.5">
                      {email.fromName ?? email.from} · {formatDate(email.date)}
                    </p>
                  </div>
                  {processed?.urgency === 'high' && (
                    <span className="shrink-0 text-xs font-semibold text-ds-danger px-2 py-0.5 rounded-ds-sm bg-red-50 border border-red-200">
                      Urgent
                    </span>
                  )}
                </div>

                {/* Snippet */}
                <p className="text-sm text-ds-text-muted line-clamp-2 leading-relaxed">
                  {email.snippet}
                </p>

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <Button variant="primary" size="sm" disabled>
                    Accept
                  </Button>
                  <Button variant="secondary" size="sm" disabled>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" disabled className="text-ds-danger hover:bg-red-50">
                    Reject
                  </Button>
                  <div className="flex-1" />
                  <Link
                    href={`/email/${email.id}`}
                    className="inline-flex items-center gap-1 text-xs text-ds-text-muted hover:text-ds-text transition-colors duration-ds-fast focus-visible:ring-2 focus-visible:ring-ds-accent/40 rounded-ds-sm outline-none px-2 py-1"
                    aria-label={`View original email: ${email.subject}`}
                  >
                    <span aria-hidden="true">📄</span> Original
                  </Link>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
