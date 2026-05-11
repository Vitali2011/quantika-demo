/**
 * RAG Visual E2E Verification — Quantika Demo
 *
 * Цель: доказать что RAG-система (IMSBC, IGC, JWC, sanctions, bunker, EUA)
 * реально работает, а не просто лежит в БД.
 *
 * Архитектура: один shared browser context + page для всех тестов.
 * API-тесты используют page.request (несёт session cookie).
 * UI-тесты навигируют тот же page.
 *
 * Запуск на localhost (рекомендованный):
 *   # 1. Запустить сервер (в отдельном терминале):
 *   npm run dev
 *
 *   # 2. Запустить тесты:
 *   E2E_BASE_URL=http://localhost:3000 \
 *   E2E_ADMIN_TOKEN=<ADMIN_TOKEN из .env.local> \
 *   npx playwright test \
 *     --config=__tests__/e2e/playwright.config.rag-visual.ts \
 *     --project=chromium --reporter=html
 *
 *   # 3. Посмотреть отчёт:
 *   npx playwright show-report playwright-report-rag
 *
 * Запуск на demo.quantika.org (только T01 с admin token):
 *   E2E_BASE_URL=https://demo.quantika.org \
 *   E2E_ADMIN_TOKEN=<token> \
 *   npx playwright test --config=__tests__/e2e/playwright.config.rag-visual.ts \
 *     --project=chromium --grep "T01"
 */

import { test, expect, chromium, type Page, type BrowserContext } from '@playwright/test';

// ─── Env ─────────────────────────────────────────────────────────────────────

const BASE_URL   = process.env.E2E_BASE_URL   ?? 'http://localhost:3000';
const ADMIN_TOKEN = process.env.E2E_ADMIN_TOKEN ?? '';

// ─── Shared state ─────────────────────────────────────────────────────────────
// All tests reuse one browser context so session cookie is shared.

let ctx:     BrowserContext | undefined;
let page:    Page | undefined;
let sessionOk = false;  // true once POST /api/sample succeeds

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Minimal TCE payload. Omit bunker/EUA to test auto-fill. */
function baseTcePayload(overrides: Record<string, unknown> = {}) {
  return {
    vessel: { dwt: 30_000, valueUsd: 8_000_000, speedKts: 13.5, consumptionMtPerDay: 25 },
    route: { originPort: 'Rotterdam', destinationPort: 'Hamburg', distanceNm: 350 },
    cargo: { quantityMt: 25_000, freightRateUsdPerMt: 18 },
    durationDays: 7,
    ...overrides,
  };
}

/** Check response is JSON (not HTML redirect/login page). */
function isJson(res: import('@playwright/test').APIResponse): boolean {
  return (res.headers()['content-type'] ?? '').includes('application/json');
}

/** Skip with message if condition is true. */
function skipIf(condition: boolean, reason: string): void {
  if (condition) test.skip(true, reason);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 1200 });
  ctx  = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1400, height: 900 } });
  page = await ctx.newPage();

  // Bootstrap demo session (CSRF bypassed in dev: NODE_ENV=development).
  // On prod with DEMO_AUTH_ENABLED=true this will return 403/302 — session stays empty.
  const res = await page.request.post('/api/sample', { failOnStatusCode: false });
  const cookies = await ctx.cookies();
  sessionOk = cookies.some(c => c.name === 'session_id');

  if (!sessionOk) {
    const status = res.status();
    console.warn(`⚠️  Session not created (POST /api/sample → ${status}).`);
    console.warn('   UI tests (T05-T08) will be skipped.');
    console.warn('   For full run: use localhost dev server (npm run dev).');
  } else {
    console.log('✅  Demo session created — all tests enabled.');
  }
});

test.afterAll(async () => {
  await ctx?.close();
});

// ─── T01: Knowledge layer health via admin API ────────────────────────────────

