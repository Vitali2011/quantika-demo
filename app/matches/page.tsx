import type { Metadata } from 'next';
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getStore } from '@/lib/session-store';
import { listMatches } from '@/lib/matching/matches-repository';
import { persistSessionMatches } from '@/lib/matching/persist-session-matches';
import MatchesClient from './MatchesClient';
import PageSkeleton from '@/components/ui/PageSkeleton';

export const metadata: Metadata = {
  title: 'Matches — Quantika',
};

export default async function MatchesPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/');
  const session = getSession(sessionId);
  if (!session) redirect('/');

  if (process.env.MATCHES_ENABLED !== "true" && !session.isSampleData) redirect('/');

  const db = getStore().getDatabase();

  if (session.matches.length > 0) {
    persistSessionMatches(db, sessionId, session.matches, session.parsedCargos, session.parsedVessels);
  }
  const matches = listMatches(db, { user_id: sessionId, sortBy: 'score', sortDir: 'desc' });

  // Computing only when BOTH cargo and vessel are present — matches require both sides.
  const hasCargo = session.parsedCargos.length > 0;
  const hasVessel = session.parsedVessels.length > 0;
  const isComputing = hasCargo && hasVessel && matches.length === 0;

  const cargoEmailIds = session.parsedCargos.map((c) => c.emailId);
  const vesselEmailIds = session.parsedVessels.map((v) => v.emailId);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Matches {matches.length} results</h1>
        <Suspense fallback={<PageSkeleton />}>
          <MatchesClient initialMatches={matches} isComputing={isComputing}
            cargoEmailIds={cargoEmailIds}
            vesselEmailIds={vesselEmailIds}
          />
        </Suspense>
      </div>
    </main>
  );
}
