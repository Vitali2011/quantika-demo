/**
 * Canal router — dispatches to the correct canal module by canalCode.
 *
 * Input Contract:
 *   Unknown canalCode → throws Error('Unknown canal code: ...')
 *   Empty string      → throws Error('Unknown canal code: ')
 */

import type { CanalCode, CanalInput, CanalQuote, SuezInput } from './types';
import { quoteSuez } from './suez';
import { quotePanama } from './panama';
import { quoteKiel } from './kiel';
import { quoteBosporus } from './bosporus';

export type { CanalCode, CanalInput, CanalQuote, SuezInput };
export type { SuezQuote } from './types';
export { quoteSuez } from './suez';
export { quotePanama } from './panama';
export { quoteKiel } from './kiel';
export { quoteBosporus } from './bosporus';

export function quoteCanal(
  canalCode: CanalCode,
  input: SuezInput | CanalInput
): CanalQuote {
  switch (canalCode) {
    case 'suez':
      return quoteSuez(input as SuezInput);
    case 'panama':
      return quotePanama(input as CanalInput);
    case 'kiel':
      return quoteKiel(input as CanalInput);
    case 'bosporus':
      return quoteBosporus(input as CanalInput);
    default: {
      const exhaustive: never = canalCode;
      throw new Error(`Unknown canal code: ${exhaustive}`);
    }
  }
}
