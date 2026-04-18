import { EmailCategory, ParsedCargo, ParsedVessel } from './types';
import { FRESHNESS_CONFIG } from './freshness-config';

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function parseDate(dateStr: string): Date | null {
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
  const emailD = parseDate(emailDate);
  if (!emailD) return { expiryDate: null, expirySource: null };

  const rule = FRESHNESS_CONFIG[category];
  if (!rule) return { expiryDate: null, expirySource: null };

  if (rule.permanent) {
    return { expiryDate: null, expirySource: 'permanent' };
  }

  if (rule.useParsedField === 'openDate') {
    const openDateStr = parsedVessel?.openDate?.value;
    if (openDateStr) {
      const od = parseDate(openDateStr);
      if (od) return { expiryDate: od.toISOString(), expirySource: 'openDate' };
    }
  }

  if (rule.useParsedField === 'laycan') {
    const laycanStr = parsedCargo?.laycan;
    if (laycanStr) {
      const ld = parseDate(laycanStr);
      if (ld) return { expiryDate: ld.toISOString(), expirySource: 'laycan' };
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
  const expiry = parseDate(expiryDate);
  if (!expiry) return false;
  return new Date() > expiry;
}
