#!/usr/bin/env tsx
/**
 * Thin wrapper — delegates to scripts/knowledge/seeds/seed-market-indices.ts
 * Usage: npx tsx scripts/seed-market-indices.ts
 */
import { seedMarketIndices } from './knowledge/seeds/seed-market-indices';

seedMarketIndices();
