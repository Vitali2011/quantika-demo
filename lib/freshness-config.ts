import { EmailCategory } from './types';
import {
  FRESHNESS_VESSEL_DEFAULT_DAYS,
  FRESHNESS_CARGO_DEFAULT_DAYS,
  FRESHNESS_DOCUMENT_DAYS,
  FRESHNESS_CLIENT_REPLY_DAYS,
} from './constants';

/**
 * Declares how expiry is computed for a given EmailCategory.
 *
 * Exactly one of the three strategies must be set:
 *   - `permanent`: expiryDate = null (record never expires, e.g. FIXTURE_RECAP)
 *   - `defaultDays`: expiryDate = emailDate + N days (fixed offset)
 *   - `useParsedField`: prefer a date from the parsed payload; fall back to `defaultDays`
 */
export interface FreshnessRule {
  /** Category never expires — expiryDate is always null. */
  permanent?: true;
  /** Default offset in days from the email date. */
  defaultDays?: number;
  /**
   * When set, first try to read this field from the parsed payload
   * (parsedVessel.openDate or parsedCargo.laycan). Fall back to defaultDays.
   */
  useParsedField?: 'openDate' | 'laycan';
  /**
   * Human-readable label for the expirySource string when defaultDays is used.
   * Defaults to 'default' when useParsedField is set, 'fixed' otherwise.
   */
  defaultSource?: 'default' | 'fixed';
}

/**
 * Declarative freshness rules keyed by EmailCategory.
 *
 * Behavior is identical to the pre-refactor switch/case in freshness.ts:
 *   VESSEL_POSITION  → openDate if present, else +5 days  (source: 'openDate' | 'default')
 *   CARGO_INQUIRY    → laycan  if present, else +5 days   (source: 'laycan'   | 'default')
 *   FIXTURE_RECAP    → permanent (null)                   (source: 'permanent')
 *   DOCUMENT         → +30 days                           (source: 'fixed')
 *   CLIENT_REPLY     → +3 days                            (source: 'fixed')
 *   (other)          → null / null
 */
export const FRESHNESS_CONFIG: Partial<Record<EmailCategory, FreshnessRule>> = {
  VESSEL_POSITION: {
    useParsedField: 'openDate',
    defaultDays: FRESHNESS_VESSEL_DEFAULT_DAYS,
    defaultSource: 'default',
  },
  CARGO_INQUIRY: {
    useParsedField: 'laycan',
    defaultDays: FRESHNESS_CARGO_DEFAULT_DAYS,
    defaultSource: 'default',
  },
  FIXTURE_RECAP: {
    permanent: true,
  },
  DOCUMENT: {
    defaultDays: FRESHNESS_DOCUMENT_DAYS,
    defaultSource: 'fixed',
  },
  CLIENT_REPLY: {
    defaultDays: FRESHNESS_CLIENT_REPLY_DAYS,
    defaultSource: 'fixed',
  },
};
