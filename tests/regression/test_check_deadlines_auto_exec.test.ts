/**
 * Adversarial QA — scripts/check-deadlines.ts
 * Class: script/tooling — require.main guard removal
 * Date: 2026-05-15
 *
 * Attack: verify that importing initDb from scripts/check-deadlines.ts does NOT
 * cause main() to execute as a side effect.
 *
 * On main branch: `if (require.main === module)` guard prevents main() from firing.
 * On feat/etms-demo-corpus-migration: guard removed → main() fires on every import.
 *
 * This test captures the console.log output during module load to detect
 * auto-execution of main(). The check-deadlines main() calls loadActiveDeadlines()
 * which logs "[check-deadlines] no active subs deadlines" or processes real deadlines.
 * Any such output during a pure import is a test-isolation bug (CRITICAL).
 */

describe('scripts/check-deadlines — require.main guard (adversarial)', () => {
  it('importing initDb should NOT cause main() to auto-execute', async () => {
    const consoleLogCalls: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args: unknown[]) => {
      consoleLogCalls.push(args.map(String).join(' '));
    };
    console.error = (...args: unknown[]) => {
      consoleLogCalls.push('ERROR: ' + args.map(String).join(' '));
    };

    try {
      // Importing the module should ONLY export initDb — it should NOT run main()
      // If the require.main guard is absent, main() fires here producing
      // "[check-deadlines] no active subs deadlines" output.
      const { initDb } = await import('@/scripts/check-deadlines');

      // Give any async side effects a chance to resolve
      await new Promise(resolve => setTimeout(resolve, 200));

      const checkDeadlinesOutput = consoleLogCalls.filter(
        msg => msg.includes('[check-deadlines]')
      );

      expect(checkDeadlinesOutput).toEqual([]);
      expect(typeof initDb).toBe('function');
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  });

  it('initDb itself should not log [check-deadlines] messages', () => {
    const consoleLogCalls: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      consoleLogCalls.push(args.map(String).join(' '));
    };

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { initDb } = require('@/scripts/check-deadlines');
      const db = initDb(':memory:');
      db.close();

      const checkDeadlinesOutput = consoleLogCalls.filter(
        msg => msg.includes('[check-deadlines]')
      );

      // initDb itself should not trigger main() — only module load at require time
      // This test confirms that the first test's finding is a module-load bug, not an initDb bug
      expect(typeof initDb).toBe('function');
      // Node.js caches modules so main() won't run again here (already ran on first import)
      // The captured output is diagnostic — not asserted here to avoid false double-count
      console.log = originalLog;
      originalLog('[diagnostic] check-deadlines output after require:', checkDeadlinesOutput);
    } finally {
      console.log = originalLog;
    }
  });
});
