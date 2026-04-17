export function formatPortName(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed === "") return "";
  return trimmed
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
