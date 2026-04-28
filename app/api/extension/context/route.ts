import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import type { ParsedCargo, ParsedVessel, Match } from '@/lib/types';
import type { MatchConfidence } from '@/lib/confidence';

export interface ExtensionContextResponse {
  parsedCargo: ParsedCargo | null;
  topMatches: Array<{ vessel: ParsedVessel; score: number }>;
  draftQuoteText: string | null;
  confidence?: MatchConfidence;
}

export const maxDuration = 10;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;

  const { searchParams } = new URL(request.url);
  const messageId = searchParams.get('messageId');

  // Find parsed cargo for this message from session
  const parsedCargo = messageId
    ? (session.parsedCargos.find(c => c.emailId === messageId) ?? null)
    : (session.parsedCargos[0] ?? null);

  // Get top 3 vessel matches for this cargo from session
  const cargoMatches: Match[] = messageId
    ? session.matches.filter(m => m.cargoEmailId === messageId)
    : session.matches;

  const topMatches = cargoMatches
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(m => {
      const vessel = session.parsedVessels?.find(
        v => v.emailId === m.vesselEmailId && v.itemIndex === m.vesselItemIndex,
      ) ?? null;
      return { vessel: vessel as ParsedVessel, score: m.score };
    })
    .filter(m => m.vessel !== null);

  // Draft quote text: simple template from parsedCargo if available
  const draftQuoteText = parsedCargo
    ? buildDraftQuoteTemplate(parsedCargo)
    : null;

  const response: ExtensionContextResponse = {
    parsedCargo,
    topMatches,
    draftQuoteText,
  };

  return NextResponse.json(response);
}

function buildDraftQuoteTemplate(cargo: ParsedCargo): string {
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

  return `Dear Broker,\n\nWith reference to your inquiry, we are pleased to offer suitable tonnage for the following cargo:\n\nCargo: ${desc}\nLoading: ${origin}\nDischarging: ${dest}\n\nPlease revert with your best offer.\n\nBest regards,\nQuantika Assistant`;
}
