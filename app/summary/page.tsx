import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  REVENUE_PER_UNANSWERED,
  REVENUE_PER_UNANSWERED_HIGH,
  MINUTES_SAVED_PER_RATE_REQUEST,
  MINUTES_SAVED_PER_RECAP,
  CALENDLY_URL,
  UNANSWERED_THRESHOLD_DAYS,
} from '@/lib/constants';
import { Lock, Phone } from 'lucide-react';

export default async function SummaryPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/');

  const session = getSession(sessionId);
  if (!session) redirect('/');

  const { classifications, recaps } = session;

  const totalRateRequests = classifications.filter(c => c.category === 'RATE_REQUEST').length;
  const unanswered = classifications.filter(
    c => c.category === 'RATE_REQUEST' && c.isUnanswered && (c.daysWithoutReply ?? 0) >= UNANSWERED_THRESHOLD_DAYS
  ).length;
  const documents = classifications.filter(c => c.category === 'DOCUMENT').length;
  const carrierUpdates = classifications.filter(c => c.category === 'CARRIER_UPDATE').length;

  const lostRevLow = unanswered * REVENUE_PER_UNANSWERED;
  const lostRevHigh = unanswered * REVENUE_PER_UNANSWERED_HIGH;

  const minSaved = totalRateRequests * MINUTES_SAVED_PER_RATE_REQUEST + recaps.length * MINUTES_SAVED_PER_RECAP;
  const hoursSaved = (minSaved / 60).toFixed(1);

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-center">YOUR RESULTS</h1>
        <p className="text-center text-muted-foreground">In your last {session.emails.length} emails, Quantika found:</p>

        {/* Metrics */}
        <Card>
          <CardContent className="pt-6 space-y-2">
            <p className="flex justify-between text-sm"><span>📬 Rate requests identified</span><strong>{totalRateRequests}</strong></p>
            <p className="flex justify-between text-sm"><span>⚠️ Unanswered for more than 24 hours</span><strong>{unanswered}</strong></p>
            <p className="flex justify-between text-sm"><span>📝 Negotiations with auto-recap ready</span><strong>{recaps.length}</strong></p>
            <p className="flex justify-between text-sm"><span>📄 Documents auto-tagged</span><strong>{documents}</strong></p>
            <p className="flex justify-between text-sm"><span>🟠 Carrier updates classified</span><strong>{carrierUpdates}</strong></p>
          </CardContent>
        </Card>

        {/* Impact */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">💰 Estimated impact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {unanswered > 0 && (
              <p>
                <strong>{unanswered} unanswered {unanswered === 1 ? 'quote' : 'quotes'} ≈ ${lostRevLow.toLocaleString()}–${lostRevHigh.toLocaleString()}</strong>
                <br /><span className="text-muted-foreground">in potentially lost revenue</span>
              </p>
            )}
            <p>
              <strong>~{hoursSaved} hours/day saved</strong>
              <br /><span className="text-muted-foreground">on email classification &amp; recap</span>
            </p>
            {recaps.length > 0 && (
              <p>
                <strong>{recaps.length} negotiation {recaps.length === 1 ? 'recap' : 'recaps'} generated automatically</strong>
                <br /><span className="text-muted-foreground">(normally 30–40 min each)</span>
              </p>
            )}
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
                <Phone className="h-4 w-4" />
                Book a Call with Our Team
              </Button>
            </a>
          </CardContent>
        </Card>

        {/* Security note */}
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />
          <span>Your email data will be automatically deleted from our servers within 1 hour.</span>
        </div>

        <div className="text-center">
          <Link href="/">
            <Button variant="ghost" size="sm">Start a new demo →</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
