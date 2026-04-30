export type VesselType = 'bulker' | 'tanker' | 'container' | 'general';
export type CanalCode = 'suez' | 'panama' | 'kiel' | 'bosporus';

export interface CanalTariffRow {
  id: number;
  canal: string;
  vessel_type: string;
  scnt_min: number | null;
  scnt_max: number | null;
  base_fee_usd: number;
  per_scnt_fee_usd: number;
  war_risk_zone: string | null;
  valid_from: string;
  valid_to: string | null;
  source: string;
}

/** Common return shape for all canal quotes */
export interface CanalQuote {
  baseFeeUsd: number;
  unitFeeUsd: number;
  warRiskUsd: number;
  totalUsd: number;
  source: string;
}

/** Suez-specific return with SCNT and tier details */
export interface SuezQuote extends CanalQuote {
  scnt: number;
  tier: 1 | 2 | 3 | 4 | 5;
  scntFeeUsd: number;
}

/** Common input for non-Suez canal quotes */
export interface CanalInput {
  vesselDwt: number;
  vesselNt: number;
  vesselType: VesselType;
}

/** Extended input for Suez with laden flag and optional war-risk params */
export interface SuezInput extends CanalInput {
  laden: boolean;
  /** Optional: required for war-risk premium calculation */
  vesselValueUsd?: number;
  daysInHra?: number;
}
