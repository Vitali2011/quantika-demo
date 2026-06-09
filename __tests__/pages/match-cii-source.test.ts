import { lookupCii } from '@/lib/imo/cii-lookup';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

it('lookupCii with stub LLM returns llm-fallback for an IMO absent from the dataset', async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cii-w10-'));
  const res = await lookupCii('0000001', { callLlm: async () => 'unknown', cacheDir });
  expect(res.source).toBe('llm-fallback');
});

it('lookupCii returns imo-public for an IMO present in the static dataset', async () => {
  const ds = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/sample-data/imo/cii.json'), 'utf-8'));
  const knownImo = ds.records[0].imo;
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cii-w10-'));
  const res = await lookupCii(knownImo, { callLlm: async () => 'unknown', cacheDir });
  expect(res.source).toBe('imo-public');
});
