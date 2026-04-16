import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';
import { VESSEL_POSITION_PARSER_PROMPT } from '@/lib/prompts';
import { AI_MODEL_LIGHT } from '@/lib/constants';
import { ParsedVessel, cfValue } from '@/lib/types';
import { extractNum, toConfidence } from '@/lib/parsing-utils';
import { validateImo } from '@/lib/validation/imo';
import { calibrateAll } from '@/lib/validation/confidence-calibration';
import { lookupVesselByImo, compareVesselRecord } from '@/lib/validation/equasis-client';

interface RawVesselItem {
  vessel_name?: unknown;
  imo?: string | null;
  flag?: string | null;
  built?: number | string | null;
  class_society?: string | null;
  p_and_i?: string | null;
  dwt_summer?: unknown;
  dwcc?: unknown;
  draft_max?: unknown;
  loa?: number | string | null;
  beam?: number | string | null;
  grt?: number | string | null;
  nrt?: number | string | null;
  holds_count?: number | string | null;
  hatches_count?: number | string | null;
  grain_capacity?: number | string | null;
  grain_capacity_unit?: 'cbm' | 'cbft' | null;
  bale_capacity?: number | string | null;
  hold_dimensions?: string | null;
  hatch_dimensions?: string | null;
  tank_top_strength?: string | null;
  geared?: boolean | null;
  crane_capacity?: string | null;
  hatch_type?: string | null;
  vessel_type?: string | null;
  open_position?: unknown;
  open_date?: unknown;
  direction?: string | null;
  restrictions?: string[];
  last_cargoes?: unknown;
  speed_laden?: string | null;
  speed_ballast?: string | null;
  consumption?: string | null;
  deck_capacity?: string | null;
  special_features?: string[];
  items?: RawVesselItem[];
}

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

      const result = await callAiJson<RawVesselItem>(
        userPrompt,
        VESSEL_POSITION_PARSER_PROMPT,
        AI_MODEL_LIGHT,
        { items: [] }
      );

      const items = Array.isArray(result.items) ? result.items : [result];

      items.forEach((item, idx) => {
        allParsed.push(calibrateAll({
          emailId: email.id,
          itemIndex: idx,
          vesselName: toConfidence<string>(item.vessel_name),
          // Validate IMO format (7 digits + mod-10 checksum) to catch LLM hallucinations.
          // Invalid IMOs are stored as null rather than misleading the broker.
          imo: (() => {
            const raw = typeof item.imo === 'string' ? item.imo : item.imo != null ? String(item.imo) : null;
            if (!raw) return null;
            const v = validateImo(raw);
            return v.valid ? v.normalized! : null;
          })(),
          flag: (() => {
            const f = item.flag;
            if (!f) return null;
            if (typeof f === 'object' && 'value' in f) return String((f as { value: unknown }).value) || null;
            return String(f) || null;
          })(),
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
          geared: (() => {
            if (item.geared === false) return false;
            const feats = JSON.stringify(item.special_features ?? '').toLowerCase();
            if (feats.includes('gearless')) return false;
            const body = userPrompt.toLowerCase();
            if (body.includes('gearless') && !body.match(/\d+\s*[xх]\s*\d+\s*t/i)) return false;
            return item.geared != null ? Boolean(item.geared) : null;
          })(),
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
            if (Array.isArray(lc)) {
                return lc
                  .map((entry: unknown) =>
                    entry !== null && typeof entry === 'object' && 'value' in (entry as object)
                      ? String((entry as { value: unknown }).value)
                      : String(entry)
                  )
                  .filter(Boolean)
                  .join(', ');
              }
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
          verificationWarning: null,
        }) as ParsedVessel);
      });
    })
  );

  // External registry verification (Equasis). Runs only for vessels where we
  // have a structurally valid IMO. Graceful — Equasis down = no warning,
  // not a filter failure.
  await Promise.all(
    allParsed.map(async (v) => {
      if (!v.imo) return;
      try {
        const record = await lookupVesselByImo(v.imo);
        if (!record) {
          v.verificationWarning = 'IMO not found in Equasis registry';
          return;
        }
        const mismatch = compareVesselRecord(record, {
          parsedName: cfValue(v.vesselName),
          parsedDwt: cfValue(v.dwtSummer),
        });
        if (mismatch) v.verificationWarning = mismatch;
      } catch {
        // swallow — never block a match due to verification failure
      }
    })
  );

  updateSession(sessionId, { parsedVessels: allParsed });
  return NextResponse.json({ count: allParsed.length });
}
