/**
 * @jest-environment jsdom
 *
 * Tests for βf-14 — client-side CSRF helper.
 *
 * Bug C2: clicking "Draft Quote" button hit `POST /api/ai/draft-quote` without
 * `X-CSRF-Token` header → server responded 403 "Invalid or missing CSRF token".
 * Root cause: `components/request/draft-quote-card.tsx` used bare `fetch` and
 * never read the `csrf_token` cookie. Other flows (`app/processing/page.tsx`)
 * had the cookie-parse + header inline.
 *
 * Fix: centralise into `lib/csrf-client.ts` and use it in the card.
 */
import { csrfFetch, getCsrfToken, readCookie } from '@/lib/csrf-client';

describe('βf-14 csrf-client', () => {
  beforeEach(() => {
    // Wipe any cookies left over from a previous test.
    document.cookie.split(';').forEach(c => {
      const name = c.split('=')[0]?.trim();
      if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    });
  });

  describe('readCookie', () => {
    it('returns the cookie value when present', () => {
      document.cookie = 'csrf_token=abc123';
      expect(readCookie('csrf_token')).toBe('abc123');
    });

    it('returns null when the cookie is absent', () => {
      expect(readCookie('csrf_token')).toBeNull();
    });

    it('parses the right cookie when multiple are set', () => {
      document.cookie = 'session=foo';
      document.cookie = 'csrf_token=xyz789';
      document.cookie = 'other=bar';
      expect(readCookie('csrf_token')).toBe('xyz789');
    });

    it('does not match a cookie name that is a substring of another', () => {
      // `csrf_token_alt` should not be returned when asking for `csrf_token`.
      document.cookie = 'csrf_token_alt=wrong';
      expect(readCookie('csrf_token')).toBeNull();
    });

    it('decodes percent-encoded values', () => {
      document.cookie = 'csrf_token=' + encodeURIComponent('a b+c');
      expect(readCookie('csrf_token')).toBe('a b+c');
    });
  });

  describe('getCsrfToken', () => {
    it('returns the cookie value', () => {
      document.cookie = 'csrf_token=tok-1';
      expect(getCsrfToken()).toBe('tok-1');
    });

    it('returns empty string when cookie is missing (graceful fallback)', () => {
      expect(getCsrfToken()).toBe('');
    });
  });

  describe('csrfFetch', () => {
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
      // jsdom test env doesn't ship `Response`, so mock with a minimal shape.
      const fakeResponse = { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(fakeResponse);
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('attaches X-CSRF-Token header read from csrf_token cookie', async () => {
      document.cookie = 'csrf_token=test-token-123';
      await csrfFetch('/api/ai/draft-quote', {
        method: 'POST',
        body: JSON.stringify({ emailId: 'x' }),
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const init = fetchSpy.mock.calls[0]![1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['X-CSRF-Token']).toBe('test-token-123');
    });

    it('sends empty X-CSRF-Token when cookie is absent (server will 403, surface error)', async () => {
      await csrfFetch('/api/ai/draft-quote', { method: 'POST' });
      const init = fetchSpy.mock.calls[0]![1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['X-CSRF-Token']).toBe('');
    });

    it('sets Content-Type: application/json by default', async () => {
      document.cookie = 'csrf_token=t';
      await csrfFetch('/api/ai/draft-quote', { method: 'POST' });
      const init = fetchSpy.mock.calls[0]![1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('includes credentials so the cookie is sent on same-origin requests', async () => {
      document.cookie = 'csrf_token=t';
      await csrfFetch('/api/ai/draft-quote', { method: 'POST' });
      const init = fetchSpy.mock.calls[0]![1] as RequestInit;
      expect(init.credentials).toBe('include');
    });

    it('lets the caller override Content-Type (e.g. for multipart)', async () => {
      document.cookie = 'csrf_token=t';
      await csrfFetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const init = fetchSpy.mock.calls[0]![1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('multipart/form-data');
      // CSRF still attached.
      expect(headers['X-CSRF-Token']).toBe('t');
    });

    it('passes through method and body', async () => {
      document.cookie = 'csrf_token=t';
      await csrfFetch('/api/ai/draft-quote', {
        method: 'POST',
        body: JSON.stringify({ emailId: 'sample-01' }),
      });
      const init = fetchSpy.mock.calls[0]![1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify({ emailId: 'sample-01' }));
    });
  });
});
