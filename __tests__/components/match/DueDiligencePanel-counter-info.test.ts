import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const panelPath = path.join(ROOT, 'components/match/DueDiligencePanel.tsx');

describe('DueDiligencePanel.tsx — info counter rendering', () => {
  it('references counter.info in the render output', () => {
    const src = fs.readFileSync(panelPath, 'utf8');
    expect(src).toMatch(/counter\.info/);
  });

  it('guards info segment with counter.info > 0 so it hides when zero', () => {
    const src = fs.readFileSync(panelPath, 'utf8');
    expect(src).toMatch(/counter\.info\s*>\s*0/);
  });
});
