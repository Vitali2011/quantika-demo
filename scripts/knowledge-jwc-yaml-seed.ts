#!/usr/bin/env tsx
/**
 * CLI wrapper for JWC YAML-based embedding pipeline
 *
 * Seeds jwc_vec + jwc_fts from data/knowledge/jwc/2025-current.yaml (JWLA-033).
 * No live URL required — uses authoritative local YAML.
 *
 * Usage:
 *   npm run knowledge:jwc-yaml
 *   npm run knowledge:jwc-yaml -- --dry-run
 */

import { syncJwcYaml } from '@/lib/knowledge/sources/jwc-yaml/adapter';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  try {
    const result = await syncJwcYaml({ dryRun });
    const prefix = dryRun ? '[DRY RUN] ' : '';
    console.log(
      `${prefix}JWC YAML seed complete: ${result.zonesProcessed} zones → ${result.chunksStored} chunks stored (${result.bulletinRef})`
    );
    process.exit(0);
  } catch (error) {
    console.error('JWC YAML seed failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