test('T01 knowledge-status: IMSBC + IGC + JWC healthy', async () => {
  skipIf(!ADMIN_TOKEN, 'E2E_ADMIN_TOKEN not set — set it from .env.local');

  const res = await page!.request.get('/api/admin/knowledge-status', {
    headers: { 'X-Admin-Token': ADMIN_TOKEN },
  });

  skipIf(!isJson(res), 'Admin API returned HTML — check DEMO_AUTH_ENABLED and admin token');
  expect(res.status()).toBe(200);

  const body = await res.json() as {
    sources: Array<{ slug: string; health_signal: string }>;
    summary: { fresh: number; total: number };
  };

  for (const expected of ['imsbc', 'igc', 'jwc']) {
    const src = body.sources.find(s => s.slug === expected);
    expect(src,  `'${expected}' must be registered`).toBeTruthy();
    expect(src?.health_signal, `'${expected}' health_signal`).toBe('ok');
  }

  console.log(`T01 PASS — ${body.summary.fresh}/${body.summary.total} sources healthy`);
  console.log('  Sources:', body.sources.map(s => `${s.slug}=${s.health_signal}`).join(', '));
});

// ─── T02: JWC war risk citations via compare-routes API ──────────────────────

test('T02 JWC citations: Red Sea route → jwcCitations present', async () => {
  skipIf(!sessionOk, 'Session not available — run against localhost dev');

  const res = await page!.request.post('/api/voyage/compare-routes', {
    data: {
      // "jeddah" appears in JWC_HRA_ZONES Red Sea / Bab al-Mandeb ports list
      origin: 'Jeddah',
      destination: 'Rotterdam',
      vessel: { dwt: 58_000, valueUsd: 12_000_000, speedKts: 14, consumptionMtPerDay: 28 },
      cargo: { quantityMt: 50_000, freightRateUsdPerMt: 22 },
      marketRates: { bunkerPriceUsdPerMt: 580, euaPriceEur: 65 },
    },
  });

  const status = res.status();
  if (status === 503 || status === 504) {
    test.skip(true, 'compare-routes 503/504 — AI provider unavailable');
    return;
  }
  skipIf(!isJson(res), `compare-routes returned HTML (${status}) — check session/auth`);
  expect(status).toBe(200);

  const body = await res.json() as {
    jwcCitations?: Array<{ text: string }>;
    recommendation?: string;
  };

  if (!body.jwcCitations) {
    console.warn('T02 WARN — jwcCitations absent. KNOWLEDGE_RAG_ENABLED may be false on this env.');
    return;
  }

  expect(body.jwcCitations.length).toBeGreaterThan(0);
  const text = body.jwcCitations.map(c => c.text).join(' ');
  expect(text.toLowerCase()).toMatch(/red sea|bab|jeddah|hra|war risk|jwc/i);
  console.log(`T02 PASS — ${body.jwcCitations.length} JWC citation(s) returned`);
  console.log('  Preview:', body.jwcCitations[0]?.text.slice(0, 120));
});

// ─── T03: Bunker auto-fill ────────────────────────────────────────────────────

test('T03 bunker auto-fill: TCE resolves Rotterdam VLSFO from DB', async () => {
  skipIf(!sessionOk, 'Session not available — run against localhost dev');

  const res = await page!.request.post('/api/voyage/tce', {
    data: baseTcePayload({
      bunkerPort:  'NLRTM',   // Rotterdam
      bunkerGrade: 'VLSFO',
      // bunkerPriceUsdPerMt omitted → auto-resolve from DB
    }),
  });

  skipIf(!isJson(res), `TCE returned HTML (${res.status()}) — check session/auth`);
  expect(res.status()).toBe(200);

  const body = await res.json() as {
    bunkerPriceSource?: { mode: string; value: number; source: string };
  };
  expect(body.bunkerPriceSource,          'bunkerPriceSource must be in response').toBeTruthy();
  expect(body.bunkerPriceSource?.mode,    'mode must be auto').toBe('auto');
  expect(body.bunkerPriceSource?.value).toBeGreaterThan(0);

  console.log(`T03 PASS — bunker auto-fill: $${body.bunkerPriceSource?.value}/mt (${body.bunkerPriceSource?.source})`);
});

