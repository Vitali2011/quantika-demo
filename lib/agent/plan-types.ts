/**
 * β-11: Plan-First / Execute-Second — shared types.
 *
 * Foundation for agentic workflow: agent proposes Plan → user approves
 * (optionally edits/rejects steps) → executePlan runs only approved steps.
 *
 * Reused by β-12 (gmail scoring), β-15 (auto-prequote-engine).
 */

export type PlanStepKind =
  | 'send-email'
  | 'send-whatsapp'
  | 'generate-quote'
  | 'compare-routes'
  | 'check-sanctions'
  | 'check-cii'
  | 'check-l5c'
  | 'noop';

export const PLAN_STEP_KINDS: readonly PlanStepKind[] = [
  'send-email',
  'send-whatsapp',
  'generate-quote',
  'compare-routes',
  'check-sanctions',
  'check-cii',
  'check-l5c',
  'noop',
] as const;

export interface PlanStep {
  id: string;
  kind: PlanStepKind;
  description: string;
  params: Record<string, unknown>;
  editable: boolean;
  requires_approval: boolean;
}

export interface Plan {
  planId: string;
  goal: string;
  steps: PlanStep[];
  estimated_actions: number;
  createdAt: string;
}

export type StepStatus = 'success' | 'skipped' | 'failed';

export interface StepResult {
  stepId: string;
  status: StepStatus;
  output?: unknown;
  error?: string;
}

export interface ExecutionResult {
  planId: string;
  stepResults: StepResult[];
  completedAt: string;
}
