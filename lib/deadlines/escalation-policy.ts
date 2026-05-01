/**
 * Escalation policy for subs-deadline guardian (β-10).
 *
 * Maps each escalation stage to the set of channels that should be notified
 * and the urgency template/priority. Centralised so the cron scanner and the
 * UI badge agree on which channels were/are due.
 */

export type EscalationStage = '24h' | '8h' | '4h' | '2h' | 'expired';

export interface ChannelDispatch {
  channel: 'in-app' | 'whatsapp' | 'gmail';
  template: string;
  priority: 'normal' | 'urgent';
}

const POLICY: Record<EscalationStage, ChannelDispatch[]> = {
  '24h': [{ channel: 'in-app', template: 'subs-24h', priority: 'normal' }],
  '8h': [
    { channel: 'in-app', template: 'subs-8h', priority: 'normal' },
    { channel: 'whatsapp', template: 'subs-8h', priority: 'normal' },
  ],
  '4h': [
    { channel: 'in-app', template: 'subs-4h', priority: 'urgent' },
    { channel: 'whatsapp', template: 'subs-4h', priority: 'urgent' },
  ],
  '2h': [
    { channel: 'in-app', template: 'subs-2h', priority: 'urgent' },
    { channel: 'whatsapp', template: 'subs-2h', priority: 'urgent' },
    { channel: 'gmail', template: 'subs-2h', priority: 'urgent' },
  ],
  expired: [
    { channel: 'in-app', template: 'subs-expired', priority: 'urgent' },
    { channel: 'gmail', template: 'subs-expired', priority: 'urgent' },
  ],
};

export function getChannelsForStage(stage: EscalationStage): ChannelDispatch[] {
  return POLICY[stage] ?? [];
}
