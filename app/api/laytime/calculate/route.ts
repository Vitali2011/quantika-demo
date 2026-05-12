import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { calculateLaytime } from '@/lib/laytime/calculator';
import type { LaytimeInput, LaytimeResult } from '@/lib/types';

export const maxDuration = 10;

export async function POST(request: NextRequest) {
  if (process.env.LAYTIME_ENGINE_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'Laytime Engine is not enabled' },
      { status: 503 }
    );
  }

  if (!validateCsrf(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: LaytimeInput;
  try {
    body = await request.json() as LaytimeInput;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 });
  }

  if (
    typeof body.allowedLaytimeDays !== 'number' ||
    typeof body.mode !== 'string' ||
    typeof body.commencedAt !== 'string' ||
    typeof body.completedAt !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Missing required fields: allowedLaytimeDays, mode, commencedAt, completedAt' },
      { status: 400 }
    );
  }

  if (body.allowedLaytimeDays <= 0) {
    return NextResponse.json(
      { error: 'allowedLaytimeDays must be greater than 0' },
      { status: 400 }
    );
  }

  const commencedDate = new Date(body.commencedAt);
  if (isNaN(commencedDate.getTime())) {
    return NextResponse.json(
      { error: 'commencedAt must be a valid ISO 8601 date' },
      { status: 400 }
    );
  }

  const completedDate = new Date(body.completedAt);
  if (isNaN(completedDate.getTime())) {
    return NextResponse.json(
      { error: 'completedAt must be a valid ISO 8601 date' },
      { status: 400 }
    );
  }

  if (commencedDate > completedDate) {
    return NextResponse.json(
      { error: 'commencedAt must be before or equal to completedAt' },
      { status: 400 }
    );
  }

  try {
    const result: LaytimeResult = calculateLaytime(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to calculate laytime', details: message },
      { status: 400 }
    );
  }
}
