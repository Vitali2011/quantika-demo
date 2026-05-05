/**
 * Bake-off orchestrator for Wave γ parsing comparison.
 *
 * Iterates the corpus × endpoints × MODELS, dispatches each (case, endpoint,
 * model) triple as a concurrent task limited by p-limit, and feeds successful
 * candidate outputs to the Opus 4.7 cold-session judge. Records are streamed
 * to a JSONL file so a partial run is salvageable on crash.
 *
 * Mode is chosen per (case, endpoint): if a reference exists in
 * `case.references[endpoint]`, Mode A; otherwise Mode B (the production case
 * since `ai_audit` lacks `response_text` — see corpus.ts header).
 *
 * Anti-bias: MODELS are shuffled per (case, endpoint) so the same model is not
 * always "Candidate-A". The judge sees only the anonymous label
 * (`Candidate-A`, `Candidate-B`, …) — never the real model id — and the call
 * order itself is randomized so judge-side ordering bias also washes out.
 */

import { existsSync, mkdirSync, appendFileSync, openSync, closeSync } from 'node:fs';
import path from 'node:path';
import pLimit from 'p-limit';

import { loadCorpus as loadCorpusReal, type CorpusCase, type Endpoint } from './corpus';
import { getEndpointSpec as getEndpointSpecReal, type EndpointSpec } from './endpoint-specs';
import {
  runCandidate as runCandidateReal,
  MODELS,
  type ModelEntry,
  type RunCandidateInput,
  type RunCandidateResult,
} from './run-candidate';
import {
  judge as judgeReal,
  type JudgeInput,
  type JudgeOutput,
  type JudgeOptions,
  type CallAiTextFn,
} from './judge';

/**
 * Dependency-injection seam. Tests pass mocks here; production callers leave
 * it `undefined` and get the real sibling-module bindings. We avoid
 * `jest.mock('../foo', ...)` because relative-path module mocking with
 * ts-jest + Next.js's nextJest preset is brittle (mirrors `judge.test.ts`'s
 * design choice — use injection, skip module mocks).
 */
export interface BakeOffDeps {
  loadCorpus?: () => Promise<CorpusCase[]>;
  getEndpointSpec?: (endpoint: Endpoint) => EndpointSpec;
  runCandidate?: (input: RunCandidateInput) => Promise<RunCandidateResult>;
  judge?: (input: JudgeInput, options?: JudgeOptions) => Promise<JudgeOutput>;
}

export interface BakeOffOptions {
  outDir: string;
  /** Override corpus loader (mostly for tests). */
  corpus?: CorpusCase[];
  /** Override model list (e.g. partial reruns). */
  models?: readonly ModelEntry[];
  /** Allowlist of model ids to run. */
  modelFilter?: string[];
  /** Allowlist of endpoints to run. */
  endpointFilter?: Endpoint[];
  /** p-limit concurrency. Defaults to 5. */
  concurrency?: number;
  /** Optional injected judge `callAiText` (for tests). */
  judgeCallAiText?: CallAiTextFn;
  /** Optional progress sink. Defaults to process.stderr. */
  progress?: (line: string) => void;
  /** Test-only DI seam — see `BakeOffDeps`. */
  deps?: BakeOffDeps;
}

export interface BakeOffRecord {
  runId: string;
  caseId: string;
  endpoint: Endpoint;
  model: string;
  candidateLabel: string;
  candidateOutput: unknown | null;
  parseError?: string;
  modelError?: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  judgeMode: 'A' | 'B';
  judge: JudgeOutput | null;
  judgeError?: string;
}

export interface BakeOffResult {
  records: BakeOffRecord[];
  runId: string;
  jsonlPath: string;
}

