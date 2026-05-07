#!/usr/bin/env npx tsx
/**
 * CLI wrapper for JWC RAG embedding sync
 * Usage: npm run knowledge:jwc [--dry-run]
 *
 * Syncs JWC Listed Areas bulletins into vector (jwc_vec) and FTS (jwc_fts) tables.
 */

import { syncJwcRag } from '../lib/knowledge/sources/jwc/adapter';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  try {
    console.log(`Starting JWC RAG sync${dryRun ? ' (dry-run)' : ''}...`);

    const result = await syncJwcRag({ dryRun });

    console.log('✓ JWC RAG sync completed successfully');
    console.log(`  Bulletins scraped: ${result.bulletinsScraped}`);
    console.log(`  Chunks stored: ${result.chunksStored}`);

    process.exit(0);
  } catch (error) {
    console.error('✗ JWC RAG sync failed:', (error as Error).message);
    process.exit(1);
  }
}

main();
