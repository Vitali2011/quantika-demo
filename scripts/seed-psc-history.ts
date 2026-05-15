#!/usr/bin/env tsx
/**
 * Thin wrapper — delegates to scripts/knowledge/seeds/seed-psc-history.ts
 * Usage:
 *   npx tsx --env-file=.env.local scripts/seed-psc-history.ts
 *   npx tsx --env-file=.env.local scripts/seed-psc-history.ts --dry-run
 */
import { seedPscHistory } from './knowledge/seeds/seed-psc-history';

const dryRun = process.argv.includes('--dry-run');
seedPscHistory({ dryRun });
