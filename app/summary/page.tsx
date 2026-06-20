import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { getStore } from '@/lib/session-store';
import { countQualifyingMatches } from '@/lib/matching/count-qualifying';
import { Card, Button } from '@/design-system/primitives';
import {
  MINUTES_SAVED_PER_RATE_REQUEST,
  MINUTES_SAVED_PER_RECAP,
  MINUTES_SAVED_PER_MATCHING,
  CALENDLY_URL,
} from '@/lib/constants';
import { Lock, MessageCircle, ChevronLeft } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { currencySymbol } from '@/lib/currency';

export default async function SummaryPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/');
  const session = getSession(sessionId);
  if (!session) redirect('/');

  const { parsedCargos, parsedVessels, parsedFixtureRecaps, matches, recaps, commissionSummary, processedEmails, emails } = session;

  const db = getStore().getDatabase();
  const qualifyingMatchCount = countQualifyingMatches(db, { user_id: sessionId });

  const unanswered = processedEmails.filter(p => p.status === 'NEEDS_ACTION').length;
  const documents = processedEmails.filter(p => p.type === 'DOCUMENT').length;

  const minSaved =
    parsedCargos.length * MINUTES_SAVED_PER_RATE_REQUEST +
    recaps.length * MINUTES_SAVED_PER_RECAP +
    qualifyingMatchCount * MINUTES_SAVED_PER_MATCHING;
  const hoursSaved = (minSaved / 60).toFixed(1);

  const commissionTotal = commissionSummary?.totalByCurrency
    .map(t => `${currencySymbol(t.currency)}${formatNumber(t.amount)}`)
    .join(' + ') || '$0';

  return (
    <main className="min-h-screen bg-ds-bg py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href="/dashboard" className="flex items-center gap-1 text-sm text-ds-text-muted hover:text-ds-text transition-colors duration-ds-fast mb-4">
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-center text-ds-text">Your Results</h1>
        <p className="text-center text-ds-text-muted">In your last {emails.length} emails, Quantika found:</p>

        {/* Metrics */}
        <Card padding="lg">
          <div className="space-y-2">
            <Link href="/dashboard" className="flex justify-between text-sm hover:underline cursor-pointer text-ds-text">
              <span>📬 Cargo inquiries parsed</span>
              <strong>{parsedCargos.length} items</strong>
            </Link>
            <Link href="/dashboard" className="flex justify-between text-sm hover:underline cursor-pointer text-ds-text">
              <span>🚢 Vessel positions parsed</span>
              <strong>{parsedVessels.length} items</strong>
            </Link>
            <Link href="/dashboard" className="flex justify-between text-sm hover:underline cursor-pointer text-ds-text">
              <span>📋 Fixture recaps extracted</span>
              <strong>{parsedFixtureRecaps.length}</strong>
            </Link>
            <Link href="/dashboard" className="flex justify-between text-sm hover:underline cursor-pointer text-ds-text">
              <span>🔗 Qualifying matches (fit ≥60%)</span>
              <strong>{qualifyingMatchCount}</strong>
            </Link>
            <div className="flex justify-between text-sm text-ds-text">
              <span>⚠️ Unanswered for more than 48 hours</span>
              <strong>{unanswered}</strong>
            </div>
            <Link href="/dashboard" className="flex justify-between text-sm hover:underline cursor-pointer text-ds-text">
              <span>📝 Negotiations with auto-recap ready</span>
              <strong>{recaps.length}</strong>
            </Link>
            <div className="flex justify-between text-sm text-ds-text">
              <span>📄 Documents auto-tagged</span>
              <strong>{documents}</strong>
            </div>
            <Link href="/commission" className="flex justify-between text-sm hover:underline cursor-pointer font-medium text-ds-text">
              <span>💰 Commission</span>
              <strong>{commissionTotal}</strong>
            </Link>
          </div>
        </Card>

        {/* Impact */}
        <Card padding="lg">
          <h2 className="text-base font-semibold text-ds-text mb-3">💰 Estimated impact</h2>
          <div className="space-y-3 text-sm">
            {qualifyingMatchCount > 0 && (
              <p>
                <strong className="text-ds-text">{qualifyingMatchCount} qualifying {qualifyingMatchCount === 1 ? 'match' : 'matches'} found automatically</strong>
                <br /><span className="text-ds-text-muted">normally takes 2-4 hours of manual search</span>
              </p>
            )}
            {parsedFixtureRecaps.length > 0 && (
              <p>
                <strong className="text-ds-text">{parsedFixtureRecaps.length} {parsedFixtureRecaps.length === 1 ? 'recap' : 'recaps'} parsed in seconds</strong>
                <br /><span className="text-ds-text-muted">normally 30-40 min each to compile manually</span>
              </p>
            )}
            {commissionSummary && commissionSummary.details.length > 0 && (
              <p>
                <strong className="text-ds-text">Commission calculated automatically from {commissionSummary.details.length} fixture {commissionSummary.details.length === 1 ? 'recap' : 'recaps'}</strong>
              </p>
            )}
            <p>
              <strong className="text-ds-text">~{hoursSaved} hours/day saved</strong>
              <br /><span className="text-ds-text-muted">on email triage + matching</span>
            </p>
          </div>
        </Card>

        {/* CTA */}
        <Card padding="lg" className="border-ds-accent/20 bg-ds-accent-soft/30 text-center">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-ds-text">Want this for your team every day?</h2>
            <p className="text-sm text-ds-text-muted">
              We build custom AI email solutions for freight forwarders — integrated with your TMS and workflow.
            </p>
            <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="gap-2">
                <MessageCircle className="h-4 w-4" />
                Book a Call with Our Team
              </Button>
            </a>
          </div>
        </Card>

        {/* Security note */}
        <div className="flex items-center justify-center gap-2 text-sm text-ds-text-muted">
          <Lock className="h-4 w-4" />
          <span>Your email data has been deleted from our servers.</span>
        </div>

        <div className="text-center space-x-3">
          <Link href="/">
            <Button variant="ghost" size="sm">Start a new demo →</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
