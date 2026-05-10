import * as fs from 'fs';
import { google } from 'googleapis';

jest.mock('fs');
jest.mock('googleapis', () => {
  const mockOAuth2 = jest.fn().mockImplementation(() => ({
    setCredentials: jest.fn(),
  }));
  return {
    google: {
      auth: { OAuth2: mockOAuth2 },
      gmail: jest.fn().mockReturnValue({ mock: 'gmail-client' }),
    },
  };
});

import {
  loadOAuthCredentials,
  loadRefreshToken,
  createGmailClient,
  type OAuthCredentials,
} from '../oauth-shared';

const mockFs = fs as jest.Mocked<typeof fs>;

describe('loadOAuthCredentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parses installed form credentials', () => {
    const raw = JSON.stringify({
      installed: {
        client_id: 'cid-installed',
        client_secret: 'csec-installed',
        redirect_uris: ['http://127.0.0.1:53682/oauth-callback'],
      },
    });
    (mockFs.readFileSync as jest.Mock).mockReturnValue(raw);

    const creds = loadOAuthCredentials('/fake/path.json');
    expect(creds.client_id).toBe('cid-installed');
    expect(creds.client_secret).toBe('csec-installed');
    expect(creds.redirect_uri).toBe('http://127.0.0.1:53682/oauth-callback');
  });

  it('parses web form credentials', () => {
    const raw = JSON.stringify({
      web: {
        client_id: 'cid-web',
        client_secret: 'csec-web',
        redirect_uris: ['http://127.0.0.1:53682/oauth-callback'],
      },
    });
    (mockFs.readFileSync as jest.Mock).mockReturnValue(raw);

    const creds = loadOAuthCredentials('/fake/path.json');
    expect(creds.client_id).toBe('cid-web');
    expect(creds.client_secret).toBe('csec-web');
  });

  it('uses fixed redirect_uri from constants regardless of json content', () => {
    const raw = JSON.stringify({
      installed: {
        client_id: 'cid',
        client_secret: 'csec',
        redirect_uris: ['urn:ietf:wg:oauth:2.0:oob'],
      },
    });
    (mockFs.readFileSync as jest.Mock).mockReturnValue(raw);

    const creds = loadOAuthCredentials('/fake/path.json');
    expect(creds.redirect_uri).toBe('http://127.0.0.1:53682/oauth-callback');
  });

  it('throws if file is missing', () => {
    (mockFs.readFileSync as jest.Mock).mockImplementation(() => {
      throw Object.assign(new Error('no such file'), { code: 'ENOENT' });
    });
    expect(() => loadOAuthCredentials('/missing.json')).toThrow(/not found|missing|ENOENT|oauth-credentials/i);
  });

  it('throws if JSON is invalid', () => {
    (mockFs.readFileSync as jest.Mock).mockReturnValue('not-json');
    expect(() => loadOAuthCredentials('/bad.json')).toThrow();
  });

  it('throws if neither installed nor web key present', () => {
    const raw = JSON.stringify({ other: {} });
    (mockFs.readFileSync as jest.Mock).mockReturnValue(raw);
    expect(() => loadOAuthCredentials('/wrong.json')).toThrow(/installed|web|invalid/i);
  });
});

describe('loadRefreshToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns trimmed token from file', () => {
    (mockFs.readFileSync as jest.Mock).mockReturnValue('my-refresh-token\n');
    const token = loadRefreshToken('/fake/token.txt');
    expect(token).toBe('my-refresh-token');
  });

  it('throws if file missing', () => {
    (mockFs.readFileSync as jest.Mock).mockImplementation(() => {
      throw Object.assign(new Error('no such file'), { code: 'ENOENT' });
    });
    expect(() => loadRefreshToken('/missing.txt')).toThrow(/not found|missing|ENOENT|oauth-token/i);
  });

  it('throws if token is empty', () => {
    (mockFs.readFileSync as jest.Mock).mockReturnValue('   \n');
    expect(() => loadRefreshToken('/empty.txt')).toThrow(/empty|invalid|token/i);
  });
});

describe('createGmailClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates OAuth2 client with correct params', () => {
    const creds: OAuthCredentials = {
      client_id: 'cid',
      client_secret: 'csec',
      redirect_uri: 'http://127.0.0.1:53682/oauth-callback',
    };
    createGmailClient(creds, 'refresh-token-abc');

    const { OAuth2 } = (google.auth as unknown as { OAuth2: jest.Mock });
    expect(OAuth2).toHaveBeenCalledWith('cid', 'csec', 'http://127.0.0.1:53682/oauth-callback');
  });

  it('sets credentials with refresh_token', () => {
    const creds: OAuthCredentials = {
      client_id: 'cid',
      client_secret: 'csec',
      redirect_uri: 'http://127.0.0.1:53682/oauth-callback',
    };
    const mockSetCredentials = jest.fn();
    const { OAuth2 } = (google.auth as unknown as { OAuth2: jest.Mock });
    OAuth2.mockImplementationOnce(() => ({ setCredentials: mockSetCredentials }));

    createGmailClient(creds, 'refresh-token-xyz');

    expect(mockSetCredentials).toHaveBeenCalledWith({ refresh_token: 'refresh-token-xyz' });
  });

  it('calls google.gmail with version v1 and correct auth', () => {
    const creds: OAuthCredentials = {
      client_id: 'cid',
      client_secret: 'csec',
      redirect_uri: 'http://127.0.0.1:53682/oauth-callback',
    };
    const mockAuthClient = { setCredentials: jest.fn() };
    const { OAuth2 } = (google.auth as unknown as { OAuth2: jest.Mock });
    OAuth2.mockImplementationOnce(() => mockAuthClient);

    createGmailClient(creds, 'token');

    expect(google.gmail).toHaveBeenCalledWith({ version: 'v1', auth: mockAuthClient });
  });
});
