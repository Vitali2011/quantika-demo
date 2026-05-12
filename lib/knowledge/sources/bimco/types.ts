/**
 * BIMCO charter party clause types
 * Spec: gamma-09
 */

export type CharterPartyType = 'GENCON 2022' | 'HEAVYCON' | 'PROJECTCON';

export interface BimcoClause {
  id: string;
  charterParty: CharterPartyType;
  clauseNumber: string;
  title: string;
  text: string;
  sourceUrl: string;
}
