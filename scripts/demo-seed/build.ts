// scripts/demo-seed/build.ts
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { ManifestSchema, type Manifest } from './manifest-schema';
import { normalizeRawEmail, extractFacts, type FlatEmail } from './analyze';
import { loadLlmCacheIfAny } from './llm-cache';
import {
  cfValue,
  type ParsedCargo,
  type ParsedVessel,
  type ParsedFixtureRecap,
} from '@/lib/types';
import { parseLaycan, parseVesselOpenDate } from '@/lib/sailing/date-parsing';

const PARSER_VERSION = 'demo-seed-v1';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function shiftIsoDate(iso: string, offsetDays: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString();
}

/**
 * Shift dates in plain text body. Recognizes:
 *   - ISO "YYYY-MM-DD"
 *   - "DD-DD Month YYYY" range (e.g. "15-20 April 2026"), handles cross-month
 */
function shiftBodyDates(body: string, offsetDays: number): string {
  let out = body;

  // ISO YYYY-MM-DD
  out = out.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_m, y, mo, d) =>
    shiftIsoDate(`${y}-${mo}-${d}T00:00:00Z`, offsetDays).slice(0, 10),
  );

  // "DD-DD Month YYYY" or "DD/DD Month YYYY" range (e.g. "15-20 April 2026", "02/05 April 2018")
  out = out.replace(
    /\b(\d{1,2})\s*[-\/]\s*(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/gi,
    (_match, d1, d2, mon, y) => {
      const monthIdx = MONTH_NAMES.findIndex((m) =>
        m.toLowerCase().startsWith(mon.slice(0, 3).toLowerCase()),
      );
      const start = new Date(Date.UTC(+y, monthIdx, +d1));
      const end = new Date(Date.UTC(+y, monthIdx, +d2));
      start.setUTCDate(start.getUTCDate() + offsetDays);
      end.setUTCDate(end.getUTCDate() + offsetDays);
      const sameMonth =
        start.getUTCMonth() === end.getUTCMonth() &&
        start.getUTCFullYear() === end.getUTCFullYear();
      if (sameMonth) {
        return `${start.getUTCDate()}-${end.getUTCDate()} ${MONTH_NAMES[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
      }
      return `${start.getUTCDate()} ${MONTH_NAMES[start.getUTCMonth()]} - ${end.getUTCDate()} ${MONTH_NAMES[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
    },
  );

  return out;
}

// Shift the dates inside an LLM-parsed ParsedCargo: only the free-text
// `laycan` field carries dates. We push it through the same body-date
// shifter so "10-15 May 2026" → "25-30 May 2026" (offset = +15d).
function shiftedCargo(c: ParsedCargo, offsetDays: number): ParsedCargo {
  return {
    ...c,
    // LLM output is not always a string here (can be null / object); only shift strings.
    laycan: typeof c.laycan === 'string' ? shiftBodyDates(c.laycan, offsetDays) : c.laycan,
  };
}

// Shift the dates inside an LLM-parsed ParsedVessel: only openDate.value
// (ISO yyyy-mm-dd) is shifted.
function shiftedVessel(v: ParsedVessel, offsetDays: number): ParsedVessel {
  if (!v.openDate) return v;
  const iso = v.openDate.value;
  // LLM output is not always a string here (can be number / null); only shift ISO strings.
  if (typeof iso !== 'string' || !iso.match(/^\d{4}-\d{2}-\d{2}/)) return v;
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : ''));
  if (isNaN(d.getTime())) return v;
  d.setUTCDate(d.getUTCDate() + offsetDays);
  const shifted = d.toISOString().slice(0, 10);
  return { ...v, openDate: { ...v.openDate, value: shifted } };
}

function shiftedRecap(r: ParsedFixtureRecap, offsetDays: number, frozenDate: string): ParsedFixtureRecap {
  const laycanVal = cfValue(r.laycan);
  if (!laycanVal) return r;
  let shifted = shiftBodyDates(laycanVal, offsetDays);
  // Receipt-date offsetDays is too small to move historical laycans (e.g. 2018) to 2026.
  // Year-correct: replace any year more than 2 years before frozen with the frozen year.
  const frozenYear = parseInt(frozenDate.slice(0, 4), 10);
  shifted = shifted.replace(/\b(19|20)(\d{2})\b/g, (match) => {
    const yr = parseInt(match, 10);
    return yr < frozenYear - 2 ? String(frozenYear) : match;
  });
  if (shifted === laycanVal) return r;
  return { ...r, laycan: { ...r.laycan!, value: shifted } };
}

export interface BuildOptions {
  rawDir: string;
  manifestPath: string;
  outDb: string;
  forbiddenSubstrings?: string[];
}

/**
 * Replace all occurrences of keys in `map` within `text`, case-insensitively.
 * Longer keys are replaced first to avoid partial-match issues.
 */
function applyAnonymization(text: string, map: Record<string, string>): string {
  // Sort longest-first to avoid partial-match issues; skip keys < 3 chars to prevent
  // false-positive corruption (e.g. "GN" matching inside "signed").
  const entries = Object.entries(map)
    .filter(([k]) => k.length >= 3)
    .sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [original, alias] of entries) {
    // Escape regex metachars, then make internal whitespace flexible: real names
    // in the source emails have irregular spacing ("LEPRO TRADE LP  IRELAND" with
    // a double space) that the normalized canonical key would otherwise miss.
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    // Use lookarounds to prevent matching inside longer words:
    // "Company" must not corrupt JSON key "originalSenderCompany";
    // "Operation" must not corrupt "Operations Director".
    const firstIsWord = /\w/.test(original[0]);
    const lastIsWord = /\w/.test(original[original.length - 1]);
    const startBound = firstIsWord ? '(?<!\\w)' : '';
    const endBound = lastIsWord ? '(?!\\w)' : '';
    out = out.replace(new RegExp(`${startBound}${escaped}${endBound}`, 'gi'), alias);
  }
  return out;
}

