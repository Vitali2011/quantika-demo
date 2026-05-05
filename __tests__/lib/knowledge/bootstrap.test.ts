import Database from 'better-sqlite3';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import { bootstrapKnowledgeSources, KNOWLEDGE_REGISTRY } from '@/lib/knowledge/bootstrap';

describe('bootstrap', () => {
  it('registers every entry from KNOWLEDGE_REGISTRY', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migration013.up(db);
    bootstrapKnowledgeSources(db);
    const count = (db.prepare('SELECT COUNT(*) AS c FROM knowledge_sources').get() as any).c;
    expect(count).toBe(KNOWLEDGE_REGISTRY.length);
  });

  it('is idempotent (second call does not duplicate or wipe state)', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migration013.up(db);
    bootstrapKnowledgeSources(db);
    db.prepare("UPDATE knowledge_sources SET status='fresh' WHERE slug='ofac'").run();
    bootstrapKnowledgeSources(db);
    const status = (db.prepare("SELECT status FROM knowledge_sources WHERE slug='ofac'").get() as any).status;
    expect(status).toBe('fresh'); // bootstrap should not reset status
  });

  it('contains 5 Phase-1 sources + 5 Phase-2 placeholders', () => {
    const slugs = KNOWLEDGE_REGISTRY.map((r) => r.slug);
    expect(slugs).toEqual(expect.arrayContaining(['ofac', 'eu-sanctions', 'distances', 'jwc', 'eca', 'panama-tariffs']));
    expect(slugs.length).toBeGreaterThanOrEqual(10);
  });
});
