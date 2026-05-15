/**
 * Offline generator that replaces the curated V2 demo corpus with the full
 * 154-email real ETMS corpus.
 *
 * Reads .private/etms-corpus.json, runs the app's own classify + parse-cargo +
 * parse-vessel functions, and atomically rewrites 9 JSON fixtures in
 * lib/sample-data/.
 *
 * See docs/plans/2026-05-14-etms-demo-corpus-migration{,-design}.md for the
 * full design + plan.
 */

import type { Email, Classification, EmailCategory } from '../lib/types';

const MS_PER_DAY = 86_400_000;

/**
 * Per-email offset in whole days from the newest email in the corpus.
 * Newest email gets 0; older ones get negative day counts.
 *
 * Used to derive _meta.emailDateOffsetDays so rebaseDates() can shift the
 * envelope date forward at seed-time, keeping the demo's inbox visually fresh.
 */
export function computeDateOffsets(emails: Email[]): Map<string, number> {
  const dayIndex = (iso: string): number =>
    Math.floor(new Date(iso).getTime() / MS_PER_DAY);
  const maxDay = Math.max(...emails.map((e) => dayIndex(e.date)));
  const out = new Map<string, number>();
  for (const e of emails) out.set(e.id, dayIndex(e.date) - maxDay);
  return out;
}

export interface CategoryBuckets {
  cargoInquiries: string[];
  vesselPositions: string[];
  fixtureRecaps: string[];
  clientReplies: string[];
  documents: string[];
  vesselCerts: string[];
}

const CATEGORY_TO_BUCKET: Record<EmailCategory, keyof CategoryBuckets> = {
  CARGO_INQUIRY: 'cargoInquiries',
  TCT_REQUEST: 'cargoInquiries',
  OTHER: 'cargoInquiries',
  VESSEL_POSITION: 'vesselPositions',
  FIXTURE_RECAP: 'fixtureRecaps',
  CLIENT_REPLY: 'clientReplies',
  DOCUMENT: 'documents',
  VESSEL_CERTIFICATE: 'vesselCerts',
};

/**
 * Partition email IDs by classification category into the six sample-data
 * fixture buckets. Throws on unknown category so a classifier glitch surfaces
 * at generation time instead of silently dropping emails.
 */
export function splitByCategory(classifications: Classification[]): CategoryBuckets {
  const buckets: CategoryBuckets = {
    cargoInquiries: [],
    vesselPositions: [],
    fixtureRecaps: [],
    clientReplies: [],
    documents: [],
    vesselCerts: [],
  };
  for (const c of classifications) {
    const bucket = CATEGORY_TO_BUCKET[c.category as EmailCategory];
    if (!bucket) {
      throw new Error(`Unknown category: ${c.category} (email ${c.emailId})`);
    }
    buckets[bucket].push(c.emailId);
  }
  return buckets;
}
