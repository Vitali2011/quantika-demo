import { NextRequest, NextResponse } from 'next/server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { displayName, email } = body as Record<string, unknown>;

  if (displayName !== undefined && (typeof displayName !== 'string' || displayName.trim() === '')) {
    return NextResponse.json({ error: 'Display name must be a non-empty string' }, { status: 400 });
  }
  if (email !== undefined && (typeof email !== 'string' || !EMAIL_RE.test(email))) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  return NextResponse.json({
    saved: true,
    displayName: typeof displayName === 'string' ? displayName.trim() : null,
    email: typeof email === 'string' ? email.trim() : null,
  });
}
