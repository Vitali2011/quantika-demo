describe('/matches Coming Soon page (γ-cleanup-4 F3)', () => {
  it('app/matches/page.tsx exists as a Coming Soon server component', () => {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '../../app/matches/page.tsx');
    expect(fs.existsSync(filePath)).toBe(true);
    const src = fs.readFileSync(filePath, 'utf8');
    expect(src).toMatch(/export\s+default\s+function/);
    expect(src).toMatch(/[Cc]oming\s+[Ss]oon/);
    expect(src).toMatch(/href=['"]\/dashboard['"]/);
    expect(src).not.toMatch(/from\s+['"]next\/navigation['"]/);
    expect(src).not.toMatch(/redirect\s*\(/);
  });
});