/** Fisher-Yates shuffle (returns a new array, leaves input untouched). */
function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function makeRunId(): string {
  // ISO with colons/dots replaced for filesystem safety
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export async function runBakeOff(opts: BakeOffOptions): Promise<BakeOffResult> {
  const runId = makeRunId();
  const outDir = path.join(opts.outDir, runId);
  mkdirSync(outDir, { recursive: true });

  const jsonlPath = path.join(outDir, 'records.jsonl');
  // Touch the file so callers can rely on it existing even for empty runs.
  if (!existsSync(jsonlPath)) {
    closeSync(openSync(jsonlPath, 'a'));
  }

  const progress = opts.progress ?? ((line: string) => process.stderr.write(line + '\n'));

  const loadCorpusFn = opts.deps?.loadCorpus ?? loadCorpusReal;
  const getEndpointSpecFn = opts.deps?.getEndpointSpec ?? getEndpointSpecReal;
  const runCandidateFn = opts.deps?.runCandidate ?? runCandidateReal;
  const judgeFn = opts.deps?.judge ?? judgeReal;

  // Load corpus (or use injected). Apply optional cases limit for smoke runs.
  const corpusFull = opts.corpus ?? (await loadCorpusFn());
  const maxCases = parseInt(process.env.BAKE_OFF_LIMIT_CASES ?? '9999', 10);
  const corpus = corpusFull.slice(0, Number.isFinite(maxCases) ? maxCases : corpusFull.length);

  const models = opts.models ?? MODELS;
  const modelsFiltered = opts.modelFilter
    ? models.filter((m) => opts.modelFilter!.includes(m.id))
    : models;

  const endpointFilter = opts.endpointFilter;

  const limit = pLimit(opts.concurrency ?? 5);
  const records: BakeOffRecord[] = [];

  const tasks: Promise<void>[] = [];

  for (const cse of corpus) {
    const endpoints = endpointFilter
      ? cse.endpoints.filter((e) => endpointFilter.includes(e))
      : cse.endpoints;

    for (const endpoint of endpoints) {
      const spec = getEndpointSpecFn(endpoint);
      const reference = cse.references[endpoint] ?? null;
      const judgeMode: 'A' | 'B' = reference ? 'A' : 'B';

      const shuffled = shuffle(modelsFiltered);
      shuffled.forEach((model, idx) => {
        const candidateLabel = `Candidate-${String.fromCharCode(65 + idx)}`;
        tasks.push(
          limit(async () => {
            const cand: RunCandidateResult = await runCandidateFn({
              model,
              systemPrompt: spec.systemPrompt,
              userInput: cse.email,
            });

            let judgeRes: JudgeOutput | null = null;
            let judgeError: string | undefined;
            const canJudge = !cand.modelError && cand.outputJson !== null;
            if (canJudge) {
              try {
                judgeRes = await judgeFn(
                  {
                    mode: judgeMode,
                    systemPrompt: spec.systemPrompt,
                    email: cse.email,
                    reference,
                    candidate: cand.outputJson,
                    candidateLabel,
                  },
                  opts.judgeCallAiText ? { callAiText: opts.judgeCallAiText } : {},
                );
              } catch (e) {
                judgeError = e instanceof Error ? e.message : String(e);
              }
            }

            const record: BakeOffRecord = {
              runId,
              caseId: cse.id,
              endpoint,
              model: model.id,
              candidateLabel,
              candidateOutput: cand.outputJson,
              parseError: cand.parseError,
              modelError: cand.modelError,
              latencyMs: cand.latencyMs,
              inputTokens: cand.inputTokens,
              outputTokens: cand.outputTokens,
              costUsd: cand.costUsd,
              judgeMode,
              judge: judgeRes,
              judgeError,
            };
            records.push(record);
            appendFileSync(jsonlPath, JSON.stringify(record) + '\n');

            const verdict = judgeRes?.verdict ?? (cand.modelError ? `ERROR:${cand.modelError.slice(0, 40)}` : judgeError ? 'JUDGE_ERROR' : 'NO_JUDGE');
            progress(`.  ${endpoint}/${model.id}/${cse.id} -> ${verdict}`);
          }),
        );
      });
    }
  }

  await Promise.all(tasks);

  return { records, runId, jsonlPath };
}
