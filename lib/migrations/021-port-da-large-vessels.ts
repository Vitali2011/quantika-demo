import type { Migration } from './types';

const migration021: Migration = {
  version: 21,
  name: 'port-da-large-vessels',
  up(_db) {
    // Marker migration: no schema change.
    // Data inserted by scripts/seed-port-da.ts on app startup
    // (panamax 65k-90k / post-panamax 90k-150k / capesize 150k-200k brackets
    //  for NLRTM, BEANR, SGSIN, AEJEA, SAJED + new port AUPHE).
    // Source: broker-research-2026-05 (see .specs/spec-pdb-00-research.md).
  },
  down(_db) {
    // No schema to revert. To remove data:
    // DELETE FROM port_da_estimates WHERE source = 'broker-research-2026-05';
  },
};

export default migration021;
