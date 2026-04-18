import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';
import { CLASSIFICATION_SYSTEM_PROMPT } from '@/lib/prompts';
import { AI_MODEL_HEAVY, MAX_EMAIL_BODY_CHARS } from '@/lib/constants';
import { truncateText } from '@/lib/utils';
import { classifyEmails, AiClassification } from '@/lib/classification-service';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;
  const { session, sessionId } = authResult;
  if (session.emails.length === 0) return NextResponse.json({ error: 'No emails to classify' }, { status: 400 });

  const emailInput = session.emails.map(email => ({
    id: email.id,
    subject: email.subject,
    from: email.from,
    date: email.date,
    body_preview: truncateText(email.body || email.snippet, MAX_EMAIL_BODY_CHARS),
  }));

  const result = await callAiJson<{ classifications: AiClassification[] }>(
    JSON.stringify(emailInput),
    CLASSIFICATION_SYSTEM_PROMPT,
    AI_MODEL_HEAVY,
    { classifications: [] }
  );

  const { classifications, processedEmails } = classifyEmails(session.emails, result.classifications || []);
  updateSession(sessionId, { classifications, processedEmails });
  return NextResponse.json({ count: classifications.length });
}
