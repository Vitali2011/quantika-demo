/**
 * β-11: POST /api/agent/execute
 *
 * Body: { planId, plan, approvedStepIds }
 * Returns: ExecutionResult.
 *
 * Idempotent — re-POST с тем же planId возвращает cached ExecutionResult.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { executePlan } from '@/lib/agent/plan-first';
import { PLAN_STEP_KINDS } from '@/lib/agent/plan-types';

export const dynamic = 'force-dynamic';

const StepSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(PLAN_STEP_KINDS as unknown as [string, ...string[]]),
  description: z.string(),
  params: z.record(z.unknown()),
  editable: z.boolean(),
  requires_approval: z.boolean(),
});

const PlanSchema = z.object({
  planId: z.string().min(1),
  goal: z.string().min(1),
  steps: z.array(StepSchema),
  estimated_actions: z.number().int().nonnegative(),
  createdAt: z.string(),
});

const Body = z.object({
  planId: z.string().min(1),
  plan: PlanSchema,
  approvedStepIds: z.array(z.string()),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authResult = requireSession(req);
  if (authResult instanceof NextResponse) return authResult;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { planId, plan, approvedStepIds } = parsed.data;
  if (plan.planId !== planId) {
    return NextResponse.json(
      { error: 'planId_mismatch' },
      { status: 400 },
    );
  }
  try {
    const result = await executePlan(
      plan as Parameters<typeof executePlan>[0],
      approvedStepIds,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'execute_failed' },
      { status: 400 },
    );
  }
}
