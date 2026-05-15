#!/usr/bin/env tsx
/**
 * CLI wrapper for JWC RAG embedding pipeline
 *
 * Usage:
 *   npm run knowledge:jwc
 *   npm run knowledge:jwc -- --dry-run
 */

import { syncJwcRag } from '@/lib/knowledge/sources/jwc/adapter';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  try {
    const result = await syncJwcRag({ dryRun });
    const prefix = dryRun ? '[DRY RUN] ' : '';
    console.log(
      `${prefix}JWC RAG sync complete: ${result.bulletinsScraped} bulletins, ${result.chunksStored} chunks stored`
    );
    process.exit(0);
  } catch (error) {
    console.error('JWC RAG sync failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
