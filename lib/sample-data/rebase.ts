// lib/sample-data/rebase.ts
// NO external dependencies — project uses native Date, not date-fns

import type { Email } from '@/lib/types';
import type { SampleEmailRaw, MarkerFormat } from './types';

// ── date helpers (no date-fns) ─────────────────────────────────────────────

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(d: Date, fmt: MarkerFormat = 'human-short'): string {
  const day  = d.getUTCDate();
  const mon  = SHORT_MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  switch (fmt) {
    case 'iso':          return d.toISOString();
    case 'human-long':   return `${day} ${mon} ${year}`;
    case 'broker-inner': {
      const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return `${DAYS[d.getUTCDay()]}, ${day} ${mon} ${year} 09:00:00 +0000`;
    }
    case 'human-short':
    default:             return `${day} ${mon}`;
  }
}

// ── core ───────────────────────────────────────────────────────────────────

export function rebaseDates(emails: SampleEmailRaw[], today: Date): Email[] {
  return emails.map((raw) => {
    const { _meta, ...rest } = raw;

    // Adversarial / permanently dated emails — pass through unchanged
    if (_meta.skipRebase) {
      return rest as Email;
    }

    // Rebase email.date
    const date = addDays(today, _meta.emailDateOffsetDays).toISOString();

    // Build body substitutions
    let body = rest.body;

    // Standard laycan markers
    if (_meta.laycanStartOffsetDays !== undefined) {
      const ls = addDays(today, _meta.laycanStartOffsetDays);
      const le = addDays(today, _meta.laycanEndOffsetDays ?? _meta.laycanStartOffsetDays + 10);
      body = body.replaceAll('{{LAYCAN_START}}', String(ls.getUTCDate()));
      body = body.replaceAll('{{LAYCAN_END}}',   String(le.getUTCDate()));
      body = body.replaceAll('{{LAYCAN_MONTH}}', `${SHORT_MONTHS[ls.getUTCMonth()]} ${ls.getUTCFullYear()}`);
      body = body.replaceAll('{{LAYCAN_RANGE}}', `${ls.getUTCDate()}-${le.getUTCDate()} ${SHORT_MONTHS[ls.getUTCMonth()]} ${ls.getUTCFullYear()}`);
    }

    // Vessel open date marker
    if (_meta.openDateOffsetDays !== undefined) {
      const od = addDays(today, _meta.openDateOffsetDays);
      body = body.replaceAll('{{OPEN_DATE}}', formatDate(od, 'human-short'));
    }

    // Arbitrary extra markers from _meta.markers
    for (const [key, def] of Object.entries(_meta.markers ?? {})) {
      body = body.replaceAll(`{{${key}}}`, formatDate(addDays(today, def.offsetDays), def.format));
    }

    return { ...rest, date, body } as Email;
  });
}
