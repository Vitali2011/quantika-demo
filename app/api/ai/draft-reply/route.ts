import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { callAiText } from '@/lib/openai';
import { DRAFT_REPLY_SYSTEM_PROMPT } from '@/lib/prompts';
import { AI_MODEL_LIGHT } from '@/lib/constants';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get('session_id')?.value;
  if (!sessionId) return NextResponse.json({ error: 'No session' }, { status: 401 });
  
  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  
  const body = await request.json();
  const { emailId, pendingItems } = body;
  
  // Case 1: missing info request for rate request
  if (emailId) {
    const parsedRequest = session.parsedRequests.find(r => r.emailId === emailId);
    const email = session.emails.find(e => e.id === emailId);
    
    const userPrompt = `
Client name/email: ${email?.from || 'the client'}
Original subject: ${email?.subject || ''}
Missing information: ${JSON.stringify(parsedRequest?.missingInfo || [])}

Write a follow-up email asking for the missing information.`;
    
    const draft = await callAiText(userPrompt, DRAFT_REPLY_SYSTEM_PROMPT, AI_MODEL_LIGHT);
    return NextResponse.json({ draft });
  }
  
  // Case 2: follow-up on pending negotiation items
  if (pendingItems) {
    const userPrompt = `
Pending negotiation items:
${JSON.stringify(pendingItems, null, 2)}

Write a follow-up email to resolve the pending items.`;
    
    const draft = await callAiText(userPrompt, DRAFT_REPLY_SYSTEM_PROMPT, AI_MODEL_LIGHT);
    return NextResponse.json({ draft });
  }
  
  return NextResponse.json({ error: 'Missing emailId or pendingItems' }, { status: 400 });
}
