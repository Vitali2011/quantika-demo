export const CLIPROXY_BASE_URL = process.env.CLIPROXY_BASE_URL || 'http://localhost:8317/v1';
export const CLIPROXY_API_KEY = process.env.CLIPROXY_API_KEY || 'cliproxy-key-1';
export const AI_MODEL_HEAVY = process.env.AI_MODEL_HEAVY || 'gpt-5.4';
export const AI_MODEL_LIGHT = process.env.AI_MODEL_LIGHT || 'gpt-5.3-codex';

export const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
export const EMAIL_FETCH_COUNT = 50;
export const MIN_THREAD_LENGTH_FOR_RECAP = 5;
export const MAX_EMAIL_BODY_CHARS = 3000; // truncate for classification
export const UNANSWERED_THRESHOLD_DAYS = 1;

export const REVENUE_PER_UNANSWERED = 3000; // USD, conservative estimate
export const REVENUE_PER_UNANSWERED_HIGH = 6000; // USD, optimistic estimate
export const MINUTES_SAVED_PER_RATE_REQUEST = 15;
export const MINUTES_SAVED_PER_RECAP = 30;

export const CATEGORY_LABELS: Record<string, string> = {
  RATE_REQUEST: 'Rate Requests',
  CLIENT_REPLY: 'Client Replies',
  DOCUMENT: 'Documents',
  CARRIER_UPDATE: 'Carrier Updates',
  OTHER: 'Other',
};

export const CATEGORY_COLORS: Record<string, string> = {
  RATE_REQUEST: 'bg-green-100 text-green-800',
  CLIENT_REPLY: 'bg-blue-100 text-blue-800',
  DOCUMENT: 'bg-yellow-100 text-yellow-800',
  CARRIER_UPDATE: 'bg-orange-100 text-orange-800',
  OTHER: 'bg-gray-100 text-gray-800',
};

export const CALENDLY_URL = 'https://calendly.com/quantika'; // placeholder
