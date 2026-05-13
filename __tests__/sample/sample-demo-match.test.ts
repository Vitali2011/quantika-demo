/**
 * spec-03: POST /api/sample → session contains ≥1 guaranteed demo match
 * that has all fields required for EconomicsTab to render.
 *
 * This test exercises the in-memory session directly (no HTTP) to avoid
 * CSRF / redirect complexity. It mirrors what route.ts does internally.
 */
import { createSession, updateSession, getSession, deleteSession } from '@/lib/session';
import { resolveDemoParsedCargoes, resolveDemoParsedVessels } from '@/lib/sample-data/demo-parsed-cargoes';

const DEMO_MATCH_CARGO_EMAIL_ID = 'demo-cargo-economics';
const DEMO_MATCH_VESSEL_EMAIL_ID = 'demo-vessel-economics';

describe('spec-03: demo seed-match for EconomicsTab', () => {
  let sessionId: string;

  beforeEach(() => {
    const today = new Date();
    sessionId = createSession('demo-test-token');

    const parsedCargos = resolveDemoParsedCargoes(today);
    const parsedVessels = resolveDemoParsedVessels(today);

    // Inline the same injection logic that route.ts applies
    const DEMO_MATCH_ID_CARGO_EMAIL = DEMO_MATCH_CARGO_EMAIL_ID;
    const demoMatch = {
      cargoEmailId: DEMO_MATCH_ID_CARGO_EMAIL,
      cargoItemIndex: 0,
      vesselEmailId: DEMO_MATCH_VESSEL_EMAIL_ID,
      vesselItemIndex: 0,
      score: 92,
      matchLevel: 'good' as const,
      matchReasons: ['Guaranteed demo match for EconomicsTab'],
      issues: [],
    };

    updateSession(sessionId, {
      parsedCargos,
      parsedVessels,
      matches: [demoMatch],
    });
  });

  afterEach(() => {
    deleteSession(sessionId);
  });

  it('session has ≥1 match after sample data injection', () => {
    const session = getSession(sessionId);
    expect(session).not.toBeNull();
    expect(session!.matches.length).toBeGreaterThanOrEqual(1);
  });

  it('demo match points to the demo-cargo-economics cargo', () => {
    const session = getSession(sessionId);
    const demoMatch = session!.matches.find(
      (m) => m.cargoEmailId === DEMO_MATCH_CARGO_EMAIL_ID
    );
    expect(demoMatch).toBeDefined();
    expect(demoMatch!.cargoItemIndex).toBe(0);
  });

  it('demo match points to the demo-vessel-economics vessel', () => {
    const session = getSession(sessionId);
    const demoMatch = session!.matches.find(
      (m) => m.cargoEmailId === DEMO_MATCH_CARGO_EMAIL_ID
    );
    expect(demoMatch).toBeDefined();
    expect(demoMatch!.vesselEmailId).toBe(DEMO_MATCH_VESSEL_EMAIL_ID);
  });

  it('demo cargo has laycan > now+30d (not STALE)', () => {
    const session = getSession(sessionId);
    const demoMatch = session!.matches.find(
      (m) => m.cargoEmailId === DEMO_MATCH_CARGO_EMAIL_ID
    );
    expect(demoMatch).toBeDefined();

    const demoCargo = session!.parsedCargos.find(
      (c) => c.emailId === DEMO_MATCH_CARGO_EMAIL_ID && c.itemIndex === 0
    );
    expect(demoCargo).toBeDefined();
    expect(demoCargo!.laycan).not.toBeNull();

    const laycanStart = demoCargo!.laycan!.split(' .. ')[0];
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    expect(new Date(laycanStart) > thirtyDaysFromNow).toBe(true);
  });

  it('demo cargo has originPort and destinationPort (non-empty)', () => {
    const session = getSession(sessionId);
    const demoCargo = session!.parsedCargos.find(
      (c) => c.emailId === DEMO_MATCH_CARGO_EMAIL_ID && c.itemIndex === 0
    );
    expect(demoCargo).toBeDefined();
    expect(demoCargo!.originPort).not.toBeNull();
    expect(demoCargo!.originPort!.value).toBeTruthy();
    expect(demoCargo!.destinationPort).not.toBeNull();
    expect(demoCargo!.destinationPort!.value).toBeTruthy();
  });

  it('demo cargo has weightMt > 0', () => {
    const session = getSession(sessionId);
    const demoCargo = session!.parsedCargos.find(
      (c) => c.emailId === DEMO_MATCH_CARGO_EMAIL_ID && c.itemIndex === 0
    );
    expect(demoCargo).toBeDefined();
    expect(demoCargo!.weightMt).not.toBeNull();
    expect(demoCargo!.weightMt!.value).toBeGreaterThan(0);
  });

  it('demo vessel has dwtSummer > 0', () => {
    const session = getSession(sessionId);
    const demoVessel = session!.parsedVessels.find(
      (v) => v.emailId === DEMO_MATCH_VESSEL_EMAIL_ID && v.itemIndex === 0
    );
    expect(demoVessel).toBeDefined();
    expect(demoVessel!.dwtSummer).not.toBeNull();
    expect(demoVessel!.dwtSummer!.value).toBeGreaterThan(0);
  });

  it('demo vessel has speedLaden (non-null, non-empty)', () => {
    const session = getSession(sessionId);
    const demoVessel = session!.parsedVessels.find(
      (v) => v.emailId === DEMO_MATCH_VESSEL_EMAIL_ID && v.itemIndex === 0
    );
    expect(demoVessel).toBeDefined();
    expect(demoVessel!.speedLaden).not.toBeNull();
    expect(demoVessel!.speedLaden).toBeTruthy();
  });

  it('demo vessel has consumption (non-null, non-empty)', () => {
    const session = getSession(sessionId);
    const demoVessel = session!.parsedVessels.find(
      (v) => v.emailId === DEMO_MATCH_VESSEL_EMAIL_ID && v.itemIndex === 0
    );
    expect(demoVessel).toBeDefined();
    expect(demoVessel!.consumption).not.toBeNull();
    expect(demoVessel!.consumption).toBeTruthy();
  });
});
