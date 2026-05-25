import { NextRequest, NextResponse } from 'next/server';

const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { currentPassword, newPassword, confirmPassword } = body as Record<string, unknown>;

  if (!currentPassword || typeof currentPassword !== 'string') {
    return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
  }
  if (!newPassword || typeof newPassword !== 'string') {
    return NextResponse.json({ error: 'New password is required' }, { status: 400 });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
  }

  return NextResponse.json({ saved: true });
}
