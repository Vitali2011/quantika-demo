/**
 * progonq revalidation parser runner.
 * - Resumable: skips cases with valid non-fallback output already in run.json
 * - Retry on 429: parses reset_seconds and sleeps; falls back to 60s if missing
 * - Atomic write of run.json (tmp + rename)
 *
 * Usage: AI_MODEL_HEAVY=gpt-5.5 npx tsx --tsconfig tsconfig.json .progonq/scripts/run-parser.ts <round>
 */
import { promises as fs } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { CLIPROXY_BASE_URL, CLIPROXY_API_KEY } from '../../lib/constants';
import { MATCH_PROMPT } from '../../lib/prompts/match';

interface CorpusSample {
  id: string;
  category: string;
  edge_case_summary: string;
  input: {
    cargo_inquiries: unknown[];
    vessel_positions: unknown[];
    readiness?: unknown[];
  };
}

interface RunOutput {
  case_id: string;
  category: string;
  edge_case_summary: string;
  input: CorpusSample['input'];
  parser_output: { matches: unknown[] } | null;
  error?: string;
  duration_ms: number;
  attempts: number;
}

const ai = new OpenAI({ apiKey: CLIPROXY_API_KEY, baseURL: CLIPROXY_BASE_URL });
const MODEL = process.env.AI_MODEL_HEAVY || 'gpt-5.5';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callOnce(payload: string): Promise<{ matches: unknown[] }> {
  const stream = await ai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: MATCH_PROMPT },
      { role: 'user', content: payload },
    ],
    stream: true,
    temperature: 0.1,
    max_tokens: 16000,
  });
  let content = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) content += delta;
  }
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  if (!cleaned) throw new Error('empty content');
  return JSON.parse(cleaned);
}

async function callWithRetry(payload: string): Promise<{ output: { matches: unknown[] }; attempts: number }> {
  let attempts = 0;
  let lastErr: unknown = null;
  while (attempts < 6) {
    attempts += 1;
    try {
      const output = await callOnce(payload);
      return { output, attempts };
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Detect 429 model_cooldown
      const cooldownMatch = msg.match(/cooling down/i) || (err as { status?: number })?.status === 429;
      const resetMatch = JSON.stringify(err).match(/"reset_seconds":(\d+)/);
      if (cooldownMatch && resetMatch) {
        const wait = Math.min(parseInt(resetMatch[1], 10) + 5, 3600);
        console.error(`[retry ${attempts}] 429 cooldown, sleeping ${wait}s`);
        await sleep(wait * 1000);
        continue;
      }
      // Other errors: short backoff
      const wait = 5 * attempts;
      console.error(`[retry ${attempts}] ${msg} — backoff ${wait}s`);
      await sleep(wait * 1000);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function loadCorpus(corpusRoot: string): Promise<CorpusSample[]> {
  const samples: CorpusSample[] = [];
  const cats = await fs.readdir(corpusRoot, { withFileTypes: true });
  for (const d of cats) {
    if (!d.isDirectory()) continue;
    const dir = path.join(corpusRoot, d.name);
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'));
    for (const f of files) samples.push(JSON.parse(await fs.readFile(path.join(dir, f), 'utf-8')));
  }
  samples.sort((a, b) => a.id.localeCompare(b.id));
  return samples;
}

async function loadExisting(finalPath: string): Promise<Map<string, RunOutput>> {
  try {
    const raw = await fs.readFile(finalPath, 'utf-8');
    const arr = JSON.parse(raw) as RunOutput[];
    const m = new Map<string, RunOutput>();
    for (const r of arr) m.set(r.case_id, r);
    return m;
  } catch {
    return new Map();
  }
}

function isComplete(r: RunOutput | undefined, sample: CorpusSample): boolean {
  if (!r) return false;
  if (r.error) return false;
  if (!r.parser_output) return false;
  const readinessLen = (sample.input.readiness || []).length;
  const matchesLen = (r.parser_output.matches || []).length;
  // Heuristic: if readiness > 0 but matches == 0 AND output is the fallback, treat as incomplete
  // (production-valid empty matches happen only when readiness is also empty after pre-filter)
  if (readinessLen > 0 && matchesLen === 0) return false;
  return true;
}

async function writeAtomic(p: string, data: unknown) {
  const tmp = `${p}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, p);
}

async function main() {
  const round = process.argv[2] || 'R1';
  const corpusRoot = path.resolve(__dirname, '..', 'corpus');
  const outDir = path.resolve(__dirname, '..', 'results', `revalidation-${round}`);
  await fs.mkdir(outDir, { recursive: true });
  const finalPath = path.join(outDir, 'run.json');

  const samples = await loadCorpus(corpusRoot);
  const existing = await loadExisting(finalPath);
  console.error(`[run-parser] ${samples.length} samples; ${existing.size} existing entries`);

  const results: RunOutput[] = [];
  let i = 0;
  for (const sample of samples) {
    i += 1;
    const prior = existing.get(sample.id);
    if (isComplete(prior, sample)) {
      results.push(prior!);
      console.error(`[${i}/${samples.length}] ${sample.id} — skip (complete)`);
      continue;
    }
    const t0 = Date.now();
    let output: { matches: unknown[] } | null = null;
    let errMsg: string | undefined;
    let attempts = 0;
    try {
      const r = await callWithRetry(JSON.stringify(sample.input));
      output = r.output;
      attempts = r.attempts;
    } catch (e) {
      errMsg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
    const dt = Date.now() - t0;
    console.error(
      `[${i}/${samples.length}] ${sample.id} — ${dt}ms ${errMsg ? 'ERR ' + errMsg.slice(0, 80) : `ok matches=${output?.matches?.length ?? 0} attempts=${attempts}`}`,
    );
    results.push({
      case_id: sample.id,
      category: sample.category,
      edge_case_summary: sample.edge_case_summary,
      input: sample.input,
      parser_output: output,
      error: errMsg,
      duration_ms: dt,
      attempts,
    });
    await writeAtomic(finalPath, results);
  }

  console.error(`[run-parser] Done. Wrote ${results.length} cases to ${finalPath}`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
