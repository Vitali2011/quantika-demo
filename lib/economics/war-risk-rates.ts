import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface JwcRates {
  byCalcZoneId: Record<string, number>; // fraction (not percent): 0.20 → 0.002
  effectiveFrom: string;                // '2026-03-12'
  version: string;                      // 'JWC-2025-current'
  source: 'knowledge';
}

/**
 * YAML zone_id → one or more calc zone IDs (HraZone.id in war-risk.ts).
 * strait-of-hormuz (YAML 2.25%) is intentionally NOT mapped — no separate calc
 * sub-zone exists in v2; Hormuz transits fall under persian-gulf-hra (0.75%).
 * Tracked as future enhancement in the war-risk-v2 plan.
 */
const ZONE_MAP: Record<string, string[]> = {
  'red-sea':                          ['red-sea-hra'],
  'gulf-of-guinea':                   ['gulf-of-guinea'],
  'black-sea':                        ['black-sea-hra'],
  'persian-gulf-oman-indian-ocean':   ['persian-gulf-hra', 'indian-ocean-hra'],
};

const DEFAULT_YAML_PATH = 'data/knowledge/jwc/2025-current.yaml';

let _cache: JwcRates | null | undefined = undefined; // undefined = not yet loaded

export function __resetRateCacheForTest(): void {
  _cache = undefined;
}

export function loadJwcRates(yamlPath?: string): JwcRates | null {
  if (_cache !== undefined) return _cache;

  try {
    const resolvedPath = yamlPath
      ? path.isAbsolute(yamlPath) ? yamlPath : path.join(process.cwd(), yamlPath)
      : path.join(process.cwd(), DEFAULT_YAML_PATH);

    const raw = fs.readFileSync(resolvedPath, 'utf-8');
    const doc = yaml.load(raw) as Record<string, unknown>;

    const byCalcZoneId: Record<string, number> = {};
    const zones = doc['zones'] as Array<Record<string, unknown>>;

    for (const zone of zones ?? []) {
      const zoneId = zone['zone_id'] as string;
      const calcIds = ZONE_MAP[zoneId];
      if (!calcIds) continue; // skip unmapped zones

      const pct = zone['transit_rate_pct'];
      if (pct === null || pct === undefined) continue;
      const pctNum = Number(pct);
      if (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 10) continue;

      for (const calcId of calcIds) {
        byCalcZoneId[calcId] = pctNum / 100;
      }
    }

    _cache = {
      byCalcZoneId,
      effectiveFrom: String(doc['effective_from'] ?? ''),
      version: String(doc['version'] ?? ''),
      source: 'knowledge',
    };
    return _cache;
  } catch {
    _cache = null;
    return null;
  }
}
