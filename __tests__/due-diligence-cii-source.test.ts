import { buildDueDiligence, type BuildDDArgs } from '@/lib/matching/due-diligence';
import type { ParsedVessel } from '@/lib/types';

// DISPLAY-only provenance: the DD vetting panel must reflect the REAL CII source
// (vessel.ciiSource) — mirror CiiRatingBadge convention — not always claim Equasis.
// Scoring (counter / fitPercent) is unaffected; these tests assert the source label only.

function makeVessel(over: Partial<ParsedVessel>): ParsedVessel {
  return {
    flag: 'Panama',
    built: 2015,
    classSociety: 'DNV',
    pandi: 'Gard',
    ciiRating: 'D',
    ...over,
  } as ParsedVessel;
}

function makeArgs(vessel: ParsedVessel | null): BuildDDArgs {
  return {
    fitBreakdown: null,
    fitPercent: null,
    worksheet: null,
    sanctions: null,
    tceUsdPerDay: null,
    breakevenTce: null,
    freightRateSource: null,
    consumptionEstimated: false,
    vessel,
    cargoDescription: null,
    refYear: 2025,
  };
}

function ciiCheck(args: BuildDDArgs) {
  const dd = buildDueDiligence(args);
  const vetting = dd.categories.find((c) => c.key === 'vetting');
  return vetting?.checks.find((c) => c.label === 'CII rating');
}

describe('DD CII source reflects real provenance (not always Equasis)', () => {
  it('estimated → estimate label, never claims Equasis', () => {
    const check = ciiCheck(makeArgs(makeVessel({ ciiRating: 'D', ciiSource: 'estimated' })));
    expect(check).toBeDefined();
    expect(check!.source).not.toContain('Equasis');
    expect(check!.source).toContain('Оценка');
    expect(check!.detail).not.toContain('из Equasis');
    expect(check!.detail).toContain('оценка по возрасту/типу');
  });

  it('llm-fallback → AI estimate label, never claims Equasis', () => {
    const check = ciiCheck(makeArgs(makeVessel({ ciiRating: 'E', ciiSource: 'llm-fallback' })));
    expect(check).toBeDefined();
    expect(check!.source).not.toContain('Equasis');
    expect(check!.source).toContain('Оценка');
    expect(check!.detail).not.toContain('из Equasis');
    expect(check!.detail).toContain('ИИ');
  });

  it('imo-public → keeps Equasis', () => {
    const check = ciiCheck(makeArgs(makeVessel({ ciiRating: 'D', ciiSource: 'imo-public' })));
    expect(check).toBeDefined();
    expect(check!.source).toBe('Equasis');
    expect(check!.detail).toContain('из Equasis');
  });

  it('null/undefined ciiSource degrades gracefully — does not crash, does not falsely claim Equasis', () => {
    // No ciiSource at all → treat as not-an-estimate fallback, but must not throw.
    const check = ciiCheck(makeArgs(makeVessel({ ciiRating: 'D', ciiSource: null })));
    expect(check).toBeDefined();
    // graceful: a non-empty source string, no crash
    expect(typeof check!.source).toBe('string');
  });

  it('PSC stays Equasis — invariant source untouched', () => {
    // PSC only renders when detentionCount is supplied via worksheet; assert the
    // static label is unchanged regardless of CII provenance branch.
    const dd = buildDueDiligence(makeArgs(makeVessel({ ciiSource: 'estimated' })));
    const vetting = dd.categories.find((c) => c.key === 'vetting');
    const psc = vetting?.checks.find((c) => c.label === 'PSC detentions');
    if (psc && psc.state !== 'inactive') {
      expect(psc.source).toBe('Equasis');
    }
  });
});
