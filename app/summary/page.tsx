import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  MINUTES_SAVED_PER_RATE_REQUEST,
  MINUTES_SAVED_PER_RECAP,
  MINUTES_SAVED_PER_MATCHING,
  CALENDLY_URL,
} from '@/lib/constants';
import { Lock, MessageCircle, ChevronLeft } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

export default async function SummaryPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/');
  const session = getSession(sessionId);
  if (!session) redirect('/');

  const { parsedCargos, parsedVessels, parsedFixtureRecaps, matches, recaps, commissionSummary, processedEmails, emails } = session;

  const unanswered = processedEmails.filter(p => p.status === 'NEEDS_ACTION').length;
  const documents = processedEmails.filter(p => p.type === 'DOCUMENT').length;

  const minSaved =
    parsedCargos.length * MINUTES_SAVED_PER_RATE_REQUEST +
    recaps.length * MINUTES_SAVED_PER_RECAP +
    matches.length * MINUTES_SAVED_PER_MATCHING;
  const hoursSaved = (minSaved / 60).toFixed(1);

  const commissionTotal = commissionSummary?.totalByCurrency
    .map(t => `${t.currency === 'EUR' ? '€' : '$'}${formatNumber(t.amount)}`)
    .join(' + ') || '$0';

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href="/dashboard" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-center">YOUR RESULTS</h1>
        <p className="text-center text-muted-foreground">In your last {emails.length} emails, Quantika found:</p>

        {/* Metrics */}
        <Card>
          <CardContent className="pt-6 space-y-2">
            <Link href="/dashboard" className="flex justify-between text-sm hover:underline cursor-pointer">
              <span>📬 Cargo inquiries parsed</span>
              <strong>{parsedCargos.length} items</strong>
            </Link>
            <Link href="/dashboard" className="flex justify-between text-sm hover:underline cursor-pointer">
              <span>🚢 Vessel positions parsed</span>
              <strong>{parsedVessels.length} items</strong>
            </Link>
            <Link href="/dashboard" className="flex justify-between text-sm hover:underline cursor-pointer">
              <span>📋 Fixture recaps extracted</span>
              <strong>{parsedFixtureRecaps.length}</strong>
            </Link>
            <Link href="/dashboard" className="flex justify-between text-sm hover:underline cursor-pointer">
              <span>🔗 Cargo-vessel matches identified</span>
              <strong>{matches.length}</strong>
            </Link>
            <div className="flex justify-between text-sm">
              <span>⚠️ Unanswered for more than 48 hours</span>
              <strong>{unanswered}</strong>
            </div>
            <Link href="/dashboard" className="flex justify-between text-sm hover:underline cursor-pointer">
              <span>📝 Negotiations with auto-recap ready</span>
              <strong>{recaps.length}</strong>
            </Link>
            <div className="flex justify-between text-sm">
              <span>📄 Documents auto-tagged</span>
              <strong>{documents}</strong>
            </div>
            <Link href="/commission" className="flex justify-between text-sm hover:underline cursor-pointer font-medium">
              <span>💰 Commission</span>
              <strong>{commissionTotal}</strong>
            </Link>
          </CardContent>
        </Card>

        {/* Impact */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">💰 Estimated impact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {matches.length > 0 && (
              <p>
                <strong>{matches.length} {matches.length === 1 ? 'match' : 'matches'} found automatically</strong>
                <br /><span className="text-muted-foreground">normally takes 2-4 hours of manual search</span>
              </p>
            )}
            {parsedFixtureRecaps.length > 0 && (
              <p>
                <strong>{parsedFixtureRecaps.length} {parsedFixtureRecaps.length === 1 ? 'recap' : 'recaps'} parsed in seconds</strong>
                <br /><span className="text-muted-foreground">normally 30-40 min each to compile manually</span>
              </p>
            )}
            {commissionSummary && commissionSummary.details.length > 0 && (
              <p>
                <strong>Commission calculated automatically from {commissionSummary.details.length} fixture {commissionSummary.details.length === 1 ? 'recap' : 'recaps'}</strong>
              </p>
            )}
            <p>
              <strong>~{hoursSaved} hours/day saved</strong>
              <br /><span className="text-muted-foreground">on email triage + matching</span>
            </p>
          </CardContent>
        </Card>

        {/* CTA */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6 text-center space-y-4">
            <h2 className="text-lg font-semibold">Want this for your team every day?</h2>
            <p className="text-sm text-muted-foreground">
              We build custom AI email solutions for freight forwarders — integrated with your TMS and workflow.
            </p>
            <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="gap-2">
                <MessageCircle className="h-4 w-4" />
                Book a Call with Our Team
              </Button>
            </a>
          </CardContent>
        </Card>

        {/* Security note */}
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
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
