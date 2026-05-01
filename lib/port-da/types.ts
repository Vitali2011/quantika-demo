export type PortDaQuery = {
  portCode: string;
  vesselDwt: number;
  cargoType?: string;
};

export type PortDaBreakdown = {
  portCode: string;
  vesselDwt: number;
  portDuesUsd: number;
  pilotageUsd: number;
  tugsUsd: number;
  stevedoringUsdPerMt: number;
  /** dues + pilotage + tugs */
  totalFixedUsd: number;
  confidence: 'verified' | 'estimated' | 'low';
  source: string;
};
