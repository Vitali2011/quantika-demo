import Database from 'better-sqlite3';
import migration038 from '@/lib/migrations/038-jobs-progress';

describe('migration 038 jobs-progress', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
  });
  afterEach(() => db.close());

  it('creates jobs table with progress_percent + current_step', () => {
    migration038.up(db);
    const cols = db.prepare('PRAGMA table_info(jobs)').all() as { name: string }[];
    const names = cols.map((c) => c.name);
    expect(names).toContain('progress_percent');
    expect(names).toContain('current_step');
    expect(names).toContain('user_id');
    expect(names).toContain('status');
  });

  it('creates idx_jobs_user_status index', () => {
    migration038.up(db);
    const indexes = db.prepare('PRAGMA index_list(jobs)').all() as { name: string }[];
    expect(indexes.some((i) => i.name === 'idx_jobs_user_status')).toBe(true);
  });

  it('status defaults to queue and progress_percent defaults to 0', () => {
    migration038.up(db);
    db.prepare("INSERT INTO jobs (id, user_id) VALUES ('j1', 'u1')").run();
    const row = db.prepare("SELECT status, progress_percent FROM jobs WHERE id = 'j1'").get() as any;
    expect(row.status).toBe('queue');
    expect(row.progress_percent).toBe(0);
  });

  it('rejects invalid status via CHECK constraint', () => {
    migration038.up(db);
    expect(() => {
      db.prepare("INSERT INTO jobs (id, user_id, status) VALUES ('j2', 'u1', 'invalid')").run();
    }).toThrow(/CHECK constraint/);
  });

  it('rolls back cleanly via down()', () => {
    migration038.up(db);
    migration038.down(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    expect(tables.map((t) => t.name)).not.toContain('jobs');
  });

  it('is idempotent (up() can run twice safely)', () => {
    migration038.up(db);
    expect(() => migration038.up(db)).not.toThrow();
  });
});
