// scripts/demo-seed/llm-cache.ts
/**
 * Pure helpers for the LLM-parse cache.
 *
 *   corpusHash(rawDir)     — deterministic SHA256 of every .json in rawDir.
 *   cachePath(rawDir, h)   — <rawDir>/.llm-cache/<h>.json
 *   readCache(rawDir, h)   — JSON parse, or null if absent.
 *   writeCache(rawDir, c)  — mkdir + atomic-ish write.
 *   loadLlmCacheIfAny(dir) — read the cache file whose hash matches the
 *                            current corpus, or null. Used by analyze.ts
 *                            and build.ts to opt into LLM-parsed data.
 *
 * Cache files are gitignored (.llm-cache/ under any path).
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type {
  Classification,
  ParsedCargo,
  ParsedVessel,
  ParsedFixtureRecap,
} from '@/lib/types';

export interface LlmCache {
  corpusHash: string;
  generatedAt: string;
  classifications: Classification[];
  parsedCargos: ParsedCargo[];
  parsedVessels: ParsedVessel[];
  parsedFixtureRecaps: ParsedFixtureRecap[];
}

const CACHE_DIR_NAME = '.llm-cache';

/**
 * Deterministic SHA-256 of every .json file in `rawDir`, joined in
 * lexicographic filename order so the result is independent of the
 * underlying filesystem enumeration order. Non-.json files are ignored.
 */
export function corpusHash(rawDir: string): string {
  const files = fs
    .readdirSync(rawDir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const hash = crypto.createHash('sha256');
  for (const f of files) {
    hash.update(f);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(rawDir, f)));
    hash.update('\n--FILE--\n');
  }
  return hash.digest('hex');
}

export function cachePath(rawDir: string, hash: string): string {
  return path.join(rawDir, CACHE_DIR_NAME, `${hash}.json`);
}

export function writeCache(rawDir: string, cache: LlmCache): void {
  const dir = path.join(rawDir, CACHE_DIR_NAME);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cachePath(rawDir, cache.corpusHash), JSON.stringify(cache, null, 2) + '\n');
}

export function readCache(rawDir: string, hash: string): LlmCache | null {
  const p = cachePath(rawDir, hash);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')) as LlmCache;
}

/**
 * Returns the cache file whose hash matches the current corpus, or null.
 * Used by analyze.ts / build.ts to opt into LLM-parsed data when available
 * without blowing up if it's absent (CI, fresh worktree).
 */
export function loadLlmCacheIfAny(rawDir: string): LlmCache | null {
  const dirExists = fs.existsSync(path.join(rawDir, CACHE_DIR_NAME));
  if (!dirExists) return null;
  const h = corpusHash(rawDir);
  return readCache(rawDir, h);
}
