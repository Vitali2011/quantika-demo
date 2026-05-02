/**
 * spec-betafix-21-queue-guards-verify — comprehensive boundary coverage for
 * `enqueueDraft` validation and `approveDraft` / `rejectDraft` state-machine
 * guards. Pre-investigation showed guards are already present in
 * `lib/auto-prequote/queue.ts`; this suite verifies the full 6-class boundary
 * matrix (empty / NaN / negative / Infinity / state-transition / unknown-id)
 * so future refactors can't silently regress them.
 *
 * Adjacent suites (`enqueue-validation.test.ts`, `queue-transitions.test.ts`)
 * cover the same code from the original BUG-β-15 angle; this file is the
 * verify-and-skip canary that pins the contract end-to-end.
 */

import {
  _resetQueue,
  approveDraft,
  enqueueDraft,
  rejectDraft,
} from '@/lib/auto-prequote/queue';

describe('spec-βf-21: enqueueDraft validation (6 boundary classes)', () => {
  beforeEach(() => _resetQueue());

  it('empty emailId → throws', () => {
    expect(() =>
      enqueueDraft({ emailId: '', vessel: 'V', freightUsd: 1000, summary: 's' }),
    ).toThrow(/emailId/);
  });

  it('whitespace-only emailId → throws', () => {
    expect(() =>
      enqueueDraft({ emailId: '   ', vessel: 'V', freightUsd: 1000, summary: 's' }),
    ).toThrow(/emailId/);
  });

  it('empty vessel → throws', () => {
    expect(() =>
      enqueueDraft({ emailId: 'e', vessel: '', freightUsd: 1000, summary: 's' }),
    ).toThrow(/vessel/);
  });

  it('empty summary → throws', () => {
    expect(() =>
      enqueueDraft({ emailId: 'e', vessel: 'V', freightUsd: 1000, summary: '' }),
    ).toThrow(/summary/);
  });

  it('NaN freightUsd → throws', () => {
    expect(() =>
      enqueueDraft({ emailId: 'e', vessel: 'V', freightUsd: NaN, summary: 's' }),
    ).toThrow(/freightUsd/);
  });

  it('negative freightUsd → throws', () => {
    expect(() =>
      enqueueDraft({ emailId: 'e', vessel: 'V', freightUsd: -5, summary: 's' }),
    ).toThrow(/freightUsd/);
  });

  it('Infinity freightUsd → throws', () => {
    expect(() =>
      enqueueDraft({ emailId: 'e', vessel: 'V', freightUsd: Infinity, summary: 's' }),
    ).toThrow(/freightUsd/);
  });

  it('-Infinity freightUsd → throws', () => {
    expect(() =>
      enqueueDraft({ emailId: 'e', vessel: 'V', freightUsd: -Infinity, summary: 's' }),
    ).toThrow(/freightUsd/);
  });

  it('valid input → returns draft with id and status awaiting_approval', () => {
    const d = enqueueDraft({
      emailId: 'e',
      vessel: 'V',
      freightUsd: 100_000,
      summary: 's',
    });
    expect(d.id).toBeTruthy();
    expect(d.status).toBe('awaiting_approval');
    expect(d.createdAt).toBeTruthy();
  });

  it('zero freightUsd is allowed (non-negative finite)', () => {
    const d = enqueueDraft({ emailId: 'e', vessel: 'V', freightUsd: 0, summary: 's' });
    expect(d.status).toBe('awaiting_approval');
  });
});

describe('spec-βf-21: approve/reject state machine', () => {
  beforeEach(() => _resetQueue());

  it('rejected → approveDraft throws', () => {
    const d = enqueueDraft({ emailId: 'e1', vessel: 'V', freightUsd: 1000, summary: 's' });
    rejectDraft(d.id, 'too low');
    expect(() => approveDraft(d.id)).toThrow(/cannot transition/);
  });

  it('approved → rejectDraft throws (no double-action)', () => {
    const d = enqueueDraft({ emailId: 'e2', vessel: 'V', freightUsd: 1000, summary: 's' });
    approveDraft(d.id);
    expect(() => rejectDraft(d.id, 'reason')).toThrow(/cannot transition/);
  });

  it('approved → approveDraft (re-approve) throws', () => {
    const d = enqueueDraft({ emailId: 'e3', vessel: 'V', freightUsd: 1000, summary: 's' });
    approveDraft(d.id);
    expect(() => approveDraft(d.id)).toThrow(/cannot transition/);
  });

  it('rejected → rejectDraft (re-reject) throws', () => {
    const d = enqueueDraft({ emailId: 'e4', vessel: 'V', freightUsd: 1000, summary: 's' });
    rejectDraft(d.id, 'first');
    expect(() => rejectDraft(d.id, 'second')).toThrow(/cannot transition/);
  });

  it('approveDraft on unknown id → throws "not found"', () => {
    expect(() => approveDraft('nonexistent')).toThrow(/not found/);
  });

  it('rejectDraft on unknown id → throws "not found"', () => {
    expect(() => rejectDraft('nonexistent', 'r')).toThrow(/not found/);
  });
});
