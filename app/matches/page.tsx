import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type Database from 'better-sqlite3';
import { getSession } from '@/lib/session';
import { getStore } from '@/lib/session-store';
import { listMatches, createMatch } from '@/lib/matching/matches-repository';
import type { Match } from '@/lib/types';
import MatchesClient from './MatchesClient';

export const metadata: Metadata = {
  title: 'Your Recent Matches — Quantika',
};

function persistSessionMatches(db: Database.Database, sessionId: string, sessionMatches: Match[]): void {
  for (const m of sessionMatches) {
    createMatch(db, {
      cargo_id: m.cargoEmailId,
      vessel_id: m.vesselEmailId,
      score: Math.max(0, Math.min(100, Math.round(m.score))),
      reason: m.matchReasons[0] ?? '',
      status: 'shortlist',
      user_id: sessionId,
      reason_structured: m.scoreBreakdown ? JSON.stringify(m.scoreBreakdown) : null,
    });
  }
}

export default async function MatchesPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  if (!sessionId) redirect('/');
  const session = getSession(sessionId);
  if (!session) redirect('/');

  if (process.env.MATCHES_ENABLED !== "true") redirect('/');

  const db = getStore().getDatabase();

  if (session.matches.length > 0) {
    persistSessionMatches(db, sessionId, session.matches);
  }
  const matches = listMatches(db, { user_id: sessionId, sortBy: 'score', sortDir: 'desc' });

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Your Recent Matches</h1>
        <MatchesClient initialMatches={matches} />
      </div>
    </main>
  );
}
