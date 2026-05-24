import { emitJobUpdate, emitMatchCreated } from './event-emitter';

export interface ProcessEmailOpts {
  userId: string;
  jobId: string;
  emailBody: string;
  emailSubject?: string;
  from?: string;
}

export interface ProcessEmailResult {
  matchId?: string;
  score?: number;
}

/**
 * Thin scaffold wired to SSE emitter.
 * Real LLM + matching integration is done in the classify pipeline
 * — this provides the progress-emit contract consumed by LiveStrip.
 */
export async function processEmail(opts: ProcessEmailOpts): Promise<ProcessEmailResult> {
  const { userId, jobId, emailSubject, from } = opts;

  emitJobUpdate(userId, {
    id: jobId,
    status: 'processing',
    progress_percent: 10,
    current_step: 'parsing email',
    email_subject: emailSubject,
    from,
  });

  emitJobUpdate(userId, {
    id: jobId,
    status: 'processing',
    progress_percent: 50,
    current_step: 'matching vessels',
    email_subject: emailSubject,
    from,
  });

  emitJobUpdate(userId, {
    id: jobId,
    status: 'done',
    progress_percent: 100,
    current_step: 'done',
    email_subject: emailSubject,
    from,
  });

  return {};
}
