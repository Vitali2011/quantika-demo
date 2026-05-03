/**
 * βf3-06: compare-routes performance tests.
 *
 * Skip-by-default — run with:
 *   RUN_PERF_TESTS=1 npm test -- compare-routes-perf
 *
 * Alternatively: verify that the route module loads fast (< 100ms) at import
 * time — this ensures module-scope code (constants, type definitions) is light.
 *
 * The real cold-start bottleneck is the LLM call in llmReason(). It is now
 * capped at LLM_REASON_TIMEOUT_MS (4000ms) via Promise.race, so total
 * cold-start ≤ 4s + synchronous overhead (< 50ms).
 */

const RUN_PERF = process.env.RUN_PERF_TESTS === '1';
const describePerf = RUN_PERF ? describe : describe.skip;

// ─── Fixture ──────────────────────────────────────────────────────────────────

const FIXTURE_BODY = {
  origin: 'Rotterdam',
  destination: 'Singapore',
  vessel: {
    dwt: 60_000,
    valueUsd: 18_000_000,
    speedKts: 13.5,
    consumptionMtPerDay: 28,
  },
  cargo: {
    quantityMt: 50_000,
    freightRateUsdPerMt: 28,
  },
  marketRates: {
    bunkerPriceUsdPerMt: 560,
    euaPriceEur: 65,
  },
};

// ─── Module import speed (always runs — CI friendly) ─────────────────────────

describe('compare-routes module', () => {
  it('imports route module in < 100ms', async () => {
    const start = Date.now();
    await import('@/app/api/voyage/compare-routes/route');
    const elapsed = Date.now() - start;
    // Module-scope: only type definitions and constants — should be instant.
    expect(elapsed).toBeLessThan(100);
  });

  it('route-decision module exports compareRoutes function', async () => {
    const mod = await import('@/lib/economics/route-decision');
    expect(typeof mod.compareRoutes).toBe('function');
  });

  it('compareRoutes returns correct JSON structure (mocked LLM)', async () => {
    // Mock callAiText so we don't depend on ClipProxy in CI
    jest.mock('@/lib/openai', () => ({
      callAiText: jest.fn().mockResolvedValue('Suez saves cost and time.'),
    }));

    const { compareRoutes } = await import('@/lib/economics/route-decision');
    const result = await compareRoutes(
      'Rotterdam',
      'Singapore',
      FIXTURE_BODY.vessel,
      FIXTURE_BODY.cargo,
      FIXTURE_BODY.marketRates,
    );

    expect(result).toHaveProperty('suez');
    expect(result).toHaveProperty('cape');
    expect(result).toHaveProperty('recommendation');
    expect(result.recommendation).toHaveProperty('route');
    expect(result.recommendation).toHaveProperty('reason');
    expect(result.recommendation).toHaveProperty('savings_usd');
    expect(result.recommendation).toHaveProperty('savings_days');
    expect(result.recommendation).toHaveProperty('extra_days_winner');
    expect(result.recommendation).toHaveProperty('savings_usd_per_day');
    // Duration must be positive
    expect(result.suez.durationDays).toBeGreaterThan(0);
    expect(result.cape.durationDays).toBeGreaterThan(0);
  });
});

// ─── Optional perf tests (RUN_PERF_TESTS=1) ──────────────────────────────────

describePerf('compare-routes cold-start performance', () => {
  it(
    'compareRoutes completes in < 5000ms even with slow LLM (timeout respected)',
    async () => {
      // Simulate slow LLM: never resolves in time
      jest.mock('@/lib/openai', () => ({
        callAiText: jest.fn(
          () => new Promise(resolve => setTimeout(() => resolve('late response'), 10_000))
        ),
      }));

      const { compareRoutes } = await import('@/lib/economics/route-decision');
      const start = Date.now();
      const result = await compareRoutes(
        'Rotterdam',
        'Singapore',
        FIXTURE_BODY.vessel,
        FIXTURE_BODY.cargo,
        FIXTURE_BODY.marketRates,
      );
      const elapsed = Date.now() - start;

      // Must complete under 5s (LLM_REASON_TIMEOUT_MS=4000 + overhead)
      expect(elapsed).toBeLessThan(5_000);
      // Must still return a valid recommendation (fallback template used)
      expect(result.recommendation.reason).toBeTruthy();
      expect(['suez', 'cape']).toContain(result.recommendation.route);

      console.log(`[perf] compareRoutes with slow LLM: ${elapsed}ms`);
    },
    6_000 // Jest test timeout
  );

  it(
    'compareRoutes completes in < 500ms with fast LLM (warm path)',
    async () => {
      jest.mock('@/lib/openai', () => ({
        callAiText: jest.fn().mockResolvedValue('Suez is the better choice.'),
      }));

      const { compareRoutes } = await import('@/lib/economics/route-decision');
      // Warm: call twice, measure second
      await compareRoutes('Rotterdam', 'Singapore', FIXTURE_BODY.vessel, FIXTURE_BODY.cargo, FIXTURE_BODY.marketRates);

      const start = Date.now();
      await compareRoutes('Rotterdam', 'Singapore', FIXTURE_BODY.vessel, FIXTURE_BODY.cargo, FIXTURE_BODY.marketRates);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(500);
      console.log(`[perf] compareRoutes warm path: ${elapsed}ms`);
    },
    3_000
  );
});
