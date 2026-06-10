import { parseJsonResponse, FriendlyHttpError } from '@/lib/http/parse-json-response';

function res(opts: { ok: boolean; status: number; contentType?: string; body: string }): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? opts.contentType ?? null : null) },
    json: async () => JSON.parse(opts.body),
    text: async () => opts.body,
  } as unknown as Response;
}

describe('parseJsonResponse', () => {
  it('returns parsed JSON on a 200 JSON response', async () => {
    const data = await parseJsonResponse<{ draft: string }>(res({ ok: true, status: 200, contentType: 'application/json', body: '{"draft":"hi"}' }));
    expect(data.draft).toBe('hi');
  });

  it('throws FriendlyHttpError with server message on a JSON error response', async () => {
    await expect(parseJsonResponse(res({ ok: false, status: 500, contentType: 'application/json', body: '{"error":"ai_error","message":"Gemini credentials missing"}' })))
      .rejects.toMatchObject({ message: 'Gemini credentials missing' });
  });

  it('throws a friendly message (not a SyntaxError) on an empty body', async () => {
    await expect(parseJsonResponse(res({ ok: false, status: 504, contentType: '', body: '' })))
      .rejects.toMatchObject({ message: expect.stringContaining('timed out') });
  });

  it('throws a friendly message on an HTML (non-JSON) body', async () => {
    await expect(parseJsonResponse(res({ ok: false, status: 502, contentType: 'text/html', body: '<!DOCTYPE html><h1>Bad Gateway</h1>' })))
      .rejects.toMatchObject({ message: expect.stringContaining('unavailable') });
    await expect(parseJsonResponse(res({ ok: false, status: 502, contentType: 'text/html', body: '<!DOCTYPE html>' })))
      .rejects.not.toMatchObject({ message: expect.stringContaining('Unexpected token') });
  });

  it('throws a friendly message when an ok response has a non-JSON body', async () => {
    await expect(parseJsonResponse(res({ ok: true, status: 200, contentType: 'text/html', body: '' })))
      .rejects.toMatchObject({ message: expect.stringContaining('unexpected response') });
  });
});
