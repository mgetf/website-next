// Cleans up MGE arena display names.
// Strips bracket-suffixed metadata like "[AC]" / "[1v1 MGE]" and the trailing
// variant number on names such as "Badlands Middle 4" → "Badlands Middle".

export function cleanArenaName(arena: string | null | undefined): string | null {
  if (!arena) return null;
  const cleaned = arena
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s+\d+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}
