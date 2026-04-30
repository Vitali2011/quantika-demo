import type { Email } from '@/lib/types';

export type MarkerFormat = 'iso' | 'human-short' | 'human-long' | 'broker-inner';

export interface MarkerDef {
  offsetDays: number;
  format?: MarkerFormat;
}

export interface SampleEmailMeta {
  skipRebase?: boolean;
  emailDateOffsetDays: number;
  laycanStartOffsetDays?: number;
  laycanEndOffsetDays?: number;
  openDateOffsetDays?: number;
  markers?: Record<string, MarkerDef>;
}

export type SampleEmailRaw = Email & { _meta: SampleEmailMeta };
