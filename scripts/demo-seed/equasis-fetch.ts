/**
 * scripts/demo-seed/equasis-fetch.ts
 *
 * Fetch flag / classification society / year-built / P&I from Equasis for the
 * real-IMO demo vessels, via a HEADLESS BROWSER (Playwright/Chromium).
 *
 * Why a browser and not curl: the Equasis login flow does not establish a
 * usable restricted/ShipInfo session from a scripted curl POST — the authed
 * cookie/session is set client-side. A real Chromium drives the login form the
 * same way the founder's browser does.
 *
 * ── AUTH STATUS (2026-06-17) ────────────────────────────────────────────────
 * Headless login currently FAILS with the explicit modal
 *   "Your login (e-mail) or/and password are unknown in Equasis."
 * The login form is driven correctly (email + password fields filled, submit
 * fires, server responds) — the server rejects the credentials. This is a
 * CREDENTIALS rejection, not a captcha / bot-wall. Two unblock paths:
 *
 *   1. Founder verifies / updates the password in /root/.equasis-creds, then:
 *        set -a; . /root/.equasis-creds; set +a
 *        npx tsx scripts/demo-seed/equasis-fetch.ts
 *
 *   2. Founder exports an authenticated browser session (Playwright
 *      storageState JSON) from a logged-in equasis.org tab, then:
 *        EQUASIS_STORAGE_STATE=/path/to/equasis-state.json \
 *          npx tsx scripts/demo-seed/equasis-fetch.ts
 *      (no password needed in this mode).
 *
 * Output: lib/sample-data/equasis-enrichment.json — for HUMAN REVIEW before any
 * patch into demo-parsed-vessels.json. This script NEVER writes seed data and
 * NEVER fabricates values.
 *
 * Polite: 3s delay between ships, 22 ships ≈ ~70s. Do NOT run in CI.
 */
import * as fs from 'fs';
import * as path from 'path';

const BASE = 'https://www.equasis.org/EquasisWeb';
const DELAY_MS = 3000;

// Real IMOs from demo-parsed-vessels.json (excludes null + duplicates).
export const DEMO_IMOS: ReadonlyArray<string> = [
  '8605480', // MV HASKAL
  '8887296', // MV BARABULKA
  '9701360', // MV GLORY TOM
  '9063873', // MV IMI
  '9145786', // MV ALTO
  '9125073', // MV GULF BLUE
  '9166510', // MV BBA LARISA (3 dupe entries — fetch once)
  '9367841', // MV YUCATAN
  '9238351', // MV ONEGO TRADER
  '9238363', // MV ONEGO MERCHANT
  '8834940', // FIRTINA S
  '9145360', // EMINE ANNE
  '9554145', // GOYNUK
  '9167320', // GOCEK
  '9111761', // DOGANBEY
  '8216100', // MV MIMI
  '9381407', // MV SNAPPER
  '1033822', // M/V AVAT 1
  '9013012', // DOLPHIN E
  '9013036', // SERENITY AC
  '9103740', // M/V CANKA
  '9173331', // M/V TEOS
];

