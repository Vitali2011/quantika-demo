/** Audit C.1: a voyage entering/leaving the Black Sea transits the Bosporus
 *  regardless of where the other endpoint lies (Novorossiysk→Mumbai paid Suez
 *  but not Bosporus under the old med↔blacksea-only rule). */
import { routeTransitsBosporus, classifyPortBasin } from '@/lib/matching/tce-calculator';

describe('routeTransitsBosporus (audit C.1)', () => {
  it('sanity: basins classify as expected', () => {
    expect(classifyPortBasin('Novorossiysk')).toBe('blacksea');
    expect(classifyPortBasin('Mumbai')).toBe('indian');
    expect(classifyPortBasin('Rotterdam')).toBe('atlantic');
  });

  it('charges Black Sea ↔ east-of-Suez (the audit case)', () => {
    expect(routeTransitsBosporus('Novorossiysk', 'Mumbai')).toBe(true);
    expect(routeTransitsBosporus('Mumbai', 'Constanta')).toBe(true);
  });

  it('charges Black Sea ↔ Atlantic Europe', () => {
    expect(routeTransitsBosporus('Odessa', 'Rotterdam')).toBe(true);
  });

  it('still charges med ↔ blacksea both directions', () => {
    expect(routeTransitsBosporus('Istanbul', 'Odessa')).toBe(true);
    expect(routeTransitsBosporus('Constanta', 'Genoa')).toBe(true);
  });

  it('does not charge intra-basin or unknown routes', () => {
    expect(routeTransitsBosporus('Odessa', 'Constanta')).toBe(false);   // intra-BlackSea
    expect(routeTransitsBosporus('Genoa', 'Piraeus')).toBe(false);      // intra-Med
    expect(routeTransitsBosporus('Rotterdam', 'Mumbai')).toBe(false);   // no Black Sea endpoint
    expect(routeTransitsBosporus('Odessa', 'Xyzzyport')).toBe(false);   // unknown basin → conservative no-charge
    expect(routeTransitsBosporus(null, 'Odessa')).toBe(false);
  });
});
