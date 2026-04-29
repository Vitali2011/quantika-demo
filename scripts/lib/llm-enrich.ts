/**
 * LLM enrichment module for port-master generation (Phase 4).
 *
 * Takes skeleton ports (unlocode/name/country/lat/lon) and enriches them with
 * operational data: max draft, crane availability, berth type, LOA, cargo types,
 * tidal flag, ice flag. Uses callAiJson() via ClipProxy (gpt-5.5).
 *
 * Batches 20 ports per API call with a 1-second pause between batches to stay
 * server-friendly. Falls back to a low-confidence stub record on any failure.
 */

import type { PortMaster } from '../../lib/sailing/port-master';
import type { SkeletonPort } from './match-targets';
import { callAiJson } from '../../lib/openai';
import { AI_MODEL_LIGHT } from '../../lib/constants';

const BATCH_SIZE = 10;
const BATCH_PAUSE_MS = 500;

/** Shape LLM is asked to return for each port. */
interface LlmPortEnrichment {
  unlocode: string;
  maxDraftM?: number;
  hasShoreCranes?: boolean;
  berthType?: 'river' | 'deep-sea' | 'bay' | 'terminal';
  maxLOA?: number | null;
  cargoBerthTypes?: Array<'bulk' | 'container' | 'general' | 'RORO' | 'tanker'>;
  tidal?: boolean;
  icePort?: boolean;
  dataConfidence?: 'high' | 'medium' | 'low';
  sourceNote?: string;
  lat?: number | null;
  lon?: number | null;
}

const SYSTEM_PROMPT =
  'You are a maritime port authority data specialist. Return STRICT JSON array, same order as input, no prose, no markdown.';

function buildUserPrompt(batch: SkeletonPort[]): string {
  const inputJson = JSON.stringify(
    batch.map(p => ({
      unlocode: p.unlocode,
      name: p.name,
      country: p.country,
      lat: p.lat,
      lon: p.lon,
    })),
    null,
    2,
  );
  return `For each port in the array, provide enrichment fields:
- maxDraftM (metres, deepest berth, salt water summer)
- hasShoreCranes (boolean — true if dedicated shore cranes for dry-bulk/breakbulk)
- berthType ('river' | 'deep-sea' | 'bay' | 'terminal')
- maxLOA (metres, null if unknown)
- cargoBerthTypes (array of any: 'bulk' | 'container' | 'general' | 'RORO' | 'tanker')
- tidal (boolean — true if tidal port with limited berth windows)
- icePort (boolean — true if winter ice closure typical, e.g. Baltic/Arctic)
- dataConfidence ('high' | 'medium' | 'low' — your self-assessed confidence)
- sourceNote (short authority/handbook reference, max 50 chars)
- IF the input has lat=null or lon=null, also provide:
  - lat (decimal degrees, WGS84, positive=N)
  - lon (decimal degrees, WGS84, positive=E)

Rules:
- If a port is unknown to you, return {unlocode: X, dataConfidence: 'low'} with conservative draft (10) and minimal other fields. DO NOT hallucinate.
- Keep array order identical to input.
- Return ONLY the JSON array, nothing else.

Input ports:
${inputJson}`;
}

/** Build a low-confidence fallback record for a skeleton port. */
function fallbackRecord(skeleton: SkeletonPort): PortMaster {
  return {
    unlocode: skeleton.unlocode,
    name: skeleton.name,
    country: skeleton.country,
    // NaN signals "coords unknown" without colliding with (0,0) Gulf of Guinea.
    // getPortDistance() guards with Number.isFinite() so these ports never produce
    // haversine distances — callers degrade gracefully to null.
    lat: skeleton.lat ?? NaN,
    lon: skeleton.lon ?? NaN,
    maxDraftM: 10,
    hasShoreCranes: false,
    berthType: 'deep-sea',
    cargoBerthTypes: [],
    tidal: false,
    icePort: false,
    dataConfidence: 'low',
    sourceNote: 'LLM fallback',
  };
}

/** Merge LLM enrichment into skeleton, preserving skeleton coords unless LLM fills nulls. */
function mergeEnrichment(skeleton: SkeletonPort, llm: LlmPortEnrichment): PortMaster {
  // Prefer skeleton coords; accept LLM coords only when skeleton has null.
  // Fall back to NaN (not 0) so getPortDistance()'s isFinite guard treats
  // unknown coords as "unavailable" rather than placing the port at (0,0).
  const lat = skeleton.lat ?? (typeof llm.lat === 'number' ? llm.lat : NaN);
  const lon = skeleton.lon ?? (typeof llm.lon === 'number' ? llm.lon : NaN);

  return {
    unlocode: skeleton.unlocode,
    name: skeleton.name,
    country: skeleton.country,
    lat,
    lon,
    maxDraftM: typeof llm.maxDraftM === 'number' ? llm.maxDraftM : 10,
    hasShoreCranes: typeof llm.hasShoreCranes === 'boolean' ? llm.hasShoreCranes : false,
    berthType: llm.berthType ?? 'deep-sea',
    ...(llm.maxLOA != null ? { maxLOA: llm.maxLOA } : {}),
    cargoBerthTypes: Array.isArray(llm.cargoBerthTypes) ? llm.cargoBerthTypes : [],
    tidal: typeof llm.tidal === 'boolean' ? llm.tidal : false,
    icePort: typeof llm.icePort === 'boolean' ? llm.icePort : false,
    dataConfidence: llm.dataConfidence ?? 'low',
    sourceNote: llm.sourceNote,
  };
}

/**
 * Enrich a batch of skeleton ports with LLM-derived operational data.
 *
 * @param input  Array of skeleton ports (may have null lat/lon).
 * @returns      Array of PortMaster records in the same order as input.
 */
export async function enrichPortsBatch(input: SkeletonPort[]): Promise<PortMaster[]> {
  const result: PortMaster[] = new Array(input.length);
  const totalBatches = Math.ceil(input.length / BATCH_SIZE);

  for (let batchStart = 0; batchStart < input.length; batchStart += BATCH_SIZE) {
    const batch = input.slice(batchStart, batchStart + BATCH_SIZE);
    const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
    process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${batch.map(p => p.unlocode).join(', ')}... `);
    const prompt = buildUserPrompt(batch);

    // 10 ports × ~150 tokens output = ~1500 tokens; cap at 2000 to avoid
    // excessive reasoning token burn (gpt-5.5 has chain-of-thought).
    const llmResult = await callAiJson<LlmPortEnrichment[] | null>(
      prompt,
      SYSTEM_PROMPT,
      AI_MODEL_LIGHT,
      null,
      2000,
    );
    process.stdout.write(Array.isArray(llmResult) ? `✓ (${llmResult.length})\n` : `✗ fallback\n`);

    // Build unlocode → enrichment index for order-insensitive matching
    const enrichmentByUnlocode = new Map<string, LlmPortEnrichment>();
    if (Array.isArray(llmResult)) {
      for (const item of llmResult) {
        if (item && typeof item.unlocode === 'string') {
          enrichmentByUnlocode.set(item.unlocode, item);
        }
      }
    }

    for (let i = 0; i < batch.length; i++) {
      const skeleton = batch[i];
      const llm = enrichmentByUnlocode.get(skeleton.unlocode);
      result[batchStart + i] = llm
        ? mergeEnrichment(skeleton, llm)
        : fallbackRecord(skeleton);
    }

    // Pause between batches (skip after last batch)
    if (batchStart + BATCH_SIZE < input.length) {
      await new Promise(resolve => setTimeout(resolve, BATCH_PAUSE_MS));
    }
  }

  return result;
}
