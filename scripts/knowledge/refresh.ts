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

// Known source slugs — per-source handlers will be added in later phases (Block C–G).
// Dynamic import uses a runtime variable so tsc doesn't try to resolve non-existent modules.
const KNOWN_SLUGS = [
  'ofac',
  'eu-sanctions',
  'distances',
  'jwc',
  'eca',
  'panama-tariffs',
  'imsbc',
  'igc',
  'unlocode',
  'baltic-indices',
  'fx-rates',
] as const;

/** Returns the slug→handler dispatch map. Exported for testability. */
export function getHandlers(): Record<string, () => Promise<void>> {
  return Object.fromEntries(
    KNOWN_SLUGS.map((slug) => [
      slug,
      async () => {
        const modulePath = `./sources/${slug}`;
        const mod = await import(modulePath);
        await mod.refresh();
      },
    ]),
  );
}

export async function main(): Promise<void> {
  const handlers = getHandlers();
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
