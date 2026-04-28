import { Email, Classification, Counterparty, EmailCategory } from './types';
import { isIacs } from './sanctions/iacs-members';
import { isIgClub } from './sanctions/pi-ig-clubs';
import { getParisMouClassification } from './sanctions/paris-mou';
import { assessShadowFleetRisk } from './sanctions/shadow-fleet';
import { checkVesselSanctions } from './sanctions/opensanctions';

export interface VesselPassport {
  imo: string;
  flag: { country: string; parisMou?: 'white' | 'grey' | 'black' };
  class: { society: string; isIacs: boolean };
  pi: { club: string | null; isIg: boolean };
  sanctions: { sanctioned: boolean; sources: string[] };
  shadowFleet: { riskLevel: 'none' | 'low' | 'medium' | 'high'; flags: string[] };
  cii?: 'A' | 'B' | 'C' | 'D' | 'E';
  psc?: { detentions3y: number };
  age?: number;
}

// In-process cache for idempotent calls within the same process
const passportCache = new Map<string, VesselPassport>();

export async function getVesselPassport(imo: string): Promise<VesselPassport> {
  const cached = passportCache.get(imo);
  if (cached) return cached;

  // Placeholder vessel data — in production this would be fetched from Equasis or similar
  const vesselData = {
    flag: 'Bahamas',
    classSociety: 'DNV',
    piClub: 'Gard',
    vesselAge: 10,
    flagChanges12m: 0,
    classSocietyChanges24m: 0,
    ownerJurisdiction: 'Norway',
    aisBlackoutDays: 0,
    namesLast24m: 1,
  };

  const iacsResult = isIacs(vesselData.classSociety);
  const igResult = isIgClub(vesselData.piClub);
  const mouCategory = getParisMouClassification(vesselData.flag);
  const sanctions = await checkVesselSanctions(imo);
  const shadowFleet = assessShadowFleetRisk({
    flagChanges12m: vesselData.flagChanges12m,
    classSocietyChanges24m: vesselData.classSocietyChanges24m,
    ownerJurisdiction: vesselData.ownerJurisdiction,
    flag: vesselData.flag,
    piClub: vesselData.piClub,
    isPiIgClub: igResult,
    aisBlackoutDays: vesselData.aisBlackoutDays,
    vesselAge: vesselData.vesselAge,
    classSociety: vesselData.classSociety,
    isIacsClass: iacsResult,
    namesLast24m: vesselData.namesLast24m,
  });

  const passport: VesselPassport = {
    imo,
    flag: {
      country: vesselData.flag,
      ...(mouCategory !== 'unknown' ? { parisMou: mouCategory } : {}),
    },
    class: { society: vesselData.classSociety, isIacs: iacsResult },
    pi: { club: vesselData.piClub, isIg: igResult },
    sanctions: { sanctioned: sanctions.sanctioned, sources: sanctions.sources },
    shadowFleet,
    age: vesselData.vesselAge,
  };

  passportCache.set(imo, passport);
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
