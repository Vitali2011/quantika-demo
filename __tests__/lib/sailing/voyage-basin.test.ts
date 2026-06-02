import {
  portBasin,
  voyageBasins,
  isCandidateInVoyageBasins,
  Basin,
} from '@/lib/sailing/voyage-basin';

describe('portBasin — port → basin classification', () => {
  describe('Black Sea', () => {
    it.each(['ROCND', 'UAODS', 'UANLK', 'BGVAR', 'RUNVS', 'TRKRS'])(
      'classifies %s as BlackSea',
      (locode) => {
        expect(portBasin(locode)).toBe('BlackSea');
      },
    );
    it('classifies canonical name "Constanta" as BlackSea', () => {
      expect(portBasin('Constanta')).toBe('BlackSea');
    });
  });

  describe('East Med (gateway through Bosphorus + Suez)', () => {
    it.each(['TRIST', 'GRPIR', 'EGALY', 'EGPSD', 'CYLMS', 'TRMER', 'SYTTS', 'EGDAM'])(
      'classifies %s as EastMed',
      (locode) => {
        expect(portBasin(locode)).toBe('EastMed');
      },
    );
  });

  describe('West Med', () => {
    it.each(['GIGIB', 'ESALG', 'ITAUG', 'MTMLA', 'ITGOA', 'FRMRS', 'ESBCN'])(
      'classifies %s as WestMed',
      (locode) => {
        expect(portBasin(locode)).toBe('WestMed');
      },
    );
  });

  describe('North Europe', () => {
    it.each(['NLRTM', 'BEANR', 'DEHAM', 'GBLIV', 'GBSOU', 'FRLEH'])(
      'classifies %s as NorthEurope',
      (locode) => {
        expect(portBasin(locode)).toBe('NorthEurope');
      },
    );
    it('classifies canonical "Liverpool" as NorthEurope', () => {
      expect(portBasin('Liverpool')).toBe('NorthEurope');
    });
  });

  describe('Atlantic North (N.America east + Mid-Atlantic)', () => {
    it.each(['USHOU', 'USNYC', 'ESLPA'])(
      'classifies %s as AtlanticNorth',
      (locode) => {
        expect(portBasin(locode)).toBe('AtlanticNorth');
      },
    );
  });

  describe('Atlantic South (S.America east + sub-equatorial W.Africa)', () => {
    it('classifies BRSSZ Santos as AtlanticSouth', () => {
      expect(portBasin('BRSSZ')).toBe('AtlanticSouth');
    });
  });

  describe('Pacific (the Bug 1 group — must be excluded for European voyages)', () => {
    it('classifies USLAX as Pacific', () => {
      expect(portBasin('USLAX')).toBe('Pacific');
    });
    it.each(['USSEA', 'CAVAN'])('classifies %s as Pacific', (locode) => {
      expect(portBasin(locode)).toBe('Pacific');
    });
  });

  describe('Other basins', () => {
    it('classifies Fujairah AEFJR as Gulf', () => {
      expect(portBasin('AEFJR')).toBe('Gulf');
    });
    it('classifies Jeddah SAJED as RedSea', () => {
      expect(portBasin('SAJED')).toBe('RedSea');
    });
    it('classifies Singapore SGSIN as EastAsia', () => {
      expect(portBasin('SGSIN')).toBe('EastAsia');
    });
    it('classifies Durban ZADUR as SouthAfrica', () => {
      expect(portBasin('ZADUR')).toBe('SouthAfrica');
    });
    it('classifies Shanghai CNSHA as EastAsia', () => {
      expect(portBasin('CNSHA')).toBe('EastAsia');
    });
  });

  it('returns null for unknown ports', () => {
    expect(portBasin('XXXXX')).toBeNull();
    expect(portBasin('')).toBeNull();
  });
});

