import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession, updateSession } from '@/lib/session';
import { LLMTimeoutError } from '@/lib/openai';
import { callAiJson, getProvider } from '@/lib/ai-provider';
import { endpointLlmTimeout } from '@/lib/openai-helpers';
import { NEGOTIATION_RECAP_SYSTEM_PROMPT } from '@/lib/prompts';
import { MIN_THREAD_LENGTH_FOR_RECAP } from '@/lib/constants';
import { Recap, RecapPoint, RecapHistoryEntry, NegotiationStatus } from '@/lib/types';

/** Characters to keep per email body for OpenAI (limited context window). */
const OPENAI_BODY_SLICE = 2000;

/** Scope name used to resolve RECAP_PROVIDER / AI_PROVIDER env vars. */
const RECAP_SCOPE = 'RECAP';

interface RawRecapPoint {
  topic?: string;
  status?: string;
  current_value?: string;
  currentValue?: string;
  proposed_by?: string;
  proposedBy?: string;
  source_email_number?: number;
  sourceEmailNumber?: number;
  source_email_date?: string;
  sourceEmailDate?: string;
  source_quote?: string;
  sourceQuote?: string;
  history?: RecapHistoryEntry[];
}

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const result = requireSession(request);
  if (result instanceof NextResponse) return result;
  const { session, sessionId } = result;
  
  // Group emails by threadId
  const threadMap = new Map<string, typeof session.emails>();
  for (const email of session.emails) {
    const group = threadMap.get(email.threadId) || [];
    group.push(email);
    threadMap.set(email.threadId, group);
  }
  
  // Only threads with MIN_THREAD_LENGTH_FOR_RECAP+ emails
  const longThreads = Array.from(threadMap.entries())
    .filter(([, emails]) => emails.length >= MIN_THREAD_LENGTH_FOR_RECAP);
  
  if (longThreads.length === 0) {
    updateSession(sessionId, { recaps: [] });
    return NextResponse.json({ count: 0 });
  }
  
  let recaps: Recap[];
  try {
    recaps = await Promise.all(
    longThreads.map(async ([threadId, emails]) => {
      const sortedEmails = [...emails].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      
      const provider = getProvider(RECAP_SCOPE);
      const bodySlice = provider === 'openai' ? OPENAI_BODY_SLICE : undefined;

      const threadInput = sortedEmails.map((e, i) => ({
        number: i + 1,
        from: e.from,
        date: e.date,
        body: bodySlice !== undefined ? e.body.slice(0, bodySlice) : e.body,
      }));

      const result = await callAiJson<{ points: RawRecapPoint[]; summary: string }>(
        RECAP_SCOPE,
        NEGOTIATION_RECAP_SYSTEM_PROMPT,
        JSON.stringify(threadInput),
        { timeoutMs: endpointLlmTimeout(60) }
      );

      const participants = Array.from(new Set(sortedEmails.map(e => e.from)));
      const dates = sortedEmails.map(e => e.date).filter(Boolean);
      const dateRange = dates.length > 0
        ? `${new Date(dates[0]).toLocaleDateString('en-US', { timeZone: 'UTC' })} \u2013 ${new Date(dates[dates.length - 1]).toLocaleDateString('en-US', { timeZone: 'UTC' })}`
        : '';

      const points: RecapPoint[] = (result.points || []).map((p) => ({
        topic: p.topic || '',
        status: (p.status as NegotiationStatus) || 'PENDING',
        currentValue: p.current_value || p.currentValue || '',
        proposedBy: p.proposed_by || p.proposedBy || '',
        sourceEmailNumber: p.source_email_number || p.sourceEmailNumber || 1,
        sourceEmailDate: p.source_email_date || p.sourceEmailDate || '',
        sourceQuote: p.source_quote || p.sourceQuote || '',
        history: Array.isArray(p.history) ? p.history : [],
      }));
      
      return {
        threadId,
        subject: sortedEmails[0]?.subject || '',
        participants,
        emailCount: sortedEmails.length,
        dateRange,
        points,
        summary: result.summary || '',
      };
    })
  );
  } catch (err) {
    if (err instanceof LLMTimeoutError) {
      return NextResponse.json(
        { error: 'ai_timeout', message: 'Recap generation timed out — please retry', retryable: true },
        { status: 504 },
      );
    }
    throw err;
  }

  updateSession(sessionId, { recaps });
  return NextResponse.json({ count: recaps.length });
}
