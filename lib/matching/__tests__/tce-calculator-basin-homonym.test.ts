/** audit-1 LOW #5 follow-up — basin classification & homonym route context.
 *
 *  Cold-QA flagged that `_classifyPortBasin` resolved a homonym (Cartagena) with
 *  no route context, fearing a Colombian-Cartagena voyage could be misclassified
 *  to the Mediterranean basin and charged spurious Suez/Bosporus dues.
 *
 *  Investigation: basin classification keys on the *name string*, not the resolved
 *  port identity. Two ports sharing a name (Cartagena ES/CO, Tripoli LB/LY) land on
 *  the SAME regex branch; for names absent from every basin regex that means
 *  'unknown' — the conservative, no-canal-charge outcome. So a bare homonym is
 *  already safe. These tests pin that safe behavior and verify the counterpart hint
 *  is threaded through without disturbing correct classifications. */
import {
  classifyPortBasin,
  routeTransitsBosporus,
  routeTransitsSuez,
} from '@/lib/matching/tce-calculator';

describe('basin homonym safety (audit-1 LOW #5 follow-up)', () => {
  it('a bare homonym not in any basin regex classifies as unknown (conservative)', () => {
    // Cartagena is a homonym (ESCAR Spain / COCTG Colombia). Neither variant's
    // canonical name is in a basin regex, so both classify as 'unknown'.
    expect(classifyPortBasin('Cartagena')).toBe('unknown');
    expect(classifyPortBasin('Tripoli')).toBe('unknown');
  });

  it('a Colombian-Cartagena route is NOT charged Suez/Bosporus dues', () => {
    // The feared misclassification: Cartagena → Med → spurious canal charge.
    // unknown basin ⇒ neither canal fires. This is the safety invariant.
    expect(routeTransitsBosporus('Cartagena', 'Constanta')).toBe(false);
    expect(routeTransitsSuez('Cartagena', 'Mumbai')).toBe(false);
  });

  it('threading a counterpart hint leaves correct classifications unchanged', () => {
    // Counterpart context is now passed through to resolvePort's homonym tie-break
    // in the fallback path. It must never flip a port already pinned by regex.
    expect(classifyPortBasin('Genoa', 'Piraeus')).toBe('med');
    expect(classifyPortBasin('Mumbai', 'Rotterdam')).toBe('indian');
    expect(classifyPortBasin('Novorossiysk', 'Mumbai')).toBe('blacksea');
  });

  it('counterpart hint keeps a bare homonym safe (still unknown, no false Med)', () => {
    // Even with a Colombian counterpart the name-keyed classifier returns 'unknown'
    // for Cartagena — it never resolves the homonym to the Mediterranean.
    expect(classifyPortBasin('Cartagena', 'Barranquilla')).toBe('unknown');
    expect(classifyPortBasin('Cartagena', 'Santa Marta')).not.toBe('med');
  });
});
