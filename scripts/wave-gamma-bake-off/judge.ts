/**
 * Opus 4.7 cold-session judge for Wave γ parsing bake-off.
 *
 * Wraps `@anthropic-ai/sdk` with a strict-JSON system prompt that grades a
 * candidate parser output against a reference (Mode A) or against the
 * endpoint's spec coverage alone (Mode B — production case, since Mode B
 * GLOBAL ai_audit doesn't store `response_text` so `reference` arrives null).
 *
 * Returns a 5-tier verdict + side-by-side diff + issue list. The candidate's
 * model identity is intentionally hidden behind `candidateLabel` ("Candidate-A"
 * etc.) so the judge can't anchor on provider reputation.
 *
 * Env: ANTHROPIC_API_KEY required at runtime (not at import time — the SDK
 * lazy-validates on first request).
 */

import Anthropic from '@anthropic-ai/sdk';

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

/** Model id used for the judge. Matches lib/ai-provider.ts naming style. */
export const JUDGE_MODEL = 'claude-opus-4-7';

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

/** Minimal client surface used by the judge — facilitates test injection. */
export interface JudgeClient {
  messages: {
    create(args: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: 'user'; content: string }>;
    }): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

export interface JudgeOptions {
  /**
   * Optional pre-constructed client (for tests). If omitted, a real
   * `Anthropic` SDK client is constructed lazily — which requires
   * `ANTHROPIC_API_KEY` in env.
   */
  client?: JudgeClient;
}

export async function judge(input: JudgeInput, options: JudgeOptions = {}): Promise<JudgeOutput> {
  const anthropic: JudgeClient = options.client ?? (new Anthropic() as unknown as JudgeClient);

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

  const resp = await anthropic.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 2048,
    system: JUDGE_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = resp.content.find(
    (b: { type: string }) => b.type === 'text',
  ) as { type: 'text'; text: string } | undefined;

  if (!textBlock) {
    throw new Error('Judge returned no text block in response content');
  }

  const cleaned = stripFences(textBlock.text);

  try {
    return JSON.parse(cleaned) as JudgeOutput;
  } catch (err) {
    const snippet = cleaned.slice(0, 240);
    throw new Error(
      `Judge response failed to parse as JSON: ${(err as Error).message}. Raw snippet: ${JSON.stringify(snippet)}`,
    );
  }
}
