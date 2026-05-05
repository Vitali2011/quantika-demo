import type Database from 'better-sqlite3';
import { registerSource } from './governance';
import type { RegisterSourceInput } from './types';

export const KNOWLEDGE_REGISTRY: RegisterSourceInput[] = [
  // === Sanctions ===
  {
    slug: 'ofac',
    name: 'OFAC SDN List',
    kind: 'structured_rows',
    category: 'sanctions',
    source_url: 'https://www.treasury.gov/ofac/downloads/sdn.xml',
    license: 'US Public Domain',
    refresh_mode: 'auto-daily',
    stale_threshold_days: 2,
    refresh_command: 'npm run knowledge:refresh ofac',
    primary_table: 'ofac_entities',
  },
  {
    slug: 'eu-sanctions',
    name: 'EU Consolidated Sanctions',
    kind: 'structured_rows',
    category: 'sanctions',
    source_url: 'https://webgate.ec.europa.eu/europeaid/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=',
    license: 'EU Public',
    refresh_mode: 'auto-daily',
    stale_threshold_days: 2,
    refresh_command: 'npm run knowledge:refresh eu-sanctions',
    primary_table: 'eu_sanctions_entities',
  },
  // === Reference ===
  {
    slug: 'distances',
    name: 'Port-to-Port Sea Distances',
    kind: 'structured_rows',
    category: 'reference',
    license: 'Apache-2.0 (searoute-py)',
    refresh_mode: 'one-shot',
    stale_threshold_days: 365,
    refresh_command: 'npm run knowledge:refresh distances',
    primary_table: 'port_distances',
  },
  // === Regulatory ===
  {
    slug: 'jwc',
    name: 'JWC Listed Areas (war risk)',
    kind: 'mixed',
    category: 'regulatory',
    source_url: 'https://www.lmalloyds.com/lma/jointwar',
    license: 'LMA Public Bulletin',
    refresh_mode: 'manual',
    stale_threshold_days: 100,
    refresh_command: 'npm run knowledge:refresh jwc',
    primary_table: 'war_risk_zones',
    vector_table: 'jwc_vec',
  },
  {
    slug: 'eca',
    name: 'ECA Zones (MARPOL Annex VI)',
    kind: 'structured_rows',
    category: 'regulatory',
    source_url: 'https://www.imo.org/en/OurWork/Environment/Pages/Air-Pollution.aspx',
    license: 'IMO Public',
    refresh_mode: 'one-shot',
    stale_threshold_days: 1500,
    refresh_command: 'npm run knowledge:refresh eca',
    primary_table: 'eca_zones',
  },
  {
    slug: 'panama-tariffs',
    name: 'Panama Canal Tariffs (ACP)',
    kind: 'structured_rows',
    category: 'regulatory',
    source_url: 'https://pancanal.com/en/maritime-services/tariff/',
    license: 'ACP Public',
    refresh_mode: 'manual',
    stale_threshold_days: 365,
    refresh_command: 'npm run knowledge:refresh panama-tariffs',
    primary_table: 'canal_tariffs',
  },
  // === Phase 2 placeholders ===
  {
    slug: 'imsbc',
    name: 'IMSBC Code',
    kind: 'vector_chunks',
    category: 'regulatory',
    source_url: 'https://www.imorules.com/INTBSBCC.html',
    license: 'IMO Public',
    refresh_mode: 'one-shot',
    stale_threshold_days: 800,
    refresh_command: 'npm run knowledge:refresh imsbc',
    vector_table: 'imsbc_vec',
  },
  {
    slug: 'igc',
    name: 'IGC Grain Code',
    kind: 'vector_chunks',
    category: 'regulatory',
    source_url: 'https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/MSCResolutions/MSC.23(59).pdf',
    license: 'IMO Public',
    refresh_mode: 'one-shot',
    stale_threshold_days: 800,
    refresh_command: 'npm run knowledge:refresh igc',
    vector_table: 'igc_vec',
  },
  {
    slug: 'unlocode',
    name: 'UN/LOCODE Directory',
    kind: 'structured_rows',
    category: 'reference',
    source_url: 'https://unece.org/trade/cefact/UNLOCODE-Download',
    license: 'UNECE Public',
    refresh_mode: 'manual',
    stale_threshold_days: 200,
    refresh_command: 'npm run knowledge:refresh unlocode',
    primary_table: 'port_master',
  },
  {
    slug: 'baltic-indices',
    name: 'Baltic Dry Indices (TradingEconomics)',
    kind: 'structured_rows',
    category: 'market',
    source_url: 'https://tradingeconomics.com/commodity/baltic',
    license: 'TradingEconomics free tier',
    refresh_mode: 'manual',
    stale_threshold_days: 14,
    refresh_command: 'npm run knowledge:refresh baltic-indices',
    primary_table: 'baltic_indices',
  },
];

/**
 * Idempotent bootstrap: registers every source from KNOWLEDGE_REGISTRY that is
 * not yet present in `knowledge_sources`. Existing rows are left untouched so
 * that runtime state (status, last_synced_at, consecutive_failures, ...) is
 * preserved across restarts.
 *
 * Migration 013 must have run before this is called.
 */
export function bootstrapKnowledgeSources(db: Database.Database): void {
  const tx = db.transaction(() => {
    for (const src of KNOWLEDGE_REGISTRY) {
      const exists = db.prepare('SELECT 1 FROM knowledge_sources WHERE slug = ?').get(src.slug);
      if (exists) continue; // preserve runtime status
      registerSource(db, src);
    }
  });
  tx();
}
