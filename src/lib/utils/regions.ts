export function resolveRegionFlag(flag?: string | null): string {
  const value = flag?.trim().toLowerCase() ?? '';
  return /^[a-z]{2,3}$/.test(value) ? value : '';
}

export function flagForRegion(
  code: string,
  regions: { code: string; flag: string | null }[],
): string {
  const match = regions.find((r) => r.code.toLowerCase() === code.trim().toLowerCase());
  return resolveRegionFlag(match?.flag);
}
