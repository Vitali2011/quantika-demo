/**
 * β-11: Plan-First / Execute-Second core engine.
 *
 * - buildPlan(goal, context): декомпозирует цель агента в массив PlanStep.
 *   Без LLM — детерминированный rule-based decomposer (heuristics over goal
 *   keywords). Достаточно для foundation; LLM-driven вариант — β-15.
 * - executePlan(plan, approvedStepIds): выполняет ТОЛЬКО approved steps,
 *   остальные skipped. Per-step idempotency через step-cache.
 *
 * Step handlers — placeholder адаптеры. Реальные интеграции
 * (lib/emails, lib/whatsapp, lib/economics) подключаются через регистрацию
 * setStepHandler() — это нужно для тестов с мок side-effect counter'ами.
 */

import { randomUUID } from 'node:crypto';
import {
  cacheExecution,
  cacheStep,
  getCachedExecution,
  getCachedStep,
} from './idempotency';
import type {
  ExecutionResult,
  Plan,
  PlanStep,
  PlanStepKind,
  StepResult,
} from './plan-types';

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

function detectKinds(goal: string): PlanStepKind[] {
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
  const cached = getCachedExecution(plan.planId);
  if (cached) return cached;

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

  const execution: ExecutionResult = {
    planId: plan.planId,
    stepResults: results,
    completedAt: new Date().toISOString(),
  };
  cacheExecution(plan.planId, execution);
  return execution;
}
