import migration001 from './001-initial-sessions';
import migration002 from './002-audit-events';
import migration003 from './003-economics-cache';
import migration004 from './004-whatsapp-users';
import migration005 from './005-market-benchmarks';
import migration006 from './006-trial-state';
import migration007 from './007-opensanctions-cache';
import migration008 from './008-port-da-estimates';
import type { Migration } from './types';

export const allMigrations: Migration[] = [migration001, migration002, migration003, migration004, migration005, migration006, migration007, migration008];
