import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// Post-deploy smoke for quantika-demo. RESILIENT BY DESIGN:
//   (a) health gate  — poll /api/health until 200 before judging page routes, so we
//                       wait out the `pm2 restart` window (brief 502s while port 3000
//                       comes back; Caddyfile.demo has no health_uri, so Caddy serves
//                       5xx during that gap). overall=PASS requires health to come up.
//   (b) route retry  — each route retries on TRANSIENT failure only (network error /
//                       status 0 / status >= 5xx). A real 4xx or error-marker page
//                       fails immediately, so genuine regressions are still caught.
// stdout is RESERVED for the final JSON summary (run-quantika.sh captures it). All
// progress/diagnostics go to stderr via log().

const BASE = process.env.SMOKE_BASE_URL || 'https://demo.quantika.org';
const OUTDIR = process.env.SMOKE_OUTDIR || '/tmp/smoke-out';
const PR = process.env.SMOKE_PR || 'manual';
const TIMEOUT = parseInt(process.env.SMOKE_TIMEOUT || '15000', 10);

// Resilience knobs (override via env for manual / non-prod runs).
const HEALTH_PATH = process.env.SMOKE_HEALTH_PATH || '/api/health';
const HEALTH_TIMEOUT_MS = parseInt(process.env.SMOKE_HEALTH_TIMEOUT_MS || '90000', 10);
const HEALTH_INTERVAL_MS = parseInt(process.env.SMOKE_HEALTH_INTERVAL_MS || '3000', 10);
const HEALTH_PROBE_TIMEOUT_MS = parseInt(process.env.SMOKE_HEALTH_PROBE_TIMEOUT_MS || '5000', 10);
const ROUTE_ATTEMPTS = parseInt(process.env.SMOKE_ROUTE_ATTEMPTS || '3', 10);
const ROUTE_BACKOFF_MS = parseInt(process.env.SMOKE_ROUTE_BACKOFF_MS || '3000', 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error('[smoke]', ...a); // stderr — stdout is the JSON summary

const ROUTES_DEFAULT = [
  { p: '/',       n: 'landing' },
  { p: '/cargo',  n: 'cargo'   },
  { p: '/vessel', n: 'vessel'  },
  { p: '/match',  n: 'match'   },
  { p: '/login',  n: 'login'   },
];
const ROUTES = process.env.SMOKE_ROUTES
  ? process.env.SMOKE_ROUTES.split(',').map(s => ({ p: s.trim(), n: s.trim().replace(/[\/]/g,'_') || 'root' }))
  : ROUTES_DEFAULT;

const ERROR_MARKERS = [
  'application error',
  'internal server error',
  'unhandled',
  'stack trace',
  'this page could not be found',
  'next.js error',
];

fs.mkdirSync(OUTDIR, { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

// (a) Health gate: wait out the pm2 restart window before judging page routes.
async function waitForHealthy() {
  const start = Date.now();
  let attempts = 0;
  let lastError = null;
  while (Date.now() - start < HEALTH_TIMEOUT_MS) {
    attempts++;
    try {
      const res = await ctx.request.get(BASE + HEALTH_PATH, { timeout: HEALTH_PROBE_TIMEOUT_MS });
      if (res.ok()) {
        const waited = Date.now() - start;
        log(`health OK after ${attempts} attempt(s), ${waited}ms`);
        return { healthy: true, attempts, waited_ms: waited, last_error: null };
      }
      lastError = `status ${res.status()}`;
    } catch (e) {
      lastError = String(e.message || e);
    }
    log(`health not ready (attempt ${attempts}): ${lastError} — retry in ${HEALTH_INTERVAL_MS}ms`);
    await sleep(HEALTH_INTERVAL_MS);
  }
  const waited = Date.now() - start;
  log(`health NEVER came up after ${attempts} attempt(s), ${waited}ms (last: ${lastError})`);
  return { healthy: false, attempts, waited_ms: waited, last_error: lastError };
}

// One attempt at a single route. Returns the same shape the summary expects.
async function checkRouteOnce(r) {
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  const start = Date.now();
  let status = 0, error = null, bodyText = '', markers = [], shotPath = null;
  try {
    const resp = await page.goto(BASE + r.p, { waitUntil: 'networkidle', timeout: TIMEOUT });
    status = resp ? resp.status() : 0;
    bodyText = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 4000) : '');
    const lower = bodyText.toLowerCase();
    markers = ERROR_MARKERS.filter(m => lower.includes(m));
    shotPath = path.join(OUTDIR, r.n + '.png');
    await page.screenshot({ path: shotPath, fullPage: true });
  } catch (e) {
    error = String(e.message || e);
  }
  const duration = Date.now() - start;
  await page.close();

  const consoleErrorsFiltered = consoleErrors.filter(e =>
    !/favicon|sentry|chunk|Failed to load resource: the server responded with a status of 4\d{2}/i.test(e)
  );
  const statusOK = status >= 200 && status < 400;
  const pass = !error && statusOK && markers.length === 0 && consoleErrorsFiltered.length === 0;

  return {
    route: r.p,
    name: r.n,
    status,
    duration_ms: duration,
    pass,
    error,
    error_markers: markers,
    console_errors: consoleErrorsFiltered.slice(0, 5),
    screenshot: shotPath,
    body_preview: bodyText.slice(0, 200),
  };
}

// Transient = the restart tail (worth retrying), NOT a real regression. A 4xx, an
// error-marker page, or console errors on a live page are real and fail immediately.
const isTransient = (res) => !!res.error || res.status === 0 || res.status >= 500;

// (b) Per-route check with retry/backoff on transient failures only.
async function checkRoute(r) {
  let res;
  for (let attempt = 1; attempt <= ROUTE_ATTEMPTS; attempt++) {
    res = await checkRouteOnce(r);
    if (res.pass || !isTransient(res) || attempt === ROUTE_ATTEMPTS) {
      res.attempts = attempt;
      return res;
    }
    const backoff = ROUTE_BACKOFF_MS * attempt; // linear: 3s, 6s, ...
    log(`route ${r.p} transient fail (attempt ${attempt}/${ROUTE_ATTEMPTS}): status=${res.status} error=${res.error || ''} — retry in ${backoff}ms`);
    await sleep(backoff);
  }
  res.attempts = ROUTE_ATTEMPTS;
  return res;
}

const health = await waitForHealthy();

const results = [];
for (const r of ROUTES) {
  results.push(await checkRoute(r));
}

await browser.close();

const routesPass = results.every(r => r.pass);
const summary = {
  pr: PR,
  base_url: BASE,
  timestamp: new Date().toISOString(),
  health,
  routes_checked: results.length,
  routes_passed: results.filter(r => r.pass).length,
  routes_failed: results.filter(r => !r.pass).length,
  // overall = app reports healthy AND every user-facing route renders.
  overall: (health.healthy && routesPass) ? 'PASS' : 'FAIL',
  results,
};

fs.writeFileSync(path.join(OUTDIR, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.overall === 'PASS' ? 0 : 1);
