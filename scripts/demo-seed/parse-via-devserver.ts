// scripts/demo-seed/parse-via-devserver.ts
/**
 * Drive the real LLM HTTP endpoints to parse all .private/raw-emails/*.json once,
 * cache the result, exit. Re-running with same corpus is a no-op (cache hit).
 *
 * Usage:
 *   npx tsx scripts/demo-seed/parse-via-devserver.ts \
 *     [--raw-dir DIR] [--base-url URL] [--dry-run]
 *
 * Pre-req: dev-server reachable at --base-url (default http://localhost:3000)
 *          → run `npm run dev` in another terminal.
 *
 * Auth model:
 *   - Seeds a real session into data/sessions.db via the existing
 *     SessionStore. Cookie session_id=<id> is sent on each POST.
 *   - validateCsrf returns true in NODE_ENV=development → no CSRF header
 *     needed. No prod-code changes.
 */
import * as fs from 'fs';
import * as path from 'path';
import { getStore } from '@/lib/session-store';
import type { Email } from '@/lib/types';
import { normalizeRawEmail, type FlatEmail } from './analyze';
import {
  corpusHash,
  loadLlmCacheIfAny,
  writeCache,
  type LlmCache,
} from './llm-cache';

const DEFAULT_RAW = '.private/raw-emails';
const DEFAULT_BASE = 'http://localhost:3000';
const ENDPOINTS = [
  '/api/ai/classify',
  '/api/ai/parse-cargo',
  '/api/ai/parse-vessel',
  '/api/ai/parse-recap',
] as const;
const PER_CALL_TIMEOUT_MS = 5 * 60 * 1000;

interface Args {
  rawDir: string;
  baseUrl: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (k: string) => {
    const i = argv.indexOf(k);
    return i === -1 ? undefined : argv[i + 1];
  };
  return {
    rawDir: path.resolve(get('--raw-dir') ?? DEFAULT_RAW),
    baseUrl: get('--base-url') ?? DEFAULT_BASE,
    dryRun: argv.includes('--dry-run'),
  };
}

async function probeServer(baseUrl: string): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2000);
    const r = await fetch(baseUrl, { signal: ctl.signal });
    clearTimeout(t);
    return r.status < 500;
  } catch {
    return false;
  }
}

function flatToEmail(flat: FlatEmail): Email {
  return {
    id: flat.messageId,
    threadId: flat.threadId,
    from: flat.fromName
      ? `${flat.fromName} <${flat.fromEmail ?? ''}>`
      : (flat.fromEmail ?? ''),
    fromName: flat.fromName ?? null,
    fromEmail: flat.fromEmail ?? null,
    to: '',
    subject: flat.subject ?? '',
    date: flat.date,
    body: flat.body,
    snippet: flat.body.slice(0, 200),
    labelIds: [],
  };
}

async function callEndpoint(
  baseUrl: string,
  endpoint: string,
  sessionId: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), PER_CALL_TIMEOUT_MS);
  try {
    const r = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_id=${sessionId}`,
      },
      body: '{}',
      signal: ctl.signal,
    });
    const body = await r.text();
    return { ok: r.ok, status: r.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.rawDir)) {
    console.error(`Raw dir does not exist: ${args.rawDir}`);
    process.exit(2);
  }

  const hash = corpusHash(args.rawDir);
  console.log(`[parse-via-devserver] corpus hash: ${hash}`);

  if (loadLlmCacheIfAny(args.rawDir)) {
    console.log('[parse-via-devserver] cache hit — nothing to do.');
    return;
  }

  if (args.dryRun) {
    console.log('[dry-run] would seed session into data/sessions.db');
    console.log('[dry-run] would POST sequentially:');
    for (const ep of ENDPOINTS) console.log(`  ${args.baseUrl}${ep}`);
    console.log(`[dry-run] would write cache: ${args.rawDir}/.llm-cache/${hash}.json`);
    return;
  }

  if (!(await probeServer(args.baseUrl))) {
    console.error(
      `[parse-via-devserver] dev-server not reachable at ${args.baseUrl}.\n` +
        `Run \`npm run dev\` in another terminal and retry.`,
    );
    process.exit(2);
  }

  const files = fs.readdirSync(args.rawDir).filter((f) => f.endsWith('.json')).sort();
  const emails: Email[] = files.map((f) => {
    const raw = JSON.parse(fs.readFileSync(path.join(args.rawDir, f), 'utf8'));
    return flatToEmail(normalizeRawEmail(raw));
  });
  console.log(`[parse-via-devserver] loaded ${emails.length} emails`);

  const store = getStore();
  const sessionId = store.createSession('demo-script-token');
  store.updateSession(sessionId, { emails });
  console.log(`[parse-via-devserver] seeded session ${sessionId}`);

  try {
    for (const ep of ENDPOINTS) {
      console.log(`[parse-via-devserver] POST ${ep} ...`);
      const t0 = Date.now();
      const res = await callEndpoint(args.baseUrl, ep, sessionId);
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  ← ${res.status} in ${dt}s — ${res.body.slice(0, 200)}`);
      if (!res.ok) {
        console.error(`[parse-via-devserver] ${ep} returned ${res.status}; aborting.`);
        console.error(res.body);
        process.exit(3);
      }
    }

    const final = store.getSession(sessionId);
    if (!final) {
      console.error('[parse-via-devserver] session vanished after parsing');
      process.exit(3);
    }

    const cache: LlmCache = {
      corpusHash: hash,
      generatedAt: new Date().toISOString(),
      classifications: final.classifications,
      parsedCargos: final.parsedCargos,
      parsedVessels: final.parsedVessels,
      parsedFixtureRecaps: final.parsedFixtureRecaps,
    };

    writeCache(args.rawDir, cache);
    const stats = fs.statSync(path.join(args.rawDir, '.llm-cache', `${hash}.json`));
    console.log(
      `[parse-via-devserver] wrote cache: ${(stats.size / 1024).toFixed(1)} KB ` +
        `(classifications=${cache.classifications.length} cargos=${cache.parsedCargos.length} ` +
        `vessels=${cache.parsedVessels.length} recaps=${cache.parsedFixtureRecaps.length})`,
    );
  } finally {
    try {
      store.deleteSession(sessionId);
    } catch (e) {
      console.warn('[parse-via-devserver] could not delete seeded session:', e);
    }
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
