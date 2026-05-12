// Regression Lock: QA adversarial 2026-05-12
// Class: B (Special floats) | Severity: HIGH
// Finding: F-07 — NaN in RoiSummary causes email generation failure
// Spec: spec/gamma-18-roi-guarantee-workflow
// DO NOT DELETE — see references/regression_lock_workflow.md

import { generateRoiReportEmail } from '@/lib/email/templates/roi-report';
import type { RoiSummary } from '@/lib/analytics/roi-metrics';

describe('regression gamma-18-F07: NaN in RoiSummary must be rejected by email generator', () => {
  it('generateRoiReportEmail must reject NaN totalSavingsUsd', () => {
    // ATTACK: NaN in summary (could happen from corrupted DB data)
    const summary: RoiSummary = {
      totalVoyages: 10,
      totalSavingsUsd: NaN, // ATTACK
      avgSavingsPerVoyage: 5000,
      roiMultiple: 1.5,
      cohorts: [],
    };

    // Must throw RangeError per spec:13-15
    expect(() => generateRoiReportEmail(summary)).toThrow(RangeError);
    expect(() => generateRoiReportEmail(summary)).toThrow(/totalSavingsUsd must be finite/);
  });

  it('generateRoiReportEmail must reject NaN roiMultiple', () => {
    const summary: RoiSummary = {
      totalVoyages: 10,
      totalSavingsUsd: 50000,
      avgSavingsPerVoyage: 5000,
      roiMultiple: NaN, // ATTACK
      cohorts: [],
    };

    expect(() => generateRoiReportEmail(summary)).toThrow(RangeError);
    expect(() => generateRoiReportEmail(summary)).toThrow(/roiMultiple must be finite/);
  });

  it('generateRoiReportEmail must reject NaN avgSavingsPerVoyage', () => {
    const summary: RoiSummary = {
      totalVoyages: 10,
      totalSavingsUsd: 50000,
      avgSavingsPerVoyage: NaN, // ATTACK
      roiMultiple: 1.5,
      cohorts: [],
    };

    expect(() => generateRoiReportEmail(summary)).toThrow(RangeError);
    expect(() => generateRoiReportEmail(summary)).toThrow(/avgSavingsPerVoyage must be finite/);
  });

  it('generateRoiReportEmail must reject Infinity totalSavingsUsd', () => {
    const summary: RoiSummary = {
      totalVoyages: 10,
      totalSavingsUsd: Infinity,
      avgSavingsPerVoyage: 5000,
      roiMultiple: 1.5,
      cohorts: [],
    };

    expect(() => generateRoiReportEmail(summary)).toThrow(RangeError);
  });
});
