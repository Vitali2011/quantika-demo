export const QUOTE_UPDATE_EVENT = 'quote-update' as const;

type JobUpdateData = {
  id: string;
  status: string;
  progress_percent: number;
  current_step?: string;
  email_subject?: string;
  from?: string;
};

type MatchCreatedData = {
  match_id: string;
  score: number;
  vessel_name?: string;
  cargo_summary?: string;
};

type QuoteUpdateData = {
  id: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  email_id: string;
  result?: string;
  error?: string;
};

type Event =
  | { type: 'job-update'; data: JobUpdateData }
  | { type: 'match-created'; data: MatchCreatedData }
  | { type: typeof QUOTE_UPDATE_EVENT; data: QuoteUpdateData };

type Handler = (e: Event) => void;

const channels = new Map<string, Set<Handler>>();

export const jobEvents = {
  subscribe(userId: string, handler: Handler): () => void {
    let set = channels.get(userId);
    if (!set) {
      set = new Set();
      channels.set(userId, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
      if (set!.size === 0) channels.delete(userId);
    };
  },
};

function emit(userId: string, event: Event): void {
  const set = channels.get(userId);
  if (!set) return;
  for (const h of set) h(event);
}

export function emitJobUpdate(userId: string, data: JobUpdateData): void {
  emit(userId, { type: 'job-update', data });
}

export function emitMatchCreated(userId: string, data: MatchCreatedData): void {
  emit(userId, { type: 'match-created', data });
}

export function emitQuoteUpdate(userId: string, data: QuoteUpdateData): void {
  emit(userId, { type: QUOTE_UPDATE_EVENT, data });
}
