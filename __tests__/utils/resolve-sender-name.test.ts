import { resolveSenderName } from '@/lib/utils/resolve-sender-name';

describe('resolveSenderName', () => {
  it('returns Sir/Madam when fromName is a CONTACT N alias', () => {
    expect(resolveSenderName({ fromName: 'CONTACT 1', from: 'contact1@demo.local' })).toBe('Sir/Madam');
    expect(resolveSenderName({ fromName: 'CONTACT  12', from: 'contact12@demo.local' })).toBe('Sir/Madam');
    expect(resolveSenderName({ fromName: 'contact 3', from: 'contact3@demo.local' })).toBe('Sir/Madam');
  });

  it('returns Sir/Madam when only the email matches contactN (no fromName)', () => {
    expect(resolveSenderName({ fromName: null, from: 'contact2@demo.local' })).toBe('Sir/Madam');
    expect(resolveSenderName({ fromName: '', from: 'CONTACT4@demo.local' })).toBe('Sir/Madam');
  });

  it('passes through a real sender name', () => {
    expect(resolveSenderName({ fromName: 'Alice Cooper', from: 'alice@acme.com' })).toBe('Alice Cooper');
  });

  it('extracts name from "Name <email>" when fromName is absent', () => {
    expect(resolveSenderName({ fromName: null, from: 'Bob Marley <bob@island.com>' })).toBe('Bob Marley');
  });

  it('returns Sir/Madam when only an email address is available', () => {
    expect(resolveSenderName({ fromName: null, from: 'someone@real.example' })).toBe('Sir/Madam');
  });

  it('returns Sir/Madam for empty input', () => {
    expect(resolveSenderName({ fromName: null, from: '' })).toBe('Sir/Madam');
    expect(resolveSenderName({ fromName: undefined, from: undefined })).toBe('Sir/Madam');
  });
});