export interface EquasisFields {
  imo: string;
  flag: string | null;
  yearBuilt: number | null;
  classSociety: string | null;
  pandi: string | null;
  source: 'equasis';
  fetchedAt: string;
  error?: string;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * Extract a value from a simple `<td>LABEL</td><td>VALUE</td>` row. `labelRe`
 * is a regex source fragment (already HTML-entity-aware for the label).
 */
export function extractTableField(html: string, labelRe: string): string | null {
  const re = new RegExp(labelRe + '\\s*</td>\\s*<td[^>]*>\\s*([^<]{1,120}?)\\s*</td>', 'i');
  const m = html.match(re);
  if (!m) return null;
  const v = decodeEntities(m[1]);
  return v.length ? v : null;
}

/**
 * Detect an unauthenticated / failed-auth Equasis response. Verified against
 * the real bad-credentials modal text captured 2026-06-17.
 */
export function detectAuthFailure(html: string): boolean {
  return (
    /unknown in Equasis/i.test(html) ||
    /session has expired/i.test(html) ||
    /Please Login/i.test(html)
  );
}

/** Parse an authenticated Equasis ShipInfo page into structured fields. */
export function parseShipInfo(html: string, imo: string): EquasisFields {
  const flag = extractTableField(html, 'Flag');
  const yearRaw = extractTableField(html, 'Year\\s+of\\s+[Bb]uild(?:ing)?');
  const classSociety = extractTableField(html, 'Classification\\s+[Ss]ociet\\w*');
  const pandi =
    extractTableField(html, 'P&amp;I\\s+[Cc]lub') ?? extractTableField(html, 'P&I\\s+[Cc]lub');

  const yearNum = yearRaw ? parseInt(yearRaw, 10) : NaN;

  return {
    imo,
    flag: flag ?? null,
    yearBuilt: Number.isFinite(yearNum) ? yearNum : null,
    classSociety: classSociety ?? null,
    pandi: pandi ?? null,
    source: 'equasis',
    fetchedAt: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Playwright runner (only when invoked as a script)
// ────────────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  // Lazy import so unit tests don't pull the browser SDK.
  const { chromium } = await import('playwright');

  const storageStatePath = process.env.EQUASIS_STORAGE_STATE;
  const user = process.env.EQUASIS_USER;
  const pass = process.env.EQUASIS_PASS;

  if (!storageStatePath && (!user || !pass)) {
    console.error(
      'ERROR: provide EQUASIS_STORAGE_STATE=<path> (founder browser export) OR EQUASIS_USER + EQUASIS_PASS.',
    );
    process.exit(1);
  }

  const launchOpts: Parameters<typeof chromium.launch>[0] = {
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  };
  if (process.env.EQUASIS_CHROMIUM_PATH) launchOpts.executablePath = process.env.EQUASIS_CHROMIUM_PATH;

  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    ...(storageStatePath ? { storageState: storageStatePath } : {}),
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  const page = await ctx.newPage();

  try {
    if (storageStatePath) {
      console.log(`Using imported browser session: ${storageStatePath}`);
    } else {
      console.log(`Logging in as ${user} (password not shown)...`);
      await page.goto(`${BASE}/public/HomePage`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      // 3 login forms (mobile/header/home) share the j_email/j_password names — fill the visible pair.
      const email = page.locator('input[name="j_email"]:visible').first();
      const passwd = page.locator('input[name="j_password"]:visible').first();
      await email.waitFor({ state: 'visible', timeout: 20000 });
      await email.fill(user!);
      await passwd.fill(pass!);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}),
        passwd.press('Enter'),
      ]);
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      const body = await page.content();
      if (detectAuthFailure(body)) {
        console.error('AUTH FAILED: credentials rejected by Equasis (login/email or password unknown).');
        console.error('Fix the password in /root/.equasis-creds, or use EQUASIS_STORAGE_STATE. See file header.');
        await browser.close();
        process.exit(2);
      }
      console.log('Auth OK.');
    }

    const results: EquasisFields[] = [];
    for (const imo of DEMO_IMOS) {
      await sleep(DELAY_MS);
      console.log(`Fetching IMO ${imo}...`);
      try {
        await page.goto(`${BASE}/restricted/ShipInfo?fs=ShipList&P_IMO=${imo}`, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });
        const html = await page.content();
        if (detectAuthFailure(html)) {
          console.error(`  Session lost at IMO ${imo} — re-run script.`);
          results.push(blank(imo, 'session_expired'));
          continue;
        }
        const fields = parseShipInfo(html, imo);
        console.log(
          `  flag=${fields.flag} year=${fields.yearBuilt} class=${fields.classSociety} pandi=${fields.pandi}`,
        );
        results.push(fields);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ERROR ${imo}: ${msg}`);
        results.push(blank(imo, msg));
      }
    }

    const outPath = path.join(process.cwd(), 'lib/sample-data/equasis-enrichment.json');
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(`\nDone. Results: ${outPath}`);
    console.log('Review equasis-enrichment.json, then write a backfill to patch demo-parsed-vessels.json.');
  } finally {
    await browser.close();
  }
}

function blank(imo: string, error: string): EquasisFields {
  return {
    imo,
    flag: null,
    yearBuilt: null,
    classSociety: null,
    pandi: null,
    source: 'equasis',
    fetchedAt: new Date().toISOString(),
    error,
  };
}

// Run only when executed directly (not when imported by tests).
if (require.main === module) {
  run().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
