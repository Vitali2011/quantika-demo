/**
 * β-11 / γv-10: Plan-First / Execute-Second core engine.
 *
 * - buildPlan(goal, context): декомпозирует цель агента в массив PlanStep.
 *   По умолчанию (AGENT_PLANNER_PROVIDER=regex) — детерминированный
 *   rule-based decomposer (heuristics over goal keywords).
 * - planFirst(query): LLM-driven planner через ai-provider shim.
 *   AGENT_PLANNER_PROVIDER=gemini|openai|bedrock → LLM режим.
 *   AGENT_PLANNER_PROVIDER=regex (или не задан) → fallback на detectKinds().
 * - executePlan(plan, approvedStepIds): выполняет ТОЛЬКО approved steps,
 *   остальные skipped. Per-step idempotency через step-cache.
 *
 * Step handlers — placeholder адаптеры. Реальные интеграции
 * (lib/emails, lib/whatsapp, lib/economics) подключаются через регистрацию
 * setStepHandler() — это нужно для тестов с мок side-effect counter'ами.
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  cacheExecution,
  cacheStep,
  getCachedExecution,
  getCachedStep,
} from './idempotency';
import { callAiJson } from '@/lib/ai-provider';
import { logger } from '@/lib/logger';
import { PLAN_STEP_KINDS } from './plan-types';
import type {
  ExecutionResult,
  Plan,
  PlanStep,
  PlanStepKind,
  StepResult,
} from './plan-types';

/**
 * BUG-β-11-PlanCacheReplay: cache key must include the set of approved step
 * ids — otherwise a second executePlan call with an *expanded* approved set
 * silently returns the stale result and skips the newly-authorized side-effect.
 */
function approvedHash(approvedStepIds: string[]): string {
  const sorted = [...approvedStepIds].sort();
  return createHash('sha256').update(sorted.join('|')).digest('hex').slice(0, 16);
}

export type StepHandler = (
  step: PlanStep,
  plan: Plan,
) => Promise<unknown> | unknown;

const handlers = new Map<PlanStepKind, StepHandler>();

const noop: StepHandler = () => ({ ok: true });

function defaultHandlers(): Record<PlanStepKind, StepHandler> {
  return {
    'send-email': noop,
    'send-whatsapp': noop,
    'generate-quote': noop,
    'compare-routes': noop,
    'check-sanctions': noop,
    'check-cii': noop,
    'check-l5c': noop,
    noop,
  };
}

// Initialize on module load.
for (const [kind, h] of Object.entries(defaultHandlers())) {
  handlers.set(kind as PlanStepKind, h);
}

export function setStepHandler(kind: PlanStepKind, handler: StepHandler): void {
  handlers.set(kind, handler);
}

export function resetStepHandlers(): void {
  handlers.clear();
  for (const [kind, h] of Object.entries(defaultHandlers())) {
    handlers.set(kind as PlanStepKind, h);
  }
}

interface BuildOptions {
  /** Override step id generator (tests). */
  idFactory?: () => string;
  /** Override createdAt clock (tests). */
  now?: () => string;
}

/**
 * Rule-based (regex) kind detector — preserved as fallback path.
 * Used when AGENT_PLANNER_PROVIDER=regex (or not set).
 */
export function detectKinds(goal: string): PlanStepKind[] {
  const g = goal.toLowerCase();
  const kinds: PlanStepKind[] = [];
  if (/sanction|ofac|sdn/.test(g)) kinds.push('check-sanctions');
  if (/route|canal|suez|cape/.test(g)) kinds.push('compare-routes');
  if (/cii/.test(g)) kinds.push('check-cii');
  if (/l5c|life.?cycle|carbon/.test(g)) kinds.push('check-l5c');
  if (/quote|prequote|tce|freight rate/.test(g)) kinds.push('generate-quote');
  if (/whatsapp|wa msg/.test(g)) kinds.push('send-whatsapp');
  if (/email|mail|charterer|prequote/.test(g)) kinds.push('send-email');
  if (kinds.length === 0) kinds.push('noop');
  // Dedup, preserve order.
  return Array.from(new Set(kinds));
}

/**
 * Response shape expected from LLM planner.
 */
interface LlmPlannerResponse {
  kinds: string[];
}

const AGENT_PLANNER_SYSTEM = `You are an agentic planner for a freight forwarding AI assistant.

Given a user query, return a JSON object with a "kinds" array listing the step kinds needed.

Valid kinds: ${PLAN_STEP_KINDS.join(', ')}

Rules:
- Use "check-sanctions" for OFAC, SDN, sanctions checks
- Use "compare-routes" for route comparisons (Suez, Cape, canal)
- Use "check-cii" for CII rating/compliance checks
- Use "check-l5c" for L5C lifecycle carbon checks
- Use "generate-quote" for freight quotes, TCE calculations, prequotes
- Use "send-email" for sending emails, forwarding results by email
- Use "send-whatsapp" for sending WhatsApp / WA messages
- Use "noop" ONLY when no specific action is required (informational queries)
- You may include multiple kinds if the query requires multiple actions
- Order: checks before communications (sanctions → route → cii → l5c → quote → whatsapp → email)
- Deduplicate kinds

Return ONLY JSON, no markdown, no explanation.
Example: {"kinds": ["check-sanctions", "send-email"]}`;

