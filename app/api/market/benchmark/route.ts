import { NextResponse } from 'next/server';
import type { MarketIndicator } from '@/lib/types';
import { getCurrentBenchmark } from '@/lib/market/benchmark';

const VALID_INDICATORS: ReadonlySet<string> = new Set<MarketIndicator>([
  'TOEPFER_TMI',
  'DREWRY_BREAKBULK',
  'BHSI',
]);

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const indicator = searchParams.get('indicator');

  if (!indicator || !VALID_INDICATORS.has(indicator)) {
    return NextResponse.json(
      { error: 'Missing or invalid indicator. Use ?indicator=TOEPFER_TMI' },
      { status: 400 },
    );
  }

  const benchmark = await getCurrentBenchmark(indicator as MarketIndicator);

  if (!benchmark) {
    return NextResponse.json(
      { error: `No benchmark data available for ${indicator}` },
      { status: 404 },
    );
  }

  return NextResponse.json(benchmark, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
