import * as Sentry from '@sentry/nextjs';
import { fireAlert } from '@/lib/knowledge/alerts';

// Mock Sentry
jest.mock('@sentry/nextjs', () => ({
  captureMessage: jest.fn(),
}));

describe('alerts.ts — fireAlert', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset console mocks
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends alert to Sentry when consecutiveFailures >= 2', async () => {
    await fireAlert({
      slug: 'ofac-sanctions',
      consecutiveFailures: 2,
      lastError: 'Network timeout',
    });

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'Knowledge source ofac-sanctions failed 2× consecutively',
      {
        level: 'error',
        tags: { knowledge_source: 'ofac-sanctions' },
        extra: {
          slug: 'ofac-sanctions',
          consecutiveFailures: 2,
          lastError: 'Network timeout',
        },
      }
    );
  });

  it('noop when slug is empty', async () => {
    await fireAlert({ slug: '', consecutiveFailures: 2 });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('noop when consecutiveFailures < 2', async () => {
    await fireAlert({ slug: 'ofac-sanctions', consecutiveFailures: 1 });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('noop when consecutiveFailures is NaN', async () => {
    await fireAlert({ slug: 'ofac-sanctions', consecutiveFailures: NaN });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('noop when consecutiveFailures is negative', async () => {
    await fireAlert({ slug: 'ofac-sanctions', consecutiveFailures: -1 });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('noop when consecutiveFailures is Infinity', async () => {
    await fireAlert({ slug: 'ofac-sanctions', consecutiveFailures: Infinity });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('works without lastError (optional field)', async () => {
    await fireAlert({ slug: 'ofac-sanctions', consecutiveFailures: 3 });
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'Knowledge source ofac-sanctions failed 3× consecutively',
      expect.objectContaining({
        level: 'error',
        tags: { knowledge_source: 'ofac-sanctions' },
      })
    );
  });

  it('best-effort: logs and continues if Sentry.captureMessage throws', async () => {
    const mockError = new Error('Sentry SDK not initialized');
    (Sentry.captureMessage as jest.Mock).mockImplementationOnce(() => {
      throw mockError;
    });

    await expect(
      fireAlert({ slug: 'ofac-sanctions', consecutiveFailures: 2 })
    ).resolves.not.toThrow();

    expect(console.error).toHaveBeenCalledWith(
      'fireAlert failed (best-effort):',
      mockError
    );
  });

  it('handles 3+ consecutive failures (alerts each time)', async () => {
    await fireAlert({ slug: 'ofac-sanctions', consecutiveFailures: 5 });
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'Knowledge source ofac-sanctions failed 5× consecutively',
      expect.any(Object)
    );
  });
});
