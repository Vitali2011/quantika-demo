/**
 * Shared dry-run utilities for Knowledge Layer embedding pipeline
 *
 * Input contract for logDryRun:
 * - summary.tableName = "" → accepted (caller responsibility)
 * - summary.chunkCount = 0 → accepted (valid zero count)
 * - summary.chunkCount = NaN or negative → accepted (caller contract violation, not validated)
 * - No validation enforced — pure logging utility
 */

export interface DryRunSummary {
  event: string;
  tableName: string;
  chunkCount: number;
  totalChars: number;
  skipped: true;
}

export function logDryRun(summary: DryRunSummary): void {
  console.log(JSON.stringify(summary));
}
