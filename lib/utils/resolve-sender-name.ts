type SenderFields = {
  fromName?: string | null;
  from?: string | null;
};

const CONTACT_TOKEN = /^contact\s*\d+$/i;

export function resolveSenderName(email: SenderFields): string {
  const fromName = (email.fromName ?? '').trim();
  if (fromName && !fromName.includes('@') && !CONTACT_TOKEN.test(fromName)) {
    return fromName;
  }

  const fromRaw = (email.from ?? '').trim();
  if (!fromRaw) return 'Sir/Madam';

  const angled = fromRaw.match(/^([^<]+)</)?.[1]?.trim();
  if (angled && !CONTACT_TOKEN.test(angled)) {
    return angled;
  }

  const local = fromRaw.includes('@') ? fromRaw.split('@')[0].trim() : '';
  if (local && !CONTACT_TOKEN.test(local)) {
    return 'Sir/Madam';
  }

  return 'Sir/Madam';
}
