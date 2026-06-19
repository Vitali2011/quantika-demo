/**
 * Lightweight date-parsing helpers for freight shipping inputs.
 *
 * Supports the messy, free-form date formats brokers use in emails:
 *   vessel open date: "5 Sep", "Sep 6-8", "TODAY", "beg October", "18.08.25", ISO
 *   cargo laycan:     "15-25 Sep", "Sep 15-25", "15/09 - 25/09", "end Sep - beg Oct", single day
 *
 * Goal: return structured Date / range so downstream matcher can compute
 * readiness gap numerically instead of asking the LLM to eyeball strings.
 */

import { now } from '../clock';

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const MONTH_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;

function mkUtc(year: number, monthIdx: number, day: number): Date {
  // Clamp day to valid range for month (e.g. Aug 31 → 31, Feb 30 → 28/29)
  const last = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  const d = Math.max(1, Math.min(day, last));
  return new Date(Date.UTC(year, monthIdx, d));
}

function monthIdx(raw: string): number | null {
  const key = raw.trim().toLowerCase();
  return key in MONTH_MAP ? MONTH_MAP[key] : null;
}

/**
 * Expand "beg/mid/end <Month>" phrase into a representative day of month.
 * beg → day 3, mid → day 15, end → day 27. For laycan ranges we use different
 * boundaries (see `phraseToRange`).
 */
function phraseDay(phrase: string): number {
  const p = phrase.toLowerCase();
  if (/beg(inning)?|early|start/.test(p)) return 3;
  if (/mid/.test(p)) return 15;
  if (/end|late/.test(p)) return 27;
  return 15; // fallback
}

/**
 * For laycan range phrases — "beg X" means day 1-5, "end X" means day 25-last.
 * Returns [startDay, endDay] within month.
 */
function phraseToRange(phrase: string, year: number, monthIdx0: number): [number, number] {
  const p = phrase.toLowerCase();
  const last = new Date(Date.UTC(year, monthIdx0 + 1, 0)).getUTCDate();
  if (/beg(inning)?|early|start/.test(p)) return [1, 5];
  if (/mid/.test(p)) return [10, 20];
  if (/end|late/.test(p)) return [25, last];
  return [1, last];
}

/**
 * Parse a single vessel open-date string into a Date.
 *
 * @param raw       the free-form string ("5 Sep", "TODAY", "18.08.25", etc.)
 * @param refYear   year to use when only month/day are given
 * @param today     reference "now" for TODAY/spot (defaults to `new Date()`)
 */
/**
 * Extract a usable date string from a structured vessel-open-date value.
 *
 * The fixture-recap parser may emit `open_date.value` as either:
 *   - a plain string (legacy / simple format), or
 *   - an object {open: ISO|null, close: ISO|null, display: string|null}
 *     where `open` is the parsed ISO date for range-start, and `display`
 *     is the original human-readable text ("spot", "01-05 March", etc.).
 *
 * Prefers `open` (ISO-formatted, easier to parse) then `display` (fallback
 * for phrase-style values like "spot"/"prompt"/"end March").
 */
function normalizeOpenDateInput(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') {
    const obj = raw as { open?: unknown; display?: unknown };
    if (typeof obj.open === 'string' && obj.open.trim()) return obj.open;
    if (typeof obj.display === 'string' && obj.display.trim()) return obj.display;
  }
  return null;
}

