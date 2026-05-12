/**
 * BIMCO fixture data for tests and development
 * Static data (no real scraping) — spec gamma-09
 */

import type { BimcoClause } from './types';

export const BIMCO_FIXTURE_CLAUSES: BimcoClause[] = [
  {
    id: 'gencon2022-box1',
    charterParty: 'GENCON 2022',
    clauseNumber: '1',
    title: 'Vessel Name',
    text: 'The vessel shall be named and identified as specified in Box 1. The vessel must maintain its identity throughout the charter period and notify the charterer of any changes to its registration or flag.',
    sourceUrl: 'https://www.bimco.org/contracts-and-clauses/bimco-contracts/gencon',
  },
  {
    id: 'gencon2022-box3',
    charterParty: 'GENCON 2022',
    clauseNumber: '3',
    title: 'Loading Port',
    text: 'The cargo shall be loaded at the port or place indicated in Box 3, subject to safe berth and safe port requirements. The charterer warrants that the loading port is safe for the vessel at all times.',
    sourceUrl: 'https://www.bimco.org/contracts-and-clauses/bimco-contracts/gencon',
  },
  {
    id: 'gencon2022-clause8',
    charterParty: 'GENCON 2022',
    clauseNumber: '8',
    title: 'Laytime',
    text: 'Laytime shall commence upon tender of Notice of Readiness (NOR) and acceptance by the charterer. Time used for loading and discharging shall count against the laytime allowed, unless otherwise agreed. Demurrage shall be payable at the rate specified in Box 16.',
    sourceUrl: 'https://www.bimco.org/contracts-and-clauses/bimco-contracts/gencon',
  },
  {
    id: 'heavycon-clause1',
    charterParty: 'HEAVYCON',
    clauseNumber: '1',
    title: 'Description of Heavy Lift Cargo',
    text: 'The cargo shall consist of heavy lift items as described in Appendix A. Each piece shall be properly secured and stowed in accordance with the vessel\'s cargo securing manual and applicable IMO guidelines for heavy cargo.',
    sourceUrl: 'https://www.bimco.org/contracts-and-clauses/bimco-contracts/heavycon',
  },
  {
    id: 'heavycon-clause4',
    charterParty: 'HEAVYCON',
    clauseNumber: '4',
    title: 'Loading and Discharge Operations',
    text: 'The charterer shall provide suitable cranes and equipment for loading and discharging operations. The master shall supervise all cargo operations to ensure compliance with vessel stability requirements and safe working load limits.',
    sourceUrl: 'https://www.bimco.org/contracts-and-clauses/bimco-contracts/heavycon',
  },
  {
    id: 'projectcon-clause1',
    charterParty: 'PROJECTCON',
    clauseNumber: '1',
    title: 'Project Description',
    text: 'This charter party covers the transportation of project cargo as specified in the project scope document. The carrier shall provide specialized vessels suitable for the carriage of oversized and heavy project components.',
    sourceUrl: 'https://www.bimco.org/contracts-and-clauses/bimco-contracts/projectcon',
  },
  {
    id: 'projectcon-clause7',
    charterParty: 'PROJECTCON',
    clauseNumber: '7',
    title: 'Route and Weather',
    text: 'The vessel shall proceed by the most direct and customary route to the discharge port, weather and ice permitting. The master may deviate from the planned route if necessary for safety or to avoid delays due to weather conditions.',
    sourceUrl: 'https://www.bimco.org/contracts-and-clauses/bimco-contracts/projectcon',
  },
];
