export const CLIPROXY_BASE_URL = process.env.CLIPROXY_BASE_URL || 'http://localhost:8317/v1';
export const CLIPROXY_API_KEY = process.env.CLIPROXY_API_KEY || 'cliproxy-key-1';
export const AI_MODEL_HEAVY = process.env.AI_MODEL_HEAVY || 'gpt-5.4-mini';
export const AI_MODEL_LIGHT = process.env.AI_MODEL_LIGHT || 'gpt-5.4-mini';

export const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
export const EMAIL_FETCH_COUNT = 50;
export const MIN_THREAD_LENGTH_FOR_RECAP = 5;
export const MAX_EMAIL_BODY_CHARS = 3000;
export const UNANSWERED_THRESHOLD_HOURS = 48;

export const REVENUE_PER_UNANSWERED = 3000;
export const REVENUE_PER_UNANSWERED_HIGH = 6000;
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
  OTHER: 'Other',
};

export const CATEGORY_COLORS: Record<string, string> = {
  CARGO_INQUIRY: 'bg-green-100 text-green-800',
  VESSEL_POSITION: 'bg-blue-100 text-blue-800',
  FIXTURE_RECAP: 'bg-purple-100 text-purple-800',
  CLIENT_REPLY: 'bg-orange-100 text-orange-800',
  DOCUMENT: 'bg-yellow-100 text-yellow-800',
  OTHER: 'bg-gray-100 text-gray-800',
};

export const STATUS_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  NEEDS_ACTION: { label: 'Needs Action', color: 'bg-red-100 text-red-800', emoji: '🔴' },
  PENDING: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', emoji: '🟡' },
  RESPONDED: { label: 'Responded', color: 'bg-green-100 text-green-800', emoji: '🟢' },
  INFO_ONLY: { label: 'Info Only', color: 'bg-gray-100 text-gray-600', emoji: '⚪' },
};

export const CALENDLY_URL = 'https://wa.me/971528429812';
