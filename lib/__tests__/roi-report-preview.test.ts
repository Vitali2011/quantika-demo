/**
 * audit D revive: ROI report preview surface (/reports/roi).
 * Tests the helper boundary used by the page — not the Next runtime.
 */
import { safeGenerateRoiReport } from '@/lib/email/templates/roi-report';
import type { RoiSummary } from '@/lib/analytics/roi-metrics';

const validSummary: RoiSummary = {
  totalVoyages: 3,
  totalSavingsUsd: 21500,
  avgSavingsPerVoyage: 7166.67,
  roiMultiple: 72.39,
  cohorts: [],
};

describe('safeGenerateRoiReport (ROI report preview boundary)', () => {
  it('returns ok with subject and body for a valid summary', () => {
    const result = safeGenerateRoiReport(validSummary);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.subject).toBe('Your Quantika 90-day ROI Report');
    expect(result.body).toContain('Total voyages: 3');
    expect(result.body).toContain('$21,500.00');
  });

  it('returns honest zero report for an empty summary (0 voyages)', () => {
    const result = safeGenerateRoiReport({
      totalVoyages: 0,
      totalSavingsUsd: 0,
      avgSavingsPerVoyage: 0,
      roiMultiple: 0,
      cohorts: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body).toContain('No voyages recorded');
  });

  it('returns readable error (not a throw) for NaN in summary', () => {
    const result = safeGenerateRoiReport({ ...validSummary, totalSavingsUsd: NaN });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/totalSavingsUsd/);
  });

  it('returns readable error for Infinity roiMultiple', () => {
    const result = safeGenerateRoiReport({ ...validSummary, roiMultiple: Infinity });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/roiMultiple/);
  });
});
