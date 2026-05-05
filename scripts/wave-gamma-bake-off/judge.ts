/**
 * Opus 4.7 cold-session judge for Wave γ parsing bake-off.
 *
 * Routes through the project's `lib/ai-provider.ts` shim with provider="bedrock"
 * so the judge uses the same AWS Bedrock cross-region inference profile as the
 * production `match` endpoint. This project has no direct ANTHROPIC_API_KEY —
 * all Anthropic traffic goes via Bedrock.
 *
 * Returns a 5-tier verdict + side-by-side diff + issue list. The candidate's
 * model identity is intentionally hidden behind `candidateLabel` ("Candidate-A"
 * etc.) so the judge can't anchor on provider reputation.
 *
 * Env (Bedrock branch in lib/ai-provider.ts requires):
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, BEDROCK_MODEL_ID.
 * BEDROCK_MODEL_ID can be set globally; we still pass `model` explicitly to
 * pin the judge to Opus regardless of the project default.
 */

import { callAiText as defaultCallAiText } from '@/lib/ai-provider';

export type Verdict =
  | 'PASS_BETTER'
  | 'PASS_PARITY'
  | 'PASS_DEGRADED'
  | 'PASS_MARGINAL'
  | 'FAIL';

export interface JudgeInput {
  mode: 'A' | 'B';
  /** Endpoint's parser system prompt — defines what to extract / required fields. */
  systemPrompt: string;
  /** Original input (email body / text). */
  email: string;
  /** gpt-5.5 prior output for Mode A; null in Mode B. */
  reference: unknown | null;
  /** Model output to judge. */
  candidate: unknown;
  /** Anonymous label, e.g. "Candidate-A". Hides actual model identity. */
  candidateLabel: string;
}

export interface JudgeIssue {
  field: string;
  severity: 'low' | 'med' | 'high' | 'crit';
  what: string;
}

export interface JudgeDiffEntry {
  field: string;
  reference_value: unknown;
  candidate_value: unknown;
  match: boolean | 'partial';
  comment: string;
}

export interface JudgeOutput {
  completeness: number; // 0-100
  accuracy: number; // 0-100
  format_validity: 0 | 1;
  issues: JudgeIssue[];
  side_by_side_diff: JudgeDiffEntry[];
  verdict: Verdict;
  rationale: string;
}

/**
 * Bedrock cross-region inference profile for Opus 4.7.
 *
 * Resolution order:
 *   1. JUDGE_BEDROCK_MODEL env (explicit override for the bake-off judge)
 *   2. BEDROCK_MODEL_ID env (project-wide Bedrock default, e.g.
 *      "us.anthropic.claude-opus-4-7-20260415-v1:0" from .env.local)
 *   3. Hard-coded fallback to the cross-region profile alias.
 *
 * We resolve at call time, not import time, so tests can override via env.
 */
export function resolveJudgeModel(): string {
  return (
    process.env.JUDGE_BEDROCK_MODEL ||
    process.env.BEDROCK_MODEL_ID ||
    'us.anthropic.claude-opus-4-7'
  );
}

/** Public constant kept for tests asserting the static fallback alias. */
export const JUDGE_MODEL = 'us.anthropic.claude-opus-4-7';

/** Scope tag used for ai_audit rows when the judge runs. */
export const JUDGE_SCOPE = 'wave_gamma_judge';

/** Max tokens budget for judge response. */
const JUDGE_MAX_TOKENS = 2048;

const JUDGE_PROMPT = `You are a cold-session adversarial QA reviewer for a parsing endpoint output.

You receive:
- The endpoint's system prompt (defines required/optional fields and semantics).
- The original email/text input.
- A reference output (the previous production system, gpt-5.5) — may be null in Mode B.
- A candidate output (anonymous label "Candidate-X").

Your job: evaluate the CANDIDATE strictly. Do NOT speculate which model produced it. Do NOT lower the bar because the candidate is "creative". Required fields missing = FAIL. Hallucinated fields = FAIL.

Verdict ladder (Mode A — reference available):
- PASS_BETTER: candidate caught something gpt-5.5 missed, or is more precise.
- PASS_PARITY: equivalent quality.
- PASS_DEGRADED: works but missed an optional field present in reference.
- PASS_MARGINAL: required fields present but weakly extracted (low precision, ambiguous).
- FAIL: structural failure / hallucination / required field missing / invalid JSON shape.

Mode B (no reference): same ladder, but PASS_BETTER/PASS_DEGRADED derive from spec coverage of optional/required fields rather than vs the reference. In Mode B, set every diff entry's reference_value to null.

Return STRICT JSON only — no prose before/after, no markdown fences — matching this schema:
{
  "completeness": 0-100,
  "accuracy": 0-100,
  "format_validity": 0|1,
  "issues": [{"field":"...", "severity":"low|med|high|crit", "what":"..."}],
  "side_by_side_diff": [{"field":"...", "reference_value": <any|null>, "candidate_value": <any>, "match": true|false|"partial", "comment":"..."}],
  "verdict": "PASS_BETTER|PASS_PARITY|PASS_DEGRADED|PASS_MARGINAL|FAIL",
  "rationale": "2-3 sentences"
}
`;

/**
 * Strip ```json ... ``` fences if Opus added them despite instructions.
 * Conservative: only strips a leading fence and a trailing fence.
 */
function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/**
 * Function-shaped DI seam matching the signature of `lib/ai-provider.callAiText`.
 * Tests inject a fake; production wires the real shim with provider=bedrock.
 */
export type CallAiTextFn = (
  scope: string,
  system: string,
  user: string,
  opts?: { model?: string; maxTokens?: number; timeoutMs?: number; signal?: AbortSignal },
) => Promise<string>;

export interface JudgeOptions {
  /**
   * Optional injected `callAiText` (for tests). Production omits this — the
   * default is the real shim from `@/lib/ai-provider`, configured via
   * `BAKE_OFF_JUDGE_PROVIDER` (or AI_PROVIDER) — set to "bedrock" so the
   * shim routes to AWS Bedrock Opus 4.7.
   */
  callAiText?: CallAiTextFn;
}

export async function judge(input: JudgeInput, options: JudgeOptions = {}): Promise<JudgeOutput> {
  const callFn: CallAiTextFn = options.callAiText ?? defaultCallAiText;

  // User message: structured payload. We do NOT include the candidate's actual
  // model id — only the anonymous label.
  const userMessage = JSON.stringify(
    {
      mode: input.mode,
      endpoint_system_prompt: input.systemPrompt,
      email: input.email,
      reference: input.reference,
      candidate_label: input.candidateLabel,
      candidate_output: input.candidate,
    },
    null,
    2,
  );

  // Pin the judge model explicitly — independent of any per-scope BEDROCK_MODEL_ID
  // override the project may use elsewhere.
  const rawText = await callFn(JUDGE_SCOPE, JUDGE_PROMPT, userMessage, {
    model: resolveJudgeModel(),
    maxTokens: JUDGE_MAX_TOKENS,
  });

  if (!rawText || rawText.trim().length === 0) {
    throw new Error('Judge returned no text block in response content');
  }

  const cleaned = stripFences(rawText);

  try {
    return JSON.parse(cleaned) as JudgeOutput;
  } catch (err) {
    const snippet = cleaned.slice(0, 240);
    throw new Error(
      `Judge response failed to parse as JSON: ${(err as Error).message}. Raw snippet: ${JSON.stringify(snippet)}`,
    );
  }
}
