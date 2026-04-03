import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';
import { CLASSIFICATION_SYSTEM_PROMPT } from '@/lib/prompts';
import { AI_MODEL_HEAVY, MAX_EMAIL_BODY_CHARS } from '@/lib/constants';
import { truncateText } from '@/lib/utils';
import { Classification, EmailCategory, Urgency } from '@/lib/types';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get('session_id')?.value;
  if (!sessionId) return NextResponse.json({ error: 'No session' }, { status: 401 });
  
  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  if (session.emails.length === 0) return NextResponse.json({ error: 'No emails to classify' }, { status: 400 });
  
  // Prepare batch input
  const emailInput = session.emails.map(email => ({
    id: email.id,
    subject: email.subject,
    from: email.from,
    date: email.date,
    body_preview: truncateText(email.body || email.snippet, MAX_EMAIL_BODY_CHARS),
  }));
  
  const userPrompt = JSON.stringify(emailInput);
  
  const result = await callAiJson<{ classifications: any[] }>(
    userPrompt,
    CLASSIFICATION_SYSTEM_PROMPT,
    AI_MODEL_HEAVY,
    { classifications: [] }
  );
  
  // Normalize to TypeScript types
  const classifications: Classification[] = (result.classifications || []).map((c: any) => ({
    emailId: c.id || c.emailId || '',
    category: (c.category as EmailCategory) || 'OTHER',
    isUnanswered: c.is_unanswered ?? c.isUnanswered ?? false,
    urgency: (c.urgency as Urgency) || 'low',
    daysWithoutReply: c.days_without_reply ?? c.daysWithoutReply ?? null,
    confidence: c.confidence ?? 0.8,
  }));
  
  updateSession(sessionId, { classifications });
  
  return NextResponse.json({ count: classifications.length });
}
