import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/ai-provider';
import { CLASSIFY_SCHEMA } from '@/lib/schemas';
import { LLMTimeoutError } from '@/lib/openai';
import { endpointLlmTimeout } from '@/lib/openai-helpers';
import { CLASSIFICATION_SYSTEM_PROMPT } from '@/lib/prompts';
import { MAX_EMAIL_BODY_CHARS } from '@/lib/constants';
import { truncateText } from '@/lib/utils';
import { classifyEmails, AiClassification } from '@/lib/classification-service';

export const maxDuration = 120;

// Larger batches push the combined prompt past ClipProxy's upstream read timeout
// — we've seen "connection reset by peer" mid-stream at 50+ emails.
const CLASSIFY_BATCH_SIZE = 20;

type EmailInput = {
  id: string;
  subject: string;
  from: string;
  date: string;
  body_preview: string;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function classifyBatch(batch: EmailInput[]): Promise<AiClassification[]> {
  const todayIso = new Date().toISOString().split('T')[0];
  const result = await callAiJson<{ classifications: AiClassification[] }>(
    'CLASSIFY',
    CLASSIFICATION_SYSTEM_PROMPT,
    `Today's date: ${todayIso}\n\n${JSON.stringify(batch)}`,
    { timeoutMs: endpointLlmTimeout(120), responseSchema: CLASSIFY_SCHEMA },
  );
  return result.classifications ?? [];
}

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;
  const { session, sessionId } = authResult;

  // wave-γ-1.5-A: demo guests get pre-seeded classifications — skip live LLM entirely.
  if (session.isSampleData === true && session.classifications.length > 0) {
    return NextResponse.json({ count: session.classifications.length, cached: true });
  }

  if (session.emails.length === 0) return NextResponse.json({ error: 'No emails to classify' }, { status: 400 });

  const emailInput: EmailInput[] = session.emails.map(email => ({
    id: email.id,
    subject: email.subject,
    from: email.from,
    date: email.date,
    body_preview: truncateText(email.body || email.snippet, MAX_EMAIL_BODY_CHARS),
  }));

  const batches = chunk(emailInput, CLASSIFY_BATCH_SIZE);
  let merged: AiClassification[];
  try {
    const batchResults = await Promise.all(batches.map(classifyBatch));
    merged = batchResults.flat();
  } catch (err) {
    if (err instanceof LLMTimeoutError) {
      return NextResponse.json(
        { error: 'ai_timeout', message: 'Classification timed out — try fewer emails', retryable: true },
        { status: 504 },
      );
    }
    throw err;
  }

  const { classifications, processedEmails } = classifyEmails(session.emails, merged);
  updateSession(sessionId, { classifications, processedEmails });
  return NextResponse.json({ count: classifications.length });
}
