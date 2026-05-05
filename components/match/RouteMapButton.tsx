'use client';

/**
 * components/match/RouteMapButton.tsx
 * Wave γ, spec-12: UI button + modal for Imagen 4 route-map wow-feature.
 *
 * Shows a "Generate route visual" button when ROUTE_MAP_ENABLED=true.
 * On click: calls /api/ai/generate-route-map, displays PNG in a modal.
 * Supports image download.
 */

import { useState } from 'react';
import { Loader2, Map, X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { csrfFetch } from '@/lib/csrf-client';

export interface RouteMapButtonProps {
  matchId: string;
  /** Origin vessel position (e.g. "Singapore Anchorage") */
  origin?: string;
  /** Loading port name (e.g. "Port Klang") */
  loadingPort: string;
  /** Discharge port name (e.g. "Jebel Ali") */
  dischargePort: string;
  /** ETA string (optional, e.g. "2026-05-15") */
  eta?: string;
  /** When false, button is hidden. Controlled by ROUTE_MAP_ENABLED env on server side. */
  enabled?: boolean;
}

export function RouteMapButton({
  matchId,
  origin,
  loadingPort,
  dischargePort,
  eta,
  enabled = false,
}: RouteMapButtonProps) {
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  if (!enabled) return null;

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await csrfFetch('/api/ai/generate-route-map', {
        method: 'POST',
        body: JSON.stringify({
          matchId,
          origin: origin ?? 'Unknown',
          loading_port: loadingPort,
          discharge_port: dischargePort,
          eta,
        }),
      });
      const data = (await res.json()) as { imageUrl?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to generate route map');
      }
      if (!data.imageUrl) {
        throw new Error('No image URL returned');
      }
      setImageUrl(data.imageUrl);
      setModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate route map');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setModalOpen(false);
  }

  function handleDownload() {
    if (!imageUrl) return;
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `route-map-${matchId}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={loading}
          className="gap-2"
          data-testid="route-map-button"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Map className="h-4 w-4" />
          )}
          {loading ? 'Generating...' : 'Generate route visual'}
        </Button>
        {error && (
          <p className="text-xs text-red-600" data-testid="route-map-error">
            {error}
          </p>
        )}
      </div>

      {/* Modal */}
      {modalOpen && imageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={handleClose}
          data-testid="route-map-modal-backdrop"
        >
          <div
            className="relative max-w-3xl w-full bg-white rounded-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            data-testid="route-map-modal"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="text-sm font-semibold text-gray-800">
                Route Map: {loadingPort} → {dischargePort}
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  className="gap-1 text-xs"
                  data-testid="route-map-download"
                >
                  <Download className="h-3 w-3" />
                  Download
                </Button>
                <button
                  onClick={handleClose}
                  className="p-1 rounded hover:bg-gray-100 transition"
                  aria-label="Close route map"
                  data-testid="route-map-close"
                >
                  <X className="h-4 w-4 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Image */}
            <div className="p-4 bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={`Route map from ${loadingPort} to ${dischargePort}`}
                className="w-full rounded border border-gray-200"
                data-testid="route-map-image"
              />
            </div>

            {/* Footer note */}
            <p className="text-xs text-gray-400 text-center pb-3">
              AI-generated infographic via Imagen 4 — for illustration purposes only
            </p>
          </div>
        </div>
      )}
    </>
  );
}
