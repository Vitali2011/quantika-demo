import Link from 'next/link';
import { Card, Badge } from '@/design-system/primitives';

interface InboxCounts {
  CARGO_INQUIRY: number;
  VESSEL_POSITION: number;
  FIXTURE_RECAP: number;
  CLIENT_REPLY: number;
  DOCUMENT: number;
  VESSEL_CERTIFICATE: number;
  TCT_REQUEST: number;
  OTHER: number;
}

interface DashboardInboxSectionProps {
  counts: InboxCounts;
  totalEmails: number;
  needsAction: number;
}

const CATEGORY_LABELS: { key: keyof InboxCounts; label: string }[] = [
  { key: 'CARGO_INQUIRY', label: 'Cargo inquiries' },
  { key: 'VESSEL_POSITION', label: 'Vessel positions' },
  { key: 'FIXTURE_RECAP', label: 'Fixture recaps' },
  { key: 'CLIENT_REPLY', label: 'Client replies' },
];

export function DashboardInboxSection({
  counts,
  totalEmails,
  needsAction,
}: DashboardInboxSectionProps) {
  const activeCategories = CATEGORY_LABELS.filter(({ key }) => counts[key] > 0);

  return (
    <section aria-labelledby="inbox-heading">
      <div className="flex items-center justify-between mb-3">
        <h2
          id="inbox-heading"
          className="text-sm font-semibold text-ds-text-muted uppercase tracking-wide"
        >
          📥 Inbox
        </h2>
        <Link
          href="/email"
          className="text-xs text-ds-text-muted hover:text-ds-text transition-colors duration-ds-fast"
        >
          Open inbox →
        </Link>
      </div>

      <Card padding="md">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-ds-text-muted">{totalEmails} emails total</p>
          {needsAction > 0 && (
            <Badge variant="warn" data-testid="inbox-needs-action">
              {needsAction} need action
            </Badge>
          )}
        </div>

        {activeCategories.length > 0 ? (
          <div className="space-y-1.5">
            {activeCategories.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-ds-text-muted">{label}</span>
                <span className="text-sm font-semibold text-ds-text tabular-nums">
                  {counts[key]}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ds-text-subtle">No categorised emails yet.</p>
        )}

        <div className="mt-3 pt-3 border-t border-ds-border">
          <Link
            href="/email"
            className="text-xs font-medium text-ds-text hover:text-ds-accent transition-colors duration-ds-fast"
          >
            View all emails →
          </Link>
        </div>
      </Card>
    </section>
  );
}
