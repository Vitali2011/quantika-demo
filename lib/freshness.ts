import { EmailCategory, ParsedCargo, ParsedVessel } from './types';
import {
  FRESHNESS_VESSEL_DEFAULT_DAYS,
  FRESHNESS_CARGO_DEFAULT_DAYS,
  FRESHNESS_DOCUMENT_DAYS,
  FRESHNESS_CLIENT_REPLY_DAYS,
} from './constants';

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

  switch (category) {
    case 'VESSEL_POSITION': {
      const openDateStr = parsedVessel?.openDate?.value;
      if (openDateStr) {
        const od = parseDate(openDateStr);
        if (od) return { expiryDate: od.toISOString(), expirySource: 'openDate' };
      }
      return {
        expiryDate: addDays(emailD, FRESHNESS_VESSEL_DEFAULT_DAYS).toISOString(),
        expirySource: 'default',
      };
    }
    case 'CARGO_INQUIRY': {
      const laycanStr = parsedCargo?.laycan;
      if (laycanStr) {
        const ld = parseDate(laycanStr);
        if (ld) return { expiryDate: ld.toISOString(), expirySource: 'laycan' };
      }
      return {
        expiryDate: addDays(emailD, FRESHNESS_CARGO_DEFAULT_DAYS).toISOString(),
        expirySource: 'default',
      };
    }
    case 'FIXTURE_RECAP':
      return { expiryDate: null, expirySource: 'permanent' };
    case 'DOCUMENT':
      return {
        expiryDate: addDays(emailD, FRESHNESS_DOCUMENT_DAYS).toISOString(),
        expirySource: 'fixed',
      };
    case 'CLIENT_REPLY':
      return {
        expiryDate: addDays(emailD, FRESHNESS_CLIENT_REPLY_DAYS).toISOString(),
        expirySource: 'fixed',
      };
    default:
      return { expiryDate: null, expirySource: null };
  }
}

export function isStale(expiryDate: string | null): boolean {
  if (!expiryDate) return false;
  const expiry = parseDate(expiryDate);
  if (!expiry) return false;
  return new Date() > expiry;
}
