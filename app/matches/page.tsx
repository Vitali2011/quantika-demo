import type { Metadata } from 'next';
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { isDemoMode } from '@/lib/demo-mode';
import { getStore } from '@/lib/session-store';
import { listMatches, type StoredMatch } from '@/lib/matching/matches-repository';
import { persistSessionMatches } from '@/lib/matching/persist-session-matches';
import { countQualifyingMatches } from '@/lib/matching/count-qualifying';
import { toBucketRows } from '@/lib/matching/session-buckets';
import { attachPortLimits } from '@/lib/matching/attach-port-limits';
import MatchesClient from './MatchesClient';
import { resolveLaycanDisplay } from '@/lib/utils/laycan-display';
import PageSkeleton from '@/components/ui/PageSkeleton';

export const metadata: Metadata = {
  title: 'Matches — Quantika',
};

export default async function MatchesPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  const session = sessionId ? getSession(sessionId) : null;

  if (!session) {
    if (isDemoMode()) {
      redirect('/api/demo/rehydrate?next=/matches');
    }
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">📭</div>
          <h1 className="text-xl font-bold">No emails yet</h1>
          <p className="text-sm text-gray-500">Upload emails to start finding vessel–cargo matches.</p>
          <Link href="/processing" className="inline-block px-6 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            Upload emails
          </Link>
        </div>
      </main>
    );
  }

  if (process.env.MATCHES_ENABLED === 'false' && !session.isSampleData) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-xl font-bold">Matches coming soon</h1>
          <p className="text-sm text-gray-500">This feature is not yet enabled.</p>
        </div>
      </main>
    );
  }

  const db = getStore().getDatabase();

  if (session.matches.length > 0) {
    persistSessionMatches(db, sessionId!, session.matches, session.parsedCargos, session.parsedVessels);
  }
  const rawMatches = listMatches(db, { user_id: sessionId!, sortBy: 'score', sortDir: 'desc' });
  const matches = dedupMatches(rawMatches);

  // (#665) Pre-resolve laycan_display server-side so the list shows the same
  // readiness-rebased window as /match/[id] detail when a worksheet is present.
  const refYear = new Date().getUTCFullYear();
  const matchesWithDisplay = matches.map((m) => {
    let worksheet: unknown = null;
    if (m.worksheet_json) {
      try { worksheet = JSON.parse(m.worksheet_json); } catch { worksheet = null; }
    }
    return {
      ...m,
      laycan_display: resolveLaycanDisplay({
        worksheet: worksheet as never,
        storedStart: m.laycan_start,
        storedEnd: m.laycan_end,
        cargoRaw: null,
        refYear,
      }),
    };
  });

  // Resolve live port-master draft limits server-side and attach as plain numbers,
  // so MatchesClient (a client component) never imports the 225 KB port corpus (qa-956).
  const matchesWithLimits = attachPortLimits(matchesWithDisplay);

  // Computing only when BOTH cargo and vessel are present — matches require both sides.
  const hasCargo = session.parsedCargos.length > 0;
  const hasVessel = session.parsedVessels.length > 0;
  const isComputing = hasCargo && hasVessel && matches.length === 0;

  const cargoEmailIds = session.parsedCargos.map((c) => c.emailId);
  const vesselEmailIds = session.parsedVessels.map((v) => v.emailId);

  // Realism buckets (Wave B). These live on the session as Match[] (set by
  // POST /api/ai/match) and are NOT in the matches table, so we convert them to
  // read-only StoredMatch rows here and thread them straight to the client.
  // Distinct id ranges keep the two buckets' synthetic ids from colliding.
  const lowConfidenceMatches = toBucketRows(
    session.lowConfidenceMatches ?? [],
    session.parsedCargos,
    session.parsedVessels,
    -1,
  );
  const insufficientData = toBucketRows(
    session.insufficientData ?? [],
    session.parsedCargos,
    session.parsedVessels,
    -1_000_000,
  );

  const qualifyingCount = countQualifyingMatches(db, { user_id: sessionId! });

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-[1280px] mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Matches {qualifyingCount} results</h1>
        <Suspense fallback={<PageSkeleton />}>
          <MatchesClient initialMatches={matchesWithLimits} isComputing={isComputing}
            cargoEmailIds={cargoEmailIds}
            vesselEmailIds={vesselEmailIds}
            lowConfidenceMatches={lowConfidenceMatches}
            insufficientData={insufficientData}
          />
        </Suspense>
      </div>
    </main>
  );
}

/** Keep one row per vessel_name+cargo_ref+load_port+laycan_start key (#787). */
function dedupMatches(rows: StoredMatch[]): StoredMatch[] {
  const seen = new Map<string, StoredMatch>();
  for (const r of rows) {
    const k = `${r.vessel_name ?? ''}|${r.cargo_ref ?? r.cargo_id}|${r.load_port ?? ''}|${r.laycan_start ?? ''}`;
    if (!seen.has(k)) seen.set(k, r);
  }
  return [...seen.values()];
}
