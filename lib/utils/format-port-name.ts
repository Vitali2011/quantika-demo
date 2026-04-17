export function formatPortName(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed === "") return "";
  return trimmed
    .split(" ")
    .map((word) =>
      word.replace(/([^a-zA-Z]*)([a-zA-Z])(.*)/g, (_, pre, first, rest) =>
        pre + first.toUpperCase() + rest.toLowerCase(),
      ),
    )
    .join(" ");
}
