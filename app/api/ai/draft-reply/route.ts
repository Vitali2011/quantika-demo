import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession } from '@/lib/session';
import { callAiText, LLMTimeoutError } from '@/lib/openai';
import { DRAFT_REPLY_SYSTEM_PROMPT } from '@/lib/prompts';
import { AI_MODEL_LIGHT } from '@/lib/constants';
import { DraftReplyBodySchema } from '@/lib/api-schemas';

export const maxDuration = 30;

function extractClientName(email: { from: string; fromName: string | null; snippet: string; body: string }): string {
  // 1. Use parsed fromName if available and not an email address
  if (email.fromName && !email.fromName.includes('@')) {
    return email.fromName;
  }
  // 2. Fallback to email local part
  const match = email.from.match(/([^@<\s]+)@/);
  return match ? match[1] : 'the client';
}

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const result = requireSession(request);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  
  const raw = await request.json();
  const parsed = DraftReplyBodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const body = parsed.data;
  const emailId = 'emailId' in body ? body.emailId : undefined;
  const pendingItems = 'pendingItems' in body ? body.pendingItems : undefined;

  const timeoutResponse = () => NextResponse.json(
    { error: 'ai_timeout', message: 'AI draft generation timed out — please retry', retryable: true },
    { status: 504 },
  );

  // Case 1: missing info request for rate request
  if (emailId) {
    const parsedCargo = session.parsedCargos.find(r => r.emailId === emailId);
    const email = session.emails.find(e => e.id === emailId);

    const clientName = extractClientName({
      from: email?.from || '',
      fromName: email?.fromName || null,
      snippet: email?.snippet || '',
      body: email?.body || '',
    });

    const userPrompt = `
Client name: ${clientName}
Client email: ${email?.fromEmail || email?.from || ''}
Original subject: ${email?.subject || ''}
Missing information: ${JSON.stringify(parsedCargo?.missingInfo || [])}

Write a follow-up email addressing the client by their first name. Ask for the missing information listed above.`;
    
    try {
      const draft = await callAiText(userPrompt, DRAFT_REPLY_SYSTEM_PROMPT, AI_MODEL_LIGHT);
      return NextResponse.json({ draft });
    } catch (err) {
      if (err instanceof LLMTimeoutError) return timeoutResponse();
      throw err;
    }
  }

  // Case 2: follow-up on pending negotiation items
  if (pendingItems) {
    const userPrompt = `
Pending negotiation items:
${JSON.stringify(pendingItems, null, 2)}

Write a follow-up email to resolve the pending items.`;

    try {
      const draft = await callAiText(userPrompt, DRAFT_REPLY_SYSTEM_PROMPT, AI_MODEL_LIGHT);
      return NextResponse.json({ draft });
    } catch (err) {
      if (err instanceof LLMTimeoutError) return timeoutResponse();
      throw err;
    }
  }
  
  // Unreachable: zod union guarantees emailId or pendingItems is present
  return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
}
