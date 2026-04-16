import { NextResponse } from 'next/server';
import { loadDemoScenarios } from '@/lib/sample-data/demo-scenarios';

/**
 * Read-only fixture endpoint.
 *
 * GET /api/demo-scenarios/:id  →  returns the full scenario (narrative, cargo,
 * vessel, expectedOutcome) so the UI can render a walkthrough for brokers.
 * Does not mutate session — this is demo material, not a seeding mechanism.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const scenarios = loadDemoScenarios();
  const sc = scenarios.find(s => s.id === id);
  if (!sc) {
    return NextResponse.json({ error: 'scenario not found' }, { status: 404 });
  }
  return NextResponse.json(sc);
}
