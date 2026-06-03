import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { cfValue } from '@/lib/types';
import { formatQuantityCompact, formatCargoLaycanDisplay } from '@/lib/cargo-render';
import CargoClient, { type CargoRow } from './CargoClient';

export const metadata: Metadata = {
  title: 'Cargo — Quantika',
};

function getCommodityKey(desc: string | null): string {
  const d = (desc ?? '').toLowerCase();
  if (/steel|hss|hot.?roll|metal/.test(d)) return 'hss';
  if (/grain|wheat|corn|maize|barley|soy|oat/.test(d)) return 'grain';
  if (/coal|coke|anthracite/.test(d)) return 'coal';
  if (/clinker|cement/.test(d)) return 'clinker';
  if (/sugar|sucrose/.test(d)) return 'sugar';
  return 'bulk';
}


export default async function CargoPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  const session = sessionId ? getSession(sessionId) : null;

  if (!session) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">📭</div>
          <h1 className="text-xl font-bold">No cargo data</h1>
          <p className="text-sm text-gray-500">Upload emails with cargo inquiries to see them here.</p>
          <Link href="/processing" className="inline-block px-6 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            Upload emails
          </Link>
        </div>
      </main>
    );
  }

  const rows: CargoRow[] = session.parsedCargos.map((cargo) => {
    const email = session.emails.find((e) => e.id === cargo.emailId);
    const hasMatch = session.matches.some((m) => m.cargoEmailId === cargo.emailId);
    const descVal = cfValue(cargo.cargoDescription);
    const weightMt = cfValue(cargo.weightMt);

    return {
      id: `${cargo.emailId}:${cargo.itemIndex}`,
      emailId: cargo.emailId,
      itemIndex: cargo.itemIndex,
      commodity: descVal ?? cargo.cargoType,
      cargoType: cargo.cargoType,
      commodityKey: getCommodityKey(descVal),
      originPort: cfValue(cargo.originPort) ?? null,
      destinationPort: cfValue(cargo.destinationPort) ?? null,
      quantity: formatQuantityCompact(weightMt, cargo.quantity),
      laycan: cargo.laycan ?? null,
      status: hasMatch ? 'match' : 'open',
      sourceTag: email ? 'Email' : 'Manual',
      sourceName: email
        ? (email.fromName ?? email.from.split('<')[0].trim())
        : 'Manual',
    };
  });

  // Collapse re-circulated duplicate cargoes (same parcel across several circular
  // emails). Key on commodity + load port + quantity + laycan; discharge port is
  // excluded (free-text wording noise splits true dupes). Genuinely different
  // parcels (different route/qty/dates) stay separate; unknown-commodity rows are
  // keyed by id. Prefer the row that already has a match.
  const dedupedCargo = dedupRows(rows, (r) =>
    r.commodity
      ? `${r.commodity}|${r.originPort ?? ''}|${r.quantity ?? ''}|${JSON.stringify(r.laycan ?? '')}`
      : r.id,
  );

  const refYear = new Date().getUTCFullYear();
  const displayRows = dedupedCargo.map((row) => ({
    ...row,
    laycan: formatCargoLaycanDisplay(row.laycan, refYear),
  }));

  return <CargoClient rows={displayRows} total={displayRows.length} />;
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
