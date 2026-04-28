export type DealPriority = 'urgent' | 'attention' | 'ok';

export interface DigestDeal {
  dealId: string;
  description: string;
  priority: DealPriority;
  note?: string;
}

function formatDate(now: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(now);
}

function buildDealsSection(deals: DigestDeal[]): string {
  const urgent = deals.filter((d) => d.priority === 'urgent');
  const attention = deals.filter((d) => d.priority === 'attention');
  const ok = deals.filter((d) => d.priority === 'ok');

  const lines: string[] = [];

  if (urgent.length > 0) {
    lines.push(`🔴 URGENT (${urgent.length}):`);
    for (const d of urgent) {
      lines.push(d.note ? `${d.dealId} / ${d.description} — ${d.note}` : `${d.dealId} / ${d.description}`);
    }
    lines.push('');
  }

  if (attention.length > 0) {
    lines.push(`⚠️ ATTENTION (${attention.length}):`);
    for (const d of attention) {
      lines.push(d.note ? `${d.dealId} / ${d.description} — ${d.note}` : `${d.dealId} / ${d.description}`);
    }
    lines.push('');
  }

  if (ok.length > 0) {
    lines.push(`✅ OK (${ok.length} deals)`);
    lines.push('');
  }

  return lines.join('\n');
}

const MARKET_LINE = '📊 Market: BHSI 730 (+15) · VLSFO Rotterdam $651 (-$8)';

export async function buildDigest(
  _sessionId: string,
  now: Date,
  deals: DigestDeal[] = [],
): Promise<string> {
  const dateStr = formatDate(now);
  const header = `🌅 Good morning. ${dateStr}:`;

  if (deals.length === 0) {
    return [
      header,
      '',
      MARKET_LINE,
      '',
      'Forward your next inquiry to get cargo-vessel matches in <30 seconds.',
    ].join('\n');
  }

  const dealsSection = buildDealsSection(deals);

  return [header, '', dealsSection, MARKET_LINE].join('\n');
}