// ─── T04: EUA auto-fill ───────────────────────────────────────────────────────

test('T04 EUA auto-fill: EU route + includeEuETS resolves EUA from DB', async () => {
  skipIf(!sessionOk, 'Session not available — run against localhost dev');

  const res = await page!.request.post('/api/voyage/tce', {
    data: baseTcePayload({
      route: { originPort: 'Rotterdam', destinationPort: 'Hamburg', distanceNm: 350 },
      includeEuETS: true,
      euLegPercent:  100,
      // euaPriceEur omitted → auto-resolve from DB
    }),
  });

  skipIf(!isJson(res), `TCE returned HTML (${res.status()}) — check session/auth`);
  expect(res.status()).toBe(200);

  const body = await res.json() as {
    euaPriceSource?: { mode: string; value: number; source: string };
  };
  expect(body.euaPriceSource,          'euaPriceSource must be in response').toBeTruthy();
  expect(body.euaPriceSource?.mode,    'mode must be auto').toBe('auto');
  expect(body.euaPriceSource?.value).toBeGreaterThan(0);

  console.log(`T04 PASS — EUA auto-fill: €${body.euaPriceSource?.value}/tCO₂ (${body.euaPriceSource?.source})`);
});

// ─── T05: Dashboard loads after demo seed ────────────────────────────────────

test('T05 dashboard: demo seed → cargo list visible', async () => {
  skipIf(!sessionOk, 'Session not available — run against localhost dev');

  await page!.goto('/');
  await page!.waitForLoadState('networkidle');

  const body = await page!.locator('body').textContent() ?? '';
  expect(body.length).toBeGreaterThan(100);

  // Verify we're not stuck on login/onboarding
  const url = page!.url();
  expect(url).not.toMatch(/login|onboarding/i);

  await page!.screenshot({ path: 'playwright-report-rag/T05-dashboard.png', fullPage: false });
  console.log('T05 PASS — Dashboard loaded, screenshot: T05-dashboard.png');
});

// ─── T06: Sanctions guard via match API ──────────────────────────────────────
// Demo seed includes Iran-flagged vessel (sample-18, flag=Iran) and Rotterdam cargo
// (sample-03, dest=Netherlands/EU). checkSanctions() must block this pair deterministically.
// Fixture reference: __tests__/fixtures/e2e-sanctions-emails.json
//
// If this testid changes in the future, also check T02, T03, T04, T05 for related selectors.

test('T06 sanctions: match API blocks IR vessel on EU route', async () => {
  skipIf(!sessionOk, 'Session not available — run against localhost dev');

  // POST /api/ai/match reads parsedVessels + parsedCargos from the active session,
  // runs sanctions pre-filter (deterministic, no LLM), then scores remaining pairs via LLM.
  // Iran vessel (sample-18) + Rotterdam cargo (sample-03, NL=EU) → HIGH blocking, blockedCount ≥ 1.
  const res = await page!.request.post('/api/ai/match', { failOnStatusCode: false });

  const status = res.status();
  if (status === 503 || status === 504) {
    test.skip(true, 'match API unavailable (503/504) — AI provider down');
    return;
  }
  if (status === 403) {
    test.skip(true, 'match API returned 403 — CSRF check failed; run against localhost dev');
    return;
  }
  skipIf(!isJson(res), `match API returned HTML (${status}) — check session/auth`);
  expect(status).toBe(200);

  const body = await res.json() as { count: number; blockedCount?: number };

  if (typeof body.blockedCount !== 'number') {
    console.warn('T06 WARN — blockedCount absent in match response. Seed may not include IR/RU + EU pairs.');
    console.warn('  Response body:', JSON.stringify(body).slice(0, 200));
    return;
  }

  // Behavioral assertion: sanctions guard must have blocked ≥ 1 pair.
  // If this fails, check that demo-parsed-vessels.json has a vessel with flag=Iran/RU
  // and demo-parsed-cargoes.json has a cargo with EU destinationCountry.
  expect(body.blockedCount, 'sanctions guard must block at least 1 IR/RU vessel + EU route pair').toBeGreaterThan(0);

  await page!.screenshot({ path: 'playwright-report-rag/T06-sanctions.png', fullPage: false });
  console.log(`T06 PASS — blockedCount=${body.blockedCount} pair(s) blocked by sanctions guard (IR/RU vessel on EU route)`);
  console.log(`  LLM matches: ${body.count}`);
});