// Forwarded broker emails carry dozens of real addresses (To/From/Cc/signatures)
// that the entity-name map never sees. Email addresses are an unambiguous pattern,
// so redact every one to a generic demo address — no over-replacement risk.
function redactEmails(text: string): string {
  return text
    // Real addresses → generic demo address; skip ones already at demo.local so
    // curated per-sender pseudonyms (broker1@demo.local) are preserved.
    .replace(/[\w.+-]+@(?!demo\.local\b)[\w.-]+\.[a-z]{2,}/gi, 'broker@demo.local')
    // Bare company domains (no @) that appear in URLs/signatures, e.g. "mrcship.com".
    .replace(/\b[a-z0-9][a-z0-9-]+\.(?:com|net|org|co|biz|info|gr|tr|eg)(?:\.[a-z]{2})?\b/gi, 'demo.local')
    // Skype / Viber / WhatsApp / ICQ contact handles after label (e.g. "Skype : elifkisabacak")
    .replace(/\b(?:Skype|Viber|WhatsApp|ICQ|WeChat|Telegram)\s*[:\-]\s*\S+/gi, 'demo.local');
}

function loadManifest(p: string): Manifest {
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return ManifestSchema.parse(raw);
}

function loadCorpus(rawDir: string): FlatEmail[] {
  return fs
    .readdirSync(rawDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const raw = JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8'));
      return normalizeRawEmail(raw);
    });
}

function hashManifest(m: Manifest): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ ...m, generated_at: '' }))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Pre-compute a balanced email-date map so no single calendar date has >MAX_PER_DATE emails.
 * Uses a two-pass approach: (1) compute proposed dates with small jitter, (2) redistribute
 * overflow entries one day earlier until the constraint is satisfied.
 *
 * The polynomial hash jitter is designed to give 0 for test fixture IDs (fixture00X...) so
 * existing tests are unaffected.
 */
