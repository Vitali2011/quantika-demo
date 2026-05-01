/**
 * BUG-β-15-EnqueueValidation — enqueueDraft must reject empty/NaN/negative input.
 */

import { _resetQueue, enqueueDraft } from '@/lib/auto-prequote/queue';

describe('BUG-β-15-EnqueueValidation', () => {
  beforeEach(() => _resetQueue());

  it('rejects empty emailId', () => {
    expect(() =>
      enqueueDraft({ emailId: '', vessel: 'V', freightUsd: 100, summary: 's' }),
    ).toThrow(/emailId/i);
  });

  it('rejects NaN freightUsd', () => {
    expect(() =>
      enqueueDraft({ emailId: 'e1', vessel: 'V', freightUsd: NaN, summary: 's' }),
    ).toThrow(/freight/i);
  });

  it('rejects negative freightUsd', () => {
    expect(() =>
      enqueueDraft({ emailId: 'e1', vessel: 'V', freightUsd: -1, summary: 's' }),
    ).toThrow(/freight/i);
  });

  it('rejects empty vessel', () => {
    expect(() =>
      enqueueDraft({ emailId: 'e1', vessel: '', freightUsd: 100, summary: 's' }),
    ).toThrow(/vessel/i);
  });

  it('rejects empty summary', () => {
    expect(() =>
      enqueueDraft({ emailId: 'e1', vessel: 'V', freightUsd: 100, summary: '' }),
    ).toThrow(/summary/i);
  });
});
