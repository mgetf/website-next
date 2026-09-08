const REGION_RULES: { match: RegExp; abbr: string }[] = [
  { match: /north\s*america|\bna\b|^us$/i, abbr: 'NA' },
  { match: /south\s*america|\bsa\b|^ar$/i, abbr: 'SA' },
  { match: /europe|\beu\b/i, abbr: 'EU' },
  { match: /australia|oceania|\baus\b|\boce\b/i, abbr: 'AUS' },
  { match: /asia|\bsea\b/i, abbr: 'ASIA' },
];

const REGION_SORT_ORDER = ['NA', 'SA', 'EU', 'ASIA', 'AUS'];

/**
 * Short label for a region name (NA, EU, ASIA, …).
 * Flags are `flagForRegion(abbr)` in `$lib/utils/regions`.
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
