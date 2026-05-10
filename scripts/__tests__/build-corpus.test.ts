/**
 * Integration tests for scripts/build-corpus.ts
 * Creates a temp directory with fixture JSONs, runs the script logic,
 * and verifies the output file.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

// ---------------------------------------------------------------------------
// We test via the exported `run()` function to avoid spawning a subprocess.
// We override process.cwd() by using a jest mock so that the script resolves
// paths relative to our temp directory.
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.join(
  __dirname,
  '../../lib/corpus/__tests__/fixtures'
);

describe('build-corpus integration', () => {
  let tmpDir: string;
  let rawEmailsDir: string;
  let outputFile: string;
  let originalCwd: () => string;

  beforeEach(() => {
    // Create a clean temp directory for each test
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-corpus-test-'));
    rawEmailsDir = path.join(tmpDir, '.private', 'raw-emails');
    outputFile = path.join(tmpDir, '.private', 'etms-corpus.json');

    // Patch process.cwd to return tmpDir so the script resolves paths correctly
    originalCwd = process.cwd;
    jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    // Restore cwd
    jest.restoreAllMocks();
    // Clean up temp dir
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Happy path: with fixture files
  // -------------------------------------------------------------------------

  it('reads fixture JSONs and writes etms-corpus.json with correct Email count', async () => {
    // Set up raw-emails dir with all 3 fixtures
    fs.mkdirSync(rawEmailsDir, { recursive: true });
    for (const fixture of ['thread-plain.json', 'thread-forwarded-gmail.json', 'thread-forwarded-apple.json']) {
      fs.copyFileSync(
        path.join(FIXTURES_DIR, fixture),
        path.join(rawEmailsDir, fixture)
      );
    }

    // Dynamically import to get fresh module after cwd mock
    jest.resetModules();
    const { run } = await import('../build-corpus');
    await run();

    expect(fs.existsSync(outputFile)).toBe(true);
    const content = fs.readFileSync(outputFile, 'utf-8');
    const emails = JSON.parse(content);

    // thread-plain: 1, thread-forwarded-gmail: 1, thread-forwarded-apple: 2
    expect(Array.isArray(emails)).toBe(true);
    expect(emails).toHaveLength(4);
  });

  it('output is pretty-formatted JSON (2-space indent)', async () => {
    fs.mkdirSync(rawEmailsDir, { recursive: true });
    fs.copyFileSync(
      path.join(FIXTURES_DIR, 'thread-plain.json'),
      path.join(rawEmailsDir, 'thread-plain.json')
    );

    jest.resetModules();
    const { run } = await import('../build-corpus');
    await run();

    const raw = fs.readFileSync(outputFile, 'utf-8');
    // Pretty JSON starts with "[\n  {" (2-space indent)
    expect(raw).toMatch(/^\[\n {2}\{/);
  });

  it('output emails have all required Email fields', async () => {
    fs.mkdirSync(rawEmailsDir, { recursive: true });
    fs.copyFileSync(
      path.join(FIXTURES_DIR, 'thread-plain.json'),
      path.join(rawEmailsDir, 'thread-plain.json')
    );

    jest.resetModules();
    const { run } = await import('../build-corpus');
    await run();

    const emails = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    const [email] = emails;

    expect(typeof email.id).toBe('string');
    expect(typeof email.threadId).toBe('string');
    expect(typeof email.from).toBe('string');
    expect(typeof email.to).toBe('string');
    expect(typeof email.subject).toBe('string');
    expect(typeof email.date).toBe('string');
    expect(typeof email.body).toBe('string');
    expect(typeof email.snippet).toBe('string');
    expect(Array.isArray(email.labelIds)).toBe(true);
  });

  it('correctly unwraps Gmail forward in output', async () => {
    fs.mkdirSync(rawEmailsDir, { recursive: true });
    fs.copyFileSync(
      path.join(FIXTURES_DIR, 'thread-forwarded-gmail.json'),
      path.join(rawEmailsDir, 'thread-forwarded-gmail.json')
    );

    jest.resetModules();
    const { run } = await import('../build-corpus');
    await run();

    const [email] = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    expect(email.body).toContain('We need to ship 10000mt of grain');
    expect(email.fromEmail).toBe('cargo@shipper.com');
    expect(email.subject).toBe('Bulk cargo query');
  });

  // -------------------------------------------------------------------------
  // Error path: missing directory
  // -------------------------------------------------------------------------

  it('exits with code 1 and prints error when raw-emails dir is missing', async () => {
    // Don't create rawEmailsDir — it should be absent
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const mockError = jest.spyOn(console, 'error').mockImplementation(() => {});

    jest.resetModules();
    const { run } = await import('../build-corpus');

    await expect(run()).rejects.toThrow('process.exit(1)');
    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining('run npm run import:emails first')
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('exits with code 1 and prints error when raw-emails dir exists but is empty', async () => {
    fs.mkdirSync(rawEmailsDir, { recursive: true });
    // Directory exists but no JSON files

    const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const mockError = jest.spyOn(console, 'error').mockImplementation(() => {});

    jest.resetModules();
    const { run } = await import('../build-corpus');

    await expect(run()).rejects.toThrow('process.exit(1)');
    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining('run npm run import:emails first')
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  // -------------------------------------------------------------------------
  // Robustness: malformed JSON file is skipped with warning
  // -------------------------------------------------------------------------

  it('skips malformed JSON files with a warning and continues', async () => {
    fs.mkdirSync(rawEmailsDir, { recursive: true });
    // Valid fixture
    fs.copyFileSync(
      path.join(FIXTURES_DIR, 'thread-plain.json'),
      path.join(rawEmailsDir, 'thread-plain.json')
    );
    // Malformed JSON
    fs.writeFileSync(path.join(rawEmailsDir, 'broken.json'), '{ bad json }}', 'utf-8');

    const mockWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    jest.resetModules();
    const { run } = await import('../build-corpus');
    await run();

    expect(fs.existsSync(outputFile)).toBe(true);
    const emails = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    expect(emails).toHaveLength(1); // Only valid thread processed
    expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('broken.json'));
  });
});
