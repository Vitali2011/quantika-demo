/**
 * Spec-04: UNLOCODE detection for JWC HRA zones.
 * Tests that passing LOCODE strings (as plain strings or portCode in ResolvedPort)
 * correctly triggers war-risk zone matching.
 */
import { calculateWarRiskPremium } from '@/lib/economics/war-risk';
import type { ResolvedPort } from '@/lib/ports/resolve';

function makePort(portCode: string, portName: string, aliases: string[] = []): ResolvedPort {
  return { portCode, portName, aliases, country: '', timezone: '' } as unknown as ResolvedPort;
}

describe('war-risk UNLOCODE detection', () => {
  describe('Red Sea / Bab al-Mandeb HRA', () => {
    it('SAJED triggers Red Sea HRA via plain UNLOCODE string', () => {
      const result = calculateWarRiskPremium({
        route: { fromPort: 'SAJED', toPort: 'NLRTM' },
        vesselValueUsd: 10_000_000,
      });
      expect(result.applicable).toBe(true);
      expect(result.zoneIds).toContain('red-sea-hra');
    });

    it('EGSCD triggers Red Sea HRA via plain UNLOCODE string', () => {
      const result = calculateWarRiskPremium({
        route: { fromPort: 'GBFXT', toPort: 'EGSCD' },
        vesselValueUsd: 10_000_000,
      });
      expect(result.applicable).toBe(true);
      expect(result.zoneIds).toContain('red-sea-hra');
    });

    it('SAJED triggers Red Sea HRA via ResolvedPort portCode', () => {
      const port = makePort('SAJED', 'Jeddah', ['jeddah port']);
      const result = calculateWarRiskPremium({
        route: { fromPort: port, toPort: 'NLRTM' },
        vesselValueUsd: 10_000_000,
      });
      expect(result.applicable).toBe(true);
      expect(result.zoneIds).toContain('red-sea-hra');
    });
  });

  describe('Black Sea Russia/Ukraine HRA', () => {
    it('UAODS triggers Black Sea HRA via plain UNLOCODE string', () => {
      const result = calculateWarRiskPremium({
        route: { fromPort: 'UAODS', toPort: 'NLRTM' },
        vesselValueUsd: 10_000_000,
      });
      expect(result.applicable).toBe(true);
      expect(result.zoneIds).toContain('black-sea-hra');
    });

    it('UAMYI triggers Black Sea HRA via plain UNLOCODE string', () => {
      const result = calculateWarRiskPremium({
        route: { fromPort: 'UAMYI', toPort: 'DEHAM' },
        vesselValueUsd: 10_000_000,
      });
      expect(result.applicable).toBe(true);
      expect(result.zoneIds).toContain('black-sea-hra');
    });
  });

  describe('Indian Ocean / Somali Corridor HRA', () => {
    it('INBOM triggers Indian Ocean HRA via plain UNLOCODE string', () => {
      const result = calculateWarRiskPremium({
        route: { fromPort: 'INBOM', toPort: 'NLRTM' },
        vesselValueUsd: 10_000_000,
      });
      expect(result.applicable).toBe(true);
      expect(result.zoneIds).toContain('indian-ocean-hra');
    });

    it('PKQCT triggers Indian Ocean HRA via plain UNLOCODE string', () => {
      const result = calculateWarRiskPremium({
        route: { fromPort: 'PKQCT', toPort: 'DEHAM' },
        vesselValueUsd: 10_000_000,
      });
      expect(result.applicable).toBe(true);
      expect(result.zoneIds).toContain('indian-ocean-hra');
    });
  });

  describe('Gulf of Guinea HRA', () => {
    it('NGAPP triggers Gulf of Guinea HRA via plain UNLOCODE string', () => {
      const result = calculateWarRiskPremium({
        route: { fromPort: 'NGAPP', toPort: 'NLRTM' },
        vesselValueUsd: 10_000_000,
      });
      expect(result.applicable).toBe(true);
      expect(result.zoneIds).toContain('gulf-of-guinea');
    });

    it('CIABD triggers Gulf of Guinea HRA via plain UNLOCODE string', () => {
      const result = calculateWarRiskPremium({
        route: { fromPort: 'CIABD', toPort: 'DEHAM' },
        vesselValueUsd: 10_000_000,
      });
      expect(result.applicable).toBe(true);
      expect(result.zoneIds).toContain('gulf-of-guinea');
    });
  });

  describe('Safe routes — no war risk', () => {
    it('SGSIN→AEDXB (Singapore to Dubai) has no war risk', () => {
      const result = calculateWarRiskPremium({
        route: { fromPort: 'SGSIN', toPort: 'AEDXB' },
        vesselValueUsd: 10_000_000,
      });
      expect(result.applicable).toBe(false);
      expect(result.zoneIds).toHaveLength(0);
    });

    it('USNYC→DEHAM (New York to Hamburg) has no war risk', () => {
      const result = calculateWarRiskPremium({
        route: { fromPort: 'USNYC', toPort: 'DEHAM' },
        vesselValueUsd: 10_000_000,
      });
      expect(result.applicable).toBe(false);
      expect(result.zoneIds).toHaveLength(0);
    });
  });
});
