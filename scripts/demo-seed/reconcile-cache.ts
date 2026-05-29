// scripts/demo-seed/reconcile-cache.ts
import * as fs from 'fs';
import * as path from 'path';

const DIR = '.reconcile-cache';

export function reconcileCachePath(rawDir: string, hash: string): string {
  return path.join(rawDir, DIR, `${hash}.json`);
}

export function readReconcileCache(rawDir: string, hash: string): string | null {
  const p = reconcileCachePath(rawDir, hash);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

export function writeReconcileCache(rawDir: string, hash: string, rawJson: string): void {
  const dir = path.join(rawDir, DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(reconcileCachePath(rawDir, hash), rawJson.trimEnd() + '\n');
}
