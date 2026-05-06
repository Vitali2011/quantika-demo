import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

interface Waypoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  waters: string;
  choke_type: 'canal' | 'strait' | 'rounding';
  linked_to?: string;
  notes?: string;
}

interface WaypointsFile {
  version: string;
  source_notes: string;
  fetched_at: string;
  waypoints: Waypoint[];
}

const FILE_PATH = path.resolve(__dirname, '../../../data/knowledge/searoute-waypoints.yaml');

let data: WaypointsFile;

beforeAll(() => {
  const raw = fs.readFileSync(FILE_PATH, 'utf-8');
  data = yaml.load(raw) as WaypointsFile;
});

describe('searoute-waypoints.yaml — schema', () => {
  test('version is searoute-waypoints-v1', () => {
    expect(data.version).toBe('searoute-waypoints-v1');
  });

  test('fetched_at is present', () => {
    expect(data.fetched_at).toBeTruthy();
  });

  test('waypoints is an array', () => {
    expect(Array.isArray(data.waypoints)).toBe(true);
  });

  test('≥10 waypoints present', () => {
    expect(data.waypoints.length).toBeGreaterThanOrEqual(10);
  });
});

describe('searoute-waypoints.yaml — coordinate validity', () => {
  test('all lat values in [-90, 90]', () => {
    for (const wp of data.waypoints) {
      expect(wp.lat).toBeGreaterThanOrEqual(-90);
      expect(wp.lat).toBeLessThanOrEqual(90);
    }
  });

  test('all lon values in [-180, 180]', () => {
    for (const wp of data.waypoints) {
      expect(wp.lon).toBeGreaterThanOrEqual(-180);
      expect(wp.lon).toBeLessThanOrEqual(180);
    }
  });

  test('all waypoints have numeric lat/lon', () => {
    for (const wp of data.waypoints) {
      expect(typeof wp.lat).toBe('number');
      expect(typeof wp.lon).toBe('number');
    }
  });
});

describe('searoute-waypoints.yaml — required waypoints present', () => {
  const REQUIRED_IDS = [
    'suez-port-said',
    'suez-port-tewfik',
    'panama-cristobal',
    'panama-balboa',
    'cape-of-good-hope',
    'bab-el-mandeb',
    'bosporus',
    'gibraltar',
    'malacca-singapore',
    'sunda-strait',
    'hormuz',
    'dover',
  ];

  let idSet: Set<string>;
  beforeAll(() => {
    idSet = new Set(data.waypoints.map((wp) => wp.id));
  });

  for (const id of REQUIRED_IDS) {
    test(`waypoint "${id}" exists`, () => {
      expect(idSet.has(id)).toBe(true);
    });
  }
});

describe('searoute-waypoints.yaml — linked pairs (Suez and Panama)', () => {
  let waypointMap: Map<string, Waypoint>;

  beforeAll(() => {
    waypointMap = new Map(data.waypoints.map((wp) => [wp.id, wp]));
  });

  const PAIRS: [string, string][] = [
    ['suez-port-said', 'suez-port-tewfik'],
    ['panama-cristobal', 'panama-balboa'],
  ];

  for (const [a, b] of PAIRS) {
    test(`${a} links to ${b}`, () => {
      expect(waypointMap.get(a)?.linked_to).toBe(b);
    });

    test(`${b} links to ${a}`, () => {
      expect(waypointMap.get(b)?.linked_to).toBe(a);
    });
  }
});

describe('searoute-waypoints.yaml — choke_type values valid', () => {
  const VALID_TYPES = new Set(['canal', 'strait', 'rounding']);

  test('all choke_type values are canal | strait | rounding', () => {
    for (const wp of data.waypoints) {
      expect(VALID_TYPES.has(wp.choke_type)).toBe(true);
    }
  });

  test('canal waypoints have linked_to', () => {
    for (const wp of data.waypoints) {
      if (wp.choke_type === 'canal') {
        expect(wp.linked_to).toBeTruthy();
      }
    }
  });
});

describe('searoute-waypoints.yaml — no duplicate IDs', () => {
  test('all IDs are unique', () => {
    const ids = data.waypoints.map((wp) => wp.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
