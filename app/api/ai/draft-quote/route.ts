import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession } from '@/lib/session';
import { callAiText, LLMTimeoutError } from '@/lib/openai';
import { DRAFT_QUOTE_SYSTEM_PROMPT } from '@/lib/prompts';
import { AI_MODEL_LIGHT } from '@/lib/constants';
import { DraftQuoteBodySchema } from '@/lib/api-schemas';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const result = requireSession(request);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  
  const raw = await request.json();
  const parsed = DraftQuoteBodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request body', details: parsed.error.format() }, { status: 400 });
  }
  const { emailId } = parsed.data;
  
  const parsedCargo = session.parsedCargos.find(r => r.emailId === emailId);
  if (!parsedCargo) return NextResponse.json({ error: 'Parsed request not found' }, { status: 404 });
  
  const email = session.emails.find(e => e.id === emailId);
  
  // Extract sender name from "Name <email>" or "Name" format
  const fromRaw = email?.from || '';
  const fromName = fromRaw.match(/^([^<]+)</)?.[1]?.trim() || fromRaw.split('@')[0] || 'Sir/Madam';

  const userPrompt = `
Parsed cargo inquiry data:
${JSON.stringify(parsedCargo, null, 2)}

Original email:
From: ${email?.from || ''}
Subject: ${email?.subject || ''}
Body: ${email?.body?.slice(0, 1500) || ''}

Address the reply to: ${fromName}

Generate a professional draft quote email.`;
  
  try {
    const draft = await callAiText(userPrompt, DRAFT_QUOTE_SYSTEM_PROMPT, AI_MODEL_LIGHT);
    return NextResponse.json({ draft });
  } catch (err) {
    if (err instanceof LLMTimeoutError) {
      return NextResponse.json(
        { error: 'ai_timeout', message: 'AI draft generation timed out — please retry', retryable: true },
        { status: 504 },
      );
    }
    throw err;
  }
}
