/**
 * match/[id] — item-aware sessionMatch resolution (migration 051).
 *
 * Since migration 051 a single (cargo_id, vessel_id) email pair can produce
 * MULTIPLE distinct matches, disambiguated by (cargo_item_index,
 * vessel_item_index). The detail page's `session.matches.find(...)` must use
 * the FULL 4-part key — matching the storedMatch's item indices — otherwise it
 * returns the FIRST session item and the tabs / worksheet / economics render a
 * DIFFERENT item than the hero (prod-confirmed on 128 multi-item pairs).
 *
 * This is a BEHAVIORAL suite: it invokes the real server component with mocked
 * deps and walks the returned element tree to read the `match` prop actually
 * handed to <MatchTabs> — i.e. the sessionMatch the page resolved.
 *
 * The sibling static suite (match-detail.test.tsx) cannot catch this: a 2-part
 * .find() still string-matches every regex there.
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

// Stub heavy client components / data libs so module load stays hermetic. The
// MatchTabs stub identity (imported below) lets us locate its element in the tree.
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
jest.mock('@/lib/sailing/port-distances', () => ({ getPortDistance: () => null }));
jest.mock('@/lib/market/baltic-freight', () => ({ getBalticDayRate: () => null }));
jest.mock('@/lib/imo/cii-lookup', () => ({ lookupCii: jest.fn() }));

import { cookies } from 'next/headers';
import { getSession } from '@/lib/session';
import { isDemoMode } from '@/lib/demo-mode';
import { getMatch } from '@/lib/matching/matches-repository';
import { MatchTabs } from '@/components/match/MatchTabs';
import MatchDetailPage from '@/app/match/[id]/page';

const SID = 'sess-current';

function mockCookie(value: string | undefined): void {
  (cookies as jest.Mock).mockResolvedValue({
    get: (name: string) => (name === 'session_id' && value ? { value } : undefined),
  });
}

// Two matches share the SAME (cargoEmailId, vesselEmailId) email pair but differ
// by item index — exactly the migration-051 multi-item shape. Only fields the
// page reads on this path are populated.
function makeSessionMatch(cargoItemIndex: number, vesselItemIndex: number, matchLevel = 'possible') {
  return {
    cargoEmailId: 'cE',
    vesselEmailId: 'vE',
    cargoItemIndex,
    vesselItemIndex,
    matchLevel,
  } as never;
}

function makeStored(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    cargo_id: 'cE',
    vessel_id: 'vE',
    score: 80,
    status: 'new',
    user_id: SID,
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
    fit_percent: null,
    fit_breakdown: null,
    worksheet_json: null,
    consumption_estimated: null,
    ballast_distance_nm: null,
    breakeven_tce_usd_per_day: null,
    cargo_item_index: 0,
    vessel_item_index: 0,
    ...overrides,
  };
}

// Walk the returned React element tree for the first element whose type is the
// MatchTabs stub, and return its props. No rendering — the page's resolution
// logic has already run by the time it returns the tree.
function findMatchTabsProps(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findMatchTabsProps(child);
      if (found) return found;
    }
    return null;
  }
  const el = node as { type?: unknown; props?: { children?: unknown } };
  if (el.type === MatchTabs) return (el.props ?? {}) as Record<string, unknown>;
  return el.props?.children != null ? findMatchTabsProps(el.props.children) : null;
}

function sessionWith(matches: unknown[]) {
  return { matches, parsedCargos: [], parsedVessels: [], emails: [] };
}

async function resolveTabsMatch(stored: Record<string, unknown>, matches: unknown[]) {
  mockCookie(SID);
  (getSession as jest.Mock).mockReturnValue(sessionWith(matches));
  (isDemoMode as jest.Mock).mockReturnValue(false);
  (getMatch as jest.Mock).mockReturnValue(stored);
  const tree = await MatchDetailPage({ params: Promise.resolve({ id: '101' }) });
  const props = findMatchTabsProps(tree);
  return props?.match as { cargoItemIndex: number; vesselItemIndex: number } | undefined;
}

describe('match/[id] — item-aware sessionMatch resolution (migration 051)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('picks the session item whose indices match storedMatch, not the first item of the pair', async () => {
    // Item 0/0 is FIRST in the array — the 2-part key would wrongly pick it.
    // storedMatch points at the SECOND item (1/2).
    const first = makeSessionMatch(0, 0, 'good');
    const wanted = makeSessionMatch(1, 2, 'possible');
    const stored = makeStored({ cargo_item_index: 1, vessel_item_index: 2 });

    const resolved = await resolveTabsMatch(stored, [first, wanted]);

    expect(resolved).toBeDefined();
    expect(resolved!.cargoItemIndex).toBe(1);
    expect(resolved!.vesselItemIndex).toBe(2);
    expect(resolved).toBe(wanted);
  });

  it('legacy null index columns resolve to item 0/0 via ?? 0 fallback', async () => {
    const itemZero = makeSessionMatch(0, 0, 'good');
    const other = makeSessionMatch(1, 1, 'possible');
    const stored = makeStored({ cargo_item_index: null, vessel_item_index: null });

    const resolved = await resolveTabsMatch(stored, [other, itemZero]);

    expect(resolved).toBe(itemZero);
    expect(resolved!.cargoItemIndex).toBe(0);
    expect(resolved!.vesselItemIndex).toBe(0);
  });

  it('still resolves the single-item case (no regression on item 0/0 pairs)', async () => {
    const only = makeSessionMatch(0, 0, 'good');
    const stored = makeStored({ cargo_item_index: 0, vessel_item_index: 0 });

    const resolved = await resolveTabsMatch(stored, [only]);

    expect(resolved).toBe(only);
  });
});
