/**
 * scripts/demo-seed/equasis-fetch.ts
 *
 * Fetch flag / classification society / year-built / P&I from Equasis
 * for the real-IMO demo vessels. Outputs enrichment.json for human review.
 *
 * Usage:
 *   set -a; . /root/.equasis-creds; set +a
 *   npx tsx scripts/demo-seed/equasis-fetch.ts
 *
 * Requires: EQUASIS_USER, EQUASIS_PASS in env.
 * Polite: 2.5s delay between requests. Do not run in CI.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { URLSearchParams } from 'url';

const BASE = 'https://www.equasis.org/EquasisWeb';
const DELAY_MS = 2500;

// Real IMOs from demo-parsed-vessels.json (excludes null + duplicates).
const DEMO_IMOS = [
  '8605480',  // MV HASKAL
  '8887296',  // MV BARABULKA
  '9701360',  // MV GLORY TOM
  '9063873',  // MV IMI
  '9145786',  // MV ALTO
  '9125073',  // MV GULF BLUE
  '9166510',  // MV BBA LARISA (has 3 dupe entries — pick once)
  '9367841',  // MV YUCATAN
  '9238351',  // MV ONEGO TRADER
  '9238363',  // MV ONEGO MERCHANT
  '8834940',  // FIRTINA S
  '9145360',  // EMINE ANNE
  '9554145',  // GOYNUK
  '9167320',  // GOCEK
  '9111761',  // DOGANBEY
  '8216100',  // MV MIMI
  '9381407',  // MV SNAPPER
  '1033822',  // M/V AVAT 1
  '9013012',  // DOLPHIN E
  '9013036',  // SERENITY AC
  '9103740',  // M/V CANKA
  '9173331',  // M/V TEOS
];

interface EquasisFields {
  imo: string;
  flag: string | null;
  yearBuilt: number | null;
  classSociety: string | null;
  pandi: string | null;
  fetchedAt: string;
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchUrl(url: string, opts: {
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  cookies?: string;
}): Promise<{ status: number; headers: Record<string, string[]>; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      ...(opts.headers ?? {}),
    };
    if (opts.cookies) reqHeaders['Cookie'] = opts.cookies;
    if (opts.body) {
      reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
      reqHeaders['Content-Length'] = String(Buffer.byteLength(opts.body));
    }
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: opts.method ?? 'GET',
      headers: reqHeaders,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers as Record<string, string[]>,
          body: data,
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(30_000, () => { req.destroy(); reject(new Error('timeout')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function parseCookies(resp: { headers: Record<string, string[]> }): string[] {
  const raw = resp.headers['set-cookie'];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function extractCookieJar(cookieLines: string[]): string {
  return cookieLines.map((line) => line.split(';')[0]).join('; ');
}

/** Extract field value from a simple <td>LABEL</td><td>VALUE</td> pattern. */
function extractTableField(html: string, labelPattern: string): string | null {
  const re = new RegExp(
    labelPattern + '\\s*</td>\\s*<td[^>]*>\\s*([^<]{1,100}?)\\s*</td>',
    'i'
  );
  const m = html.match(re);
  return m ? m[1].trim().replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ') : null;
}

function parseShipInfo(html: string, imo: string): EquasisFields {
  const flag = extractTableField(html, 'Flag');
  const yearRaw = extractTableField(html, 'Year\\s+of\\s+[Bb]uild(?:ing)?');
  const classSociety = extractTableField(html, 'Classification\\s+[Ss]ociet\\w*');
  const pandi = extractTableField(html, 'P\\s*&amp;\\s*I\\s+[Cc]lub|P&I\\s+[Cc]lub');

  return {
    imo,
    flag: flag || null,
    yearBuilt: yearRaw ? parseInt(yearRaw, 10) || null : null,
    classSociety: classSociety || null,
    pandi: pandi || null,
    fetchedAt: new Date().toISOString(),
  };
}

async function main() {
  const user = process.env.EQUASIS_USER;
  const pass = process.env.EQUASIS_PASS;
  if (!user || !pass) {
    console.error('ERROR: EQUASIS_USER and EQUASIS_PASS must be set in env');
    process.exit(1);
  }
  // Never log the password
  console.log(`Equasis user: ${user}`);

  // Step 1: get initial session cookie
  console.log('Getting initial session...');
  const homeResp = await fetchUrl(`${BASE}/public/HomePage`, {});
  const initialCookies = parseCookies(homeResp);
  let jar = extractCookieJar(initialCookies);

  // Step 2: authenticate
  console.log('Authenticating...');
  const loginBody = new URLSearchParams({
    j_email: user,
    j_password: pass,
  }).toString();
  const loginResp = await fetchUrl(`${BASE}/authen/HomePage?fs=HomePage`, {
    method: 'POST',
    body: loginBody,
    cookies: jar,
    headers: { 'Referer': `${BASE}/public/HomePage` },
  });
  const loginCookies = parseCookies(loginResp);
  if (loginCookies.length > 0) {
    jar = extractCookieJar([...initialCookies, ...loginCookies]);
  }

  // Verify auth success — no error modal expected
  if (loginResp.body.includes('unknown in Equasis')) {
    console.error('AUTH FAILED: credentials unknown in Equasis. Register the account first.');
    console.error('Register at: https://www.equasis.org/EquasisWeb/public/ConditionsRegistration');
    process.exit(1);
  }
  console.log('Auth OK.');

  // Step 3: fetch each IMO
  const results: EquasisFields[] = [];
  for (const imo of DEMO_IMOS) {
    console.log(`Fetching IMO ${imo}...`);
    await sleep(DELAY_MS);
    try {
      const resp = await fetchUrl(
        `${BASE}/restricted/ShipInfo?fs=Search&P_IMO=${imo}`,
        { cookies: jar, headers: { 'Referer': `${BASE}/restricted/Search?fs=HomePage` } }
      );
      if (resp.body.includes('session has expired') || resp.body.includes('Please Login')) {
        console.error(`  Session expired at IMO ${imo} — re-run script`);
        results.push({ imo, flag: null, yearBuilt: null, classSociety: null, pandi: null,
          fetchedAt: new Date().toISOString(), error: 'session_expired' });
        continue;
      }
      const fields = parseShipInfo(resp.body, imo);
      console.log(`  flag=${fields.flag} year=${fields.yearBuilt} class=${fields.classSociety} pandi=${fields.pandi}`);
      results.push(fields);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ERROR ${imo}: ${msg}`);
      results.push({ imo, flag: null, yearBuilt: null, classSociety: null, pandi: null,
        fetchedAt: new Date().toISOString(), error: msg });
    }
  }

  // Write output
  const outPath = path.join(process.cwd(), 'lib/sample-data/equasis-enrichment.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nDone. Results: ${outPath}`);
  console.log('Review equasis-enrichment.json, then run backfill-equasis.ts to patch demo-parsed-vessels.json');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
