/**
 * Unit tests for callClaudeCliRaw (C1: claude-cli judge provider).
 * Mocks child_process.spawnSync to verify JSON parsing logic without running claude CLI.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('child_process', () => ({
  spawnSync: jest.fn(),
}));

// Import after mock registration so the inline require() in callClaudeCliRaw
// gets the mocked module from Jest's module registry.
const childProcess = require('child_process') as { spawnSync: jest.Mock };
const { callClaudeCliRaw } = require('@/lib/ai-provider') as typeof import('@/lib/ai-provider');

const OK_RESPONSE = (result: string) => ({
  status: 0,
  stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result }),
  stderr: '',
  pid: 42,
  output: [null, '', ''],
  signal: null,
  error: undefined,
});

describe('callClaudeCliRaw', () => {
  beforeEach(() => {
    childProcess.spawnSync.mockReset();
  });

  it('returns result text from claude CLI JSON output', () => {
    childProcess.spawnSync.mockReturnValue(OK_RESPONSE('yes they are equivalent'));
    const r = callClaudeCliRaw('You are a judge.', 'Is "BASF" === "BASF SE"?', 'claude-opus-4-7');
    expect(r.text).toBe('yes they are equivalent');
  });

  it('passes --system-prompt flag when system is non-empty', () => {
    childProcess.spawnSync.mockReturnValue(OK_RESPONSE('ok'));
    callClaudeCliRaw('sys prompt', 'user msg', 'claude-opus-4-7');
    const [, args] = childProcess.spawnSync.mock.calls[0] as [string, string[]];
    expect(args).toContain('--system-prompt');
    const idx = args.indexOf('--system-prompt');
    expect(args[idx + 1]).toBe('sys prompt');
  });

  it('passes user message as stdin (not as positional arg)', () => {
    childProcess.spawnSync.mockReturnValue(OK_RESPONSE('ok'));
    callClaudeCliRaw('', 'the user message', 'claude-opus-4-7');
    const [, , spawnOpts] = childProcess.spawnSync.mock.calls[0] as [string, string[], { input: string }];
    expect(spawnOpts.input).toBe('the user message');
  });

  it('throws on non-zero exit status', () => {
    childProcess.spawnSync.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'authentication failed',
      pid: 1,
      output: [],
      signal: null,
      error: undefined,
    });
    expect(() => callClaudeCliRaw('s', 'u', 'claude-opus-4-7')).toThrow(/exited with status 1/);
  });

  it('throws on spawn error (e.g. claude not found)', () => {
    childProcess.spawnSync.mockReturnValue({
      status: null,
      stdout: '',
      stderr: '',
      pid: -1,
      output: [],
      signal: null,
      error: new Error('ENOENT: no such file or directory'),
    });
    expect(() => callClaudeCliRaw('s', 'u', 'claude-opus-4-7')).toThrow(/spawn error/);
  });

  it('falls back to raw stdout when output is not JSON', () => {
    childProcess.spawnSync.mockReturnValue({
      status: 0,
      stdout: 'plain text response',
      stderr: '',
      pid: 1,
      output: [],
      signal: null,
      error: undefined,
    });
    const r = callClaudeCliRaw('s', 'u', 'claude-opus-4-7');
    expect(r.text).toBe('plain text response');
  });

  it('throws when claude CLI returns is_error=true', () => {
    childProcess.spawnSync.mockReturnValue({
      status: 0,
      stdout: JSON.stringify({ type: 'result', is_error: true, result: 'quota exceeded' }),
      stderr: '',
      pid: 1,
      output: [],
      signal: null,
      error: undefined,
    });
    expect(() => callClaudeCliRaw('s', 'u', 'claude-opus-4-7')).toThrow(/error response/);
  });
});
