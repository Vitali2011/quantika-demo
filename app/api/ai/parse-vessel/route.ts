/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';
import { VESSEL_POSITION_PARSER_PROMPT } from '@/lib/prompts';
import { AI_MODEL_LIGHT } from '@/lib/constants';
import { ParsedVessel } from '@/lib/types';
import { extractNum, toConfidence } from '@/lib/parsing-utils';

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get('session_id')?.value;
  if (!sessionId) return NextResponse.json({ error: 'No session' }, { status: 401 });

  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: 'Session expired' }, { status: 401 });

  const vesselIds = session.classifications
    .filter(c => c.category === 'VESSEL_POSITION')
    .map(c => c.emailId);

  const vesselEmails = session.emails.filter(e => vesselIds.includes(e.id));

  if (vesselEmails.length === 0) {
    updateSession(sessionId, { parsedVessels: [] });
    return NextResponse.json({ count: 0 });
  }

  const allParsed: ParsedVessel[] = [];

  await Promise.all(
    vesselEmails.map(async (email) => {
      const userPrompt = `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.body}`;

      const result = await callAiJson<any>(
        userPrompt,
        VESSEL_POSITION_PARSER_PROMPT,
        AI_MODEL_LIGHT,
        { items: [] }
      );

      const items = Array.isArray(result.items) ? result.items : [result];

      items.forEach((item: any, idx: number) => {
        allParsed.push({
          emailId: email.id,
          itemIndex: idx,
          vesselName: toConfidence<string>(item.vessel_name),
          imo: item.imo || null,
          flag: item.flag || null,
          built: extractNum(item.built),
          classSociety: item.class_society || null,
          pandi: item.p_and_i || null,
          dwtSummer: toConfidence<number>(item.dwt_summer),
          dwcc: toConfidence<number>(item.dwcc),
          draftMax: toConfidence<number>(item.draft_max),
          loa: extractNum(item.loa),
          beam: extractNum(item.beam),
          grt: extractNum(item.grt),
          nrt: extractNum(item.nrt),
          holdsCount: extractNum(item.holds_count),
          hatchesCount: extractNum(item.hatches_count),
          grainCapacity: extractNum(item.grain_capacity),
          grainCapacityUnit: item.grain_capacity_unit || null,
          baleCapacity: extractNum(item.bale_capacity),
          holdDimensions: item.hold_dimensions || null,
          hatchDimensions: item.hatch_dimensions || null,
          tankTopStrength: item.tank_top_strength || null,
          geared: item.geared != null ? Boolean(item.geared) : null,
          craneCapacity: item.crane_capacity || null,
          hatchType: item.hatch_type || null,
          vesselType: item.vessel_type || null,
          openPosition: toConfidence<string>(item.open_position),
          openDate: toConfidence<string>(item.open_date),
          direction: item.direction || null,
          restrictions: Array.isArray(item.restrictions) ? item.restrictions : [],
          lastCargoes: (() => {
            let lc = item.last_cargoes;
            if (!lc) return null;
            if (typeof lc === 'object' && 'value' in lc) lc = lc.value;
            if (Array.isArray(lc)) return lc.map(String).join(', ');
            if (typeof lc === 'string') {
              try { const parsed = JSON.parse(lc); if (Array.isArray(parsed)) return parsed.join(', '); } catch {}
              return lc;
            }
            return String(lc);
          })(),
          speedLaden: item.speed_laden || null,
          speedBallast: item.speed_ballast || null,
          consumption: item.consumption || null,
          deckCapacity: item.deck_capacity || null,
          specialFeatures: Array.isArray(item.special_features) ? item.special_features : [],
        });
      });
    })
  );

  updateSession(sessionId, { parsedVessels: allParsed });
  return NextResponse.json({ count: allParsed.length });
}
