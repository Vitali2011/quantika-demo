import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getSession } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmailBodyViewer, type Highlight } from '@/components/email-body-viewer';
import type { ConfidenceField } from '@/lib/types';
import { formatDate } from '@/lib/utils';

const FIELD_COLORS: Record<string, string> = {
  originPort:         'bg-blue-200',
  destinationPort:    'bg-green-200',
  weightMt:           'bg-yellow-200',
  cargoDescription:   'bg-purple-200',
  preferredDates:     'bg-orange-200',
  laycan:             'bg-orange-100',
  freightRate:        'bg-pink-200',
  vesselName:         'bg-cyan-200',
  openPosition:       'bg-teal-200',
  openDate:           'bg-orange-200',
  dwtSummer:          'bg-yellow-200',
  dwcc:               'bg-yellow-100',
  draftMax:           'bg-yellow-100',
  commissionPercent:  'bg-red-100',
};

const FIELD_LABELS: Record<string, string> = {
  originPort:         'Origin Port',
  destinationPort:    'Destination Port',
  weightMt:           'Weight',
  cargoDescription:   'Cargo',
  preferredDates:     'Dates',
  laycan:             'Laycan',
  freightRate:        'Freight Rate',
  vesselName:         'Vessel',
  openPosition:       'Open Position',
  openDate:           'Open Date',
  dwtSummer:          'DWT',
  dwcc:               'DWCC',
  draftMax:           'Draft',
  commissionPercent:  'Commission',
};

function collectHighlights(obj: Record<string, unknown>): Highlight[] {
  return Object.entries(obj).flatMap(([key, val]) => {
    if (val !== null && typeof val === 'object' && 'sourceText' in val) {
      const f = val as ConfidenceField<unknown>;
      if (typeof f.sourceText === 'string' && f.sourceText) {
        return [{
          text: f.sourceText,
          color: FIELD_COLORS[key] ?? 'bg-gray-200',
          label: FIELD_LABELS[key] ?? key,
        }];
      }
    }
    return [];
  });
}

interface Props { params: Promise<{ id: string }> }

export default async function EmailDetailPage({ params }: Props) {
  const { id } = await params;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/');
  const session = getSession(sessionId);
  if (!session) redirect('/');
  const email = session.emails.find(e => e.id === id);
  if (!email) notFound();

  const highlights: Highlight[] = [
    ...session.parsedCargos
      .filter(c => c.emailId === id)
      .flatMap(c => collectHighlights(c as unknown as Record<string, unknown>)),
    ...session.parsedVessels
      .filter(v => v.emailId === id)
      .flatMap(v => collectHighlights(v as unknown as Record<string, unknown>)),
    ...session.parsedFixtureRecaps
      .filter(r => r.emailId === id)
      .flatMap(r => collectHighlights(r as unknown as Record<string, unknown>)),
  ];

  // Deduplicate legend entries by label
  const legendItems = Array.from(new Map(highlights.map(h => [h.label, h])).values());

  return (
    <main className="min-h-screen bg-gray-50 py-4 sm:py-8 px-3 sm:px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <Link href="/dashboard" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
        <div>
          <h1 className="text-lg font-bold">{email.subject}</h1>
          <p className="text-sm text-muted-foreground">
            From: {email.fromName ?? email.from} · {formatDate(email.date)}
          </p>
        </div>
        {legendItems.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {legendItems.map(({ color, label }) => (
              <span key={label} className={`${color} rounded px-2 py-0.5`}>{label}</span>
            ))}
          </div>
        )}
        {legendItems.length === 0 && (
          <p className="text-xs text-muted-foreground">No parsed extractions for this email yet — process it first.</p>
        )}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Email Body — Annotated</CardTitle>
          </CardHeader>
          <CardContent>
            <EmailBodyViewer body={email.body || email.snippet} highlights={highlights} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
