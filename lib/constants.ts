import type { ConfidenceLevel } from './types';

// ── Wave α: Confidence UX ────────────────────────────────────────────────────

/** Tailwind border classes for each confidence level in the 4-color trust UX. */
export const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  verified: 'border-blue-500',
  inferred: 'border-yellow-500',
  uncertain: 'border-orange-500',
  missing: 'border-gray-400',
};

// ── Wave α: MENA Timezones ───────────────────────────────────────────────────

/** IANA timezone identifiers for regions where Quantika operates. */
export const MENA_TIMEZONES = {
  dubai: 'Asia/Dubai',
  riyadh: 'Asia/Riyadh',
  cairo: 'Africa/Cairo',
  istanbul: 'Europe/Istanbul',
  lagos: 'Africa/Lagos',
  casablanca: 'Africa/Casablanca',
} as const;

export type MenaTimezoneKey = keyof typeof MENA_TIMEZONES;

// ── Wave α: WhatsApp Bot Scheduler ──────────────────────────────────────────

/** Quiet period for MENA (Friday prayer window). Used by WhatsApp bot (spec-09). */
export const FRIDAY_QUIET_HOURS_GST = {
  startHour: 13,                      // 13:00 GST
  endHour: 15,                        // 15:00 GST
  timezone: 'Asia/Dubai',             // GST = Dubai
} as const;

/** Morning digest send hour in GST. 8.5 = 08:30. Used by WhatsApp digest scheduler (spec-09). */
export const MORNING_DIGEST_HOUR_GST = 8.5;  // 08:30 GST

// ────────────────────────────────────────────────────────────────────────────

export const CLIPROXY_BASE_URL = process.env.CLIPROXY_BASE_URL || 'http://localhost:8317/v1';
export const CLIPROXY_API_KEY = process.env.CLIPROXY_API_KEY || 'cliproxy-key-1';
export const AI_MODEL_HEAVY = process.env.AI_MODEL_HEAVY || 'gpt-5.5';
export const AI_MODEL_LIGHT = process.env.AI_MODEL_LIGHT || 'gpt-5.5';

/**
 * Session time-to-live: 1 hour (3 600 000 ms).
 *
 * - **Why 1 hour:** covers a typical single brokerage workflow end-to-end
 *   (email fetch → classify → parse → match → draft reply) with comfortable
 *   headroom. Shorter TTLs risk cutting off in-flight AI pipelines.
 *
 * - **SQLite persistence & PM2 restarts:** sessions are stored in
 *   `data/sessions.db` rather than in-memory, so they survive a PM2 restart
 *   or Next.js hot-reload. In-flight work (parsed cargos, vessel matches, etc.)
 *   remains accessible to the broker within the TTL window even after a restart.
 *
 * - **Disk usage:** each session row serialises full `SessionData` as JSON
 *   (emails, classifications, matches, …). Extending beyond 1 hour increases
 *   `data/sessions.db` size proportionally — evaluate before raising the value.
 */
export const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour — non-demo OAuth sessions
// Demo sessions: default 30 days so session_id cookie and DB row outlive the demo_auth window.
// Override via env for testing or custom deployments.
export const DEMO_SESSION_TTL_MS =
  parseInt(process.env.DEMO_SESSION_TTL_MS ?? '', 10) || 30 * 24 * 60 * 60 * 1000;
export const EMAIL_FETCH_COUNT = 50;
export const MIN_THREAD_LENGTH_FOR_RECAP = 5;
export const MAX_EMAIL_BODY_CHARS = 3000;
export const UNANSWERED_THRESHOLD_HOURS = 48;

export const MINUTES_SAVED_PER_RATE_REQUEST = 15;
export const MINUTES_SAVED_PER_RECAP = 30;
export const MINUTES_SAVED_PER_MATCHING = 60;

// Freshness defaults (days)
export const FRESHNESS_VESSEL_DEFAULT_DAYS = 5;
export const FRESHNESS_CARGO_DEFAULT_DAYS = 5;
export const FRESHNESS_DOCUMENT_DAYS = 30;
export const FRESHNESS_CLIENT_REPLY_DAYS = 3;

export const CATEGORY_LABELS: Record<string, string> = {
  CARGO_INQUIRY: 'Cargo Inquiries',
  VESSEL_POSITION: 'Vessel Positions',
  FIXTURE_RECAP: 'Fixture Recaps',
  CLIENT_REPLY: 'Client Replies',
  DOCUMENT: 'Documents',
  VESSEL_CERTIFICATE: 'Vessel Certificates',
  TCT_REQUEST: 'TCT Requests',
  OTHER: 'Other',
};

export const CATEGORY_COLORS: Record<string, string> = {
  CARGO_INQUIRY: 'bg-green-100 text-green-800',
  VESSEL_POSITION: 'bg-blue-100 text-blue-800',
  FIXTURE_RECAP: 'bg-purple-100 text-purple-800',
  CLIENT_REPLY: 'bg-orange-100 text-orange-800',
  DOCUMENT: 'bg-yellow-100 text-yellow-800',
  VESSEL_CERTIFICATE: 'bg-teal-100 text-teal-800',
  TCT_REQUEST: 'bg-indigo-100 text-indigo-800',
  OTHER: 'bg-gray-100 text-gray-800',
};

export const STATUS_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  NEEDS_ACTION: { label: 'Needs Action', color: 'bg-red-100 text-red-800', emoji: '🔴' },
  PENDING: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', emoji: '🟡' },
  RESPONDED: { label: 'Responded', color: 'bg-green-100 text-green-800', emoji: '🟢' },
  INFO_ONLY: { label: 'Info Only', color: 'bg-gray-100 text-gray-600', emoji: '⚪' },
};

export const CALENDLY_URL = 'https://wa.me/971528429812';

// ── TZ-015: Bunker Defaults by Vessel Class ──

export type VesselClassName = "handysize" | "supramax" | "panamax" | "capesize";

export const BUNKER_DEFAULTS: Record<VesselClassName, { speed: number; consumption: number; bunkerPrice: number }> = {
  handysize:  { speed: 12.5, consumption: 22, bunkerPrice: 550 },
  supramax:   { speed: 13.5, consumption: 28, bunkerPrice: 550 },
  panamax:    { speed: 14.0, consumption: 32, bunkerPrice: 550 },
  capesize:   { speed: 14.5, consumption: 45, bunkerPrice: 550 },
};

export const VESSEL_CLASS: Record<VesselClassName, { minDwt: number; maxDwt: number }> = {
  handysize:  { minDwt: 15000, maxDwt: 35000 },
  supramax:   { minDwt: 50000, maxDwt: 65000 },
  panamax:    { minDwt: 65000, maxDwt: 90000 },
  capesize:   { minDwt: 100000, maxDwt: 400000 },
};
