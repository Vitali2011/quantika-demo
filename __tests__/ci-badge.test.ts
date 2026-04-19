import * as fs from 'fs';
import * as path from 'path';

const README_PATH = path.join(process.cwd(), 'README.md');
const BADGE_SVG_URL =
  'https://github.com/Vitali2011/quantika-demo/actions/workflows/ci.yml/badge.svg';
const BADGE_LINK_URL =
  'https://github.com/Vitali2011/quantika-demo/actions/workflows/ci.yml';

describe('CI badge in README.md', () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(README_PATH, 'utf-8');
  });

  it('contains CI badge SVG URL', () => {
    expect(content).toMatch(BADGE_SVG_URL);
  });

  it('contains exactly one badge.svg line', () => {
    const lines = content.split('\n');
    const badgeLines = lines.filter((line) => line.includes('badge.svg'));
    expect(badgeLines).toHaveLength(1);
  });

  it('badge links to CI workflow', () => {
    const badgeLine = content
      .split('\n')
      .find((line) => line.includes('badge.svg'));
    expect(badgeLine).toBeDefined();
    expect(badgeLine).toMatch(BADGE_LINK_URL);
  });
});