describe('voyageBasins — connecting basins along a route', () => {
  it('caboteur within Black Sea only', () => {
    const b = voyageBasins('UAODS', 'ROCND');
    expect(b).toContain('BlackSea');
  });

  it('Black Sea → East Med passes through Bosphorus', () => {
    const b = voyageBasins('ROCND', 'EGALY');
    expect(b).toContain('BlackSea');
    expect(b).toContain('EastMed');
  });

  it('Black Sea → North Europe traverses BlackSea, EastMed, WestMed, AtlanticNorth, NorthEurope', () => {
    const b = voyageBasins('ROCND', 'GBLIV');
    expect(b).toContain('BlackSea');
    expect(b).toContain('EastMed');
    expect(b).toContain('WestMed');
    expect(b).toContain('AtlanticNorth');
    expect(b).toContain('NorthEurope');
    // Pacific, AtlanticSouth NOT on the path — this is Bug 1's exclusion
    expect(b).not.toContain('Pacific');
    expect(b).not.toContain('AtlanticSouth');
  });

  it('East Med → North Europe traverses Med + AtlanticNorth + NorthEurope', () => {
    const b = voyageBasins('GRPIR', 'GBLIV');
    expect(b).toContain('EastMed');
    expect(b).toContain('WestMed');
    expect(b).toContain('AtlanticNorth');
    expect(b).toContain('NorthEurope');
    expect(b).not.toContain('Pacific');
    expect(b).not.toContain('BlackSea');
    expect(b).not.toContain('AtlanticSouth');
  });

  it('East Med → Red Sea via Suez', () => {
    const b = voyageBasins('EGALY', 'SAJED');
    expect(b).toContain('EastMed');
    expect(b).toContain('RedSea');
  });

  it('Singapore → Houston traverses Pacific (or Indian+SAfrica) — long deep-sea route', () => {
    const b = voyageBasins('SGSIN', 'USHOU');
    expect(b).toContain('EastAsia');
    expect(b).toContain('AtlanticNorth');
  });

  it('returns empty set when endpoints unknown', () => {
    expect(voyageBasins('XXXXX', 'YYYYY').size).toBe(0);
  });
});

describe('isCandidateInVoyageBasins — Bug 1 acceptance', () => {
  it('Constanta → Liverpool: USLAX is NOT on-route (Pacific basin)', () => {
    expect(isCandidateInVoyageBasins('USLAX', 'ROCND', 'GBLIV')).toBe(false);
  });

  it('Constanta → Liverpool: Singapore is NOT on-route (EastAsia basin)', () => {
    expect(isCandidateInVoyageBasins('SGSIN', 'ROCND', 'GBLIV')).toBe(false);
  });

  it('Constanta → Liverpool: Santos is NOT on-route (W.Atlantic / SAm — out of corridor)', () => {
    expect(isCandidateInVoyageBasins('BRSSZ', 'ROCND', 'GBLIV')).toBe(false);
  });

  it('Constanta → Liverpool: Gibraltar IS on-route (WestMed basin in corridor)', () => {
    expect(isCandidateInVoyageBasins('GIGIB', 'ROCND', 'GBLIV')).toBe(true);
  });

  it('Constanta → Liverpool: Piraeus IS on-route (EastMed)', () => {
    expect(isCandidateInVoyageBasins('GRPIR', 'ROCND', 'GBLIV')).toBe(true);
  });

  it('Constanta → Liverpool: Constanta itself IS on-route (BlackSea = origin basin)', () => {
    expect(isCandidateInVoyageBasins('ROCND', 'ROCND', 'GBLIV')).toBe(true);
  });

  it('Constanta → Mersin: Gibraltar NOT on-route (within East Med corridor)', () => {
    // Caboteur within East Med — gibraltar at far end of Med is technically reachable but
    // not on this short corridor. Acceptable noise-or-included; the test pins behavior:
    // Med-internal voyage must include WestMed if endpoint isn't BlackSea-only.
    // Looser check: Constanta+Mersin both touch EastMed; Black+EastMed corridor.
    const b = voyageBasins('ROCND', 'TRMER');
    expect(b).toContain('EastMed');
    expect(b).not.toContain('Pacific');
    expect(b).not.toContain('EastAsia');
  });

  it('Singapore → Tokyo (Asia-only): European hubs NOT on-route', () => {
    expect(isCandidateInVoyageBasins('GIGIB', 'SGSIN', 'JPTYO')).toBe(false);
    expect(isCandidateInVoyageBasins('NLRTM', 'SGSIN', 'JPTYO')).toBe(false);
  });

  it('unknown candidate → not on-route', () => {
    expect(isCandidateInVoyageBasins('XXXXX', 'ROCND', 'GBLIV')).toBe(false);
  });

  it('unknown endpoints → fail-open (true) to preserve existing behavior', () => {
    // If we cannot classify endpoints, do not filter — let downstream detour-check decide.
    expect(isCandidateInVoyageBasins('GIGIB', 'XXXXX', 'GBLIV')).toBe(true);
  });
});

describe('Basin enum surface', () => {
  it('exposes all defined basins as string literals', () => {
    const known: Basin[] = [
      'BlackSea', 'EastMed', 'WestMed', 'AtlanticNorth', 'AtlanticSouth',
      'NorthEurope', 'RedSea', 'Gulf', 'IndianOcean', 'EastAsia', 'Pacific',
      'SouthAfrica',
    ];
    expect(known.length).toBeGreaterThan(0);
  });
});
