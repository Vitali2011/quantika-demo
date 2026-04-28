import migration001 from './001-initial-sessions';
import migration002 from './002-audit-events';
import migration003 from './003-whatsapp-users';
import type { Migration } from './types';

export const allMigrations: Migration[] = [migration001, migration002, migration003];
