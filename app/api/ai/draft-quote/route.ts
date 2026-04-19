import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { withSentryApiHandler } from '@/lib/sentry-api';
import { requireSession } from '@/lib/session';
import { callAiText } from '@/lib/openai';
import { DRAFT_QUOTE_SYSTEM_PROMPT } from '@/lib/prompts';
import { AI_MODEL_LIGHT } from '@/lib/constants';
import { DraftQuoteBodySchema } from '@/lib/api-schemas';

export const maxDuration = 30;

async function _POST(request: NextRequest) {
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
  
  const draft = await callAiText(userPrompt, DRAFT_QUOTE_SYSTEM_PROMPT, AI_MODEL_LIGHT);

  return NextResponse.json({ draft });
}

export const POST = withSentryApiHandler(_POST, { method: 'POST', path: '/api/ai/draft-quote' });
