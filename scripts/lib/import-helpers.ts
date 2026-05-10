/**
 * Pure helper functions for Gmail incremental import (spec-corpus-03).
 * No I/O dependencies — easy to unit-test.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Returns true when the thread file already exists on disk and --force was NOT passed.
 * The caller should print "skip: <id>" and move on.
 */
export function shouldSkipThread(filepath: string, force: boolean): boolean {
  if (force) return false;
  return fs.existsSync(filepath);
}

/**
 * Builds the Gmail query string for the label, with an optional `after:` date filter.
 *
 * @param labelName  e.g. `_ ETMS - Management`
 * @param sinceDate  ISO date string `YYYY-MM-DD` → converted to Gmail `after:YYYY/MM/DD`
 */
export function buildLabelQuery(labelName: string, sinceDate?: string): string {
  let q = `label:"${labelName}"`;
  if (sinceDate) {
    // Gmail wants YYYY/MM/DD format
    const gmailDate = sinceDate.replace(/-/g, '/');
    q += ` after:${gmailDate}`;
  }
  return q;
}

/**
 * Runs an async function with exponential backoff on 429 (rate-limit) errors.
 *
 * Backoff schedule: 1 s → 2 s → 4 s (maxRetries = 3 attempts total).
 * After all retries are exhausted the last error is re-thrown so the caller
 * can decide whether to continue or abort.
 *
 * @param fn         The async function to attempt
 * @param maxRetries Maximum number of extra attempts (default 3)
 */
export async function withBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const isRateLimit = isGmailRateLimit(err);
      if (!isRateLimit || attempt === maxRetries) {
        throw err;
      }
      const delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      await sleep(delayMs);
    }
  }
  throw lastError;
}

/** Heuristic: treat any error whose status / code is 429 as a rate-limit error. */
function isGmailRateLimit(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (e['status'] === 429 || e['code'] === 429) return true;
    // googleapis wraps status inside e.response
    const resp = e['response'] as Record<string, unknown> | undefined;
    if (resp?.['status'] === 429) return true;
    // googleapis GaxiosError wraps in e.errors array too — check message
    if (typeof e['message'] === 'string' && /429|rate.?limit|quota/i.test(e['message'] as string)) {
      return true;
    }
  }
  return false;
}

/** Promisified setTimeout. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Derive the output file path for a thread.
 *
 * @param outputDir  absolute path to `.private/raw-emails/`
 * @param threadId   Gmail thread id
 */
export function threadFilePath(outputDir: string, threadId: string): string {
  return path.join(outputDir, `${threadId}.json`);
}
