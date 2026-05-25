import { NextRequest, NextResponse } from 'next/server';
import { requireSession, updateSession } from '@/lib/session';
import type { ParsedCargo } from '@/lib/types';

interface ManualCargoItem {
  commodity?: string;
  originPort?: string;
  destinationPort?: string;
  quantityMt?: number | null;
  laycan?: string;
}

export async function POST(request: NextRequest) {
  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;
  const { session, sessionId } = authResult;

  let items: ManualCargoItem[];
  try {
    const body = await request.json();
    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: 'items must be an array' }, { status: 400 });
    }
    items = body.items as ManualCargoItem[];
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (items.length === 0) {
    return NextResponse.json({ error: 'No items provided' }, { status: 400 });
  }

  const now = Date.now();
  const newCargoes: ParsedCargo[] = items.map((item, idx) => ({
    emailId: `import-${now}-${idx}`,
    itemIndex: 0,
    originPort: item.originPort?.trim()
      ? { value: item.originPort.trim(), confidence: 'confirmed' as const }
      : null,
    originCountry: null,
    destinationPort: item.destinationPort?.trim()
      ? { value: item.destinationPort.trim(), confidence: 'confirmed' as const }
      : null,
    destinationCountry: null,
    cargoDescription: item.commodity?.trim()
      ? { value: item.commodity.trim(), confidence: 'confirmed' as const }
      : null,
    weightMt:
      item.quantityMt != null
        ? { value: item.quantityMt, confidence: 'confirmed' as const }
        : null,
    weightMtMin: null,
    weightMtMax: null,
    volumeCbm: null,
    dimensions: null,
    cargoType: 'BULK',
    containerType: null,
    quantity: item.quantityMt ?? null,
    incoterms: null,
    preferredDates: null,
    laycan: item.laycan?.trim() || null,
    loadingRate: null,
    dischargeRate: null,
    commissionPercent: null,
    commissionTerms: null,
    freightRateUsd: null,
    specialRequirements: null,
    stowageFactor: null,
    missingInfo: [],
  }));

  updateSession(sessionId, { parsedCargos: [...session.parsedCargos, ...newCargoes] });

  return NextResponse.json({ added: newCargoes.length });
}
