const DRAFT_KEYS = ['regionId', 'divisionId', 'name', 'acronym', 'teamId'] as const;

/**
 * Copy safe signup fields onto the post-login return URL.
 * Join password and avatar stay off the query string.
 */
export function signupLoginPath(pathname: string, formData: FormData): string {
  const params = new URLSearchParams();
  for (const key of DRAFT_KEYS) {
    const value = formData.get(key);
    if (typeof value === 'string' && value.length > 0) {
      params.set(key, value);
    }
  }
  const dest = params.size > 0 ? `${pathname}?${params}` : pathname;
  return `/auth/login?redirect=${encodeURIComponent(dest)}`;
}

export function parseSignupDraft(searchParams: URLSearchParams): {
  regionId: number | null;
  divisionId: string;
  name: string;
  acronym: string;
  teamId: number | null;
} {
  const regionRaw = searchParams.get('regionId');
  const regionParsed = regionRaw ? Number.parseInt(regionRaw, 10) : Number.NaN;
  const teamRaw = searchParams.get('teamId');
  const teamParsed = teamRaw ? Number.parseInt(teamRaw, 10) : Number.NaN;

  return {
    regionId: Number.isInteger(regionParsed) && regionParsed > 0 ? regionParsed : null,
    divisionId: searchParams.get('divisionId') ?? '',
    name: searchParams.get('name') ?? '',
    acronym: searchParams.get('acronym') ?? '',
    teamId: Number.isInteger(teamParsed) && teamParsed > 0 ? teamParsed : null,
  };
}
