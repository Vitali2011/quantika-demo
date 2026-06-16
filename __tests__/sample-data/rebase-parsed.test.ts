/**
 * Wave A — demo-data freshness. Rebase corpus laycan/openDate onto `now`,
 * preserving within-set spread so demo match counts stay stable across the
 * run date (was drifting 1418 → 662 → 67 as laycans expired).
 */
import { describe, it, expect } from '@jest/globals';
import { rebaseParsedCargoes, rebaseParsedVessels } from '@/lib/sample-data/rebase-parsed';
import { parseLaycan, parseVesselOpenDate } from '@/lib/sailing/date-parsing';
import { cfValue } from '@/lib/types';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

// rebase only reads .laycan / .openDate, so partial fixtures are sufficient.
function cargo(id: string, laycan: string | null): ParsedCargo {
  return { emailId: id, laycan, cargoType: 'BULK' } as unknown as ParsedCargo;
}
function vessel(id: string, openDate: unknown): ParsedVessel {
  return { emailId: id, openDate } as unknown as ParsedVessel;
}

describe('rebaseParsedCargoes — laycan', () => {
  const now = new Date(Date.UTC(2026, 7, 1)); // 2026-08-01

  it('preserves laycan window width and re-emits an ISO range near now', () => {
    // median start = c1 start (11 May) → maps to now
    const out = rebaseParsedCargoes([cargo('c1', '11-16 May'), cargo('c2', '20-30 May')], now);

    const r1 = parseLaycan(out[0].laycan, 2026)!;
    expect((r1.end.getTime() - r1.start.getTime()) / DAY).toBe(5); // width preserved
    expect(iso(r1.start)).toBe(iso(now)); // median start → now

    const r2 = parseLaycan(out[1].laycan, 2026)!;
    expect((r2.end.getTime() - r2.start.getTime()) / DAY).toBe(10); // width preserved
    expect((r2.start.getTime() - r1.start.getTime()) / DAY).toBe(9); // spread preserved (20-11)
  });

  it('converts spot/ready cargoes to a fresh ISO window at now', () => {
    const out = rebaseParsedCargoes([cargo('c1', '11-16 May'), cargo('s1', 'Spot'), cargo('s2', 'Cargo ready')], now);
    for (const id of ['s1', 's2']) {
      const r = parseLaycan(out.find((c) => c.emailId === id)!.laycan, 2026)!;
      expect(iso(r.start)).toBe(iso(now));
      expect((r.end.getTime() - r.start.getTime()) / DAY).toBe(10); // default window
    }
  });

  it('leaves the input array unmutated', () => {
    const input = [cargo('c1', '11-16 May')];
    const before = input[0].laycan;
    rebaseParsedCargoes(input, now);
    expect(input[0].laycan).toBe(before);
  });

  it('drops preferredDates.sourceText when the laycan is shifted (no false [¹]) but keeps value', () => {
    const withSource = {
      emailId: 'p1',
      laycan: '11-16 May',
      cargoType: 'BULK',
      preferredDates: { value: '11-16 May 2026', confidence: 'confirmed', sourceText: '11 - 16 May' },
    } as unknown as ParsedCargo;

    const out = rebaseParsedCargoes([withSource], now);

    expect(out[0].laycan).not.toBe('11-16 May');          // laycan was shifted
    expect(out[0].preferredDates?.sourceText).toBeUndefined(); // citation dropped
    expect(out[0].preferredDates?.value).toBe('11-16 May 2026'); // display value kept
  });

  it('drops preferredDates.sourceText for spot cargoes synthesized to a fresh window', () => {
    // A spot cargo is only synthesized to a fresh window when the set has at least one
    // parseable laycan (production always passes the full corpus). Pair it with one so
    // the synthesis path — and the citation drop — actually fires.
    const anchor = {
      emailId: 'a1',
      laycan: '11-16 May',
      cargoType: 'BULK',
      preferredDates: { value: '11-16 May 2026', confidence: 'confirmed', sourceText: '11 - 16 May' },
    } as unknown as ParsedCargo;
    const spotWithSource = {
      emailId: 's1',
      laycan: 'Spot',
      cargoType: 'BULK',
      preferredDates: { value: 'prompt', confidence: 'uncertain', sourceText: 'Spot' },
    } as unknown as ParsedCargo;

    const out = rebaseParsedCargoes([anchor, spotWithSource], now);
    const spot = out.find((c) => c.emailId === 's1')!;

    expect(spot.laycan).not.toBe('Spot');                  // synthesized to a fresh window
    expect(spot.preferredDates?.sourceText).toBeUndefined(); // citation dropped
  });
});

