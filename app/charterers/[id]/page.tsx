'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft } from 'lucide-react';

/**
 * Input Contract:
 * - NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED !== 'true' → show "Feature not enabled"
 * - Valid id with charterer data → show name, tier, require_lc, payment_history, notes
 * - Non-existent id → show error message
 */

interface Charterer {
  id: string;
  name: string;
  tier: 'blue-chip' | 'second' | 'weak';
  payment_history: string;
  require_lc: number;
  notes: string | null;
  created_at: string;
}

const TIER_COLORS = {
  'blue-chip': 'bg-green-100 text-green-800 border-green-300',
  second: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  weak: 'bg-red-100 text-red-800 border-red-300',
};

export default function ChartererPage() {
  const params = useParams();
  const id = params?.id as string;

  const isFeatureEnabled =
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED === 'true';

  const [charterer, setCharterer] = useState<Charterer | null>(null);
  const [loading, setLoading] = useState(isFeatureEnabled && !!id);
  const [error, setError] = useState<string | null>(
    isFeatureEnabled && !id ? 'Invalid charterer ID' : null
  );

  useEffect(() => {
    if (!isFeatureEnabled || !id) {
      return;
    }

    fetch(`/api/charterers/${id}`)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('Charterer not found');
          }
          throw new Error('Failed to load charterer');
        }
        return res.json();
      })
      .then((data) => {
        setCharterer(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id, isFeatureEnabled]);

  if (!isFeatureEnabled) {
    return (
      <main className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Feature Not Enabled</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Charterer credit tracking is not enabled. Contact your
                administrator to enable this feature.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">Loading...</p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-3xl mx-auto space-y-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
          <Card>
            <CardHeader>
              <CardTitle>Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-red-600">{error}</p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (!charterer) {
    return (
      <main className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                Charterer not found
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const paymentHistory = JSON.parse(charterer.payment_history || '[]');

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </Link>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">{charterer.name}</h1>
          <p className="text-sm text-muted-foreground">
            Charterer Credit Profile
          </p>
        </div>

        {/* Credit Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Credit Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Tier:</span>
              <Badge
                className={TIER_COLORS[charterer.tier]}
                variant="outline"
              >
                {charterer.tier.toUpperCase()}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                Letter of Credit Required:
              </span>
              <Badge
                variant={charterer.require_lc ? 'destructive' : 'secondary'}
              >
                {charterer.require_lc ? 'YES' : 'NO'}
              </Badge>
            </div>

            {charterer.notes && (
              <div>
                <span className="text-sm font-medium">Notes:</span>
                <p className="text-sm text-muted-foreground mt-1">
                  {charterer.notes}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment History Card */}
        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
          </CardHeader>
          <CardContent>
            {paymentHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No payment history recorded
              </p>
            ) : (
              <ul className="space-y-2">
                {paymentHistory.map(
                  (
                    entry: { date: string; status: string; notes?: string },
                    idx: number
                  ) => (
                    <li
                      key={idx}
                      className="border-l-2 border-gray-300 pl-3 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{entry.date}</span>
                        <Badge variant="outline">{entry.status}</Badge>
                      </div>
                      {entry.notes && (
                        <p className="text-muted-foreground text-xs mt-1">
                          {entry.notes}
                        </p>
                      )}
                    </li>
                  )
                )}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Metadata */}
        <Card>
          <CardHeader>
            <CardTitle>Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              <p>
                <span className="font-medium">ID:</span> {charterer.id}
              </p>
              <p className="mt-1">
                <span className="font-medium">Created:</span>{' '}
                {new Date(charterer.created_at).toLocaleDateString()}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
