export type DataTier = 'live' | 'estimated' | 'stale';

export interface DataQuality {
  tier: DataTier;
  source?: string;
  asOf?: string;
  note?: string;
}
