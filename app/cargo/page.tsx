import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
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
  if (!sessionId) redirect('/dashboard');
  const session = getSession(sessionId);
  if (!session) redirect('/dashboard');

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