function buildBalancedDates(
  corpus: FlatEmail[],
  manifest: Manifest,
  maxPerDate = 9,
): Map<string, string> {
  const polyH = (id: string) =>
    Math.abs(id.split('').reduce((h, c) => (Math.imul(h, 31) ^ c.charCodeAt(0)), 1));

  // Pass 1: proposed date for each email
  const proposed = new Map<string, string>(); // threadId -> ISO date string
  for (const email of corpus) {
    const offset = manifest.offsets[email.threadId];
    if (offset === undefined) continue;
    const raw = shiftIsoDate(email.date, offset.offsetDays);
    let dateStr: string;
    if (raw.slice(0, 10) > manifest.frozenDate) {
      // Clamped: jitter across 1..20 days before frozen
      const j = (parseInt(email.threadId.slice(-6), 16) % 20) + 1;
      dateStr = new Date(
        new Date(manifest.frozenDate + 'T00:00:00.000Z').getTime() - j * 86_400_000,
      ).toISOString().slice(0, 10);
    } else {
      // Non-clamped: small poly-hash jitter ±3 days for natural spread
      const jitter = (polyH(email.threadId) % 7) - 3;
      const ms = new Date(raw.slice(0, 10) + 'T00:00:00Z').getTime() + jitter * 86_400_000;
      dateStr = new Date(
        Math.min(ms, new Date(manifest.frozenDate + 'T00:00:00Z').getTime()),
      ).toISOString().slice(0, 10);
    }
    proposed.set(email.threadId, dateStr);
  }

  // Pass 2: redistribute — for each over-crowded date, move excess emails one day earlier.
  // Iterate until stable (in practice 1-3 passes for typical corpora).
  const grouped = new Map<string, string[]>(); // date -> [threadId] (sorted for determinism)
  for (const [tid, date] of proposed) {
    const arr = grouped.get(date) ?? [];
    arr.push(tid);
    grouped.set(date, arr);
  }
  let hasOverflow = true;
  let guard = 0;
  while (hasOverflow && guard++ < 200) {
    hasOverflow = false;
    // Process dates in descending order so overflow cascades to earlier dates
    for (const date of [...grouped.keys()].sort().reverse()) {
      const tids = grouped.get(date)!;
      if (tids.length <= maxPerDate) continue;
      hasOverflow = true;
      tids.sort(); // deterministic order
      const overflow = tids.splice(maxPerDate);
      grouped.set(date, tids);
      const prevDate = new Date(
        new Date(date + 'T00:00:00Z').getTime() - 86_400_000,
      ).toISOString().slice(0, 10);
      const prevArr = grouped.get(prevDate) ?? [];
      prevArr.push(...overflow);
      grouped.set(prevDate, prevArr);
    }
  }

  // Build final date map
  const final = new Map<string, string>();
  for (const [date, tids] of grouped) {
    for (const tid of tids) {
      final.set(tid, date + 'T12:00:00.000Z');
    }
  }
  return final;
}

// Words that indicate a phrase is a company/place, not a person name.
const NON_PERSON_FIRST_WORDS = new Set([
  'agence', 'agency', 'egypt', 'egyptian', 'ramps', 'foztrafego', 'agemafric',
  'operations', 'logistics', 'shipping', 'chartering', 'maritime', 'services',
  'company', 'limited', 'group', 'trading', 'trade', 'navigation', 'corporation',
  'management', 'transport', 'brickdam', 'stabroek', 'georgetown',
]);

/**
 * Scan LLM cache agent contact fields + raw email body "Pic :" patterns to
 * find person names that aren't in the manifest anonymization maps. Returns a
 * supplemental map of realName → "AGENT N" aliases (deterministic ordering).
 */
