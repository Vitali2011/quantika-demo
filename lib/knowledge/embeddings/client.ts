/**
 * Vertex AI embedding client (text-multilingual-embedding-002)
 *
 * Input contract:
 * - Empty texts array → returns [] (no API call)
 * - Batches > 250 → splits into multiple calls
 * - GCP API errors (e.g., 429) → bubbles to caller
 * - text > 2048 chars → API truncates silently (autoTruncate:false logs warning if needed)
 * - taskType required (TypeScript enforces TaskType enum)
 * - GOOGLE_CLOUD_PROJECT via env, defaults to 'quantika-demo-2026'
 * - Uses ADC (GOOGLE_APPLICATION_CREDENTIALS env or default) — NO hardcoded service account path
 */

import { PredictionServiceClient } from "@google-cloud/aiplatform";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? "quantika-demo-2026";
const LOCATION = "us-central1";
const MODEL = "text-multilingual-embedding-002";
const DIMENSIONS = 768;
const MAX_BATCH = 250;
// Vertex AI text-multilingual-embedding-002 limit: 20K tokens/request (≈ 4 chars/token)
// Use 76K chars (~19K tokens) as safe upper bound per API call
const MAX_CHARS_PER_BATCH = 76_000;

const client = new PredictionServiceClient({
  apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`,
});

export type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY";

/**
 * Embeds multiple texts using Vertex AI text-multilingual-embedding-002.
 *
 * @param texts - Array of text strings to embed (empty array returns [])
 * @param taskType - Task type for embeddings (RETRIEVAL_DOCUMENT | RETRIEVAL_QUERY | SEMANTIC_SIMILARITY)
 * @returns Array of Float32Array embeddings (768 dimensions each)
 *
 * Batching: splits into batches of MAX_BATCH (250) for Vertex API limits
 * Error handling: bubbles GCP API errors to caller (e.g., 429 rate limit)
 */
export async function embed(texts: string[], taskType: TaskType): Promise<Float32Array[]> {
  // Empty array guard — no API call
  if (texts.length === 0) {
    return [];
  }

  const out: Float32Array[] = [];

  // Batch by item count (MAX_BATCH) AND total char count (MAX_CHARS_PER_BATCH)
  let batchStart = 0;
  while (batchStart < texts.length) {
    let batchEnd = batchStart;
    let batchChars = 0;
    while (
      batchEnd < texts.length &&
      batchEnd - batchStart < MAX_BATCH &&
      batchChars + texts[batchEnd].length <= MAX_CHARS_PER_BATCH
    ) {
      batchChars += texts[batchEnd].length;
      batchEnd++;
    }
    // Always advance at least 1 to prevent infinite loop on a single over-limit text
    if (batchEnd === batchStart) batchEnd = batchStart + 1;
    const batch = texts.slice(batchStart, batchEnd);
    batchStart = batchEnd;

    const [response] = await client.predict({
      endpoint: `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}`,
      instances: batch.map((content) => ({
        structValue: {
          fields: {
            content: { stringValue: content },
            task_type: { stringValue: taskType },
          },
        },
      })) as any,
      parameters: {
        structValue: { fields: { autoTruncate: { boolValue: false } } },
      } as any,
    });

    // Extract embeddings from response
    for (const pred of response.predictions ?? []) {
      const values = (
        pred as any
      ).structValue.fields.embeddings.structValue.fields.values.listValue.values.map(
        (v: any) => v.numberValue
      );
      out.push(new Float32Array(values));
    }
  }

  return out;
}

/**
 * Embeds documents for retrieval indexing (RETRIEVAL_DOCUMENT task type).
 */
export const embedDocuments = (texts: string[]) => embed(texts, "RETRIEVAL_DOCUMENT");

/**
 * Embeds a single query for retrieval (RETRIEVAL_QUERY task type).
 * Returns the first (and only) embedding.
 */
export const embedQuery = (text: string) => embed([text], "RETRIEVAL_QUERY").then((arr) => arr[0]);
