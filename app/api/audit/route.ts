import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkCsrfRequest } from '@/lib/csrf';
import { requireSession } from '@/lib/session';
import { logAuditEvent, getAuditTrail, getAuditTrailBySession } from '@/lib/audit';

// ── Zod validation schema for POST body ───────────────────────────────────

const PostAuditBodySchema = z.object({
  inquiryId: z.string().optional(),
  actor: z.enum(['ai', 'user', 'system']),
  action: z.enum(['parsed', 'confirmed', 'overridden', 'reverted', 'sent']),
  field: z.string().optional(),
  beforeValue: z.unknown().optional(),
  afterValue: z.unknown().optional(),
  reason: z.string().optional(),
});

// ── GET /api/audit?inquiryId=... OR ?sessionId=... ─────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;
  const { sessionId } = authResult;

  const { searchParams } = new URL(request.url);
  const inquiryId = searchParams.get('inquiryId');
  const sessionIdParam = searchParams.get('sessionId');

  if (!inquiryId && !sessionIdParam) {
    return NextResponse.json(
      { error: 'inquiryId or sessionId query parameter is required' },
      { status: 400 },
    );
  }

  if (inquiryId) {
    const events = getAuditTrail(inquiryId);
    // Ownership check: if any events exist and belong to a different session → 403
    const foreign = events.find((e) => e.sessionId !== sessionId);
    if (foreign) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ events });
  }

  // sessionId query param — only allow own session
  if (sessionIdParam !== sessionId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const events = getAuditTrailBySession(sessionId);
  return NextResponse.json({ events });
}

// ── POST /api/audit ────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // CSRF check
  if (!checkCsrfRequest(request)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
  }

  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;
  const { sessionId } = authResult;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = PostAuditBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, timestamp } = logAuditEvent({
    ...parsed.data,
    sessionId,
  });

  return NextResponse.json({ id, timestamp }, { status: 201 });
}