/**
 * LLM-driven planner — γv-10.
 *
 * Routing via AGENT_PLANNER_PROVIDER env:
 *   - "regex"  (or unset) → falls back to detectKinds() rule-based logic
 *   - "gemini" → Vertex AI Gemini (default: gemini-2.5-flash)
 *   - "openai" → OpenAI via ClipProxy
 *   - "bedrock" → AWS Bedrock Claude
 *
 * @param query User query to classify into plan step kinds.
 * @returns Array of PlanStepKind values (deduplicated, ordered).
 */
export async function planFirst(query: string): Promise<PlanStepKind[]> {
  const provider = process.env.AGENT_PLANNER_PROVIDER ?? 'regex';

  // Rollback path — use rule-based detectKinds()
  if (provider === 'regex') {
    return detectKinds(query);
  }

  // LLM path — delegate to ai-provider shim.
  // QA M-1: any throw from the LLM call (network error, Vertex 5xx, timeout)
  // must fall back to the deterministic regex planner instead of bubbling up.
  let response: LlmPlannerResponse | null = null;
  try {
    response = await callAiJson<LlmPlannerResponse>(
      'AGENT_PLANNER',
      AGENT_PLANNER_SYSTEM,
      query,
    );
  } catch (err) {
    logger.warn(
      { err, provider, query: query.slice(0, 200) },
      '[plan-first] LLM planner call failed, falling back to detectKinds()',
    );
    return detectKinds(query);
  }

  if (!response || !Array.isArray(response.kinds)) {
    // Defensive fallback: LLM returned unexpected shape
    return detectKinds(query);
  }

  const validKinds = new Set<string>(PLAN_STEP_KINDS);
  const filtered = response.kinds.filter((k): k is PlanStepKind => validKinds.has(k));

  // Ensure we always have at least one kind
  if (filtered.length === 0) {
    return ['noop'];
  }

  // Dedup, preserve order
  return Array.from(new Set(filtered));
}

function describe(kind: PlanStepKind, goal: string): string {
  switch (kind) {
    case 'send-email':
      return `Send email related to: ${goal}`;
    case 'send-whatsapp':
      return `Send WhatsApp message related to: ${goal}`;
    case 'generate-quote':
      return `Generate quote (TCE / freight) for: ${goal}`;
    case 'compare-routes':
      return `Compare voyage routes for: ${goal}`;
    case 'check-sanctions':
      return `Run sanctions / OFAC SDN check for: ${goal}`;
    case 'check-cii':
      return `Check CII rating for: ${goal}`;
    case 'check-l5c':
      return `Check L5C lifecycle-carbon matrix for: ${goal}`;
    case 'noop':
      return `No-op placeholder for: ${goal}`;
  }
}

const SIDE_EFFECT_KINDS: ReadonlySet<PlanStepKind> = new Set([
  'send-email',
  'send-whatsapp',
  'generate-quote',
]);

export async function buildPlan(
  goal: string,
  context: Record<string, unknown> = {},
  opts: BuildOptions = {},
): Promise<Plan> {
  if (typeof goal !== 'string' || goal.trim().length === 0) {
    throw new Error('buildPlan: goal must be non-empty string');
  }
  const id = opts.idFactory ?? randomUUID;
  const clock = opts.now ?? (() => new Date().toISOString());
  const kinds = detectKinds(goal);
  const steps: PlanStep[] = kinds.map((kind) => ({
    id: id(),
    kind,
    description: describe(kind, goal),
    params: { goal, context },
    editable: kind === 'send-email' || kind === 'send-whatsapp' || kind === 'generate-quote',
    requires_approval: SIDE_EFFECT_KINDS.has(kind),
  }));
  return {
    planId: id(),
    goal,
    steps,
    estimated_actions: steps.filter((s) => SIDE_EFFECT_KINDS.has(s.kind)).length,
    createdAt: clock(),
  };
}

export async function executePlan(
  plan: Plan,
  approvedStepIds: string[],
): Promise<ExecutionResult> {
  const approvedSetHash = approvedHash(approvedStepIds);
  const cached = getCachedExecution(plan.planId);
  // BUG-β-11-PlanCacheReplay: only return the cached execution if it was
  // produced from the same approved-set. A widened approved-set must
  // re-execute so newly-authorized side-effects actually run.
  if (
    cached &&
    (cached as ExecutionResult & { approvedSetHash?: string }).approvedSetHash ===
      approvedSetHash
  ) {
    return cached;
  }

  const planStepIds = new Set(plan.steps.map((s) => s.id));
  for (const id of approvedStepIds) {
    if (!planStepIds.has(id)) {
      throw new Error(`executePlan: approved step "${id}" not in plan`);
    }
  }
  const approved = new Set(approvedStepIds);
  const results: StepResult[] = [];

  for (const step of plan.steps) {
    if (!approved.has(step.id)) {
      results.push({ stepId: step.id, status: 'skipped' });
      continue;
    }
    const cachedStep = getCachedStep(plan.planId, step.id);
    if (cachedStep) {
      results.push(cachedStep);
      continue;
    }
    const handler = handlers.get(step.kind);
    let result: StepResult;
    try {
      const out = handler ? await handler(step, plan) : undefined;
      result = { stepId: step.id, status: 'success', output: out };
    } catch (err) {
      result = {
        stepId: step.id,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      };
    }
    cacheStep(plan.planId, result);
    results.push(result);
  }

  const execution: ExecutionResult & { approvedSetHash?: string } = {
    planId: plan.planId,
    stepResults: results,
    completedAt: new Date().toISOString(),
    approvedSetHash,
  };
  cacheExecution(plan.planId, execution);
  return execution;
}
