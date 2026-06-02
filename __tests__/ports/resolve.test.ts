/**
 * Tests for lib/ports/resolve.ts
 * TDD: written before implementation
 */

import { resolvePort, resolvePortStrict, PortNotFoundError } from '@/lib/ports/resolve';
import PORTS_JSON from '@/data/ports/port-master.json';

// ── Basic LOCODE lookups ─────────────────────────────────────────────────────

describe('resolvePort — LOCODE input', () => {
  it('resolves BEANR → Antwerp', () => {
    const result = resolvePort('BEANR');
    expect(result).not.toBeNull();
    expect(result!.portCode).toBe('BEANR');
    expect(result!.portName).toBe('Antwerp');
    expect(result!.country).toBe('BE');
  });

  it('resolves NGAPP → Apapa / Lagos', () => {
    const result = resolvePort('NGAPP');
    expect(result).not.toBeNull();
    expect(result!.portCode).toBe('NGAPP');
    // portName should be the canonical name for NGAPP
    expect(result!.portName).toBeTruthy();
    expect(result!.country).toBe('NG');
  });

  it('resolves NLRTM → Rotterdam', () => {
    const result = resolvePort('NLRTM');
    expect(result).not.toBeNull();
    expect(result!.portCode).toBe('NLRTM');
    expect(result!.portName).toBe('Rotterdam');
  });

  it('is case-insensitive for LOCODE input', () => {
    const upper = resolvePort('BEANR');
    const lower = resolvePort('beanr');
    expect(lower).not.toBeNull();
    expect(lower!.portCode).toBe(upper!.portCode);
    expect(lower!.portName).toBe(upper!.portName);
  });
});

// ── Name input ───────────────────────────────────────────────────────────────

describe('resolvePort — name input', () => {
  it('resolves "Antwerp" → BEANR', () => {
    const result = resolvePort('Antwerp');
    expect(result).not.toBeNull();
    expect(result!.portCode).toBe('BEANR');
    expect(result!.portName).toBe('Antwerp');
  });

  it('resolves "ANTWERP" (uppercase) → BEANR', () => {
    const result = resolvePort('ANTWERP');
    expect(result).not.toBeNull();
    expect(result!.portCode).toBe('BEANR');
  });

  it('resolves "Antwerpen" (alias) → BEANR', () => {
    const result = resolvePort('Antwerpen');
    expect(result).not.toBeNull();
    expect(result!.portCode).toBe('BEANR');
    expect(result!.portName).toBe('Antwerp');
  });

  it('resolves "Lagos" → NGAPP (via alias or dedicated entry)', () => {
    const result = resolvePort('Lagos');
    expect(result).not.toBeNull();
    expect(result!.portCode).toBe('NGAPP');
    expect(result!.country).toBe('NG');
  });

  it('resolves "Rotterdam" → NLRTM', () => {
    const result = resolvePort('Rotterdam');
    expect(result).not.toBeNull();
    expect(result!.portCode).toBe('NLRTM');
  });

  it('resolves "Singapore" → SGSIN', () => {
    const result = resolvePort('Singapore');
    expect(result).not.toBeNull();
    expect(result!.portCode).toBe('SGSIN');
  });
});

// ── Consistency between LOCODE and name ─────────────────────────────────────

describe('resolvePort — LOCODE/name consistency', () => {
  it('"Antwerp" and "BEANR" give identical portCode and portName', () => {
    const byName = resolvePort('Antwerp');
    const byCode = resolvePort('BEANR');
    expect(byName!.portCode).toBe(byCode!.portCode);
    expect(byName!.portName).toBe(byCode!.portName);
  });

  it('"Lagos" and "NGAPP" give identical portCode and portName', () => {
    const byName = resolvePort('Lagos');
    const byCode = resolvePort('NGAPP');
    expect(byName!.portCode).toBe(byCode!.portCode);
    expect(byName!.portName).toBe(byCode!.portName);
  });
});

// ── Rejection cases ──────────────────────────────────────────────────────────

