import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { cfValue } from '@/lib/types';
import { formatQuantity } from '@/lib/cargo-render';
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

function fmtWeight(mt: number | null): string | null {
  if (mt === null) return null;
  if (mt >= 1000) return `${Math.round(mt / 1000)}k`;
  return String(mt);
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
      quantity: fmtWeight(weightMt) ?? formatQuantity(cargo.quantity),
      laycan: cargo.laycan ?? null,
      status: hasMatch ? 'match' : 'open',
      sourceTag: email ? 'Email' : 'Manual',
      sourceName: email
        ? (email.fromName ?? email.from.split('<')[0].trim())
        : 'Manual',
    };
  });

  return <CargoClient rows={rows} total={rows.length} />;
}
