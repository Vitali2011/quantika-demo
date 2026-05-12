/**
 * β-11: POST /api/agent/plan
 *
 * Body: { goal: string, context?: Record<string, unknown> }
 * Returns: Plan JSON.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/session';
import { buildPlan } from '@/lib/agent/plan-first';

export const dynamic = 'force-dynamic';

const Body = z.object({
  goal: z.string().min(1, 'goal must be non-empty'),
  context: z.record(z.unknown()).optional(),
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
  try {
    const plan = await buildPlan(parsed.data.goal, parsed.data.context ?? {});
    return NextResponse.json(plan, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'plan_failed' },
      { status: 500 },
    );
  }
}
