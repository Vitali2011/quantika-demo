/**
 * Vessel registry — read-only adapter over `lib/sample-data/vessel-positions.json`
 * and `lib/sample-data/imo/cii.json`. Provides lookup by IMO with normalised
 * metadata (name, type, dwt, flag, builtYear, ciiRating, lastPosition).
 *
 * Built for spec-betafix-07 (GET /api/vessel/[imo]).
 */

import * as fs from 'fs';
import * as path from 'path';
import { lookupCii, type CiiRating } from '@/lib/imo/cii-lookup';

export interface VesselRecord {
  imo: string;
  name: string;
  type: string | null;
  dwt: number | null;
  flag: string | null;
  builtYear: number | null;
  ciiRating: CiiRating | null;
  lastPosition: string | null;
}

interface PositionEmail {
  id?: string;
  subject?: string;
  body?: string;
}

interface CiiDataset {
  year: number;
  records: { imo: string; rating: string }[];
}

const VALID_RATINGS = new Set(['A', 'B', 'C', 'D', 'E']);

/** Pull every "Vessel block" inside a forwarded email body and parse it. */
function parseVesselBlock(text: string, fallbackName: string | null): Partial<VesselRecord> | null {
  const imoMatch = text.match(/IMO:\s*(\d{7})/i);
  if (!imoMatch) return null;
  const imo = imoMatch[1];

  // Vessel name — line before IMO that starts with "MV " (or other prefix)
  // Captures e.g. "MV CARPATHIAN STAR" / "MV CARBON LADY"
  const nameMatch = text.match(/(MV\s+[A-Z][A-Z0-9 .'-]+?)\s*\n[^\n]*?IMO:/);
  const name = (nameMatch ? nameMatch[1].trim() : fallbackName) ?? null;

  const dwtMatch = text.match(/DWT:\s*([\d,]+)\s*mts/i);
  const dwt = dwtMatch ? Number(dwtMatch[1].replace(/,/g, '')) : null;

  const builtFlagMatch = text.match(/Built:\s*(\d{4})\s*,\s*Flag:\s*([^\n]+?)(?:\n|$)/i);
  const builtYear = builtFlagMatch ? Number(builtFlagMatch[1]) : null;
  const flag = builtFlagMatch ? builtFlagMatch[2].trim() : null;

  const openMatch = text.match(/Open:\s*([^\n]+?)(?:,\s*\{\{OPEN_DATE\}\}|\n|$)/i);
  const lastPosition = openMatch ? openMatch[1].trim() : null;

  // Vessel "type": derive from subject hint or text — minimal, optional.
  let type: string | null = null;
  if (/MPP|multipurpose|multi-purpose/i.test(text)) type = 'MPP';
  else if (/gearless/i.test(text)) type = 'Bulk';
  else if (/geared/i.test(text)) type = 'General Cargo';

  return { imo, name, type, dwt, flag, builtYear, lastPosition };
}

let cachedRegistry: Map<string, Omit<VesselRecord, 'ciiRating'>> | null = null;

function buildRegistry(): Map<string, Omit<VesselRecord, 'ciiRating'>> {
  if (cachedRegistry) return cachedRegistry;
  const registry = new Map<string, Omit<VesselRecord, 'ciiRating'>>();

  // 1. Parse vessel-positions.json email bodies
  try {
    const positionsPath = path.join(process.cwd(), 'lib', 'sample-data', 'vessel-positions.json');
    if (fs.existsSync(positionsPath)) {
      const raw = JSON.parse(fs.readFileSync(positionsPath, 'utf-8')) as PositionEmail[];
      for (const email of raw) {
        const body = email.body ?? '';
        // An email may contain MULTIPLE vessel blocks (e.g. "MV ATLAS + MV ZEUS").
        // Split on "--- VESSEL N ---" or by IMO boundaries.
        const blocks = body.split(/---\s*VESSEL\s+\d+\s*---/i);
        for (const block of blocks) {
          const parsed = parseVesselBlock(block, null);
          if (parsed?.imo) {
            registry.set(parsed.imo, {
              imo: parsed.imo,
              name: parsed.name ?? `Vessel ${parsed.imo}`,
              type: parsed.type ?? null,
              dwt: parsed.dwt ?? null,
              flag: parsed.flag ?? null,
              builtYear: parsed.builtYear ?? null,
              lastPosition: parsed.lastPosition ?? null,
            });
          }
        }
      }
    }
  } catch {
    // Sample data missing or malformed — registry stays minimal.
  }

  // 2. Add IMOs from CII dataset that aren't yet in the registry.
  try {
    const ciiPath = path.join(process.cwd(), 'lib', 'sample-data', 'imo', 'cii.json');
    if (fs.existsSync(ciiPath)) {
      const ds = JSON.parse(fs.readFileSync(ciiPath, 'utf-8')) as CiiDataset;
      for (const r of ds.records) {
        if (!registry.has(r.imo)) {
          registry.set(r.imo, {
            imo: r.imo,
            name: `Vessel ${r.imo}`,
            type: null,
            dwt: null,
            flag: null,
            builtYear: null,
            lastPosition: null,
          });
        }
      }
    }
  } catch {
    // ignore
  }

  cachedRegistry = registry;
  return registry;
}

/** Test-only: clear cached registry (so tests re-read sample data). */
export function _resetVesselRegistryForTests(): void {
  cachedRegistry = null;
}

export async function lookupVesselByImo(imo: string): Promise<VesselRecord | null> {
  const registry = buildRegistry();
  const base = registry.get(imo);
  if (!base) return null;

  // Hydrate CII rating from the dedicated lookup (covers cii.json + cache).
  // Disable LLM fallback here — endpoint must be deterministic + offline-safe.
  let ciiRating: CiiRating | null = null;
  try {
    const cii = await lookupCii(imo, { callLlm: async () => 'unknown' });
    if (cii.rating && VALID_RATINGS.has(cii.rating)) ciiRating = cii.rating;
  } catch {
    // ignore
  }

  return { ...base, ciiRating };
}
