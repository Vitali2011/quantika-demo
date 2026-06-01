import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { cfValue } from '@/lib/types';
import { fmtOpenDate } from '@/lib/vessels-utils';
import VesselsClient, { type VesselRow } from './VesselsClient';

export const metadata: Metadata = {
  title: 'Vessels — Quantika',
};

function getVesselKey(vesselType: string | null): string {
  const vt = (vesselType ?? '').toLowerCase();
  if (/bulk/.test(vt)) return 'bulk';
  if (/tank/.test(vt)) return 'tanker';
  if (/general|multipurpose|mp/.test(vt)) return 'general';
  if (/container/.test(vt)) return 'container';
  if (/ro.?ro/.test(vt)) return 'roro';
  return 'other';
}

function fmtDwt(dwt: number | null): string | null {
  if (dwt === null) return null;
  if (dwt >= 1000) return `${Math.round(dwt / 1000)}k`;
  return String(dwt);
}


export default async function VesselsPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  const session = sessionId ? getSession(sessionId) : null;

  if (!session) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">📭</div>
          <h1 className="text-xl font-bold">No vessel data</h1>
          <p className="text-sm text-gray-500">Upload emails with vessel positions to see them here.</p>
          <Link href="/processing" className="inline-block px-6 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            Upload emails
          </Link>
        </div>
      </main>
    );
  }

  const rows: VesselRow[] = session.parsedVessels.map((vessel) => {
    const email = session.emails.find((e) => e.id === vessel.emailId);
    const hasMatch = session.matches.some((m) => m.vesselEmailId === vessel.emailId);
    const vesselName = cfValue(vessel.vesselName) ?? 'Unknown vessel';
    const dwtVal = cfValue(vessel.dwtSummer);

    return {
      id: `${vessel.emailId}:${vessel.itemIndex}`,
      emailId: vessel.emailId,
      itemIndex: vessel.itemIndex,
      vesselName,
      vesselType: vessel.vesselType ?? null,
      vesselKey: getVesselKey(vessel.vesselType),
      dwtSummer: fmtDwt(dwtVal),
      openPosition: cfValue(vessel.openPosition) ?? null,
      openDate: fmtOpenDate(vessel.openDate),
      status: hasMatch ? 'match' : 'open',
      sourceTag: email ? 'Email' : 'Manual',
      sourceName: email
        ? (email.fromName ?? email.from.split('<')[0].trim())
        : 'Manual',
    };
  });

  // Collapse re-circulated duplicate vessels: the demo corpus carries the same
  // vessel as items across several circular emails. Key on identity (name +
  // open position + open date); a vessel at a genuinely different position/date
  // stays as a separate row. Unknown-named rows are never collapsed (keyed by id).
  // Prefer the row that already has a match so matched vessels stay visible.
  const dedupedVessels = dedupRows(rows, (r) =>
    r.vesselName && r.vesselName !== 'Unknown vessel'
      ? `${r.vesselName}|${r.openPosition ?? ''}|${r.openDate ?? ''}`
      : r.id,
  );

  return <VesselsClient rows={dedupedVessels} total={dedupedVessels.length} />;
}

/** Keep one row per content key, preferring a row that already has a match. */
function dedupRows<T extends { status: 'open' | 'match' }>(rows: T[], key: (r: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const r of rows) {
    const k = key(r);
    const prev = seen.get(k);
    if (!prev || (r.status === 'match' && prev.status !== 'match')) seen.set(k, r);
  }
  return [...seen.values()];
}
