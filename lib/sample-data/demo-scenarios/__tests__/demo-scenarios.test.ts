/**
 * Snapshot / pipeline tests for the 10 demo scenarios.
 *
 * For every scenario we exercise the deterministic pipeline (hard filters,
 * date sanity, readiness, sanctions) and assert the outcome matches the
 * fixture's `expectedOutcome`.
 *
 * LLM scoring is deliberately NOT exercised — we only care that:
 *   - "filtered_out" fixtures hit at least one pre-flight filter
 *   - "warning_only" fixtures do NOT get filtered out and DO carry the expected warning
 *   - "match" fixtures pass every filter and produce a plausible score via
 *     computeScoreBreakdown
 */
import { loadDemoScenarios } from '../index';
import { runHardFilters } from '@/lib/sailing/match-filters';
import { parseLaycan, parseVesselOpenDate } from '@/lib/sailing/date-parsing';
import { validateDates } from '@/lib/sailing/date-sanity';
import { calculateReadinessGap } from '@/lib/sailing/readiness-gap';
import { checkSanctions } from '@/lib/validation/sanctions';
import { computeScoreBreakdown } from '@/lib/sailing/match-scoring';
import { cfValue } from '@/lib/types';

const scenarios = loadDemoScenarios();

describe('demo scenarios — structure', () => {
  it('has exactly 10 scenarios', () => {
    expect(scenarios).toHaveLength(10);
  });

  it('each scenario has unique id', () => {
    const ids = scenarios.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each scenario has title, narrative, cargo, vessel, expectedOutcome', () => {
    for (const s of scenarios) {
      expect(s.title).toBeTruthy();
      expect(s.narrative).toBeTruthy();
      expect(s.cargo).toBeTruthy();
      expect(s.vessel).toBeTruthy();
      expect(s.expectedOutcome).toBeTruthy();
    }
  });
});

describe('demo scenarios — pipeline outcomes', () => {
  const today = new Date('2025-09-08T00:00:00Z');
  const refYear = 2025;

  for (const sc of scenarios) {
    describe(sc.id, () => {
      it('matches expected outcome', () => {
        const { cargo: c, vessel: v, expectedOutcome } = sc;

        const readiness = calculateReadinessGap(
          {
            openDate: cfValue(v.openDate),
            openPosition: cfValue(v.openPosition),
            speedLaden: v.speedLaden,
            dwtSummer: cfValue(v.dwtSummer),
          },
          {
            laycan: c.laycan,
            originPort: cfValue(c.originPort),
          },
          { refYear, today },
        );

        const hf = runHardFilters({
          cargoType: c.cargoType,
          originPort: cfValue(c.originPort),
          weightMt: cfValue(c.weightMt),
          cargoDescription: cfValue(c.cargoDescription),
          stowageFactor: c.stowageFactor,
          vesselType: v.vesselType,
          geared: v.geared,
          draftMax: cfValue(v.draftMax),
          grainCapacity: v.grainCapacity,
        });

        const parsedLaycan = parseLaycan(c.laycan, refYear);
        const parsedOpen = parseVesselOpenDate(cfValue(v.openDate), refYear, today);
        const dateVal = validateDates({
          openDate: parsedOpen,
          laycan: parsedLaycan,
          today,
          staleThresholdDays: 5,
        });

        const sanctions = checkSanctions({
          vesselFlag: v.flag,
          originPort: cfValue(c.originPort),
          destinationPort: cfValue(c.destinationPort),
          restrictions: v.restrictions ?? [],
        });

        const filteredOut =
          !hf.pass ||
          !dateVal.valid ||
          readiness.verdict === 'late' ||
          sanctions.blocking;

        if (expectedOutcome.kind === 'filtered_out') {
          expect(filteredOut).toBe(true);
          const allReasons = [
            ...hf.failures,
            ...dateVal.issues,
            readiness.explanation,
            sanctions.reason ?? '',
          ].join(' | ');
          expect(allReasons).toMatch(expectedOutcome.reasonMatches);
          return;
        }

        // For match / warning_only, the pair must NOT be filtered out
        expect(filteredOut).toBe(false);

        if (expectedOutcome.kind === 'warning_only') {
          const combinedWarnings = [
            ...dateVal.issues,
            v.verificationWarning ?? '',
            readiness.verdict,
            cfValue(v.dwtSummer) != null && v.dwtSummer?.confidence === 'interpreted' ? 'interpreted abt' : '',
          ].join(' | ');
          expect(combinedWarnings).toMatch(expectedOutcome.warningMatches);
          return;
        }

        // expectedOutcome.kind === 'match'
        const breakdown = computeScoreBreakdown({
          match: {
            cargoEmailId: c.emailId,
            cargoItemIndex: c.itemIndex,
            vesselEmailId: v.emailId,
            vesselItemIndex: v.itemIndex,
            score: 60,
            matchLevel: 'possible',
            matchReasons: [],
            issues: [],
          },
          cargo: c,
          vessel: v,
          readiness: {
            ...readiness,
            openDate: readiness.openDate,
            laycanStart: readiness.laycanStart,
            laycanEnd: readiness.laycanEnd,
            distanceNm: readiness.distanceNm,
            speedKn: readiness.speedKn,
            sailingDays: readiness.sailingDays,
            arrivalDate: readiness.arrivalDate,
            gapDays: readiness.gapDays,
            verdict: readiness.verdict,
            explanation: readiness.explanation,
          },
          sanctions,
        });

        if (expectedOutcome.minScore != null) {
          expect(breakdown.finalScore).toBeGreaterThanOrEqual(expectedOutcome.minScore);
        }
        if (expectedOutcome.mustContainIssue) {
          const combined = [
            ...dateVal.issues,
            readiness.verdict,
            readiness.explanation,
          ].join(' | ');
          expect(combined).toMatch(expectedOutcome.mustContainIssue);
        }
      });
    });
  }
});
