/**
 * POST /api/voyage/compare-routes
 *
 * β-06 — Suez vs Cape side-by-side TCE comparison + LLM-explained recommendation.
 *
 * C3 (RAG phase-2): when KNOWLEDGE_RAG_ENABLED=true and the route passes through
 * a JWC high-risk area (Black Sea / Red Sea / Persian Gulf), the top-3 JWC
 * bulletins are retrieved and injected into the LLM system prompt as context.
 * Graceful degradation: RAG failure never blocks the comparison result.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { compareRoutes, type DaResolver } from '@/lib/economics/route-decision';
import { getPortDa } from '@/lib/port-da/repository';
import { resolvePort } from '@/lib/ports/resolve';
import { isRagEnabled } from '@/lib/knowledge/flags';
import { JWC_HRA_ZONES } from '@/lib/economics/war-risk';
import type { RetrievedChunk } from '@/lib/knowledge/embeddings/chunks';
import { validateCitations } from '@/lib/knowledge/citations/validator';

export const dynamic = 'force-dynamic';

/**
 * Detect which JWC high-risk region (if any) this route passes through.
 * Uses the same keyword matching as war-risk.ts (JWC_HRA_ZONES).
 * Suez routing always adds Red Sea exposure (Bab-el-Mandeb transit).
 * Returns the region name string for query construction, or null if safe.
 */
function detectWarRiskRegion(origin: string, destination: string): string | null {
  const combined = `${origin} ${destination}`.toLowerCase().replace(/-/g, ' ');

  for (const zone of JWC_HRA_ZONES) {
    // Check if origin or destination names contain zone port keywords
    if (zone.ports.some(keyword => {
      const re = new RegExp(`\\b${keyword}\\b`, 'i');
      return re.test(combined);
    })) {
      return zone.name;
    }
  }

  return null;
}

const BodySchema = z.object({
  origin: z.string().min(1),
  destination: z.string().min(1),
  vessel: z.object({
    dwt: z.number(),
    valueUsd: z.number(),
    speedKts: z.number(),
    consumptionMtPerDay: z.number(),
  }),
  cargo: z.object({
    quantityMt: z.number(),
    freightRateUsdPerMt: z.number(),
  }),
  marketRates: z.object({
    bunkerPriceUsdPerMt: z.number(),
    euaPriceEur: z.number(),
  }),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid request body', details: String(err) },
      { status: 400 },
    );
  }

  // wave-γ-4 (BUG-05): wire DA resolver from port_da_estimates so the TCE
  // breakdown surfaces real disbursement costs instead of hardcoded 0.
  // Resolver returns 0 for ports not in the dataset — calculator handles that.
  // W1-1: the resolver receives a free-text port name (body.origin/destination),
  // but port_da_estimates is keyed by 5-char UN/LOCODE — resolve name→LOCODE
  // first, else the lookup never matches and DA is silently 0.
  const daResolver: DaResolver = (portCode, vesselDwt) => {
    try {
      const resolved = resolvePort(portCode);
      if (!resolved) return 0;
      const da = getPortDa({ portCode: resolved.portCode, vesselDwt });
      return da?.totalFixedUsd ?? 0;
    } catch {
      // DB lookup failure must not break the comparison — degrade to 0.
      return 0;
    }
  };

  // C3 (RAG phase-2): JWC war-risk context retrieval.
  // Runs before compareRoutes so the LLM system prompt can be enriched.
  // Guarded by feature flag — no-op when KNOWLEDGE_RAG_ENABLED != "true".
  let jwcSystemContext: string | undefined;
  let jwcCitations: RetrievedChunk[] = [];

  if (isRagEnabled()) {
    const warRiskRegion = detectWarRiskRegion(body.origin, body.destination);
    if (warRiskRegion) {
      try {
        // Dynamic imports keep the module cold-start fast (loaded only when RAG is active).
        const [{ retrieve }, { getDb }] = await Promise.all([
          import('@/lib/knowledge/embeddings/retriever'),
          import('@/lib/db'),
        ]);
        const db = getDb();
        const query = `war risk advisory ${warRiskRegion}`;
        const chunks = await retrieve(query, {
          vectorTable: 'jwc_vec',
          ftsTable: 'jwc_fts',
          topN: 3,
          db,
        });

        if (chunks.length > 0) {
          jwcCitations = chunks;
          const contextLines = chunks.map((chunk) => {
            const bulletinId = chunk.metadata?.id ?? chunk.chunkId;
            return `[JWC-${bulletinId}] ${chunk.content}`;
          });
          jwcSystemContext = [
            '=== JWC War Risk Advisory Context ===',
            ...contextLines,
            '=====================================',
          ].join('\n');
        }
      } catch (ragErr) {
        // RAG failure must not block the comparison — degrade gracefully.
        console.warn('[compare-routes] JWC RAG retrieval failed, continuing without context:', ragErr);
      }
    }
  }

  try {
    const result = await compareRoutes(
      body.origin,
      body.destination,
      body.vessel,
      body.cargo,
      body.marketRates,
      daResolver,
      jwcSystemContext,
    );

    // H2 (citation-validator): strip hallucinated citation tags from LLM reason.
    // Only runs when RAG is active and chunks were actually retrieved.
    if (isRagEnabled() && jwcCitations.length > 0) {
      result.recommendation.reason = validateCitations(
        result.recommendation.reason,
        jwcCitations,
      );
    }

    // Attach JWC citations to response when RAG context was used
    const response = jwcCitations.length > 0
      ? { ...result, jwcCitations }
      : result;

    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      { error: 'compare-routes failed', details: String(err) },
      { status: 500 },
    );
  }
}
