#!/usr/bin/env tsx
/**
 * CLI wrapper for IGC embedding pipeline
 *
 * Usage:
 *   npm run knowledge:igc
 *   npm run knowledge:igc -- --dry-run
 */

import { syncIgc } from '@/lib/knowledge/sources/igc/adapter';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  try {
    const result = await syncIgc({ dryRun });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('IGC sync failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
