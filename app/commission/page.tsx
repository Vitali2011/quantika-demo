import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { formatNumber } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronLeft, AlertTriangle } from 'lucide-react';

export default async function CommissionPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/');
  const session = getSession(sessionId);
  if (!session) redirect('/');

  const { commissionSummary } = session;

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href="/dashboard" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </Link>

        <h1 className="text-2xl font-bold">💰 YOUR COMMISSION SUMMARY</h1>

        {(!commissionSummary || commissionSummary.details.length === 0) && (
          <p className="text-muted-foreground">No commission data found. Commission is calculated from fixture recaps.</p>
        )}

        {commissionSummary && commissionSummary.details.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">
              From {commissionSummary.details.length} fixture {commissionSummary.details.length === 1 ? 'recap' : 'recaps'} with commission data:
            </p>

            <Card>
              <CardContent className="pt-6 space-y-4">
                {commissionSummary.details.map((d, i) => (
                  <div key={i} className="flex justify-between items-start py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium">{d.vesselName}</p>
                      <p className="text-xs text-muted-foreground">{d.route}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {d.commissionPercent}% × {d.freightCurrency} {formatNumber(d.freightAmount)}
                      </p>
                      <p className="text-sm font-bold text-green-700">
                        = {d.commissionCurrency} {formatNumber(d.commissionAmount)}
                      </p>
                    </div>
                  </div>
                ))}

                <div className="pt-3 border-t-2 border-gray-300">
                  <div className="flex justify-between text-base font-bold">
                    <span>TOTAL</span>
                    <span>
                      {commissionSummary.totalByCurrency.map((t, i) => (
                        <span key={i}>
                          {i > 0 ? ' + ' : ''}
                          ~{t.currency === 'EUR' ? '€' : '$'}{formatNumber(t.amount)}
                        </span>
                      ))}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-gray-100 rounded p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Estimates based on parsed data. Verify against original documents.</span>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
