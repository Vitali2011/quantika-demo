import type Database from 'better-sqlite3';
import { Email, Classification, Counterparty, EmailCategory, ParsedVessel } from './types';
import { isIacs } from './sanctions/iacs-members';
import { isIgClub } from './sanctions/pi-ig-clubs';
import { getParisMouClassification } from './sanctions/paris-mou';
import { hasInspectionData, getDetentionCount } from './market/psc-repository';

/**
 * Vessel passport — vetting summary built ONLY from real data:
 * parsed email fields + local registries (IACS, IG clubs, Paris MoU)
 * + the PSC detention table. Every field is optional: absent data is
 * omitted, never replaced with fake defaults (audit D).
 *
 * Intentionally NOT resolved here:
 * - cii: the vessel page already renders CiiRatingBadge via lookupCii
 *   (avoid a double lookup).
 * - sanctions: checkVesselSanctions is async + network (OpenSanctions API);
 *   the page already shows SanctionsBadge from session.blockedMatches.
 * - shadowFleet: assessShadowFleetRisk needs signals (flag changes, AIS
 *   blackouts, owner jurisdiction) that have no real data source yet.
 */
export interface VesselPassport {
  imo?: string;
  flag?: { country: string; parisMou?: 'white' | 'grey' | 'black' };
  class?: { society: string; isIacs: boolean };
  pi?: { club: string; isIg: boolean };
  sanctions?: { sanctioned: boolean; sources: string[] };
  shadowFleet?: { riskLevel: 'none' | 'low' | 'medium' | 'high'; flags: string[] };
  cii?: 'A' | 'B' | 'C' | 'D' | 'E';
  psc?: { detentions3y: number };
  age?: number;
}

/** PSC detention lookback window, in years (matches pair-analyzer vetting). */
const PSC_LOOKBACK_YEARS = 3;

/**
 * Build a vessel passport from parsed fields + local registries.
 * Sync, no network/LLM. PSC follows wave-A honest semantics:
 * no inspection rows → psc undefined (never a fake zero).
 */
export function buildVesselPassport(
  db: Database.Database,
  vessel: ParsedVessel,
  refYear: number,
): VesselPassport {
  const passport: VesselPassport = {};

  if (vessel.imo) passport.imo = vessel.imo;

  if (vessel.flag) {
    const mou = getParisMouClassification(vessel.flag);
    passport.flag = {
      country: vessel.flag,
      ...(mou !== 'unknown' ? { parisMou: mou } : {}),
    };
  }

  if (vessel.classSociety) {
    passport.class = { society: vessel.classSociety, isIacs: isIacs(vessel.classSociety) };
  }

  if (vessel.pandi) {
    passport.pi = { club: vessel.pandi, isIg: isIgClub(vessel.pandi) };
  }

  // built sanity floor: parser noise like 0 or 2-digit years must not yield age 2000+ (review followup)
  if (typeof vessel.built === 'number' && Number.isFinite(vessel.built) && vessel.built >= 1900) {
    const age = refYear - vessel.built;
    if (age >= 0) passport.age = age;
  }

  if (vessel.imo && hasInspectionData(db, vessel.imo)) {
    passport.psc = {
      detentions3y: getDetentionCount(db, vessel.imo, `${refYear - PSC_LOOKBACK_YEARS}-01-01`),
    };
  }

  return passport;
}

function extractDomain(email: string): string {
  const match = email.match(/@([^>]+)/);
  return match ? match[1].toLowerCase() : email.toLowerCase();
}

function extractCompanyName(email: string, domain: string): string {
  // Try to extract from "Name <email>" format
  const nameMatch = email.match(/^"?([^"<]+)"?\s*</);
  if (nameMatch) {
    const name = nameMatch[1].trim();
    if (name && name !== domain) return name;
  }
  // Fall back to domain without TLD
  const parts = domain.split('.');
  if (parts.length >= 2) {
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }
  return domain;
}

export function groupByCounterparty(
  emails: Email[],
  classifications: Classification[],
): Counterparty[] {
  const classMap = new Map(classifications.map(c => [c.emailId, c]));
  const domainGroups = new Map<string, { name: string; emails: Email[]; types: Map<EmailCategory, number> }>();

  for (const email of emails) {
    const domain = extractDomain(email.from);
    if (!domainGroups.has(domain)) {
      domainGroups.set(domain, {
        name: extractCompanyName(email.from, domain),
        emails: [],
        types: new Map(),
      });
    }
    const group = domainGroups.get(domain)!;
    group.emails.push(email);

    const cls = classMap.get(email.id);
    if (cls) {
      group.types.set(cls.category, (group.types.get(cls.category) || 0) + 1);
    }
  }

  const counterparties: Counterparty[] = [];
  for (const [domain, group] of Array.from(domainGroups)) {
    counterparties.push({
      name: group.name,
      emailDomain: domain,
      emailCount: group.emails.length,
      emailTypes: Array.from(group.types.entries()).map(([type, count]) => ({ type, count })),
      emails: group.emails.map(e => e.id),
    });
  }

  // Sort by email count descending
  counterparties.sort((a, b) => b.emailCount - a.emailCount);
  return counterparties;
}
