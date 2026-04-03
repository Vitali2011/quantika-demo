import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DraftQuoteCard } from '@/components/request/draft-quote-card';
import { MapPin, Package, Weight, Ship, Calendar, FileText, AlertTriangle, ChevronLeft } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RequestDetailPage({ params }: Props) {
  const { id } = await params;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/');

  const session = getSession(sessionId);
  if (!session) redirect('/');

  const email = session.emails.find(e => e.id === id);
  if (!email) notFound();

  const parsed = session.parsedRequests.find(r => r.emailId === id);

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link href="/dashboard" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </Link>

        <div>
          <Badge variant="secondary">RATE REQUEST</Badge>
          <h1 className="text-xl font-bold mt-2">{email.subject}</h1>
          <p className="text-sm text-muted-foreground">
            From: {email.from} · {formatDate(email.date)}
          </p>
        </div>

        {/* Original email */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Original Email</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap font-sans text-foreground">{email.body || email.snippet}</pre>
          </CardContent>
        </Card>

        {/* AI Analysis */}
        {parsed && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">AI Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {parsed.originPort && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Origin:</span> {parsed.originPort}{parsed.originCountry ? `, ${parsed.originCountry}` : ''}
                  </div>
                )}
                {parsed.destinationPort && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Destination:</span> {parsed.destinationPort}{parsed.destinationCountry ? `, ${parsed.destinationCountry}` : ''}
                  </div>
                )}
                {parsed.cargoDescription && (
                  <div className="flex items-center gap-2 text-sm">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Cargo:</span> {parsed.cargoDescription}
                  </div>
                )}
                {parsed.weightMt && (
                  <div className="flex items-center gap-2 text-sm">
                    <Weight className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Weight:</span> {parsed.weightMt} MT
                  </div>
                )}
                {parsed.cargoType && (
                  <div className="flex items-center gap-2 text-sm">
                    <Ship className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Type:</span> {parsed.cargoType}
                  </div>
                )}
                {parsed.preferredDates && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Dates:</span> {parsed.preferredDates}
                  </div>
                )}
                {parsed.incoterms && (
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Terms:</span> {parsed.incoterms}
                  </div>
                )}
              </div>

              {parsed.missingInfo.length > 0 && (
                <Alert className="mt-4 border-yellow-200 bg-yellow-50">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <AlertDescription>
                    <strong>⚠️ Missing info:</strong>
                    <ul className="mt-1 list-disc list-inside text-sm">
                      {parsed.missingInfo.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Draft actions */}
        <DraftQuoteCard emailId={id} />
      </div>
    </main>
  );
}
