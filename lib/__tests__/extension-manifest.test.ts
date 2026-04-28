import * as fs from 'fs';
import * as path from 'path';

describe('Gmail extension manifest', () => {
  const manifestPath = path.join(__dirname, '../../extensions/gmail/manifest.json');
  let manifest: any;
  beforeAll(() => { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); });
  it('is Manifest v3', () => expect(manifest.manifest_version).toBe(3));
  it('has correct host permissions for Gmail', () => expect(manifest.host_permissions).toContain('https://mail.google.com/*'));
  it('has version', () => expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/));
  it('declares background service worker', () => expect(manifest.background.service_worker).toBe('background.js'));
  it('declares content script for Gmail', () => {
    expect(manifest.content_scripts[0].matches).toContain('https://mail.google.com/*');
    expect(manifest.content_scripts[0].js).toContain('content.js');
  });
});
