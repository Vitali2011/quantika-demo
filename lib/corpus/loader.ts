import { readFile } from 'fs/promises';
import path from 'path';

import type { Email } from '@/lib/types';

export class CorpusNotFoundError extends Error {
  constructor(filePath: string) {
    super(`Corpus file not found: ${filePath}`);
    this.name = 'CorpusNotFoundError';
  }
}

let cache: Email[] | null = null;

export function clearCorpusCache(): void {
  cache = null;
}

export async function loadCorpus(): Promise<Email[]> {
  if (cache !== null) return cache;

  const filePath = path.join(process.cwd(), '.private', 'etms-corpus.json');

  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      throw new CorpusNotFoundError(filePath);
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Corpus JSON parse failed: ${filePath}`);
  }

  if (
    !Array.isArray(parsed) ||
    !parsed.every(
      (e) => typeof e === 'object' && e !== null && typeof (e as Record<string, unknown>).id === 'string' && typeof (e as Record<string, unknown>).body === 'string',
    )
  ) {
    throw new Error(`Corpus validation failed: expected Email[] with id+body strings`);
  }

  cache = parsed as Email[];
  return cache;
}
