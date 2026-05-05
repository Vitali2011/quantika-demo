/**
 * scripts/knowledge/refresh.ts
 *
 * Dispatcher for refreshing individual knowledge sources.
 * Routes to per-source handlers based on slug.
 *
 * Usage:
 *   npm run knowledge:refresh ofac
 *   npm run knowledge:refresh eu-sanctions
 *   npm run knowledge:refresh distances
 *   etc.
 *
 * Phase 1 B5: Stub dispatcher. Per-source handlers will be implemented in later tasks:
 *   - Block C: OFAC, EU sanctions
 *   - Block D: distances
 *   - Block E: JWC
 *   - Block F: ECA
 *   - Block G: Panama tariffs
 */

// Handler registry maps slug → async refresh function
// For now, all handlers are placeholders that will be implemented in subsequent tasks
const handlers: Record<string, () => Promise<void>> = {
  ofac: async () => {
    const { refresh } = await import('./sources/ofac');
    await refresh();
  },
  'eu-sanctions': async () => {
    const { refresh } = await import('./sources/eu-sanctions');
    await refresh();
  },
  distances: async () => {
    const { refresh } = await import('./sources/distances');
    await refresh();
  },
  jwc: async () => {
    const { refresh } = await import('./sources/jwc');
    await refresh();
  },
  eca: async () => {
    const { refresh } = await import('./sources/eca');
    await refresh();
  },
  'panama-tariffs': async () => {
    const { refresh } = await import('./sources/panama-tariffs');
    await refresh();
  },
  imsbc: async () => {
    const { refresh } = await import('./sources/imsbc');
    await refresh();
  },
  igc: async () => {
    const { refresh } = await import('./sources/igc');
    await refresh();
  },
  unlocode: async () => {
    const { refresh } = await import('./sources/unlocode');
    await refresh();
  },
  'baltic-indices': async () => {
    const { refresh } = await import('./sources/baltic-indices');
    await refresh();
  },
};

async function main(): Promise<void> {
  const slug = process.argv[2];

  if (!slug) {
    console.error('Error: unknown slug (no argument provided)');
    console.error('Usage: npm run knowledge:refresh <slug>');
    console.error(`Valid slugs: ${Object.keys(handlers).join(', ')}`);
    process.exit(1);
  }

  if (!handlers[slug]) {
    console.error(`Error: unknown slug: ${slug}`);
    console.error(`Valid slugs: ${Object.keys(handlers).join(', ')}`);
    process.exit(1);
  }

  console.log(`[knowledge:refresh] Starting refresh for: ${slug}`);

  try {
    await handlers[slug]();
    console.log(`[knowledge:refresh] ✅ Completed: ${slug}`);
  } catch (err) {
    console.error(`[knowledge:refresh] ❌ Failed: ${slug}`);
    console.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
