// Regression Lock: QA adversarial 2026-05-12
// Class: 7 (Config cross-reference) | Severity: HIGH
// Finding: F-05 — Feature flag misalignment hides UI tile
// Spec: spec/gamma-18-roi-guarantee-workflow
// DO NOT DELETE — see references/regression_lock_workflow.md

/**
 * Property: Server feature flag (ROI_GUARANTEE_ENABLED) and client flag
 * (NEXT_PUBLIC_ROI_GUARANTEE_ENABLED) must be aligned.
 *
 * Bug scenario:
 * - Server: ROI_GUARANTEE_ENABLED=true → API endpoint returns 200
 * - Client: NEXT_PUBLIC_ROI_GUARANTEE_ENABLED=false → Tile returns null
 * - Result: API works but tile hidden = misleading UX
 *
 * Reverse scenario:
 * - Server: false → API returns 503
 * - Client: true → Tile tries to fetch, gets 503 error
 *
 * NOTE: This is a property test, not a unit test. It verifies the contract,
 * not the implementation. If both flags are undefined → PASS (both disabled).
 */

describe('regression gamma-18-F05: feature flag alignment', () => {
  it('documents the feature flag alignment requirement', () => {
    // Server flag: process.env.ROI_GUARANTEE_ENABLED (route.ts:17)
    // Client flag: process.env.NEXT_PUBLIC_ROI_GUARANTEE_ENABLED (RoiSummaryTile.tsx:30)
    //
    // Expected: Both flags must be the same value (both 'true' or both undefined/false)
    //
    // This is a documentation test — actual enforcement requires:
    // 1. CI check: grep both .env.local and verify alignment
    // 2. Runtime validation: API returns feature_flag_status in response
    // 3. UI displays warning if flag mismatch detected
    //
    // For now, this test documents the requirement and fails if misalignment
    // is detected in the test environment.

    const serverFlag = process.env.ROI_GUARANTEE_ENABLED;
    const clientFlag = process.env.NEXT_PUBLIC_ROI_GUARANTEE_ENABLED;

    // If both are undefined or both are 'true', alignment is OK
    const bothUndefined = !serverFlag && !clientFlag;
    const bothTrue = serverFlag === 'true' && clientFlag === 'true';

    if (!bothUndefined && !bothTrue) {
      throw new Error(
        `Feature flag misalignment detected:\n` +
        `  ROI_GUARANTEE_ENABLED = ${serverFlag || 'undefined'}\n` +
        `  NEXT_PUBLIC_ROI_GUARANTEE_ENABLED = ${clientFlag || 'undefined'}\n` +
        `Both must be 'true' or both undefined for consistent UX.`
      );
    }

    // Test passes if aligned
    expect(bothUndefined || bothTrue).toBe(true);
  });
});
