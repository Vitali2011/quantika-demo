import React from 'react';
import type { Renderable } from '@/lib/types';

/**
 * Universal safe renderer — handles ConfidenceField objects, plain values, null/undefined.
 * Shared by cargo, vessel, fixture, match detail pages.
 */
export function safeRender(v: Renderable): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return safeRender(v.value as Renderable);
  return JSON.stringify(v);
}

/**
 * Extract confidence level string from a ConfidenceField (or undefined for plain values).
 */
export function getConf(v: Renderable): string | undefined {
  if (v != null && typeof v === 'object') return v.confidence;
  return undefined;
}

/**
 * Renders a coloured confidence badge icon.
 * Returns null when confidence is absent so callers can conditionally render.
 */
export function ConfIcon({
  confidence,
}: {
  confidence?: string;
}): React.ReactElement | null {
  if (confidence === 'uncertain')
    return React.createElement('span', { title: 'Uncertain — check original' }, '❓');
  if (confidence === 'interpreted')
    return React.createElement('span', { title: 'AI interpreted — may be ambiguous' }, '⚠️');
  if (confidence === 'confirmed')
    return React.createElement('span', { title: 'Confirmed from email text' }, '✅');
  return null;
}
