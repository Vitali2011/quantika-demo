/**
 * app/api/ai/generate-route-map/route.ts
 * Wave γ, spec-12: Imagen 4 route-map wow-feature
 *
 * POST /api/ai/generate-route-map
 * Body: { matchId, origin, loading_port, discharge_port, eta? }
 *
 * Feature flag: ROUTE_MAP_ENABLED=true|false (default false)
 * Rate limit: 1 generation per matchId per hour (stored in SQLite)
 * Output: { imageUrl: string } — base64 data URL or GCS signed URL
 *
 * Cost: ~$0.04 per image (Imagen 4 via Vertex AI)
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession } from '@/lib/session';
import { getStore } from '@/lib/session-store';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// ─── Feature flag ─────────────────────────────────────────────────────────────

export function isRouteMapEnabled(): boolean {
  return process.env.ROUTE_MAP_ENABLED === 'true';
}

// ─── Validation schema ────────────────────────────────────────────────────────

const RequestSchema = z.object({
  matchId: z.string().min(1),
  origin: z.string().optional().default('Unknown'),
  loading_port: z.string().min(1),
  discharge_port: z.string().min(1),
  eta: z.string().optional(),
});

/** Output type (after Zod default resolution — origin is always string). */
export type RouteMapRequest = z.infer<typeof RequestSchema>;
/** Input type (before Zod defaults — origin is optional). */
export type RouteMapInput = z.input<typeof RequestSchema>;

// ─── Rate limiting (SQLite) ───────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Ensure the rate limit table exists and check+record a generation attempt.
 * Returns true if allowed (and records the attempt), false if rate-limited.
 */
export function checkAndRecordRateLimit(matchId: string): boolean {
  const db = getStore().getDatabase();

  // Idempotent table creation
  db.exec(`
    CREATE TABLE IF NOT EXISTS route_map_rate_limit (
      match_id    TEXT PRIMARY KEY,
      last_gen_at INTEGER NOT NULL
    )
  `);

  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  const existing = db.prepare<[string], { match_id: string; last_gen_at: number }>(
    'SELECT match_id, last_gen_at FROM route_map_rate_limit WHERE match_id = ?'
  ).get(matchId);

  if (existing && existing.last_gen_at > cutoff) {
    return false; // rate-limited
  }

  db.prepare(
    'INSERT OR REPLACE INTO route_map_rate_limit (match_id, last_gen_at) VALUES (?, ?)'
  ).run(matchId, Date.now());

  return true; // allowed
}

// ─── Imagen 4 image generation ────────────────────────────────────────────────

/**
 * Build the prompt for Imagen 4 based on the route details.
 */
export function buildRouteMapPrompt(params: RouteMapInput): string {
  const origin = params.origin ?? 'Unknown';
  const eta = params.eta ? `, ETA ${params.eta}` : '';
  return (
    `Maritime route map: vessel at ${origin}, loading at ${params.loading_port}, ` +
    `discharging at ${params.discharge_port}${eta}. ` +
    `Modern infographic style, blue ocean, ship icons, port markers, clean typography.`
  );
}

export interface ImagenClientOpts {
  project: string;
  location: string;
}

type GoogleGenAIInstance = {
  models: {
    generateImages: (params: {
      model: string;
      prompt: string;
      config?: {
        numberOfImages?: number;
        outputMimeType?: string;
        aspectRatio?: string;
      };
    }) => Promise<{
      generatedImages?: Array<{
        image?: {
          imageBytes?: string;  // base64
        };
      }>;
    }>;
  };
};

/**
 * Call Imagen 4 via @google/genai Vertex AI SDK.
 * Returns raw base64 PNG bytes.
 */
export async function generateImageWithImagen(
  prompt: string,
  opts?: ImagenClientOpts
): Promise<string> {
  const project = opts?.project ?? process.env.GOOGLE_CLOUD_PROJECT;
  const location = opts?.location ?? process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1';

  if (!project) {
    throw new Error(
      'Imagen 4 requires GOOGLE_CLOUD_PROJECT to be set in .env.local'
    );
  }

  const { GoogleGenAI } = require('@google/genai') as {
    GoogleGenAI: new (opts: {
      vertexai: boolean;
      project: string;
      location: string;
    }) => GoogleGenAIInstance;
  };

  const ai = new GoogleGenAI({ vertexai: true, project, location });

  const response = await ai.models.generateImages({
    model: 'imagen-4.0-generate-preview-05-20',
    prompt,
    config: {
      numberOfImages: 1,
      outputMimeType: 'image/png',
      aspectRatio: '16:9',
    },
  });

  const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
  if (!imageBytes) {
    throw new Error('Imagen 4 returned no image bytes');
  }

  return imageBytes; // base64 encoded PNG
}

/**
 * Upload image to Google Cloud Storage and return a 7-day signed URL.
 * Falls back to base64 data URL if GCS credentials/bucket are not configured.
 */
export async function uploadAndGetUrl(
  base64Bytes: string,
  matchId: string
): Promise<string> {
  const bucket = process.env.ROUTE_MAP_GCS_BUCKET;

  if (!bucket) {
    // No GCS configured → return base64 data URL (suitable for demo)
    logger.info({ matchId }, '[route-map] no GCS bucket configured, returning data URL');
    return `data:image/png;base64,${base64Bytes}`;
  }

  // Upload to GCS and return signed URL
  const { Storage } = require('@google-cloud/storage');
  const storage = new Storage();
  const filename = `route-maps/${matchId}-${Date.now()}.png`;
  const file = storage.bucket(bucket).file(filename);

  await file.save(Buffer.from(base64Bytes, 'base64'), {
    contentType: 'image/png',
    metadata: { cacheControl: 'public, max-age=604800' },
  });

  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  return signedUrl;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;

  // Feature flag
  if (!isRouteMapEnabled()) {
    return NextResponse.json({ error: 'Route map feature is disabled' }, { status: 404 });
  }

  // Parse + validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.issues },
      { status: 422 }
    );
  }

  const data = parsed.data;

  // Rate limit check
  const allowed = checkAndRecordRateLimit(data.matchId);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. You can generate one route map per match per hour.' },
      { status: 429 }
    );
  }

  // Generate image
  const prompt = buildRouteMapPrompt(data);
  const start = Date.now();

  try {
    const imageBytes = await generateImageWithImagen(prompt);
    const imageUrl = await uploadAndGetUrl(imageBytes, data.matchId);
    const latencyMs = Date.now() - start;

    logger.info({ matchId: data.matchId, latencyMs }, '[route-map] image generated');

    return NextResponse.json({ imageUrl, latencyMs });
  } catch (err) {
    const latencyMs = Date.now() - start;
    logger.error({ err, matchId: data.matchId, latencyMs }, '[route-map] generation failed');

    return NextResponse.json(
      { error: 'Image generation failed', details: String(err) },
      { status: 500 }
    );
  }
}
