import type { BunkerPrice } from './bunker';

export interface SplitBunkerRoute {
  fromPort: string;
  toPort: string;
  intermediatePorts: string[];
}

export interface BunkerPlanEntry {
  port: string;
  volumeMt: number;
}

export interface SplitBunkerResult {
  recommendation: string;
  savingsUsd: number;
  bunkerPlan: BunkerPlanEntry[];
}

export interface SplitBunkerInput {
  route: SplitBunkerRoute;
  bunkerPrices: Map<string, BunkerPrice>;
  consumptionMtPerDay: number;
}

/**
 * Greedy split bunkering optimizer.
 * Loads maximum volume at the cheapest available port on the route.
 * Returns savings vs. buying all fuel at the most expensive available port.
 */
export function optimizeSplitBunker(input: SplitBunkerInput): SplitBunkerResult {
  const { route, bunkerPrices, consumptionMtPerDay } = input;

  const routePorts = [route.fromPort, ...route.intermediatePorts, route.toPort];

  // Filter only ports for which we have prices
  const availablePorts: Array<{ port: string; price: BunkerPrice }> = [];
  for (const port of routePorts) {
    const price = bunkerPrices.get(port);
    if (price) availablePorts.push({ port, price });
  }

  if (availablePorts.length === 0 || consumptionMtPerDay <= 0) {
    return {
      recommendation: 'No bunker price data available for route ports.',
      savingsUsd: 0,
      bunkerPlan: [],
    };
  }

  // Estimate total voyage fuel: assume ~20 days average voyage
  const estimatedDays = 20;
  const totalFuelMt = consumptionMtPerDay * estimatedDays;

  // Sort by VLSFO price ascending — greedy: buy max at cheapest
  const sorted = [...availablePorts].sort((a, b) => a.price.vlsfo - b.price.vlsfo);
  const cheapest = sorted[0];
  const mostExpensive = sorted[sorted.length - 1];

  // Greedy: buy everything at cheapest port
  const bunkerPlan: BunkerPlanEntry[] = [
    { port: cheapest.port, volumeMt: Math.round(totalFuelMt) },
  ];

  const savingsUsd = cheapest.port !== mostExpensive.port
    ? Math.round((mostExpensive.price.vlsfo - cheapest.price.vlsfo) * totalFuelMt * 100) / 100
    : 0;

  const recommendation = savingsUsd > 0
    ? `Bunker at ${cheapest.port} (${cheapest.price.vlsfo} USD/MT) — saves ~$${savingsUsd.toLocaleString()} vs ${mostExpensive.port}`
    : `Bunker at ${cheapest.port} (${cheapest.price.vlsfo} USD/MT)`;

  return { recommendation, savingsUsd, bunkerPlan };
}
