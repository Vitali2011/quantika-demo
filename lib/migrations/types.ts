import type Database from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  up(db: Database.Database): void;
  down(db: Database.Database): void;
}

export interface MigrationRecord {
  version: number;
  name: string;
  applied_at: number;
}
