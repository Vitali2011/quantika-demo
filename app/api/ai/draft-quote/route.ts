import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { callAiText } from '@/lib/openai';
import { DRAFT_QUOTE_SYSTEM_PROMPT } from '@/lib/prompts';
import { AI_MODEL_LIGHT } from '@/lib/constants';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const result = requireSession(request);
  if (result instanceof NextResponse) return result;
  const { session } = result;
  
  const body = await request.json();
  const { emailId } = body;
  
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
