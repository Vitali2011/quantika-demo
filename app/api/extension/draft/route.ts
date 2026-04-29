import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import type { ParsedCargo } from '@/lib/types';

interface DraftRequestBody {
  parsedCargo: ParsedCargo;
  vesselId: string;
  brokerName: string;
}

/** Maximum allowed length for brokerName (BUG-D4: length cap). */
const BROKER_NAME_MAX_LEN = 256;

/**
 * Sanitize brokerName before inserting into draft template.
 * - Truncates to BROKER_NAME_MAX_LEN chars (BUG-D4)
 * - Strips CR (\r) and LF (\n) control characters (BUG-D3)
 * - HTML-escapes <, >, &, ", ' to prevent XSS in downstream renderers (BUG-D2)
 */
function sanitizeBrokerName(name: string): string {
  // D4: truncate first
  let s = name.slice(0, BROKER_NAME_MAX_LEN);
  // D3: strip CR and LF
  s = s.replace(/[\r\n]/g, ' ');
  // D2: HTML-escape special chars
  s = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return s;
}

export const maxDuration = 30;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!isValidDraftBody(body)) {
    return NextResponse.json(
      { error: 'Missing required fields: parsedCargo, vesselId, brokerName' },
      { status: 400 },
    );
  }

  const { parsedCargo, brokerName } = body;

  const safeBrokerName = sanitizeBrokerName(brokerName);
  const draftText = buildDraft(parsedCargo, safeBrokerName);

  return NextResponse.json({ draftText });
}

function isValidDraftBody(body: unknown): body is DraftRequestBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.parsedCargo === 'object' &&
    b.parsedCargo !== null &&
    typeof b.vesselId === 'string' &&
    b.vesselId.length > 0 &&
    typeof b.brokerName === 'string' &&
    b.brokerName.length > 0
  );
}

function buildDraft(cargo: ParsedCargo, brokerName: string): string {
  const origin =
    typeof cargo.originPort === 'object' && cargo.originPort !== null
      ? cargo.originPort.value ?? ''
      : cargo.originPort ?? '';
  const dest =
    typeof cargo.destinationPort === 'object' && cargo.destinationPort !== null
      ? cargo.destinationPort.value ?? ''
      : cargo.destinationPort ?? '';
  const desc =
    typeof cargo.cargoDescription === 'object' && cargo.cargoDescription !== null
      ? cargo.cargoDescription.value ?? ''
      : cargo.cargoDescription ?? '';

  return `Dear ${brokerName},\n\nWith reference to your cargo inquiry, we are pleased to offer suitable tonnage.\n\nCargo: ${desc}\nLoading port: ${origin}\nDischarging port: ${dest}\n\nPlease revert with any questions.\n\nBest regards,\nQuantika`;
}
