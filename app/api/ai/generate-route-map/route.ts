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

/**
 * QA H-3: ports go straight into the Imagen prompt. Cap length and restrict
 * charset to letters / digits / spaces / hyphens to defang prompt injection
 * (e.g. `<script>`, RTL override, "Ignore previous instructions…").
 */
const PORT_NAME = z.string().min(1).max(50).regex(
  /^[A-Za-z0-9 \-]+$/,
  'must be 1-50 chars; letters, digits, space, and hyphen only',
);

/** matchId stays opaque but bounded — prevents pathological keys in the rate-limit table. */
const MATCH_ID = z.string().min(1).max(128).regex(
  /^[A-Za-z0-9_:-]+$/,
  'must be 1-128 chars; letters, digits, _, :, - only',
);

const ETA_VALUE = z.string().min(1).max(50).regex(
  /^[A-Za-z0-9 :,\-]+$/,
  'must be 1-50 chars; letters, digits, space, ":", ",", and hyphen only',
);

const RequestSchema = z.object({
  matchId: MATCH_ID,
  origin: PORT_NAME.optional().default('Unknown'),
  loading_port: PORT_NAME,
  discharge_port: PORT_NAME,
  eta: ETA_VALUE.optional(),
});

/** Output type (after Zod default resolution — origin is always string). */
export type RouteMapRequest = z.infer<typeof RequestSchema>;
/** Input type (before Zod defaults — origin is optional). */
export type RouteMapInput = z.input<typeof RequestSchema>;

// ─── Rate limiting (SQLite) ───────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * QA H-2: rate-limit key is `${sessionId}:${matchId}`. The session id is the
 * only user-identifier surface we have on the server. Without it, user A can
 * burn user B's matchId quota by guessing or scraping ids.
 *
 * The `match_id` column stores this composite key (no migration: rows from PR
 * #85 simply use the legacy `<matchId>` shape and remain harmless — new code
 * always writes `<sessionId>:<matchId>` keys).
 */
function buildRateLimitKey(sessionId: string, matchId: string): string {
  return `${sessionId}:${matchId}`;
}

function ensureRateLimitTable(): void {
  const db = getStore().getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS route_map_rate_limit (
      match_id    TEXT PRIMARY KEY,
      last_gen_at INTEGER NOT NULL
    )
  `);
}

/**
 * QA H-1: split the read and the write. Returns true if a fresh generation is
 * allowed. The caller MUST call `recordRateLimit` only after the Imagen call
 * succeeds — otherwise a transient 5xx burns the user's hourly quota.
 */
export function checkRateLimit(key: string): boolean {
  ensureRateLimitTable();
  const db = getStore().getDatabase();
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  const existing = db.prepare<[string], { match_id: string; last_gen_at: number }>(
    'SELECT match_id, last_gen_at FROM route_map_rate_limit WHERE match_id = ?',
  ).get(key);
  return !(existing && existing.last_gen_at > cutoff);
}

export function recordRateLimit(key: string): void {
  ensureRateLimitTable();
  const db = getStore().getDatabase();
  db.prepare(
    'INSERT OR REPLACE INTO route_map_rate_limit (match_id, last_gen_at) VALUES (?, ?)',
  ).run(key, Date.now());
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

  // Upload to GCS and return signed URL.
  // Hide `require` from Turbopack static analysis — `@google-cloud/storage`
  // is OPTIONAL (only loaded when `ROUTE_MAP_GCS_BUCKET` is set in production).
  // Without this `eval('require')` trick the production build fails with
  // "Module not found" even though the require() is gated behind a bucket check.
  let Storage: new () => {
    bucket: (b: string) => {
      file: (f: string) => {
        save: (...a: unknown[]) => Promise<void>;
        getSignedUrl: (...a: unknown[]) => Promise<[string]>;
      };
    };
  };
  try {
    const dynamicRequire = eval('require') as NodeRequire;
    Storage = dynamicRequire('@google-cloud/storage').Storage;
  } catch (err) {
    logger.error({ err, matchId }, '[route-map] @google-cloud/storage not installed; falling back to data URL');
    return `data:image/png;base64,${base64Bytes}`;
  }
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
  const { sessionId } = authResult;

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
    // QI follow-up: return only the offending field paths, not the full zod
    // issue list (which would leak whitelist regexes and message strings).
    return NextResponse.json(
      {
        error: 'Invalid request',
        fields: parsed.error.issues.map((i) => i.path.join('.')),
      },
      { status: 422 }
    );
  }

  const data = parsed.data;

  // QA H-1+H-2: check rate limit using session-scoped key, but DO NOT record
  // until the Imagen call succeeds. Recording up-front lets a transient 5xx
  // (or an attacker griefing on someone else's matchId) burn the hourly quota.
  // KNOWN race: two concurrent POSTs with the same key can both pass the
  // read-only check and trigger Imagen twice. The DB write is idempotent
  // (`INSERT OR REPLACE`), so subsequent rate-limit state is correct, but
  // the cost-amplification window during simultaneous calls is acknowledged
  // and accepted (single-user attack-cost ratio is 1:1, not amplification).
  const rateKey = buildRateLimitKey(sessionId, data.matchId);
  if (!checkRateLimit(rateKey)) {
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

    // Only record the rate-limit hit AFTER the expensive call succeeded.
    // QI follow-up: a DB write failure here must not turn a successful image
    // into a 500 — the user already paid for the generation. Log and move on.
    // Trade-off: the user may exceed the per-hour quota next call, which is
    // acceptable vs. losing a successfully generated image.
    try {
      recordRateLimit(rateKey);
    } catch (recordErr) {
      logger.error(
        { err: recordErr, sessionId, matchId: data.matchId },
        '[route-map] recordRateLimit failed (image still returned)',
      );
    }

    logger.info({ matchId: data.matchId, sessionId, latencyMs }, '[route-map] image generated');

    return NextResponse.json({ imageUrl, latencyMs });
  } catch (err) {
    const latencyMs = Date.now() - start;
    // QA M-2: log full error server-side (Vertex SDK errors leak project-id,
    // bucket URL, internal paths); return only a generic message to the client.
    logger.error({ err, matchId: data.matchId, sessionId, latencyMs }, '[route-map] generation failed');

    return NextResponse.json(
      { error: 'Image generation failed' },
      { status: 500 }
    );
  }
}
