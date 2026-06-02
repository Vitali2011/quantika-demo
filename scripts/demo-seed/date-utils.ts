// scripts/demo-seed/date-utils.ts
// Shared date-shifting utilities for the demo-seed pipeline.

export function shiftIsoDate(iso: string, offsetDays: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString();
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/**
 * Shift dates in plain text body. Recognizes:
 *   - ISO "YYYY-MM-DD"
 *   - "DD-DD Month YYYY" / "DD/DD Month YYYY" ranges (e.g. "15-20 April 2026")
 */
export function shiftBodyDates(body: string, offsetDays: number): string {
  let out = body;

  // ISO YYYY-MM-DD
  out = out.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_m, y, mo, d) =>
    shiftIsoDate(`${y}-${mo}-${d}T00:00:00Z`, offsetDays).slice(0, 10),
  );

  // "DD-DD Month YYYY" or "DD/DD Month YYYY" range — preserves the span width
  out = out.replace(
    /\b(\d{1,2})\s*[-\/]\s*(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/gi,
    (_match, d1, d2, mon, y) => {
      const monthIdx = MONTH_NAMES.findIndex((m) =>
        m.toLowerCase().startsWith(mon.slice(0, 3).toLowerCase()),
      );
      const start = new Date(Date.UTC(+y, monthIdx, +d1));
      const end = new Date(Date.UTC(+y, monthIdx, +d2));
      start.setUTCDate(start.getUTCDate() + offsetDays);
      end.setUTCDate(end.getUTCDate() + offsetDays);
      const sameMonth =
        start.getUTCMonth() === end.getUTCMonth() &&
        start.getUTCFullYear() === end.getUTCFullYear();
      if (sameMonth) {
        return `${start.getUTCDate()}-${end.getUTCDate()} ${MONTH_NAMES[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
      }
      return `${start.getUTCDate()} ${MONTH_NAMES[start.getUTCMonth()]} - ${end.getUTCDate()} ${MONTH_NAMES[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
    },
  );

  return out;
}

/**
 * Shift "MM/YYYY" month-year patterns in a string by offsetDays.
 * Used for survey/drydock dates in vessel restrictions (e.g. "dd 06/2025").
 * Shifts by offsetDays converted to approximate months (day-precision within the month).
 */
export function shiftMonthYear(text: string, offsetDays: number): string {
  return text.replace(/\b(0?[1-9]|1[0-2])\/(\d{4})\b/g, (_m, mo, yr) => {
    const d = new Date(Date.UTC(+yr, +mo - 1, 1));
    d.setUTCDate(d.getUTCDate() + offsetDays);
    const newMo = d.getUTCMonth() + 1;
    const newYr = d.getUTCFullYear();
    return `${String(newMo).padStart(2, '0')}/${newYr}`;
  });
}
