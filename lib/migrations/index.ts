import migration001 from './001-initial-sessions';
import migration002 from './002-audit-events';
import migration003 from './003-economics-cache';
import migration004 from './004-whatsapp-users';
import migration005 from './005-market-benchmarks';
import migration006 from './006-trial-state';
import migration007 from './007-opensanctions-cache';
import migration008 from './008-ais-polling-flag';
import migration009 from './009-pipedrive-tables';
import migration010 from './010-port-da-estimates';
import migration011 from './011-notified-dispatches';
import migration012 from './012-ai-audit';
import migration013 from './013-knowledge-sources';
import migration014 from './014-sanctions-entities';
import migration015 from './015-port-distances';
import migration016 from './016-war-risk-zones';
import type { Migration } from './types';

export const allMigrations: Migration[] = [migration001, migration002, migration003, migration004, migration005, migration006, migration007, migration008, migration009, migration010, migration011, migration012, migration013, migration014, migration015, migration016];
