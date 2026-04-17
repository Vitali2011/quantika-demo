import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';
import { VESSEL_POSITION_PARSER_PROMPT } from '@/lib/prompts';
import { AI_MODEL_LIGHT } from '@/lib/constants';
import { Email, ParsedVessel, cfValue } from '@/lib/types';
import { extractNum, toConfidence } from '@/lib/parsing-utils';
import pLimit from 'p-limit';
import { extractLastCargoesFromBody, extractLastCargoesNearVessel } from '@/lib/parsing/lastcargoes-fallback';
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

/** Extract plain string from a value that may be a ConfidenceField object or a plain string */
function extractStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'object' && 'value' in v) return String((v as { value: unknown }).value) || null;
  return String(v) || null;
}

export function buildVesselPrompt(email: Email): string {
  return `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}\n\n${email.body}`;
}

export function parseVesselAIResponse(raw: string, emailId: string, emailBody = ''): ParsedVessel[] {
  const result = JSON.parse(raw) as RawVesselItem;
  const items = Array.isArray(result.items) ? result.items : [result];
  const parsed: ParsedVessel[] = [];
  const bodyLower = emailBody.toLowerCase();

  items.forEach((item, idx) => {
    parsed.push(calibrateAll({
      emailId,
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
      classSociety: extractStr(item.class_society),
      pandi: extractStr(item.p_and_i),
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
      grainCapacityUnit: extractStr(item.grain_capacity_unit) as 'CBM' | 'CF' | null,
      baleCapacity: extractNum(item.bale_capacity),
      holdDimensions: extractStr(item.hold_dimensions),
      hatchDimensions: extractStr(item.hatch_dimensions),
      tankTopStrength: extractStr(item.tank_top_strength),
      geared: (() => {
        if (item.geared === false) return false;
        const feats = JSON.stringify(item.special_features ?? '').toLowerCase();
        if (feats.includes('gearless')) return false;
        if (bodyLower.includes('gearless') && !bodyLower.match(/\d+\s*[xх]\s*\d+\s*t/i)) return false;
        return item.geared != null ? Boolean(item.geared) : null;
      })(),
      craneCapacity: extractStr(item.crane_capacity),
      hatchType: extractStr(item.hatch_type),
      vesselType: extractStr(item.vessel_type),
      openPosition: toConfidence<string>(item.open_position),
      openDate: toConfidence<string>(item.open_date),
      direction: extractStr(item.direction),
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
  return parsed;
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
  const limit = pLimit(5);

  await Promise.all(
    vesselEmails.map((email) =>
      limit(async () => {
        const userPrompt = buildVesselPrompt(email);

        const result = await callAiJson<RawVesselItem>(
          userPrompt,
          VESSEL_POSITION_PARSER_PROMPT,
          AI_MODEL_LIGHT,
          { items: [] }
        );

        allParsed.push(...parseVesselAIResponse(JSON.stringify(result), email.id, userPrompt));
      })
    )
  );

  // Post-process: fill lastCargoes from email body if LLM missed it (regex fallback).
  // For multi-vessel emails, use a proximity window around the vessel name; for
  // single-vessel emails fall back to scanning the entire body.
  for (const vessel of allParsed) {
    if (!vessel.lastCargoes) {
      const sourceEmail = vesselEmails.find(e => e.id === vessel.emailId);
      if (sourceEmail?.body) {
        const isMultiVessel = allParsed.filter(v => v.emailId === vessel.emailId).length > 1;
        const vesselName = typeof vessel.vesselName === 'object' && vessel.vesselName !== null && 'value' in vessel.vesselName
          ? String((vessel.vesselName as { value: unknown }).value)
          : vessel.vesselName ? String(vessel.vesselName) : null;
        const extracted = isMultiVessel && vesselName
          ? extractLastCargoesNearVessel(sourceEmail.body, vesselName)
          : extractLastCargoesFromBody(sourceEmail.body);
        if (extracted) {
          vessel.lastCargoes = extracted;
        }
      }
    }
  }

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
