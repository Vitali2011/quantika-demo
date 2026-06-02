import { resolveVaguePort } from '@/lib/ports/resolve-vague';

describe('resolveVaguePort — Variant A (Gate5 #4c: vague descriptor → representative + approximate)', () => {
  // Real failing descriptors from the demo corpus (probe 2026-06-02).
  it.each([
    ['East Coast Greece port (unspecified)', 'Thessaloniki'],
    ['Greece (1 port)', 'Thessaloniki'],
    ['Egypt Mediterranean port (unspecified)', 'Alexandria'],
    ['Cyprus (port unspecified)', 'Limassol'],
    ['Central Mediterranean port (unspecified)', 'Augusta'],
    ['Western Mediterranean (1 port)', 'Barcelona'],
    ['1 safe port Spanish Mediterranean', 'Barcelona'],
    ['Eastern Mediterranean (1 port)', 'Iskenderun'],
    ['Turkish Eastern Mediterranean or Syria or Lebanon or Libya', 'Iskenderun'],
    ['East Coast Italy port (unspecified)', 'Ravenna'],
    ['1 safe port Sweden', 'Gothenburg'],
    ['United Kingdom (port unspecified)', 'Liverpool'],
    ['Turkey (port unspecified)', 'Istanbul'],
    ['European Continent (ARA range)', 'Rotterdam'],
  ])('"%s" → %s (approximate)', (input, expectedName) => {
    const r = resolveVaguePort(input);
    expect(r).not.toBeNull();
    expect(r!.approximate).toBe(true);
    expect(r!.portName).toBe(expectedName);
  });

  it.each([
    ['TBS (to be specified)'],
    ['Port of Call (unspecified)'],
    ['Port of Call, Ukraine (unspecified)'],
    [''],
    [null],
  ])('genuinely-unknown "%s" → null (caller shows "TBC")', (input) => {
    expect(resolveVaguePort(input as string)).toBeNull();
  });

  it('"eastern mediterranean" matches before "turkey" (ordering)', () => {
    // "Turkish Eastern Mediterranean ..." must resolve via eastern-med → Iskenderun,
    // not via the turkey keyword → Istanbul.
    expect(resolveVaguePort('Turkish Eastern Mediterranean or Syria')!.portName).toBe('Iskenderun');
  });
});
