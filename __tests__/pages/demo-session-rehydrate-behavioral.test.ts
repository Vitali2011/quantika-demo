/**
 * #975 — behavioral coverage for app/match/[id]/page.tsx routing logic.
 *
 * The sibling suite (demo-session-rehydrate-redirect.test.ts) is STATIC
 * source-analysis: it asserts imports/strings exist but never executes the
 * page, so it would stay green even if isDemoMode() were logic-inverted.
 * Cold-QA on PR #978 flagged that gap (MEDIUM). This suite exercises the
 * actual control flow by invoking the server component with mocked deps.
 *
 * Three behaviors, mirroring the page's two demo "modes" + non-demo isolation:
 *   Mode A  — null session in demo mode → redirect('/api/demo/rehydrate?next=/match/<id>')
 *   Mode B  — stale numeric ID (evicted-session row) in demo mode → re-persist
 *             the live session's matches, then re-resolve by slug (no notFound)
 *   Isolation — non-demo cross-session match → notFound() (no leak, no re-persist)
 *
 * redirect()/notFound() are mocked to THROW, faithful to the Next.js runtime
 * (both halt execution), which also lets us assert the FIRST navigation fires
 * rather than a fall-through.
 */

jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
jest.mock('@/lib/session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/demo-mode', () => ({ isDemoMode: jest.fn() }));
jest.mock('@/lib/session-store', () => ({ getStore: () => ({ getDatabase: () => ({}) }) }));
jest.mock('@/lib/matching/matches-repository', () => ({
  getMatch: jest.fn(),
  getMatchBySlug: jest.fn(),
}));
jest.mock('@/lib/matching/persist-session-matches', () => ({ persistSessionMatches: jest.fn() }));

// Stub heavy client components / data libs so module load stays hermetic and the
// Mode B render path (which proceeds past the guard) builds without side effects.
jest.mock('@/lib/analytics-tracker', () => ({ AnalyticsTracker: () => null }));
jest.mock('@/components/match/MatchTabs', () => ({ MatchTabs: () => null }));
jest.mock('@/components/match/SourceAttributionSection', () => ({ SourceAttributionSection: () => null }));
jest.mock('@/components/match/ExplainDealModal', () => ({ ExplainDealModal: () => null }));
jest.mock('@/components/match/MatchDetailPanel', () => ({
  MatchDetailPanel: () => null,
  MatchDetailMobileSheet: () => null,
}));
jest.mock('@/components/match/MatchWorksheet', () => ({ MatchWorksheet: () => null }));
jest.mock('@/lib/utils/laycan-display', () => ({ resolveLaycanDisplay: () => null }));

import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { getSession } from '@/lib/session';
import { isDemoMode } from '@/lib/demo-mode';
import { getMatch, getMatchBySlug } from '@/lib/matching/matches-repository';
import { persistSessionMatches } from '@/lib/matching/persist-session-matches';
import MatchDetailPage from '@/app/match/[id]/page';

const SID = 'sess-current';

function mockCookie(value: string | undefined): void {
  (cookies as jest.Mock).mockResolvedValue({
    get: (name: string) => (name === 'session_id' && value ? { value } : undefined),
  });
}

function emptySession() {
  return { matches: [], parsedCargos: [], parsedVessels: [], emails: [] };
}

// Minimal StoredMatch — only fields the page's render path reads; the rest null.
function makeMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    cargo_id: 'cargo-A',
    vessel_id: 'vessel-B',
    score: 80,
    reason: '',
    status: 'new',
    user_id: SID,
    created_at: 0,
    updated_at: 0,
    reason_structured: null,
    cargo_type: null,
    load_port: null,
    discharge_port: null,
    laycan_start: null,
    laycan_end: null,
    vessel_dwt: null,
    tce_usd_per_day: null,
    distance_nm: null,
    freight_rate_usd_per_mt: null,
    freight_rate_source: null,
    vessel_name: null,
    cargo_ref: null,
    fit_percent: null,
    fit_breakdown: null,
    worksheet_json: null,
    consumption_estimated: null,
    ballast_distance_nm: null,
    breakeven_tce_usd_per_day: null,
    ...overrides,
  };
}

function invoke(id: string) {
  return MatchDetailPage({ params: Promise.resolve({ id }) });
}

