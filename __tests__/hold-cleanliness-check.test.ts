import { applyHoldCleanliness } from '@/lib/matching/hold-cleanliness';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    cargoEmailId: 'c1',
    cargoItemIndex: 0,
    vesselEmailId: 'v1',
    vesselItemIndex: 0,
    score: 75,
    matchLevel: 'good',
    matchReasons: [],
    issues: [],
    ...overrides,
  };
}

function makeCargo(description: string): ParsedCargo {
  return {
    emailId: 'c1',
    itemIndex: 0,
    cargoDescription: { value: description, confidence: 'confirmed', sourceQuote: null },
    cargoType: 'BULK',
    originPort: null,
    originCountry: null,
    destinationPort: null,
    destinationCountry: null,
    weightMt: null,
    weightMtMin: null,
    weightMtMax: null,
    volumeCbm: null,
    dimensions: null,
    containerType: null,
    quantity: null,
    incoterms: null,
    preferredDates: null,
    laycan: null,
    loadingRate: null,
    dischargeRate: null,
    commissionPercent: null,
    commissionTerms: null,
    specialRequirements: null,
    stowageFactor: null,
    missingInfo: [],
  } as unknown as ParsedCargo;
}

function makeVessel(lastCargoes: string | null): Pick<ParsedVessel, 'lastCargoes'> {
  return { lastCargoes };
}

describe('applyHoldCleanliness', () => {
  describe('incompatible pair: coal lastCargo → grain cargo', () => {
    it('adds a cleanliness issue', () => {
      const m = makeMatch();
      applyHoldCleanliness(m, makeCargo('grain'), makeVessel('coal') as ParsedVessel);
      expect(m.issues.some((i) => /cleanliness|incompatible/i.test(i))).toBe(true);
    });

    it('demotes confidence to uncertain', () => {
      const m = makeMatch({
        confidence: {
          level: 'verified',
          blockSend: false,
          blockedFields: [],
          fieldConfidences: [],
        },
      });
      applyHoldCleanliness(m, makeCargo('grain'), makeVessel('coal') as ParsedVessel);
      expect(m.confidence?.level).toBe('uncertain');
      expect(m.confidence?.blockSend).toBe(true);
    });

    it('slash-separated lastCargoes parses correctly', () => {
      const m = makeMatch();
      applyHoldCleanliness(m, makeCargo('grain'), makeVessel('petcoke/coal') as ParsedVessel);
      expect(m.issues.some((i) => /cleanliness|incompatible/i.test(i))).toBe(true);
    });
  });

  describe('compatible pair', () => {
    it('does not add cleanliness incompatibility issue for wheat → wheat', () => {
      const m = makeMatch({
        confidence: { level: 'inferred', blockSend: false, blockedFields: [], fieldConfidences: [] },
      });
      applyHoldCleanliness(m, makeCargo('wheat'), makeVessel('wheat') as ParsedVessel);
      expect(m.issues.filter((i) => /incompatible/i.test(i))).toHaveLength(0);
      expect(m.confidence?.level).toBe('inferred');
    });

    it('does nothing when vessel.lastCargoes is null', () => {
      const m = makeMatch();
      applyHoldCleanliness(m, makeCargo('grain'), makeVessel(null) as ParsedVessel);
      expect(m.issues).toHaveLength(0);
    });

    it('does nothing when cargo description is missing', () => {
      const m = makeMatch();
      const cargo = makeCargo('grain');
      cargo.cargoDescription = null;
      applyHoldCleanliness(m, cargo, makeVessel('coal') as ParsedVessel);
      expect(m.issues).toHaveLength(0);
    });
  });

  describe('extra_clean caution (compatible but requires cleaning)', () => {
    it('adds caution issue for extra_clean pair without demotion', () => {
      // * → DRI triggers extra_clean=true but compatible=true in l5c-matrix
      const m = makeMatch({
        confidence: { level: 'inferred', blockSend: false, blockedFields: [], fieldConfidences: [] },
      });
      applyHoldCleanliness(m, makeCargo('DRI'), makeVessel('wheat') as ParsedVessel);
      const hasExtraClean = m.issues.some((i) => /extra clean|caution/i.test(i));
      expect(hasExtraClean).toBe(true);
      // confidence must NOT be demoted for compatible+extra_clean
      expect(m.confidence?.level).toBe('inferred');
      expect(m.confidence?.blockSend).toBe(false);
    });
  });

  /** Audit C.4: blockSend=true used to leave the match in mainMatches AND let
   *  classifyPriority flag it 'urgent'. Demoting matchLevel to 'weak' routes it
   *  to the review bucket via the existing partition rule (pair-analyzer:798). */
  describe('matchLevel demotion (audit C.4)', () => {
    it('incompatible last cargo (coal → grain) demotes matchLevel to weak', () => {
      const m = makeMatch({
        confidence: {
          level: 'verified',
          blockSend: false,
          blockedFields: [],
          fieldConfidences: [],
        },
      });
      applyHoldCleanliness(m, makeCargo('grain'), makeVessel('coal') as ParsedVessel);
      // sanity: fixture really trips the incompatible branch
      expect(m.confidence?.blockSend).toBe(true);
      expect(m.matchLevel).toBe('weak');
      expect(m.issues.join()).toContain('Hold cleanliness');
    });

    it('compatible cargo (wheat → wheat) keeps its matchLevel', () => {
      const m = makeMatch();
      applyHoldCleanliness(m, makeCargo('wheat'), makeVessel('wheat') as ParsedVessel);
      expect(m.matchLevel).toBe('good');
    });

    it('requires_extra_clean (wheat → DRI, compatible) does not demote matchLevel', () => {
      const m = makeMatch({
        confidence: { level: 'inferred', blockSend: false, blockedFields: [], fieldConfidences: [] },
      });
      applyHoldCleanliness(m, makeCargo('DRI'), makeVessel('wheat') as ParsedVessel);
      expect(m.confidence?.blockSend).toBe(false);
      expect(m.matchLevel).toBe('good');
    });
  });
});
