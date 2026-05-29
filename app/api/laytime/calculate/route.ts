import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { calculateLaytime } from '@/lib/laytime/calculator';
import { calculateDemurrageDespatch } from '@/lib/laytime/dd-calculator';
import type { LaytimeInput, LaytimeResult, DemurrageDespatchResult } from '@/lib/types';

interface LaytimeCalculateRequest extends LaytimeInput {
  demurrageRateUsdPerDay?: number;
  despatchRateUsdPerDay?: number;
}

interface LaytimeCalculateResponse extends LaytimeResult {
  dd?: DemurrageDespatchResult;
}

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

  let body: LaytimeCalculateRequest;
  try {
    body = await request.json() as LaytimeCalculateRequest;
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

  // Validate demurrageRateUsdPerDay if provided
  if (body.demurrageRateUsdPerDay !== undefined) {
    if (typeof body.demurrageRateUsdPerDay !== 'number' || !Number.isFinite(body.demurrageRateUsdPerDay)) {
      return NextResponse.json(
        { error: 'demurrageRateUsdPerDay must be a finite number' },
        { status: 400 }
      );
    }
  }

  // Validate despatchRateUsdPerDay if provided
  if (body.despatchRateUsdPerDay !== undefined) {
    if (typeof body.despatchRateUsdPerDay !== 'number' || !Number.isFinite(body.despatchRateUsdPerDay)) {
      return NextResponse.json(
        { error: 'despatchRateUsdPerDay must be a finite number' },
        { status: 400 }
      );
    }
  }

  try {
    const laytimeResult: LaytimeResult = calculateLaytime(body);

    let response: LaytimeCalculateResponse = laytimeResult;

    // If demurrageRateUsdPerDay is provided, calculate D/D
    if (body.demurrageRateUsdPerDay !== undefined) {
      const ddResult = calculateDemurrageDespatch({
        laytimeResult,
        demurrageRateUsdPerDay: body.demurrageRateUsdPerDay,
        despatchRateUsdPerDay: body.despatchRateUsdPerDay,
      });
      response = { ...laytimeResult, dd: ddResult };
    }

    return NextResponse.json(response);
  } catch (error) {
    // L-8: log server-side, do not reflect the raw error message to the client.
    console.error('[laytime/calculate] calculation failed:', error);
    return NextResponse.json(
      { error: 'Failed to calculate laytime' },
      { status: 400 }
    );
  }
}
