import * as fs from 'fs';
import * as path from 'path';

jest.mock('fs');

import {
  buildAuthUrl,
  parseCallbackQuery,
  persistRefreshToken,
} from '../setup-gmail-oauth';

const mockFs = fs as jest.Mocked<typeof fs>;

// Mock googleapis
jest.mock('googleapis', () => {
  const mockGenerateAuthUrl = jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/auth?fake=1');
  const mockOAuth2 = jest.fn().mockImplementation(() => ({
    generateAuthUrl: mockGenerateAuthUrl,
    setCredentials: jest.fn(),
  }));
  return {
    google: {
      auth: { OAuth2: mockOAuth2 },
    },
  };
});

describe('buildAuthUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a URL string', () => {
    const url = buildAuthUrl('client-id', 'client-secret');
    expect(typeof url).toBe('string');
    expect(url.length).toBeGreaterThan(0);
  });

  it('calls generateAuthUrl with gmail.readonly scope', () => {
    const { google } = require('googleapis');
    const mockGenerateAuthUrl = jest.fn().mockReturnValue('https://example.com/auth');
    google.auth.OAuth2.mockImplementationOnce(() => ({
      generateAuthUrl: mockGenerateAuthUrl,
      setCredentials: jest.fn(),
    }));

    buildAuthUrl('cid', 'csec');

    expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: expect.arrayContaining(['https://www.googleapis.com/auth/gmail.readonly']),
        access_type: 'offline',
        prompt: 'consent',
      })
    );
  });

  it('uses redirect_uri http://127.0.0.1:53682/oauth-callback', () => {
    const { google } = require('googleapis');
    const { OAuth2 } = google.auth;
    buildAuthUrl('cid', 'csec');

    expect(OAuth2).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'http://127.0.0.1:53682/oauth-callback'
    );
  });
});

describe('parseCallbackQuery', () => {
  it('extracts code from query string', () => {
    const result = parseCallbackQuery('code=abc123&state=xyz');
    expect(result.code).toBe('abc123');
  });

  it('extracts state if present', () => {
    const result = parseCallbackQuery('code=abc&state=mystate');
    expect(result.state).toBe('mystate');
  });

  it('returns null code if not present', () => {
    const result = parseCallbackQuery('error=access_denied');
    expect(result.code).toBeNull();
  });

  it('handles URL-encoded values', () => {
    const result = parseCallbackQuery('code=abc%2Fdef');
    expect(result.code).toBe('abc/def');
  });

  it('handles empty string', () => {
    const result = parseCallbackQuery('');
    expect(result.code).toBeNull();
  });
});

describe('persistRefreshToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockFs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    (mockFs.writeFileSync as jest.Mock).mockReturnValue(undefined);
    (mockFs.chmodSync as jest.Mock).mockReturnValue(undefined);
    (mockFs.existsSync as jest.Mock).mockReturnValue(false);
  });

  it('writes refresh token to specified path', () => {
    persistRefreshToken('/some/path/token.txt', 'my-refresh-token');
    expect(mockFs.writeFileSync).toHaveBeenCalledWith('/some/path/token.txt', 'my-refresh-token', 'utf8');
  });

  it('creates parent directory if missing', () => {
    persistRefreshToken('/some/dir/token.txt', 'token');
    expect(mockFs.mkdirSync).toHaveBeenCalledWith('/some/dir', expect.objectContaining({ recursive: true }));
  });

  it('chmods file to 0600 after write', () => {
    persistRefreshToken('/some/path/token.txt', 'token');
    expect(mockFs.chmodSync).toHaveBeenCalledWith('/some/path/token.txt', 0o600);
  });

  it('calls chmod AFTER writeFileSync', () => {
    const callOrder: string[] = [];
    (mockFs.writeFileSync as jest.Mock).mockImplementation(() => callOrder.push('write'));
    (mockFs.chmodSync as jest.Mock).mockImplementation(() => callOrder.push('chmod'));

    persistRefreshToken('/path/token.txt', 'token');

    expect(callOrder).toEqual(expect.arrayContaining(['write', 'chmod']));
    expect(callOrder.indexOf('write')).toBeLessThan(callOrder.indexOf('chmod'));
  });

  it('throws if token is empty string', () => {
    expect(() => persistRefreshToken('/path/token.txt', '')).toThrow(/empty|invalid|token/i);
  });
});
