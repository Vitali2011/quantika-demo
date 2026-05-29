/**
 * U1 / #651 — L-8: API 500 handlers must NOT reflect the raw internal error
 * message to the client. We mock the underlying lib to throw an error carrying a
 * recognizable secret-like marker, then assert the marker never appears in the
 * JSON response body. Mutation-honest: reverting any route to `error.message`
 * makes the corresponding assertion fail.
 */
import { NextRequest } from 'next/server';

const SECRET_MARKER = 'SECRET_DB_PATH_/var/secrets/leak.sqlite';

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

describe('L-8 — canal route does not leak raw error message', () => {
  it('returns a generic 500 body for a Suez quote failure', async () => {
    jest.doMock('@/lib/economics/canals/index', () => ({
      quoteCanal: jest.fn(() => {
        throw new Error(SECRET_MARKER);
      }),
    }));
    const { GET } = await import('@/app/api/canal/[canal_code]/route');
    const req = new NextRequest(
      'http://localhost/api/canal/suez?vessel_dwt=50000&vessel_nt=30000&vessel_type=tanker',
    );
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET(req, { params: Promise.resolve({ canal_code: 'suez' }) });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain(SECRET_MARKER);
    expect(JSON.parse(text).error).toBe('Internal server error');
    errSpy.mockRestore();
  });

  it('returns a generic 500 body for a non-Suez (Panama) quote failure', async () => {
    jest.doMock('@/lib/economics/canals/index', () => ({
      quoteCanal: jest.fn(() => {
        throw new Error(SECRET_MARKER);
      }),
    }));
    const { GET } = await import('@/app/api/canal/[canal_code]/route');
    const req = new NextRequest(
      'http://localhost/api/canal/panama?vessel_dwt=50000&vessel_type=bulker',
    );
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET(req, { params: Promise.resolve({ canal_code: 'panama' }) });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain(SECRET_MARKER);
    expect(JSON.parse(text).error).toBe('Internal server error');
    errSpy.mockRestore();
  });
});

describe('L-8 — charterers route does not leak raw error message', () => {
  it('returns a generic 500 body when the repository throws on GET', async () => {
    process.env.CHARTERER_CREDIT_ENABLED = 'true';
    jest.doMock('@/lib/market/charterers-repository', () => ({
      listCharterers: jest.fn(() => {
        throw new Error(SECRET_MARKER);
      }),
      upsertCharterer: jest.fn(),
    }));
    const { GET } = await import('@/app/api/charterers/route');
    const req = new NextRequest('http://localhost/api/charterers');
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET(req);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain(SECRET_MARKER);
    expect(JSON.parse(text).error).toBe('Internal server error');
    errSpy.mockRestore();
  });
});
