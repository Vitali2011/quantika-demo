/**
 * β-15: "While You Were Away" digest card.
 *
 * Morning summary that surfaces what the nightly auto-prequote pipeline
 * (β-15) and voice memo trio produced. Renders nothing when there's no
 * pending draft — the dashboard stays clean if there's nothing to action.
 */

import * as React from 'react';
import Link from 'next/link';

export interface WhileYouWereAwayCardProps {
  pendingDrafts: number;
  voiceMemosProcessed: number;
  errors: number;
  /** Path the card links to. Defaults to /dashboard/queue. */
  href?: string;
}

function plural(n: number, singular: string, pluralForm?: string): string {
  return n === 1 ? `${n} ${singular}` : `${n} ${pluralForm ?? singular + 's'}`;
}

export function WhileYouWereAwayCard(props: WhileYouWereAwayCardProps): React.ReactElement | null {
  const { pendingDrafts, voiceMemosProcessed, errors, href = '/dashboard/queue' } = props;
  if (pendingDrafts <= 0) return null;

  return (
    <section
      data-testid="wywa-card"
      className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-4"
    >
      <header className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-amber-900">While You Were Away</h2>
        <Link href={href} className="text-xs text-amber-700 hover:underline">
          Open queue →
        </Link>
      </header>
      <ul className="text-sm text-amber-900 space-y-1">
        <li>{plural(pendingDrafts, 'draft awaiting approval', 'drafts awaiting approval')}</li>
        <li>{plural(voiceMemosProcessed, 'voice memo', 'voice memos')} processed</li>
        <li>{plural(errors, 'error', 'errors')}</li>
      </ul>
    </section>
  );
}