describe('rebaseParsedVessels — openDate', () => {
  const now = new Date(Date.UTC(2026, 7, 1)); // 2026-08-01
  const isoNow = '2026-08-01';

  it('resolves display=TODAY with a stale 2025 open to now (artifact fix)', () => {
    const input = [vessel('v1', { value: { open: '2025-02-25', close: null, display: 'TODAY' }, confidence: 'interpreted', sourceText: 'OPEN TODAY' })];
    const out = rebaseParsedVessels(input, now);
    const parsed = parseVesselOpenDate(cfValue(out[0].openDate) as never, 2026, now);
    expect(iso(parsed!)).toBe(isoNow);
  });

  it('leaves plain spot vessels unchanged', () => {
    const input = [vessel('v2', { value: 'spot', confidence: 'interpreted', sourceText: 'spot marmara' })];
    const out = rebaseParsedVessels(input, now);
    expect(cfValue(out[0].openDate)).toBe('spot');
  });

  it('shifts a parseable open by the set median→now, preserving spread + wrapper', () => {
    const input = [
      vessel('a', { value: { open: '2026-06-01', close: null, display: '01 Jun 2026' }, confidence: 'confirmed', sourceText: 'x' }),
      vessel('b', { value: { open: '2026-06-11', close: null, display: '11 Jun 2026' }, confidence: 'confirmed', sourceText: 'y' }),
    ];
    const out = rebaseParsedVessels(input, now);
    const a = parseVesselOpenDate(cfValue(out[0].openDate) as never, 2026, now)!;
    const b = parseVesselOpenDate(cfValue(out[1].openDate) as never, 2026, now)!;
    expect(iso(a)).toBe(isoNow); // median (a) → now
    expect((b.getTime() - a.getTime()) / DAY).toBe(10); // spread preserved
    expect(typeof cfValue(out[0].openDate)).toBe('string'); // emitted as ISO string
    expect((out[0].openDate as { confidence: string }).confidence).toBe('confirmed'); // wrapper kept
  });

  it('does not let spot/today entries skew the open epoch', () => {
    // one real open (2026-06-01) + many spot → epoch must be the real open, not "now"
    const input = [
      vessel('real', { value: { open: '2026-06-01', close: null, display: '01 Jun 2026' }, confidence: 'confirmed' }),
      vessel('s1', { value: 'spot', confidence: 'interpreted' }),
      vessel('s2', { value: 'spot', confidence: 'interpreted' }),
    ];
    const out = rebaseParsedVessels(input, now);
    const real = parseVesselOpenDate(cfValue(out[0].openDate) as never, 2026, now)!;
    expect(iso(real)).toBe(isoNow); // single real open is the median → maps to now
  });
});

describe('rebase stability — emittedDate - now is invariant across run dates', () => {
  it('keeps laycan_end - now invariant ⇒ stable match count', () => {
    const input = [cargo('c1', '11-16 May'), cargo('c2', '01-10 Jun')];
    const nowA = new Date(Date.UTC(2026, 4, 1));
    const nowB = new Date(Date.UTC(2026, 6, 15));
    const a = rebaseParsedCargoes(input, nowA);
    const b = rebaseParsedCargoes(input, nowB);
    for (let i = 0; i < input.length; i++) {
      const ra = parseLaycan(a[i].laycan, 2026)!;
      const rb = parseLaycan(b[i].laycan, 2026)!;
      const gapA = Math.round((ra.end.getTime() - nowA.getTime()) / DAY);
      const gapB = Math.round((rb.end.getTime() - nowB.getTime()) / DAY);
      expect(gapB).toBe(gapA);
    }
  });

  it('keeps open vs laycan gap invariant across run dates', () => {
    const cargos = [cargo('c1', '11-16 May')];
    const vessels = [vessel('v1', { value: { open: '2026-05-05', close: null, display: '05 May 2026' }, confidence: 'confirmed' })];
    const nowA = new Date(Date.UTC(2026, 4, 1));
    const nowB = new Date(Date.UTC(2026, 8, 20));
    const gap = (now: Date) => {
      const lc = parseLaycan(rebaseParsedCargoes(cargos, now)[0].laycan, 2026)!;
      const op = parseVesselOpenDate(cfValue(rebaseParsedVessels(vessels, now)[0].openDate) as never, 2026, now)!;
      return Math.round((lc.start.getTime() - op.getTime()) / DAY);
    };
    expect(gap(nowB)).toBe(gap(nowA));
  });
});
