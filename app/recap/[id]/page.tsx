import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { RecapSection } from '@/components/recap/recap-section';
import { RecapActions } from '@/components/recap/recap-actions';
import { ChevronLeft, Users, Mail } from 'lucide-react';
import type { NegotiationStatus } from '@/lib/types';
import { isDemoMode } from '@/lib/demo-mode';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RecapPage({ params }: Props) {
  const { id } = await params;
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/');

  const session = getSession(sessionId);
  if (!session) {
    if (isDemoMode()) redirect(`/api/demo/rehydrate?next=/recap/${id}`);
    redirect('/');
  }

  const recap = session.recaps.find(r => r.threadId === id);
  if (!recap) notFound();

  const statuses: NegotiationStatus[] = ['AGREED', 'PENDING', 'DISAGREED'];
  const pendingPoints = recap.points.filter(p => p.status === 'PENDING');

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link href="/dashboard" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </Link>

        <div>
          <Badge variant="secondary">NEGOTIATION RECAP</Badge>
          <h1 className="text-xl font-bold mt-2">{recap.subject}</h1>
          <div className="flex gap-4 text-sm text-muted-foreground mt-1">
            <span className="flex items-center gap-1"><Mail className="h-4 w-4" /> {recap.emailCount} emails</span>
            <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {recap.participants.join(' ↔ ')}</span>
          </div>
          {recap.summary && (
            <p className="text-sm text-muted-foreground mt-2 italic">{recap.summary}</p>
          )}
        </div>

        {statuses.map(status => (
          <RecapSection
            key={status}
            status={status}
            points={recap.points.filter(p => p.status === status)}
          />
        ))}

        <RecapActions pendingPoints={pendingPoints} />
      </div>
    </main>
  );
}
