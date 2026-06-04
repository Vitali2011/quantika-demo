import { fmtLaycan } from '@/lib/utils/fmt-laycan';
import { parseLaycan } from '@/lib/sailing/date-parsing';
import { detectSpot } from '@/lib/sailing/readiness-gap';
import type { MatchWorksheet } from '@/lib/types';

export interface ResolveLaycanDisplayArgs {
  worksheet?: MatchWorksheet | null;
  storedStart?: number | null;
  storedEnd?: number | null;
  cargoRaw?: string | null;
  refYear?: number;
}

export function resolveLaycanDisplay(args: ResolveLaycanDisplayArgs): string | null {
  const { worksheet, storedStart, storedEnd, cargoRaw, refYear } = args;

  const rs = worksheet?.readiness?.laycanStart;
  const re = worksheet?.readiness?.laycanEnd;
  if (rs || re) {
    const toTs = (iso: string) => new Date(iso + 'T00:00:00Z').getTime();
    return fmtLaycan(rs ? toTs(rs) : null, re ? toTs(re) : null);
  }

  if (storedStart || storedEnd) {
    return fmtLaycan(storedStart ?? null, storedEnd ?? null);
  }

  if (cargoRaw) {
    if (detectSpot(cargoRaw)) return 'Spot';
    const year = refYear ?? new Date().getUTCFullYear();
    const parsed = parseLaycan(cargoRaw, year);
    if (!parsed) return cargoRaw;
    return fmtLaycan(parsed.start.getTime(), parsed.end.getTime());
  }

  return null;
}
