/**
 * β-15: auto-prequote pipeline tests.
 *
 * Covers:
 *  - run processes all pending emails, drafts quotes, queues for approval
 *  - Plan-First gate: every queued draft has status='awaiting_approval'
 *  - Errors are isolated — single email failure doesn't abort the run
 *
 * Assert-budget: ≤30 expects.
 */

import { runAutoPrequote } from '@/lib/auto-prequote/pipeline';
import {
  _resetQueue,
  listPendingDrafts,
  setEmailFetcher,
  setQuoteDrafter,
  type PendingEmail,
} from '@/lib/auto-prequote/queue';

describe('β-15 runAutoPrequote', () => {
  beforeEach(() => {
    _resetQueue();
  });

  it('processes pending emails, drafts quotes, queues all in awaiting_approval', async () => {
    const emails: PendingEmail[] = [
      { id: 'e1', from: 'a@x.com', subject: 'Cargo from Damietta', body: 'Need quote' },
      { id: 'e2', from: 'b@x.com', subject: 'Voyage Aqaba', body: 'Pls quote' },
      { id: 'e3', from: 'c@x.com', subject: 'Bagged urea', body: 'Quote 14000 mt' },
    ];
    setEmailFetcher(async () => emails);
    setQuoteDrafter(async (e) => ({
      emailId: e.id,
      vessel: 'TBD',
      freightUsd: 100000,
      summary: `Draft for ${e.subject}`,
    }));

    const result = await runAutoPrequote({ now: new Date('2026-04-30T03:00:00Z') });

    expect(result.processedEmails).toBe(3);
    expect(result.draftedQuotes).toBe(3);
    expect(result.queuedForApproval).toBe(3);
    expect(result.errors).toHaveLength(0);

    const pending = listPendingDrafts();
    expect(pending).toHaveLength(3);
    expect(pending.every((d) => d.status === 'awaiting_approval')).toBe(true);
    expect(pending.map((d) => d.emailId).sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('isolates errors — failures on one email do not abort others', async () => {
    const emails: PendingEmail[] = [
      { id: 'e1', from: 'a@x.com', subject: 'OK1', body: '' },
      { id: 'bad', from: 'b@x.com', subject: 'BAD', body: '' },
      { id: 'e3', from: 'c@x.com', subject: 'OK3', body: '' },
    ];
    setEmailFetcher(async () => emails);
    setQuoteDrafter(async (e) => {
      if (e.id === 'bad') throw new Error('parse failure');
      return { emailId: e.id, vessel: 'V', freightUsd: 1, summary: 's' };
    });

    const result = await runAutoPrequote();

    expect(result.processedEmails).toBe(3);
    expect(result.draftedQuotes).toBe(2);
    expect(result.queuedForApproval).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].emailId).toBe('bad');
    expect(result.errors[0].reason).toMatch(/parse failure/);
    expect(listPendingDrafts()).toHaveLength(2);
  });

  it('queue exposes approveDraft/rejectDraft transitions from awaiting_approval', async () => {
    const { approveDraft, rejectDraft, enqueueDraft, getDraft } = await import(
      '@/lib/auto-prequote/queue'
    );
    const d = enqueueDraft({
      emailId: 'eX',
      vessel: 'V',
      freightUsd: 50000,
      summary: 'x',
    });
    expect(d.status).toBe('awaiting_approval');
    approveDraft(d.id);
    expect(getDraft(d.id)?.status).toBe('approved');
    const d2 = enqueueDraft({ emailId: 'eY', vessel: 'V', freightUsd: 1, summary: 'y' });
    rejectDraft(d2.id, 'looks wrong');
    expect(getDraft(d2.id)?.status).toBe('rejected');
    expect(getDraft(d2.id)?.rejectReason).toBe('looks wrong');
  });
});
