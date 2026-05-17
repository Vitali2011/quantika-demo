/**
 * Issue #179: email notification channel via Resend in fireAlert.
 * Tests sendAlertEmail exported function separately from Sentry path.
 */
import { sendAlertEmail } from '@/lib/knowledge/alerts';

const mockEmailsSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockEmailsSend },
  })),
}));
jest.mock('@sentry/nextjs', () => ({ captureMessage: jest.fn() }));

describe('sendAlertEmail (issue #179)', () => {
  const CTX = { slug: 'ofac-sanctions', consecutiveFailures: 3, lastError: 'Timeout' };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.ALERT_EMAIL_TO;
  });

  it('no-op when RESEND_API_KEY is missing', async () => {
    process.env.ALERT_EMAIL_TO = 'admin@example.com';
    await sendAlertEmail(CTX);
    expect(mockEmailsSend).not.toHaveBeenCalled();
  });

  it('no-op when ALERT_EMAIL_TO is missing', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    await sendAlertEmail(CTX);
    expect(mockEmailsSend).not.toHaveBeenCalled();
  });

  it('calls Resend with correct to/from/subject when env vars are set', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.ALERT_EMAIL_TO = 'admin@example.com';
    mockEmailsSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });

    await sendAlertEmail(CTX);

    expect(mockEmailsSend).toHaveBeenCalledTimes(1);
    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.to).toEqual(['admin@example.com']);
    expect(call.subject).toContain('ofac-sanctions');
    expect(call.subject).toContain('3');
    expect(call.html).toContain('ofac-sanctions');
    expect(call.html).toContain('3');
  });

  it('splits comma-separated ALERT_EMAIL_TO into array', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.ALERT_EMAIL_TO = 'a@x.com, b@y.com';
    mockEmailsSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });

    await sendAlertEmail(CTX);

    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.to).toEqual(['a@x.com', 'b@y.com']);
  });

  it('includes lastError in email html when provided', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.ALERT_EMAIL_TO = 'admin@example.com';
    mockEmailsSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });

    await sendAlertEmail({ ...CTX, lastError: 'Connection refused' });

    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.html).toContain('Connection refused');
  });

  it('rejects with transport error — caller must handle via .catch', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.ALERT_EMAIL_TO = 'admin@example.com';
    mockEmailsSend.mockRejectedValue(new Error('Resend API error'));

    await expect(sendAlertEmail(CTX)).rejects.toThrow('Resend API error');
  });

  it('strips HTML tags from slug and lastError in email body', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.ALERT_EMAIL_TO = 'admin@example.com';
    mockEmailsSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });

    await sendAlertEmail({
      slug: '<img src=x onerror=alert(1)>injected-slug',
      consecutiveFailures: 2,
      lastError: '<style>body{display:none}</style>injected-error',
    });

    const call = mockEmailsSend.mock.calls[0][0];
    expect(call.html).not.toContain('<img');
    expect(call.html).not.toContain('<style>');
    expect(call.html).not.toContain('onerror');
    expect(call.html).toContain('injected-slug');
    expect(call.html).toContain('injected-error');
  });
});

describe('fireAlert — email integration (fire-and-forget)', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.ALERT_EMAIL_TO;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('fireAlert completes without throwing even if email would error', async () => {
    const { fireAlert } = await import('@/lib/knowledge/alerts');

    process.env.RESEND_API_KEY = 'test-key';
    process.env.ALERT_EMAIL_TO = 'admin@example.com';
    mockEmailsSend.mockRejectedValue(new Error('Resend down'));

    await expect(
      fireAlert({ slug: 'test-source', consecutiveFailures: 2 })
    ).resolves.not.toThrow();

    // flush microtasks to let fire-and-forget promise settle
    await Promise.resolve();
    await Promise.resolve();
  });

  it('throttles repeated emails for same slug within cooldown window', async () => {
    const { fireAlert } = await import('@/lib/knowledge/alerts');
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    process.env.RESEND_API_KEY = 'test-key';
    process.env.ALERT_EMAIL_TO = 'admin@example.com';
    mockEmailsSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });

    const slug = 'throttle-test-unique-slug-abc123';

    await fireAlert({ slug, consecutiveFailures: 2 });
    await Promise.resolve();
    await Promise.resolve();
    expect(mockEmailsSend).toHaveBeenCalledTimes(1);

    // second call within cooldown should be throttled
    await fireAlert({ slug, consecutiveFailures: 3 });
    await Promise.resolve();
    await Promise.resolve();
    expect(mockEmailsSend).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('throttled'));

    logSpy.mockRestore();
  });
});