function buildContactNameMap(
  corpus: FlatEmail[],
  llmCache: NonNullable<ReturnType<typeof loadLlmCacheIfAny>>,
  existingMap: Record<string, string>,
): Record<string, string> {
  const coveredLower = new Set(Object.keys(existingMap).map((k) => k.toLowerCase()));
  const candidates: string[] = [];

  function tryAdd(raw: string): void {
    const name = raw.trim().replace(/^(?:Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Capt\.?)\s+/i, '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (coveredLower.has(key)) return;
    const parts = name.split(/\s+/);
    if (parts.length < 2 || parts.length > 4) return;
    if (parts.some((p) => p.length < 2)) return;
    if (NON_PERSON_FIRST_WORDS.has(parts[0].toLowerCase())) return;
    if (!candidates.includes(name)) candidates.push(name);
  }

  // 1. LLM cache: extract first person-name segment from port agent contact fields
  const MR_RE = /\bMr\b\.?\s+|\bMrs\b\.?\s+|\bMs\b\.?\s+|\bDr\b\.?\s+/gi;
  for (const recap of llmCache.parsedFixtureRecaps) {
    for (const field of ['dischPortAgent', 'loadPortAgent']) {
      const v = (recap as unknown as Record<string, unknown>)[field];
      if (!v || typeof v !== 'object') continue;
      const rf = v as { value?: unknown; source_text?: unknown };
      for (const txt of [rf.value, rf.source_text]) {
        if (typeof txt !== 'string' || !txt.trim()) continue;
        // First segment before comma/newline is often the person name
        const firstSeg = txt.split(/[,\n\r]/)[0].trim();
        tryAdd(firstSeg);
        // Also scan for Mr/Mrs/Ms/Dr patterns in the full value
        const cleaned = txt.replace(MR_RE, '');
        const NAME_RE = /\b([A-Z][a-zA-ZÀ-ɏ]+(?:\s+[A-Z][a-zA-ZÀ-ɏ]+)+)\b/g;
        let m: RegExpExecArray | null;
        while ((m = NAME_RE.exec(cleaned)) !== null) {
          tryAdd(m[1]);
        }
      }
    }
  }

  // 2. Raw email body: "Pic : Mr FirstName LastName" patterns
  const PIC_RE = /\bPic\s*:\s*(?:Mr\.?\s+|Mrs\.?\s+|Ms\.?\s+|Dr\.?\s+)?([A-Z][a-zA-ZÀ-ɏ]+(?:\s+[A-Z][a-zA-ZÀ-ɏ]+)+)/gi;
  for (const email of corpus) {
    PIC_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PIC_RE.exec(email.body ?? '')) !== null) {
      tryAdd(m[1].trim().split(/[:\s]+/)[0] + ' ' + m[1].trim().split(/\s+/).slice(1).join(' '));
    }
  }

  // Sort for determinism; assign AGENT N aliases
  candidates.sort();
  const result: Record<string, string> = {};
  candidates.forEach((name, i) => {
    const alias = `AGENT ${i + 1}`;
    result[name] = alias;
    result[name.toUpperCase()] = alias;
    for (const part of name.split(/\s+/)) {
      if (part.length >= 4 && !coveredLower.has(part.toLowerCase())) {
        result[part] = alias;
        result[part.toUpperCase()] = alias;
        coveredLower.add(part.toLowerCase());
      }
    }
    coveredLower.add(name.toLowerCase());
  });
  return result;
}

