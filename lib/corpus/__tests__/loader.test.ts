import path from 'path';

import { clearCorpusCache, CorpusNotFoundError, loadCorpus } from '@/lib/corpus/loader';

jest.mock('fs/promises');
import { readFile } from 'fs/promises';
const mockReadFile = readFile as jest.Mock;

const CORPUS_PATH = path.join(process.cwd(), '.private', 'etms-corpus.json');

const VALID_EMAILS = [
  {
    id: 'email-1',
    threadId: 'thread-1',
    from: 'sender@example.com',
    fromName: 'Sender',
    fromEmail: 'sender@example.com',
    to: 'recipient@example.com',
    subject: 'Test',
    date: '2026-01-01T00:00:00Z',
    body: 'Email body text',
    snippet: 'Email body',
    labelIds: [],
  },
];

describe('loadCorpus', () => {
  beforeEach(() => {
    clearCorpusCache();
    jest.clearAllMocks();
  });

  it('returns parsed Email[] on success', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(VALID_EMAILS));
    const result = await loadCorpus();
    expect(result).toEqual(VALID_EMAILS);
    expect(mockReadFile).toHaveBeenCalledWith(CORPUS_PATH, 'utf-8');
  });

  it('throws CorpusNotFoundError on ENOENT', async () => {
    const err = Object.assign(new Error('File not found'), { code: 'ENOENT' });
    mockReadFile.mockRejectedValue(err);
    await expect(loadCorpus()).rejects.toBeInstanceOf(CorpusNotFoundError);
  });

  it('throws generic error on malformed JSON', async () => {
    mockReadFile.mockResolvedValue('not valid json{{{');
    await expect(loadCorpus()).rejects.toThrow(/parse failed/);
  });

  it('throws validation error when result is not an array', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ id: 'x', body: 'y' }));
    await expect(loadCorpus()).rejects.toThrow(/validation failed/);
  });

  it('throws validation error when items missing id or body', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify([{ id: 'x' }]));
    await expect(loadCorpus()).rejects.toThrow(/validation failed/);
  });

  it('caches result — readFile called only once on multiple loads', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(VALID_EMAILS));
    const first = await loadCorpus();
    const second = await loadCorpus();
    expect(mockReadFile).toHaveBeenCalledTimes(1);
    expect(first).toBe(second); // same reference
  });

  it('clearCorpusCache resets cache — readFile called again', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(VALID_EMAILS));
    await loadCorpus();
    clearCorpusCache();
    await loadCorpus();
    expect(mockReadFile).toHaveBeenCalledTimes(2);
  });
});
