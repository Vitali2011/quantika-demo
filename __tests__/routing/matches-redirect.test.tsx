describe('/matches redirect (γ-cleanup-4 F3)', () => {
  it('app/matches/page.tsx exists and uses next/navigation redirect', () => {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '../../app/matches/page.tsx');
    expect(fs.existsSync(filePath)).toBe(true);
    const src = fs.readFileSync(filePath, 'utf8');
    expect(src).toMatch(/from\s+['"]next\/navigation['"]/);
    expect(src).toMatch(/redirect\s*\(\s*['"]\/dashboard['"]\s*\)/);
  });
});
