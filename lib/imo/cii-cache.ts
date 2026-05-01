import * as fs from 'fs';
import * as path from 'path';
import type { CiiResult } from './cii-lookup';

export const CII_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const DEFAULT_CACHE_DIR = path.join(process.cwd(), '.cache', 'cii');

function cacheFilePath(imo: string, cacheDir: string): string {
  return path.join(cacheDir, `${imo}.json`);
}

/** Returns cached CiiResult if within 30-day TTL, otherwise null. */
export function getCiiCached(imo: string, cacheDir: string = DEFAULT_CACHE_DIR): CiiResult | null {
  if (!imo) return null;
  const filePath = cacheFilePath(imo, cacheDir);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const entry = JSON.parse(raw) as CiiResult;
    const age = Date.now() - new Date(entry.fetchedAt).getTime();
    if (age > CII_CACHE_TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

/** Writes CiiResult to cache. No-op for empty imo. */
export function setCiiCached(imo: string, result: CiiResult, cacheDir: string = DEFAULT_CACHE_DIR): void {
  if (!imo) return;
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFilePath(imo, cacheDir), JSON.stringify(result, null, 2));
  } catch {
    // Cache write failure is non-fatal
  }
}
