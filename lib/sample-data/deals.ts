/**
 * β-08: Sample active-deals fixture for the Sanction Sentinel CLI default
 * provider. Covers corpus 01-05 scenarios (true positives + false-positive
 * IMO-disambiguation) plus clean control deals.
 *
 * Used only when no real deals DB is wired. See `scripts/sentinel-scan.ts`
 * `defaultDealsProvider`.
 */

import type { ActiveDeal } from '@/lib/sanctions/sentinel';

export const sampleDeals: ActiveDeal[] = [
  // corpus-01 true positive: vessel name + IMO match OFAC SDN entry
  {
    id: 'sample-sanction-01-tp',
    counterpartyName: 'Acme Trading Ltd',
    vesselName: 'MV PACIFIC PEARL',
    vesselImo: '9876543',
    loadPort: 'Novorossiysk',
    dischargePort: 'Rotterdam',
  },
  // corpus-02 true positive: counterparty matches Sovcomflot (high-confidence company)
  {
    id: 'sample-sanction-02-tp',
    counterpartyName: 'Sovcomflot Group',
    vesselName: 'NORDIC CARRIER',
    vesselImo: '9555111',
    loadPort: 'Primorsk',
    dischargePort: 'Mumbai',
  },
  // corpus-03 true positive: Dubai shell (medium-confidence company)
  {
    id: 'sample-sanction-03-tp',
    counterpartyName: 'Crystal Maritime FZE',
    vesselName: 'CRYSTAL STAR',
    vesselImo: '9700001',
    loadPort: 'Odessa',
    dischargePort: 'Singapore',
  },
  // corpus-04 false positive: same vessel name, DIFFERENT IMO (legitimate vessel).
  // Sentinel must NOT alert on this deal — IMO disambiguation should clear it.
  {
    id: 'sample-sanction-04-fp',
    counterpartyName: 'Meridian Bulk Carriers',
    vesselName: 'MV PACIFIC PEARL',
    vesselImo: '9412081',
    loadPort: 'Tubarão',
    dischargePort: 'Qingdao',
  },
  // corpus-05 true positive: sanctioned port (Mariupol)
  {
    id: 'sample-sanction-05-tp',
    counterpartyName: 'Azov Trade & Shipping',
    vesselName: 'BLACK SEA TRADER',
    vesselImo: '9800002',
    loadPort: 'Mariupol',
    dischargePort: 'Istanbul',
  },
  // clean control 1: routine Atlantic fixture, no sanction touch-points
  {
    id: 'sample-clean-01',
    counterpartyName: 'Northstar Commodities Ltd',
    vesselName: 'ATLANTIC HORIZON',
    vesselImo: '9300100',
    loadPort: 'Santos',
    dischargePort: 'Hamburg',
  },
  // clean control 2: Asia-Europe container, no sanction touch-points
  {
    id: 'sample-clean-02',
    counterpartyName: 'Pacific Logistics Co',
    vesselName: 'OCEAN BREEZE',
    vesselImo: '9300200',
    loadPort: 'Shanghai',
    dischargePort: 'Antwerp',
  },
];
