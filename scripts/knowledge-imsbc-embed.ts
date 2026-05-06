#!/usr/bin/env tsx
/**
 * CLI wrapper for IMSBC embedding pipeline
 *
 * Usage:
 *   npm run knowledge:imsbc
 *   npm run knowledge:imsbc -- --dry-run
 */

import { syncImsbc } from '@/lib/knowledge/sources/imsbc/adapter';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  try {
    const result = await syncImsbc({ dryRun });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('IMSBC sync failed:', error);
    process.exit(1);
  }
}

main();
