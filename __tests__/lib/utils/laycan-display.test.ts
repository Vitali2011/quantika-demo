// __tests__/lib/utils/laycan-display.test.ts
import { resolveLaycanDisplay } from '@/lib/utils/laycan-display';
import type { MatchWorksheet } from '@/lib/types';

const REF_YEAR = 2026;

function ws(start: string | null, end: string | null): MatchWorksheet {
  // Minimal MatchWorksheet stub — only the readiness fields the util reads.
  return {
    readiness: {
      openDate: null,
      laycanStart: start,
      laycanEnd: end,
      distanceNm: null,
      speedKn: null,
      sailingDays: null,
      arrivalDate: null,
      gapDays: null,
      verdict: 'unknown',
      explanation: '',
      isSpot: false,
    },
  } as unknown as MatchWorksheet;
}

describe('resolveLaycanDisplay — readiness wins', () => {
  it('worksheet present with start+end → ISO→ms→fmtLaycan', () => {
    expect(
      resolveLaycanDisplay({
        worksheet: ws('2026-06-03', '2026-06-13'),
        storedStart: 1700000000000, // would render very differently — must be ignored
        storedEnd: 1700000000000,
        cargoRaw: 'May 29',
        refYear: REF_YEAR,
      }),
    ).toBe('Jun 3–Jun 13');
  });

  it('worksheet present with only start → single-date format', () => {
    expect(
      resolveLaycanDisplay({
        worksheet: ws('2026-06-03', null),
        storedStart: null,
        storedEnd: null,
        cargoRaw: null,
        refYear: REF_YEAR,
      }),
    ).toBe('Jun 3');
  });

  it('worksheet present with only end → single-date format', () => {
    expect(
      resolveLaycanDisplay({
        worksheet: ws(null, '2026-06-13'),
        storedStart: null,
        storedEnd: null,
        cargoRaw: null,
        refYear: REF_YEAR,
      }),
    ).toBe('Jun 13');
  });

  it('worksheet readiness both null → falls through to stored ms', () => {
    expect(
      resolveLaycanDisplay({
        worksheet: ws(null, null),
        storedStart: new Date('2026-06-02T00:00:00Z').getTime(),
        storedEnd: new Date('2026-06-09T00:00:00Z').getTime(),
        cargoRaw: null,
        refYear: REF_YEAR,
      }),
    ).toBe('Jun 2–Jun 9');
  });

  it('worksheet null → falls through to stored ms', () => {
    expect(
      resolveLaycanDisplay({
        worksheet: null,
        storedStart: new Date('2026-06-02T00:00:00Z').getTime(),
        storedEnd: new Date('2026-06-09T00:00:00Z').getTime(),
        cargoRaw: null,
        refYear: REF_YEAR,
      }),
    ).toBe('Jun 2–Jun 9');
  });
});

describe('resolveLaycanDisplay — stored ms fallback', () => {
  it('stored start === end → single-date (delegated to fmtLaycan)', () => {
    const ts = new Date('2026-06-02T00:00:00Z').getTime();
    expect(
      resolveLaycanDisplay({
        worksheet: null,
        storedStart: ts,
        storedEnd: ts,
        cargoRaw: null,
        refYear: REF_YEAR,
      }),
    ).toBe('Jun 2');
  });

  it('only storedStart present → single-date', () => {
    expect(
      resolveLaycanDisplay({
        worksheet: null,
        storedStart: new Date('2026-06-02T00:00:00Z').getTime(),
        storedEnd: null,
        cargoRaw: null,
        refYear: REF_YEAR,
      }),
    ).toBe('Jun 2');
  });
});

describe('resolveLaycanDisplay — cargo raw fallback', () => {
  it('worksheet+stored absent, cargoRaw range → parseLaycan→fmt', () => {
    expect(
      resolveLaycanDisplay({
        worksheet: null,
        storedStart: null,
        storedEnd: null,
        cargoRaw: 'Jun 2-9',
        refYear: REF_YEAR,
      }),
    ).toBe('Jun 2–Jun 9');
  });

  it('cargoRaw spot label → "Spot"', () => {
    expect(
      resolveLaycanDisplay({
        worksheet: null,
        storedStart: null,
        storedEnd: null,
        cargoRaw: 'Spot — Prompt',
        refYear: REF_YEAR,
      }),
    ).toBe('Spot');
  });

  it('cargoRaw unparseable → raw passthrough', () => {
    expect(
      resolveLaycanDisplay({
        worksheet: null,
        storedStart: null,
        storedEnd: null,
        cargoRaw: 'not a date at all',
        refYear: REF_YEAR,
      }),
    ).toBe('not a date at all');
  });
});

describe('resolveLaycanDisplay — edge / null', () => {
  it('everything null → null', () => {
    expect(
      resolveLaycanDisplay({
        worksheet: null,
        storedStart: null,
        storedEnd: null,
        cargoRaw: null,
        refYear: REF_YEAR,
      }),
    ).toBeNull();
  });

  it('empty cargoRaw string → null (matches formatCargoLaycanDisplay contract)', () => {
    expect(
      resolveLaycanDisplay({
        worksheet: null,
        storedStart: null,
        storedEnd: null,
        cargoRaw: '',
        refYear: REF_YEAR,
      }),
    ).toBeNull();
  });

  it('worksheet readiness laycanStart === laycanEnd → single date', () => {
    expect(
      resolveLaycanDisplay({
        worksheet: ws('2026-06-15', '2026-06-15'),
        storedStart: null,
        storedEnd: null,
        cargoRaw: null,
        refYear: REF_YEAR,
      }),
    ).toBe('Jun 15');
  });
});
