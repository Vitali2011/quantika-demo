import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { cfValue } from '@/lib/types';
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
  if (!sessionId) redirect('/');
  const session = getSession(sessionId);
  if (!session) redirect('/');

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
      openDate: cfValue(vessel.openDate) ?? null,
      status: hasMatch ? 'match' : 'open',
      sourceTag: email ? 'Email' : 'Manual',
      sourceName: email
        ? (email.fromName ?? email.from.split('<')[0].trim())
        : 'Manual',
    };
  });

  return <VesselsClient rows={rows} total={rows.length} />;
}
