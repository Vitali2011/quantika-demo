/**
 * Rebase demo corpus dates onto `now`, preserving within-set spread.
 *
 * Why: the ETMS-migrated fixtures (2026-05-14) hold ABSOLUTE laycan/openDate
 * values. As real time passes laycans expire and the demo match-count drifts
 * (measured 1418 → 662 → 67 across three run dates). We rebase each set
 * (laycans, opens) by a single linear shift that maps the set's MEDIAN date
 * onto `now`, so the same fraction stays in the future regardless of when the
 * demo runs — while the relative spacing inside each set (the idle/tight/ideal
 * mix) is preserved exactly.
 *
 * Stability: medians come from the (fixed) corpus, so the only varying input is
 * `now`; every emitted date = origDate + (now - epoch), hence `emittedDate - now`
 * is invariant ⇒ identical readiness verdicts ⇒ stable match counts.
 *
 * Artifact handling: vessel opens whose `display` is "TODAY"/spot but whose
 * `open` is a stale absolute date (e.g. 2025) are a known ETMS parsing artifact
 * (see lib/sample-data/demo-parsed-cargoes.ts header) — they resolve to `now`.
 * Laycan/open epochs are computed SEPARATELY so the spurious ~1-year gap between
 * 2025-pinned opens and 2026 laycans collapses (both clusters centre on now)
 * without flattening either set's internal spread.
 *
 * Pure + deterministic; never mutates its inputs.
 */
import type { ParsedCargo, ParsedVessel, ConfidenceField } from '@/lib/types';
import { parseLaycan, parseVesselOpenDate } from '@/lib/sailing/date-parsing';

const DAY = 86_400_000;

/** Year the corpus phrase-dates were authored against (post-ETMS migration). */
export const CORPUS_REF_YEAR = 2026;

export interface RebaseOptions {
  /** Shift the laycan cluster's median to `now + this` (days). Default 0. */
  laycanAnchorOffsetDays?: number;
  /** Shift the open cluster's median to `now + this` (days). Default 0. */
  openAnchorOffsetDays?: number;
  /** Laycan window width (days) for spot/ready cargoes with no parseable dates. */
  spotLaycanWindowDays?: number;
}

/** Inner shape of a vessel openDate value at runtime (string OR object). */
type OpenInner =
  | string
  | { open?: string | null; close?: string | null; display?: string | null };

const TODAYISH = /\b(today|spot|prompt|promt)\b/i;
const SPOT_LAYCAN = /\b(spot|prompt|promt|cargo ready|ready)\b/i;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (ms: number, days: number) => ms + days * DAY;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

function dayFloor(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function isWrapped<T>(od: unknown): od is ConfidenceField<T> {
  return !!od && typeof od === 'object' && 'value' in (od as object);
}

/** Read the inner open value, unwrapping a ConfidenceField envelope if present. */
function openInner(od: ParsedVessel['openDate']): OpenInner | null {
  const v = isWrapped<OpenInner>(od) ? od.value : (od as unknown as OpenInner | null);
  return (v ?? null) as OpenInner | null;
}

/** Re-emit openDate with a new ISO-string value, preserving the envelope. */
function setOpenValue(od: ParsedVessel['openDate'], isoStr: string): ParsedVessel['openDate'] {
  if (isWrapped<unknown>(od)) {
    return { ...(od as ConfidenceField<unknown>), value: isoStr } as ParsedVessel['openDate'];
  }
  return isoStr as unknown as ParsedVessel['openDate'];
}

// ── Cargoes ──────────────────────────────────────────────────────────────────

export function rebaseParsedCargoes(
  cargoes: ParsedCargo[],
  now: Date,
  opts: RebaseOptions = {},
): ParsedCargo[] {
  const nowMs = dayFloor(now);
  const window = opts.spotLaycanWindowDays ?? 10;

  const starts: number[] = [];
  for (const c of cargoes) {
    const r = parseLaycan(c.laycan, CORPUS_REF_YEAR);
    if (r) starts.push(r.start.getTime());
  }
  if (starts.length === 0) return cargoes.map((c) => ({ ...c }));

  const epoch = median(starts);
  const target = addDays(nowMs, opts.laycanAnchorOffsetDays ?? 0);
  const shift = Math.round((target - epoch) / DAY);

  return cargoes.map((c) => {
    const r = parseLaycan(c.laycan, CORPUS_REF_YEAR);
    if (r) {
      const start = addDays(r.start.getTime(), shift);
      const end = addDays(r.end.getTime(), shift);
      return { ...c, laycan: `${isoDay(start)} to ${isoDay(end)}` };
    }
    if (typeof c.laycan === 'string' && SPOT_LAYCAN.test(c.laycan)) {
      return { ...c, laycan: `${isoDay(nowMs)} to ${isoDay(addDays(nowMs, window))}` };
    }
    return { ...c };
  });
}

// ── Vessels ──────────────────────────────────────────────────────────────────

export function rebaseParsedVessels(
  vessels: ParsedVessel[],
  now: Date,
  opts: RebaseOptions = {},
): ParsedVessel[] {
  const nowMs = dayFloor(now);

  // Median over parseable opens, EXCLUDING spot/today (they would skew the epoch
  // and are handled separately by resolving to `now`).
  const opens: number[] = [];
  for (const v of vessels) {
    const inner = openInner(v.openDate);
    if (inner == null) continue;
    if (TODAYISH.test(JSON.stringify(inner))) continue;
    const d = parseVesselOpenDate(inner as never, CORPUS_REF_YEAR, now);
    if (d) opens.push(d.getTime());
  }
  const epoch = opens.length ? median(opens) : nowMs;
  const target = addDays(nowMs, opts.openAnchorOffsetDays ?? 0);
  const shift = Math.round((target - epoch) / DAY);

  return vessels.map((v) => {
    const inner = openInner(v.openDate);
    if (inner == null) return { ...v };

    // Plain spot/prompt string → leave (parseVesselOpenDate resolves it to `now`).
    if (typeof inner === 'string') {
      if (TODAYISH.test(inner)) return { ...v };
      const d = parseVesselOpenDate(inner, CORPUS_REF_YEAR, now);
      if (!d) return { ...v };
      return { ...v, openDate: setOpenValue(v.openDate, isoDay(addDays(d.getTime(), shift))) };
    }

    // Object form: "display=TODAY" with a stale absolute `open` is an artifact → pin to now.
    if (typeof inner.display === 'string' && TODAYISH.test(inner.display)) {
      return { ...v, openDate: setOpenValue(v.openDate, isoDay(nowMs)) };
    }
    const d = parseVesselOpenDate(inner as never, CORPUS_REF_YEAR, now);
    if (!d) return { ...v };
    return { ...v, openDate: setOpenValue(v.openDate, isoDay(addDays(d.getTime(), shift))) };
  });
}
