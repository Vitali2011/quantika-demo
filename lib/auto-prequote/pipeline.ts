/**
 * β-15: nightly auto pre-quote pipeline.
 *
 * Orchestration: fetch pending emails → for each, draft a quote and enqueue
 * it as 'awaiting_approval'. The Plan-First gate (β-11) is enforced at the
 * queue level — drafts never auto-send. Errors are isolated per email so a
 * single parse failure doesn't take down the whole run.
 *
 * The actual email fetcher and quote drafter are pluggable via
 * setEmailFetcher / setQuoteDrafter from queue.ts (test seams + future
 * real-source wiring).
 */

import { enqueueDraft, getEmailFetcher, getQuoteDrafter } from './queue';

export interface AutoPrequoteResult {
  processedEmails: number;
  draftedQuotes: number;
  queuedForApproval: number;
  errors: { emailId: string; reason: string }[];
  startedAt: string;
  finishedAt: string;
}

export interface RunOptions {
  now?: Date;
}

export async function runAutoPrequote(
  opts: RunOptions = {},
): Promise<AutoPrequoteResult> {
  const startedAt = (opts.now ?? new Date()).toISOString();
  const fetcher = getEmailFetcher();
  const drafter = getQuoteDrafter();

  const emails = await fetcher();
  const errors: { emailId: string; reason: string }[] = [];
  let drafted = 0;
  let queued = 0;

  for (const email of emails) {
    try {
      const input = await drafter(email);
      const draft = enqueueDraft(input);
      drafted += 1;
      if (draft.status === 'awaiting_approval') queued += 1;
    } catch (err) {
      errors.push({
        emailId: email.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    processedEmails: emails.length,
    draftedQuotes: drafted,
    queuedForApproval: queued,
    errors,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
