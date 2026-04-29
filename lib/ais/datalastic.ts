import type Database from 'better-sqlite3';
import { AisAdapterError, type AisAdapter, type VesselPosition, type VesselEta } from './types';
import { getCached, setCached, getStaleCached } from './cache';

const BASE_URL = 'https://api.datalastic.com/api/v0';
const CREDITS_LOW_THRESHOLD = 50;

function parsePosition(data: Record<string, unknown>): VesselPosition {
  return {
    imo: String(data['imo'] ?? ''),
    mmsi: data['mmsi'] != null ? String(data['mmsi']) : undefined,
    lat: Number(data['lat']),
    lon: Number(data['lon']),
    speedKn: Number(data['speed']),
    headingDeg: Number(data['heading']),
    navStatus: String(data['navigational_status'] ?? ''),
    timestampUtc: String(data['time_utc'] ?? ''),
  };
}

function parseEta(data: Record<string, unknown>, imo: string): VesselEta {
  return {
    imo,
    destination: String(data['destination'] ?? ''),
    etaUtc: data['eta'] != null ? String(data['eta']) : null,
    source: 'ais',
  };
}

function getApiKey(): string {
  // Read at request time (not module load) to simplify testing
  const key = process.env['DATALASTIC_API_KEY'];
  if (!key) throw new AisAdapterError('DATALASTIC_API_KEY is not set');
  return key;
}

export class DatalasticAdapter implements AisAdapter {
  /** Set to true when X-Credit-Remaining < CREDITS_LOW_THRESHOLD */
  private creditsLow = false;

  constructor(private readonly db: Database.Database | null = null) {}

  async getPosition(imo: string): Promise<VesselPosition | null> {
    if (!imo) throw new AisAdapterError('IMO is required');
    const apiKey = getApiKey();

    if (this.db) {
      const cached = getCached(this.db, imo, 'position');
      if (cached) return cached as VesselPosition;

      if (this.creditsLow) {
        return (getStaleCached(this.db, imo, 'position') as VesselPosition | null);
      }
    }

    const res = await fetch(
      `${BASE_URL}/vessel?imo=${encodeURIComponent(imo)}&api-key=${encodeURIComponent(apiKey)}`
    );
    if (!res.ok) return null;

    const remaining = Number(res.headers.get('X-Credit-Remaining') ?? Infinity);
    if (remaining < CREDITS_LOW_THRESHOLD) {
      console.warn(`[ais] datalastic credits low: ${remaining}`);
      this.creditsLow = true;
      return this.db ? (getStaleCached(this.db, imo, 'position') as VesselPosition | null) : null;
    }

    const json = (await res.json()) as { data: Record<string, unknown> };
    const position = parsePosition(json.data);
    if (this.db) setCached(this.db, imo, 'position', position);
    return position;
  }

  async getEta(imo: string): Promise<VesselEta | null> {
    if (!imo) throw new AisAdapterError('IMO is required');
    const apiKey = getApiKey();

    if (this.db) {
      const cached = getCached(this.db, imo, 'eta');
      if (cached) return cached as VesselEta;

      if (this.creditsLow) {
        return (getStaleCached(this.db, imo, 'eta') as VesselEta | null);
      }
    }

    const res = await fetch(
      `${BASE_URL}/vessel_eta?imo=${encodeURIComponent(imo)}&api-key=${encodeURIComponent(apiKey)}`
    );
    if (!res.ok) return null;

    const remaining = Number(res.headers.get('X-Credit-Remaining') ?? Infinity);
    if (remaining < CREDITS_LOW_THRESHOLD) {
      console.warn(`[ais] datalastic credits low: ${remaining}`);
      this.creditsLow = true;
      return this.db ? (getStaleCached(this.db, imo, 'eta') as VesselEta | null) : null;
    }

    const json = (await res.json()) as { data: Record<string, unknown> };
    const eta = parseEta(json.data, imo);
    if (this.db) setCached(this.db, imo, 'eta', eta);
    return eta;
  }

  async getStatusFeed(imos: string[]): Promise<VesselPosition[]> {
    if (!imos || imos.length === 0) return [];
    // Ensure API key is present before looping (fail fast)
    getApiKey();

    const results: VesselPosition[] = [];
    for (const imo of imos.filter(Boolean)) {
      const pos = await this.getPosition(imo);
      if (pos) results.push(pos);
    }
    return results;
  }
}
