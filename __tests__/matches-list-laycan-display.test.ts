/**
 * /matches list must render the readiness-rebased laycan window when worksheet_json
 * is present on the row — same as /match/[id] detail (#665).
 */
import { resolveLaycanDisplay } from '@/lib/utils/laycan-display';

describe('matches list — laycan_display server-side resolution', () => {
  it('row with worksheet.readiness → resolved string overrides stored ms', () => {
    const worksheet_json = JSON.stringify({
      readiness: { laycanStart: '2026-06-03', laycanEnd: '2026-06-13' },
    });
    const worksheet = JSON.parse(worksheet_json);
    expect(
      resolveLaycanDisplay({
        worksheet,
        storedStart: new Date('2026-05-29T00:00:00Z').getTime(), // stale stored
        storedEnd: new Date('2026-05-29T00:00:00Z').getTime(),
        cargoRaw: null,
        refYear: 2026,
      }),
    ).toBe('Jun 3–Jun 13');
  });

  it('row without worksheet_json → stored ms fallback (matches current behavior)', () => {
    expect(
      resolveLaycanDisplay({
        worksheet: null,
        storedStart: new Date('2026-06-02T00:00:00Z').getTime(),
        storedEnd: new Date('2026-06-09T00:00:00Z').getTime(),
        cargoRaw: null,
        refYear: 2026,
      }),
    ).toBe('Jun 2–Jun 9');
  });

  it('malformed worksheet_json → row falls through to stored ms (no throw)', () => {
    // The server-side pre-resolver wraps JSON.parse in try/catch (mirrors detail page).
    let parsed: unknown = null;
    try { parsed = JSON.parse('{ broken'); } catch { parsed = null; }
    expect(
      resolveLaycanDisplay({
        worksheet: parsed as null,
        storedStart: new Date('2026-06-02T00:00:00Z').getTime(),
        storedEnd: new Date('2026-06-09T00:00:00Z').getTime(),
        cargoRaw: null,
        refYear: 2026,
      }),
    ).toBe('Jun 2–Jun 9');
  });
});
