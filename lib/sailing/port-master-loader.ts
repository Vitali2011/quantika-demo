/**
 * Port master JSON loader — lazy, in-memory cached.
 *
 * Called by `getPortMaster()` to populate the lookup map from
 * `data/ports/port-master.json`. Source identity (`===`) is the cache key, so
 * test fixtures and production JSON can coexist without manual invalidation
 * as long as callers pass the same array reference.
 */

import type { PortMaster } from './port-master';

/** Map keyed by `name.toLowerCase()` plus a secondary `byUnlocode` index. */
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
      this.set(p.name.toLowerCase(), p);
      this.unlocodeMap.set(p.unlocode.toUpperCase(), p);
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
