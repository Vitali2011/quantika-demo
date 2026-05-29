import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = process.env.SMOKE_BASE_URL || 'https://demo.quantika.org';
const OUTDIR = process.env.SMOKE_OUTDIR || '/tmp/smoke-out';
const PR = process.env.SMOKE_PR || 'manual';
const TIMEOUT = parseInt(process.env.SMOKE_TIMEOUT || '15000', 10);

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
const results = [];

for (const r of ROUTES) {
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

  const consoleErrorsFiltered = consoleErrors.filter(e =>
    !/favicon|sentry|chunk|Failed to load resource: the server responded with a status of 4\d{2}/i.test(e)
  );
  const statusOK = status >= 200 && status < 400;
  const pass = !error && statusOK && markers.length === 0 && consoleErrorsFiltered.length === 0;

  results.push({
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
  });
  await page.close();
}

await browser.close();

const summary = {
  pr: PR,
  base_url: BASE,
  timestamp: new Date().toISOString(),
  routes_checked: results.length,
  routes_passed: results.filter(r => r.pass).length,
  routes_failed: results.filter(r => !r.pass).length,
  overall: results.every(r => r.pass) ? 'PASS' : 'FAIL',
  results,
};

fs.writeFileSync(path.join(OUTDIR, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.overall === 'PASS' ? 0 : 1);