describe('#975 match/[id] — Mode A: null session rehydrate redirect', () => {
  beforeEach(() => jest.clearAllMocks());

  it('demo mode → redirects to /api/demo/rehydrate?next=/match/<id> and halts there', async () => {
    mockCookie(SID);
    (getSession as jest.Mock).mockReturnValue(null);
    (isDemoMode as jest.Mock).mockReturnValue(true);

    await expect(invoke('101')).rejects.toThrow('NEXT_REDIRECT:/api/demo/rehydrate?next=/match/101');

    expect(redirect).toHaveBeenCalledWith('/api/demo/rehydrate?next=/match/101');
    // Must halt at the rehydrate redirect — not fall through to the /dashboard redirect.
    expect(redirect).not.toHaveBeenCalledWith('/dashboard');
    expect(notFound).not.toHaveBeenCalled();
  });

  it('non-demo guard → redirects to /dashboard, never to rehydrate', async () => {
    mockCookie(SID);
    (getSession as jest.Mock).mockReturnValue(null);
    (isDemoMode as jest.Mock).mockReturnValue(false);

    await expect(invoke('101')).rejects.toThrow('NEXT_REDIRECT:/dashboard');

    expect(redirect).not.toHaveBeenCalledWith(expect.stringContaining('/api/demo/rehydrate'));
  });
});

describe('#975 match/[id] — Mode B: stale numeric ID re-persist + slug re-resolve', () => {
  beforeEach(() => jest.clearAllMocks());

  it('demo mode + evicted-session row → re-persists live matches, re-resolves by slug, no notFound', async () => {
    mockCookie(SID);
    const session = emptySession();
    (getSession as jest.Mock).mockReturnValue(session);
    (isDemoMode as jest.Mock).mockReturnValue(true);
    // getMatch finds a row owned by an evicted session (numeric IDs are session-scoped).
    const stale = makeMatch({ id: 55, user_id: 'sess-evicted', cargo_id: 'cargo-A', vessel_id: 'vessel-B' });
    (getMatch as jest.Mock).mockReturnValue(stale);
    // After persistSessionMatches, the stable slug resolves to a row owned by the live session.
    (getMatchBySlug as jest.Mock).mockReturnValue(
      makeMatch({ id: 201, user_id: SID, cargo_id: 'cargo-A', vessel_id: 'vessel-B' }),
    );

    await expect(invoke('55')).resolves.toBeTruthy();

    expect(persistSessionMatches).toHaveBeenCalledTimes(1);
    expect(persistSessionMatches).toHaveBeenCalledWith(
      expect.anything(),
      SID,
      session.matches,
      session.parsedCargos,
      session.parsedVessels,
    );
    // Re-resolve uses the stale row's stable cargo_id/vessel_id under the live session.
    expect(getMatchBySlug).toHaveBeenCalledWith(expect.anything(), 'cargo-A', 'vessel-B', SID);
    expect(notFound).not.toHaveBeenCalled();
  });

  it('demo mode + stale row that does NOT re-resolve → still notFound', async () => {
    mockCookie(SID);
    (getSession as jest.Mock).mockReturnValue(emptySession());
    (isDemoMode as jest.Mock).mockReturnValue(true);
    (getMatch as jest.Mock).mockReturnValue(makeMatch({ id: 55, user_id: 'sess-evicted' }));
    (getMatchBySlug as jest.Mock).mockReturnValue(null); // re-persist didn't help

    await expect(invoke('55')).rejects.toThrow('NEXT_NOT_FOUND');

    expect(persistSessionMatches).toHaveBeenCalledTimes(1);
    expect(notFound).toHaveBeenCalled();
  });
});

describe('#975 match/[id] — non-demo isolation (no cross-session leak)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('non-demo + match owned by another session → notFound, no re-persist', async () => {
    mockCookie(SID);
    (getSession as jest.Mock).mockReturnValue(emptySession());
    (isDemoMode as jest.Mock).mockReturnValue(false);
    (getMatch as jest.Mock).mockReturnValue(makeMatch({ id: 77, user_id: 'sess-other' }));

    await expect(invoke('77')).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFound).toHaveBeenCalled();
    // The demo-only re-persist branch must NOT run outside demo mode.
    expect(persistSessionMatches).not.toHaveBeenCalled();
    expect(getMatchBySlug).not.toHaveBeenCalled();
  });
});
