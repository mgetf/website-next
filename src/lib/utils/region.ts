const REGION_RULES: { match: RegExp; abbr: string; flag: string }[] = [
  { match: /north\s*america|\bna\b|^us$/i, abbr: 'NA', flag: 'us' },
  { match: /south\s*america|\bsa\b|^br$/i, abbr: 'SA', flag: 'br' },
  { match: /europe|\beu\b/i, abbr: 'EU', flag: 'eu' },
  { match: /australia|oceania|\baus\b|\boce\b/i, abbr: 'AUS', flag: 'au' },
  { match: /asia|\bsea\b/i, abbr: 'ASIA', flag: 'sg' },
];

const REGION_SORT_ORDER = ['NA', 'SA', 'EU', 'ASIA', 'AUS'];

/**
 * Short label for a region name (NA, EU, ASIA, …).
 */
export function getRegionAbbr(name: string): string {
  const rule = REGION_RULES.find((r) => r.match.test(name));
  if (rule) return rule.abbr;

  const trimmed = name.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 5) return trimmed.toUpperCase();

  const firstWord = trimmed.split(/\s+/)[0] ?? trimmed;
  if (firstWord.length <= 5) return firstWord.toUpperCase();
  return firstWord.slice(0, 3).toUpperCase();
}

/**
 * flag-icons country/region code for a region name.
 * Returns an empty string when no mapping is known.
 */
export function getRegionFlagCode(name: string): string {
  const rule = REGION_RULES.find((r) => r.match.test(name));
  if (rule) return rule.flag;

  const trimmed = name.trim();
  if (/^[a-z]{2}$/i.test(trimmed)) return trimmed.toLowerCase();
  return '';
}

/**
 * Sort regions in the conventional league order: NA, SA, EU, ASIA, AUS, then others.
 */
export function sortRegionsByAbbr<T extends { abbr: string }>(regions: T[]): T[] {
  return [...regions].sort((a, b) => {
    const ai = REGION_SORT_ORDER.indexOf(a.abbr);
    const bi = REGION_SORT_ORDER.indexOf(b.abbr);
    if (ai === -1 && bi === -1) return a.abbr.localeCompare(b.abbr);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}
