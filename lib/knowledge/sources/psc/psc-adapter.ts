export interface PscRecord {
  id: string;
  imo: string;
  inspection_date: string; // YYYY-MM-DD
  port: string | null;
  authority: 'paris-mou' | 'tokyo-mou' | 'uscg' | 'other';
  deficiencies: number;
  detained: boolean;
  source_url: string | null;
}

/**
 * Input Contract:
 * - imo: empty ("", null, undefined) → return []
 * - imo: invalid format → accept as-is, API will decide
 * - PSC_DETENTION_ENABLED !== 'true' → return []
 * - PSC_API_BASE_URL not set → return []
 * - API returns 404 → return []
 * - Network error → return []
 * - Non-JSON response → return []
 *
 * Fetches from static JSON endpoint (mocked in tests)
 * URL pattern: PSC_API_BASE_URL/v1/vessels/{imo}/inspections
 * If PSC_DETENTION_ENABLED !== 'true', returns empty array gracefully
 */
export async function fetchPscHistory(imo: string): Promise<PscRecord[]> {
  // Guard against empty/falsy imo
  if (!imo) return [];

  // Check feature flag
  if (process.env.PSC_DETENTION_ENABLED !== 'true') {
    return [];
  }

  // Check base URL
  const baseUrl = process.env.PSC_API_BASE_URL;
  if (!baseUrl) {
    return [];
  }

  try {
    const url = `${baseUrl}/v1/vessels/${imo}/inspections`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    // Validate data is an array
    if (!Array.isArray(data)) {
      return [];
    }

    return data as PscRecord[];
  } catch (error) {
    // Handle network errors and JSON parsing errors gracefully
    return [];
  }
}
