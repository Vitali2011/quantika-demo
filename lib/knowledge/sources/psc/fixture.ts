/**
 * SYNTHETIC FIXTURE FOR DEMO — do not redistribute.
 *
 * 16 Port-State-Control inspection records spread across 5 IMOs that also
 * appear in `lib/sample-data/imo/cii.json` (fleet-aligned 2026-06-12, audit A.2 —
 * IMOs match vessels that actually hold matches on the demo board), so the demo flow can correlate
 * PSC history with CII ratings (poor-rated vessels have more deficiencies +
 * detentions; well-rated vessels have a clean record).
 *
 * Schema matches `lib/migrations/028-psc-history.ts` (`psc_detention_history`):
 * deficiencies is a count, not an array of codes; authority is constrained
 * to {paris-mou, tokyo-mou, uscg, other}.
 *
 * Dates: spread across the last ~24 months from May 2026.
 * Ports: 4 UN/LOCODEs (NLRTM, ESALG, JPYOK, USORF).
 * Detained ratio: 4/16 = 25% (below the 30% cap used in fixture tests).
 */
import type { PscRecord } from '@/lib/market/psc-repository';

export const PSC_FIXTURE: PscRecord[] = [
  // 8887296 — CII rating D (poor) — repeat Paris-MoU activity, one detention
  {
    id: 'psc-8887296-2024-09-12',
    imo: '8887296',
    inspection_date: '2024-09-12',
    port: 'NLRTM',
    authority: 'paris-mou',
    deficiencies: 4,
    detained: false,
    source_url: null,
  },
  {
    id: 'psc-8887296-2025-03-04',
    imo: '8887296',
    inspection_date: '2025-03-04',
    port: 'ESALG',
    authority: 'paris-mou',
    deficiencies: 7,
    detained: true,
    source_url: null,
  },
  {
    id: 'psc-8887296-2025-08-21',
    imo: '8887296',
    inspection_date: '2025-08-21',
    port: 'NLRTM',
    authority: 'paris-mou',
    deficiencies: 3,
    detained: false,
    source_url: null,
  },
  {
    id: 'psc-8887296-2026-02-15',
    imo: '8887296',
    inspection_date: '2026-02-15',
    port: 'ESALG',
    authority: 'paris-mou',
    deficiencies: 2,
    detained: false,
    source_url: null,
  },

  // 9166510 — CII rating E (very poor) — multiple detentions across MoUs
  {
    id: 'psc-9166510-2024-08-04',
    imo: '9166510',
    inspection_date: '2024-08-04',
    port: 'USORF',
    authority: 'uscg',
    deficiencies: 5,
    detained: false,
    source_url: null,
  },
  {
    id: 'psc-9166510-2025-01-19',
    imo: '9166510',
    inspection_date: '2025-01-19',
    port: 'JPYOK',
    authority: 'tokyo-mou',
    deficiencies: 9,
    detained: true,
    source_url: null,
  },
  {
    id: 'psc-9166510-2025-09-10',
    imo: '9166510',
    inspection_date: '2025-09-10',
    port: 'NLRTM',
    authority: 'paris-mou',
    deficiencies: 6,
    detained: true,
    source_url: null,
  },
  {
    id: 'psc-9166510-2026-03-22',
    imo: '9166510',
    inspection_date: '2026-03-22',
    port: 'USORF',
    authority: 'uscg',
    deficiencies: 4,
    detained: false,
    source_url: null,
  },

  // 9191101 — CII rating B (good) — light history, no detentions
  {
    id: 'psc-9191101-2024-11-08',
    imo: '9191101',
    inspection_date: '2024-11-08',
    port: 'NLRTM',
    authority: 'paris-mou',
    deficiencies: 1,
    detained: false,
    source_url: null,
  },
  {
    id: 'psc-9191101-2025-05-14',
    imo: '9191101',
    inspection_date: '2025-05-14',
    port: 'JPYOK',
    authority: 'tokyo-mou',
    deficiencies: 0,
    detained: false,
    source_url: null,
  },
  {
    id: 'psc-9191101-2026-01-09',
    imo: '9191101',
    inspection_date: '2026-01-09',
    port: 'ESALG',
    authority: 'paris-mou',
    deficiencies: 2,
    detained: false,
    source_url: null,
  },

  // 9125085 — CII rating A (excellent) — minimal, clean
  {
    id: 'psc-9125085-2024-12-02',
    imo: '9125085',
    inspection_date: '2024-12-02',
    port: 'USORF',
    authority: 'uscg',
    deficiencies: 0,
    detained: false,
    source_url: null,
  },
  {
    id: 'psc-9125085-2025-10-17',
    imo: '9125085',
    inspection_date: '2025-10-17',
    port: 'NLRTM',
    authority: 'paris-mou',
    deficiencies: 1,
    detained: false,
    source_url: null,
  },

  // 9238363 — CII rating D (poor) — Tokyo-MoU detention
  {
    id: 'psc-9238363-2024-07-30',
    imo: '9238363',
    inspection_date: '2024-07-30',
    port: 'JPYOK',
    authority: 'tokyo-mou',
    deficiencies: 3,
    detained: false,
    source_url: null,
  },
  {
    id: 'psc-9238363-2025-04-25',
    imo: '9238363',
    inspection_date: '2025-04-25',
    port: 'JPYOK',
    authority: 'tokyo-mou',
    deficiencies: 8,
    detained: true,
    source_url: null,
  },
  {
    id: 'psc-9238363-2025-11-11',
    imo: '9238363',
    inspection_date: '2025-11-11',
    port: 'ESALG',
    authority: 'paris-mou',
    deficiencies: 2,
    detained: false,
    source_url: null,
  },
];

export const PSC_FIXTURE_IMOS = ['8887296', '9166510', '9191101', '9125085', '9238363'] as const;
