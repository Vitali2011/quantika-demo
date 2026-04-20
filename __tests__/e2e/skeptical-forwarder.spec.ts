/**
 * Skeptical Forwarder Audit — demo.quantika.org
 *
 * Role: 15-year veteran freight forwarder who trusts nothing until verified.
 * Approach: cross-check every rendered field against:
 *   1. lib/sample-data/*.json  — original email bodies
 *   2. __tests__/fixtures/test-suite-50/expected.json — pipeline expected output
 *   3. Domain logic — IMO checksum, DWCC/DWT consistency, laycan sanity, draft constraints
 *
 * Architecture note: all tests share ONE browser context/page (sequential).
 * The pipeline is started once in the first test; subsequent tests navigate
 * directly to item URLs within the same session cookie.
 */

import { test, expect, type Page, type BrowserContext, chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Finding {
  severity: 'SUSPECT' | 'FAIL' | 'INFO';
  emailId: string;
  field: string;
  expected: string;
  actual: string;
  evidence: string;
}

interface ExpectedItem {
  id: string;
  category: string;
  status?: string;
  test_category?: string;
  extracted?: Record<string, unknown>;
  hard_filters?: Record<string, unknown>;
  match_expectation?: {
    should_match_vessel_dwt_range_mt?: [number, number];
    expected_level_range?: string[];
    expected_score_min?: number;
  };
  adversarial_expectation?: {
    type: string;
    should_flag: boolean;
    detail: string;
    [key: string]: unknown;
  } | null;
  notes?: string;
}

interface SampleEmail {
  id: string;
  subject: string;
  body: string;
  from?: string;
  fromName?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** IMO number mod-10 checksum validation.
 *  Digits d1..d6 × weights 7..2, sum mod 10 = last digit.
 */
function validateImoChecksum(imo: string | number): boolean {
  const s = String(imo).replace(/\D/g, '');
  if (s.length !== 7) return false;
  const weights = [7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 6; i++) {
    sum += parseInt(s[i], 10) * weights[i];
  }
  return (sum % 10) === parseInt(s[6], 10);
}

/** Parse a date string like "2026-09-15" → Date */
function parseDate(s: string): Date | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Load JSON file from the main repo root (~/work/quantika-demo/).
 *  __dirname = e2e-playwright/__tests__/e2e
 *  worktreeRoot = e2e-playwright/
 *  repoRoot = worktreeRoot/../../../ = ~/work/quantika-demo
 */
function loadJson<T>(relPath: string): T {
  const worktreeRoot = path.resolve(__dirname, '../..');
  const repoRoot = path.resolve(worktreeRoot, '../../..');
  const fullPath = path.join(repoRoot, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Fixture file not found: ${fullPath} (repoRoot: ${repoRoot})`);
  }
  return JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as T;
}

// ─── Shared state ─────────────────────────────────────────────────────────────

const findings: Finding[] = [];
let checksTotal = 0;
let pipelineSucceeded = false;

// Shared context/page for the entire describe block
let sharedContext: BrowserContext;
let sharedPage: Page;

function addFinding(f: Finding): void {
  findings.push(f);
  const icon = f.severity === 'FAIL' ? '🔴 FAIL' : f.severity === 'SUSPECT' ? '🟡 SUSPECT' : '🔵 INFO';
  console.log(`  ${icon} [${f.emailId}] ${f.field}`);
  console.log(`       expected: ${f.expected}`);
  console.log(`       actual:   ${f.actual}`);
  if (f.evidence) console.log(`       evidence: ${f.evidence.substring(0, 200)}`);
}

function check(
  emailId: string,
  field: string,
  condition: boolean,
  expected: string,
  actual: string,
  evidence: string,
  severity: Finding['severity'] = 'SUSPECT',
): void {
  checksTotal++;
  if (!condition) {
    addFinding({ severity, emailId, field, expected, actual, evidence });
  }
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

test.describe('Skeptical forwarder audit — demo.quantika.org', () => {
  let expectedData: ExpectedItem[];
  let cargoSamples: SampleEmail[];
  let vesselSamples: SampleEmail[];
  let fixtureSamples: SampleEmail[];

  test.beforeAll(async ({ browser }) => {
    // Load fixtures
    expectedData = loadJson<ExpectedItem[]>('__tests__/fixtures/test-suite-50/expected.json');
    cargoSamples = loadJson<SampleEmail[]>('lib/sample-data/cargo-inquiries.json');
    vesselSamples = loadJson<SampleEmail[]>('lib/sample-data/vessel-positions.json');
    fixtureSamples = loadJson<SampleEmail[]>('lib/sample-data/fixture-recaps.json');

    console.log(`\n=== Skeptical Forwarder Audit ===`);
    console.log(`Loaded ${expectedData.length} expected items`);
    console.log(`Loaded ${cargoSamples.length} cargo, ${vesselSamples.length} vessel, ${fixtureSamples.length} fixture samples`);

    // Create shared context with cookie persistence
    sharedContext = await browser.newContext({
      baseURL: 'https://demo.quantika.org',
    });
    sharedPage = await sharedContext.newPage();

    // Start pipeline
    console.log('\nStarting pipeline...');
    await sharedPage.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 });

    const sampleBtn = sharedPage.locator('button:has-text("Try with Sample Data"), button[type="submit"]').filter({ hasText: 'Sample' });
    await sampleBtn.waitFor({ state: 'visible', timeout: 10000 });
    await sampleBtn.click();

    // Wait for redirect to /processing, then /dashboard
    try {
      await sharedPage.waitForURL('**/processing', { timeout: 15000 });
      console.log('On /processing page, waiting for LLM pipeline...');
      await sharedPage.waitForURL('**/dashboard', { timeout: 150000 });
      pipelineSucceeded = true;
      console.log('Pipeline complete! On /dashboard.');
    } catch (e) {
      const errorEl = sharedPage.locator('[class*="text-red"], [class*="error"], [class*="fatal"]');
      const errorText = await errorEl.textContent().catch(() => null);
      console.error(`Pipeline failed: ${e instanceof Error ? e.message : String(e)}`);
      if (errorText) console.error(`Error on page: ${errorText}`);
      addFinding({
        severity: 'FAIL',
        emailId: 'PIPELINE',
        field: 'pipeline_completion',
        expected: 'redirect to /dashboard within 150s',
        actual: errorText || 'no redirect',
        evidence: 'Pipeline failed to complete — all downstream checks are running but may be invalid',
      });
    }
  });

  test.afterAll(async () => {
    if (sharedContext) await sharedContext.close();
    writeReport();
  });

  function writeReport(): void {
    const suspects = findings.filter(f => f.severity === 'SUSPECT');
    const fails = findings.filter(f => f.severity === 'FAIL');
    const infos = findings.filter(f => f.severity === 'INFO');

    const report: string[] = [
      '# Skeptical Forwarder Audit Report',
      '',
      `**Date:** ${new Date().toISOString()}`,
      `**Target:** https://demo.quantika.org`,
      `**Pipeline status:** ${pipelineSucceeded ? 'COMPLETED' : 'FAILED/TIMEOUT'}`,
      `**Expected data:** __tests__/fixtures/test-suite-50/expected.json (50 emails)`,
      '',
      '## Summary',
      '',
      `| Metric | Count |`,
      `|--------|-------|`,
      `| Total checks | ${checksTotal} |`,
      `| FAIL | ${fails.length} |`,
      `| SUSPECT | ${suspects.length} |`,
      `| INFO | ${infos.length} |`,
      '',
      '## Verdict',
      '',
    ];

    if (!pipelineSucceeded) {
      report.push('**PIPELINE UNSTABLE** — Pipeline did not complete successfully. Results below may be invalid.');
    } else if (fails.length === 0 && suspects.length === 0) {
      report.push('**CLEAN PASS** — No issues found. Either the pipeline is unusually accurate, or the UI does not expose enough data for deeper verification.');
    } else if (fails.length > 0) {
      report.push(`**NEEDS ATTENTION** — ${fails.length} hard failures found. These represent definitive data quality issues.`);
    } else {
      report.push(`**CAUTION** — No hard failures, but ${suspects.length} suspicious findings require manual review.`);
    }

    report.push('', '## FAIL — Hard Failures', '');
    if (fails.length === 0) {
      report.push('_None_');
    } else {
      for (const f of fails) {
        report.push(`### [${f.emailId}] ${f.field}`);
        report.push(`- **Expected:** ${f.expected}`);
        report.push(`- **Actual:** ${f.actual}`);
        report.push(`- **Evidence:** ${f.evidence}`);
        report.push('');
      }
    }

    report.push('', '## SUSPECT — Requires Investigation', '');
    if (suspects.length === 0) {
      report.push('_None_');
    } else {
      for (const f of suspects) {
        report.push(`### [${f.emailId}] ${f.field}`);
        report.push(`- **Expected:** ${f.expected}`);
        report.push(`- **Actual:** ${f.actual}`);
        report.push(`- **Evidence:** ${f.evidence}`);
        report.push('');
      }
    }

    report.push('', '## INFO — Notes', '');
    for (const f of infos) {
      report.push(`- **[${f.emailId}] ${f.field}:** ${f.actual}`);
      report.push(`  - expected: ${f.expected}`);
      report.push(`  - evidence: ${f.evidence.substring(0, 300)}`);
    }

    report.push('', '## IMO Checksum Reference', '');
    report.push('IMO 1234566 (sample-37) expected checksum computation:');
    report.push('- Digits: 1 2 3 4 5 6 | check=6');
    report.push('- Sum: 1×7 + 2×6 + 3×5 + 4×4 + 5×3 + 6×2 = 7+12+15+16+15+12 = 77');
    report.push('- 77 mod 10 = 7 ≠ last digit 6 → **INVALID**');
    report.push('- App MUST refuse Equasis enrichment for this IMO');

    report.push('', '## Adversarial Cases Checked', '');
    const adversarialIds = [
      'sample-12', 'sample-15', 'sample-18', 'sample-19', 'sample-20',
      'sample-21', 'sample-22', 'sample-23', 'sample-24',
      'sample-33', 'sample-34', 'sample-35', 'sample-37', 'sample-38', 'sample-39',
      'sample-41', 'sample-44', 'sample-45', 'sample-47',
    ];
    for (const id of adversarialIds) {
      const relatedFindings = findings.filter(f => f.emailId === id);
      const status = relatedFindings.length === 0 ? '✅ No findings' :
        relatedFindings.some(f => f.severity === 'FAIL') ? '🔴 FAIL' :
          relatedFindings.some(f => f.severity === 'SUSPECT') ? '🟡 SUSPECT' : '🔵 INFO only';
      report.push(`### ${id} — ${status}`);
      if (relatedFindings.length > 0) {
        for (const f of relatedFindings) {
          report.push(`- **[${f.severity}] ${f.field}:** ${f.actual}`);
        }
      }
      report.push('');
    }

    const reportPath = path.resolve(__dirname, 'skeptical-report.md');
    fs.writeFileSync(reportPath, report.join('\n'), 'utf-8');

    console.log('\n' + '='.repeat(60));
    console.log('SKEPTICAL FORWARDER AUDIT COMPLETE');
    console.log('='.repeat(60));
    console.log(`Pipeline: ${pipelineSucceeded ? 'OK' : 'FAILED'}`);
    console.log(`Total checks: ${checksTotal}`);
    console.log(`FAIL:    ${fails.length}`);
    console.log(`SUSPECT: ${suspects.length}`);
    console.log(`INFO:    ${infos.length}`);
    console.log(`Report: ${reportPath}`);
    console.log('='.repeat(60) + '\n');
  }

  // ── Test 1: Header counter ──────────────────────────────────────────────────

  test('50 emails processed — header counter check', async () => {
    if (!pipelineSucceeded) { test.skip(); return; }

    const subtitle = sharedPage.locator('p:has-text("emails processed")');
    await expect(subtitle).toBeVisible({ timeout: 10000 });
    const subtitleText = await subtitle.textContent() || '';
    const match = subtitleText.match(/(\d+)\s+emails processed/);
    const uiCount = match ? parseInt(match[1], 10) : -1;

    check(
      'PIPELINE',
      'email_count',
      uiCount === 50,
      '50',
      String(uiCount),
      `Header text: "${subtitleText.trim()}"`,
      'FAIL',
    );
    console.log(`  Email count in UI: ${uiCount}`);
  });

  // ── Test 2: Inbox breakdown sum ─────────────────────────────────────────────

  test('full inbox breakdown numbers sum to 50', async () => {
    if (!pipelineSucceeded) { test.skip(); return; }

    // Ensure we're on dashboard
    if (!sharedPage.url().includes('/dashboard')) {
      await sharedPage.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 20000 });
    }

    const details = sharedPage.locator('details').filter({ hasText: 'Full Inbox Breakdown' }).first();
    await expect(details).toBeVisible({ timeout: 10000 });
    const isOpen = await details.getAttribute('open');
    if (isOpen === null) {
      // Use first() on the summary to avoid strict mode violation on nested summaries
      await details.locator('summary').first().click();
      await sharedPage.waitForTimeout(400);
    }

    const rows = await details.locator('summary div.space-y-1 > div').all();
    let total = 0;
    const breakdown: Record<string, number> = {};

    for (const row of rows) {
      const text = await row.textContent() || '';
      const nums = text.match(/(\d+)\s*$/);
      if (nums) {
        const n = parseInt(nums[1], 10);
        total += n;
        const label = text.replace(/\d+\s*$/, '').trim();
        breakdown[label] = n;
      }
    }

    console.log(`  Inbox breakdown: ${JSON.stringify(breakdown)}, total=${total}`);

    check(
      'DASHBOARD',
      'inbox_breakdown_sum',
      total === 50,
      '50',
      String(total),
      `Breakdown: ${JSON.stringify(breakdown)}`,
      'FAIL',
    );
  });

  // ── Test 3: Cargo inquiries ─────────────────────────────────────────────────

  test('cargo inquiries: every item matches expected.json fields', async () => {
    if (!pipelineSucceeded) { test.skip(); return; }

    const cargoExpected = expectedData.filter(e => e.category === 'CARGO_INQUIRY');
    console.log(`\n  Auditing ${cargoExpected.length} cargo inquiries...`);

    for (const expected of cargoExpected) {
      const url = `https://demo.quantika.org/cargo/${expected.id}`;
      await sharedPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sharedPage.waitForTimeout(500);

      const pageText = await sharedPage.locator('main').textContent().catch(() => '') || '';
      const originalSample = cargoSamples.find(s => s.id === expected.id);
      const bodyText = originalSample?.body || '';
      const ext = expected.extracted || {};

      // Check: Load port visible in UI
      if (ext.loadPort && typeof ext.loadPort === 'object') {
        const lp = ext.loadPort as { name: string; country: string };
        const portVisible = pageText.toLowerCase().includes(lp.name.toLowerCase());
        check(
          expected.id,
          'loadPort_visible',
          portVisible,
          lp.name,
          portVisible ? 'visible' : 'NOT visible',
          `Load port "${lp.name}" from expected.json`,
          'SUSPECT',
        );
      }

      // Check: Disch port visible
      if (ext.dischPort && typeof ext.dischPort === 'object') {
        const dp = ext.dischPort as { name: string };
        const portVisible = pageText.toLowerCase().includes(dp.name.toLowerCase());
        check(
          expected.id,
          'dischPort_visible',
          portVisible,
          dp.name,
          portVisible ? 'visible' : 'NOT visible',
          `Disch port "${dp.name}" from expected.json`,
          'SUSPECT',
        );
      }

      // Check: Laycan direction (expected.json dates)
      const laycan = ext.laycan as { start?: string; end?: string } | undefined;
      if (laycan?.start && laycan?.end) {
        const start = parseDate(laycan.start);
        const end = parseDate(laycan.end);
        if (start && end) {
          check(
            expected.id,
            'laycan_direction',
            end >= start,
            `end ${laycan.end} >= start ${laycan.start}`,
            `start=${laycan.start} end=${laycan.end}`,
            `Laycan from expected.json`,
            'FAIL',
          );
        }
      }

      // Check: Adversarial flags
      if (expected.adversarial_expectation?.should_flag) {
        const adv = expected.adversarial_expectation;

        if (adv.type === 'inverted_laycan') {
          const hasWarning = pageText.toLowerCase().includes('stale') ||
            pageText.toLowerCase().includes('inverted') ||
            pageText.includes('⚠️') ||
            pageText.toLowerCase().includes('warning');
          check(expected.id, 'inverted_laycan_flagged', hasWarning,
            'warning/stale indicator', hasWarning ? 'shown' : 'NOT shown', adv.detail, 'SUSPECT');
        }

        if (adv.type === 'stale_date') {
          const hasStale = pageText.toLowerCase().includes('stale') || pageText.includes('⚠️');
          check(expected.id, 'stale_date_flagged', hasStale,
            'STALE indicator', hasStale ? 'shown' : 'NOT shown', adv.detail, 'SUSPECT');
        }

        if (adv.type === 'sanctions_flag') {
          const hasSanctions = pageText.toLowerCase().includes('sanction') ||
            pageText.toLowerCase().includes('blocked') ||
            pageText.toLowerCase().includes('risk');
          check(expected.id, 'sanctions_flagged', hasSanctions,
            'sanctions/risk indicator', hasSanctions ? 'shown' : 'NOT shown', adv.detail, 'SUSPECT');
        }

        if (adv.type === 'volume_overflow') {
          const hasMatch = pageText.includes('GOOD MATCH') || pageText.includes('POSSIBLE MATCH');
          check(expected.id, 'volume_overflow_no_match', !hasMatch,
            'no vessel match', hasMatch ? 'HAS MATCH (pipeline bug)' : 'no match (correct)', adv.detail, 'FAIL');
        }

        if (adv.type === 'draft_fail') {
          const hasDraftFail = (pageText.toLowerCase().includes('draft') &&
            (pageText.toLowerCase().includes('fail') ||
              pageText.toLowerCase().includes('constraint') ||
              pageText.toLowerCase().includes('blocked')));
          check(expected.id, 'draft_constraint_fail_shown', hasDraftFail,
            'draft constraint fail shown', hasDraftFail ? 'shown' : 'NOT shown — check for spurious match',
            adv.detail, 'SUSPECT');
        }

        if (adv.type === 'cargo_contradiction') {
          const hasMismatch = pageText.toLowerCase().includes('mismatch') ||
            pageText.toLowerCase().includes('contradiction') ||
            pageText.toLowerCase().includes('warning') ||
            pageText.includes('⚠️');
          check(expected.id, 'cargo_contradiction_flagged', hasMismatch,
            'contradiction/mismatch flag', hasMismatch ? 'shown' : 'NOT shown', adv.detail, 'SUSPECT');
        }
      }

      // Skeptical weight midpoint check
      const cargo = ext.cargo as { weight_mt?: number } | undefined;
      if (cargo?.weight_mt && bodyText) {
        const abtMatch = bodyText.match(/abt\s+([\d,]+)\s*\/\s*([\d,]+)\s*mts?/i);
        if (abtMatch) {
          const min = parseInt(abtMatch[1].replace(/,/g, ''), 10);
          const max = parseInt(abtMatch[2].replace(/,/g, ''), 10);
          const midpoint = Math.round((min + max) / 2);
          if (max > min && Math.abs(cargo.weight_mt - midpoint) > 50) {
            addFinding({
              severity: 'SUSPECT',
              emailId: expected.id,
              field: 'weight_midpoint_assumption',
              expected: `midpoint ${midpoint} (from "abt ${min}/${max}")`,
              actual: String(cargo.weight_mt),
              evidence: `Body: "${abtMatch[0]}". expected.json: ${cargo.weight_mt}mt. Midpoint would be ${midpoint}mt`,
            });
          }
        }
      }

      await sharedPage.waitForTimeout(150);
    }
  });

  // ── Test 4: Vessel positions ────────────────────────────────────────────────

  test('vessel positions: IMO checksums and DWT/DWCC consistency', async () => {
    if (!pipelineSucceeded) { test.skip(); return; }

    const vesselExpected = expectedData.filter(e => e.category === 'VESSEL_POSITION');
    console.log(`\n  Auditing ${vesselExpected.length} vessel positions...`);

    for (const expected of vesselExpected) {
      const url = `https://demo.quantika.org/vessel/${expected.id}`;
      await sharedPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sharedPage.waitForTimeout(400);

      const pageText = await sharedPage.locator('main').textContent().catch(() => '') || '';
      const ext = expected.extracted || {};
      const imoExpected = ext.imo as number | undefined;
      const originalSample = vesselSamples.find(s => s.id === expected.id);
      const bodyText = originalSample?.body || '';

      // IMO checksum verification
      if (imoExpected) {
        const imoValid = validateImoChecksum(imoExpected);
        const isKnownInvalid = expected.adversarial_expectation?.type === 'invalid_imo';

        if (isKnownInvalid) {
          // sample-37: must be flagged in UI
          const hasFlaggedUI = pageText.toLowerCase().includes('invalid') ||
            pageText.toLowerCase().includes('fail') ||
            pageText.toLowerCase().includes('checksum') ||
            pageText.includes('⚠️');
          check(expected.id, 'invalid_imo_flagged_in_ui', hasFlaggedUI,
            'invalid IMO flagged', hasFlaggedUI ? 'flagged' : 'NOT flagged — green check on bad IMO',
            `${expected.adversarial_expectation?.detail}`, 'FAIL');

          // Verify our own computation
          check(expected.id, 'imo_mod10_fails', !imoValid,
            'mod-10 fails (expected)', imoValid ? 'PASSES (unexpected!)' : 'fails (correct)',
            `IMO ${imoExpected}`, 'INFO');
        } else {
          // Valid IMO — our checksum should pass
          check(expected.id, 'imo_mod10_valid', imoValid,
            'mod-10 passes', imoValid ? 'passes' : `FAILS for IMO ${imoExpected}`,
            `IMO ${imoExpected}`, imoValid ? 'INFO' : 'SUSPECT');
        }
      }

      // DWT vs DWCC consistency from body
      const dwtMatch = bodyText.match(/DWT[:\s]+([\d,]+)\s*mts?/i);
      const dwccMatch = bodyText.match(/DWCC[:\s]+([\d,]+)\s*mts?/i);
      if (dwtMatch && dwccMatch) {
        const dwt = parseInt(dwtMatch[1].replace(/,/g, ''), 10);
        const dwcc = parseInt(dwccMatch[1].replace(/,/g, ''), 10);
        check(expected.id, 'dwcc_lte_dwt', dwcc <= dwt,
          `DWCC(${dwcc}) ≤ DWT(${dwt})`, `DWCC=${dwcc} DWT=${dwt}`,
          `Body: "${dwtMatch[0]}" and "${dwccMatch[0]}"`, 'FAIL');
      }

      // Stale position
      if (expected.adversarial_expectation?.type === 'stale_position') {
        const hasStale = pageText.toLowerCase().includes('stale') || pageText.includes('⚠️');
        check(expected.id, 'stale_vessel_flagged', hasStale,
          'stale indicator', hasStale ? 'shown' : 'NOT shown',
          expected.adversarial_expectation.detail, 'SUSPECT');
      }

      // Hallucinated vessel — note it
      if (expected.adversarial_expectation?.type === 'hallucinated_vessel') {
        addFinding({
          severity: 'INFO',
          emailId: expected.id,
          field: 'hallucinated_vessel_pattern',
          expected: 'Equasis lookup returns different/no vessel for sequential suffix name',
          actual: pageText.includes(String(imoExpected)) ? `IMO ${imoExpected} shown in UI` : 'IMO not shown',
          evidence: expected.adversarial_expectation.detail,
        });
      }

      // Cargo restrictions limiting match pool
      if (expected.adversarial_expectation?.type === 'cargo_restriction_blocks_match') {
        addFinding({
          severity: 'INFO',
          emailId: expected.id,
          field: 'cargo_restrictions_match_pool',
          expected: 'very limited matches due to restrictions',
          actual: pageText.includes('MATCH') ? 'has matches' : 'no matches shown',
          evidence: expected.adversarial_expectation.detail,
        });
      }

      await sharedPage.waitForTimeout(150);
    }
  });

  // ── Test 5: Fixture recaps ──────────────────────────────────────────────────

  test('fixture recaps: currency integrity and hedged commission flags', async () => {
    if (!pipelineSucceeded) { test.skip(); return; }

    const fixtureExpected = expectedData.filter(e => e.category === 'FIXTURE_RECAP');
    console.log(`\n  Auditing ${fixtureExpected.length} fixture recaps...`);

    for (const expected of fixtureExpected) {
      const url = `https://demo.quantika.org/fixture/${expected.id}`;
      await sharedPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sharedPage.waitForTimeout(400);

      const pageText = await sharedPage.locator('main').textContent().catch(() => '') || '';
      const originalSample = fixtureSamples.find(s => s.id === expected.id);
      const bodyText = originalSample?.body || '';
      const ext = expected.extracted || {};

      // sample-41: EUR currency must NOT be shown as USD
      if (expected.id === 'sample-41') {
        const freight = ext.freight as { currency?: string; amount?: number } | undefined;
        const bodyHasEur = bodyText.includes('EUR');
        const uiHasEur = pageText.includes('EUR');
        const uiHasUsd = pageText.includes('USD') || (pageText.includes('$') && !pageText.includes('EUR'));

        check(expected.id, 'sample41_freight_currency_EUR', uiHasEur,
          'EUR visible in freight section',
          uiHasEur ? 'EUR shown' : 'EUR NOT shown',
          `Body says "EUR 31.00/mt FIOST". bodyHasEur=${bodyHasEur}, uiHasEur=${uiHasEur}, uiHasUsd=${uiHasUsd}`,
          'FAIL');

        if (uiHasUsd && !uiHasEur) {
          addFinding({
            severity: 'FAIL',
            emailId: expected.id,
            field: 'sample41_currency_silently_converted',
            expected: 'EUR (explicitly stated in body)',
            actual: 'USD shown — silent currency conversion bug',
            evidence: `Body: "Freight: EUR 31.00/mt FIOST". Classic LLM error: treats all amounts as USD.`,
          });
        }

        // Also check demurrage currency
        const bodyHasEurDem = bodyText.includes('EUR 5,500');
        const uiHasEurDem = pageText.includes('EUR') && pageText.includes('5,500');
        addFinding({
          severity: 'INFO',
          emailId: expected.id,
          field: 'sample41_demurrage_currency',
          expected: 'EUR 5,500 PDPR',
          actual: uiHasEurDem ? 'EUR 5,500 shown' : `demurrage shown as: ${pageText.match(/[Dd]emurrage[\s\S]{0,80}/)?.[0]?.substring(0, 60) || 'not visible'}`,
          evidence: `Body: "Demurrage: EUR 5,500 PDPR"`,
        });
      }

      // sample-44: hedged commission
      if (expected.id === 'sample-44' && expected.adversarial_expectation?.type === 'hedged_commission') {
        const adv = expected.adversarial_expectation;
        const hasHedge = pageText.includes('abt') ||
          pageText.toLowerCase().includes('subject') ||
          pageText.toLowerCase().includes('approximately') ||
          pageText.includes('~');
        const showsPlain375 = pageText.includes('3.75%') && !hasHedge;

        check(expected.id, 'sample44_hedged_commission_indicator', !showsPlain375,
          'NOT plain 3.75% without hedge indicator',
          showsPlain375 ? '3.75% shown without qualifier (hedging lost)' : hasHedge ? 'hedge qualifier shown' : '3.75% not shown',
          `Body: "${adv.commission_text}". Commission is hedged "subject to closing" — must show qualifier`,
          'SUSPECT');
      }

      // sample-45: rate placeholder
      if (expected.id === 'sample-45' && expected.adversarial_expectation?.type === 'rate_to_be_confirmed') {
        const adv = expected.adversarial_expectation;
        const hasPlaceholder = pageText.includes('[RATE TO BE CONFIRMED]') ||
          pageText.toLowerCase().includes('rate to be confirmed') ||
          pageText.toLowerCase().includes('tbc');
        const hasFabricatedRate = /\d+\.\d+\s*\/\s*mt|\$\s*\d{2,}|\d{2,}\s*usd/i.test(
          pageText.replace(/EUR/g, '').replace(/commiss/gi, '')
        );

        if (hasFabricatedRate && !hasPlaceholder) {
          addFinding({
            severity: 'SUSPECT',
            emailId: expected.id,
            field: 'sample45_fabricated_rate',
            expected: `"${adv.rate_placeholder_text}" or no numeric rate`,
            actual: 'numeric rate shown without TBC placeholder',
            evidence: `Body has "[RATE TO BE CONFIRMED]". LLM may have hallucinated rate from Constanta→Ravenna comps (sample-40/44)`,
          });
        } else {
          checksTotal++;
        }
      }

      // sample-47: subs countdown
      if (expected.id === 'sample-47' && expected.adversarial_expectation?.type === 'subs_countdown') {
        const adv = expected.adversarial_expectation;
        const hasDeadlineDate = pageText.includes('2026-04-10') ||
          pageText.includes('Apr 10') || pageText.includes('April 10');
        const hasSubsRef = pageText.toLowerCase().includes('subs') ||
          pageText.toLowerCase().includes('deadline');
        addFinding({
          severity: 'INFO',
          emailId: expected.id,
          field: 'sample47_subs_deadline',
          expected: `deadline 2026-04-10 (${adv.recap_date} + ${adv.banking_days} banking days)`,
          actual: hasDeadlineDate ? 'date shown' : hasSubsRef ? 'subs mention only' : 'no deadline shown',
          evidence: `Subs overdue (today 2026-04-20, deadline was 2026-04-10)`,
        });
        checksTotal++;
      }

      // Generic: voyage freight amount from body should match UI.
      // Skip time-charter recaps (they use hire rate per day, not per mt).
      const isTc = /hire\s*[:=]/i.test(bodyText) || /time.charter/i.test(bodyText) || /tc\s+recap/i.test(bodyText);
      if (!isTc) {
        // Only match voyage freight rates (per mt), not bunker prices
        const freightMatch = bodyText.match(/(?:Freight|Hire)[:\s]+(?:USD|EUR|\$)\s*([\d,]+(?:\.\d+)?)\s*\/?\s*(?:mt|pmt)/i);
        if (freightMatch) {
          const bodyRate = parseFloat(freightMatch[1].replace(/,/g, ''));
          const freightRateSection = pageText.match(/Freight Rate[\s\S]{0,150}/);
          if (freightRateSection) {
            const uiRateMatch = freightRateSection[0].match(/([\d,]+(?:\.\d+)?)/);
            if (uiRateMatch) {
              const uiRate = parseFloat(uiRateMatch[1].replace(/,/g, ''));
              if (uiRate > 0 && Math.abs(uiRate - bodyRate) / bodyRate > 0.05) {
                addFinding({
                  severity: 'SUSPECT',
                  emailId: expected.id,
                  field: 'freight_rate_mismatch',
                  expected: `${bodyRate} (from body)`,
                  actual: String(uiRate),
                  evidence: `Body: "${freightMatch[0]}". UI section: "${freightRateSection[0].substring(0, 80)}"`,
                });
              } else {
                checksTotal++;
              }
            }
          }
        }
      }

      await sharedPage.waitForTimeout(150);
    }
  });

  // ── Test 6: Impossible cargos filtered ─────────────────────────────────────

  test('matches: impossible cargos are filtered out', async () => {
    if (!pipelineSucceeded) { test.skip(); return; }

    const problemCargos = [
      { id: 'sample-22', reason: 'volume_overflow', detail: '80k mt iron ore vs handysize' },
      { id: 'sample-23', reason: 'draft_fail', detail: 'Rotterdam→Beira 30k on 8m draft port' },
      { id: 'sample-24', reason: 'sanctions', detail: 'Novorossiysk→Hamburg sanctions' },
      { id: 'sample-18', reason: 'inverted_laycan', detail: 'laycan end before start' },
    ];

    for (const { id, reason, detail } of problemCargos) {
      const url = `https://demo.quantika.org/cargo/${id}`;
      await sharedPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sharedPage.waitForTimeout(400);
      const pageText = await sharedPage.locator('main').textContent().catch(() => '') || '';

      const hasActiveMatch = pageText.includes('GOOD MATCH') || pageText.includes('POSSIBLE MATCH');
      const hasBlockedIndicator = pageText.toLowerCase().includes('sanction') ||
        pageText.toLowerCase().includes('blocked') ||
        pageText.toLowerCase().includes('risk');

      if (reason === 'sanctions') {
        // Match is OK if it's explicitly blocked/flagged; bad if it's a clean match
        if (hasActiveMatch && !hasBlockedIndicator) {
          addFinding({
            severity: 'FAIL',
            emailId: id,
            field: 'sanctions_match_not_blocked',
            expected: 'sanctions flag or no match',
            actual: 'unblocked match present',
            evidence: detail,
          });
        } else {
          checksTotal++;
          addFinding({
            severity: 'INFO',
            emailId: id,
            field: 'sanctions_handling',
            expected: 'blocked or no match',
            actual: hasBlockedIndicator ? 'sanction flag shown' : 'no match shown',
            evidence: detail,
          });
        }
      } else {
        check(id, `impossible_no_match_${reason}`, !hasActiveMatch,
          'no vessel match', hasActiveMatch ? 'HAS MATCH — pipeline bug' : 'correctly no match',
          detail, 'FAIL');
      }

      await sharedPage.waitForTimeout(150);
    }
  });

  // ── Test 7: Commission page ─────────────────────────────────────────────────

  test('commissions page: currency breakdown consistent', async () => {
    test.setTimeout(240000); // Extra time — this test comes after pipeline start
    if (!pipelineSucceeded) { test.skip(); return; }

    await sharedPage.goto('https://demo.quantika.org/commission', {
      waitUntil: 'domcontentloaded', timeout: 30000
    });
    await sharedPage.waitForTimeout(400);
    const pageText = await sharedPage.locator('main').textContent().catch(() => '') || '';

    const hasEur = pageText.includes('EUR') || pageText.includes('€');
    const hasTotal = pageText.toUpperCase().includes('TOTAL');

    // Commission page should exist and have totals
    check('COMMISSION_PAGE', 'total_section', hasTotal,
      'TOTAL section present', hasTotal ? 'present' : 'missing', 'Commission page should show totals', 'SUSPECT');

    // EUR commissions: sample-41 has EUR freight → should appear
    addFinding({
      severity: 'INFO',
      emailId: 'COMMISSION_PAGE',
      field: 'eur_commissions_present',
      expected: 'EUR commission from sample-41 (EUR 31/mt × 4200mt × 3.75%)',
      actual: hasEur ? 'EUR present in commission page' : 'EUR NOT present — sample-41 commission may be calculated in USD',
      evidence: 'sample-41: Figueira da Foz → Alexandria, EUR 31.00/mt, 3.75% commission = EUR 4,882.50',
    });
  });

  // ── Test 8: Body traceability spot-check ────────────────────────────────────

  test('skeptical spot-check: 5 cargo emails — body traceability', async () => {
    if (!pipelineSucceeded) { test.skip(); return; }

    const spotCheckIds = ['sample-01', 'sample-05', 'sample-18', 'sample-21', 'sample-24'];

    for (const id of spotCheckIds) {
      const url = `https://demo.quantika.org/cargo/${id}`;
      await sharedPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sharedPage.waitForTimeout(400);
      const pageText = await sharedPage.locator('main').textContent().catch(() => '') || '';

      const sample = cargoSamples.find(s => s.id === id);
      if (!sample) continue;
      const bodyText = sample.body;

      const exp = expectedData.find(e => e.id === id);
      const ext = exp?.extracted || {};

      // Load port traceability
      const loadPort = (ext.loadPort as { name?: string })?.name;
      if (loadPort) {
        const inBody = bodyText.toLowerCase().includes(loadPort.toLowerCase());
        check(id, 'load_port_traceable_to_body', inBody,
          `"${loadPort}" in body`, inBody ? 'traceable' : 'NOT in body — possible hallucination',
          `Load port "${loadPort}" from expected.json`, inBody ? 'INFO' : 'FAIL');
      }

      // Weight traceability
      const cargo = ext.cargo as { weight_mt?: number } | undefined;
      if (cargo?.weight_mt) {
        const wt = cargo.weight_mt;
        // Body may have it as "4,500" or "4500"
        const inBody = bodyText.replace(/,/g, '').includes(String(wt)) ||
          bodyText.includes(wt.toLocaleString());
        check(id, 'weight_traceable_to_body', inBody,
          `${wt}mt in body`, inBody ? 'traceable' : 'NOT found in body',
          `Weight ${wt}mt from expected.json. Body snippet: "${bodyText.substring(0, 200)}"`,
          inBody ? 'INFO' : 'SUSPECT');
      }

      // Commission traceability
      const commPct = ext.commission_pct as number | undefined;
      if (commPct) {
        const inBody = bodyText.includes(String(commPct)) ||
          bodyText.includes(commPct.toFixed(2));
        check(id, 'commission_traceable_to_body', inBody,
          `${commPct}% in body`, inBody ? 'traceable' : 'NOT in body',
          `Commission ${commPct}% from expected.json`,
          inBody ? 'INFO' : 'SUSPECT');
      }

      await sharedPage.waitForTimeout(150);
    }
  });
});
