/**
 * βf-10: auto-prequote cron --demo flag wiring.
 *
 * Covers:
 *  - runAutoPrequoteCron({ demo: true }) loads sample cargo emails from fixtures
 *    and processedEmails > 0
 *  - default (demo:false) leaves email fetcher untouched (uses configured
 *    fetcher, defaults to empty Gmail-style stub)
 *  - per-email errors don't crash the cron (preserved isolation contract)
 *
 * After the ETMS-corpus migration (2026-05-14) the curated 'sample-01' ID
 * no longer exists. The per-email-error test now reads the first cargo
 * email ID from the fixture dynamically.
 *
 * Assert-budget: ≤30 expects.
 */

import { runAutoPrequoteCron } from '@/scripts/auto-prequote-cron';
import {
  _resetQueue,
  setEmailFetcher,
  setQuoteDrafter,
} from '@/lib/auto-prequote/queue';
import cargoInquiries from '@/lib/sample-data/cargo-inquiries.json';

const FIRST_CARGO_EMAIL_ID = (cargoInquiries as Array<{ id: string }>)[0].id;

describe('βf-10 runAutoPrequoteCron --demo', () => {
  beforeEach(() => {
    _resetQueue();
    // Reset fetcher/drafter to deterministic defaults each test
    setEmailFetcher(async () => []);
    setQuoteDrafter(async (e) => ({
      emailId: e.id,
      vessel: 'TBD',
      freightUsd: 100000,
      summary: `Draft for ${e.subject}`,
    }));
  });

  it('--demo flag loads sample cargo emails (processedEmails > 0)', async () => {
    const result = await runAutoPrequoteCron({ demo: true });
    expect(result.processedEmails).toBeGreaterThan(0);
    expect(result.draftedQuotes).toBeGreaterThanOrEqual(0);
    expect(result.queuedForApproval).toBeGreaterThanOrEqual(0);
  });

  it('without --demo: existing fetcher is used (default empty)', async () => {
    const result = await runAutoPrequoteCron({ demo: false });
    expect(result.processedEmails).toBe(0);
    expect(result.draftedQuotes).toBe(0);
  });

  it('demo run: per-email drafter errors do not crash, surface in errors[]', async () => {
    setQuoteDrafter(async (e) => {
      if (e.id === FIRST_CARGO_EMAIL_ID) throw new Error('boom');
      return {
        emailId: e.id,
        vessel: 'TBD',
        freightUsd: 1,
        summary: e.subject,
      };
    });
    const result = await runAutoPrequoteCron({ demo: true });
    expect(result.processedEmails).toBeGreaterThan(0);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => e.emailId === FIRST_CARGO_EMAIL_ID)).toBe(true);
  });

  it('demo emails conform to PendingEmail shape (id/from/subject/body present)', async () => {
    let captured: { id: string; from: string; subject: string; body: string } | null = null;
    setQuoteDrafter(async (e) => {
      if (!captured) captured = { id: e.id, from: e.from, subject: e.subject, body: e.body };
      return { emailId: e.id, vessel: 'TBD', freightUsd: 1, summary: e.subject };
    });
    await runAutoPrequoteCron({ demo: true });
    expect(captured).not.toBeNull();
    expect(typeof captured!.id).toBe('string');
    expect(captured!.id.length).toBeGreaterThan(0);
    expect(typeof captured!.from).toBe('string');
    expect(typeof captured!.subject).toBe('string');
    expect(typeof captured!.body).toBe('string');
  });
});