export async function build(opts: BuildOptions): Promise<void> {
  const manifest = loadManifest(opts.manifestPath);
  const corpus = loadCorpus(opts.rawDir);
  // Prefer real LLM-parsed data when a hash-matching cache is present.
  // Falls back to regex extractFacts when absent (CI-safe).
  const llmCache = loadLlmCacheIfAny(opts.rawDir);

  // Build supplemental map for person names that appear in port-agent contact
  // fields and raw email body "Pic :" lines but aren't in the manifest.
  const baseAnonymizationMap: Record<string, string> = {
    ...manifest.anonymization.vessels,
    ...manifest.anonymization.charterers,
    ...manifest.anonymization.brokers,
    ...manifest.anonymization.sender_emails,
  };
  const contactMap = llmCache
    ? buildContactNameMap(corpus, llmCache, baseAnonymizationMap)
    : {};

  // Pre-compute balanced email dates (cap ≤9 per calendar date).
  const balancedDates = buildBalancedDates(corpus, manifest);

  if (fs.existsSync(opts.outDb)) fs.unlinkSync(opts.outDb);
  const db = new Database(opts.outDb);

  // runMigrations also loads sqlite-vec internally (see runner.ts)
  runMigrations(db, allMigrations);

  const insertEmail = db.prepare(`
    INSERT INTO emails (account_id, gmail_message_id, thread_id, from_addr, from_name, from_email,
                        to_addr, subject, date, body, snippet, label_ids, fetched_at)
    VALUES (@account_id, @gmail_message_id, @thread_id, @from_addr, @from_name, @from_email,
            @to_addr, @subject, @date, @body, @snippet, @label_ids, @fetched_at)
  `);

  const insertParsed = db.prepare(`
    INSERT INTO parsed_results (account_id, gmail_message_id, parse_type, parser_version, result_json, parsed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const email of corpus) {
      const offset = manifest.offsets[email.threadId];
      if (offset === undefined) {
        throw new Error(`manifest missing offset for threadId=${email.threadId}`);
      }
      // Use pre-computed balanced date (guaranteed ≤9 emails per calendar date).
      const shiftedDate = balancedDates.get(email.threadId) ?? shiftIsoDate(email.date, offset.offsetDays);
      const shiftedBody = shiftBodyDates(email.body ?? '', offset.offsetDays);
      const shiftedSubject = shiftBodyDates(email.subject ?? '', offset.offsetDays);

      // Build combined anonymization map: vessels + charterers + brokers + sender_emails (body/subject)
      // sender_emails included so forwarded/quoted email addresses in body are also anonymized
      const bodyMap: Record<string, string> = {
        ...manifest.anonymization.vessels,
        ...manifest.anonymization.charterers,
        ...manifest.anonymization.brokers,
        ...manifest.anonymization.sender_emails,
        ...contactMap,
      };
      const anonBody = redactEmails(applyAnonymization(shiftedBody, bodyMap));
      const anonSubject = redactEmails(applyAnonymization(shiftedSubject, bodyMap));

      // Use originalSender from LLM classifications for realistic sender variety (M7/H1).
      // All 153 emails come from ONE inbox (management@etm-services.net), so raw fromName
      // is always the same. originalSender is who actually sent the broker inquiry.
      const cls = llmCache?.classifications.find((c) => c.emailId === email.messageId);
      const fromNameRaw = cls?.originalSender?.trim() ?? email.fromName ?? '';
      const brokerKey = Object.keys(manifest.anonymization.brokers).find(
        (k) => k.toLowerCase() === fromNameRaw.toLowerCase(),
      );
      const anonFromName = brokerKey
        ? manifest.anonymization.brokers[brokerKey]
        : fromNameRaw;

      // Derive per-contact fake email from anonymized contact name for variety (M7).
      // Falls back to sender_emails map lookup → redact.
      const contactMatch = anonFromName.match(/\bCONTACT\s+(\d+)\b/i);
      const fromEmailRaw = email.fromEmail ?? '';
      const anonFromEmail = contactMatch
        ? `contact${contactMatch[1]}@demo.local`
        : redactEmails(manifest.anonymization.sender_emails[fromEmailRaw] ?? fromEmailRaw);

      // Leak validation (Task 16). Short pure-word needles use word-boundary matching to
      // avoid false positives where the needle appears inside a longer word (e.g. "Ali"
      // inside "Italian" is not a PII leak; "Schuster" as a standalone word is).
      const forbidden = opts.forbiddenSubstrings ?? [];
      for (const needle of forbidden) {
        const isShortWord = needle.length < 5 && /^[\p{L}\p{N}]+$/u.test(needle);
        const leakRe = isShortWord ? new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null;
        for (const [field, value] of [
          ['body', anonBody],
          ['subject', anonSubject],
          ['from_name', anonFromName],
          ['from_email', anonFromEmail],
        ] as [string, string][]) {
          const leaked = leakRe ? leakRe.test(value) : value.includes(needle);
          if (leaked) {
            throw new Error(
              `anonymization leak in ${email.threadId} (${field}): "${needle}" still present after replacement`,
            );
          }
        }
      }

      insertEmail.run({
        account_id: 'demo',
        gmail_message_id: email.messageId,
        thread_id: email.threadId,
        from_addr: anonFromEmail,
        from_name: anonFromName,
        from_email: anonFromEmail,
        to_addr: '',
        subject: anonSubject,
        date: shiftedDate,
        body: anonBody,
        snippet: anonBody.slice(0, 200),
        label_ids: '[]',
        fetched_at: manifest.generated_at,
      });

      // Anonymize the structured parsed JSON too — charterer/vessel/broker names
      // Opus extracted live inside result_json, and the UI reads parsed_results.
      // Body-only anonymization would leak them. Re-check forbidden on the result.
      const anonJson = (items: unknown[]): string => {
        const s = redactEmails(applyAnonymization(JSON.stringify(items), bodyMap));
        for (const needle of forbidden) {
          const isShortWord = needle.length < 5 && /^[\p{L}\p{N}]+$/u.test(needle);
          const leakRe = isShortWord ? new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null;
          const leaked = leakRe ? leakRe.test(s) : s.includes(needle);
          if (leaked) {
            throw new Error(
              `anonymization leak in ${email.threadId} (parsed_results): "${needle}" still present`,
            );
          }
        }
        return s;
      };

      // Populate parsed_results. Cache-prefer: write real LLM rows when a
      // matching .llm-cache/<hash>.json is present, fall back to the regex
      // extractFacts path otherwise (CI-safe — fixture corpus uses regex).
      if (llmCache) {
        // parsed_results is UNIQUE per (account_id, gmail_message_id, parse_type,
        // parser_version) and prod (lib/email-cache.ts) stores result_json as a
        // JSON ARRAY of items, one row per email. Emails routinely carry multiple
        // cargoes/vessels, so group per email into one array row — inserting one
        // row per item violates the unique key.
        const cls = llmCache.classifications.find((c) => c.emailId === email.messageId);
        if (cls) {
          insertParsed.run(
            'demo', email.messageId, 'classify', PARSER_VERSION,
            anonJson([cls]), manifest.generated_at,
          );
        }

        const cargoes = llmCache.parsedCargos
          .filter((c) => c.emailId === email.messageId)
          .map((cargo) => {
            const shifted = shiftedCargo(cargo, offset.offsetDays);
            // Pre-compute laycan {start,end} ISO so the matches loop below can
            // read structured dates directly. parseLaycan is the same helper
            // used by the matching engine in prod.
            let laycanRange: { start: string; end: string } | null = null;
            if (shifted.laycan) {
              const refYear = new Date(shiftedDate).getUTCFullYear();
              const r = parseLaycan(shifted.laycan, refYear);
              if (r) laycanRange = { start: r.start.toISOString(), end: r.end.toISOString() };
            }
            return { ...shifted, laycan: laycanRange ?? shifted.laycan };
          });
        if (cargoes.length > 0) {
          insertParsed.run(
            'demo', email.messageId, 'cargo', PARSER_VERSION,
            anonJson(cargoes), manifest.generated_at,
          );
        }

        const vessels = llmCache.parsedVessels
          .filter((v) => v.emailId === email.messageId)
          .map((vessel) => {
            const shifted = shiftedVessel(vessel, offset.offsetDays);
            // Top-level ISO openDate for the matches loop. Vessel open dates are
            // usually loose ("22-24 August", "end Feb"), so parse the raw string
            // then apply the per-email day offset (parse-then-shift) to land it in
            // the frozen window. parseVesselOpenDate handles the loose formats.
            const rawOpen = cfValue(vessel.openDate);
            let openDateIso: string | null = null;
            if (rawOpen != null) {
              // parseVesselOpenDate handles both string and {open,close,display} object forms
              const d = parseVesselOpenDate(
                rawOpen as string | { open?: string | null; close?: string | null; display?: string | null },
                new Date(email.date).getUTCFullYear(),
              );
              if (d) {
                d.setUTCDate(d.getUTCDate() + offset.offsetDays);
                openDateIso = d.toISOString();
              }
            }
            return { ...shifted, openDate: openDateIso };
          });
        if (vessels.length > 0) {
          insertParsed.run(
            'demo', email.messageId, 'vessel', PARSER_VERSION,
            anonJson(vessels), manifest.generated_at,
          );
        }

        const recaps = llmCache.parsedFixtureRecaps
          .filter((r) => r.emailId === email.messageId)
          .map((recap) => shiftedRecap(recap, offset.offsetDays, manifest.frozenDate));
        if (recaps.length > 0) {
          insertParsed.run(
            'demo', email.messageId, 'recap', PARSER_VERSION,
            anonJson(recaps), manifest.generated_at,
          );
        }
      } else {
        // Regex fallback — original LLM-free path. Kept for CI and fresh worktrees.
        const facts = extractFacts({
          threadId: email.threadId,
          messageId: email.messageId,
          fromName: anonFromName,
          fromEmail: anonFromEmail,
          subject: anonSubject,
          date: shiftedDate,
          body: anonBody,
        });

        insertParsed.run('demo', email.messageId, 'classify', PARSER_VERSION,
          JSON.stringify({ category: facts.category }), manifest.generated_at);

        if (facts.category === 'cargo' && (facts.laycanStart || facts.laycanEnd)) {
          insertParsed.run('demo', email.messageId, 'cargo', PARSER_VERSION,
            JSON.stringify({
              laycan: facts.laycanStart && facts.laycanEnd
                ? { start: facts.laycanStart.toISOString(), end: facts.laycanEnd.toISOString() }
                : null,
            }),
            manifest.generated_at);
        } else if (facts.category === 'vessel' && facts.openDate) {
          insertParsed.run('demo', email.messageId, 'vessel', PARSER_VERSION,
            JSON.stringify({ openDate: facts.openDate.toISOString() }),
            manifest.generated_at);
        }
      }
    }

    // Pre-compute matches via simple laycan↔open_date pairing (no real match engine needed)
    const cargoRows = db.prepare(`
      SELECT pr.gmail_message_id AS cargo_id, pr.result_json
      FROM parsed_results pr
      WHERE pr.parse_type = 'cargo'
    `).all() as Array<{cargo_id: string; result_json: string}>;

    const vesselRows = db.prepare(`
      SELECT pr.gmail_message_id AS vessel_id, pr.result_json
      FROM parsed_results pr
      WHERE pr.parse_type = 'vessel'
    `).all() as Array<{vessel_id: string; result_json: string}>;

    const insertMatch = db.prepare(`
      INSERT INTO matches (cargo_id, vessel_id, score, reason, status, created_at, updated_at,
                           laycan_start, laycan_end, vessel_dwt, load_port, discharge_port)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const nowMs = new Date(manifest.frozenDate + 'T00:00:00.000Z').getTime();

    // result_json is a JSON array of items per email (prod contract). Flatten
    // vessels once; tolerate both array and legacy single-object shapes.
    const asItems = (json: string): Record<string, unknown>[] => {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : [parsed];
    };
    // Unwrap a value that may be a plain scalar OR a ConfidenceField {value,...} object.
    const unwrapNum = (f: unknown): number => {
      if (typeof f === 'number') return f;
      if (f && typeof f === 'object' && 'value' in (f as object)) {
        const v = (f as { value: unknown }).value;
        if (typeof v === 'number') return v;
      }
      return 0;
    };
    const unwrapStr = (f: unknown): string | null => {
      if (typeof f === 'string') return f || null;
      if (f && typeof f === 'object' && 'value' in (f as object)) {
        const v = (f as { value: unknown }).value;
        if (typeof v === 'string') return v || null;
      }
      return null;
    };

    const allVessels: Array<{
      vesselId: string; openMs: number; openIso: string;
      dwt: number; openPosition: string | null;
    }> = [];
    for (const v of vesselRows) {
      for (const vessel of asItems(v.result_json)) {
        if (!vessel.openDate || typeof vessel.openDate !== 'string') continue;
        const dwt = unwrapNum(vessel.dwtSummer) || unwrapNum(vessel.dwcc);
        const openPosition = unwrapStr(vessel.openPosition);
        allVessels.push({
          vesselId: v.vessel_id,
          openMs: new Date(vessel.openDate).getTime(),
          openIso: vessel.openDate,
          dwt,
          openPosition,
        });
      }
    }

    // Dedupe to one match per (cargo email, vessel email) pair — emails carry
    // multiple cargoes/vessels but cargo_id/vessel_id are email-level. Keep best score.
    const best = new Map<
      string,
      {
        cargoId: string; vesselId: string; score: number; reason: string;
        layStart: number; layEnd: number; vesselDwt: number;
        loadPort: string | null; dischargePort: string | null;
      }
    >();
    for (const c of cargoRows) {
      for (const cargo of asItems(c.result_json)) {
        const laycan = cargo.laycan as { start?: string; end?: string } | null | undefined;
        if (!laycan?.start || !laycan?.end) continue;
        const layStart = new Date(laycan.start).getTime();
        const layEnd = new Date(laycan.end).getTime();

        // Extract cargo weight and port fields; unwrap ConfidenceField wrappers if present.
        const cargoWeightMt = unwrapNum(cargo.weightMt);
        const cargoDestPort = unwrapStr(cargo.destinationPort);
        const cargoOriginPort = unwrapStr(cargo.originPort);

        for (const v of allVessels) {
          // Skip vessels that can't carry the cargo (90% utilization limit)
          if (cargoWeightMt > 0 && v.dwt > 0 && cargoWeightMt > v.dwt * 0.90) continue;
          // Skip vessels opening too late
          if (v.openMs > layEnd + 7 * 86_400_000) continue;

          // Score with meaningful spread
          let score = 60;
          if (v.openMs >= layStart && v.openMs <= layEnd) score += 25; // perfect timing
          else if (v.openMs < layStart) score += 15; // ready early (small repositioning cost)
          else score += 5; // opens slightly after laycan but within grace

          // DWT fitness bonus (well-utilized vessel)
          if (cargoWeightMt > 0 && v.dwt > 0) {
            const util = cargoWeightMt / v.dwt;
            if (util >= 0.50 && util <= 0.88) score += 15; // good utilization
            else if (util > 0.88 && util <= 0.90) score += 10; // tight but valid
            else if (util < 0.50) score += 3; // over-capacity vessel
          }

          const key = `${c.cargo_id}|${v.vesselId}`;
          const prev = best.get(key);
          if (!prev || score > prev.score) {
            best.set(key, {
              cargoId: c.cargo_id,
              vesselId: v.vesselId,
              score,
              reason: `auto-shortlist: open ${v.openIso.slice(0, 10)} vs laycan ${laycan.start.slice(0, 10)}..${laycan.end.slice(0, 10)}`,
              layStart,
              layEnd,
              vesselDwt: v.dwt,
              loadPort: cargoOriginPort ?? v.openPosition,
              dischargePort: cargoDestPort,
            });
          }
        }
      }
    }
    // Cap fan-out: keep top 6 matches per cargo (by score desc) to avoid near-cartesian product
    type BestEntry = { cargoId: string; vesselId: string; score: number; reason: string; layStart: number; layEnd: number; vesselDwt: number; loadPort: string | null; dischargePort: string | null };
    const perCargo = new Map<string, BestEntry[]>();
    for (const m of best.values()) {
      const arr = perCargo.get(m.cargoId) ?? [];
      arr.push(m);
      perCargo.set(m.cargoId, arr);
    }
    for (const arr of perCargo.values()) {
      arr.sort((a, b) => b.score - a.score);
      for (const m of arr.slice(0, 6)) {
        insertMatch.run(
          m.cargoId, m.vesselId, m.score, m.reason, 'shortlist', nowMs, nowMs,
          m.layStart, m.layEnd,
          m.vesselDwt || null,
          m.loadPort ?? null,
          m.dischargePort ?? null,
        );
      }
    }

    db.prepare(
      'INSERT INTO demo_seed_meta (id, frozen_date, manifest_hash) VALUES (1, ?, ?)',
    ).run(manifest.frozenDate, hashManifest(manifest));
  });

  tx();
  db.close();
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k: string) => { const i = argv.indexOf(k); return i === -1 ? undefined : argv[i+1]; };
  const rawDir = arg('--raw-dir') ?? path.resolve(process.cwd(), '.private/raw-emails');
  const manifestPath = arg('--manifest') ?? path.resolve(process.cwd(), 'scripts/demo-seed/manifest.json');
  const outDb = arg('--out') ?? path.resolve(process.cwd(), 'data/demo-seed.db');

  await build({ rawDir, manifestPath, outDb, forbiddenSubstrings: loadForbidden(manifestPath) });
  const stats = fs.statSync(outDb);
  console.log(`Wrote ${outDb} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
}

function loadForbidden(manifestPath: string): string[] {
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const keys = [
    ...Object.keys(m.anonymization.vessels),
    ...Object.keys(m.anonymization.charterers),
    ...Object.keys(m.anonymization.brokers),
    ...Object.keys(m.anonymization.sender_emails),
  ];
  // Additional forbidden substrings — known PII patterns
  const extra = ['etm-services.net', 'ETM Services'];
  return [...new Set([...keys, ...extra])].filter(k => k.length >= 3);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}
