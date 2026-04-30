export type VesselPosition = {
  imo: string;
  mmsi?: string;
  lat: number;
  lon: number;
  speedKn: number;
  headingDeg: number;
  navStatus: string;
  timestampUtc: string; // ISO-8601
};

export type VesselEta = {
  imo: string;
  destination: string;
  etaUtc: string | null;
  source: 'ais' | 'voyage' | 'manual';
};

export interface AisAdapter {
  getPosition(imo: string): Promise<VesselPosition | null>;
  getEta(imo: string): Promise<VesselEta | null>;
  getStatusFeed(imos: string[]): Promise<VesselPosition[]>;
}

export class AisAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AisAdapterError';
  }
}
