import { NextRequest } from 'next/server';
import { GET } from '../route';

/**
 * Input Contract tested:
 * - imo: empty ("", undefined) → 400 Bad Request
 * - imo: invalid format → 400 Bad Request
 * - PSC_DETENTION_ENABLED !== 'true' → 503 Service Unavailable
 * - Valid imo + flag enabled → 200 + records array
 */

function makeReq(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

// Mock the adapter, repository, and database
jest.mock('@/lib/knowledge/sources/psc/psc-adapter');
jest.mock('@/lib/market/psc-repository');
jest.mock('@/lib/db/index', () => ({
  getDb: jest.fn(() => ({})),
}));

import { fetchPscHistory } from '@/lib/knowledge/sources/psc/psc-adapter';
import {
  upsertInspection,
  getDetentionHistory,
} from '@/lib/market/psc-repository';

const mockFetchPscHistory = fetchPscHistory as jest.MockedFunction<
  typeof fetchPscHistory
>;
const mockUpsertInspection = upsertInspection as jest.MockedFunction<
  typeof upsertInspection
>;
const mockGetDetentionHistory = getDetentionHistory as jest.MockedFunction<
  typeof getDetentionHistory
>;

describe('GET /api/vessels/[imo]/psc-history', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // RED test: returns 503 when PSC_DETENTION_ENABLED !== 'true'
  it('returns 503 when PSC_DETENTION_ENABLED is false', async () => {
    process.env.PSC_DETENTION_ENABLED = 'false';

    const res = await GET(makeReq('/api/vessels/9123456/psc-history'), {
      params: Promise.resolve({ imo: '9123456' }),
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error).toMatch(/not available/i);
  });

  // RED test: returns 503 when PSC_DETENTION_ENABLED is not set
  it('returns 503 when PSC_DETENTION_ENABLED is not set', async () => {
    delete process.env.PSC_DETENTION_ENABLED;

    const res = await GET(makeReq('/api/vessels/9123456/psc-history'), {
      params: Promise.resolve({ imo: '9123456' }),
    });

    expect(res.status).toBe(503);
  });

  // RED test: returns 200 with records when flag enabled
  it('returns 200 with PSC records when flag enabled', async () => {
    process.env.PSC_DETENTION_ENABLED = 'true';

    const mockRecords = [
      {
        id: 'p1',
        imo: '9123456',
        inspection_date: '2025-01-15',
        port: 'Rotterdam',
        authority: 'paris-mou' as const,
        deficiencies: 3,
        detained: true,
        source_url: 'https://example.com/p1',
      },
      {
        id: 'p2',
        imo: '9123456',
        inspection_date: '2025-01-10',
        port: 'Hamburg',
        authority: 'tokyo-mou' as const,
        deficiencies: 1,
        detained: false,
        source_url: null,
      },
    ];

    mockFetchPscHistory.mockResolvedValue(mockRecords);
    mockGetDetentionHistory.mockReturnValue(mockRecords);

    const res = await GET(makeReq('/api/vessels/9123456/psc-history'), {
      params: Promise.resolve({ imo: '9123456' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe('p1');
    expect(body[0].detained).toBe(true);
    expect(body[1].id).toBe('p2');
    expect(body[1].detained).toBe(false);

    // Verify adapter was called
    expect(mockFetchPscHistory).toHaveBeenCalledWith('9123456');
    // Verify upsert was called for each record
    expect(mockUpsertInspection).toHaveBeenCalledTimes(2);
    // Verify getDetentionHistory was called
    expect(mockGetDetentionHistory).toHaveBeenCalledWith(expect.anything(), '9123456');
  });

  // RED test: returns 200 with empty array when no records found
  it('returns 200 with empty array when no records found', async () => {
    process.env.PSC_DETENTION_ENABLED = 'true';

    mockFetchPscHistory.mockResolvedValue([]);
    mockGetDetentionHistory.mockReturnValue([]);

    const res = await GET(makeReq('/api/vessels/9999999/psc-history'), {
      params: Promise.resolve({ imo: '9999999' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  // RED test (boundary): invalid IMO format → 400
  it('returns 400 for invalid IMO format (non-numeric)', async () => {
    process.env.PSC_DETENTION_ENABLED = 'true';

    const res = await GET(makeReq('/api/vessels/abc/psc-history'), {
      params: Promise.resolve({ imo: 'abc' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/IMO/i);
  });

  // RED test (boundary): invalid IMO format (6 digits) → 400
  it('returns 400 for invalid IMO format (6 digits)', async () => {
    process.env.PSC_DETENTION_ENABLED = 'true';

    const res = await GET(makeReq('/api/vessels/123456/psc-history'), {
      params: Promise.resolve({ imo: '123456' }),
    });

    expect(res.status).toBe(400);
  });

  // RED test (boundary): invalid IMO format (8 digits) → 400
  it('returns 400 for invalid IMO format (8 digits)', async () => {
    process.env.PSC_DETENTION_ENABLED = 'true';

    const res = await GET(makeReq('/api/vessels/12345678/psc-history'), {
      params: Promise.resolve({ imo: '12345678' }),
    });

    expect(res.status).toBe(400);
  });

  // RED test (boundary): empty imo → 400
  it('returns 400 for empty imo', async () => {
    process.env.PSC_DETENTION_ENABLED = 'true';

    const res = await GET(makeReq('/api/vessels//psc-history'), {
      params: Promise.resolve({ imo: '' }),
    });

    expect(res.status).toBe(400);
  });

  // RED test: adapter errors handled gracefully
  it('handles adapter errors gracefully and returns DB results', async () => {
    process.env.PSC_DETENTION_ENABLED = 'true';

    const dbRecords = [
      {
        id: 'p1',
        imo: '9123456',
        inspection_date: '2025-01-15',
        port: 'Rotterdam',
        authority: 'paris-mou' as const,
        deficiencies: 3,
        detained: true,
        source_url: 'https://example.com/p1',
      },
    ];

    mockFetchPscHistory.mockRejectedValue(new Error('Network error'));
    mockGetDetentionHistory.mockReturnValue(dbRecords);

    const res = await GET(makeReq('/api/vessels/9123456/psc-history'), {
      params: Promise.resolve({ imo: '9123456' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe('p1');
  });
});
