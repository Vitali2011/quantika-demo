import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getStore } from '@/lib/session-store';
import { listMatches } from '@/lib/matching/matches-repository';
import MatchesClient from './MatchesClient';

export const metadata: Metadata = {
  title: 'Your Recent Matches — Quantika',
};

export default async function MatchesPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/');
  const session = getSession(sessionId);
  if (!session) redirect('/');

  if (process.env.MATCHES_ENABLED !== "true") redirect('/');

  const db = getStore().getDatabase();
  const matches = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Your Recent Matches</h1>
        <MatchesClient initialMatches={matches} />
      </div>
    </main>
  );
}
