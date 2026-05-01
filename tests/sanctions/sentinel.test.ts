/**
 * β-09: Sanction Sentinel — unit tests.
 *
 * Covers:
 * 1. Each of 5 sanction-corpus fixtures detected with correct severity.
 * 2. Active deal linked to sanctioned counterparty → alert generated.
 * 3. Clean deal → 0 alerts (no false positives).
 * 4. Notification dispatch invoked with correct payload.
 */

import {
  scanActiveDeals,
  classifySeverity,
  scoreMatch,
  type ActiveDeal,
  type SentinelAlert,
} from '@/lib/sanctions/sentinel';
import { loadSanctionFixtures } from '@/lib/sample-data/sanction-corpus';
import {
  setDispatcher,
  resetDispatcher,
  type Notification,
} from '@/lib/notifications/dispatch';

describe('β-09 Sentinel — severity classifier', () => {
  it('exact match + OFAC SDN → critical', () => {
    expect(
      classifySeverity({ confidence: 1.0, list: 'OFAC SDN', exactName: true }),
    ).toBe('critical');
  });

  it('exact match + EU consolidated → critical', () => {
    expect(
      classifySeverity({ confidence: 1.0, list: 'EU consolidated', exactName: true }),
    ).toBe('critical');
  });

  it('fuzzy ≥ 0.9 + OFAC → high', () => {
    expect(
      classifySeverity({ confidence: 0.92, list: 'OFAC SDN', exactName: false }),
    ).toBe('high');
  });

  it('fuzzy 0.75–0.9 → medium', () => {
    expect(
      classifySeverity({ confidence: 0.8, list: 'OFAC SDN', exactName: false }),
    ).toBe('medium');
  });

  it('alias / weak signal → low', () => {
    expect(
      classifySeverity({ confidence: 0.6, list: 'OFAC SDN', exactName: false }),
    ).toBe('low');
  });

  it('confidence below 0.5 → null (no alert)', () => {
    expect(
      classifySeverity({ confidence: 0.3, list: 'OFAC SDN', exactName: false }),
    ).toBeNull();
  });
});

describe('β-09 Sentinel — corpus fixture detection', () => {
  const fixtures = loadSanctionFixtures();

  it('loads 5 sanction fixtures', () => {
    expect(fixtures.length).toBe(5);
  });

  it('flags sanction-01 (vessel IMO match) as critical / high', () => {
    const fx = fixtures.find((f) => f.id === 'sanction-01');
    expect(fx).toBeDefined();
    const result = scoreMatch(
      { name: 'MV PACIFIC PEARL', imo: '9876543' },
      fx!.expected.flaggedEntities,
    );
    expect(result.matched).toBe(true);
    expect(['critical', 'high']).toContain(result.severity);
  });

  it('flags sanction-02 (Sovcomflot) as critical', () => {
    const fx = fixtures.find((f) => f.id === 'sanction-02');
    const result = scoreMatch(
      { name: 'Sovcomflot Group' },
      fx!.expected.flaggedEntities,
    );
    expect(result.matched).toBe(true);
    expect(result.severity).toBe('critical');
  });

  it('flags sanction-03 (Crystal Maritime FZE) as medium', () => {
    const fx = fixtures.find((f) => f.id === 'sanction-03');
    const result = scoreMatch(
      { name: 'Crystal Maritime FZE' },
      fx!.expected.flaggedEntities,
    );
    expect(result.matched).toBe(true);
    expect(result.severity).toBe('medium');
  });

  it('does NOT flag sanction-04 false-positive (different IMO)', () => {
    const fx = fixtures.find((f) => f.id === 'sanction-04');
    expect(fx!.expected.shouldFlag).toBe(false);
    // Disambiguate by IMO.
    const result = scoreMatch(
      { name: 'MV PACIFIC PEARL', imo: '9412081' },
      [
        {
          name: 'MV PACIFIC PEARL',
          type: 'vessel',
          imo: '9876543',
          matchReason: 'OFAC SDN',
          confidence: 'high',
        },
      ],
    );
    expect(result.matched).toBe(false);
  });

  it('flags sanction-05 (Mariupol port) as critical', () => {
    const fx = fixtures.find((f) => f.id === 'sanction-05');
    const result = scoreMatch(
      { name: 'Mariupol' },
      fx!.expected.flaggedEntities,
    );
    expect(result.matched).toBe(true);
    expect(result.severity).toBe('critical');
  });
});

describe('β-09 Sentinel — scanActiveDeals', () => {
  beforeEach(() => resetDispatcher());
  afterEach(() => resetDispatcher());

  it('generates alerts for deals linked to sanctioned counterparty', async () => {
    const deals: ActiveDeal[] = [
      {
        id: 'deal-1',
        counterpartyName: 'Sovcomflot Group',
        vesselName: 'MV NORDIC LIGHT',
        loadPort: 'Novorossiysk',
        dischargePort: 'Rotterdam',
      },
    ];
    const alerts = await scanActiveDeals({
      dealsProvider: () => deals,
      source: 'event-driven',
    });
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].dealId).toBe('deal-1');
    expect(alerts[0].counterparty).toBe('Sovcomflot Group');
    expect(['critical', 'high']).toContain(alerts[0].severity);
  });

  it('returns 0 alerts on clean deals (no false positives)', async () => {
    const deals: ActiveDeal[] = [
      {
        id: 'deal-clean',
        counterpartyName: 'Cargill International SA',
        vesselName: 'MV ATLANTIC TRADER',
        loadPort: 'Rosario',
        dischargePort: 'Rotterdam',
      },
    ];
    const alerts = await scanActiveDeals({ dealsProvider: () => deals });
    expect(alerts.length).toBe(0);
  });

  it('dispatches notification with correct payload', async () => {
    const captured: Notification[] = [];
    setDispatcher((n) => { captured.push(n); });

    const deals: ActiveDeal[] = [
      {
        id: 'deal-X',
        counterpartyName: 'Sovcomflot Group',
      },
    ];
    const alerts: SentinelAlert[] = await scanActiveDeals({
      dealsProvider: () => deals,
      dispatch: true,
    });
    expect(alerts.length).toBeGreaterThan(0);
    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0].title).toContain('Sovcomflot');
    expect(['critical', 'high', 'medium', 'low']).toContain(captured[0].severity);
    expect(captured[0].meta?.dealId).toBe('deal-X');
  });

  it('returns [] when no active deals provided', async () => {
    const alerts = await scanActiveDeals({ dealsProvider: () => [] });
    expect(alerts).toEqual([]);
  });
});
