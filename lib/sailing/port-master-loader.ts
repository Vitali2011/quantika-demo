/**
 * Port master JSON loader — lazy, in-memory cached.
 *
 * Called by `getPortMaster()` to populate the lookup map from
 * `data/ports/port-master.json`. Source identity (`===`) is the cache key, so
 * test fixtures and production JSON can coexist without manual invalidation
 * as long as callers pass the same array reference.
 */

import type { PortMaster } from './port-master';

/**
 * Canonical lookup key shared by the port-master Map and the searoute Tier-2
 * lookup. Collapses the space/accent divergence that silently lost coordinates:
 * `normalizePortName` emits concatenated canonical tokens ("BandarAbbas"),
 * while port-master names and searoute keys carry spaces/diacritics
 * ("Bandar Abbas", "Gdańsk"). Lowercase + NFD-strip diacritics + drop every
 * non-alphanumeric collapses all three forms to one key ("bandarabbas",
 * "gdansk"). Verified to introduce zero new key collisions across the full
 * port-master corpus (the only dups — Tripoli, Cartagena — already collided
 * under `name.toLowerCase()`).
 */
export function portLookupKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Map keyed by `portLookupKey(name)` plus a secondary `byUnlocode` index. */
export class PortMasterIndex extends Map<string, PortMaster> {
  private readonly unlocodeMap: Map<string, PortMaster>;

  constructor(entries: PortMaster[]) {
    super();
    this.unlocodeMap = new Map();
    const seenUnlocodes = new Set<string>();
    for (const p of entries) {
      if (!p || typeof p !== 'object' || !p.unlocode || !p.name) {
        throw new Error(`Port master entry missing unlocode or name: ${JSON.stringify(p)}`);
      }
      if (typeof p.lat !== 'number' || typeof p.lon !== 'number') {
        throw new Error(`Port master entry missing coordinates for ${p.unlocode}`);
      }
      if (seenUnlocodes.has(p.unlocode)) {
        throw new Error(`Duplicate UNLOCODE in port master: ${p.unlocode}`);
      }
      seenUnlocodes.add(p.unlocode);
      this.set(portLookupKey(p.name), p);
      this.unlocodeMap.set(p.unlocode.toUpperCase(), p);
    }
    // Second pass: index aliases, but never overwrite a real name key — a real
    // port named "JNPT" must win over another port that lists "JNPT" as an
    // alias. This is what makes alias-only ports (Marghera→Venice, Lagos→Apapa,
    // Dubai→Jebel Ali) resolvable, since `normalizePortName` keeps them canonical.
    for (const p of entries) {
      for (const alias of p.aliases ?? []) {
        const key = portLookupKey(alias);
        if (key && !this.has(key)) this.set(key, p);
      }
    }
  }

  byUnlocode(code: string | null | undefined): PortMaster | null {
    if (!code) return null;
    return this.unlocodeMap.get(code.toUpperCase()) ?? null;
  }
}

let cache: PortMasterIndex | null = null;
let cacheSource: unknown = null;

export function clearPortMasterCache(): void {
  cache = null;
  cacheSource = null;
}

export function loadPortMasterFromJson(data: PortMaster[]): PortMasterIndex {
  if (cache && cacheSource === data) return cache;
  const index = new PortMasterIndex(data);
  cache = index;
  cacheSource = data;
  return index;
}
