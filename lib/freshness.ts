import { EmailCategory, ParsedCargo, ParsedVessel } from './types';
import { FRESHNESS_CONFIG } from './freshness-config';
import { parseLaycan, parseVesselOpenDate } from './sailing/date-parsing';

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function parseIso(dateStr: string): Date | null {
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function calculateExpiry(
  emailDate: string,
  category: EmailCategory,
  parsedCargo?: ParsedCargo | null,
  parsedVessel?: ParsedVessel | null,
): { expiryDate: string | null; expirySource: string | null } {
  const emailD = parseIso(emailDate);
  if (!emailD) return { expiryDate: null, expirySource: null };

  const rule = FRESHNESS_CONFIG[category];
  if (!rule) return { expiryDate: null, expirySource: null };

  if (rule.permanent) {
    return { expiryDate: null, expirySource: 'permanent' };
  }

  if (rule.useParsedField === 'openDate') {
    const openDateStr = parsedVessel?.openDate?.value;
    if (openDateStr) {
      const od = parseVesselOpenDate(openDateStr, emailD.getUTCFullYear(), emailD) ?? parseIso(openDateStr);
      if (od) return { expiryDate: od.toISOString(), expirySource: 'openDate' };
    }
  }

  if (rule.useParsedField === 'laycan') {
    const laycanStr = parsedCargo?.laycan;
    if (laycanStr) {
      const range = parseLaycan(laycanStr, emailD.getUTCFullYear());
      if (range) return { expiryDate: range.end.toISOString(), expirySource: 'laycan' };
      const iso = parseIso(laycanStr);
      if (iso) return { expiryDate: iso.toISOString(), expirySource: 'laycan' };
    }
  }

  if (rule.defaultDays !== undefined) {
    return {
      expiryDate: addDays(emailD, rule.defaultDays).toISOString(),
      expirySource: rule.defaultSource ?? 'default',
    };
  }

  return { expiryDate: null, expirySource: null };
}

export function isStale(expiryDate: string | null): boolean {
  if (!expiryDate) return false;
  const expiry = parseIso(expiryDate);
  if (!expiry) return false;
  return new Date() > expiry;
}
