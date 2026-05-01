/**
 * BUG-β-15-IdempotencyReplay — approveDraft / rejectDraft must guard
 * against transitions that are not from 'awaiting_approval'.
 */

import {
  _resetQueue,
  approveDraft,
  enqueueDraft,
  getDraft,
  rejectDraft,
} from '@/lib/auto-prequote/queue';

describe('BUG-β-15 transition guards', () => {
  beforeEach(() => _resetQueue());

  function fixture() {
    return enqueueDraft({
      emailId: 'e1',
      vessel: 'V',
      freightUsd: 10000,
      summary: 's',
    });
  }

  it('rejects approval of a previously rejected draft', () => {
    const d = fixture();
    rejectDraft(d.id, 'too low');
    expect(() => approveDraft(d.id)).toThrow(/cannot transition|rejected/i);
    expect(getDraft(d.id)?.status).toBe('rejected');
  });

  it('rejects re-approval of an already approved draft', () => {
    const d = fixture();
    approveDraft(d.id);
    expect(() => approveDraft(d.id)).toThrow(/cannot transition|approved/i);
  });

  it('rejects rejection of an already approved draft', () => {
    const d = fixture();
    approveDraft(d.id);
    expect(() => rejectDraft(d.id, 'late')).toThrow(/cannot transition|approved/i);
  });
});
