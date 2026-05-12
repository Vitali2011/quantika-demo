import { generateRoiReportEmail } from '../email/templates/roi-report';
import type { RoiSummary } from '../analytics/roi-metrics';

/**
 * Input Contract:
 *
 * generateRoiReportEmail(summary):
 * - Empty summary (totalVoyages=0) → generate valid email with "No voyages" message
 * - Negative totalSavingsUsd → accept (show as loss)
 * - NaN values in summary → RangeError
 */

describe('generateRoiReportEmail', () => {
  // RED test: returns object with subject and body
  it('returns object with subject and body', () => {
    const summary: RoiSummary = {
      totalVoyages: 5,
      totalSavingsUsd: 25000,
      avgSavingsPerVoyage: 5000,
      roiMultiple: 2.5,
      cohorts: [],
    };

    const email = generateRoiReportEmail(summary);

    expect(email).toBeDefined();
    expect(email).toHaveProperty('subject');
    expect(email).toHaveProperty('body');
    expect(typeof email.subject).toBe('string');
    expect(typeof email.body).toBe('string');
  });

  // RED test: subject contains 'ROI Report'
  it('subject contains "ROI Report"', () => {
    const summary: RoiSummary = {
      totalVoyages: 5,
      totalSavingsUsd: 25000,
      avgSavingsPerVoyage: 5000,
      roiMultiple: 2.5,
      cohorts: [],
    };

    const email = generateRoiReportEmail(summary);

    expect(email.subject).toMatch(/ROI Report/i);
  });

  // RED test: body includes totalVoyages
  it('body includes totalVoyages', () => {
    const summary: RoiSummary = {
      totalVoyages: 5,
      totalSavingsUsd: 25000,
      avgSavingsPerVoyage: 5000,
      roiMultiple: 2.5,
      cohorts: [],
    };

    const email = generateRoiReportEmail(summary);

    expect(email.body).toMatch(/5/);
    expect(email.body.toLowerCase()).toMatch(/voyages?/);
  });

  // RED test: body includes totalSavingsUsd formatted
  it('body includes totalSavingsUsd formatted with currency', () => {
    const summary: RoiSummary = {
      totalVoyages: 5,
      totalSavingsUsd: 25000,
      avgSavingsPerVoyage: 5000,
      roiMultiple: 2.5,
      cohorts: [],
    };

    const email = generateRoiReportEmail(summary);

    // Should contain formatted amount (e.g., $25,000 or 25000 or 25,000)
    expect(email.body).toMatch(/25[,]?000/);
  });

  // RED test: empty summary generates "No voyages" message
  it('generates valid email for empty summary', () => {
    const summary: RoiSummary = {
      totalVoyages: 0,
      totalSavingsUsd: 0,
      avgSavingsPerVoyage: 0,
      roiMultiple: 0,
      cohorts: [],
    };

    const email = generateRoiReportEmail(summary);

    expect(email.subject).toBeDefined();
    expect(email.body).toBeDefined();
    expect(email.body.toLowerCase()).toMatch(/no.*voyages?|0.*voyages?/i);
  });

  // RED test: negative totalSavingsUsd shown as loss
  it('shows negative totalSavingsUsd as loss', () => {
    const summary: RoiSummary = {
      totalVoyages: 3,
      totalSavingsUsd: -5000,
      avgSavingsPerVoyage: -1666.67,
      roiMultiple: -0.5,
      cohorts: [],
    };

    const email = generateRoiReportEmail(summary);

    // Should contain negative amount
    expect(email.body).toMatch(/-|loss/i);
  });

  // RED test: NaN totalSavingsUsd rejected
  it('rejects NaN totalSavingsUsd', () => {
    const summary: RoiSummary = {
      totalVoyages: 5,
      totalSavingsUsd: NaN,
      avgSavingsPerVoyage: 5000,
      roiMultiple: 2.5,
      cohorts: [],
    };

    expect(() => generateRoiReportEmail(summary)).toThrow(RangeError);
    expect(() => generateRoiReportEmail(summary)).toThrow(/totalSavingsUsd.*finite/i);
  });

  // RED test: NaN roiMultiple rejected
  it('rejects NaN roiMultiple', () => {
    const summary: RoiSummary = {
      totalVoyages: 5,
      totalSavingsUsd: 25000,
      avgSavingsPerVoyage: 5000,
      roiMultiple: NaN,
      cohorts: [],
    };

    expect(() => generateRoiReportEmail(summary)).toThrow(RangeError);
    expect(() => generateRoiReportEmail(summary)).toThrow(/roiMultiple.*finite/i);
  });

  // RED test: includes avgSavingsPerVoyage
  it('body includes avgSavingsPerVoyage', () => {
    const summary: RoiSummary = {
      totalVoyages: 4,
      totalSavingsUsd: 20000,
      avgSavingsPerVoyage: 5000,
      roiMultiple: 2.0,
      cohorts: [],
    };

    const email = generateRoiReportEmail(summary);

    // Should contain average amount
    expect(email.body).toMatch(/5[,]?000/);
    expect(email.body.toLowerCase()).toMatch(/average|avg|per voyage/i);
  });

  // RED test: includes roiMultiple
  it('body includes roiMultiple', () => {
    const summary: RoiSummary = {
      totalVoyages: 5,
      totalSavingsUsd: 25000,
      avgSavingsPerVoyage: 5000,
      roiMultiple: 2.5,
      cohorts: [],
    };

    const email = generateRoiReportEmail(summary);

    expect(email.body).toMatch(/2\.5|2\.50/);
    expect(email.body.toLowerCase()).toMatch(/roi|return/i);
  });
});
