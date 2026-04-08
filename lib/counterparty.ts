import { Email, Classification, Counterparty, EmailCategory } from './types';

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
