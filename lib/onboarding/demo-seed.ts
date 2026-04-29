import * as path from 'path';
import * as fs from 'fs';
import { getStore } from '../session-store';

type Region = 'MENA' | 'Med' | 'WAFR';

interface SampleEmail {
  id: string;
  threadId: string;
  from: string;
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  date: string;
  body: string;
  snippet: string;
  labelIds: string[];
}

// Cargo patterns per region — match Load/Disch ports in cargo inquiry bodies
const CARGO_REGION_PORTS: Record<Region, RegExp> = {
  MENA: /Derince|Iskenderun|Mersin|Kastanpole|Alexandria|Port Said|Turkey|Egypt/i,
  Med: /Castellon|Tarragona|Barcelona|Genoa|Ravenna|Piraeus|Constanta|Tunis|Beirut|Casablanca|Greece|Spain|Italy|Romania/i,
  WAFR: /Lagos|Tema|Abidjan|Dakar|Nigeria|Ghana|Senegal|C.te d.Ivoire|WAfrica/i,
};

/**
 * Vessel open-position patterns per region.
 *
 * Vessel emails describe where the ship is currently open, NOT where it loads cargo.
 * MENA cargoes (Turkey/Egypt loading) are typically served by vessels open in the
 * Mediterranean / Black Sea / East Med area — those ships ballast to the load port.
 * Using the cargo-port pattern for vessels would exclude almost all Med-based vessels
 * and leave the MENA demo with a single vessel, producing zero matches.
 */
const VESSEL_REGION_PORTS: Record<Region, RegExp> = {
  // Med/Black Sea/East Med vessels can ballast to Turkish/Egyptian load ports
  MENA: /Piraeus|Constanta|Casablanca|Ravenna|Genoa|Algeciras|Hamburg|Rotterdam|Antwerp|Dakar|Odesa|Alexandria|Turkey|Egypt|Med|Black Sea|East Med|MENA|Red Sea/i,
  // Med-positioned vessels cover Mediterranean trade routes
  Med: /Castellon|Tarragona|Barcelona|Genoa|Ravenna|Piraeus|Constanta|Tunis|Beirut|Casablanca|Greece|Spain|Italy|Romania|Med|Black Sea/i,
  // West Africa-based vessels plus Med vessels willing to go WAfrica
  WAFR: /Lagos|Tema|Abidjan|Dakar|Nigeria|Ghana|Senegal|C.te d.Ivoire|WAfrica|Abidjan|Ivory Coast/i,
};

function loadSampleFile(filename: string): SampleEmail[] {
  const filePath = path.join(__dirname, '..', 'sample-data', filename);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SampleEmail[];
}

function filterCargoByRegion(emails: SampleEmail[], region: Region): SampleEmail[] {
  const pattern = CARGO_REGION_PORTS[region];
  return emails.filter((e) => pattern.test(e.body) || pattern.test(e.subject));
}

function filterVesselsByRegion(emails: SampleEmail[], region: Region): SampleEmail[] {
  const pattern = VESSEL_REGION_PORTS[region];
  return emails.filter((e) => pattern.test(e.body) || pattern.test(e.subject));
}

function ensureSeedTable(db: import('better-sqlite3').Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS demo_seed_emails (
      session_id TEXT NOT NULL,
      email_id   TEXT NOT NULL,
      email_type TEXT NOT NULL,
      data       TEXT NOT NULL,
      PRIMARY KEY (session_id, email_id)
    );
  `);
}

export async function seedDemoForRegion(sessionId: string, region: Region): Promise<void> {
  const db = getStore().getDatabase();

  // Idempotency check
  const trial = db.prepare<[string], { demo_seeded: number }>(
    'SELECT demo_seeded FROM trial_state WHERE session_id = ?'
  ).get(sessionId);
  if (trial && trial.demo_seeded === 1) return;

  const cargoInquiries = loadSampleFile('cargo-inquiries.json');
  const vesselPositions = loadSampleFile('vessel-positions.json');
  const fixtureRecaps = loadSampleFile('fixture-recaps.json');

  const filteredCargos = filterCargoByRegion(cargoInquiries, region);
  const filteredVessels = filterVesselsByRegion(vesselPositions, region);
  const filteredRecaps = filterCargoByRegion(fixtureRecaps, region);

  // Ensure demo_seed_emails table exists before preparing statements
  ensureSeedTable(db);

  const insert = db.prepare(
    'INSERT OR IGNORE INTO demo_seed_emails (session_id, email_id, email_type, data) VALUES (?, ?, ?, ?)'
  );

  const insertMany = db.transaction(() => {
    for (const cargo of filteredCargos) {
      insert.run(sessionId, cargo.id, 'cargo', JSON.stringify(cargo));
    }
    for (const vessel of filteredVessels) {
      insert.run(sessionId, vessel.id, 'vessel', JSON.stringify(vessel));
    }
    for (const recap of filteredRecaps) {
      insert.run(sessionId, recap.id, 'recap', JSON.stringify(recap));
    }

    // Mark trial as seeded
    db.prepare('UPDATE trial_state SET demo_seeded = 1 WHERE session_id = ?').run(sessionId);
  });

  insertMany();
}

export async function getSeededCount(sessionId: string): Promise<number> {
  const db = getStore().getDatabase();
  ensureSeedTable(db);
  const row = db.prepare<[string], { count: number }>(
    'SELECT COUNT(*) as count FROM demo_seed_emails WHERE session_id = ?'
  ).get(sessionId);
  return row?.count ?? 0;
}

export async function getSeededEmails(sessionId: string): Promise<SampleEmail[]> {
  const db = getStore().getDatabase();
  ensureSeedTable(db);
  const rows = db.prepare<[string], { data: string }>(
    'SELECT data FROM demo_seed_emails WHERE session_id = ?'
  ).all(sessionId);
  return rows.map((r) => JSON.parse(r.data) as SampleEmail);
}