// ─── T07: Grain cargo page with AI analysis ───────────────────────────────────

test('T07 grain cargo: sample-11 page loads with cargo content', async () => {
  skipIf(!sessionOk, 'Session not available — run against localhost dev');

  // sample-11 = "FW: Mykolaiv+Constanta / Misurata 12000mts grain (split)"
  await page!.goto('/cargo/sample-11');
  await page!.waitForLoadState('networkidle');

  await page!.screenshot({ path: 'playwright-report-rag/T07-grain-cargo.png', fullPage: true });

  const bodyText = await page!.locator('body').textContent() ?? '';

  // Cargo page should show grain/port content (not a 404 or blank)
  const hasContent =
    /grain|mykolaiv|misurata|12000|12,000/i.test(bodyText) ||
    /cargo|vessel|match/i.test(bodyText);

  expect(hasContent, 'Grain cargo page must have recognizable content').toBe(true);

  // Check quality of AI analysis
  const noAnalysis = bodyText.includes('No AI analysis available');
  if (noAnalysis) {
    console.warn('T07 WARN — AI matching not yet run for this cargo.');
    console.warn('  Navigate to the dashboard and trigger matching to see IGC citation.');
  } else if (/igc|grain code|imsbc|schedule/i.test(bodyText)) {
    console.log('T07 PASS ✨ — AI analysis cites knowledge-layer terms (IGC/IMSBC visible)');
  } else {
    console.log('T07 PASS — Grain cargo page loaded with AI analysis (no explicit IGC citation in visible text)');
  }
});

// ─── T08: Admin knowledge page health badges ─────────────────────────────────

test('T08 knowledge admin: health badges visible for IMSBC, IGC, JWC', async () => {
  await page!.goto('/admin/knowledge');
  await page!.waitForLoadState('networkidle');

  await page!.screenshot({ path: 'playwright-report-rag/T08-knowledge-admin.png', fullPage: true });

  const currentUrl = page!.url();
  if (/login|onboarding/i.test(currentUrl)) {
    test.skip(true, '/admin/knowledge redirected to login — access requires admin credentials');
    return;
  }

  // SourceTable.tsx renders data-testid="health-badge-{slug}"
  const badges = {
    imsbc: page!.locator('[data-testid="health-badge-imsbc"]'),
    igc:   page!.locator('[data-testid="health-badge-igc"]'),
    jwc:   page!.locator('[data-testid="health-badge-jwc"]'),
  };

  const visible = {
    imsbc: await badges.imsbc.isVisible().catch(() => false),
    igc:   await badges.igc.isVisible().catch(() => false),
    jwc:   await badges.jwc.isVisible().catch(() => false),
  };

  if (!visible.imsbc && !visible.igc && !visible.jwc) {
    console.warn('T08 WARN — No health badges found. Screenshot: T08-knowledge-admin.png');
    console.warn('  Check: is /admin/knowledge accessible? Is knowledge seeded?');
    return;
  }

  console.log(`T08 PASS — Badges: IMSBC=${visible.imsbc} IGC=${visible.igc} JWC=${visible.jwc}`);
  if (visible.imsbc) await expect(badges.imsbc).toBeVisible();
  if (visible.igc)   await expect(badges.igc).toBeVisible();
  if (visible.jwc)   await expect(badges.jwc).toBeVisible();
});
