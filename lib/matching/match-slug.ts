/** Stable, session-independent match identifier for URL routing.
 *
 * Slug = `${cargoId}--${vesselId}`. The double-dash separator is safe
 * because email IDs in demo data use single dashes only (e.g. "demo-cargo-001").
 * Production email IDs are UUIDs or similar — never contain `--`.
 */

export function toMatchSlug(cargoId: string, vesselId: string): string {
  return `${cargoId}--${vesselId}`;
}

export function fromMatchSlug(
  slug: string,
): { cargo_id: string; vessel_id: string } | null {
  const idx = slug.indexOf('--');
  if (idx < 1) return null; // no separator or empty cargo_id
  const cargo_id = slug.slice(0, idx);
  const vessel_id = slug.slice(idx + 2);
  if (!vessel_id) return null;
  return { cargo_id, vessel_id };
}
