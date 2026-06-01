import { sanitizeEmailBody } from '@/lib/utils';

describe('sanitizeEmailBody — plus-separator stripping', () => {
  it('removes a line of 3 pluses', () => {
    expect(sanitizeEmailBody('before\n+++\nafter')).not.toContain('+++');
  });

  it('removes a line of 8 pluses', () => {
    expect(sanitizeEmailBody('before\n++++++++\nafter')).not.toContain('++++++++');
  });

  it('removes a separator line with surrounding spaces/tabs', () => {
    const result = sanitizeEmailBody('before\n   +++   \nafter');
    expect(result).not.toMatch(/\+\+\+/);
  });

  it('preserves inline "C++" — not a separator line', () => {
    expect(sanitizeEmailBody('compiled with C++ compiler')).toContain('C++');
  });

  it('preserves inline "a+b" — not a separator line', () => {
    expect(sanitizeEmailBody('formula: a+b=c')).toContain('a+b');
  });

  it('preserves "++" — below threshold of 3', () => {
    expect(sanitizeEmailBody('only two: ++\nnext line')).toContain('++');
  });

  it('preserves "do not recirculate"', () => {
    expect(sanitizeEmailBody('do not recirculate\n+++\nbye')).toContain('do not recirculate');
  });

  it('strips separator then collapses resulting blank lines', () => {
    const input = 'hello\n\n+++\n\nworld';
    const result = sanitizeEmailBody(input);
    expect(result).not.toMatch(/\+\+\+/);
    // collapsed to max one blank line
    expect(result).not.toMatch(/\n{3,}/);
  });

  it('preserves existing file:// rule — still stripped', () => {
    expect(sanitizeEmailBody('<file:///tmp/foo.txt>')).not.toContain('file://');
  });

  it('preserves existing antivirus-footer rule', () => {
    const footer = 'Checked by AVG antivirus software';
    expect(sanitizeEmailBody(footer)).not.toContain('AVG');
  });

  it('preserves existing mailto rule', () => {
    const result = sanitizeEmailBody('<mailto:user@example.com>');
    expect(result).toContain('user@example.com');
    expect(result).not.toContain('mailto:');
  });
});
