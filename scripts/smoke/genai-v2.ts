/**
 * genai-v2.ts — smoke-check for @google/genai v2 GenerateContent surface.
 *
 * Why: @google/genai was bumped 1.52.0 → 2.3.0 in commit 0898a87 (2026-05-15).
 * v2.0 release notes state breaking changes are isolated to `interactions`,
 * and `GenerateContent` usage is unaffected — but v2.0.1 did rename
 * `response_format` field names to snake_case. lib/ai-provider.ts reads
 * `response.text` and `response.usageMetadata` (see ai-provider.ts:418-462,
 * 479-503, 882-904); this script asserts those fields are still present and
 * well-typed against the live Vertex AI endpoint before the next prod deploy.
 *
 * Usage:
 *   npm run smoke:genai-v2
 *
 * Exit codes:
 *   0 — pass, OR skipped because GOOGLE_CLOUD_PROJECT is not configured
 *   1 — response surface broken (assertion failure or call error)
 *
 * The script intentionally skips (exit 0) when creds are missing so it can
 * be wired into CI before the GOOGLE_CLOUD_PROJECT secret is provisioned.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Bootstrap env (mirrors scripts/eval/ pattern) ────────────────────────────
const repoRoot = path.resolve(__dirname, '..', '..');

const envLocalPath = path.join(repoRoot, '.env.local');
if (fs.existsSync(envLocalPath)) {
  for (const line of fs.readFileSync(envLocalPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

const GCP_KEY_PATH = path.join(process.env.HOME ?? '', '.config', 'gcp', 'quantika-vertex-ai.json');
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(GCP_KEY_PATH)) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = GCP_KEY_PATH;
}
if (!process.env.GOOGLE_CLOUD_PROJECT && fs.existsSync(GCP_KEY_PATH)) {
  try {
    const gcpKey = JSON.parse(fs.readFileSync(GCP_KEY_PATH, 'utf8')) as { project_id?: string };
    if (gcpKey.project_id) process.env.GOOGLE_CLOUD_PROJECT = gcpKey.project_id;
  } catch {
    /* ignore */
  }
}

// ─── Skip when creds not available ────────────────────────────────────────────
if (!process.env.GOOGLE_CLOUD_PROJECT) {
  console.log('[smoke:genai-v2] SKIPPED — GOOGLE_CLOUD_PROJECT not set.');
  process.exit(0);
}

// ─── Smoke check ──────────────────────────────────────────────────────────────
interface GenerateContentResponse {
  text?: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

async function main(): Promise<void> {
  const { GoogleGenAI } = (await import('@google/genai')) as unknown as {
    GoogleGenAI: new (opts: { vertexai: boolean; project: string; location: string }) => {
      models: {
        generateContent: (params: {
          model: string;
          contents: Array<{ role: string; parts: Array<{ text: string }> }>;
        }) => Promise<GenerateContentResponse>;
      };
    };
  };

  const model = process.env.AI_MODEL_GEMINI_DEFAULT ?? 'gemini-2.5-flash';
  const project = process.env.GOOGLE_CLOUD_PROJECT!;
  const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1';

  console.log(`[smoke:genai-v2] calling Vertex AI: model=${model} project=${project} location=${location}`);

  const ai = new GoogleGenAI({ vertexai: true, project, location });
  const t0 = Date.now();
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: OK' }] }],
  });
  const elapsedMs = Date.now() - t0;

  const failures: string[] = [];

  if (typeof response.text !== 'string' || response.text.length === 0) {
    failures.push(`response.text must be a non-empty string, got: ${JSON.stringify(response.text)}`);
  }

  const usage = response.usageMetadata;
  if (!usage || typeof usage !== 'object') {
    failures.push(`response.usageMetadata must be an object, got: ${JSON.stringify(usage)}`);
  } else {
    for (const field of ['promptTokenCount', 'candidatesTokenCount', 'totalTokenCount'] as const) {
      const v = usage[field];
      if (typeof v !== 'number' || !(v > 0)) {
        failures.push(`response.usageMetadata.${field} must be a positive number, got: ${JSON.stringify(v)}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error('[smoke:genai-v2] FAILED');
    for (const f of failures) console.error('  - ' + f);
    console.error('[smoke:genai-v2] raw response:', JSON.stringify(response, null, 2));
    process.exit(1);
  }

  console.log(
    `[smoke:genai-v2] OK — text=${JSON.stringify(response.text)} ` +
      `prompt=${usage!.promptTokenCount} candidates=${usage!.candidatesTokenCount} ` +
      `total=${usage!.totalTokenCount} elapsedMs=${elapsedMs}`,
  );
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('[smoke:genai-v2] FAILED — call threw:');
  console.error(err);
  process.exit(1);
});
