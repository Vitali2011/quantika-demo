import type { Email, ProcessedEmail, EmailCategory, EmailStatus } from './types';

export type StatusGroup = EmailStatus | 'STALE';

export interface EmailRow {
  email: Email;
  processed: ProcessedEmail;
  statusGroup: StatusGroup;
}

export const STATUS_GROUPS_ORDER: StatusGroup[] = [
  'NEEDS_ACTION',
  'PENDING',
  'RESPONDED',
  'INFO_ONLY',
  'STALE',
];

export function filterByCategory(
  emails: Email[],
  processedEmails: ProcessedEmail[],
  category: EmailCategory,
): EmailRow[] {
  const emailMap = new Map<string, Email>();
  for (const e of emails) emailMap.set(e.id, e);

  const rows: EmailRow[] = [];
  for (const pe of processedEmails) {
    if (pe.type !== category) continue;
    const email = emailMap.get(pe.emailId);
    if (!email) continue;
    const statusGroup: StatusGroup = pe.freshness === 'stale' ? 'STALE' : pe.status;
    rows.push({ email, processed: pe, statusGroup });
  }

  rows.sort((a, b) => {
    const orderA = STATUS_GROUPS_ORDER.indexOf(a.statusGroup);
    const orderB = STATUS_GROUPS_ORDER.indexOf(b.statusGroup);
    if (orderA !== orderB) return orderA - orderB;
    if (a.statusGroup === 'NEEDS_ACTION') {
      return (b.processed.daysWithoutReply || 0) - (a.processed.daysWithoutReply || 0);
    }
    return 0;
  });

  return rows;
}

export function groupEmailsByStatus(rows: EmailRow[]): Record<StatusGroup, EmailRow[]> {
  const groups: Partial<Record<StatusGroup, EmailRow[]>> = {};
  for (const row of rows) {
    const key = row.statusGroup;
    if (!groups[key]) groups[key] = [];
    groups[key]!.push(row);
  }
  return groups as Record<StatusGroup, EmailRow[]>;
}

export function getEmailCounts(grouped: Partial<Record<string, EmailRow[]>>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key, rows] of Object.entries(grouped)) {
    counts[key] = rows?.length ?? 0;
  }
  return counts;
}