describe('resolvePort — null for unknown input', () => {
  it('returns null for empty string', () => {
    expect(resolvePort('')).toBeNull();
  });

  it('returns null for whitespace-only', () => {
    expect(resolvePort('   ')).toBeNull();
  });

  it('returns null for nonsense input', () => {
    expect(resolvePort('xyz123nonexistent')).toBeNull();
  });

  it('does NOT throw on invalid input', () => {
    expect(() => resolvePort('xyz123nonexistent')).not.toThrow();
    expect(() => resolvePort('')).not.toThrow();
  });
});

// ── resolvePortStrict ────────────────────────────────────────────────────────

describe('resolvePortStrict', () => {
  it('resolves valid input normally', () => {
    const result = resolvePortStrict('BEANR');
    expect(result.portCode).toBe('BEANR');
  });

  it('throws PortNotFoundError for unknown input', () => {
    expect(() => resolvePortStrict('xyz')).toThrow(PortNotFoundError);
  });

  it('PortNotFoundError message includes the input', () => {
    try {
      resolvePortStrict('ZZZZZ');
      fail('Expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(PortNotFoundError);
      expect((e as Error).message).toContain('ZZZZZ');
    }
  });
});

// ── ResolvedPort shape ───────────────────────────────────────────────────────

describe('resolvePort — returned object shape', () => {
  it('has all required fields', () => {
    const result = resolvePort('NLRTM');
    expect(result).not.toBeNull();
    expect(typeof result!.portCode).toBe('string');
    expect(typeof result!.portName).toBe('string');
    expect(typeof result!.country).toBe('string');
    expect(typeof result!.lat).toBe('number');
    expect(typeof result!.lon).toBe('number');
    expect(Array.isArray(result!.aliases)).toBe(true);
  });

  it('portCode is always 5 uppercase chars', () => {
    const result = resolvePort('Rotterdam');
    expect(result!.portCode).toMatch(/^[A-Z]{5}$/);
  });
});

// ── Top-30 property tests ────────────────────────────────────────────────────

const TOP_30_PORTS: Array<{ code: string; name: string }> = [
  { code: 'BEANR', name: 'Antwerp' },
  { code: 'NGAPP', name: 'Apapa' },
  { code: 'SGSIN', name: 'Singapore' },
  { code: 'NLRTM', name: 'Rotterdam' },
  { code: 'DEHAM', name: 'Hamburg' },
  { code: 'GHTEM', name: 'Tema' },
  { code: 'KEMBA', name: 'Mombasa' },
  { code: 'SNDKR', name: 'Dakar' },
  { code: 'EGSUZ', name: 'Suez' },
  { code: 'EGPSD', name: 'Port Said' },
  { code: 'USHOU', name: 'Houston' },
  { code: 'USMSY', name: 'New Orleans' },
  { code: 'BRSSZ', name: 'Santos' },
  { code: 'CNSHA', name: 'Shanghai' },
  { code: 'CNTSN', name: 'Tianjin' },
  { code: 'CNTAO', name: 'Qingdao' },
  { code: 'BDCGP', name: 'Chittagong' },
  { code: 'INKDL', name: 'Kandla' },
  { code: 'INBOM', name: 'Mumbai' },
  { code: 'ROCND', name: 'Constanta' },
  { code: 'UAODS', name: 'Odesa' },
  { code: 'RUVVO', name: 'Vladivostok' },
  { code: 'MACAS', name: 'Casablanca' },
  { code: 'PTLIS', name: 'Lisbon' },
  { code: 'GBFXT', name: 'Felixstowe' },
  { code: 'FRLEH', name: 'Le Havre' },
  { code: 'ESALG', name: 'Algeciras' },
  { code: 'GRPIR', name: 'Piraeus' },
  { code: 'ITGOA', name: 'Genoa' },
];

describe('top-30 ports — all have unlocode in JSON', () => {
  const ports = PORTS_JSON as Array<{ unlocode?: string; name?: string }>;
  const locodes = new Set(ports.map((p) => p.unlocode).filter(Boolean));

  it.each(TOP_30_PORTS)('$code ($name) is present in port-master.json', ({ code }) => {
    expect(locodes.has(code)).toBe(true);
  });
});

describe('top-30 ports — LOCODE and name resolve consistently', () => {
  it.each(TOP_30_PORTS)(
    '$code/$name: resolvePort(code) and resolvePort(name) give same portCode+portName',
    ({ code, name }) => {
      const byCode = resolvePort(code);
      const byName = resolvePort(name);

      expect(byCode).not.toBeNull();
      expect(byName).not.toBeNull();

      expect(byCode!.portCode).toBe(byName!.portCode);
      expect(byCode!.portName).toBe(byName!.portName);
    },
  );
});

// ── Wave-2 ports (Phase E5) ──────────────────────────────────────────────────

const WAVE2_PORTS: Array<{ code: string; name: string }> = [
  { code: 'ESLPA', name: 'Las Palmas' },
  { code: 'GEPTI', name: 'Poti' },
  { code: 'EGAAC', name: 'El Arish' },
  { code: 'TRMAR', name: 'Marmara' },
  { code: 'ESSAG', name: 'Sagunto' },
  { code: 'ITSVN', name: 'Savona' },
  { code: 'PTFDF', name: 'Figueira da Foz' },
  { code: 'ITMNF', name: 'Monfalcone' },
  { code: 'MAJFL', name: 'Jorf Lasfar' },
  { code: 'GMBJL', name: 'Banjul' },
];

describe('wave-2 ports — all present in port-master.json', () => {
  const ports = PORTS_JSON as Array<{ unlocode?: string; name?: string }>;
  const locodes = new Set(ports.map((p) => p.unlocode).filter(Boolean));

  it.each(WAVE2_PORTS)('$code ($name) is present in port-master.json', ({ code }) => {
    expect(locodes.has(code)).toBe(true);
  });
});

describe('wave-2 ports — LOCODE and name resolve consistently', () => {
  it.each(WAVE2_PORTS)(
    '$code/$name: resolvePort(code) and resolvePort(name) give same portCode+portName',
    ({ code, name }) => {
      const byCode = resolvePort(code);
      const byName = resolvePort(name);

      expect(byCode).not.toBeNull();
      expect(byName).not.toBeNull();

      expect(byCode!.portCode).toBe(byName!.portCode);
      expect(byCode!.portName).toBe(byName!.portName);
    },
  );
});

describe('wave-2 ports — alias resolution', () => {
  it('Las Palmas resolves alias "L.PALM" → ESLPA', () => {
    const r = resolvePort('L.PALM');
    expect(r).not.toBeNull();
    expect(r!.portCode).toBe('ESLPA');
  });

  it('El Arish resolves alias "Al Arish" → EGAAC', () => {
    const r = resolvePort('Al Arish');
    expect(r).not.toBeNull();
    expect(r!.portCode).toBe('EGAAC');
  });

  it('Poti resolves alias "Poti Sea Port" → GEPTI', () => {
    const r = resolvePort('Poti Sea Port');
    expect(r).not.toBeNull();
    expect(r!.portCode).toBe('GEPTI');
  });
});

describe('resolvePort — diacritic folding (Gate5 #4: re-parsed ports carry native diacritics)', () => {
  // Re-parsed demo ports arrive with native diacritics ("Constanța", "Aliağa")
  // that the ASCII port-master entries ("Constanta", "Aliaga") never matched →
  // port_not_found → no P&L. Fold combining marks before lookup.
  it('"Constanța" (ț) resolves identically to "Constanta"', () => {
    const folded = resolvePort('Constanța');
    const ascii = resolvePort('Constanta');
    expect(ascii).not.toBeNull();
    expect(folded).not.toBeNull();
    expect(folded!.portCode).toBe(ascii!.portCode);
  });
  it('"Aliağa" (ğ) resolves identically to "Aliaga"', () => {
    const folded = resolvePort('Aliağa');
    const ascii = resolvePort('Aliaga');
    expect(ascii).not.toBeNull();
    expect(folded).not.toBeNull();
    expect(folded!.portCode).toBe(ascii!.portCode);
  });
});
