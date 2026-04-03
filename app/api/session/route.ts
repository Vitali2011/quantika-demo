import { NextRequest, NextResponse } from 'next/server';

import { deleteSession } from '@/lib/session';

export async function DELETE(request: NextRequest) {
  const sessionId = request.cookies.get('session_id')?.value;

  if (sessionId) {
    deleteSession(sessionId);
  }

  const response = NextResponse.json({ message: 'Session deleted' });
  response.cookies.delete('session_id');
  return response;
}
