import { NextRequest, NextResponse } from 'next/server';
import { requireSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';
import { NEGOTIATION_RECAP_SYSTEM_PROMPT } from '@/lib/prompts';
import { AI_MODEL_HEAVY, MIN_THREAD_LENGTH_FOR_RECAP } from '@/lib/constants';
import { Recap, RecapPoint, RecapHistoryEntry, NegotiationStatus } from '@/lib/types';

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
  
  const recaps: Recap[] = await Promise.all(
    longThreads.map(async ([threadId, emails]) => {
      const sortedEmails = [...emails].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      
      const threadInput = sortedEmails.map((e, i) => ({
        number: i + 1,
        from: e.from,
        date: e.date,
        body: e.body.slice(0, 2000),
      }));
      
      const result = await callAiJson<{ points: RawRecapPoint[]; summary: string }>(
        JSON.stringify(threadInput),
        NEGOTIATION_RECAP_SYSTEM_PROMPT,
        AI_MODEL_HEAVY,
        { points: [], summary: '' }
      );

      const participants = Array.from(new Set(sortedEmails.map(e => e.from)));
      const dates = sortedEmails.map(e => e.date).filter(Boolean);
      const dateRange = dates.length > 0
        ? `${new Date(dates[0]).toLocaleDateString()} \u2013 ${new Date(dates[dates.length - 1]).toLocaleDateString()}`
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
  
  updateSession(sessionId, { recaps });
  return NextResponse.json({ count: recaps.length });
}
