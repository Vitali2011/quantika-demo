import { markActivated, getTrialState } from '../trial';

/**
 * Call this when a quote is sent to mark the trial as activated.
 * Designed to be called from the "Send Quote" flow (spec-06 QuoteTab
 * or API endpoint). Currently exposed for future integration —
 * spec-06 can import and call this when ready.
 */
export async function trackQuoteSent(sessionId: string): Promise<void> {
  const trial = await getTrialState(sessionId);
  if (!trial) return;
  if (trial.activated_at) return; // already activated
  await markActivated(sessionId);
}
