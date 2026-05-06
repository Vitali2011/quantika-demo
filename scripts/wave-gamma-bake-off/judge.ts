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

Be FAIR, not punitive. Imperfection is normal in extraction tasks — only structural failures are critical.

You receive:
- The endpoint's system prompt (defines required/optional fields and semantics).
- The original email/text input.
- A reference output (a strong in-house baseline) — may be null in Mode B.
- A candidate output (anonymous label "Candidate-X").

Your job: evaluate the CANDIDATE on whether it works in production. Do NOT speculate which model produced it. Do NOT mark every minor imperfection as critical.

Severity rules — READ CAREFULLY, this is the most common calibration error:

- "crit" is reserved ONLY for STRUCTURAL failures:
  * Output is not valid JSON / unparseable.
  * A required field (per the system prompt) is completely missing or has a nonsense value (e.g. cargo_quantity = "lorem ipsum").
  * Wrong JSON type for a required field (string where number required, etc.).
  * Hallucinated fields/values not derivable from the input (entity names that aren't in the email).
- "high" — a required field is present but materially wrong (wrong port, wrong quantity by an order of magnitude).
- "med" — present-but-imperfect: slight format mismatch, lossy extraction, ambiguous interpretation, missing optional field clearly present in input.
- "low" — cosmetic / debatable / could-be-better.

If output is valid JSON, has required fields with plausible values, and contains no hallucinations — there are NO crit issues, period. "Slightly wrong format" is med, never crit. "Could have extracted more" is low/med, never crit.

Verdict ladder:

Mode A (reference available):
- PASS_BETTER: candidate caught something the reference missed, or is more precise on a non-trivial field.
- PASS_PARITY: equivalent quality, or differences are inconsequential. **DEFAULT when both outputs are functionally usable.**
- PASS_DEGRADED: candidate is usable but missed an optional field the reference has.
- PASS_MARGINAL: required fields present but weakly extracted. Reserve for cases with at least one "high" issue.
- FAIL: structural failure (at least one "crit" issue per rules above).

Mode B (no reference) — same ladder, with these defaults:
- DEFAULT to PASS_PARITY if: JSON valid, all required fields present with plausible values, no hallucinations.
- PASS_DEGRADED only if a required-or-clearly-implied optional field from the spec is missing.
- PASS_MARGINAL only if there's at least one "high" issue.
- FAIL only if there's at least one "crit" issue.
- In Mode B, set every diff entry's reference_value to null.

Calibration examples:

Example 1 (IS crit + FAIL):
  Spec requires items[].cargo_quantity (number).
  Candidate: { items: [{ cargo_name: "wheat" }] }  // cargo_quantity missing
  → severity=crit, verdict=FAIL — required field missing.

Example 2 (IS crit + FAIL):
  Candidate: "Sure, here's the JSON: {items: [...]"  // unparseable
  → severity=crit, format_validity=0, verdict=FAIL — invalid JSON.

Example 3 (NOT crit — PASS_PARITY):
  Spec: extract laycan window. Email: "laycan 10-15 Mar".
  Candidate: { laycan_start: "2026-03-10", laycan_end: "2026-03-15" }  // year inferred
  → severity=med at most (year inference plausible), verdict=PASS_PARITY.

Example 4 (NOT crit — PASS_PARITY or PASS_DEGRADED):
  Candidate captured 3 of 4 cargo items. Reference captured 4.
  → severity=med (lossy), verdict=PASS_DEGRADED (Mode A) or PASS_PARITY (Mode B if reference equally lossy).
  Do NOT call this crit just because something was missed.

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
  // Bedrock Opus 4.7 has tight per-account TPM throttles. Retry on
  // "Too many tokens"/ThrottlingException-style errors with exponential
  // backoff + jitter. Up to 5 attempts (~31s worst-case wait).
  const maxAttempts = 5;
  let rawText = '';
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      rawText = await callFn(JUDGE_SCOPE, JUDGE_PROMPT, userMessage, {
        model: resolveJudgeModel(),
        maxTokens: JUDGE_MAX_TOKENS,
      });
      lastErr = undefined;
      break;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      const isThrottle = /too many tokens|throttl|rate.?limit|429|ServiceUnavailable|503/i.test(msg);
      if (!isThrottle || attempt === maxAttempts - 1) throw e;
      const baseMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s, 8s, 16s
      const jitter = Math.floor(Math.random() * 500);
      await new Promise((r) => setTimeout(r, baseMs + jitter));
    }
  }
  if (lastErr) throw lastErr;

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