export function parseVesselOpenDate(
  raw: string | { open?: string | null; close?: string | null; display?: string | null } | null | undefined,
  refYear: number = now().getUTCFullYear(),
  today: Date = now(),
): Date | null {
  const normalized = normalizeOpenDateInput(raw);
  if (!normalized) return null;
  const s = normalized.trim();
  if (!s) return null;

  // TODAY / spot / prompt → reference "now"
  if (/\b(today|spot|prompt|promt)\b/i.test(s)) {
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  }

  // ISO YYYY-MM-DD
  const iso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return mkUtc(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  // DD.MM.YY or DD.MM.YYYY (also supports / and -)
  const dmy = s.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
  if (dmy) {
    let yr = Number(dmy[3]);
    if (yr < 100) yr += 2000;
    return mkUtc(yr, Number(dmy[2]) - 1, Number(dmy[1]));
  }

  // "beg/mid/end <Month>" phrase (no day number)
  const phraseMonth = s.match(new RegExp(`\\b(beg(?:inning)?|early|start|mid|end|late)\\s+${MONTH_RE.source}`, 'i'));
  if (phraseMonth) {
    const mi = monthIdx(phraseMonth[2]);
    if (mi != null) return mkUtc(refYear, mi, phraseDay(phraseMonth[1]));
  }

  // "<day>-<day> <Month>"  →  start of window
  const rangeDayMonth = s.match(new RegExp(`\\b(\\d{1,2})\\s*[-–]\\s*\\d{1,2}\\s+${MONTH_RE.source}`, 'i'));
  if (rangeDayMonth) {
    const mi = monthIdx(rangeDayMonth[2]);
    if (mi != null) return mkUtc(refYear, mi, Number(rangeDayMonth[1]));
  }

  // "<Month> <day>-<day>"
  const rangeMonthDay = s.match(new RegExp(`${MONTH_RE.source}\\s+(\\d{1,2})\\s*[-–]\\s*\\d{1,2}`, 'i'));
  if (rangeMonthDay) {
    const mi = monthIdx(rangeMonthDay[1]);
    if (mi != null) return mkUtc(refYear, mi, Number(rangeMonthDay[2]));
  }

  // "<day> <Month>"  or  "<Month> <day>"  (single day)
  const dayMonth = s.match(new RegExp(`\\b(\\d{1,2})\\s+${MONTH_RE.source}\\b`, 'i'));
  if (dayMonth) {
    const mi = monthIdx(dayMonth[2]);
    if (mi != null) return mkUtc(refYear, mi, Number(dayMonth[1]));
  }
  const monthDay = s.match(new RegExp(`${MONTH_RE.source}\\s+(\\d{1,2})\\b`, 'i'));
  if (monthDay) {
    const mi = monthIdx(monthDay[1]);
    if (mi != null) return mkUtc(refYear, mi, Number(monthDay[2]));
  }

  return null;
}

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Parse a laycan window into {start, end} dates.
 * Falls back to a single-day range when only one date is given.
 */
export function parseLaycan(
  raw: string | null | undefined,
  refYear: number = now().getUTCFullYear(),
): DateRange | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;

  // ISO range "2025-09-15 to 2025-09-25" / "2025-09-15 - 2025-09-25" / "2025-09-15 .. 2025-09-25"
  const isoRange = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s*(?:to|[-–]|\.\.)\s*(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoRange) {
    return {
      start: mkUtc(Number(isoRange[1]), Number(isoRange[2]) - 1, Number(isoRange[3])),
      end: mkUtc(Number(isoRange[4]), Number(isoRange[5]) - 1, Number(isoRange[6])),
    };
  }

  // "15/09 - 25/09" or "15.09 - 25.09"  (day/month, same year = refYear unless given)
  const slashRange = s.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s*[-–]\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
  if (slashRange) {
    const yr1 = slashRange[3] ? (Number(slashRange[3]) < 100 ? 2000 + Number(slashRange[3]) : Number(slashRange[3])) : refYear;
    const yr2 = slashRange[6] ? (Number(slashRange[6]) < 100 ? 2000 + Number(slashRange[6]) : Number(slashRange[6])) : yr1;
    return {
      start: mkUtc(yr1, Number(slashRange[2]) - 1, Number(slashRange[1])),
      end: mkUtc(yr2, Number(slashRange[5]) - 1, Number(slashRange[4])),
    };
  }

  // "15-25/09/2025"  → day-day / month / year
  const dashSlash = s.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s*[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
  if (dashSlash) {
    const yr = dashSlash[4] ? (Number(dashSlash[4]) < 100 ? 2000 + Number(dashSlash[4]) : Number(dashSlash[4])) : refYear;
    const mi = Number(dashSlash[3]) - 1;
    return {
      start: mkUtc(yr, mi, Number(dashSlash[1])),
      end: mkUtc(yr, mi, Number(dashSlash[2])),
    };
  }

  // "<day>-<day> <Month>" → "15-25 Sep"
  const dayRangeMonth = s.match(new RegExp(`\\b(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\s+${MONTH_RE.source}\\b`, 'i'));
  if (dayRangeMonth) {
    const mi = monthIdx(dayRangeMonth[3]);
    if (mi != null) {
      return {
        start: mkUtc(refYear, mi, Number(dayRangeMonth[1])),
        end: mkUtc(refYear, mi, Number(dayRangeMonth[2])),
      };
    }
  }

  // "<Month> <day>-<day>" → "Sep 15-25"
  const monthDayRange = s.match(new RegExp(`${MONTH_RE.source}\\s+(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\b`, 'i'));
  if (monthDayRange) {
    const mi = monthIdx(monthDayRange[1]);
    if (mi != null) {
      return {
        start: mkUtc(refYear, mi, Number(monthDayRange[2])),
        end: mkUtc(refYear, mi, Number(monthDayRange[3])),
      };
    }
  }

  // "beg/mid/end <Month> - beg/mid/end <Month>"  (e.g. "end Sep - beg Oct")
  const phraseRange = s.match(new RegExp(
    `\\b(beg(?:inning)?|early|start|mid|end|late)\\s+${MONTH_RE.source}\\s*[-–]\\s*(beg(?:inning)?|early|start|mid|end|late)\\s+${MONTH_RE.source}`,
    'i',
  ));
  if (phraseRange) {
    const mi1 = monthIdx(phraseRange[2]);
    const mi2 = monthIdx(phraseRange[4]);
    if (mi1 != null && mi2 != null) {
      const [s1] = phraseToRange(phraseRange[1], refYear, mi1);
      const [, e2] = phraseToRange(phraseRange[3], refYear, mi2);
      // Use representative days: start of start-phrase, end of end-phrase
      const startDay = /beg|early|start/i.test(phraseRange[1]) ? 1
        : /mid/i.test(phraseRange[1]) ? 10
        : 25;
      const endDay = /beg|early|start/i.test(phraseRange[3]) ? 5
        : /mid/i.test(phraseRange[3]) ? 20
        : new Date(Date.UTC(refYear, mi2 + 1, 0)).getUTCDate();
      // Use centre-of-phrase days (beg=3, mid=15, end=27) so single-phrase and
      // range-phrase stay consistent
      const startCentre = phraseDay(phraseRange[1]);
      const endCentre = phraseDay(phraseRange[3]);
      void s1; void e2; void startDay; void endDay; // keep linter happy for unused bounds vars
      return {
        start: mkUtc(refYear, mi1, startCentre),
        end: mkUtc(refYear, mi2, endCentre),
      };
    }
  }

  // "beg/mid/end <Month>"  (single phrase)
  const phraseSingle = s.match(new RegExp(`\\b(beg(?:inning)?|early|start|mid|end|late)\\s+${MONTH_RE.source}\\b`, 'i'));
  if (phraseSingle) {
    const mi = monthIdx(phraseSingle[2]);
    if (mi != null) {
      const [a, b] = phraseToRange(phraseSingle[1], refYear, mi);
      return { start: mkUtc(refYear, mi, a), end: mkUtc(refYear, mi, b) };
    }
  }

  // "first/second half of <Month>" → half-month window (NOT a single day).
  // Must precede the single-day fallback: otherwise "First half of May 2026"
  // mis-parses the "20" of "2026" as a day → collapsed single-day laycan.
  const halfMonth = s.match(new RegExp(`\\b(first|1st|second|2nd)\\s+half\\s+(?:of\\s+)?${MONTH_RE.source}`, 'i'));
  if (halfMonth) {
    const mi = monthIdx(halfMonth[2]);
    if (mi != null) {
      const isFirst = /first|1st/i.test(halfMonth[1]);
      const lastDay = new Date(Date.UTC(refYear, mi + 1, 0)).getUTCDate();
      return {
        start: mkUtc(refYear, mi, isFirst ? 1 : 16),
        end: mkUtc(refYear, mi, isFirst ? 15 : lastDay),
      };
    }
  }

  // Bare "<Month>" or "<Month> <year>" (no day) → whole-month window, not a
  // single day. Guards against month-only laycans ("June 2019") collapsing.
  // When the year is explicitly stated, honour it (mirrors the slash/dash range
  // branches above which respect a captured year); fall back to refYear only
  // when no year is present.
  const monthOnly = s.match(new RegExp(`^\\s*${MONTH_RE.source}(?:[\\s,]+(\\d{4}))?\\s*$`, 'i'));
  if (monthOnly) {
    const mi = monthIdx(monthOnly[1]);
    if (mi != null) {
      const yr = monthOnly[2] ? Number(monthOnly[2]) : refYear;
      const lastDay = new Date(Date.UTC(yr, mi + 1, 0)).getUTCDate();
      return { start: mkUtc(yr, mi, 1), end: mkUtc(yr, mi, lastDay) };
    }
  }

  // Open-ended forward laycan: "<date> onwards/onward", "from <date>", "<date> →".
  // Broker semantics: loading window OPENS from this date forward — a real window,
  // not a single day. Without this, "7 July 2026 onwards" / "From 15 May 2026"
  // drop the keyword and fall through to the single-day parser → collapsed laycan
  // (11 demo cargoes, founder Gate5 2026-06-02). Placed AFTER all range/phrase
  // parsers so an explicit range ("15-25 May onwards") still wins as a range.
  const FORWARD_WINDOW_DAYS = 14;
  const hasOnwards = /\bonwards?\b|→/i.test(s);
  const hasLeadingFrom = /^\s*from\b/i.test(s);
  if (hasOnwards || hasLeadingFrom) {
    const cleaned = s
      .replace(/\bonwards?\b/gi, '')
      .replace(/→/g, '')
      .replace(/^\s*from\b/i, '')
      .trim();
    const d = parseVesselOpenDate(cleaned, refYear);
    if (d) {
      return { start: d, end: new Date(d.getTime() + FORWARD_WINDOW_DAYS * 86_400_000) };
    }
  }

  // Single day fallback — reuse vessel-open parser
  const single = parseVesselOpenDate(s, refYear);
  if (single) return { start: single, end: single };

  return null;
}
