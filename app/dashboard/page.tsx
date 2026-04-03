import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import {
  CATEGORY_LABELS,
  UNANSWERED_THRESHOLD_DAYS,
  REVENUE_PER_UNANSWERED,
  REVENUE_PER_UNANSWERED_HIGH,
} from '@/lib/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Mail, ArrowRight } from 'lucide-react';
import type { EmailCategory } from '@/lib/types';

const CATEGORY_EMOJI: Record<EmailCategory, string> = {
  RATE_REQUEST: '🟢',
  CLIENT_REPLY: '🔵',
  DOCUMENT: '🟡',
  CARRIER_UPDATE: '🟠',
  OTHER: '⚪',
};

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/');

  const session = getSession(sessionId);
  if (!session) redirect('/');

  const { emails, classifications, recaps } = session;

  // Count by category
  const counts: Record<string, number> = {};
  for (const c of classifications) {
    counts[c.category] = (counts[c.category] || 0) + 1;
  }

  // Unanswered rate requests
  const unanswered = classifications.filter(
    c => c.category === 'RATE_REQUEST' && c.isUnanswered && (c.daysWithoutReply ?? 0) >= UNANSWERED_THRESHOLD_DAYS
  );

  const estLow = unanswered.length * REVENUE_PER_UNANSWERED;
  const estHigh = unanswered.length * REVENUE_PER_UNANSWERED_HIGH;

  // Rate request emails
  const rateRequestIds = new Set(
    classifications.filter(c => c.category === 'RATE_REQUEST').map(c => c.emailId)
  );
  const rateEmails = emails.filter(e => rateRequestIds.has(e.id));

  const categories: EmailCategory[] = ['RATE_REQUEST', 'CLIENT_REPLY', 'DOCUMENT', 'CARRIER_UPDATE', 'OTHER'];

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">YOUR INBOX — analyzed by Quantika</h1>
          <p className="text-muted-foreground text-sm mt-1">{emails.length} emails processed</p>
        </div>

        {/* Category cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {categories.map(cat => (
            <Card key={cat} className="cursor-pointer hover:shadow-md transition-shadow">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {CATEGORY_EMOJI[cat]} {CATEGORY_LABELS[cat]}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-3xl font-bold">{counts[cat] ?? 0}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Alert */}
        {unanswered.length > 0 && (
          <Alert className="border-orange-200 bg-orange-50">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            <AlertDescription>
              <strong>⚠️ {unanswered.length} rate {unanswered.length === 1 ? 'request' : 'requests'} unanswered &gt;24h</strong>
              <br />
              <span className="text-sm">
                💰 Estimated: ${estLow.toLocaleString()}–${estHigh.toLocaleString()} in pending quotes
              </span>
            </AlertDescription>
          </Alert>
        )}

        {/* Rate Requests */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rate Requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rateEmails.length === 0 && (
              <p className="text-sm text-muted-foreground">No rate requests found.</p>
            )}
            {rateEmails.map(email => {
              const cls = classifications.find(c => c.emailId === email.id);
              return (
                <Link key={email.id} href={`/request/${email.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer border">
                    <div className="flex items-center gap-3 min-w-0">
                      <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{email.from}</p>
                        <p className="text-xs text-muted-foreground truncate">{email.subject}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {cls?.isUnanswered ? (
                        <Badge variant="destructive" className="text-xs">⚠️ No reply</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">✅ Replied</Badge>
                      )}
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        {/* Negotiations */}
        {recaps.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Active Negotiations (recap ready)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No active negotiations found. Recaps are generated for email threads with 5+ messages.</p>
            </CardContent>
          </Card>
        )}
        {recaps.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Active Negotiations (recap ready)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recaps.map(recap => {
                const agreed = recap.points.filter(p => p.status === 'AGREED').length;
                return (
                  <Link key={recap.threadId} href={`/recap/${recap.threadId}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer border">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{recap.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {recap.emailCount} emails · {agreed}/{recap.points.length} terms agreed
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end">
          <Link href="/summary">
            <Button>View Summary &amp; Impact →</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
