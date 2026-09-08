export function resolveRegionFlag(flag?: string | null): string {
  const value = flag?.trim().toLowerCase() ?? '';
  return /^[a-z]{2,3}$/.test(value) ? value : '';
}

/** Fallback when the platform list has no flag. Keys are platform / abbr codes. */
const DEFAULT_REGION_FLAGS: Record<string, string> = {
  na: 'us',
  sa: 'ar',
  eu: 'eu',
  asia: 'sg',
  aus: 'au',
  oce: 'au',
};

export function flagForRegion(
  code: string,
  regions: { code: string; flag: string | null }[] = [],
): string {
  const normalized = code.trim().toLowerCase();
  const match = regions.find((r) => r.code.toLowerCase() === normalized);
  return resolveRegionFlag(match?.flag) || resolveRegionFlag(DEFAULT_REGION_FLAGS[normalized]);
}
