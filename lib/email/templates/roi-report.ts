import type { RoiSummary } from '../../analytics/roi-metrics';

/**
 * Generate a plain text email report from ROI summary.
 *
 * Input validation:
 * - NaN values in summary → RangeError
 * - Negative values → allowed (shown as loss)
 * - Empty summary (0 voyages) → generate valid email with "No voyages" message
 */
export function generateRoiReportEmail(summary: RoiSummary): { subject: string; body: string } {
  // Validate numeric fields
  if (!Number.isFinite(summary.totalSavingsUsd)) {
    throw new RangeError('totalSavingsUsd must be finite');
  }
  if (!Number.isFinite(summary.roiMultiple)) {
    throw new RangeError('roiMultiple must be finite');
  }
  if (!Number.isFinite(summary.avgSavingsPerVoyage)) {
    throw new RangeError('avgSavingsPerVoyage must be finite');
  }

  const subject = 'Your Quantika 90-day ROI Report';

  // Handle empty summary
  if (summary.totalVoyages === 0) {
    return {
      subject,
      body: `Dear Quantika User,

Your 90-day ROI report is ready.

Summary:
- Total voyages: 0
- Total savings: $0.00
- Average savings per voyage: $0.00
- ROI multiple: 0.00x

No voyages recorded in the reporting period.

Best regards,
Quantika Team`,
    };
  }

  // Format currency
  const formatCurrency = (amount: number): string => {
    const sign = amount < 0 ? '-' : '';
    const abs = Math.abs(amount);
    return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const savingsLabel = summary.totalSavingsUsd < 0 ? 'Total loss' : 'Total savings';

  const body = `Dear Quantika User,

Your 90-day ROI report is ready.

Summary:
- Total voyages: ${summary.totalVoyages}
- ${savingsLabel}: ${formatCurrency(summary.totalSavingsUsd)}
- Average savings per voyage: ${formatCurrency(summary.avgSavingsPerVoyage)}
- ROI multiple: ${summary.roiMultiple.toFixed(2)}x

${summary.totalSavingsUsd < 0 ? 'Note: Negative values indicate a loss compared to baseline.' : ''}

Best regards,
Quantika Team`;

  return { subject, body };
}

// audit D revive: ROI report surface
/**
 * Non-throwing wrapper for UI surfaces (/reports/roi preview page):
 * invalid summary (NaN/Infinity) → readable error instead of a crash.
 */
export type SafeRoiReport =
  | { ok: true; subject: string; body: string }
  | { ok: false; error: string };

export function safeGenerateRoiReport(summary: RoiSummary): SafeRoiReport {
  try {
    const { subject, body } = generateRoiReportEmail(summary);
    return { ok: true, subject, body };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid ROI summary' };
  }
}
